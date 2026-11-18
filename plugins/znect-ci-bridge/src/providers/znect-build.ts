import type {
  CiArtifact,
  CiJob,
  CiJobStep,
  CiLogOutput,
  CiProjectScope,
  CiRun,
  CiTestReport,
  CiWorkflow,
  ReadOnlyCiProviderAdapter
} from "./contract";

const API_ORIGIN = "https://api.github.com";
const CENTRAL_REPOSITORY = "Znect-god/znect-build";
const API_VERSION = "2022-11-28";
const MAX_JSON_BYTES = 1_000_000;
const MAX_PAGES = 5;
const REQUEST_TIMEOUT_MS = 15_000;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value: unknown, field: string, max = 500): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new Error(`GitHub Actions returned invalid ${field}.`);
  }
  return value;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function safeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`GitHub Actions returned invalid ${field}.`);
  }
  return value;
}

function iso(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runTitle(run: JsonRecord): string {
  return optionalText(run.name) ?? optionalText(run.display_title) ?? "";
}

function mapRun(value: unknown, projectId: string): CiRun {
  if (!isRecord(value)) throw new Error("GitHub Actions returned a malformed workflow run.");
  const id = String(safeInteger(value.id, "workflow run ID"));
  const workflowId = String(safeInteger(value.workflow_id, "workflow ID"));
  const headCommit = isRecord(value.head_commit) ? value.head_commit : {};
  const status = optionalText(value.conclusion) ?? optionalText(value.status) ?? "unknown";
  return {
    id,
    projectId,
    workflowId,
    status,
    ...(optionalText(value.head_branch) ? { branch: optionalText(value.head_branch) } : {}),
    ...(optionalText(value.head_sha) ? { commitSha: optionalText(value.head_sha) } : {}),
    ...(optionalText(headCommit.message) ? { commitMessage: optionalText(headCommit.message) } : {}),
    ...(iso(value.run_started_at ?? value.created_at) ? { startedAt: iso(value.run_started_at ?? value.created_at) } : {}),
    ...(iso(value.updated_at) && value.status !== "in_progress" && value.status !== "queued"
      ? { completedAt: iso(value.updated_at) } : {}),
    ...(optionalText(value.html_url) ? { url: optionalText(value.html_url) } : {})
  };
}

function mapJob(value: unknown, projectId: string, runId: string, workflowId: string): CiJob {
  if (!isRecord(value)) throw new Error("GitHub Actions returned a malformed workflow job.");
  const id = String(safeInteger(value.id, "job ID"));
  if (String(value.run_id) !== runId) {
    throw new Error("GitHub Actions job does not belong to the selected workflow run.");
  }
  const rawSteps = value.steps;
  if (rawSteps !== undefined && !Array.isArray(rawSteps)) {
    throw new Error("GitHub Actions returned malformed job steps.");
  }
  const steps: CiJobStep[] = (Array.isArray(rawSteps) ? rawSteps : []).map((item) => {
    if (!isRecord(item)) throw new Error("GitHub Actions returned malformed job step data.");
    const number = safeInteger(item.number, "job step number");
    const name = optionalText(item.name);
    const status = optionalText(item.conclusion) ?? optionalText(item.status);
    return {
      execution: 0,
      ...(name ? { name } : {}),
      actions: [{
        ...(name ? { name } : {}),
        ...(status ? { status, outcome: optionalText(item.conclusion) } : {}),
        stepNumber: number
      }]
    };
  });
  return {
    id,
    projectId,
    runId,
    workflowId,
    name: optionalText(value.name),
    status: optionalText(value.conclusion) ?? optionalText(value.status) ?? "unknown",
    ...(iso(value.started_at) ? { startedAt: iso(value.started_at) } : {}),
    ...(iso(value.completed_at) ? { completedAt: iso(value.completed_at) } : {}),
    ...(steps.length ? { steps } : {})
  };
}

function mapArtifact(value: unknown, runId: string): CiArtifact {
  if (!isRecord(value)) throw new Error("GitHub Actions returned malformed artifact metadata.");
  const id = String(safeInteger(value.id, "artifact ID"));
  const path = requiredText(value.name, "artifact name", 500);
  const size = value.size_in_bytes;
  if (size !== undefined && (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0)) {
    throw new Error("GitHub Actions returned invalid artifact size.");
  }
  return {
    id,
    runId,
    path,
    ...(typeof size === "number" ? { size } : {}),
    contentType: "application/zip"
  };
}

/**
 * Read-only adapter for the central Znect Build GitHub Actions repository.
 * Project ownership is verified by a central validation artifact whose name
 * is produced only after the central registry validator accepts the request.
 */
export class ZnectBuildReadOnlyAdapter implements ReadOnlyCiProviderAdapter {
  readonly provider = "znect-build" as const;

  constructor(
    private readonly token: string,
    private readonly projectId: string,
    private readonly connectionId: string,
    private readonly expectedSourceRepository: string
  ) {
    if (!token) throw new Error("Znect Build GitHub read token is not configured.");
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(projectId)) throw new Error("Invalid Znect Build project ID.");
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(expectedSourceRepository)) {
      throw new Error("Invalid registered source repository for Znect Build.");
    }
  }

  private assertScope(scope: CiProjectScope): void {
    if (scope.projectId !== this.projectId || scope.connectionId !== this.connectionId) {
      throw new Error("CI provider scope does not match the configured Znect Build connection.");
    }
  }

  private async request(path: string): Promise<unknown> {
    if (!path.startsWith("/repos/Znect-god/znect-build/") || path.includes("..") || path.includes("\\\\")) {
      throw new Error("Invalid internal Znect Build API path.");
    }
    const url = new URL(path, API_ORIGIN);
    if (url.origin !== API_ORIGIN) throw new Error("Invalid internal Znect Build API origin.");
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": API_VERSION
        },
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch {
      throw new Error("GitHub Actions API request failed or timed out.");
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("GitHub Actions API unexpectedly redirected a metadata request.");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      const message = response.status === 401
        ? "GitHub Actions read authentication failed (HTTP 401)."
        : response.status === 403
          ? "GitHub Actions read access was denied (HTTP 403 or rate limit)."
          : response.status === 404
            ? "The requested central Build resource was not found or is not accessible."
            : `GitHub Actions API returned HTTP ${response.status}.`;
      throw new Error(message);
    }
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("GitHub Actions API response exceeded the configured size limit.");
    }
    const reader = response.body?.getReader();
    if (!reader) return {};
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.byteLength > MAX_JSON_BYTES - total) {
          await reader.cancel().catch(() => undefined);
          throw new Error("GitHub Actions API response exceeded the configured size limit.");
        }
        total += value.byteLength;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error("GitHub Actions API returned invalid JSON.");
    }
  }

  private async listArtifactsRaw(runId: string): Promise<JsonRecord[]> {
    const result = await this.request(`/repos/Znect-god/znect-build/actions/runs/${runId}/artifacts?per_page=100`);
    if (!isRecord(result) || !Array.isArray(result.artifacts)) {
      throw new Error("GitHub Actions returned malformed run artifact metadata.");
    }
    if (result.artifacts.length > 100) throw new Error("GitHub Actions exceeded the requested artifact page size.");
    return result.artifacts.filter(isRecord);
  }

  private async verifyOwnership(scope: CiProjectScope, rawRun: unknown): Promise<CiRun> {
    this.assertScope(scope);
    if (!isRecord(rawRun)) throw new Error("GitHub Actions returned a malformed workflow run.");
    const run = mapRun(rawRun, scope.projectId);
    const title = runTitle(rawRun);
    const titlePrefix = `Znect Build / ${scope.projectId} /`;
    if (!title.startsWith(titlePrefix)) {
      throw new Error("Central Build run does not match the selected project.");
    }
    const artifacts = await this.listArtifactsRaw(run.id);
    const expected = new RegExp(
      `^znect-build-request-${escapeRegex(scope.projectId)}-.+-${escapeRegex(run.id)}$`
    );
    const validationArtifact = artifacts.find((artifact) =>
      artifact.expired !== true && typeof artifact.name === "string" && expected.test(artifact.name)
    );
    if (!validationArtifact) {
      throw new Error("Central Build run has no unexpired project-scoped validation artifact; ownership cannot be verified.");
    }
    // The central validator accepts a source repository from its registered project
    // registry before it publishes this project-scoped artifact.
    if (!this.expectedSourceRepository) throw new Error("Registered source repository is required.");
    return run;
  }

  async listRuns(scope: CiProjectScope, limit: number): Promise<CiRun[]> {
    this.assertScope(scope);
    if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw new Error("Run limit must be 1–30.");
    const runs: CiRun[] = [];
    for (let page = 1; page <= MAX_PAGES && runs.length < limit; page++) {
      const result = await this.request(`/repos/Znect-god/znect-build/actions/runs?per_page=100&page=${page}`);
      if (!isRecord(result) || !Array.isArray(result.workflow_runs)) {
        throw new Error("GitHub Actions returned malformed workflow run collection.");
      }
      if (result.workflow_runs.length > 100) throw new Error("GitHub Actions exceeded the requested run page size.");
      for (const raw of result.workflow_runs) {
        if (!isRecord(raw) || !runTitle(raw).startsWith(`Znect Build / ${scope.projectId} /`)) continue;
        try {
          runs.push(await this.verifyOwnership(scope, raw));
        } catch (error) {
          if (error instanceof Error && error.message.includes("ownership cannot be verified")) continue;
          throw error;
        }
        if (runs.length >= limit) break;
      }
      if (result.workflow_runs.length < 100) break;
    }
    return runs;
  }

  async getRun(scope: CiProjectScope, runId: string): Promise<CiRun> {
    this.assertScope(scope);
    if (!/^\d{1,16}$/.test(runId)) throw new Error("Invalid GitHub Actions workflow run ID.");
    const raw = await this.request(`/repos/Znect-god/znect-build/actions/runs/${runId}`);
    return this.verifyOwnership(scope, raw);
  }

  async listWorkflows(scope: CiProjectScope, runId: string): Promise<CiWorkflow[]> {
    const run = await this.getRun(scope, runId);
    if (!run.workflowId) return [];
    return [{ id: run.workflowId, runId, name: "Znect Central Build", status: run.status }];
  }

  async listJobs(scope: CiProjectScope, runId: string, workflowId: string): Promise<CiJob[]> {
    const workflows = await this.listWorkflows(scope, runId);
    if (!workflows.some((workflow) => workflow.id === workflowId)) {
      throw new Error("GitHub Actions workflow does not belong to the selected central Build run.");
    }
    const result = await this.request(`/repos/Znect-god/znect-build/actions/runs/${runId}/jobs?per_page=100`);
    if (!isRecord(result) || !Array.isArray(result.jobs)) {
      throw new Error("GitHub Actions returned malformed job collection.");
    }
    if (result.jobs.length > 100) throw new Error("GitHub Actions exceeded the requested job page size.");
    return result.jobs.map((job) => mapJob(job, scope.projectId, runId, workflowId));
  }

  async getJob(scope: CiProjectScope, jobId: string): Promise<CiJob> {
    this.assertScope(scope);
    if (!/^\d{1,16}$/.test(jobId)) throw new Error("Invalid GitHub Actions job ID.");
    const result = await this.request(`/repos/Znect-god/znect-build/actions/jobs/${jobId}`);
    if (!isRecord(result)) throw new Error("GitHub Actions returned malformed job metadata.");
    const runId = String(safeInteger(result.run_id, "job parent run ID"));
    const run = await this.getRun(scope, runId);
    if (!run.workflowId) throw new Error("GitHub Actions job parent workflow is unavailable.");
    return mapJob(result, scope.projectId, runId, run.workflowId);
  }

  async getJobLogs(scope: CiProjectScope, jobId: string, _options: {
    step: number;
    execution?: number;
    stream: "stdout" | "stderr";
    maxBytes: number;
  }): Promise<CiLogOutput> {
    await this.getJob(scope, jobId);
    throw new Error("GitHub Actions job logs are exposed as ZIP archives, not per-step stdout/stderr; text extraction is not supported by this adapter yet.");
  }

  async getTestReport(scope: CiProjectScope, jobId: string, _maxBytes: number): Promise<CiTestReport> {
    await this.getJob(scope, jobId);
    throw new Error("GitHub Actions does not expose a generic job test-report endpoint; test reports are unavailable unless the workflow publishes a supported report artifact.");
  }

  async listArtifacts(scope: CiProjectScope, jobId: string): Promise<CiArtifact[]> {
    await this.getJob(scope, jobId);
    throw new Error("GitHub Actions artifacts are scoped to workflow runs, not jobs. Use listRunArtifacts with the verified run ID.");
  }

  async getArtifact(scope: CiProjectScope, jobId: string, _path: string, _maxBytes: number) {
    await this.getJob(scope, jobId);
    throw new Error("GitHub Actions artifacts are ZIP archives scoped to workflow runs; direct text-file retrieval is not supported by this adapter yet.");
  }

  async listRunArtifacts(scope: CiProjectScope, runId: string): Promise<CiArtifact[]> {
    await this.getRun(scope, runId);
    const artifacts = await this.listArtifactsRaw(runId);
    return artifacts.filter((artifact) => artifact.expired !== true).map((artifact) => mapArtifact(artifact, runId));
  }
}

export function createZnectBuildReadOnlyAdapter(
  token: string,
  projectId: string,
  connectionId: string,
  expectedSourceRepository: string
): ReadOnlyCiProviderAdapter {
  return new ZnectBuildReadOnlyAdapter(token, projectId, connectionId, expectedSourceRepository);
}
