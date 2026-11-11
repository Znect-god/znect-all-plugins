import { describe, expect, it } from "vitest";
import worker from "../src/index";

const env = {
  CIRCLECI_TOKEN: "circle-test-token",
  MCP_ACCESS_TOKEN: "bridge-test-token",
  MCP_RATE_LIMITER: {
    limit: async () => ({ success: true })
  }
};
const ctx = {} as ExecutionContext;

describe("Worker HTTP boundary", () => {
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
});
