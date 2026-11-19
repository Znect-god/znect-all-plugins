import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const PROJECT_UUID = "123e4567-e89b-42d3-a456-426614174000";
const RUN_UUID = "123e4567-e89b-42d3-a456-426614174001";
const EVENT_ID = "3888f21b-eaa7-4383-8f3d-75a63bba0001";
const REVISION = "b".repeat(40);
const MCP_TOKEN = "bridge-test-token";
const REGISTRY = JSON.stringify({
  version: 1,
  projects: [{
    id: "znect-forge",
    name: "Znect Forge",
    repositories: [{ fullName: "Znect-god/znect-forge" }],
    components: [],
    connections: [{ id: "forge-circleci", provider: "circleci", projectSlug: "gh/Znect-god/znect-forge" }]
  }]
});
const env = {
  CIRCLECI_TOKEN: "circle-test-token",
  MCP_ACCESS_TOKEN: MCP_TOKEN,
  WEB_ACCESS_TOKEN: "web-test-token",
  ZNECT_PROJECT_REGISTRY: REGISTRY,
  MCP_RATE_LIMITER: { limit: async () => ({ success: true }) }
};
const ctx = {} as ExecutionContext;

function rpcRequest(id: number) {
  return new Request("https://bridge.example/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer " + MCP_TOKEN,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "tools/call",
      "Mcp-Name": "correlate_recent_events"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: {
        name: "correlate_recent_events",
        arguments: { project_id: "znect-forge", event_limit: 5, run_limit: 5 },
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

afterEach(() => vi.unstubAllGlobals());

describe("MCP event correlation tool", () => {
  it("does not expose upstream CircleCI failures through MCP correlation", async () => {
    const eventStore = {
      idFromName: () => "forge",
      get: () => ({ fetch: async () => new Response(JSON.stringify({ events: [], next_cursor: 0 }), { status: 200 }) })
    };
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("upstream private token detail"); }));
    const response = await worker.fetch(
      rpcRequest(2),
      { ...env, EVENT_STORE: eventStore } as Parameters<typeof worker.fetch>[1],
      ctx
    );
    expect(response.status).toBe(200);
    const payload = await parseRpc(response);
    expect(payload.result?.isError).toBe(true);
    const output = JSON.stringify(payload.result?.content ?? []);
    expect(output).toContain("CircleCI run data is temporarily unavailable.");
    expect(output).not.toContain("upstream private token detail");
    expect(output).not.toContain("circle-test-token");
  });

  it("returns candidate API v3 runs for a signed webhook inbox event", async () => {
    const eventStore = {
      idFromName: () => "forge",
      get: () => ({
        fetch: async () => new Response(JSON.stringify({
          events: [{
            cursor: 1,
            id: EVENT_ID,
            type: "workflow-completed",
            project_slug: "gh/Znect-god/znect-forge",
            happened_at: "2026-11-17T18:00:30.000Z",
            branch: "work/bridge",
            revision: REVISION
          }],
          next_cursor: 1
        }), { status: 200 })
      })
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v3/projects") {
        return new Response(JSON.stringify({
          data: [{ id: PROJECT_UUID, attributes: { slug: "gh/Znect-god/znect-forge" } }]
        }), { status: 200 });
      }
      if (url.pathname === "/api/v3/runs") {
        return new Response(JSON.stringify({
          data: [{
            id: RUN_UUID,
            attributes: {
              phase: "completed",
              current_outcome: "success",
              created_at: "2026-11-17T17:59:00.000Z",
              ended_at: "2026-11-17T18:00:00.000Z"
            },
            references: {
              project: { id: PROJECT_UUID },
              event: { attributes: { vcs: { branch: "work/bridge", revision: REVISION } } }
            }
          }],
          page: { next: null }
        }), { status: 200 });
      }
      throw new Error("Unexpected CircleCI request: " + url.pathname);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      rpcRequest(1),
      { ...env, EVENT_STORE: eventStore } as Parameters<typeof worker.fetch>[1],
      ctx
    );
    expect(response.status).toBe(200);
    const payload = await parseRpc(response);
    expect(payload.result?.isError).not.toBe(true);
    const result = JSON.parse(payload.result.content[0].text);
    expect(result.correlations).toMatchObject([{
      event: { id: EVENT_ID, cursor: 1 },
      status: "candidate",
      candidates: [{ run: { id: RUN_UUID, commitSha: REVISION }, time_delta_ms: 30_000 }]
    }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
