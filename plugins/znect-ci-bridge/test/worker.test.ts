import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const env = {
  CIRCLECI_TOKEN: "circle-test-token",
  MCP_ACCESS_TOKEN: "bridge-test-token",
  WEB_ACCESS_TOKEN: "web-test-token",
  CIRCLECI_WEBHOOK_SECRET: "webhook-test-secret",
  EVENT_STORE: { idFromName: () => "forge", get: () => ({ fetch: async () => Response.json({ events: [], next_cursor: 0 }) }) },
  MCP_RATE_LIMITER: {
    limit: async () => ({ success: true })
  }
};
const ctx = {} as ExecutionContext;

async function circleCiSignature(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return "v1=" + Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

afterEach(() => vi.unstubAllGlobals());

describe("Worker HTTP boundary", () => {
  it("accepts a signed CircleCI workflow event and stores only the normalized Forge event", async () => {
    const payload = {
      id: "3888f21b-eaa7-38e3-8f3d-75a63bba8895",
      type: "workflow-completed",
      happened_at: new Date().toISOString(),
      project: { slug: "gh/Znect-god/znect-forge" },
      workflow: {
        id: "fda08377-fe7e-46b1-8992-3a7aaecac9c3",
        name: "build-test",
        status: "failed",
        url: "https://app.circleci.com/pipelines/github/Znect-god/znect-forge/1/workflows/fda08377-fe7e-46b1-8992-3a7aaecac9c3"
      },
      pipeline: {
        id: "1285fe1d-d3a6-44fc-8886-8979558254c4",
        number: 130,
        vcs: { branch: "work/0.7.0", revision: "a".repeat(40), commit: { subject: "Fix tests" } }
      }
    };
    const body = JSON.stringify(payload);
    const storeFetch = vi.fn().mockResolvedValue(Response.json({ accepted: true, duplicate: false }));
    const namespace = { idFromName: vi.fn(() => "forge"), get: vi.fn(() => ({ fetch: storeFetch })) };
    const response = await worker.fetch(
      new Request("https://bridge.example/webhooks/circleci", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-type": "application/json",
          "circleci-event-type": "workflow-completed",
          "circleci-signature": await circleCiSignature(body, "webhook-test-secret")
        },
        body
      }),
      { ...env, EVENT_STORE: namespace },
      ctx
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ accepted: true, duplicate: false });
    expect(storeFetch).toHaveBeenCalledTimes(1);
    const forwarded = JSON.parse(storeFetch.mock.calls[0][1].body);
    expect(forwarded).toMatchObject({
      id: payload.id,
      project_slug: "gh/Znect-god/znect-forge",
      workflow_status: "failed",
      branch: "work/0.7.0"
    });
    expect(JSON.stringify(forwarded)).not.toContain("author.email");
  });

  it("rejects unsigned or invalid CircleCI webhook requests", async () => {
    const response = await worker.fetch(
      new Request("https://bridge.example/webhooks/circleci", {
        method: "POST",
        headers: { "content-type": "application/json", "circleci-event-type": "workflow-completed", "circleci-signature": "v1=" + "0".repeat(64) },
        body: "{}"
      }),
      env,
      ctx
    );
    expect(response.status).toBe(401);
  });

  it("ignores a correctly signed webhook for another project", async () => {
    const body = JSON.stringify({
      id: "3888f21b-eaa7-38e3-8f3d-75a63bba8895",
      type: "workflow-completed",
      happened_at: new Date().toISOString(),
      project: { slug: "gh/other/project" }
    });
    const storeFetch = vi.fn();
    const namespace = { idFromName: vi.fn(() => "forge"), get: vi.fn(() => ({ fetch: storeFetch })) };
    const response = await worker.fetch(
      new Request("https://bridge.example/webhooks/circleci", {
        method: "POST",
        headers: {
          "circleci-event-type": "workflow-completed",
          "circleci-signature": await circleCiSignature(body, "webhook-test-secret")
        },
        body
      }),
      { ...env, EVENT_STORE: namespace },
      ctx
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ accepted: true, ignored: true });
    expect(storeFetch).not.toHaveBeenCalled();
  });

  it("serves the authenticated event inbox through the browser API", async () => {
    const event = { id: "3888f21b-eaa7-38e3-8f3d-75a63bba8895", type: "workflow-completed", workflow_status: "failed" };
    const storeFetch = vi.fn().mockResolvedValue(Response.json({ events: [{ cursor: 7, ...event }], next_cursor: 7 }));
    const namespace = { idFromName: vi.fn(() => "forge"), get: vi.fn(() => ({ fetch: storeFetch })) };
    const response = await worker.fetch(
      new Request("https://bridge.example/api/v1/events?after=3&limit=10", {
        headers: { authorization: "Bearer web-test-token" }
      }),
      { ...env, EVENT_STORE: namespace },
      ctx
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ events: [{ cursor: 7, id: event.id }], next_cursor: 7 });
    expect(String(storeFetch.mock.calls[0][0])).toContain("after=3&limit=10");
  });

  it("serves a minimal health response without exposing secrets", async () => {
    const response = await worker.fetch(
      new Request("https://bridge.example/health"),
      env,
      ctx
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      service: "znect-ci-bridge",
      status: "ok",
      mode: "read-only"
    });
  });

  it("rejects an incorrect Bearer token before entering the MCP handler", async () => {
    const response = await worker.fetch(
      new Request("https://bridge.example/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer incorrect-token",
          "content-type": "application/json"
        },
        body: "{}"
      }),
      env,
      ctx
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("rate limits failed MCP and browser authentication attempts by hashed client IP", async () => {
    const limiter = { limit: vi.fn(async () => ({ success: false })) };
    const mcpResponse = await worker.fetch(
      new Request("https://bridge.example/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer wrong-mcp-token",
          "cf-connecting-ip": "203.0.113.10"
        },
        body: "{}"
      }),
      { ...env, MCP_RATE_LIMITER: limiter },
      ctx
    );
    const webResponse = await worker.fetch(
      new Request("https://bridge.example/api/v1/status", {
        headers: {
          authorization: "Bearer wrong-web-token",
          "cf-connecting-ip": "203.0.113.10"
        }
      }),
      { ...env, MCP_RATE_LIMITER: limiter },
      ctx
    );

    expect(mcpResponse.status).toBe(429);
    expect(webResponse.status).toBe(429);
    expect(limiter.limit).toHaveBeenCalledTimes(2);
    const keys = limiter.limit.mock.calls.map((call) => call[0].key);
    expect(keys[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[0]).not.toContain("203.0.113.10");
  });

  it("rejects MCP requests when the rate limiter is missing", async () => {
    const response = await worker.fetch(
      new Request("https://bridge.example/mcp", {
        method: "POST",
        headers: { authorization: "Bearer bridge-test-token" },
        body: "{}"
      }),
      { CIRCLECI_TOKEN: "circle-test-token", MCP_ACCESS_TOKEN: "bridge-test-token" } as typeof env,
      ctx
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "Rate limiting is not configured."
    });
  });

  it("fails closed when the rate-limit service is unavailable", async () => {
    const limiter = { limit: async () => { throw new Error("backend unavailable"); } };
    const response = await worker.fetch(
      new Request("https://bridge.example/mcp", {
        method: "PATCH",
        headers: { authorization: "Bearer bridge-test-token" }
      }),
      { ...env, MCP_RATE_LIMITER: limiter },
      ctx
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "Rate limiting is temporarily unavailable."
    });
  });

  it("returns 429 when the authenticated token exceeds its rate limit", async () => {
    const limiter = { limit: vi.fn(async () => ({ success: false })) };
    const response = await worker.fetch(
      new Request("https://bridge.example/mcp", {
        method: "PATCH",
        headers: { authorization: "Bearer bridge-test-token" }
      }),
      { ...env, MCP_RATE_LIMITER: limiter },
      ctx
    );
    expect(response.status).toBe(429);
    expect(limiter.limit).toHaveBeenCalledTimes(1);
    expect(limiter.limit.mock.calls[0][0].key).not.toBe(env.MCP_ACCESS_TOKEN);
    expect(limiter.limit.mock.calls[0][0].key).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects unsupported HTTP methods after authentication", async () => {
    const response = await worker.fetch(
      new Request("https://bridge.example/mcp", {
        method: "PATCH",
        headers: { authorization: "Bearer bridge-test-token" }
      }),
      env,
      ctx
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST, DELETE");
  });

  it("reports missing Worker secrets without entering the MCP handler", async () => {
    const response = await worker.fetch(
      new Request("https://bridge.example/mcp", {
        method: "POST",
        headers: { authorization: "Bearer bridge-test-token" },
        body: "{}"
      }),
      { CIRCLECI_TOKEN: "", MCP_ACCESS_TOKEN: "" },
      ctx
    );
    expect(response.status).toBe(503);
  });
  it("rejects requests without the dedicated web Bearer token", async () => {
    const response = await worker.fetch(
      new Request("https://bridge.example/api/v1/runs", {
        headers: { authorization: "Bearer incorrect-token" }
      }),
      env,
      ctx
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("does not accept the MCP token as a browser API credential", async () => {
    const response = await worker.fetch(
      new Request("https://bridge.example/api/v1/status", {
        headers: { authorization: "Bearer bridge-test-token" }
      }),
      env,
      ctx
    );
    expect(response.status).toBe(401);
  });

  it("rejects unsupported methods on the read-only JSON API", async () => {
    const response = await worker.fetch(
      new Request("https://bridge.example/api/v1/runs", {
        method: "POST",
        headers: { authorization: "Bearer web-test-token" }
      }),
      env,
      ctx
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });

  it("validates API run limits and UUIDs before contacting CircleCI", async () => {
    const invalidLimit = await worker.fetch(
      new Request("https://bridge.example/api/v1/runs?limit=31", {
        headers: { authorization: "Bearer web-test-token" }
      }),
      env,
      ctx
    );
    expect(invalidLimit.status).toBe(400);

    const invalidUuid = await worker.fetch(
      new Request("https://bridge.example/api/v1/runs/not-a-uuid", {
        headers: { authorization: "Bearer web-test-token" }
      }),
      env,
      ctx
    );
    expect(invalidUuid.status).toBe(400);
  });

  it("fails closed for JSON API requests when rate limiting is unavailable", async () => {
    const response = await worker.fetch(
      new Request("https://bridge.example/api/v1/runs", {
        headers: { authorization: "Bearer web-test-token" }
      }),
      { CIRCLECI_TOKEN: "circle-test-token", MCP_ACCESS_TOKEN: "bridge-test-token", WEB_ACCESS_TOKEN: "web-test-token" } as typeof env,
      ctx
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "Rate limiting is not configured."
    });
  });

  it("serves the standalone dashboard with restrictive browser security headers", async () => {
    const response = await worker.fetch(
      new Request("https://bridge.example/"),
      env,
      ctx
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'self'");
    const html = await response.text();
    expect(html).toContain("Znect CI Bridge");
    expect(html).toContain("/api/v1/status");
    expect(html).toContain("not saved to browser storage");
  });

  it("returns CircleCI connection status through the authenticated API", async () => {
    const projectId = "123e4567-e89b-42d3-a456-426614174000";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: projectId, attributes: { slug: "gh/Znect-god/znect-forge" } }]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(
      new Request("https://bridge.example/api/v1/status", {
        headers: { authorization: "Bearer web-test-token" }
      }),
      env,
      ctx
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      connected: true,
      permissions: "read-only",
      project: { id: projectId, slug: "gh/Znect-god/znect-forge" }
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns recent CircleCI runs through the authenticated API", async () => {
    const projectId = "123e4567-e89b-42d3-a456-426614174000";
    const runId = "123e4567-e89b-42d3-a456-426614174001";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: projectId, attributes: { slug: "gh/Znect-god/znect-forge" } }]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: runId, attributes: { status: "success" } }],
        page: { next: null }
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(
      new Request("https://bridge.example/api/v1/runs?limit=5", {
        headers: { authorization: "Bearer web-test-token" }
      }),
      env,
      ctx
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      project: { id: projectId },
      runs: [{ id: runId, attributes: { status: "success" } }]
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bounds browser run details to ten workflows and two job pages per workflow", async () => {
    const runId = "123e4567-e89b-42d3-a456-426614174001";
    const workflowIds = Array.from({ length: 11 }, (_, index) =>
      "123e4567-e89b-42d3-a456-" + String(index + 100).padStart(12, "0")
    );
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === `/api/v3/runs/${runId}`) {
        return new Response(JSON.stringify({ data: { id: runId, attributes: { status: "success" } } }), { status: 200 });
      }
      if (url.pathname === "/api/v3/workflows") {
        return new Response(JSON.stringify({
          data: workflowIds.map((id) => ({ id, attributes: { name: "workflow" } })),
          page: { next: null }
        }), { status: 200 });
      }
      if (url.pathname === "/api/v3/jobs") {
        const workflowId = url.searchParams.get("filter[workflow_id]")!;
        return new Response(JSON.stringify({
          data: [{ id: "123e4567-e89b-42d3-a456-426614174999", attributes: { status: "success", workflow_id: workflowId } }],
          page: { next: null }
        }), { status: 200 });
      }
      throw new Error("Unexpected CircleCI request.");
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request(`https://bridge.example/api/v1/runs/${runId}`, {
        headers: { authorization: "Bearer web-test-token" }
      }),
      env,
      ctx
    );
    expect(response.status).toBe(200);
    const body = await response.json() as {
      workflows: unknown[];
      diagnostics_summary: { workflows_total: number; workflows_inspected: number; workflows_truncated: boolean; incomplete: boolean };
      limits: { max_workflows: number; max_jobs_per_workflow: number };
    };
    expect(body.workflows).toHaveLength(10);
    expect(body.diagnostics_summary).toMatchObject({
      workflows_total: 11,
      workflows_inspected: 10,
      workflows_truncated: true,
      incomplete: true
    });
    expect(body.limits).toEqual({ max_workflows: 10, max_jobs_per_workflow: 40 });
    expect(fetchMock).toHaveBeenCalledTimes(12);
  });

  it("redacts configured credentials from browser API upstream errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(
      new Error("upstream transport failed: circle-test-token web-test-token bridge-test-token")
    ));
    const response = await worker.fetch(
      new Request("https://bridge.example/api/v1/status", {
        headers: { authorization: "Bearer web-test-token" }
      }),
      env,
      ctx
    );
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).not.toContain(env.CIRCLECI_TOKEN);
    expect(body).not.toContain(env.WEB_ACCESS_TOKEN);
    expect(body).not.toContain(env.MCP_ACCESS_TOKEN);
    expect(body).toContain("CircleCI API request failed due to a network or TLS error.");
  });

  it("completes an authenticated MCP initialize handshake over Streamable HTTP", async () => {
    const response = await worker.fetch(
      new Request("https://bridge.example/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer bridge-test-token",
          "content-type": "application/json",
          accept: "application/json, text/event-stream"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "znect-ci-bridge-test", version: "1.0.0" }
          }
        })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(200);
    const responseText = await response.text();
    const dataLine = responseText.split("\n").find((line) => line.startsWith("data:"));
    const payload = dataLine
      ? JSON.parse(dataLine.slice("data:".length).trim())
      : JSON.parse(responseText);
    expect(payload).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        serverInfo: { name: "znect-ci-bridge" },
        capabilities: { tools: expect.any(Object) }
      }
    });
    expect(response.headers.get("content-type")).toMatch(/application\/json|text\/event-stream/);
  });

  it("rejects untrusted and opaque Origin headers at the MCP transport boundary", async () => {
    for (const origin of ["https://attacker.example", "null", "file://"]) {
      const response = await worker.fetch(
        new Request("https://znect-ci-bridge.znect699.workers.dev/mcp", {
          method: "POST",
          headers: {
            authorization: "Bearer bridge-test-token",
            origin,
            "content-type": "application/json",
            accept: "application/json, text/event-stream"
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "origin-test", version: "1.0.0" }
            }
          })
        }),
        env,
        ctx
      );
      expect(response.status).toBe(403);
    }
  });


  it("supports stateless MCP server discovery for modern protocol clients", async () => {
    const response = await worker.fetch(
      new Request("https://bridge.example/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer bridge-test-token",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2026-07-28",
          "Mcp-Method": "server/discover"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "server/discover",
          params: {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientCapabilities": {},
              "io.modelcontextprotocol/clientInfo": { name: "znect-ci-bridge-test", version: "1.0.0" }
            }
          }
        })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(200);
    const responseText = await response.text();
    const dataLine = responseText.split("\n").find((line) => line.startsWith("data:"));
    const payload = dataLine
      ? JSON.parse(dataLine.slice("data:".length).trim())
      : JSON.parse(responseText);
    expect(payload).toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      result: {
        supportedVersions: expect.arrayContaining(["2026-07-28"]),
        capabilities: { tools: expect.any(Object) },
        resultType: "complete"
      }
    });
  });

  it("lists only read-only tools through the stateless MCP protocol", async () => {
    const response = await worker.fetch(
      new Request("https://bridge.example/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer bridge-test-token",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2026-07-28",
          "Mcp-Method": "tools/list"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/list",
          params: {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientCapabilities": {}
            }
          }
        })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(200);
    const responseText = await response.text();
    const dataLine = responseText.split("\n").find((line) => line.startsWith("data:"));
    const payload = dataLine
      ? JSON.parse(dataLine.slice("data:".length).trim())
      : JSON.parse(responseText);
    const tools = payload.result?.tools;
    expect(Array.isArray(tools)).toBe(true);
    expect(tools).toHaveLength(13);
    expect(tools.every((tool: { annotations?: { readOnlyHint?: boolean } }) =>
      tool.annotations?.readOnlyHint === true
    )).toBe(true);
    const names = tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain("check_connection");
    expect(names).toContain("list_recent_runs");
    expect(names).toContain("diagnose_run");
    expect(names).toContain("list_recent_events");
    expect(names.some((name: string) => /^(start|rerun|retry|cancel|deploy|trigger)_/i.test(name))).toBe(false);
  });

  it("executes stateless check_connection using only a CircleCI GET request", async () => {
    const projectId = "123e4567-e89b-42d3-a456-426614174000";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: projectId, attributes: { slug: "gh/Znect-god/znect-forge" } }]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://bridge.example/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer bridge-test-token",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2026-07-28",
          "Mcp-Method": "tools/call",
          "Mcp-Name": "check_connection"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            name: "check_connection",
            arguments: {},
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientCapabilities": {}
            }
          }
        })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(200);
    const responseText = await response.text();
    const dataLine = responseText.split("\n").find((line) => line.startsWith("data:"));
    const payload = dataLine
      ? JSON.parse(dataLine.slice("data:".length).trim())
      : JSON.parse(responseText);
    expect(payload.result?.content?.[0]?.text).toContain('"connected": true');
    expect(payload.result?.content?.[0]?.text).toContain('"permissions": "read-only"');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET", redirect: "manual" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("https://circleci.com/api/v3/projects?");
  });
});
