import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const MCP_TOKEN = "bridge-test-token";
const CIRCLE_TOKEN = "circle-test-token";
const RUN_ID = "123e4567-e89b-42d3-a456-426614174001";
const TEST_REGISTRY = JSON.stringify({ version: 1, projects: [{ id: "znect-forge", name: "Znect Forge", repositories: [{ fullName: "Znect-god/znect-forge" }], components: [], connections: [{ id: "forge-circleci", provider: "circleci", projectSlug: "gh/Znect-god/znect-forge" }] }] });
const env = {
  CIRCLECI_TOKEN: CIRCLE_TOKEN,
  MCP_ACCESS_TOKEN: MCP_TOKEN,
  WEB_ACCESS_TOKEN: "web-test-token",
  ZNECT_PROJECT_REGISTRY: TEST_REGISTRY,
  MCP_RATE_LIMITER: { limit: async () => ({ success: true }) }
};
const ctx = {} as ExecutionContext;

function rpcRequest(id: number, method: string, params: Record<string, unknown> = {}) {
  return new Request("https://bridge.example/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer " + MCP_TOKEN,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": method,
      ...(method === "tools/call" && typeof params.name === "string"
        ? { "Mcp-Name": params.name }
        : {})
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {}
        }
      }
    })
  });
}

async function parseRpc(response: Response) {
  const body = await response.text();
  const dataLine = body.split(/\r?\n/).find((line) => line.startsWith("data:"));
  return JSON.parse(dataLine ? dataLine.slice("data:".length).trim() : body);
}

