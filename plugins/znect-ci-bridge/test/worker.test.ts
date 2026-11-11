import { describe, expect, it } from "vitest";
import worker from "../src/index";

const env = {
  CIRCLECI_TOKEN: "circle-test-token",
  MCP_ACCESS_TOKEN: "bridge-test-token"
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
