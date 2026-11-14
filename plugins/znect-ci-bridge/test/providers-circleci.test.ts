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
          attributes: {
            phase: "completed",
            current_outcome: "failed",
            branch: "main",
            vcs_revision: "abc123",
            subject: "Fix tests",
            start_time: "2026-11-15T10:00:00Z",
            stop_time: "2026-11-15T10:05:00Z"
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
      startedAt: "2026-11-15T10:00:00.000Z",
      completedAt: "2026-11-15T10:05:00.000Z"
    }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
            status: "failed",
            parallel_executions: [{
              execution: 2,
              steps: [{
                name: "Run tests",
                actions: [{
                  name: "npm test",
                  status: "failed",
                  exit_code: 1,
                  step_num: 4
                }]
              }]
            }]
          }
        }
      })));
    const adapter = new CircleCiReadOnlyAdapter("token", "gh/Znect-god/znect-forge", "znect-forge", "circleci-main");

    await expect(adapter.getJob(scope, JOB_ID)).resolves.toMatchObject({
      id: JOB_ID,
      workflowId: WORKFLOW_ID,
      steps: [{
        name: "Run tests",
        execution: 2,
        actions: [{
          name: "npm test",
          status: "failed",
          exitCode: 1,
          stepNumber: 4
        }]
      }]
    });
  });

  it("rejects a job whose workflow reference differs from the selected run workflow", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(projectResponse())
      .mockResolvedValueOnce(response({
        data: [{ id: RUN_ID }],
        page: { next: null }
      }))
      .mockResolvedValueOnce(response({
        data: { id: RUN_ID, attributes: { status: "success" } }
      }))
      .mockResolvedValueOnce(response({
        data: [{ id: WORKFLOW_ID, references: { run: { id: RUN_ID } }, attributes: { status: "success" } }],
        page: { next: null }
      }))
      .mockResolvedValueOnce(response({
        data: [{
          id: JOB_ID,
          references: {
            project: { id: PROJECT_ID },
            workflow: { id: "123e4567-e89b-42d3-a456-426614174099" }
          },
          attributes: { status: "failed" }
        }],
        page: { next: null }
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
});