describe("legacy GitHub Actions central Build API retirement", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not expose the retired GitHub Actions-backed build routes", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(new Request(
      "https://bridge.example/api/v1/build/status?project_id=znect-forge",
      { headers: { authorization: "Bearer web-test-token" } }
    ), env, ctx);

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Browser API aggregate CircleCI assistant report", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects invalid report bounds before making provider or storage requests", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(new Request(
      "https://bridge.example/api/v1/report?project_id=znect-forge&run_limit=11",
      { headers: { authorization: "Bearer web-test-token" } }
    ), env, ctx);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("run_limit") });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires project scope for the aggregate report", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(new Request(
      "https://bridge.example/api/v1/report",
      { headers: { authorization: "Bearer web-test-token" } }
    ), env, ctx);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "project_id query parameter is required." });
    expect(fetchMock).not.toHaveBeenCalled();
  });


  it("returns a bounded CircleCI report with webhook correlation and redacted provider fields", async () => {
    const projectId = "123e4567-e89b-42d3-a456-426614174010";
    const eventId = "123e4567-e89b-42d3-a456-426614174011";
    const happenedAt = "2026-11-18T08:00:00.000Z";
    const event = {
      cursor: 1,
      id: eventId,
      type: "workflow-completed",
      happened_at: happenedAt,
      project_slug: "gh/Znect-god/znect-forge",
      revision: "abc123",
      branch: "main"
    };
    const namespace = {
      idFromName: () => "forge",
      get: () => ({
        fetch: async () => new Response(JSON.stringify({ events: [event], next_cursor: 1 }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      })
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: projectId, attributes: { slug: "gh/Znect-god/znect-forge" } }]
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{
          id: RUN_ID,
          attributes: {
            outcome: "failed",
            branch: "main",
            subject: CIRCLE_TOKEN,
            created_at: happenedAt,
            ended_at: "2026-11-18T08:05:00.000Z"
          },
          references: {
            project: { id: projectId },
            event: { attributes: { vcs: { revision: "abc123", branch: "main" } } }
          }
        }],
        page: { next: null }
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(new Request(
      "https://bridge.example/api/v1/report?project_id=znect-forge",
      { headers: { authorization: "Bearer web-test-token" } }
    ), { ...env, EVENT_STORE: namespace } as Parameters<typeof worker.fetch>[1], ctx);
    const payload = await response.json() as {
      provider?: string;
      permissions?: string;
      assistant_handoff?: { mode?: string; automatic_api_access?: boolean; mcp_required?: boolean; bearer_token_included?: boolean; test_summary_count_scope?: string };
      runs?: { returned?: number; failed_count?: number; items?: Array<{ commitMessage?: string }>; diagnostics?: Array<{ run_id: string; status: string; endpoint: string }> };
      completeness?: { diagnostics_included?: boolean; diagnostics_note?: string; events_limited?: boolean };
      events?: { available?: boolean; returned?: number; next_cursor?: number };
      correlations?: Array<{ status: string; candidate_count: number }>;
      read_only?: boolean;
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      provider: "circleci",
      permissions: "read-only",
      assistant_handoff: {
        mode: "user_reviewed_json_attachment",
        automatic_api_access: false,
        mcp_required: false,
        bearer_token_included: false,
        test_summary_count_scope: "observed_records"
      },
      runs: {
        returned: 1,
        failed_count: 1,
        items: [{ commitMessage: "[REDACTED]" }],
        diagnostics: [{
          run_id: RUN_ID,
          status: "failed",
          endpoint: `/api/v1/diagnostics/${RUN_ID}?project_id=znect-forge&connection_id=forge-circleci`
        }]
      },
      completeness: {
        diagnostics_included: false,
        diagnostics_note: "Fetch the listed diagnostics endpoints for failed runs; each response is separately bounded and redacted.",
        events_limited: false
      },
      events: { available: true, returned: 1, next_cursor: 1 },
      correlations: [{ status: "candidate", candidate_count: 1 }],
      read_only: true
    });
    expect(JSON.stringify(payload)).not.toContain(CIRCLE_TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every((call) => call[1]?.method === "GET")).toBe(true);
  });

  it("marks a full webhook event page as limited rather than complete", async () => {
    const projectId = "123e4567-e89b-42d3-a456-426614174010";
    const events = Array.from({ length: 20 }, (_, index) => ({
      cursor: 20 - index,
      id: "3888f21b-eaa7-38e3-8f3d-" + (20 - index).toString(16).padStart(12, "0"),
      type: "workflow-completed",
      happened_at: "2026-11-18T08:00:00.000Z",
      project_slug: "gh/Znect-god/znect-forge"
    }));
    const namespace = {
      idFromName: () => "forge",
      get: () => ({
        fetch: async () => Response.json({ events, next_cursor: 20 })
      })
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        data: [{ id: projectId, attributes: { slug: "gh/Znect-god/znect-forge" } }]
      }))
      .mockResolvedValueOnce(Response.json({ data: [], page: { next: null } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(new Request(
      "https://bridge.example/api/v1/report?project_id=znect-forge&event_limit=20",
      { headers: { authorization: "Bearer web-test-token" } }
    ), { ...env, EVENT_STORE: namespace } as Parameters<typeof worker.fetch>[1], ctx);
    const payload = await response.json() as {
      events?: { returned?: number };
      completeness?: { events_limited?: boolean };
    };

    expect(response.status).toBe(200);
    expect(payload.events?.returned).toBe(20);
    expect(payload.completeness?.events_limited).toBe(true);
  });

  it("returns a usable partial report when webhook event storage is unavailable", async () => {
    const namespace = {
      idFromName: () => "forge",
      get: () => ({ fetch: async () => { throw new Error("private storage detail"); } })
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: "123e4567-e89b-42d3-a456-426614174010", attributes: { slug: "gh/Znect-god/znect-forge" } }]
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [], page: { next: null } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(new Request(
      "https://bridge.example/api/v1/report?project_id=znect-forge",
      { headers: { authorization: "Bearer web-test-token" } }
    ), { ...env, EVENT_STORE: namespace } as Parameters<typeof worker.fetch>[1], ctx);
    const payload = await response.json() as {
      provider_status?: string;
      events?: { available?: boolean; error?: string };
      completeness?: { events_available?: boolean };
      correlations?: unknown[];
    };

    expect(response.status).toBe(200);
    expect(payload.provider_status).toBe("available");
    expect(payload.events).toMatchObject({
      available: false,
      error: "CircleCI webhook event history is temporarily unavailable."
    });
    expect(payload.completeness?.events_available).toBe(false);
    expect(payload.correlations).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain("private storage detail");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not accept the MCP credential as a Browser API credential", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(new Request(
      "https://bridge.example/api/v1/report?project_id=znect-forge",
      { headers: { authorization: "Bearer " + MCP_TOKEN } }
    ), env, ctx);

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-GET Browser API methods even with a valid web token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(new Request(
      "https://bridge.example/api/v1/report?project_id=znect-forge",
      { method: "POST", headers: { authorization: "Bearer web-test-token" }, body: "{}" }
    ), env, ctx);

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the report behind Browser API bearer authentication", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(new Request(
      "https://bridge.example/api/v1/report?project_id=znect-forge"
    ), env, ctx);

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("MCP tool schemas and error boundary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("publishes bounded, typed input schemas for diagnostic tools", async () => {
    const response = await worker.fetch(
      rpcRequest(1, "tools/list"),
      env,
      ctx
    );
    expect(response.status).toBe(200);
    const payload = await parseRpc(response);
    const tools = payload.result?.tools as Array<{
      name: string;
      annotations?: { readOnlyHint?: boolean };
      inputSchema?: {
        type?: string;
        properties?: Record<string, { type?: string; maximum?: number; minimum?: number; enum?: string[] }>;
      };
    }>;
    expect(tools).toHaveLength(15);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(tools.map((tool) => tool.name)).toContain("list_recent_events");
    expect(tools.map((tool) => tool.name)).toContain("correlate_recent_events");
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    for (const name of ["check_connection", "list_recent_builds", "get_build_details", "get_build_logs", "list_recent_runs", "get_run_details", "get_job_details", "get_job_logs", "get_job_test_results", "list_job_artifacts", "get_job_artifact", "diagnose_run", "correlate_recent_events"]) {
      expect(byName[name].inputSchema?.properties?.project_id).toMatchObject({ type: "string" });
    }
    expect(byName.get_job_logs.inputSchema).toMatchObject({
      type: "object",
      properties: {
        step_num: { type: "integer", minimum: 0 },
        execution: { type: "integer", minimum: 0 },
        stream: { enum: ["stdout", "stderr"] },
        max_chars: { type: "integer", minimum: 1, maximum: 80_000 }
      }
    });
    expect(byName.get_job_artifact.inputSchema).toMatchObject({
      type: "object",
      properties: {
        artifact_path: { type: "string" },
        execution: { type: "integer", minimum: 0 }
      }
    });
    expect(byName.get_run_details.inputSchema?.properties?.run_id).toMatchObject({
      type: "string",
      format: "uuid"
    });
    expect(byName.correlate_recent_events.inputSchema?.properties?.event_limit).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 50
    });
    expect(byName.correlate_recent_events.inputSchema?.properties?.run_limit).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 30
    });
    expect(tools.some((tool) => /^(start|rerun|retry|cancel|deploy|trigger)_/i.test(tool.name))).toBe(false);
  });

  it("uses the correct parallel execution index when diagnose_run retrieves failed-step logs", async () => {
    const projectId = "123e4567-e89b-42d3-a456-426614174010";
    const workflowId = "123e4567-e89b-42d3-a456-426614174012";
    const jobId = "123e4567-e89b-42d3-a456-426614174013";
    const jobList = Array.from({ length: 41 }, (_, index) => ({
      id: index === 0 ? jobId : `123e4567-e89b-42d3-a456-${String(1000 + index).padStart(12, "0")}`,
      references: { project: { id: projectId }, workflow: { id: workflowId } },
      attributes: {
        name: index === 0 ? "unit-tests" : `passing-job-${index}`,
        phase: "completed",
        outcome: index === 0 ? "failed" : "success"
      }
    }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v3/projects") {
        return Response.json({ data: [{ id: projectId, attributes: { slug: "gh/Znect-god/znect-forge" } }] });
      }
      if (url.pathname === "/api/v3/runs") {
        return Response.json({ data: [{ id: RUN_ID, references: { project: { id: projectId } } }], page: { next: null } });
      }
      if (url.pathname === `/api/v3/runs/${RUN_ID}`) {
        return Response.json({ data: { id: RUN_ID, references: { project: { id: projectId } }, attributes: { current_outcome: "failed", phase: "ended" } } });
      }
      if (url.pathname === "/api/v3/workflows") {
        return Response.json({ data: [{ id: workflowId, references: { run: { id: RUN_ID } }, attributes: { name: "build-and-test" } }], page: { next: null } });
      }
      if (url.pathname === "/api/v3/jobs") return Response.json({ data: jobList });
      if (url.pathname === `/api/v3/jobs/${jobId}`) {
        return Response.json({ data: {
          id: jobId,
          references: { project: { id: projectId }, workflow: { id: workflowId } },
          attributes: {
            name: "unit-tests",
            parallel_executions: [
              [{ name: "worker zero", num: 2, phase: "completed", type: "run", outcome: "success" }],
              [{ name: "worker one failed", num: 7, phase: "completed", type: "run", outcome: "failed", exit_code: 1 }]
            ]
          }
        } });
      }
      if (url.pathname === `/api/v3/jobs/${jobId}/stdout` || url.pathname === `/api/v3/jobs/${jobId}/stderr`) {
        return new Response("parallel worker output", { status: 200 });
      }
      if (url.pathname === `/api/v3/jobs/${jobId}/tests`) return new Response(null, { status: 204 });
      if (url.pathname === `/api/v3/jobs/${jobId}/artifacts`) return Response.json({ data: [] });
      throw new Error("Unexpected CircleCI request: " + url.pathname);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(rpcRequest(31, "tools/call", {
      name: "diagnose_run",
      arguments: { project_id: "znect-forge", run_id: RUN_ID }
    }), env, ctx);
    const payload = await parseRpc(response);
    expect(payload.result?.isError).not.toBe(true);
    const result = JSON.parse(payload.result.content[0].text);
    const failedJob = result.workflows[0].failed_jobs[0];

    expect(failedJob.failed_steps).toMatchObject([{
      execution_index: 1,
      actions: [{ step_num: 7, status: "failed" }]
    }]);
    expect(failedJob.failed_step_logs).toMatchObject([{
      step_num: 7,
      execution: 1,
      stdout: "parallel worker output",
      stderr: "parallel worker output"
    }]);
    expect(result.workflows[0]).toMatchObject({
      jobs_total: 41,
      jobs_inspected: 40,
      jobs_truncated: true,
      failed_jobs_total: null,
      failed_jobs_observed: 1,
      failed_jobs_diagnostics_returned: 1,
      failed_jobs_diagnostics_truncated: false
    });
    const logRequests = fetchMock.mock.calls.filter(([input]) => {
      const url = new URL(String(input));
      return url.pathname.endsWith("/stdout") || url.pathname.endsWith("/stderr");
    });
    expect(logRequests).toHaveLength(2);
    expect(logRequests.every(([input]) => new URL(String(input)).searchParams.get("filter[execution]") === "1")).toBe(true);
  });

  it("reports a safe MCP error when the event inbox Durable Object fails", async () => {
    const namespace = {
      idFromName: () => "forge",
      get: () => ({ fetch: async () => { throw new Error("private storage detail"); } })
    };
    const response = await worker.fetch(
      rpcRequest(22, "tools/call", {
        name: "list_recent_events",
        arguments: { project_id: "znect-forge", after: 0, limit: 20 }
      }),
      { ...env, ZNECT_PROJECT_REGISTRY: TEST_REGISTRY, EVENT_STORE: namespace } as Parameters<typeof worker.fetch>[1],
      ctx
    );
    expect(response.status).toBe(200);
    const payload = await parseRpc(response);
    expect(payload.result?.isError).toBe(true);
    expect(JSON.stringify(payload)).toContain("CircleCI event storage is temporarily unavailable or returned invalid data.");
    expect(JSON.stringify(payload)).not.toContain("private storage detail");
  });

  it("fails safely when correlation cannot read the event inbox", async () => {
    const namespace = {
      idFromName: () => "forge",
      get: () => ({ fetch: async () => { throw new Error("private storage detail"); } })
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(
      rpcRequest(23, "tools/call", {
        name: "correlate_recent_events",
        arguments: { project_id: "znect-forge", event_limit: 20, run_limit: 20 }
      }),
      { ...env, ZNECT_PROJECT_REGISTRY: TEST_REGISTRY, EVENT_STORE: namespace } as Parameters<typeof worker.fetch>[1],
      ctx
    );
    expect(response.status).toBe(200);
    const payload = await parseRpc(response);
    expect(payload.result?.isError).toBe(true);
    expect(JSON.stringify(payload)).toContain("CircleCI event storage is temporarily unavailable or returned invalid data.");
    expect(JSON.stringify(payload)).not.toContain("private storage detail");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid tool arguments before making an upstream request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(
      rpcRequest(2, "tools/call", {
        name: "get_run_details",
        arguments: { run_id: "not-a-uuid" }
      }),
      env,
      ctx
    );
    expect(response.status).toBe(200);
    const payload = await parseRpc(response);
    expect(payload.error || payload.result?.isError).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not expose raw CircleCI error bodies through MCP tool calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      "upstream-secret-diagnostic circle-test-token",
      { status: 403 }
    ));
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(
      rpcRequest(3, "tools/call", {
        name: "get_run_details",
        arguments: { run_id: RUN_ID }
      }),
      env,
      ctx
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("CircleCI API v3 authorization failed (HTTP 403)");
    expect(body).not.toContain("upstream-secret-diagnostic");
    expect(body).not.toContain(CIRCLE_TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "GET",
      headers: { Authorization: "Bearer " + CIRCLE_TOKEN },
      redirect: "manual"
    });
  });
});


