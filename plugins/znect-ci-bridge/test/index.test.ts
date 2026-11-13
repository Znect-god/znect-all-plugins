import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const MCP_TOKEN = "mcp-test-token";
const WEB_TOKEN = "web-test-token";
const CIRCLE_TOKEN = "circle-test-token";

function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    CIRCLECI_TOKEN: CIRCLE_TOKEN,
    MCP_ACCESS_TOKEN: MCP_TOKEN,
    WEB_ACCESS_TOKEN: WEB_TOKEN,
    MCP_RATE_LIMITER: {
      limit: vi.fn().mockResolvedValue({ success: true })
    },
    ...overrides
  };
}

function request(path: string, method = "GET", token?: string) {
  return new Request("https://bridge.test" + path, {
    method,
    headers: token ? { authorization: "Bearer " + token } : {}
  });
}

async function fetchWorker(
  req: Request,
  env = makeEnv()
) {
  return worker.fetch(req, env as never, {} as ExecutionContext);
}

describe("Worker HTTP boundary and browser read-only API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("serves health without credentials and marks the service read-only", async () => {
    const response = await fetchWorker(request("/health"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      service: "znect-ci-bridge",
      status: "ok",
      mode: "read-only"
    });
  });

  it("rejects browser API requests without a valid bearer token", async () => {
    const response = await fetchWorker(request("/api/v1/status"), makeEnv());
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    expect(await response.text()).toBe("Unauthorized");
  });

  it("rate-limits failed browser authentication without calling CircleCI", async () => {
    const env = makeEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await fetchWorker(request("/api/v1/status", "GET", "wrong-token"), env);
    expect(response.status).toBe(401);
    expect(env.MCP_RATE_LIMITER.limit).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 429 when failed-authentication rate limiting blocks a request", async () => {
    const env = makeEnv({
      MCP_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: false }) }
    });
    const response = await fetchWorker(request("/api/v1/status", "GET", "wrong-token"), env);
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Too many failed") });
  });

  it("allows only GET on the authenticated browser API", async () => {
    const response = await fetchWorker(request("/api/v1/status", "POST", WEB_TOKEN));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });

  it("validates run limits before making upstream requests", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await fetchWorker(request("/api/v1/runs?limit=31", "GET", WEB_TOKEN));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "limit must be an integer between 1 and 30." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed run IDs before making upstream requests", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await fetchWorker(request("/api/v1/runs/not-a-uuid", "GET", WEB_TOKEN));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "A valid CircleCI run UUID is required." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown browser API routes after authentication", async () => {
    const response = await fetchWorker(request("/api/v1/unknown", "GET", WEB_TOKEN));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "API route not found." });
  });

  it("does not expose the browser API when required secrets are absent", async () => {
    const response = await fetchWorker(request("/api/v1/status", "GET", WEB_TOKEN), makeEnv({
      CIRCLECI_TOKEN: ""
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "Web access secrets are not configured." });
  });
});
