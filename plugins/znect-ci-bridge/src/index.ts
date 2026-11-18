import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { DASHBOARD_HTML } from "./ui";
import { BuildEventStore, normalizeCircleCiWebhook, verifyCircleCiSignature } from "./events";
import { describeProjectStatus, findCircleCiProject, findProject, loadProjectRegistry, selectProjectConnection } from "./registry";
export { BuildEventStore };
import { circleGet } from "./circleci";
import { createCircleCiReadOnlyAdapter } from "./providers/circleci";
import { createZnectBuildReadOnlyAdapter } from "./providers/znect-build";
import { correlateEventsWithRuns } from "./correlation";
import {
  allowedArtifactUrl,
  fetchAllowedArtifact,
  limitText,
  readBoundedText,
  redactKnownSecrets,
  safeEqual,
  stringifyBoundedJson
} from "./security";

interface Env {
  CIRCLECI_TOKEN: string;
  MCP_ACCESS_TOKEN: string;
  WEB_ACCESS_TOKEN: string;
  CIRCLECI_WEBHOOK_SECRET: string;
  ZNECT_BUILD_GITHUB_TOKEN?: string;
  ZNECT_PROJECT_REGISTRY?: string;
  EVENT_STORE: DurableObjectNamespace;
  MCP_RATE_LIMITER: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}

function getProjectRegistry(env: Env) {
  return loadProjectRegistry(env.ZNECT_PROJECT_REGISTRY);
}

function getCircleCiConnection(env: Env, projectId: string, connectionId?: string) {
  const project = findProject(getProjectRegistry(env), projectId);
  if (!project) throw new Error(`Unknown Znect project: ${projectId}.`);
  const connection = selectProjectConnection(project, "circleci", connectionId);
  return { project, connection };
}

function getCircleCiAdapter(env: Env, projectId: string, connectionId?: string) {
  const { project, connection } = getCircleCiConnection(env, projectId, connectionId);
  return {
    project,
    connection,
    scope: { projectId: project.id, connectionId: connection.id },
    adapter: createCircleCiReadOnlyAdapter(env.CIRCLECI_TOKEN, connection.projectSlug!, project.id, connection.id)
  };
}

function getZnectBuildAdapter(env: Env, projectId: string, connectionId?: string) {
  const project = findProject(getProjectRegistry(env), projectId);
  if (!project) throw new Error(`Unknown Znect project: ${projectId}.`);
  const connection = selectProjectConnection(project, "znect-build", connectionId);
  if (project.repositories.length !== 1) {
    throw new Error("Znect Build connection requires exactly one registered source repository for ownership verification.");
  }
  return {
    project,
    connection,
    scope: { projectId: project.id, connectionId: connection.id },
    adapter: createZnectBuildReadOnlyAdapter(
      env.ZNECT_BUILD_GITHUB_TOKEN ?? "",
      project.id,
      connection.id,
      project.repositories[0].fullName
    )
  };
}

function circleCiV1ProjectPath(projectSlug: string): string {
  const match = /^(?:gh|github)\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(projectSlug);
  if (!match) throw new Error("Invalid registered CircleCI project slug.");
  return `/project/github/${match[1]}/${match[2]}`;
}
const MAX_LOG_CHARS = 80_000;
const MAX_LOG_BYTES = MAX_LOG_CHARS * 4;
const MAX_TOTAL_LOG_CHARS = 160_000;
const MAX_WEBHOOK_BODY_BYTES = 65_536;

/** Read an incoming request body incrementally and stop as soon as its byte budget is exceeded. */
async function readBoundedRequestBody(request: Request, maxBytes: number): Promise<ArrayBuffer | null> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new Error("maxBytes must be a non-negative safe integer.");
  }
  if (!request.body) return new ArrayBuffer(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > maxBytes - total) {
        try {
          await reader.cancel();
        } catch {
          // The request is already being rejected; cancellation failure is non-fatal.
        }
        return null;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer"
    }
  });
}

function boundedJson(serialized: string, maxChars: number): Response {
  if (serialized.length > maxChars) {
    return json({ error: "The requested result exceeds the API response size limit." }, 413);
  }
  return new Response(serialized, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer"
    }
  });
}

const MAX_EVENT_PAGE_BYTES = 60_000;
const EVENT_PAGE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_PAGE_FIELDS = new Set([
  "cursor", "id", "type", "happened_at", "project_slug", "pipeline_id", "pipeline_number",
  "branch", "revision", "commit_subject", "workflow_id", "workflow_name",
  "workflow_status", "workflow_url", "job_id", "job_name", "job_status", "job_number"
]);
const EVENT_PAGE_STRING_LIMITS: Record<string, number> = {
  project_slug: 256, pipeline_id: 64, branch: 256, revision: 128, commit_subject: 512,
  workflow_id: 64, workflow_name: 256, workflow_status: 64, workflow_url: 2048,
  job_id: 64, job_name: 256, job_status: 64
};

async function readEventPage(
  response: Response,
  limit: number,
  after: number,
  acceptedProjectSlugs: ReadonlySet<string>
): Promise<Record<string, unknown>> {
  if (!response.ok) throw new Error("Event storage is unavailable.");
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > MAX_EVENT_PAGE_BYTES) {
    try { await response.body?.cancel(); } catch { /* response is rejected */ }
    throw new Error("Event storage returned an oversized response.");
  }
  if (!response.body) throw new Error("Event storage returned an empty response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > MAX_EVENT_PAGE_BYTES - total) {
        try { await reader.cancel(); } catch { /* response is rejected */ }
        throw new Error("Event storage returned an oversized response.");
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error("Event storage returned invalid JSON."); }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Event storage returned an invalid event page.");
  }
  const page = parsed as Record<string, unknown>;
  if (!Array.isArray(page.events) || page.events.length > limit ||
      !Number.isSafeInteger(page.next_cursor) || (page.next_cursor as number) < 0 ||
      (page.events.length === 0 && page.next_cursor !== after)) {
    throw new Error("Event storage returned an invalid event page.");
  }

  const cursors = new Set<number>();
  const parsedCursors: number[] = [];
  for (const item of page.events) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Event storage returned an invalid event page.");
    }
    const event = item as Record<string, unknown>;
    if (Object.keys(event).some((key) => !EVENT_PAGE_FIELDS.has(key)) ||
        !Number.isSafeInteger(event.cursor) || (event.cursor as number) < 1 ||
        (event.cursor as number) > (page.next_cursor as number) ||
        typeof event.id !== "string" || !EVENT_PAGE_ID_RE.test(event.id) ||
        (event.type !== "workflow-completed" && event.type !== "job-completed") ||
        typeof event.project_slug !== "string" || event.project_slug.length > 256 ||
        !acceptedProjectSlugs.has(event.project_slug) ||
        typeof event.happened_at !== "string" || !Number.isFinite(Date.parse(event.happened_at)) ||
        new Date(event.happened_at).toISOString() !== event.happened_at) {
      throw new Error("Event storage returned an invalid event page.");
    }
    for (const [key, max] of Object.entries(EVENT_PAGE_STRING_LIMITS)) {
      const field = event[key];
      if (field !== undefined && (typeof field !== "string" || field.length === 0 ||
          field.length > max || /[\u0000-\u001f\u007f]/.test(field))) {
        throw new Error("Event storage returned an invalid event page.");
      }
    }
    if (event.workflow_url !== undefined) {
      let workflowUrl: URL;
      try { workflowUrl = new URL(String(event.workflow_url)); }
      catch { throw new Error("Event storage returned an invalid event page."); }
      if (workflowUrl.protocol !== "https:" || workflowUrl.hostname !== "app.circleci.com" ||
          (workflowUrl.port !== "" && workflowUrl.port !== "443") ||
          workflowUrl.username || workflowUrl.password || workflowUrl.toString() !== event.workflow_url) {
        throw new Error("Event storage returned an invalid event page.");
      }
    }
    for (const key of ["pipeline_number", "job_number"]) {
      const field = event[key];
      if (field !== undefined && (typeof field !== "number" || !Number.isSafeInteger(field) || field < 0)) {
        throw new Error("Event storage returned an invalid event page.");
      }
    }
    const cursor = event.cursor as number;
    if (cursors.has(cursor)) throw new Error("Event storage returned duplicate cursors.");
    cursors.add(cursor);
    parsedCursors.push(cursor);
  }

  if (parsedCursors.length > 0) {
    const expectedCursor = Math.max(...parsedCursors);
    if (page.next_cursor !== expectedCursor) throw new Error("Event storage cursor does not match its page.");
    for (let index = 1; index < parsedCursors.length; index++) {
      const previous = parsedCursors[index - 1];
      const current = parsedCursors[index];
      if (after === 0 ? current >= previous : current <= previous) {
        throw new Error("Event storage returned cursors in an invalid order.");
      }
    }
  }
  return page;
}

