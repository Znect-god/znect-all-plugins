import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { DASHBOARD_HTML } from "./ui";
import { BuildEventStore, normalizeCircleCiWebhook, verifyCircleCiSignature } from "./events";
export { BuildEventStore };
import { circleGet } from "./circleci";
import {
  getCircleCiJob,
  getCircleCiJobStepOutput,
  getCircleCiJobTests,
  getCircleCiJobArtifact,
  listCircleCiJobArtifacts,
  getCircleCiRun,
  listCircleCiJobs,
  listCircleCiRuns,
  listCircleCiWorkflows,
  resolveCircleCiProject
} from "./circleci-v3";
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
  EVENT_STORE: DurableObjectNamespace;
  MCP_RATE_LIMITER: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}

const PROJECT_SLUG = "gh/Znect-god/znect-forge";
const PROJECT_PATH = "/project/github/Znect-god/znect-forge";
const MAX_LOG_CHARS = 80_000;
const MAX_LOG_BYTES = MAX_LOG_CHARS * 4;
const MAX_TOTAL_LOG_CHARS = 160_000;

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
      description: "Read the latest CircleCI job runs for the fixed GitHub project Znect-god/znect-forge. Read-only; returns branch, status, build number, commit and build URL. Limit 1–30.",
      annotations: { readOnlyHint: true },
      inputSchema: { limit: z.number().int().min(1).max(30).default(10) }
    },
    async ({ limit }) => {
      const builds = await circleGet<unknown[]>(env.CIRCLECI_TOKEN, `${PROJECT_PATH}?limit=${limit}`);
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
      description: "Read detailed metadata and step/action statuses for one CircleCI build of Znect-god/Znect-forge. Does not retrieve console output.",
      annotations: { readOnlyHint: true },
      inputSchema: { build_num: z.number().int().min(1) }
    },
    async ({ build_num }) => {
      const build = await circleGet<any>(env.CIRCLECI_TOKEN, `${PROJECT_PATH}/${buildNumber(build_num)}`);
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
        build_num: z.number().int().min(1),
        step_index: z.number().int().min(0).optional(),
        max_actions: z.number().int().min(1).max(10).default(10)
      }
    },
    async ({ build_num, step_index, max_actions }) => {
      const build = await circleGet<any>(env.CIRCLECI_TOKEN, `${PROJECT_PATH}/${buildNumber(build_num)}`);
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
  // Minimal live connectivity check for the fixed Forge project.
  // Read-only: this tool never starts or changes a pipeline.
  server.registerTool(
    "check_connection",
    {
      description: "Verify MCP-to-CircleCI authentication and read access to the fixed Znect Forge project. Returns connection status and project identity only. Read-only.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({})
    },
    async (_args) => {
      const project = await resolveCircleCiProject(env.CIRCLECI_TOKEN, PROJECT_SLUG);
      return { content: [{ type: "text", text: JSON.stringify({
        connected: true,
        provider: "CircleCI Cloud API v3",
        project: { id: project.id, slug: project.attributes?.slug ?? PROJECT_SLUG },
        permissions: "read-only"
      }, null, 2) }] };
    }
  );
  server.registerTool(
    "list_recent_runs",
    {
      description: "Read the latest CircleCI API v3 runs for the fixed Znect Forge project. Returns UUID run IDs and current outcomes. Read-only; limit 1–30.",
      annotations: { readOnlyHint: true },
      inputSchema: { limit: z.number().int().min(1).max(30).default(10) }
    },
    async ({ limit }) => {
      const project = await resolveCircleCiProject(env.CIRCLECI_TOKEN, PROJECT_SLUG);
      const runs = await listCircleCiRuns(env.CIRCLECI_TOKEN, project.id, limit);
      const payload = JSON.stringify({
        project: { id: project.id, slug: project.attributes?.slug ?? PROJECT_SLUG },
        runs
      }, null, 2);
      const safe = redactKnownSecrets(payload, env);
      return { content: [{ type: "text", text: stringifyBoundedJson(JSON.parse(safe), 100_000) }] };
    }
  );

  server.registerTool(
    "get_run_details",
    {
      description: "Read one CircleCI API v3 run by UUID, including its workflows and jobs. Read-only; use a run UUID returned by list_recent_runs.",
      annotations: { readOnlyHint: true },
      inputSchema: { run_id: z.string().uuid() }
    },
    async ({ run_id }) => {
      const run = await getCircleCiRun(env.CIRCLECI_TOKEN, run_id);
      const workflows = await listCircleCiWorkflows(env.CIRCLECI_TOKEN, run_id, 2);
      const workflowResults = await Promise.all(workflows.slice(0, 10).map(async (workflow) => {
        const jobs = await listCircleCiJobs(env.CIRCLECI_TOKEN, workflow.id, 2);
        return {
          workflow,
          jobs: jobs.slice(0, 40)
        };
      }));
      const payload = JSON.stringify({
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
      description: "Read the CircleCI API v3 job resource by UUID, including all attributes exposed by CircleCI. Read-only.",
      annotations: { readOnlyHint: true },
      inputSchema: { job_id: z.string().uuid() }
    },
    async ({ job_id }) => {
      const job = await getCircleCiJob(env.CIRCLECI_TOKEN, job_id);
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
        job_id: z.string().uuid(),
        step_num: z.number().int().min(0),
        execution: z.number().int().min(0).default(0),
        stream: z.enum(["stdout", "stderr"]).default("stdout"),
        max_chars: z.number().int().min(1).max(80_000).default(30_000)
      }
    },
    async ({ job_id, step_num, execution, stream, max_chars }) => {
      const result = await getCircleCiJobStepOutput(
        env.CIRCLECI_TOKEN,
        job_id,
        step_num,
        stream,
        execution,
        max_chars * 4
      );
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
        job_id: z.string().uuid(),
        max_chars: z.number().int().min(1).max(80_000).default(40_000)
      }
    },
    async ({ job_id, max_chars }) => {
      const result = await getCircleCiJobTests(env.CIRCLECI_TOKEN, job_id, max_chars * 4);
      const redacted = redactKnownSecrets(result.text, env);
      const limited = limitText(redacted, max_chars, result.truncated);
      return {
        content: [{
          type: "text",
          text: stringifyBoundedJson({
            job_id,
            format: "jsonl",
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
      inputSchema: { job_id: z.string().uuid() }
    },
    async ({ job_id }) => {
      const artifacts = await listCircleCiJobArtifacts(env.CIRCLECI_TOKEN, job_id);
      const safe = artifacts.map((artifact) => ({
        id: artifact.id,
        path: artifact.attributes?.path,
        size: artifact.attributes?.size,
        node_index: artifact.attributes?.node_index
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
        job_id: z.string().uuid(),
        artifact_path: z.string().min(1).max(512),
        max_chars: z.number().int().min(1).max(80_000).default(40_000)
      }
    },
    async ({ job_id, artifact_path, max_chars }) => {
      const result = await getCircleCiJobArtifact(env.CIRCLECI_TOKEN, job_id, artifact_path, max_chars * 4);
      const redacted = redactKnownSecrets(result.text, env);
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
      description: "Automatically inspect one CircleCI run: traverse workflows and jobs, collect failed job steps, structured test results, and small JUnit/test-report artifacts. Read-only; does not rerun or modify pipelines.",
      annotations: { readOnlyHint: true },
      inputSchema: { run_id: z.string().uuid() }
    },
    async ({ run_id }) => {
      const run = await getCircleCiRun(env.CIRCLECI_TOKEN, run_id);
      const workflows = await listCircleCiWorkflows(env.CIRCLECI_TOKEN, run_id, 2);
      const workflowReports: Array<Record<string, unknown>> = [];
      let failedJobsInspected = 0;
      let failedJobLimitReached = false;
      let logActionsInspected = 0;
      let logActionLimitReached = false;
      const workflowsInspected = workflows.slice(0, 5);

      for (const workflow of workflowsInspected) {
        const jobs = await listCircleCiJobs(env.CIRCLECI_TOKEN, workflow.id, 2);
        const failedJobs = jobs.filter((job) => {
          const attributes = job.attributes as Record<string, unknown> | undefined;
          return attributes?.outcome === "failed" || attributes?.status === "failed";
        });
        const diagnostics: Array<Record<string, unknown>> = [];

        for (const job of failedJobs) {
          if (failedJobsInspected >= 3) {
            failedJobLimitReached = true;
            break;
          }
          failedJobsInspected++;
          const attributes = job.attributes as Record<string, unknown> | undefined;
          const details = await getCircleCiJob(env.CIRCLECI_TOKEN, job.id);
          const detailAttributes = details.attributes as Record<string, unknown> | undefined;
          const executions = Array.isArray(detailAttributes?.parallel_executions)
            ? detailAttributes.parallel_executions as Array<Record<string, unknown>>
            : [];
          const failedSteps = executions.flatMap((execution) => {
            const steps = Array.isArray(execution.steps) ? execution.steps as Array<Record<string, unknown>> : [];
            return steps.filter((step) => {
              const actions = Array.isArray(step.actions) ? step.actions as Array<Record<string, unknown>> : [];
              return actions.some((action) => action.status === "failed" || action.outcome === "failed");
            }).map((step) => ({
              name: step.name,
              execution_index: execution.execution ?? 0,
              actions: (Array.isArray(step.actions) ? step.actions as Array<Record<string, unknown>> : [])
                .filter((action) => action.status === "failed" || action.outcome === "failed")
                .map((action) => ({
                  name: action.name,
                  status: action.status,
                  exit_code: action.exit_code,
                  step_num: action.step_num
                }))
            }));
          });

          // Include the actual stdout/stderr from failed actions so a single
          // diagnose_run call contains evidence, not only failure metadata.
          const failedStepLogs: Array<Record<string, unknown>> = [];
          for (const step of failedSteps) {
            const actions = Array.isArray(step.actions)
              ? step.actions as Array<Record<string, unknown>>
              : [];
            for (const action of actions) {
              if (logActionsInspected >= 3) {
                logActionLimitReached = true;
                break;
              }
              const stepNum = action.step_num;
              if (typeof stepNum !== "number" || !Number.isInteger(stepNum) || stepNum < 0) continue;
              logActionsInspected++;
              const execution = typeof step.execution_index === "number" && Number.isInteger(step.execution_index)
                ? step.execution_index
                : 0;
              const output: Record<string, unknown> = {};
              for (const stream of ["stdout", "stderr"] as const) {
                try {
                  const result = await getCircleCiJobStepOutput(
                    env.CIRCLECI_TOKEN,
                    job.id,
                    stepNum,
                    stream,
                    execution,
                    12_000 * 4
                  );
                  const redacted = redactKnownSecrets(result.text, env);
                  output[stream] = limitText(redacted, 12_000, result.truncated).text;
                } catch {
                  output[stream] = "Unable to retrieve this output stream.";
                }
              }
              failedStepLogs.push({
                step_num: stepNum,
                execution,
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
            const result = await getCircleCiJobTests(env.CIRCLECI_TOKEN, job.id, 200_000);
            testResults = result.text;
            if (result.truncated) testResults += "\n[TRUNCATED]";
          } catch {
            testResultsError = "Unable to retrieve structured test results.";
          }

          let artifacts: Array<{ path?: string; size?: number; content?: string; error?: string }> = [];
          try {
            const listed = await listCircleCiJobArtifacts(env.CIRCLECI_TOKEN, job.id);
            const reports = listed.filter((artifact) => {
              const path = artifact.attributes?.path ?? "";
              const size = artifact.attributes?.size ?? 0;
              return /(?:junit|test-results).*\.xml$/i.test(path) && size <= 500_000;
            }).slice(0, 1);
            for (const artifact of reports) {
              const path = artifact.attributes?.path ?? "";
              try {
                const report = await getCircleCiJobArtifact(env.CIRCLECI_TOKEN, job.id, path, 500_000);
                artifacts.push({ path, size: artifact.attributes?.size, content: report.text });
              } catch {
                artifacts.push({ path, size: artifact.attributes?.size, error: "Unable to retrieve this report artifact." });
              }
            }
          } catch {
            artifacts = [{ error: "Unable to list job artifacts." }];
          }

          diagnostics.push({
            job_id: job.id,
            name: attributes?.name ?? detailAttributes?.name,
            outcome: attributes?.outcome ?? attributes?.status,
            failed_steps: failedSteps,
            failed_step_logs: failedStepLogs,
            test_results: testResults,
            test_results_error: testResultsError,
            report_artifacts: artifacts
          });
        }

        workflowReports.push({
          workflow_id: workflow.id,
          workflow_name: (workflow.attributes as Record<string, unknown> | undefined)?.name,
          jobs_total: jobs.length,
          failed_jobs_total: failedJobs.length,
          failed_jobs: diagnostics
        });
        // Continue scanning the remaining inspected workflows after the third failure.
        // Only mark the report incomplete when another failed job is actually found.
      }

      const workflowLimitReached = workflows.length > workflowsInspected.length;
      const safePayload = redactKnownSecrets(JSON.stringify({
        run,
        workflows: workflowReports,
        diagnostics_summary: {
          workflows_total: workflows.length,
          workflows_inspected: workflowReports.length,
          workflows_truncated: workflowLimitReached,
          failed_jobs_inspected: failedJobsInspected,
          failed_job_limit_reached: failedJobLimitReached,
          incomplete: workflowLimitReached || failedJobLimitReached || logActionLimitReached,
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
      description: "Read newly received, signed CircleCI workflow/job completion events for the fixed Znect Forge project. Use the returned next_cursor as after on the next call. Read-only.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        after: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(50).default(20)
      }
    },
    async ({ after, limit }) => {
      if (!env.EVENT_STORE) throw new Error("CircleCI event storage is not configured.");
      const response = await env.EVENT_STORE.get(env.EVENT_STORE.idFromName("znect-forge"))
        .fetch(`https://event-store/events?after=${after}&limit=${limit}`);
      if (!response.ok) throw new Error(`CircleCI event storage is unavailable (HTTP ${response.status}).`);
      const result = await response.json() as Record<string, unknown>;
      return { content: [{ type: "text", text: stringifyBoundedJson(result, 60_000) }] };
    }
  );

  return server;
}

async function handleReadOnlyApi(request: Request, env: Env): Promise<Response> {
  if (!env.CIRCLECI_TOKEN || !env.WEB_ACCESS_TOKEN) return json({ error: "Web access secrets are not configured." }, 503);
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
    if (url.pathname === "/api/v1/events") {
      if (!env.EVENT_STORE) return json({ error: "Event storage is not configured." }, 503);
      const afterRaw = url.searchParams.get("after") ?? "0";
      const limitRaw = url.searchParams.get("limit") ?? "20";
      const after = Number(afterRaw);
      const limit = Number(limitRaw);
      if (!Number.isSafeInteger(after) || after < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
        return json({ error: "after must be a non-negative integer and limit must be 1–50." }, 400);
      }
      const response = await env.EVENT_STORE.get(env.EVENT_STORE.idFromName("znect-forge"))
        .fetch(`https://event-store/events?after=${after}&limit=${limit}`);
      if (!response.ok) return json({ error: "Event storage is unavailable.", event_store_status: response.status }, 503);
      const result = await response.json();
      return boundedJson(JSON.stringify(result), 60_000);
    }
    if (url.pathname === "/api/v1/status") {
      const project = await resolveCircleCiProject(env.CIRCLECI_TOKEN, PROJECT_SLUG);
      return json({ service: "znect-ci-bridge", connected: true, provider: "CircleCI Cloud API v3", project: { id: project.id, slug: project.attributes?.slug ?? PROJECT_SLUG }, permissions: "read-only" });
    }
    if (url.pathname === "/api/v1/runs") {
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? 10 : Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 30) return json({ error: "limit must be an integer between 1 and 30." }, 400);
      const project = await resolveCircleCiProject(env.CIRCLECI_TOKEN, PROJECT_SLUG);
      const runs = await listCircleCiRuns(env.CIRCLECI_TOKEN, project.id, limit);
      const safe = redactKnownSecrets(JSON.stringify({ project: { id: project.id, slug: project.attributes?.slug ?? PROJECT_SLUG }, runs }), env);
      return boundedJson(safe, 100_000);
    }
    const segments = url.pathname.split("/");
    if (segments.length === 5 && segments[1] === "api" && segments[2] === "v1" && segments[3] === "diagnostics") {
      const parsed = z.string().uuid().safeParse(segments[4]);
      if (!parsed.success) return json({ error: "A valid CircleCI run UUID is required." }, 400);
      const runId = parsed.data;
      const run = await getCircleCiRun(env.CIRCLECI_TOKEN, runId);
      const workflows = await listCircleCiWorkflows(env.CIRCLECI_TOKEN, runId, 2);
      const workflowReports: Array<Record<string, unknown>> = [];
      let failedJobsInspected = 0;
      let failedJobLimitReached = false;
      let logActionsInspected = 0;
      let logActionLimitReached = false;
      const workflowsInspected = workflows.slice(0, 5);

      for (const workflow of workflowsInspected) {
        const jobs = await listCircleCiJobs(env.CIRCLECI_TOKEN, workflow.id, 2);
        const failedJobs = jobs.filter((job) => {
          const attributes = job.attributes as Record<string, unknown> | undefined;
          return attributes?.outcome === "failed" || attributes?.status === "failed";
        });
        const diagnostics: Array<Record<string, unknown>> = [];

        for (const job of failedJobs) {
          if (failedJobsInspected >= 3) {
            failedJobLimitReached = true;
            break;
          }
          failedJobsInspected++;
          const attributes = job.attributes as Record<string, unknown> | undefined;
          const details = await getCircleCiJob(env.CIRCLECI_TOKEN, job.id);
          const detailAttributes = details.attributes as Record<string, unknown> | undefined;
          const executions = Array.isArray(detailAttributes?.parallel_executions)
            ? detailAttributes.parallel_executions as Array<Record<string, unknown>>
            : [];
          const failedSteps = executions.flatMap((execution) => {
            const steps = Array.isArray(execution.steps) ? execution.steps as Array<Record<string, unknown>> : [];
            return steps.filter((step) => {
              const actions = Array.isArray(step.actions) ? step.actions as Array<Record<string, unknown>> : [];
              return actions.some((action) => action.status === "failed" || action.outcome === "failed");
            }).map((step) => ({
              name: step.name,
              execution_index: execution.execution ?? 0,
              actions: (Array.isArray(step.actions) ? step.actions as Array<Record<string, unknown>> : [])
                .filter((action) => action.status === "failed" || action.outcome === "failed")
                .map((action) => ({
                  name: action.name,
                  status: action.status,
                  exit_code: action.exit_code,
                  step_num: action.step_num
                }))
            }));
          });

          const failedStepLogs: Array<Record<string, unknown>> = [];
          for (const step of failedSteps) {
            const actions = Array.isArray(step.actions) ? step.actions as Array<Record<string, unknown>> : [];
            for (const action of actions) {
              if (logActionsInspected >= 3) {
                logActionLimitReached = true;
                break;
              }
              const stepNum = action.step_num;
              if (typeof stepNum !== "number" || !Number.isInteger(stepNum) || stepNum < 0) continue;
              logActionsInspected++;
              const execution = typeof step.execution_index === "number" && Number.isInteger(step.execution_index)
                ? step.execution_index
                : 0;
              const output: Record<string, unknown> = {};
              for (const stream of ["stdout", "stderr"] as const) {
                try {
                  const result = await getCircleCiJobStepOutput(
                    env.CIRCLECI_TOKEN, job.id, stepNum, stream, execution, 12_000 * 4
                  );
                  output[stream] = limitText(redactKnownSecrets(result.text, env), 12_000, result.truncated).text;
                } catch {
                  output[stream] = "Unable to retrieve this output stream.";
                }
              }
              failedStepLogs.push({
                step_num: stepNum,
                execution,
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
            const result = await getCircleCiJobTests(env.CIRCLECI_TOKEN, job.id, 200_000);
            testResults = result.text + (result.truncated ? "\n[TRUNCATED]" : "");
          } catch {
            testResultsError = "Unable to retrieve structured test results.";
          }

          let artifacts: Array<{ path?: string; size?: number; content?: string; error?: string }> = [];
          try {
            const listed = await listCircleCiJobArtifacts(env.CIRCLECI_TOKEN, job.id);
            const reports = listed.filter((artifact) => {
              const artifactPath = artifact.attributes?.path ?? "";
              const size = artifact.attributes?.size ?? 0;
              return /(?:junit|test-results).*\.xml$/i.test(artifactPath) && size <= 500_000;
            }).slice(0, 1);
            for (const artifact of reports) {
              const artifactPath = artifact.attributes?.path ?? "";
              try {
                const report = await getCircleCiJobArtifact(env.CIRCLECI_TOKEN, job.id, artifactPath, 500_000);
                artifacts.push({ path: artifactPath, size: artifact.attributes?.size, content: report.text });
              } catch {
                artifacts.push({ path: artifactPath, size: artifact.attributes?.size, error: "Unable to retrieve this report artifact." });
              }
            }
          } catch {
            artifacts = [{ error: "Unable to list job artifacts." }];
          }

          diagnostics.push({
            job_id: job.id,
            name: attributes?.name ?? detailAttributes?.name,
            outcome: attributes?.outcome ?? attributes?.status,
            failed_steps: failedSteps,
            failed_step_logs: failedStepLogs,
            test_results: testResults,
            test_results_error: testResultsError,
            report_artifacts: artifacts
          });
        }

        workflowReports.push({
          workflow_id: workflow.id,
          workflow_name: (workflow.attributes as Record<string, unknown> | undefined)?.name,
          jobs_total: jobs.length,
          failed_jobs_total: failedJobs.length,
          failed_jobs: diagnostics
        });
      }

      const safePayload = redactKnownSecrets(JSON.stringify({
        run,
        workflows: workflowReports,
        diagnostics_summary: {
          workflows_total: workflows.length,
          workflows_inspected: workflowReports.length,
          workflows_truncated: workflows.length > workflowsInspected.length,
          failed_jobs_inspected: failedJobsInspected,
          failed_job_limit_reached: failedJobLimitReached,
          incomplete: workflows.length > workflowsInspected.length || failedJobLimitReached || logActionLimitReached,
          log_actions_inspected: logActionsInspected,
          log_action_limit_reached: logActionLimitReached
        },
        limits: { max_workflows: 5, max_jobs_per_workflow: 40, max_failed_jobs_per_run: 3, max_failed_actions_with_logs_per_run: 3, max_report_artifacts_per_job: 1, max_report_bytes: 500_000 }
      }), env);
      return boundedJson(stringifyBoundedJson(JSON.parse(safePayload), 120_000), 120_000);
    }
    if (segments.length === 5 && segments[1] === "api" && segments[2] === "v1" && segments[3] === "runs") {
      const parsed = z.string().uuid().safeParse(segments[4]);
      if (!parsed.success) return json({ error: "A valid CircleCI run UUID is required." }, 400);
      const runId = parsed.data;
      const run = await getCircleCiRun(env.CIRCLECI_TOKEN, runId);
      const workflows = await listCircleCiWorkflows(env.CIRCLECI_TOKEN, runId, 2);
      const inspected = workflows.slice(0, 10);
      const workflowReports = await Promise.all(inspected.map(async (workflow) => {
        const jobs = await listCircleCiJobs(env.CIRCLECI_TOKEN, workflow.id, 2);
        return { workflow, jobs: jobs.slice(0, 40), jobs_total: jobs.length };
      }));
      const safe = redactKnownSecrets(JSON.stringify({
        run,
        workflows: workflowReports,
        diagnostics_summary: {
          workflows_total: workflows.length,
          workflows_inspected: workflowReports.length,
          workflows_truncated: workflows.length > inspected.length,
          incomplete: workflows.length > inspected.length
        },
        limits: { max_workflows: 10, max_jobs_per_workflow: 40 }
      }), env);
      return boundedJson(safe, 120_000);
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
  if (Number.isFinite(declaredLength) && declaredLength > 65_536) {
    return json({ error: "Webhook payload exceeds the 64 KiB limit." }, 413);
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > 65_536) return json({ error: "Webhook payload exceeds the 64 KiB limit." }, 413);
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
  try {
    event = normalizeCircleCiWebhook(payload, request.headers.get("circleci-event-type"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid CircleCI webhook event.";
    return json({ error: limitText(message, 300).text }, 400);
  }
  if (!event) return json({ accepted: true, ignored: true, reason: "Unsupported event type or project." }, 202);
  const stored = await env.EVENT_STORE.get(env.EVENT_STORE.idFromName("znect-forge"))
    .fetch("https://event-store/append", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event)
    });
  if (!stored.ok) return json({ error: "Unable to persist CircleCI event; CircleCI may retry delivery." }, 503);
  const result = await stored.json() as { duplicate?: boolean };
  return json({ accepted: true, duplicate: result.duplicate === true }, 202);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ service: "znect-ci-bridge", status: "ok", project: "Znect-god/znect-forge", mode: "read-only" });
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
