import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import {
  allowedArtifactUrl,
  fetchAllowedArtifact,
  limitText,
  readBoundedJson,
  readBoundedText,
  redactKnownSecrets,
  safeEqual
} from "./security";

interface Env {
  CIRCLECI_TOKEN: string;
  MCP_ACCESS_TOKEN: string;
}

const CIRCLECI_API = "https://circleci.com/api/v1.1";
const PROJECT_PATH = "/project/github/Znect-god/znect-forge";
const MAX_CIRCLECI_JSON_BYTES = 1_000_000;
const MAX_LOG_CHARS = 80_000;
const MAX_LOG_BYTES = MAX_LOG_CHARS * 4;
const MAX_TOTAL_LOG_CHARS = 160_000;
const FETCH_TIMEOUT_MS = 15_000;

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

async function circleGet<T>(env: Env, path: string): Promise<T> {
  // All paths are assembled internally from fixed constants and validated build numbers.
  const response = await fetch(`${CIRCLECI_API}${path}`, {
    method: "GET",
    headers: { "Circle-Token": env.CIRCLECI_TOKEN, "Accept": "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!response.ok) {
    const safeMessage = response.status === 401 || response.status === 403
      ? "CircleCI rejected the configured read-only token. Check the Worker secret."
      : `CircleCI API returned HTTP ${response.status}.`;
    throw new Error(safeMessage);
  }
  return await readBoundedJson<T>(response, MAX_CIRCLECI_JSON_BYTES);
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
      const builds = await circleGet<unknown[]>(env, `${PROJECT_PATH}?limit=${limit}`);
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
      const build = await circleGet<any>(env, `${PROJECT_PATH}/${buildNumber(build_num)}`);
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
      const build = await circleGet<any>(env, `${PROJECT_PATH}/${buildNumber(build_num)}`);
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

    if (!(["GET", "POST", "DELETE"].includes(request.method))) {
      return new Response("Method not allowed", { status: 405, headers: { allow: "GET, POST, DELETE" } });
    }
    return createMcpHandler(() => createServer(env), { route: "/mcp", corsOptions: false })(request, env, ctx);
  }
};