async function rateLimitFailedAuthentication(request: Request, env: Env): Promise<Response | null> {
  if (!env.MCP_RATE_LIMITER) return json({ error: "Rate limiting is not configured." }, 503);
  // Cloudflare overwrites CF-Connecting-IP at the edge. Hash the address before
  // using it as a limiter key so the raw client address is never stored as a key.
  const clientIp = request.headers.get("cf-connecting-ip") ?? "unknown";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("failed-auth:" + clientIp)
  );
  const key = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  try {
    const result = await env.MCP_RATE_LIMITER.limit({ key });
    if (!result.success) return json({ error: "Too many failed authentication attempts. Retry after the current window." }, 429);
  } catch {
    return json({ error: "Rate limiting is temporarily unavailable." }, 503);
  }
  return null;
}

function buildNumber(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("build_num must be a positive integer.");
  return value;
}

function redactedBoundedJson(value: unknown, env: Env, maxChars: number): string {
  const redacted = redactKnownSecrets(JSON.stringify(value), env);
  return stringifyBoundedJson(JSON.parse(redacted), maxChars);
}


function createServer(env: Env) {
  const server = new McpServer({ name: "znect-ci-bridge", version: "0.1.0" });

  server.registerTool(
    "list_recent_builds",
    {
      description: "Read the latest CircleCI v1.1 job runs for one registered Znect project. Read-only; returns branch, status, build number, commit and build URL. Limit 1–30.",
      annotations: { readOnlyHint: true },
      inputSchema: { project_id: z.string().min(2).max(63), connection_id: z.string().min(2).max(63).optional(), limit: z.number().int().min(1).max(30).default(10) }
    },
    async ({ project_id, connection_id, limit }) => {
      const { connection } = getCircleCiConnection(env, project_id, connection_id);
      const projectPath = circleCiV1ProjectPath(connection.projectSlug!);
      const builds = await circleGet<unknown[]>(env.CIRCLECI_TOKEN, `${projectPath}?limit=${limit}`);
      const result = builds.slice(0, limit).map((item: any) => ({
        build_num: item.build_num,
        status: item.status,
        branch: item.branch,
        subject: item.subject,
        vcs_revision: item.vcs_revision,
        start_time: item.start_time,
        stop_time: item.stop_time,
        build_url: item.build_url,
        failed: item.failed
      }));
      return { content: [{ type: "text", text: redactedBoundedJson({ builds: result }, env, 100_000) }] };
    }
  );

  server.registerTool(
    "get_build_details",
    {
      description: "Read detailed metadata and step/action statuses for one build in a selected registered Znect project. Does not retrieve console output.",
      annotations: { readOnlyHint: true },
      inputSchema: { project_id: z.string().min(2).max(63), connection_id: z.string().min(2).max(63).optional(), build_num: z.number().int().min(1) }
    },
    async ({ project_id, connection_id, build_num }) => {
      const { connection } = getCircleCiConnection(env, project_id, connection_id);
      const projectPath = circleCiV1ProjectPath(connection.projectSlug!);
      const build = await circleGet<any>(env.CIRCLECI_TOKEN, `${projectPath}/${buildNumber(build_num)}`);
      const steps = (build.steps ?? []).map((step: any, index: number) => ({
        step_index: index,
        name: step.name,
        actions: (step.actions ?? []).map((action: any) => ({
          name: action.name,
          status: action.status,
          exit_code: action.exit_code,
          start_time: action.start_time,
          end_time: action.end_time,
          run_time_millis: action.run_time_millis,
          has_output: action.has_output === true
        }))
      }));
      const result = {
        build_num: build.build_num,
        status: build.status,
        branch: build.branch,
        subject: build.subject,
        vcs_revision: build.vcs_revision,
        build_url: build.build_url,
        start_time: build.start_time,
        stop_time: build.stop_time,
        failed: build.failed,
        steps
      };
      return { content: [{ type: "text", text: redactedBoundedJson(result, env, 100_000) }] };
    }
  );

  server.registerTool(
    "get_build_logs",
    {
      description: "Read console output for a CircleCI build step/action. Fetches the presigned output URL returned by CircleCI; never accepts arbitrary URLs. Output is bounded to 80,000 characters per action and 160,000 characters total per response; at most 10 actions are fetched to remain within Worker subrequest limits.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        project_id: z.string().min(2).max(63), connection_id: z.string().min(2).max(63).optional(),
        build_num: z.number().int().min(1),
        step_index: z.number().int().min(0).optional(),
        max_actions: z.number().int().min(1).max(10).default(10)
      }
    },
    async ({ project_id, connection_id, build_num, step_index, max_actions }) => {
      const { connection } = getCircleCiConnection(env, project_id, connection_id);
      const projectPath = circleCiV1ProjectPath(connection.projectSlug!);
      const build = await circleGet<any>(env.CIRCLECI_TOKEN, `${projectPath}/${buildNumber(build_num)}`);
      const selected = (build.steps ?? [])
        .map((step: any, index: number) => ({ step, index }))
        .filter(({ index }: { index: number }) => step_index === undefined || index === step_index);
      if (step_index !== undefined && selected.length === 0) {
        return { isError: true, content: [{ type: "text", text: `Step index ${step_index} does not exist in build ${build_num}.` }] };
      }

      const actions: Array<{ step_index: number; step_name: string; action_name: string; status?: string; output: string }> = [];
      let totalOutputChars = 0;
      for (const { step, index } of selected) {
        if (totalOutputChars >= MAX_TOTAL_LOG_CHARS) break;
        for (const action of (step.actions ?? [])) {
          if (actions.length >= max_actions || totalOutputChars >= MAX_TOTAL_LOG_CHARS) break;
          if (action.has_output !== true || typeof action.output_url !== "string") continue;
          const outputUrl = allowedArtifactUrl(action.output_url);
          if (!outputUrl) continue;

          const logResponse = await fetchAllowedArtifact(outputUrl);
          if (!logResponse.ok) {
            const failureText = `[Log retrieval failed: HTTP ${logResponse.status}]`;
            const failureBudget = MAX_TOTAL_LOG_CHARS - totalOutputChars;
            const failure = limitText(failureText, failureBudget).text;
            if (failure.length > 0) {
              actions.push({ step_index: index, step_name: step.name ?? "", action_name: action.name ?? "", status: action.status, output: failure });
              totalOutputChars += failure.length;
            }
            continue;
          }

          const remainingChars = MAX_TOTAL_LOG_CHARS - totalOutputChars;
          const byteBudget = Math.min(MAX_LOG_BYTES, remainingChars * 4);
          const bounded = await readBoundedText(logResponse, byteBudget);
          const raw = bounded.text;
          let output = raw;
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) output = parsed.map((entry: any) => entry?.message ?? JSON.stringify(entry)).join("\n");
          } catch { /* Some CircleCI output URLs return plain text. */ }

          output = redactKnownSecrets(output, env);
          const actionBudget = Math.min(MAX_LOG_CHARS, remainingChars);
          const limited = limitText(output, actionBudget, bounded.truncated);
          output = limited.text;
          actions.push({ step_index: index, step_name: step.name ?? "", action_name: action.name ?? "", status: action.status, output });
          totalOutputChars += output.length;
        }
        if (actions.length >= max_actions || totalOutputChars >= MAX_TOTAL_LOG_CHARS) break;
      }
      return { content: [{ type: "text", text: redactedBoundedJson({ build_num, actions }, env, 180_000) }] };
    }
  );

  // CircleCI API v3 tools are exposed alongside the legacy v1.1 tools.
  // They use UUIDs and never infer a v3 run ID from a legacy build number.
  // Project-scoped live connectivity check for a registered CircleCI project.
  // Read-only: this tool never starts or changes a pipeline.
  server.registerTool(
    "list_projects",
    {
      description: "List registered Znect projects and their configured CI connections. Registration, CI configuration, and live provider availability are reported separately. Read-only.",
      annotations: { readOnlyHint: true },
      inputSchema: {}
    },
    async () => {
      const projects = getProjectRegistry(env).projects.map(describeProjectStatus);
      return { content: [{ type: "text", text: stringifyBoundedJson({ projects }, 20_000) }] };
    }
  );

  server.registerTool(
    "check_connection",
    {
      description: "Verify MCP-to-CircleCI authentication and read access to one registered Znect project. Returns connection status and project identity only. Read-only.",
      annotations: { readOnlyHint: true },
      inputSchema: { project_id: z.string().min(2).max(63), connection_id: z.string().min(2).max(63).optional() }
    },
    async ({ project_id, connection_id }) => {
      const { project: registryProject, connection, scope, adapter } = getCircleCiAdapter(env, project_id, connection_id);
      try {
        const recentRuns = await adapter.listRuns(scope, 1);
        return { content: [{ type: "text", text: JSON.stringify({
          connected: true,
          provider: adapter.provider,
          project: { id: registryProject.id, name: registryProject.name, status: "registered" },
          connection: { id: connection.id, status: "configured" },
          provider_availability: "available",
          permissions: "read-only",
          read_probe: { recent_runs_available: recentRuns.length }
        }, null, 2) }] };
      } catch {
        return { content: [{ type: "text", text: JSON.stringify({
          connected: false,
          provider: adapter.provider,
          project: { id: registryProject.id, name: registryProject.name, status: "registered" },
          connection: { id: connection.id, status: "configured" },
          provider_availability: "unavailable",
          error: "Provider read probe failed; check provider credentials and connectivity."
        }, null, 2) }] };
      }
    }
  );
  server.registerTool(
    "list_recent_runs",
    {
      description: "Read the latest CircleCI API v3 runs for one registered Znect project. Returns UUID run IDs and current outcomes. Read-only; limit 1–30.",
      annotations: { readOnlyHint: true },
      inputSchema: { project_id: z.string().min(2).max(63), connection_id: z.string().min(2).max(63).optional(), limit: z.number().int().min(1).max(30).default(10) }
    },
    async ({ project_id, connection_id, limit }) => {
      const { project: registryProject, connection, scope, adapter } = getCircleCiAdapter(env, project_id, connection_id);
      const runs = await adapter.listRuns(scope, limit);
      const payload = JSON.stringify({
        project: { id: registryProject.id, name: registryProject.name, provider: "circleci", slug: connection.projectSlug },
        runs
      }, null, 2);
      const safe = redactKnownSecrets(payload, env);
      return { content: [{ type: "text", text: stringifyBoundedJson(JSON.parse(safe), 100_000) }] };
    }
  );

  server.registerTool(
    "get_run_details",
    {
      description: "Read one CircleCI API v3 run by UUID for a selected registered project, including its workflows and jobs. Read-only; use a run UUID returned by list_recent_runs for the same project.",
      annotations: { readOnlyHint: true },
      inputSchema: { project_id: z.string().min(2).max(63), connection_id: z.string().min(2).max(63).optional(), run_id: z.string().uuid() }
    },
    async ({ project_id, connection_id, run_id }) => {
      const { project: registryProject, scope, adapter } = getCircleCiAdapter(env, project_id, connection_id);
      const run = await adapter.getRun(scope, run_id);
      const workflows = await adapter.listWorkflows(scope, run_id);
      const workflowResults = await Promise.all(workflows.slice(0, 10).map(async (workflow) => ({
        workflow,
        jobs: (await adapter.listJobs(scope, run_id, workflow.id)).slice(0, 40)
      })));
      const payload = JSON.stringify({
        project: { id: registryProject.id, name: registryProject.name, provider: "circleci" },
        run,
        workflows: workflowResults,
        truncated: workflows.length > 10
      }, null, 2);
      const safe = redactKnownSecrets(payload, env);
      return { content: [{ type: "text", text: stringifyBoundedJson(JSON.parse(safe), 120_000) }] };
    }
  );

  server.registerTool(
    "get_job_details",
    {
      description: "Read a CircleCI API v3 job resource by UUID after verifying its project ownership. Read-only.",
      annotations: { readOnlyHint: true },
      inputSchema: { project_id: z.string().min(2).max(63), connection_id: z.string().min(2).max(63).optional(), job_id: z.string().uuid() }
    },
    async ({ project_id, connection_id, job_id }) => {
      const { scope, adapter } = getCircleCiAdapter(env, project_id, connection_id);
      const job = await adapter.getJob(scope, job_id);
      const payload = JSON.stringify({ job }, null, 2);
      const safe = redactKnownSecrets(payload, env);
      return { content: [{ type: "text", text: stringifyBoundedJson(JSON.parse(safe), 40_000) }] };
    }
  );

  server.registerTool(
    "get_job_logs",
    {
      description: "Read bounded stdout or stderr for a CircleCI API v3 job step. Requires a job UUID and step number. Read-only.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        project_id: z.string().min(2).max(63), connection_id: z.string().min(2).max(63).optional(),
        job_id: z.string().uuid(),
        step_num: z.number().int().min(0),
        execution: z.number().int().min(0).default(0),
        stream: z.enum(["stdout", "stderr"]).default("stdout"),
        max_chars: z.number().int().min(1).max(80_000).default(30_000)
      }
    },
    async ({ project_id, connection_id, job_id, step_num, execution, stream, max_chars }) => {
      const { scope, adapter } = getCircleCiAdapter(env, project_id, connection_id);
      const result = await adapter.getJobLogs(scope, job_id, {
        step: step_num, stream, execution, maxBytes: max_chars * 4
      });
      const redacted = redactKnownSecrets(result.text, env);
      const limited = limitText(redacted, max_chars, result.truncated);
      return {
        content: [{
          type: "text",
          text: stringifyBoundedJson({
            job_id,
            step_num,
            execution,
            stream,
            output: limited.text,
            truncated: limited.truncated
          }, 85_000)
        }]
      };
    }
  );


  server.registerTool(
    "get_job_test_results",
    {
      description: "Read structured CircleCI test results for a job as bounded JSON Lines. Read-only; requires a job UUID from get_run_details.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        project_id: z.string().min(2).max(63), connection_id: z.string().min(2).max(63).optional(),
        job_id: z.string().uuid(),
        max_chars: z.number().int().min(1).max(80_000).default(40_000)
      }
    },
    async ({ project_id, connection_id, job_id, max_chars }) => {
      const { scope, adapter } = getCircleCiAdapter(env, project_id, connection_id);
      const result = await adapter.getTestReport(scope, job_id, max_chars * 4);
      const redacted = redactKnownSecrets(result.content, env);
      const limited = limitText(redacted, max_chars, result.truncated);
      return {
        content: [{
          type: "text",
          text: stringifyBoundedJson({
            job_id,
            format: result.format,
            results: limited.text,
            truncated: limited.truncated
          }, 85_000)
        }]
      };
    }
  );

  server.registerTool(
    "list_job_artifacts",
    {
      description: "List metadata for artifacts uploaded by a CircleCI job. Presigned download URLs are deliberately not exposed. Read-only.",
      annotations: { readOnlyHint: true },
      inputSchema: { project_id: z.string().min(2).max(63), connection_id: z.string().min(2).max(63).optional(), job_id: z.string().uuid() }
    },
    async ({ project_id, connection_id, job_id }) => {
      const { scope, adapter } = getCircleCiAdapter(env, project_id, connection_id);
      const artifacts = await adapter.listArtifacts(scope, job_id);
      const safe = artifacts.map((artifact) => ({
        id: artifact.id,
        path: artifact.path,
        size: artifact.size
      }));
      const payload = redactKnownSecrets(JSON.stringify({ job_id, artifacts: safe }, null, 2), env);
      return { content: [{ type: "text", text: stringifyBoundedJson(JSON.parse(payload), 30_000) }] };
    }
  );


  server.registerTool(
    "get_job_artifact",
    {
      description: "Download one CircleCI job artifact by its exact path from list_job_artifacts. The URL is resolved internally, host-validated, and the text response is bounded. Read-only.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        project_id: z.string().min(2).max(63), connection_id: z.string().min(2).max(63).optional(),
        job_id: z.string().uuid(),
        artifact_path: z.string().min(1).max(512),
        max_chars: z.number().int().min(1).max(80_000).default(40_000)
      }
    },
    async ({ project_id, connection_id, job_id, artifact_path, max_chars }) => {
      const { scope, adapter } = getCircleCiAdapter(env, project_id, connection_id);
      const result = await adapter.getArtifact(scope, job_id, artifact_path, max_chars * 4);
      const redacted = redactKnownSecrets(result.content, env);
      const limited = limitText(redacted, max_chars, result.truncated);
      return {
        content: [{
          type: "text",
          text: stringifyBoundedJson({
            job_id,
            artifact_path: result.path,
            content: limited.text,
            truncated: limited.truncated
          }, 85_000)
        }]
      };
    }
  );



  server.registerTool(
    "diagnose_run",
    {
      description: "Automatically inspect one run through the selected read-only CI provider adapter. Verifies project, run, workflow and job ownership before reading logs, tests, or artifacts. Read-only; does not rerun or modify pipelines.",
      annotations: { readOnlyHint: true },
      inputSchema: { project_id: z.string().min(2).max(63), connection_id: z.string().min(2).max(63).optional(), run_id: z.string().uuid() }
    },
    async ({ project_id, connection_id, run_id }) => {
      const { project: registryProject, scope, adapter } = getCircleCiAdapter(env, project_id, connection_id);
      const run = await adapter.getRun(scope, run_id);
      const workflows = await adapter.listWorkflows(scope, run_id);
      const workflowReports: Array<Record<string, unknown>> = [];
      let failedJobsInspected = 0;
      let failedJobLimitReached = false;
      let jobLimitReached = false;
      let logActionsInspected = 0;
      let logActionLimitReached = false;
      let reportDataIncomplete = false;
      let reportArtifactLimitReached = false;
      const workflowsInspected = workflows.slice(0, 5);

      for (const workflow of workflowsInspected) {
        const jobs = await adapter.listJobs(scope, run_id, workflow.id);
        const inspectedJobs = jobs.slice(0, 40);
        const jobsTruncated = jobs.length > inspectedJobs.length;
        if (jobsTruncated) jobLimitReached = true;
        const failedJobs = inspectedJobs.filter((job) => job.status === "failed" || job.status === "failure");
        const diagnostics: Array<Record<string, unknown>> = [];

        for (const job of failedJobs) {
          if (failedJobsInspected >= 3) {
            failedJobLimitReached = true;
            break;
          }
          failedJobsInspected++;
          const details = await adapter.getJob(scope, job.id);
          if (details.workflowId !== workflow.id) {
            throw new Error("CI job does not belong to the selected run workflow.");
          }
          const failedSteps = (details.steps ?? [])
            .filter((step) => step.actions.some((action) =>
              (action.status === "failed" || action.outcome === "failed") && action.isInsignificant !== true
            ))
            .map((step) => ({
              name: step.name,
              execution_index: step.execution,
              actions: step.actions
                .filter((action) => (action.status === "failed" || action.outcome === "failed") && action.isInsignificant !== true)
                .map((action) => ({
                  name: action.name,
                  status: action.status,
                  exit_code: action.exitCode,
                  step_num: action.stepNumber
                }))
            }));

          const failedStepLogs: Array<Record<string, unknown>> = [];
          for (const step of failedSteps) {
            for (const action of step.actions) {
              if (logActionsInspected >= 3) {
                logActionLimitReached = true;
                break;
              }
              const stepNum = action.stepNumber;
              if (typeof stepNum !== "number" || !Number.isInteger(stepNum) || stepNum < 0) {
                reportDataIncomplete = true;
                continue;
              }
              logActionsInspected++;
              const output: Record<string, unknown> = {};
              for (const stream of ["stdout", "stderr"] as const) {
                try {
                  const result = await adapter.getJobLogs(scope, job.id, {
                    step: stepNum,
                    execution: step.execution,
                    stream,
                    maxBytes: 12_000 * 4
                  });
                  const limitedOutput = limitText(
                    redactKnownSecrets(result.text, env), 12_000, result.truncated
                  );
                  output[stream] = limitedOutput.text;
                  if (limitedOutput.truncated) reportDataIncomplete = true;
                } catch {
                  output[stream] = "Unable to retrieve this output stream.";
                  reportDataIncomplete = true;
                }
              }
              failedStepLogs.push({
                step_num: stepNum,
                execution: step.execution,
                action_name: action.name,
                stdout: output.stdout,
                stderr: output.stderr
              });
            }
            if (logActionLimitReached) break;
          }

          let testResults = "";
          let testResultsError: string | undefined;
          try {
            const report = await adapter.getTestReport(scope, job.id, 200_000);
            testResults = report.content + (report.truncated ? "\n[TRUNCATED]" : "");
            if (report.truncated) reportDataIncomplete = true;
          } catch {
            testResultsError = "Unable to retrieve structured test results.";
            reportDataIncomplete = true;
          }

          let artifacts: Array<{ path?: string; size?: number; content?: string; error?: string }> = [];
          try {
            const listed = await adapter.listArtifacts(scope, job.id);
            const reportCandidates = listed.filter((artifact) =>
              /(?:junit|test-results).*\.xml$/i.test(artifact.path)
            );
            if (reportCandidates.some((artifact) => (artifact.size ?? 0) > 500_000)) {
              reportDataIncomplete = true;
            }
            const eligibleReports = reportCandidates.filter((artifact) => (artifact.size ?? 0) <= 500_000);
            if (eligibleReports.length > 1) {
              reportArtifactLimitReached = true;
              reportDataIncomplete = true;
            }
            const reports = eligibleReports.slice(0, 1);
            for (const artifact of reports) {
              try {
                const report = await adapter.getArtifact(scope, job.id, artifact.path, 500_000);
                artifacts.push({ path: artifact.path, size: artifact.size, content: report.content });
                if (report.truncated) reportDataIncomplete = true;
              } catch {
                artifacts.push({ path: artifact.path, size: artifact.size, error: "Unable to retrieve this report artifact." });
                reportDataIncomplete = true;
              }
            }
          } catch {
            artifacts = [{ error: "Unable to list job artifacts." }];
            reportDataIncomplete = true;
          }

          diagnostics.push({
            job_id: job.id,
            name: job.name ?? details.name,
            outcome: job.status,
            failed_steps: failedSteps,
            failed_step_logs: failedStepLogs,
            test_results: testResults,
            test_results_error: testResultsError,
            report_artifacts: artifacts
          });
        }

        workflowReports.push({
          workflow_id: workflow.id,
          workflow_name: workflow.name,
          jobs_total: jobs.length,
          jobs_inspected: inspectedJobs.length,
          jobs_truncated: jobsTruncated,
          failed_jobs_total: failedJobs.length,
          failed_jobs: diagnostics
        });
      }

      const workflowLimitReached = workflows.length > workflowsInspected.length;
      const safePayload = redactKnownSecrets(JSON.stringify({
        project: { id: registryProject.id, name: registryProject.name, provider: adapter.provider },
        run,
        status_semantics: "GitHub Actions workflow status/conclusion, not a project build-result status; the request validation artifact is metadata-only and is not parsed here.",
        workflows: workflowReports,
        diagnostics_summary: {
          workflows_total: workflows.length,
          workflows_inspected: workflowReports.length,
          workflows_truncated: workflowLimitReached,
          failed_jobs_inspected: failedJobsInspected,
          failed_job_limit_reached: failedJobLimitReached,
          jobs_truncated: jobLimitReached,
          report_data_incomplete: reportDataIncomplete,
          report_artifact_limit_reached: reportArtifactLimitReached,
          incomplete: workflowLimitReached || jobLimitReached || failedJobLimitReached || logActionLimitReached || reportDataIncomplete,
          log_actions_inspected: logActionsInspected,
          log_action_limit_reached: logActionLimitReached
        },
        limits: { max_workflows: 5, max_jobs_per_workflow: 40, max_failed_jobs_per_run: 3, max_failed_actions_with_logs_per_run: 3, max_report_artifacts_per_job: 1, max_report_bytes: 500_000 }
      }, null, 2), env);
      const diagnosticData = JSON.parse(safePayload) as Record<string, unknown>;
      return { content: [{ type: "text", text: stringifyBoundedJson(diagnosticData, 120_000) }] };
    }
  );

  server.registerTool(
    "list_recent_events",
    {
      description: "Read signed CircleCI workflow/job completion events for one registered Znect project. Select project_id; the initial after=0 read returns the newest events first, and next_cursor can be passed as after to receive later events. Read-only.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        project_id: z.string().min(2).max(63),
        after: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(50).default(20)
      }
    },
    async ({ project_id, after, limit }) => {
      if (!env.EVENT_STORE) throw new Error("CircleCI event storage is not configured.");
      const project = findProject(getProjectRegistry(env), project_id);
      if (!project) throw new Error(`Unknown Znect project: ${project_id}.`);
      let result: Record<string, unknown>;
      try {
        const response = await env.EVENT_STORE.get(env.EVENT_STORE.idFromName(project.id))
          .fetch(`https://event-store/events?after=${after}&limit=${limit}`);
        result = await readEventPage(response, limit, after, new Set(project.connections.filter((connection) => connection.provider === "circleci").map((connection) => connection.projectSlug!)));
      } catch {
        throw new Error("CircleCI event storage is temporarily unavailable or returned invalid data.");
      }
      return { content: [{ type: "text", text: stringifyBoundedJson(result, 60_000) }] };
    }
  );

  server.registerTool(
    "correlate_recent_events",
    {
      description: "Correlate signed CircleCI webhook events with recent CircleCI API v3 runs using exact commit revision, compatible branch and distance to the run execution interval. This is a heuristic: repeated candidates are marked ambiguous, and webhook pipeline IDs are never treated as API run IDs. Read-only.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        project_id: z.string().min(2).max(63),
        connection_id: z.string().min(2).max(63).optional(),
        after: z.number().int().min(0).default(0),
        event_limit: z.number().int().min(1).max(50).default(20),
        run_limit: z.number().int().min(1).max(30).default(20)
      }
    },
    async ({ project_id, connection_id, after, event_limit, run_limit }) => {
      if (!env.EVENT_STORE) throw new Error("CircleCI event storage is not configured.");
      const project = findProject(getProjectRegistry(env), project_id);
      if (!project) throw new Error("Unknown Znect project: " + project_id + ".");
      let selected: ReturnType<typeof getCircleCiAdapter>;
      try {
        selected = getCircleCiAdapter(env, project_id, connection_id);
      } catch {
        throw new Error("CircleCI connection is unavailable or ambiguous.");
      }
      const { connection, scope, adapter } = selected;
      let page: Record<string, unknown>;
      try {
        const response = await env.EVENT_STORE.get(env.EVENT_STORE.idFromName(project.id))
          .fetch("https://event-store/events?after=" + after + "&limit=" + event_limit);
        page = await readEventPage(response, event_limit, after, new Set(project.connections.filter((connection) => connection.provider === "circleci").map((connection) => connection.projectSlug!)));
      } catch {
        throw new Error("CircleCI event storage is temporarily unavailable or returned invalid data.");
      }
      let runs: Awaited<ReturnType<typeof adapter.listRuns>>;
      try {
        runs = await adapter.listRuns(scope, run_limit);
      } catch {
        throw new Error("CircleCI run data is temporarily unavailable.");
      }
      const events = Array.isArray(page.events) ? page.events : [];
      const correlations = correlateEventsWithRuns(events, runs);
      const payload = {
        project: { id: project.id, name: project.name },
        connection: { id: connection.id, provider: "circleci", project_slug: connection.projectSlug },
        correlations,
        next_cursor: page.next_cursor,
        matching: {
          strategy: "exact commit SHA + compatible branch + distance to the run execution interval within 24 hours",
          max_candidates_per_event: 3,
          note: "A match is a correlation candidate, not proof that a webhook pipeline ID equals an API v3 run ID."
        }
      };
      return { content: [{ type: "text", text: redactedBoundedJson(payload, env, 100_000) }] };
    }
  );


  server.registerTool(
    "check_znect_build_connection",
    {
      description: "Verify read-only access to the central Znect Build GitHub Actions repository for one registered Znect project. Does not trigger workflows or change builds.",
      annotations: { readOnlyHint: true },
      inputSchema: { project_id: z.string().min(2).max(63), connection_id: z.string().min(2).max(63).optional() }
    },
    async ({ project_id, connection_id }) => {
      const { project, connection, scope, adapter } = getZnectBuildAdapter(env, project_id, connection_id);
      try {
        const runs = await adapter.listRuns(scope, 1);
        return { content: [{ type: "text", text: redactedBoundedJson({
          connected: true,
          provider: adapter.provider,
          project: { id: project.id, name: project.name, status: "registered" },
          connection: { id: connection.id, status: "configured" },
          provider_availability: "available",
          permissions: "read-only",
          read_probe: { verified_runs_available: runs.length }
        }, env, 20_000) }] };
      } catch {
        return { content: [{ type: "text", text: redactedBoundedJson({
          connected: false,
          provider: adapter.provider,
          project: { id: project.id, name: project.name, status: "registered" },
          connection: { id: connection.id, status: "configured" },
          provider_availability: "unavailable",
          error: "Central Build read probe failed; check the repository-scoped read token and connection configuration."
        }, env, 20_000) }] };
      }
    }
  );

  server.registerTool(
    "list_build_runs",
    {
      description: "List verified central Znect Build workflow runs for one registered project. Ownership requires the central project/source fingerprint artifact; unverified runs are omitted. Read-only; limit 1–20.",
      annotations: { readOnlyHint: true },
      inputSchema: { project_id: z.string().min(2).max(63), connection_id: z.string().min(2).max(63).optional(), limit: z.number().int().min(1).max(20).default(10) }
    },
    async ({ project_id, connection_id, limit }) => {
      const { project, connection, scope, adapter } = getZnectBuildAdapter(env, project_id, connection_id);
      const runs = await adapter.listRuns(scope, limit);
      return { content: [{ type: "text", text: redactedBoundedJson({
        project: { id: project.id, name: project.name, provider: "znect-build" },
        connection: { id: connection.id },
        status_semantics: "GitHub Actions workflow status/conclusion, not a project build-result status",
        runs
      }, env, 100_000) }] };
    }
  );

  server.registerTool(
    "get_build_run_details",
    {
      description: "Read one verified central Znect Build workflow run, its jobs and run-scoped artifact metadata. Does not retrieve or execute project builds.",
      annotations: { readOnlyHint: true },
      inputSchema: { project_id: z.string().min(2).max(63), connection_id: z.string().min(2).max(63).optional(), run_id: z.string().regex(/^\d{1,16}$/) }
    },
    async ({ project_id, connection_id, run_id }) => {
      const { project, connection, scope, adapter } = getZnectBuildAdapter(env, project_id, connection_id);
      const run = await adapter.getRun(scope, run_id);
      const workflows = await adapter.listWorkflows(scope, run_id);
      const workflowReports: Array<Record<string, unknown>> = [];
      for (const workflow of workflows.slice(0, 5)) {
        const jobs = await adapter.listJobs(scope, run_id, workflow.id);
        workflowReports.push({ workflow, jobs: jobs.slice(0, 40), jobs_truncated: jobs.length > 40 });
      }
      const artifacts = adapter.listRunArtifacts ? await adapter.listRunArtifacts(scope, run_id) : [];
      return { content: [{ type: "text", text: redactedBoundedJson({
        project: { id: project.id, name: project.name, provider: "znect-build" },
        connection: { id: connection.id },
        run,
        status_semantics: "GitHub Actions workflow status/conclusion, not a project build-result status; validation artifact JSON is not parsed in this adapter iteration.",
        workflows: workflowReports,
        artifacts: { scope: "workflow_run", items: artifacts },
        capabilities: {
          job_logs: "unavailable_zip_archive",
          test_reports: "not_exposed_by_generic_github_actions_api",
          artifact_content: "zip_archive_not_extracted"
        }
      }, env, 120_000) }] };
    }
  );

  server.registerTool(
    "list_build_run_artifacts",
    {
      description: "List verified central Znect Build workflow-run artifact metadata. Artifacts are run-scoped, not job-scoped; download URLs are not exposed. Read-only.",
      annotations: { readOnlyHint: true },
      inputSchema: { project_id: z.string().min(2).max(63), connection_id: z.string().min(2).max(63).optional(), run_id: z.string().regex(/^\d{1,16}$/) }
    },
    async ({ project_id, connection_id, run_id }) => {
      const { project, connection, scope, adapter } = getZnectBuildAdapter(env, project_id, connection_id);
      if (!adapter.listRunArtifacts) throw new Error("This provider does not expose run-scoped artifacts.");
      const artifacts = await adapter.listRunArtifacts(scope, run_id);
      return { content: [{ type: "text", text: redactedBoundedJson({
        project: { id: project.id, name: project.name, provider: "znect-build" },
        run_id,
        artifact_scope: "workflow_run",
        artifacts
      }, env, 60_000) }] };
    }
  );

  return server;
}

