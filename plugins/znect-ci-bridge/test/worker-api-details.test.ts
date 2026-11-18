import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const TEST_REGISTRY = JSON.stringify({ version: 1, projects: [{ id: "znect-forge", name: "Znect Forge", repositories: [{ fullName: "Znect-god/znect-forge" }], components: [], connections: [{ id: "forge-circleci", provider: "circleci", projectSlug: "gh/Znect-god/znect-forge" }] }] });
const env = {
  CIRCLECI_TOKEN: "circle-test-token",
  MCP_ACCESS_TOKEN: "bridge-test-token",
  WEB_ACCESS_TOKEN: "web-test-token",
  ZNECT_PROJECT_REGISTRY: TEST_REGISTRY,
  MCP_RATE_LIMITER: { limit: async () => ({ success: true }) }
};
const ctx = {} as ExecutionContext;
const runId = "123e4567-e89b-42d3-a456-426614174001";
const workflowId = "123e4567-e89b-42d3-a456-426614174002";
const jobId = "123e4567-e89b-42d3-a456-426614174003";

afterEach(() => vi.unstubAllGlobals());

describe("Read-only browser API run details", () => {
  it("returns provider-neutral run summaries from the selected project's adapter", async () => {
    const projectId = "123e4567-e89b-42d3-a456-426614174000";
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(init?.method).toBe("GET");
      if (url.pathname === "/api/v3/projects") {
        return new Response(JSON.stringify({ data: [{ id: projectId, attributes: { slug: "gh/Znect-god/znect-forge" } }] }), { status: 200 });
      }
      if (url.pathname === "/api/v3/runs") {
        return new Response(JSON.stringify({
          data: [{
            id: runId,
            attributes: {
              phase: "completed",
              current_outcome: "failed",
              created_at: "2026-11-15T10:00:00Z"
            },
            references: {
              project: { id: "123e4567-e89b-42d3-a456-426614174000" },
              event: { attributes: { vcs: {
                branch: "feature/example",
                revision: "abc123",
                commit: { subject: "Fix CI diagnostics" }
              } } }
            }
          }],
          page: { next: null }
        }), { status: 200 });
      }
      throw new Error("Unexpected upstream request: " + url.pathname);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://bridge.example/api/v1/runs?limit=5&project_id=znect-forge", {
        headers: { authorization: "Bearer web-test-token" }
      }),
      env,
      ctx
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      project: { id: "znect-forge", provider: "circleci" },
      runs: [{
        id: runId,
        projectId: "znect-forge",
        status: "failed",
        branch: "feature/example",
        commitSha: "abc123",
        commitMessage: "Fix CI diagnostics",
        startedAt: "2026-11-15T10:00:00.000Z"
      }]
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("returns a run with workflow and job resources using GET-only upstream requests", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer circle-test-token");

      if (url.pathname === "/api/v3/projects") {
        return new Response(JSON.stringify({ data: [{ id: "123e4567-e89b-42d3-a456-426614174000", attributes: { slug: "gh/Znect-god/znect-forge" } }] }), { status: 200 });
      }
      if (url.pathname === "/api/v3/runs") {
        return new Response(JSON.stringify({ data: [{ id: runId, references: { project: { id: "123e4567-e89b-42d3-a456-426614174000" } } }], page: { next: null } }), { status: 200 });
      }
      if (url.pathname === `/api/v3/runs/${runId}`) {
        return new Response(JSON.stringify({
          data: { id: runId, attributes: { phase: "ended", current_outcome: "succeeded", number: 42 }, references: { project: { id: "123e4567-e89b-42d3-a456-426614174000" } } }
        }), { status: 200 });
      }
      if (url.pathname === "/api/v3/workflows") {
        return new Response(JSON.stringify({
          data: [{ id: workflowId, references: { run: { id: runId } }, attributes: { name: "build-and-test", phase: "ended", outcome: "success" } }],
          page: { next: null }
        }), { status: 200 });
      }
      if (url.pathname === "/api/v3/jobs") {
        return new Response(JSON.stringify({
          data: [{ id: jobId, attributes: { name: "unit-tests", phase: "completed", outcome: "success" }, references: { project: { id: "123e4567-e89b-42d3-a456-426614174000" }, workflow: { id: workflowId } } }],
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
      project: { id: "znect-forge", provider: "circleci" },
      run: { id: runId, projectId: "znect-forge", status: "success" },
      workflows: [{
        workflow: { id: workflowId, runId, name: "build-and-test", status: "success" },
        jobs: [{ id: jobId, projectId: "znect-forge", runId, workflowId, name: "unit-tests", status: "success" }],
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
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("marks run details incomplete when a workflow has more than 40 jobs", async () => {
    const projectId = "123e4567-e89b-42d3-a456-426614174000";
    const jobs = Array.from({ length: 41 }, (_, index) => ({
      id: `123e4567-e89b-42d3-a456-${String(index + 100).padStart(12, "0")}`,
      attributes: { name: `job-${index + 1}`, phase: "completed", outcome: "success" },
      references: { project: { id: projectId }, workflow: { id: workflowId } }
    }));
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v3/projects") {
        return new Response(JSON.stringify({ data: [{ id: projectId, attributes: { slug: "gh/Znect-god/znect-forge" } }] }), { status: 200 });
      }
      if (url.pathname === "/api/v3/runs") {
        return new Response(JSON.stringify({ data: [{ id: runId, references: { project: { id: "123e4567-e89b-42d3-a456-426614174000" } } }], page: { next: null } }), { status: 200 });
      }
      if (url.pathname === `/api/v3/runs/${runId}`) {
        return new Response(JSON.stringify({ data: { id: runId, attributes: { phase: "ended", current_outcome: "succeeded" }, references: { project: { id: projectId } } } }), { status: 200 });
      }
      if (url.pathname === "/api/v3/workflows") {
        return new Response(JSON.stringify({
          data: [{ id: workflowId, references: { run: { id: runId } }, attributes: { name: "build", phase: "ended", outcome: "success" } }],
          page: { next: null }
        }), { status: 200 });
      }
      if (url.pathname === "/api/v3/jobs") {
        return new Response(JSON.stringify({ data: jobs }), { status: 200 });
      }
      throw new Error("Unexpected upstream request: " + url.pathname);
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
      workflows: Array<{ jobs: unknown[]; jobs_total: number; jobs_truncated: boolean }>;
      diagnostics_summary: { jobs_truncated: boolean; incomplete: boolean };
    };
    expect(body.workflows[0].jobs).toHaveLength(40);
    expect(body.workflows[0].jobs_total).toBe(41);
    expect(body.workflows[0].jobs_truncated).toBe(true);
    expect(body.diagnostics_summary.jobs_truncated).toBe(true);
    expect(body.diagnostics_summary.incomplete).toBe(true);
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

      if (url.pathname === "/api/v3/projects") {
        return new Response(JSON.stringify({ data: [{ id: "123e4567-e89b-42d3-a456-426614174000", attributes: { slug: "gh/Znect-god/znect-forge" } }] }), { status: 200 });
      }
      if (url.pathname === "/api/v3/runs") {
        return new Response(JSON.stringify({ data: [{ id: runId, references: { project: { id: "123e4567-e89b-42d3-a456-426614174000" } } }], page: { next: null } }), { status: 200 });
      }
      if (url.pathname === `/api/v3/runs/${runId}`) {
        return new Response(JSON.stringify({
          data: { id: runId, attributes: { phase: "ended", current_outcome: "failed", number: 43 }, references: { project: { id: "123e4567-e89b-42d3-a456-426614174000" } } }
        }), { status: 200 });
      }
      if (url.pathname === "/api/v3/workflows") {
        return new Response(JSON.stringify({
          data: [{ id: workflowId, references: { run: { id: runId } }, attributes: { name: "build-and-test", phase: "ended", outcome: "failed" } }],
          page: { next: null }
        }), { status: 200 });
      }
      if (url.pathname === "/api/v3/jobs") {
        return new Response(JSON.stringify({
          data: [{ id: jobId, attributes: { name: "unit-tests", phase: "completed", outcome: "failed" }, references: { project: { id: "123e4567-e89b-42d3-a456-426614174000" }, workflow: { id: workflowId } } }],
          page: { next: null }
        }), { status: 200 });
      }
      if (url.pathname === `/api/v3/jobs/${jobId}`) {
        return new Response(JSON.stringify({
          data: {
            id: jobId,
            references: { project: { id: "123e4567-e89b-42d3-a456-426614174000" }, workflow: { id: workflowId } },
            attributes: {
              name: "unit-tests",
              parallel_executions: [[{
                name: "Run tests",
                num: 0,
                phase: "completed",
                type: "run",
                is_insignificant: false,
                outcome: "failed",
                exit_code: 1
              }]]
            }
          }
        }), { status: 200 });
      }
      if (url.pathname === `/api/v3/jobs/${jobId}/stdout`) {
        return new Response("Authorization: Bearer web-test-token\nAssertionError: expected 1 to equal 2", { status: 200 });
      }
      if (url.pathname === `/api/v3/jobs/${jobId}/stderr`) {
        return new Response("Test suite failed", { status: 200 });
      }
      if (url.pathname === `/api/v3/jobs/${jobId}/tests`) {
        return new Response('{"name":"sample test","result":"failure"}\n', { status: 200 });
      }
      if (url.pathname === `/api/v3/jobs/${jobId}/artifacts`) {
        return new Response(JSON.stringify({ data: [
          { id: "123e4567-e89b-42d3-a456-426614174101", attributes: { path: "junit/results-a.xml", size: 100 } },
          { id: "123e4567-e89b-42d3-a456-426614174102", attributes: { path: "test-results/results-b.xml", size: 120 } },
          { id: "123e4567-e89b-42d3-a456-426614174103", attributes: { path: "junit/oversized.xml", size: 600_000 } }
        ] }), { status: 200 });
      }
      throw new Error("Unexpected upstream request: " + url.pathname);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request(`https://bridge.example/api/v1/diagnostics/${runId}`, {
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
    expect(body).toContain('"provider":"circleci"');
    expect(body).toContain('"failed_steps"');
    expect(body).toContain("[REDACTED]");
    expect(body).not.toContain("web-test-token");
    const payload = JSON.parse(body);
    expect(payload.workflows[0].failed_jobs[0].test_summary).toMatchObject({
      status: "partial",
      sources: "jsonl_only",
      count_scope: "observed_records",
      total: 1,
      failed: 1,
      incomplete: true
    });
    expect(payload.diagnostics_summary).toMatchObject({
      report_artifact_limit_reached: true,
      report_data_incomplete: true,
      incomplete: true
    });
    expect(body).toContain("results-a.xml");
    expect(body).not.toContain("results-b.xml");
    expect(fetchMock).toHaveBeenCalledTimes(11);
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