describe("Worker transport and fail-closed rate limiting", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects authenticated browser API mutations with an explicit GET-only response", async () => {
    const response = await worker.fetch(
      new Request("https://bridge.example/api/v1/runs", {
        method: "POST",
        headers: { authorization: "Bearer web-test-token" },
        body: JSON.stringify({ action: "rerun" })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(await response.text()).toBe("Method not allowed");
  });

  it("fails closed when the authenticated MCP rate limit is exhausted", async () => {
    const limitedEnv = {
      ...env,
      MCP_RATE_LIMITER: { limit: async () => ({ success: false }) }
    };
    const response = await worker.fetch(rpcRequest(10, "tools/list"), limitedEnv, ctx);

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: "Rate limit exceeded. Retry after the current window."
    });
  });

  it("fails closed when the rate-limit service throws", async () => {
    const unavailableEnv = {
      ...env,
      MCP_RATE_LIMITER: { limit: async () => { throw new Error("internal limiter detail"); } }
    };
    const response = await worker.fetch(rpcRequest(11, "tools/list"), unavailableEnv, ctx);

    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("Rate limiting is temporarily unavailable.");
    expect(body).not.toContain("internal limiter detail");
  });

  it("rate-limits failed MCP authentication without reaching the MCP handler", async () => {
    const limitedEnv = {
      ...env,
      MCP_RATE_LIMITER: { limit: async () => ({ success: false }) }
    };
    const request = rpcRequest(12, "tools/list");
    request.headers.set("authorization", "Bearer invalid-token");
    const response = await worker.fetch(request, limitedEnv, ctx);

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: "Too many failed authentication attempts. Retry after the current window."
    });
  });

  it("fails closed when browser API rate limiting is exhausted", async () => {
    const limitedEnv = {
      ...env,
      MCP_RATE_LIMITER: { limit: async () => ({ success: false }) }
    };
    const response = await worker.fetch(
      new Request("https://bridge.example/api/v1/status", {
        headers: { authorization: "Bearer web-test-token" }
      }),
      limitedEnv,
      ctx
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: "Rate limit exceeded. Retry after the current window."
    });
  });
});