async function handleReadOnlyApi(request: Request, env: Env): Promise<Response> {
  if (!env.WEB_ACCESS_TOKEN) return json({ error: "Web access secret is not configured." }, 503);
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!(await safeEqual(match?.[1] ?? "", env.WEB_ACCESS_TOKEN))) {
    const limited = await rateLimitFailedAuthentication(request, env);
    if (limited) return limited;
    return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": 'Bearer realm="Znect CI Bridge API"', "cache-control": "no-store" } });
  }
  if (!env.MCP_RATE_LIMITER) return json({ error: "Rate limiting is not configured." }, 503);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.WEB_ACCESS_TOKEN));
  const key = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  let rateLimit: { success: boolean };
  try { rateLimit = await env.MCP_RATE_LIMITER.limit({ key }); }
  catch { return json({ error: "Rate limiting is temporarily unavailable." }, 503); }
  if (!rateLimit.success) return json({ error: "Rate limit exceeded. Retry after the current window." }, 429);
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { allow: "GET" } });

  const url = new URL(request.url);
  try {
    if (url.pathname === "/api/v1/projects") {
      const projects = getProjectRegistry(env).projects.map(describeProjectStatus);
      return boundedJson(JSON.stringify({ projects }), 20_000);
    }
    if (url.pathname === "/api/v1/events") {
      if (!env.EVENT_STORE) return json({ error: "Event storage is not configured." }, 503);
      const afterRaw = url.searchParams.get("after") ?? "0";
      const limitRaw = url.searchParams.get("limit") ?? "20";
      const after = Number(afterRaw);
      const limit = Number(limitRaw);
      if (!Number.isSafeInteger(after) || after < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
        return json({ error: "after must be a non-negative integer and limit must be 1–50." }, 400);
      }
      const projectId = url.searchParams.get("project_id");
      if (!projectId) return json({ error: "project_id query parameter is required." }, 400);
      const project = findProject(getProjectRegistry(env), projectId);
      if (!project) return json({ error: "Unknown Znect project." }, 404);
      try {
        const response = await env.EVENT_STORE.get(env.EVENT_STORE.idFromName(project.id))
          .fetch(`https://event-store/events?after=${after}&limit=${limit}`);
        const result = await readEventPage(response, limit, after, new Set(project.connections.filter((connection) => connection.provider === "circleci").map((connection) => connection.projectSlug!)));
        return boundedJson(JSON.stringify(result), 60_000);
      } catch {
        return json({ error: "Event storage is temporarily unavailable or returned invalid data." }, 503);
      }
    }
    if (url.pathname === "/api/v1/event-correlations") {
      const projectId = url.searchParams.get("project_id");
      if (!projectId) return json({ error: "project_id query parameter is required." }, 400);
      const after = Number(url.searchParams.get("after") ?? "0");
      const eventLimit = Number(url.searchParams.get("event_limit") ?? "20");
      const runLimit = Number(url.searchParams.get("run_limit") ?? "20");
      if (!Number.isSafeInteger(after) || after < 0 || !Number.isInteger(eventLimit) || eventLimit < 1 || eventLimit > 50 || !Number.isInteger(runLimit) || runLimit < 1 || runLimit > 30) {
        return json({ error: "after must be non-negative; event_limit must be 1–50 and run_limit must be 1–30." }, 400);
      }
      if (!env.EVENT_STORE) return json({ error: "Event storage is not configured." }, 503);
      const project = findProject(getProjectRegistry(env), projectId);
      if (!project) return json({ error: "Unknown Znect project." }, 404);
      let page: Record<string, unknown>;
      try {
        const response = await env.EVENT_STORE.get(env.EVENT_STORE.idFromName(project.id))
          .fetch("https://event-store/events?after=" + after + "&limit=" + eventLimit);
        page = await readEventPage(response, eventLimit, after, new Set(project.connections.filter((connection) => connection.provider === "circleci").map((connection) => connection.projectSlug!)));
      } catch {
        return json({ error: "CircleCI event storage is temporarily unavailable or returned invalid data." }, 503);
      }
      let connection: ReturnType<typeof getCircleCiAdapter>["connection"];
      let runs: Awaited<ReturnType<ReturnType<typeof getCircleCiAdapter>["adapter"]["listRuns"]>>;
      try {
        const selected = getCircleCiAdapter(env, projectId, url.searchParams.get("connection_id") ?? undefined);
        connection = selected.connection;
        runs = await selected.adapter.listRuns(selected.scope, runLimit);
      } catch {
        return json({ error: "CircleCI run data is temporarily unavailable or the selected connection is invalid." }, 502);
      }
      const events = Array.isArray(page.events) ? page.events : [];
      const payload = {
        project: { id: project.id, name: project.name },
        connection: { id: connection.id, provider: "circleci", project_slug: connection.projectSlug },
        correlations: correlateEventsWithRuns(events, runs),
        next_cursor: page.next_cursor,
        matching: {
          strategy: "exact commit SHA + compatible branch + distance to the run execution interval within 24 hours",
          max_candidates_per_event: 3,
          note: "Correlations are heuristic candidates; webhook pipeline IDs are not assumed to be API v3 run IDs."
        }
      };
      return boundedJson(redactedBoundedJson(payload, env, 100_000), 100_000);
    }

    if (url.pathname === "/api/v1/status") {
      const projectId = url.searchParams.get("project_id");
      if (!projectId) return json({ error: "project_id query parameter is required." }, 400);
      const { project, connection, scope, adapter } = getCircleCiAdapter(env, projectId, url.searchParams.get("connection_id") ?? undefined);
      try {
        const recentRuns = await adapter.listRuns(scope, 1);
        return json({
          service: "znect-ci-bridge",
          connected: true,
          provider: adapter.provider,
          project: { id: project.id, name: project.name, status: "registered" },
          connection: { id: connection.id, status: "configured" },
          provider_availability: "available",
          permissions: "read-only",
          read_probe: { recent_runs_available: recentRuns.length }
        });
      } catch {
        return json({
          service: "znect-ci-bridge",
          connected: false,
          provider: adapter.provider,
          project: { id: project.id, name: project.name, status: "registered" },
          connection: { id: connection.id, status: "configured" },
          provider_availability: "unavailable",
          error: "Provider read probe failed; check provider credentials and connectivity."
        });
      }
    }
    if (url.pathname === "/api/v1/runs") {
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? 10 : Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 30) return json({ error: "limit must be an integer between 1 and 30." }, 400);
      const projectId = url.searchParams.get("project_id");
      if (!projectId) return json({ error: "project_id query parameter is required." }, 400);
      const { project, scope, adapter } = getCircleCiAdapter(env, projectId, url.searchParams.get("connection_id") ?? undefined);
      const runs = await adapter.listRuns(scope, limit);
      return boundedJson(redactedBoundedJson({ project: { id: project.id, name: project.name, provider: adapter.provider }, runs }, env, 100_000), 100_000);
    }
    const segments = url.pathname.split("/");
    if (segments.length === 5 && segments[1] === "api" && segments[2] === "v1" && segments[3] === "diagnostics") {
      const parsed = z.string().uuid().safeParse(segments[4]);
      if (!parsed.success) return json({ error: "A valid CI run UUID is required." }, 400);
      const projectId = url.searchParams.get("project_id");
      if (!projectId) return json({ error: "project_id query parameter is required." }, 400);
      const { project, scope, adapter } = getCircleCiAdapter(env, projectId, url.searchParams.get("connection_id") ?? undefined);
      const run = await adapter.getRun(scope, parsed.data);
      const workflows = await adapter.listWorkflows(scope, run.id);
      const workflowReports: Array<Record<string, unknown>> = [];
      let failedJobsInspected = 0;
      let failedJobLimitReached = false;
      let logActionsInspected = 0;
      let logActionLimitReached = false;
      let jobLimitReached = false;
      let reportDataIncomplete = false;
      let reportArtifactLimitReached = false;
      let incomplete = false;

      for (const workflow of workflows.slice(0, 5)) {
        const jobs = await adapter.listJobs(scope, run.id, workflow.id);
        const inspectedJobs = jobs.slice(0, 40);
        const jobsTruncated = jobs.length > inspectedJobs.length;
        if (jobsTruncated) { jobLimitReached = true; incomplete = true; }
        const failedJobs = inspectedJobs.filter((job) => job.status === "failed" || job.status === "failure");
        const reports: Array<Record<string, unknown>> = [];
        for (const job of failedJobs) {
          if (failedJobsInspected >= 3) { failedJobLimitReached = true; incomplete = true; break; }
          failedJobsInspected++;
          const details = await adapter.getJob(scope, job.id);
          if (details.workflowId !== workflow.id) throw new Error("CI job does not belong to the selected run workflow.");
          const failedSteps = (details.steps ?? []).flatMap((step) => {
            const actions = step.actions.filter((action) => (action.status === "failed" || action.outcome === "failed") && action.isInsignificant !== true);
            return actions.length ? [{ name: step.name, execution: step.execution, actions }] : [];
          });
          const failedStepLogs: Array<Record<string, unknown>> = [];
          for (const step of details.steps ?? []) {
            for (const action of step.actions) {
              if ((action.status !== "failed" && action.outcome !== "failed") || action.isInsignificant === true) continue;
              if (logActionsInspected >= 3) { logActionLimitReached = true; incomplete = true; break; }
              if (typeof action.stepNumber !== "number" || !Number.isInteger(action.stepNumber) || action.stepNumber < 0) {
                reportDataIncomplete = true;
                incomplete = true;
                continue;
              }
              logActionsInspected++;
              const output: Record<string, string> = {};
              for (const stream of ["stdout", "stderr"] as const) {
                try {
                  const result = await adapter.getJobLogs(scope, job.id, {
                    step: action.stepNumber, execution: step.execution, stream, maxBytes: 12_000 * 4
                  });
                  const limitedOutput = limitText(redactKnownSecrets(result.text, env), 12_000, result.truncated);
                  output[stream] = limitedOutput.text;
                  if (limitedOutput.truncated) { reportDataIncomplete = true; incomplete = true; }
                } catch {
                  output[stream] = "Unable to retrieve this output stream.";
                  reportDataIncomplete = true;
                  incomplete = true;
                }
              }
              failedStepLogs.push({ step_num: action.stepNumber, execution: step.execution, action_name: action.name, ...output });
            }
            if (logActionLimitReached) break;
          }
          let testResults: string | undefined;
          let testResultsError: string | undefined;
          try {
            const report = await adapter.getTestReport(scope, job.id, 200_000);
            testResults = report.content + (report.truncated ? "\n[TRUNCATED]" : "");
            if (report.truncated) { reportDataIncomplete = true; incomplete = true; }
          } catch {
            testResultsError = "Unable to retrieve structured test results.";
            reportDataIncomplete = true;
            incomplete = true;
          }
          const reportArtifacts: Array<Record<string, unknown>> = [];
          try {
            const reportCandidates = (await adapter.listArtifacts(scope, job.id))
              .filter((artifact) => /(?:junit|test-results).*\.xml$/i.test(artifact.path));
            if (reportCandidates.some((artifact) => (artifact.size ?? 0) > 500_000)) {
              reportDataIncomplete = true;
              incomplete = true;
            }
            const eligibleArtifacts = reportCandidates.filter((artifact) => (artifact.size ?? 0) <= 500_000);
            if (eligibleArtifacts.length > 1) {
              reportArtifactLimitReached = true;
              reportDataIncomplete = true;
              incomplete = true;
            }
            const artifacts = eligibleArtifacts.slice(0, 1);
            for (const artifact of artifacts) {
              try {
                const content = await adapter.getArtifact(scope, job.id, artifact.path, 500_000);
                reportArtifacts.push({ path: artifact.path, size: artifact.size, content: content.content });
                if (content.truncated) { reportDataIncomplete = true; incomplete = true; }
              } catch {
                reportArtifacts.push({ path: artifact.path, size: artifact.size, error: "Unable to retrieve this report artifact." });
                reportDataIncomplete = true;
                incomplete = true;
              }
            }
          } catch {
            reportArtifacts.push({ error: "Unable to list job artifacts." });
            reportDataIncomplete = true;
            incomplete = true;
          }
          reports.push({
            job: details,
            failed_steps: failedSteps,
            failed_step_logs: failedStepLogs,
            test_results: testResults,
            test_results_error: testResultsError,
            report_artifacts: reportArtifacts
          });
        }
        workflowReports.push({
          workflow,
          jobs_total: jobs.length,
          jobs_inspected: inspectedJobs.length,
          jobs_truncated: jobsTruncated,
          failed_jobs_total: failedJobs.length,
          failed_jobs: reports
        });
      }
      if (workflows.length > 5) incomplete = true;
      const payload = {
        project: { id: project.id, name: project.name, provider: adapter.provider },
        run,
        workflows: workflowReports,
        diagnostics_summary: {
          workflows_total: workflows.length,
          workflows_inspected: workflowReports.length,
          workflows_truncated: workflows.length > 5,
          failed_jobs_inspected: failedJobsInspected,
          failed_job_limit_reached: failedJobLimitReached,
          jobs_truncated: jobLimitReached,
          report_data_incomplete: reportDataIncomplete,
          report_artifact_limit_reached: reportArtifactLimitReached,
          incomplete,
          log_actions_inspected: logActionsInspected,
          log_action_limit_reached: logActionLimitReached
        },
        limits: { max_workflows: 5, max_jobs_per_workflow: 40, max_failed_jobs_per_run: 3, max_failed_actions_with_logs_per_run: 3, max_report_artifacts_per_job: 1, max_report_bytes: 500_000 }
      };
      return boundedJson(redactedBoundedJson(payload, env, 120_000), 120_000);
    }
    if (segments.length === 5 && segments[1] === "api" && segments[2] === "v1" && segments[3] === "runs") {
      const parsed = z.string().uuid().safeParse(segments[4]);
      if (!parsed.success) return json({ error: "A valid CI run UUID is required." }, 400);
      const projectId = url.searchParams.get("project_id");
      if (!projectId) return json({ error: "project_id query parameter is required." }, 400);
      const { project, scope, adapter } = getCircleCiAdapter(env, projectId, url.searchParams.get("connection_id") ?? undefined);
      const run = await adapter.getRun(scope, parsed.data);
      const workflows = await adapter.listWorkflows(scope, run.id);
      const inspected = workflows.slice(0, 10);
      const workflowReports = await Promise.all(inspected.map(async (workflow) => {
        const jobs = await adapter.listJobs(scope, run.id, workflow.id);
        return {
          workflow,
          jobs: jobs.slice(0, 40),
          jobs_total: jobs.length,
          jobs_truncated: jobs.length > 40
        };
      }));
      const jobsTruncated = workflowReports.some((report) => report.jobs_truncated);
      return boundedJson(redactedBoundedJson({
        project: { id: project.id, name: project.name, provider: adapter.provider },
        run,
        workflows: workflowReports,
        diagnostics_summary: {
          workflows_total: workflows.length,
          workflows_inspected: workflowReports.length,
          workflows_truncated: workflows.length > inspected.length,
          jobs_truncated: jobsTruncated,
          incomplete: workflows.length > inspected.length || jobsTruncated
        },
        limits: { max_workflows: 10, max_jobs_per_workflow: 40 }
      }, env, 120_000), 120_000);
    }
    return json({ error: "API route not found." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CircleCI request failed.";
    return json({ error: limitText(redactKnownSecrets(message, env), 500).text }, 502);
  }
}

