import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
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
  safeEqual
} from "./security";

interface Env {
  CIRCLECI_TOKEN: string;
  MCP_ACCESS_TOKEN: string;
  MCP_RATE_LIMITER: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}

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

function buildNumber(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("build_num must be a positive integer.");
  return value;
}

function createServer(env: Env) {
  const server = new McpServer({ name: "znect-ci-bridge", version: "0.1.0" });

  server.registerTool(
    "list_recent_builds",
    {
      description: "Read the latest CircleCI job runs for the fixed GitHub project Znect-god/znect-forge. Read-only; returns branch, status, build number, commit and build URL. Limit 1–30.",
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
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "get_build_details",
    {
      description: "Read detailed metadata and step/action statuses for one CircleCI build of Znect-god/Znect-forge. Does not retrieve console output.",
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
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "get_build_logs",
    {
      description: "Read console output for a CircleCI build step/action. Fetches the presigned output URL returned by CircleCI; never accepts arbitrary URLs. Output is bounded to 80,000 characters per action and 160,000 characters total per response.",
      inputSchema: {
        build_num: z.number().int().min(1),
        step_index: z.number().int().min(0).optional(),
        max_actions: z.number().int().min(1).max(20).default(10)
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
      return { content: [{ type: "text", text: JSON.stringify({ build_num, actions }, null, 2) }] };
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
      inputSchema: z.object({})
    },
    async (_args) => {
      const project = await resolveCircleCiProject(env.CIRCLECI_TOKEN, "gh/Znect-god/znect-forge");
      return { content: [{ type: "text", text: JSON.stringify({
        connected: true,
        provider: "CircleCI Cloud API v3",
        project: { id: project.id, slug: project.attributes?.slug },
        permissions: "read-only"
      }, null, 2) }] };
    }
  );
  server.registerTool(
    "list_recent_runs",
    {
      description: "Read the latest CircleCI API v3 runs for the fixed Znect Forge project. Returns UUID run IDs and current outcomes. Read-only; limit 1–30.",
      inputSchema: { limit: z.number().int().min(1).max(30).default(10) }
    },
    async ({ limit }) => {
      const project = await resolveCircleCiProject(env.CIRCLECI_TOKEN, "gh/Znect-god/znect-forge");
      const runs = await listCircleCiRuns(env.CIRCLECI_TOKEN, project.id, limit);
      const payload = JSON.stringify({
        project: { id: project.id, slug: project.attributes?.slug ?? "gh/Znect-god/znect-forge" },
        runs
      }, null, 2);
      const safe = redactKnownSecrets(payload, env);
      return { content: [{ type: "text", text: limitText(safe, 100_000).text }] };
    }
  );

  server.registerTool(
    "get_run_details",
    {
      description: "Read one CircleCI API v3 run by UUID, including its workflows and jobs. Read-only; use a run UUID returned by list_recent_runs.",
      inputSchema: { run_id: z.string().uuid() }
    },
    async ({ run_id }) => {
      const run = await getCircleCiRun(env.CIRCLECI_TOKEN, run_id);
      const workflows = await listCircleCiWorkflows(env.CIRCLECI_TOKEN, run_id);
      const workflowResults = await Promise.all(workflows.slice(0, 20).map(async (workflow) => {
        const jobs = await listCircleCiJobs(env.CIRCLECI_TOKEN, workflow.id);
        return {
          workflow,
          jobs: jobs.slice(0, 50)
        };
      }));
      const payload = JSON.stringify({
        run,
        workflows: workflowResults,
        truncated: workflows.length > 20 || workflowResults.some((entry) => entry.jobs.length >= 50)
      }, null, 2);
      const safe = redactKnownSecrets(payload, env);
      return { content: [{ type: "text", text: limitText(safe, 120_000).text }] };
    }
  );

  server.registerTool(
    "get_job_details",
    {
      description: "Read the CircleCI API v3 job resource by UUID, including all attributes exposed by CircleCI. Read-only.",
      inputSchema: { job_id: z.string().uuid() }
    },
    async ({ job_id }) => {
      const job = await getCircleCiJob(env.CIRCLECI_TOKEN, job_id);
      const payload = JSON.stringify({ job }, null, 2);
      const safe = redactKnownSecrets(payload, env);
      return { content: [{ type: "text", text: limitText(safe, 40_000).text }] };
    }
  );

  server.registerTool(
    "get_job_logs",
    {
      description: "Read bounded stdout or stderr for a CircleCI API v3 job step. Requires a job UUID and step number. Read-only.",
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
          text: JSON.stringify({
            job_id,
            step_num,
            execution,
            stream,
            output: limited.text,
            truncated: limited.truncated
          }, null, 2)
        }]
      };
    }
  );


  server.registerTool(
    "get_job_test_results",
    {
      description: "Read structured CircleCI test results for a job as bounded JSON Lines. Read-only; requires a job UUID from get_run_details.",
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
          text: JSON.stringify({
            job_id,
            format: "jsonl",
            results: limited.text,
            truncated: limited.truncated
          }, null, 2)
        }]
      };
    }
  );

  server.registerTool(
    "list_job_artifacts",
    {
      description: "List metadata for artifacts uploaded by a CircleCI job. Presigned download URLs are deliberately not exposed. Read-only.",
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
      return { content: [{ type: "text", text: limitText(payload, 30_000).text }] };
    }
  );


  server.registerTool(
    "get_job_artifact",
    {
      description: "Download one CircleCI job artifact by its exact path from list_job_artifacts. The URL is resolved internally, host-validated, and the text response is bounded. Read-only.",
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
          text: JSON.stringify({
            job_id,
            artifact_path: result.path,
            content: limited.text,
            truncated: limited.truncated
          }, null, 2)
        }]
      };
    }
  );



  server.registerTool(
    "diagnose_run",
    {
      description: "Automatically inspect one CircleCI run: traverse workflows and jobs, collect failed job steps, structured test results, and small JUnit/test-report artifacts. Read-only; does not rerun or modify pipelines.",
      inputSchema: { run_id: z.string().uuid() }
    },
    async ({ run_id }) => {
      const run = await getCircleCiRun(env.CIRCLECI_TOKEN, run_id);
      const workflows = await listCircleCiWorkflows(env.CIRCLECI_TOKEN, run_id);
      const workflowReports: Array<Record<string, unknown>> = [];
      let failedJobsInspected = 0;

      for (const workflow of workflows.slice(0, 20)) {
        const jobs = await listCircleCiJobs(env.CIRCLECI_TOKEN, workflow.id);
        const failedJobs = jobs.filter((job) => {
          const attributes = job.attributes as Record<string, unknown> | undefined;
          return attributes?.outcome === "failed" || attributes?.status === "failed";
        });
        const diagnostics: Array<Record<string, unknown>> = [];

        for (const job of failedJobs) {
          if (failedJobsInspected >= 5) break;
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
            for (const action of actions.slice(0, 5)) {
              const stepNum = action.step_num;
              if (typeof stepNum !== "number" || !Number.isInteger(stepNum) || stepNum < 0) continue;
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
          }

          let testResults = "";
          let testResultsError: string | undefined;
          try {
            const result = await getCircleCiJobTests(env.CIRCLECI_TOKEN, job.id, 200_000);
            testResults = result.text;
            if (result.truncated) testResults += "\\n[TRUNCATED]";
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
            }).slice(0, 2);
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
        if (failedJobsInspected >= 5) break;
      }

      const payload = redactKnownSecrets(JSON.stringify({
        run,
        workflows: workflowReports,
        limits: { max_workflows: 20, max_failed_jobs_per_run: 5, max_report_artifacts_per_job: 2, max_report_bytes: 500_000 }
      }, null, 2), env);
      return { content: [{ type: "text", text: limitText(payload, 120_000).text }] };
    }
  );

  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ service: "znect-ci-bridge", status: "ok", project: "Znect-god/znect-forge", mode: "read-only" });
    }
    if (url.pathname !== "/mcp") return json({ error: "Not found" }, 404);
    if (!env.CIRCLECI_TOKEN || !env.MCP_ACCESS_TOKEN) return json({ error: "Worker secrets are not configured." }, 503);

    const authorization = request.headers.get("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    const supplied = match?.[1] ?? "";
    if (!(await safeEqual(supplied, env.MCP_ACCESS_TOKEN))) {
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
