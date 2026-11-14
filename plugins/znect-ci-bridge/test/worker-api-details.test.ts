import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const env = {
  CIRCLECI_TOKEN: "circle-test-token",
  MCP_ACCESS_TOKEN: "bridge-test-token",
  WEB_ACCESS_TOKEN: "web-test-token",
  MCP_RATE_LIMITER: { limit: async () => ({ success: true }) }
};
const ctx = {} as ExecutionContext;
const runId = "123e4567-e89b-42d3-a456-426614174001";
const workflowId = "123e4567-e89b-42d3-a456-426614174002";
const jobId = "123e4567-e89b-42d3-a456-426614174003";

afterEach(() => vi.unstubAllGlobals());

describe("Read-only browser API run details", () => {
  it("returns a run with workflow and job resources using GET-only upstream requests", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer circle-test-token");

      if (url.pathname === `/api/v3/runs/${runId}`) {
        return new Response(JSON.stringify({
          data: { id: runId, attributes: { status: "success", pipeline_number: 42 } }
        }), { status: 200 });
      }
      if (url.pathname === "/api/v3/workflows") {
        return new Response(JSON.stringify({
          data: [{ id: workflowId, attributes: { name: "build-and-test", status: "success" } }],
          page: { next: null }
        }), { status: 200 });
      }
      if (url.pathname === "/api/v3/jobs") {
        return new Response(JSON.stringify({
          data: [{ id: jobId, attributes: { name: "unit-tests", status: "success" } }],
          page: { next: null }
        }), { status: 200 });
      }
      throw new Error("Unexpected upstream request.");
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
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      run: { id: runId, attributes: { status: "success" } },
      workflows: [{
        workflow: { id: workflowId, attributes: { name: "build-and-test" } },
        jobs: [{ id: jobId, attributes: { name: "unit-tests" } }],
        jobs_total: 1
      }],
      diagnostics_summary: {
        workflows_total: 1,
        workflows_inspected: 1,
        workflows_truncated: false,
        incomplete: false
      },
      limits: { max_workflows: 10, max_jobs_per_workflow: 40 }
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns a sanitized upstream error when CircleCI rejects run-detail access", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "private upstream detail" }), { status: 401 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request(`https://bridge.example/api/v1/runs/${runId}`, {
        headers: { authorization: "Bearer web-test-token" }
      }),
      env,
      ctx
    );

    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).toContain("CircleCI API v3 authentication failed (HTTP 401)");
    expect(body).not.toContain("private upstream detail");
    expect(body).not.toContain(env.CIRCLECI_TOKEN);
    expect(body).not.toContain(env.WEB_ACCESS_TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns bounded failed-step logs and test results through the authenticated diagnostics API", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer circle-test-token");

      if (url.pathname === \`/api/v3/runs/\${runId}\`) {
        return new Response(JSON.stringify({
          data: { id: runId, attributes: { status: "failed", pipeline_number: 43 } }
        }), { status: 200 });
      }
      if (url.pathname === "/api/v3/workflows") {
        return new Response(JSON.stringify({
          data: [{ id: workflowId, attributes: { name: "build-and-test", status: "failed" } }],
          page: { next: null }
        }), { status: 200 });
      }
      if (url.pathname === "/api/v3/jobs") {
        return new Response(JSON.stringify({
          data: [{ id: jobId, attributes: { name: "unit-tests", outcome: "failed" } }],
          page: { next: null }
        }), { status: 200 });
      }
      if (url.pathname === \`/api/v3/jobs/\${jobId}\`) {
        return new Response(JSON.stringify({
          data: {
            id: jobId,
            attributes: {
              name: "unit-tests",
              parallel_executions: [{
                execution: 0,
                steps: [{
                  name: "Run tests",
                  actions: [{ name: "npm test", status: "failed", exit_code: 1, step_num: 0 }]
                }]
              }]
            }
          }
        }), { status: 200 });
      }
      if (url.pathname === \`/api/v3/jobs/\${jobId}/stdout\`) {
        return new Response("Authorization: Bearer web-test-token\nAssertionError: expected 1 to equal 2", { status: 200 });
      }
      if (url.pathname === \`/api/v3/jobs/\${jobId}/stderr\`) {
        return new Response("Test suite failed", { status: 200 });
      }
      if (url.pathname === \`/api/v3/jobs/\${jobId}/tests\`) {
        return new Response('{"name":"sample test","result":"failure"}\n', { status: 200 });
      }
      if (url.pathname === \`/api/v3/jobs/\${jobId}/artifacts\`) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      throw new Error("Unexpected upstream request: " + url.pathname);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request(\`https://bridge.example/api/v1/diagnostics/\${runId}\`, {
        headers: { authorization: "Bearer web-test-token" }
      }),
      env,
      ctx
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("AssertionError");
    expect(body).toContain("Test suite failed");
    expect(body).toContain("sample test");
    expect(body).toContain("[REDACTED]");
    expect(body).not.toContain("web-test-token");
    expect(body).toContain('"incomplete":false');
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("returns 404 for unknown API paths without contacting CircleCI", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://bridge.example/api/v1/unknown", {
        headers: { authorization: "Bearer web-test-token" }
      }),
      env,
      ctx
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
