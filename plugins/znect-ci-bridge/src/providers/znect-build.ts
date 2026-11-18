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
const API_VERSION = "2022-11-28";
const CENTRAL_REPOSITORY = "Znect-god/znect-build";
const CENTRAL_WORKFLOW_PATH = ".github/workflows/central-build.yml";
const CENTRAL_WORKFLOW_BRANCH = "main";
const MAX_JSON_BYTES = 1_000_000;
const MAX_PAGES = 5;
const MAX_RUN_PROBES = 20;
const REQUEST_TIMEOUT_MS = 15_000;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requiredText(value: unknown, field: string, max = 500): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new Error(`GitHub Actions returned invalid ${field}.`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`GitHub Actions returned invalid ${field}.`);
  }
  return value;
}

function iso(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function runTitle(value: JsonRecord): string {
  return optionalText(value.display_title) ?? optionalText(value.name) ?? "";
}

function safeRunUrl(value: unknown, runId: string): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.origin !== "https://github.com" ||
        url.pathname !== `/Znect-god/znect-build/actions/runs/${runId}` ||
        url.search || url.hash || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function mapRun(value: unknown, projectId: string, verifiedSourceSha: string): CiRun {
  if (!isRecord(value)) throw new Error("GitHub Actions returned a malformed workflow run.");
  const id = String(positiveInteger(value.id, "workflow run ID"));
  const workflowId = String(positiveInteger(value.workflow_id, "workflow ID"));
  return {
    id,
    projectId,
    workflowId,
    status: optionalText(value.conclusion) ?? optionalText(value.status) ?? "unknown",
    commitSha: verifiedSourceSha,
    ...(iso(value.run_started_at ?? value.created_at) ? { startedAt: iso(value.run_started_at ?? value.created_at) } : {}),
    ...(iso(value.updated_at) && value.status !== "in_progress" && value.status !== "queued"
      ? { completedAt: iso(value.updated_at) } : {}),
    ...(safeRunUrl(value.html_url, id) ? { url: safeRunUrl(value.html_url, id) } : {})
  };
}

function mapJob(value: unknown, projectId: string, runId: string, workflowId: string): CiJob {
  if (!isRecord(value)) throw new Error("GitHub Actions returned a malformed workflow job.");
  const id = String(positiveInteger(value.id, "job ID"));
  if (String(value.run_id) !== runId) throw new Error("GitHub Actions job does not belong to the verified run.");
  if (value.steps !== undefined && !Array.isArray(value.steps)) throw new Error("GitHub Actions returned malformed job steps.");
  const steps: CiJobStep[] = (Array.isArray(value.steps) ? value.steps : []).map((item) => {
    if (!isRecord(item)) throw new Error("GitHub Actions returned malformed job step data.");
    const number = typeof item.number === "number" && Number.isSafeInteger(item.number) && item.number >= 0
      ? item.number : undefined;
    const name = optionalText(item.name);
    const status = optionalText(item.conclusion) ?? optionalText(item.status);
    return {
      execution: 0,
      ...(name ? { name } : {}),
      actions: [{
        ...(name ? { name } : {}),
        ...(status ? { status, outcome: optionalText(item.conclusion) } : {}),
        ...(number !== undefined ? { stepNumber: number } : {})
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
  const id = String(positiveInteger(value.id, "artifact ID"));
  const name = requiredText(value.name, "artifact name", 500);
  const size = value.size_in_bytes;
  if (size !== undefined && (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0)) {
    throw new Error("GitHub Actions returned invalid artifact size.");
  }
  return { id, runId, path: name, ...(typeof size === "number" ? { size } : {}), contentType: "application/zip" };
}

/** Read-only adapter for the central Znect Build GitHub Actions repository. */
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
    if (!path.startsWith("/repos/Znect-god/znect-build/") || path.includes("..") || path.includes("\\")) {
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
      if (response.status === 401) throw new Error("GitHub Actions read authentication failed (HTTP 401).");
      if (response.status === 403) throw new Error("GitHub Actions read access was denied (HTTP 403 or rate limit).");
      if (response.status === 404) throw new Error("The central Build resource was not found or is not accessible.");
      throw new Error(`GitHub Actions API returned HTTP ${response.status}.`);
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
        chunks.push(value);
        total += value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new Error("GitHub Actions API returned invalid JSON."); }
  }

  private async listArtifactsRaw(runId: string): Promise<JsonRecord[]> {
    const result = await this.request(`/repos/Znect-god/znect-build/actions/runs/${runId}/artifacts?per_page=100`);
    if (!isRecord(result) || !Array.isArray(result.artifacts) || result.artifacts.length > 100) {
      throw new Error("GitHub Actions returned malformed run artifact metadata.");
    }
    return result.artifacts.filter(isRecord);
  }

  private async verifyOwnership(scope: CiProjectScope, rawRun: unknown): Promise<CiRun> {
    this.assertScope(scope);
    if (!isRecord(rawRun)) throw new Error("GitHub Actions returned a malformed workflow run.");
    const id = String(positiveInteger(rawRun.id, "workflow run ID"));
    const repository = isRecord(rawRun.repository) ? optionalText(rawRun.repository.full_name) : undefined;
    if (repository?.toLowerCase() !== CENTRAL_REPOSITORY.toLowerCase() ||
        rawRun.path !== CENTRAL_WORKFLOW_PATH || rawRun.head_branch !== CENTRAL_WORKFLOW_BRANCH) {
      throw new Error("Workflow run is not from the trusted central Build workflow on its main branch.");
    }
    if (!runTitle(rawRun).startsWith(`Znect Build / ${scope.projectId} /`)) {
      throw new Error("Central Build run does not match the selected project.");
    }

    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(this.expectedSourceRepository.toLowerCase())
    );
    const repositoryHash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const expected = new RegExp(
      `^znect-build-request-${this.projectId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}-${repositoryHash}-([0-9a-f]{40})-${id}$`
    );
    const artifacts = await this.listArtifactsRaw(id);
    const requestArtifact = artifacts.find((artifact) =>
      artifact.expired !== true && typeof artifact.name === "string" && expected.test(artifact.name)
    );
    const match = requestArtifact ? expected.exec(String(requestArtifact.name)) : null;
    const sourceSha = match?.[1];
    if (!sourceSha) {
      throw new Error("Central Build run has no unexpired registry-fingerprinted request artifact; ownership cannot be verified.");
    }
    return mapRun(rawRun, scope.projectId, sourceSha);
  }

  async listRuns(scope: CiProjectScope, limit: number): Promise<CiRun[]> {
    this.assertScope(scope);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RUN_PROBES) throw new Error("Run limit must be 1–20.");
    const runs: CiRun[] = [];
    let probes = 0;
    for (let page = 1; page <= MAX_PAGES && runs.length < limit && probes < MAX_RUN_PROBES; page++) {
      const result = await this.request(`/repos/Znect-god/znect-build/actions/runs?per_page=100&page=${page}`);
      if (!isRecord(result) || !Array.isArray(result.workflow_runs) || result.workflow_runs.length > 100) {
        throw new Error("GitHub Actions returned malformed workflow run collection.");
      }
      for (const raw of result.workflow_runs) {
        if (!isRecord(raw) || !runTitle(raw).startsWith(`Znect Build / ${scope.projectId} /`)) continue;
        probes++;
        try { runs.push(await this.verifyOwnership(scope, raw)); }
        catch (error) {
          if (!(error instanceof Error) || !error.message.includes("ownership cannot be verified")) throw error;
        }
        if (runs.length >= limit || probes >= MAX_RUN_PROBES) break;
      }
      if (result.workflow_runs.length < 100) break;
    }
    return runs;
  }

  async getRun(scope: CiProjectScope, runId: string): Promise<CiRun> {
    this.assertScope(scope);
    if (!/^\d{1,16}$/.test(runId)) throw new Error("Invalid GitHub Actions workflow run ID.");
    return this.verifyOwnership(scope, await this.request(`/repos/Znect-god/znect-build/actions/runs/${runId}`));
  }

  async listWorkflows(scope: CiProjectScope, runId: string): Promise<CiWorkflow[]> {
    const run = await this.getRun(scope, runId);
    return run.workflowId ? [{ id: run.workflowId, runId, name: "Znect Central Build", status: run.status }] : [];
  }

  async listJobs(scope: CiProjectScope, runId: string, workflowId: string): Promise<CiJob[]> {
    const workflows = await this.listWorkflows(scope, runId);
    if (!workflows.some((workflow) => workflow.id === workflowId)) {
      throw new Error("GitHub Actions workflow does not belong to the selected central Build run.");
    }
    const result = await this.request(`/repos/Znect-god/znect-build/actions/runs/${runId}/jobs?per_page=100`);
    if (!isRecord(result) || !Array.isArray(result.jobs) || result.jobs.length > 100) {
      throw new Error("GitHub Actions returned malformed job collection.");
    }
    return result.jobs.map((job) => mapJob(job, scope.projectId, runId, workflowId));
  }

  async getJob(scope: CiProjectScope, jobId: string): Promise<CiJob> {
    this.assertScope(scope);
    if (!/^\d{1,16}$/.test(jobId)) throw new Error("Invalid GitHub Actions job ID.");
    const result = await this.request(`/repos/Znect-god/znect-build/actions/jobs/${jobId}`);
    if (!isRecord(result)) throw new Error("GitHub Actions returned malformed job metadata.");
    const runId = String(positiveInteger(result.run_id, "job parent run ID"));
    const run = await this.getRun(scope, runId);
    if (!run.workflowId) throw new Error("GitHub Actions job parent workflow is unavailable.");
    return mapJob(result, scope.projectId, runId, run.workflowId);
  }

  async getJobLogs(scope: CiProjectScope, jobId: string, _options: {
    step: number; execution?: number; stream: "stdout" | "stderr"; maxBytes: number;
  }): Promise<CiLogOutput> {
    await this.getJob(scope, jobId);
    throw new Error("GitHub Actions job logs are available as ZIP archives; per-step text extraction is not supported yet.");
  }

  async getTestReport(scope: CiProjectScope, jobId: string, _maxBytes: number): Promise<CiTestReport> {
    await this.getJob(scope, jobId);
    throw new Error("Structured test reports are not exposed by the current central workflow.");
  }

  async listArtifacts(scope: CiProjectScope, jobId: string): Promise<CiArtifact[]> {
    await this.getJob(scope, jobId);
    throw new Error("GitHub Actions artifacts are run-scoped. Use listRunArtifacts with the verified run ID.");
  }

  async getArtifact(scope: CiProjectScope, jobId: string, _path: string, _maxBytes: number) {
    await this.getJob(scope, jobId);
    throw new Error("ZIP artifact content extraction is not supported by this adapter.");
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
