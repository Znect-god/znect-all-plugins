import { afterEach, describe, expect, it, vi } from "vitest";
import { CircleCiReadOnlyAdapter } from "../src/providers/circleci";

const PROJECT_ID = "123e4567-e89b-42d3-a456-426614174000";
const RUN_ID = "123e4567-e89b-42d3-a456-426614174001";
const WORKFLOW_ID = "123e4567-e89b-42d3-a456-426614174002";
const JOB_ID = "123e4567-e89b-42d3-a456-426614174003";
const scope = { projectId: "znect-forge", connectionId: "circleci-main" };

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}

function projectResponse(): Response {
  return response({
    data: [{ id: PROJECT_ID, attributes: { slug: "gh/Znect-god/znect-forge" } }]
  });
}

describe("CircleCI read-only provider adapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes project-scoped runs into the shared CI model", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(projectResponse())
      .mockResolvedValueOnce(response({
        data: [{
          id: RUN_ID,
          references: {
            project: { id: PROJECT_ID },
            event: { attributes: { vcs: {
              branch: "main",
              revision: "abc123",
              commit: { subject: "Fix tests", url: "https://github.com/Znect-god/znect-build/commit/abc123" }
            } } }
          },
          attributes: {
            phase: "ended",
            current_outcome: "failed",
            created_at: "2026-11-15T10:00:00Z"
          }
        }],
        page: { next: null }
      }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new CircleCiReadOnlyAdapter("token", "gh/Znect-god/znect-forge", "znect-forge", "circleci-main");
    await expect(adapter.listRuns(scope, 10)).resolves.toEqual([{
      id: RUN_ID,
      projectId: "znect-forge",
      status: "failed",
      branch: "main",
      commitSha: "abc123",
      commitMessage: "Fix tests",
      createdAt: "2026-11-15T10:00:00.000Z"
    }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not trust undocumented top-level VCS aliases", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(projectResponse())
      .mockResolvedValueOnce(response({
        data: [{
          id: RUN_ID,
          references: { project: { id: PROJECT_ID } },
          attributes: {
            phase: "ended",
            current_outcome: "succeeded",
            branch: "unverified-branch-alias",
            subject: "unverified-subject-alias",
            vcs_revision: "unverified-revision-alias",
            web_url: "https://app.circleci.com/pipelines/gh/Znect-god/znect-forge/1"
          }
        }],
        page: { next: null }
      }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new CircleCiReadOnlyAdapter("token", "gh/Znect-god/znect-forge", "znect-forge", "circleci-main");
    const runs = await adapter.listRuns(scope, 1);
    expect(runs[0]).not.toHaveProperty("commitSha");
    expect(runs[0]).not.toHaveProperty("branch");
    expect(runs[0]).not.toHaveProperty("commitMessage");
    expect(runs[0]).not.toHaveProperty("url");
  });

  it("rejects a scope using a different registered connection before network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new CircleCiReadOnlyAdapter("token", "gh/Znect-god/znect-forge", "znect-forge", "circleci-main");

    await expect(adapter.listRuns({ ...scope, connectionId: "other-connection" }, 10))
      .rejects.toThrow("does not match the configured CircleCI project connection");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a different project even when the connection ID is reused", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new CircleCiReadOnlyAdapter("token", "gh/Znect-god/znect-forge", "znect-forge", "circleci-main");

    await expect(adapter.listRuns({ projectId: "another-project", connectionId: "circleci-main" }, 10))
      .rejects.toThrow("does not match the configured CircleCI project connection");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks job ownership before returning logs", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(projectResponse())
      .mockResolvedValueOnce(response({
        data: {
          id: JOB_ID,
          references: {
            project: { id: PROJECT_ID },
            workflow: { id: WORKFLOW_ID }
          },
          attributes: { name: "unit-tests", status: "failed" }
        }
      }))
      .mockResolvedValueOnce(new Response("test failure output", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new CircleCiReadOnlyAdapter("token", "gh/Znect-god/znect-forge", "znect-forge", "circleci-main");

    await expect(adapter.getJobLogs(scope, JOB_ID, {
      step: 0, stream: "stderr", maxBytes: 1024
    })).resolves.toEqual({ text: "test failure output", truncated: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("normalizes failed actions and step numbers from a verified job detail", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(projectResponse())
      .mockResolvedValueOnce(response({
        data: {
          id: JOB_ID,
          references: { project: { id: PROJECT_ID }, workflow: { id: WORKFLOW_ID } },
          attributes: {
            name: "unit-tests",
            phase: "completed",
            outcome: "failed",
            started_at: "2026-11-15T10:01:00Z",
            ended_at: "2026-11-15T10:04:00Z",
            parallel_executions: [{
              steps: [{
                name: "Run tests",
                num: 4,
                phase: "completed",
                type: "run",
                is_insignificant: false,
                outcome: "failed",
                exit_code: 1
              }]
            }]
          }
        }
      })));
    const adapter = new CircleCiReadOnlyAdapter("token", "gh/Znect-god/znect-forge", "znect-forge", "circleci-main");

    await expect(adapter.getJob(scope, JOB_ID)).resolves.toMatchObject({
      id: JOB_ID,
      workflowId: WORKFLOW_ID,
      startedAt: "2026-11-15T10:01:00.000Z",
      completedAt: "2026-11-15T10:04:00.000Z",
      steps: [{
        name: "Run tests",
        execution: 0,
        actions: [{
          name: "Run tests",
          status: "failed",
          outcome: "failed",
          exitCode: 1,
          stepNumber: 4,
          isInsignificant: false
        }]
      }]
    });
  });

  it("uses the parallel-execution array index and API v3 step num", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(projectResponse())
      .mockResolvedValueOnce(response({
        data: {
          id: JOB_ID,
          references: { project: { id: PROJECT_ID }, workflow: { id: WORKFLOW_ID } },
          attributes: {
            name: "parallel-tests",
            parallel_executions: [
              { steps: [{ name: "worker zero", num: 0, phase: "completed", type: "run", is_insignificant: false, outcome: "success" }] },
              { steps: [
                { name: "worker one", num: 7, phase: "completed", type: "run", is_insignificant: false, outcome: "failed", exit_code: 1 },
                { name: "allowed cleanup", num: 8, phase: "completed", type: "run", is_insignificant: true, outcome: "failed", exit_code: 1 }
              ] }
            ]
          }
        }
      })));
    const adapter = new CircleCiReadOnlyAdapter("token", "gh/Znect-god/znect-forge", "znect-forge", "circleci-main");
    await expect(adapter.getJob(scope, JOB_ID)).resolves.toMatchObject({
      steps: [
        { execution: 0, actions: [{ stepNumber: 0, status: "success" }] },
        { execution: 1, actions: [
          { stepNumber: 7, status: "failed", exitCode: 1, isInsignificant: false },
          { stepNumber: 8, status: "failed", exitCode: 1, isInsignificant: true }
        ] }
      ]
    });
  });

  it("rejects malformed API v3 step records instead of dropping diagnostics", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(projectResponse())
      .mockResolvedValueOnce(response({
        data: {
          id: JOB_ID,
          references: { project: { id: PROJECT_ID }, workflow: { id: WORKFLOW_ID } },
          attributes: {
            parallel_executions: [{
              steps: [{ name: "missing step number", phase: "completed", type: "run", is_insignificant: false }]
            }]
          }
        }
      })));
    const adapter = new CircleCiReadOnlyAdapter("token", "gh/Znect-god/znect-forge", "znect-forge", "circleci-main");
    await expect(adapter.getJob(scope, JOB_ID)).rejects.toThrow("malformed job step data");
  });

  it("rejects job details missing the API-required workflow relationship", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(projectResponse())
      .mockResolvedValueOnce(response({
        data: { id: JOB_ID, references: { project: { id: PROJECT_ID } }, attributes: { name: "unit-tests" } }
      })));
    const adapter = new CircleCiReadOnlyAdapter("token", "gh/Znect-god/znect-forge", "znect-forge", "circleci-main");
    await expect(adapter.getJob(scope, JOB_ID))
      .rejects.toThrow("valid workflow ownership reference");
  });

  it("rejects a workflow whose explicit run reference differs from the requested run", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(projectResponse())
      .mockResolvedValueOnce(response({
        data: [{ id: RUN_ID, references: { project: { id: PROJECT_ID } } }],
        page: { next: null }
      }))
      .mockResolvedValueOnce(response({
        data: { id: RUN_ID, attributes: { status: "success" }, references: { project: { id: PROJECT_ID } } }
      }))
      .mockResolvedValueOnce(response({
        data: [{
          id: WORKFLOW_ID,
          references: { run: { id: "123e4567-e89b-42d3-a456-426614174099" } },
          attributes: { phase: "ended", outcome: "success" }
        }],
        page: { next: null }
      }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new CircleCiReadOnlyAdapter("token", "gh/Znect-god/znect-forge", "znect-forge", "circleci-main");

    await expect(adapter.listWorkflows(scope, RUN_ID))
      .rejects.toThrow("does not belong to the selected run");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("rejects a job whose workflow reference differs from the selected run workflow", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(projectResponse())
      .mockResolvedValueOnce(response({
        data: [{ id: RUN_ID, references: { project: { id: PROJECT_ID } } }],
        page: { next: null }
      }))
      .mockResolvedValueOnce(response({
        data: { id: RUN_ID, attributes: { phase: "ended", current_outcome: "succeeded" }, references: { project: { id: PROJECT_ID } } }
      }))
      .mockResolvedValueOnce(response({
        data: [{ id: WORKFLOW_ID, references: { run: { id: RUN_ID } }, attributes: { phase: "ended", outcome: "success" } }],
        page: { next: null }
      }))
      .mockResolvedValueOnce(response({
        data: [{
          id: JOB_ID,
          references: {
            project: { id: PROJECT_ID },
            workflow: { id: "123e4567-e89b-42d3-a456-426614174099" }
          },
          attributes: { phase: "ended", outcome: "failed" }
        }],
      }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new CircleCiReadOnlyAdapter("token", "gh/Znect-god/znect-forge", "znect-forge", "circleci-main");

    await expect(adapter.listJobs(scope, RUN_ID, WORKFLOW_ID))
      .rejects.toThrow("does not belong to the selected run workflow");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("refuses to read job logs when the job belongs to another project", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(projectResponse())
      .mockResolvedValueOnce(response({
        data: {
          id: JOB_ID,
          references: { project: { id: RUN_ID }, workflow: { id: WORKFLOW_ID } },
          attributes: { status: "failed" }
        }
      }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new CircleCiReadOnlyAdapter("token", "gh/Znect-god/znect-forge", "znect-forge", "circleci-main");

    await expect(adapter.getJobLogs(scope, JOB_ID, {
      step: 0, stream: "stderr", maxBytes: 1024
    })).rejects.toThrow("does not belong to the selected project");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a run lookup after a transient CircleCI API failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(projectResponse())
      .mockResolvedValueOnce(response({ message: "temporary failure" }, 503))
      .mockResolvedValueOnce(response({
        data: [{
          id: RUN_ID,
          references: { project: { id: PROJECT_ID } },
          attributes: { phase: "ended", current_outcome: "succeeded" }
        }],
        page: { next: null }
      }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new CircleCiReadOnlyAdapter("token", "gh/Znect-god/znect-forge", "znect-forge", "circleci-main");

    await expect(adapter.getRun(scope, RUN_ID)).rejects.toThrow("HTTP 503");
    await expect(adapter.getRun(scope, RUN_ID)).resolves.toMatchObject({
      id: RUN_ID,
      projectId: "znect-forge",
      status: "succeeded"
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shares one in-flight read for concurrent requests to the same run", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(projectResponse())
      .mockResolvedValueOnce(response({
        data: [{
          id: RUN_ID,
          references: { project: { id: PROJECT_ID } },
          attributes: { phase: "ended", current_outcome: "succeeded" }
        }],
        page: { next: null }
      }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new CircleCiReadOnlyAdapter("token", "gh/Znect-god/znect-forge", "znect-forge", "circleci-main");

    const [first, second] = await Promise.all([
      adapter.getRun(scope, RUN_ID),
      adapter.getRun(scope, RUN_ID)
    ]);
    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries project resolution after a transient CircleCI API failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ message: "temporary failure" }, 503))
      .mockResolvedValueOnce(projectResponse())
      .mockResolvedValueOnce(response({
        data: [{
          id: RUN_ID,
          references: { project: { id: PROJECT_ID } },
          attributes: { phase: "ended", current_outcome: "succeeded" }
        }],
        page: { next: null }
      }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new CircleCiReadOnlyAdapter("token", "gh/Znect-god/znect-forge", "znect-forge", "circleci-main");

    await expect(adapter.getRun(scope, RUN_ID)).rejects.toThrow("HTTP 503");
    await expect(adapter.getRun(scope, RUN_ID)).resolves.toMatchObject({ id: RUN_ID, status: "succeeded" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
