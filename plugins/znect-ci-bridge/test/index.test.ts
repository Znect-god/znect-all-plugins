import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const MCP_TOKEN = "bridge-test-token";
const CIRCLE_TOKEN = "circle-test-token";
const RUN_ID = "123e4567-e89b-42d3-a456-426614174001";
const env = {
  CIRCLECI_TOKEN: CIRCLE_TOKEN,
  MCP_ACCESS_TOKEN: MCP_TOKEN,
  WEB_ACCESS_TOKEN: "web-test-token",
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
    expect(tools).toHaveLength(13);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(tools.map((tool) => tool.name)).toContain("list_recent_events");

    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    for (const name of ["check_connection", "list_recent_builds", "get_build_details", "get_build_logs", "list_recent_runs", "get_run_details", "get_job_details", "get_job_logs", "get_job_test_results", "list_job_artifacts", "get_job_artifact", "diagnose_run"]) {
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
    expect(byName.get_run_details.inputSchema?.properties?.run_id).toMatchObject({
      type: "string",
      format: "uuid"
    });
    expect(tools.some((tool) => /^(start|rerun|retry|cancel|deploy|trigger)_/i.test(tool.name))).toBe(false);
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
      actions: [{ step_index: 0, step_name: "Run tests", action_name: "vitest", output: "test failed\\n" }]
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