async function handleCircleCiWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
  if (!env.CIRCLECI_WEBHOOK_SECRET || !env.EVENT_STORE) {
    return json({ error: "CircleCI webhook secret or event storage is not configured." }, 503);
  }
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return new Response("Unsupported media type", { status: 415, headers: { "accept": "application/json" } });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BODY_BYTES) {
    return json({ error: "Webhook payload exceeds the 64 KiB limit." }, 413);
  }
  const body = await readBoundedRequestBody(request, MAX_WEBHOOK_BODY_BYTES);
  if (body === null) return json({ error: "Webhook payload exceeds the 64 KiB limit." }, 413);
  const signature = request.headers.get("circleci-signature");
  if (!(await verifyCircleCiSignature(body, signature, env.CIRCLECI_WEBHOOK_SECRET))) {
    const limited = await rateLimitFailedAuthentication(request, env);
    if (limited) return limited;
    return new Response("Unauthorized", { status: 401, headers: { "cache-control": "no-store" } });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return json({ error: "Invalid webhook JSON." }, 400);
  }
  let event;
  let targetProject: ReturnType<typeof findCircleCiProject> = undefined;
  try {
    const registry = getProjectRegistry(env);
    const acceptedSlugs = new Set(registry.projects.flatMap((project) =>
      project.connections.filter((connection) => connection.provider === "circleci" && connection.projectSlug)
        .map((connection) => connection.projectSlug!)
    ));
    event = normalizeCircleCiWebhook(payload, request.headers.get("circleci-event-type"), acceptedSlugs);
    if (event) targetProject = findCircleCiProject(registry, event.project_slug);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid CircleCI webhook event.";
    return json({ error: limitText(message, 300).text }, 400);
  }
  if (!event) return json({ accepted: true, ignored: true, reason: "Unsupported event type or project." }, 202);
  if (!targetProject) return json({ error: "Registered CircleCI project mapping was not found." }, 400);
  try {
    const stored = await env.EVENT_STORE.get(env.EVENT_STORE.idFromName(targetProject.project.id))
      .fetch("https://event-store/append", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event)
      });
    if (!stored.ok) {
      return json({ error: "Unable to persist CircleCI event; CircleCI may retry delivery." }, 503);
    }
    const result: unknown = await stored.json();
    if (result === null || typeof result !== "object" || Array.isArray(result) ||
        (result as Record<string, unknown>).accepted !== true ||
        typeof (result as Record<string, unknown>).duplicate !== "boolean") {
      return json({ error: "Event storage returned an invalid acknowledgement; CircleCI may retry delivery." }, 503);
    }
    return json({ accepted: true, duplicate: (result as { duplicate: boolean }).duplicate }, 202);
  } catch {
    // Treat binding failures and malformed acknowledgements as transient so
    // CircleCI receives a retryable response instead of an unhandled Worker error.
    return json({ error: "Event storage is temporarily unavailable; CircleCI may retry delivery." }, 503);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      let projectCount = 0;
      try { projectCount = getProjectRegistry(env).projects.length; } catch { /* health remains non-sensitive */ }
      return json({ service: "znect-ci-bridge", status: "ok", project_count: projectCount, mode: "read-only" });
    }
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(DASHBOARD_HTML, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
          "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
        }
      });
    }
    if (url.pathname === "/webhooks/circleci") return handleCircleCiWebhook(request, env);
    if (url.pathname.startsWith("/api/")) return handleReadOnlyApi(request, env);
    if (url.pathname !== "/mcp") return json({ error: "Not found" }, 404);
    if (!env.CIRCLECI_TOKEN || !env.MCP_ACCESS_TOKEN) return json({ error: "Worker secrets are not configured." }, 503);

    const authorization = request.headers.get("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    const supplied = match?.[1] ?? "";
    if (!(await safeEqual(supplied, env.MCP_ACCESS_TOKEN))) {
      const limited = await rateLimitFailedAuthentication(request, env);
      if (limited) return limited;
      return new Response("Unauthorized", {
        status: 401,
        headers: { "www-authenticate": 'Bearer realm="Znect CI Bridge"', "cache-control": "no-store" }
      });
    }

    if (!env.MCP_RATE_LIMITER) {
      return json({ error: "Rate limiting is not configured." }, 503);
    }
    const tokenDigest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(env.MCP_ACCESS_TOKEN)
    );
    const rateLimitKey = Array.from(new Uint8Array(tokenDigest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    let rateLimit: { success: boolean };
    try {
      rateLimit = await env.MCP_RATE_LIMITER.limit({ key: rateLimitKey });
    } catch {
      return json({ error: "Rate limiting is temporarily unavailable." }, 503);
    }
    if (!rateLimit.success) {
      return json({ error: "Rate limit exceeded. Retry after the current window." }, 429);
    }

    if (!(["GET", "POST", "DELETE"].includes(request.method))) {
      return new Response("Method not allowed", { status: 405, headers: { allow: "GET, POST, DELETE" } });
    }
    return createMcpHandler(() => createServer(env), { route: "/mcp", corsOptions: false })(request, env, ctx);
  }
};