describe("legacy CircleCI v1.1 compatibility tools", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists legacy build numbers through the registered project's v1.1 endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { build_num: 42, status: "success", branch: "main", subject: "Release", vcs_revision: "abc123", build_url: "https://circleci.com/42", failed: false },
      { build_num: 41, status: "failed", branch: "work/fix", subject: "Fix", vcs_revision: "def456", failed: true }
    ]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(rpcRequest(20, "tools/call", {
      name: "list_recent_builds",
      arguments: { project_id: "znect-forge", limit: 2 }
    }), env, ctx);
    const payload = await parseRpc(response);
    const result = JSON.parse(payload.result.content[0].text);

    expect(result.builds).toHaveLength(2);
    expect(result.builds[0]).toMatchObject({ build_num: 42, status: "success", branch: "main" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://circleci.com/api/v1.1/project/github/Znect-god/znect-forge?limit=2");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "GET",
      headers: { "Circle-Token": CIRCLE_TOKEN },
      redirect: "manual"
    });
  });

  it("retrieves legacy build details by numeric build number without calling API v3", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      build_num: 42,
      status: "failed",
      branch: "work/fix",
      subject: "Fix",
      vcs_revision: "abc123",
      build_url: "https://circleci.com/42",
      failed: true,
      steps: [{
        name: "Run tests",
        actions: [{ name: "vitest", status: "failed", exit_code: 1, has_output: true }]
      }]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(rpcRequest(21, "tools/call", {
      name: "get_build_details",
      arguments: { project_id: "znect-forge", build_num: 42 }
    }), env, ctx);
    const payload = await parseRpc(response);
    const result = JSON.parse(payload.result.content[0].text);

    expect(result).toMatchObject({
      build_num: 42,
      status: "failed",
      steps: [{ step_index: 0, name: "Run tests", actions: [{ name: "vitest", status: "failed", exit_code: 1, has_output: true }] }]
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://circleci.com/api/v1.1/project/github/Znect-god/znect-forge/42");
    expect(fetchMock.mock.calls[0][0]).not.toContain("/api/v3/");
  });

  it("retrieves bounded legacy action logs only from a CircleCI-provided allowlisted URL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        build_num: 42,
        steps: [{ name: "Run tests", actions: [{
          name: "vitest",
          status: "failed",
          has_output: true,
          output_url: "https://s3.amazonaws.com/znect-ci-logs/run-42.txt"
        }] }]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("test failed\n", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(rpcRequest(22, "tools/call", {
      name: "get_build_logs",
      arguments: { project_id: "znect-forge", build_num: 42, step_index: 0, max_actions: 1 }
    }), env, ctx);
    const payload = await parseRpc(response);
    const result = JSON.parse(payload.result.content[0].text);

    expect(result).toMatchObject({
      build_num: 42,
      actions: [{ step_index: 0, step_name: "Run tests", action_name: "vitest", output: "test failed\n" }]
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://circleci.com/api/v1.1/project/github/Znect-god/znect-forge/42");
    expect(fetchMock.mock.calls[1][0]).toBe("https://s3.amazonaws.com/znect-ci-logs/run-42.txt");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "GET", redirect: "manual" });
  });

  it("rejects legacy build log URLs outside the artifact allowlist without fetching them", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      build_num: 42,
      steps: [{ name: "Run tests", actions: [{
        name: "vitest",
        has_output: true,
        output_url: "https://attacker.example/collect"
      }] }]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(rpcRequest(23, "tools/call", {
      name: "get_build_logs",
      arguments: { project_id: "znect-forge", build_num: 42 }
    }), env, ctx);
    const payload = await parseRpc(response);
    const result = JSON.parse(payload.result.content[0].text);

    expect(result.actions).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
