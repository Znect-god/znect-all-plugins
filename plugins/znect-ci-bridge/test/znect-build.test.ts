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

async function runArtifact(name?: string, runId = RUN_ID) {
  return {
    id: 301,
    name: name ?? `znect-build-request-${PROJECT_ID}-${await repositoryHash()}-${SOURCE_SHA}-${runId}`,
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
    path: ".github/workflows/central-build.yml",
    repository: { full_name: "Znect-god/znect-build" },
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

function storedZip(name: string, content: string): Uint8Array {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name);
  const data = encoder.encode(content);
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const localLength = 30 + nameBytes.length + data.length;
  const centralLength = 46 + nameBytes.length;
  const output = new Uint8Array(localLength + centralLength + 22);
  const view = new DataView(output.buffer);
  const put16 = (offset: number, value: number) => view.setUint16(offset, value, true);
  const put32 = (offset: number, value: number) => view.setUint32(offset, value, true);
  put32(0, 0x04034b50); put16(4, 20); put16(6, 0); put16(8, 0);
  put32(14, crc); put32(18, data.length); put32(22, data.length);
  put16(26, nameBytes.length); put16(28, 0);
  output.set(nameBytes, 30); output.set(data, 30 + nameBytes.length);
  const central = localLength;
  put32(central, 0x02014b50); put16(central + 4, 20); put16(central + 6, 20);
  put16(central + 8, 0); put16(central + 10, 0);
  put32(central + 16, crc); put32(central + 20, data.length); put32(central + 24, data.length);
  put16(central + 28, nameBytes.length); put16(central + 30, 0); put16(central + 32, 0);
  put16(central + 34, 0); put16(central + 36, 0); put32(central + 38, 0);
  put32(central + 42, 0); output.set(nameBytes, central + 46);
  const end = central + centralLength;
  put32(end, 0x06054b50); put16(end + 4, 0); put16(end + 6, 0);
  put16(end + 8, 1); put16(end + 10, 1);
  put32(end + 12, centralLength); put32(end + 16, localLength); put16(end + 20, 0);
  return output;
}

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
    expect(runs[0].branch).toBeUndefined();
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

  it("caps artifact ownership probes to protect Worker subrequest budgets", async () => {
    const candidates = Array.from({ length: 21 }, (_, index) => ({
      ...runRecord(),
      id: 500 + index,
      display_title: `Znect Build / ${PROJECT_ID} / request-${index.toString().padStart(8, "0")}`
    }));
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ workflow_runs: candidates }));
    for (let index = 0; index < 20; index++) {
      fetchMock.mockResolvedValueOnce(response({ artifacts: [await runArtifact(undefined, String(500 + index))] }));
    }
    vi.stubGlobal("fetch", fetchMock);

    const runs = await adapter().listRuns(scope, 20);

    expect(runs).toHaveLength(20);
    expect(fetchMock).toHaveBeenCalledTimes(21);
  });

  it("rejects runs from another workflow file or a non-default central branch", async () => {
    const wrongWorkflow = vi.fn().mockResolvedValueOnce(response({
      ...runRecord(),
      path: ".github/workflows/other.yml"
    }));
    vi.stubGlobal("fetch", wrongWorkflow);
    await expect(adapter().getRun(scope, RUN_ID)).rejects.toThrow(/trusted central Build workflow/i);

    const wrongBranch = vi.fn().mockResolvedValueOnce(response({
      ...runRecord(),
      head_branch: "feature/test"
    }));
    vi.stubGlobal("fetch", wrongBranch);
    await expect(adapter().getRun(scope, RUN_ID)).rejects.toThrow(/trusted central Build workflow/i);
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

  it("exposes the private validation manifest as run-scoped metadata after ownership verification", async () => {
    const manifest = {
      id: 302,
      name: `znect-ci-bridge-validation-${RUN_ID}`,
      size_in_bytes: 2048,
      expired: false
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(runRecord()))
      .mockResolvedValueOnce(response({ artifacts: [await runArtifact(), manifest] }))
      .mockResolvedValueOnce(response({ artifacts: [await runArtifact(), manifest] }));
    vi.stubGlobal("fetch", fetchMock);

    const artifacts = await adapter().listRunArtifacts!(scope, RUN_ID);

    expect(artifacts.map((artifact) => artifact.path)).toContain(`znect-ci-bridge-validation-${RUN_ID}`);
    expect(artifacts.find((artifact) => artifact.path === `znect-ci-bridge-validation-${RUN_ID}`))
      .toMatchObject({ id: "302", runId: RUN_ID, size: 2048, contentType: "application/zip" });
  });

  it("rejects a job when its parent run cannot be verified for the selected project", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        id: 401,
        run_id: 999,
        name: "Validate central build request",
        status: "completed",
        conclusion: "success",
        steps: []
      }))
      .mockResolvedValueOnce(response({ ...runRecord(), id: 999 }))
      .mockResolvedValueOnce(response({ artifacts: [await runArtifact("znect-build-request-znect-forge-invalid-999")] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(adapter().getJob(scope, "401")).rejects.toThrow(/ownership cannot be verified/i);
  });

  it("does not fabricate per-step logs or job-scoped artifacts for GitHub Actions", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        id: 401,
        run_id: Number(RUN_ID),
        name: "Validate central build request",
        status: "completed",
        conclusion: "success",
        steps: [{ number: 1, name: "Validate", status: "completed", conclusion: "success" }]
      }))
      .mockResolvedValueOnce(response(runRecord()))
      .mockResolvedValueOnce(response({ artifacts: [await runArtifact()] }));
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
  it("accepts only a central validation manifest that records the full security-check recipe", async () => {
    const manifest = {
      schema_version: 1,
      project_id: PROJECT_ID,
      source_repository: SOURCE_REPOSITORY,
      source_ref: "feature/ci-bridge-android-exporter",
      source_sha: SOURCE_SHA,
      build_target: "znect-ci-bridge/worker-validation",
      build_profile: "debug",
      recipe: "node-cloudflare-worker-validation",
      recipe_outcome: "success",
      validation_steps: [
        "npm ci",
        "npm audit --audit-level=high",
        "npm run check",
        "node --check scripts/preview-smoke-test.mjs",
        "npx --no-install wrangler deploy --dry-run"
      ],
      deployment_performed: false,
      circleci_pipeline_mutation: false,
      central_run: {
        repository: "Znect-god/znect-build",
        run_id: RUN_ID,
        run_url: `https://github.com/Znect-god/znect-build/actions/runs/${RUN_ID}`
      },
      generated_at: "2026-11-18T12:00:00.000Z"
    };
    const archive = storedZip("ci-bridge-validation-manifest.json", JSON.stringify(manifest));
    const manifestArtifact = {
      id: 302,
      name: `znect-ci-bridge-validation-${RUN_ID}`,
      size_in_bytes: archive.byteLength,
      expired: false
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(runRecord()))
      .mockResolvedValueOnce(response({ artifacts: [await runArtifact(), manifestArtifact] }))
      .mockResolvedValueOnce(response({ artifacts: [await runArtifact(), manifestArtifact] }))
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "https://ci-bridge.blob.core.windows.net/private/manifest.zip?sig=temporary" }
      }))
      .mockResolvedValueOnce(new Response(archive, {
        status: 200,
        headers: { "content-length": String(archive.byteLength) }
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await adapter().getValidationManifest(scope, RUN_ID);

    expect(result.validation_steps).toEqual(manifest.validation_steps);
    expect(result.recipe_outcome).toBe("success");
    expect(result.source_sha).toBe(SOURCE_SHA);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect((fetchMock.mock.calls[3][1] as RequestInit).headers).toBeUndefined();
  });

  it("rejects a validation manifest that omits the dependency audit step", async () => {
    const manifest = {
      schema_version: 1,
      project_id: PROJECT_ID,
      source_repository: SOURCE_REPOSITORY,
      source_ref: "feature/ci-bridge-android-exporter",
      source_sha: SOURCE_SHA,
      build_target: "znect-ci-bridge/worker-validation",
      build_profile: "debug",
      recipe: "node-cloudflare-worker-validation",
      recipe_outcome: "success",
      validation_steps: [
        "npm ci",
        "npm run check",
        "node --check scripts/preview-smoke-test.mjs",
        "npx --no-install wrangler deploy --dry-run"
      ],
      deployment_performed: false,
      circleci_pipeline_mutation: false,
      central_run: {
        repository: "Znect-god/znect-build",
        run_id: RUN_ID,
        run_url: `https://github.com/Znect-god/znect-build/actions/runs/${RUN_ID}`
      },
      generated_at: "2026-11-18T12:00:00.000Z"
    };
    const archive = storedZip("ci-bridge-validation-manifest.json", JSON.stringify(manifest));
    const manifestArtifact = {
      id: 302,
      name: `znect-ci-bridge-validation-${RUN_ID}`,
      size_in_bytes: archive.byteLength,
      expired: false
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(runRecord()))
      .mockResolvedValueOnce(response({ artifacts: [await runArtifact(), manifestArtifact] }))
      .mockResolvedValueOnce(response({ artifacts: [await runArtifact(), manifestArtifact] }))
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "https://ci-bridge.blob.core.windows.net/private/manifest.zip?sig=temporary" }
      }))
      .mockResolvedValueOnce(new Response(archive, {
        status: 200,
        headers: { "content-length": String(archive.byteLength) }
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(adapter().getValidationManifest(scope, RUN_ID))
      .rejects.toThrow(/manifest failed project, source, run, or safety validation/i);
  });

});
