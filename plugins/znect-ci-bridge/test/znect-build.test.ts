import { afterEach, describe, expect, it, vi } from "vitest";
import { ZnectBuildReadOnlyAdapter } from "../src/providers/znect-build";

const TOKEN = "github-read-token";
const PROJECT_ID = "znect-ci-bridge";
const CONNECTION_ID = "build-main";
const SOURCE_REPOSITORY = "Znect-god/znect-all-plugins";
const SOURCE_SHA = "0123456789abcdef0123456789abcdef01234567";
const RUN_ID = "100";
const WORKFLOW_ID = "200";

async function repositoryHash() {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SOURCE_REPOSITORY.toLowerCase()));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function runArtifact(name?: string) {
  return {
    id: 301,
    name: name ?? `znect-build-request-${PROJECT_ID}-${await repositoryHash()}-${SOURCE_SHA}-${RUN_ID}`,
    size_in_bytes: 512,
    expired: false
  };
}

function runRecord() {
  return {
    id: Number(RUN_ID),
    name: "Znect Central Build",
    display_title: `Znect Build / ${PROJECT_ID} / request-12345678`,
    workflow_id: Number(WORKFLOW_ID),
    status: "completed",
    conclusion: "success",
    head_branch: "main",
    head_sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
    run_started_at: "2026-11-18T10:00:00Z",
    updated_at: "2026-11-18T10:02:00Z",
    html_url: "https://github.com/Znect-god/znect-build/actions/runs/100"
  };
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function adapter() {
  return new ZnectBuildReadOnlyAdapter(TOKEN, PROJECT_ID, CONNECTION_ID, SOURCE_REPOSITORY);
}

const scope = { projectId: PROJECT_ID, connectionId: CONNECTION_ID };

afterEach(() => vi.unstubAllGlobals());

describe("Znect Build GitHub Actions read-only adapter", () => {
  it("verifies project and source-repository ownership from the central validation artifact", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ workflow_runs: [runRecord()] }))
      .mockResolvedValueOnce(response({ artifacts: [await runArtifact()] }));
    vi.stubGlobal("fetch", fetchMock);

    const runs = await adapter().listRuns(scope, 5);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      id: RUN_ID,
      projectId: PROJECT_ID,
      workflowId: WORKFLOW_ID,
      status: "success",
      commitSha: SOURCE_SHA
    });
    expect(fetchMock.mock.calls.every(([url, init]) =>
      String(url).startsWith("https://api.github.com/repos/Znect-god/znect-build/") &&
      (init as RequestInit).method === "GET" &&
      (init as RequestInit).redirect === "manual"
    )).toBe(true);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      authorization: `Bearer ${TOKEN}`,
      "x-github-api-version": "2022-11-28"
    });
  });

  it("omits runs whose central validation artifact does not match the registered source repository", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ workflow_runs: [runRecord()] }))
      .mockResolvedValueOnce(response({ artifacts: [await runArtifact("znect-build-request-znect-ci-bridge-wrong-repository-100")] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(adapter().listRuns(scope, 5)).resolves.toEqual([]);
  });

  it("rejects direct run reads when the run title belongs to another project", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({
      ...runRecord(),
      display_title: "Znect Build / znect-forge / request-12345678"
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(adapter().getRun(scope, RUN_ID)).rejects.toThrow(/selected project/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns run-scoped artifact metadata without pretending artifacts belong to a job", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(runRecord()))
      .mockResolvedValueOnce(response({ artifacts: [await runArtifact()] }))
      .mockResolvedValueOnce(response({ artifacts: [await runArtifact()] }));
    vi.stubGlobal("fetch", fetchMock);

    const artifacts = await adapter().listRunArtifacts!(scope, RUN_ID);

    expect(artifacts).toEqual([{
      id: "301",
      runId: RUN_ID,
      path: `znect-build-request-${PROJECT_ID}-${await repositoryHash()}-${SOURCE_SHA}-${RUN_ID}`,
      size: 512,
      contentType: "application/zip"
    }]);
    expect(artifacts[0].jobId).toBeUndefined();
  });

  it("verifies job parent run before returning job diagnostics", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        id: 401,
        run_id: 999,
        name: "Validate central build request",
        status: "completed",
        conclusion: "success",
        steps: []
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(adapter().getJob(scope, "401")).rejects.toThrow(/not belong/i);
  });

  it("does not fabricate per-step logs or job-scoped artifacts for GitHub Actions", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(runRecord()))
      .mockResolvedValueOnce(response({ artifacts: [await runArtifact()] }))
      .mockResolvedValueOnce(response({
        id: 401,
        run_id: Number(RUN_ID),
        name: "Validate central build request",
        status: "completed",
        conclusion: "success",
        steps: [{ number: 1, name: "Validate", status: "completed", conclusion: "success" }]
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(adapter().getJobLogs(scope, "401", {
      step: 1,
      stream: "stdout",
      maxBytes: 10_000
    })).rejects.toThrow(/ZIP archives/i);
  });

  it("rejects invalid project scope and unsafe resource identifiers before network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(adapter().listRuns({ projectId: "other-project", connectionId: CONNECTION_ID }, 1))
      .rejects.toThrow(/scope does not match/i);
    await expect(adapter().getRun(scope, "../100")).rejects.toThrow(/invalid.*run ID/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
