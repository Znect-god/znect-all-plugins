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
    expect(tools).toHaveLength(12);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);

    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
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
