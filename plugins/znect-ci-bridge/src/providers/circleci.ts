import {
  assertCircleCiJobOwnership,
  assertCircleCiWorkflowOwnership,
  getCircleCiJob,
  getCircleCiJobArtifact,
  getCircleCiJobStepOutput,
  getCircleCiJobTests,
  getCircleCiRunForProject,
  listCircleCiJobArtifacts,
  listCircleCiJobs,
  listCircleCiRuns,
  listCircleCiWorkflows,
  isCircleCiUuid,
  resolveCircleCiProject,
  type CircleCiArtifact,
  type V3Resource
} from "../circleci-v3";
import type {
  CiArtifact,
  CiArtifactContent,
  CiJob,
  CiJobStep,
  CiLogOutput,
  CiProjectScope,
  CiRun,
  CiTestReport,
  CiWorkflow,
  ReadOnlyCiProviderAdapter
} from "./contract";

function attributes(resource: V3Resource): Record<string, unknown> {
  return resource.attributes ?? {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function statusOf(resource: V3Resource): string {
  const attrs = attributes(resource);
  return text(attrs.outcome) ?? text(attrs.current_outcome) ?? text(attrs.status) ?? text(attrs.phase) ?? "unknown";
}

/** CircleCI Run outcomes can change on reruns; current_outcome is authoritative. */
function runStatusOf(resource: V3Resource): string {
  const attrs = attributes(resource);
  return text(attrs.current_outcome) ?? text(attrs.phase) ?? text(attrs.status) ?? "unknown";
}

function iso(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function workflowReference(resource: V3Resource): string | undefined {
  const workflow = resource.references?.workflow;
  if (workflow === null || typeof workflow !== "object" || Array.isArray(workflow)) return undefined;
  return text((workflow as Record<string, unknown>).id);
}

function mapRun(resource: V3Resource, projectId: string): CiRun {
  const attrs = attributes(resource);
  const event = resource.references?.event;
  const eventAttributes = event !== null && typeof event === "object" && !Array.isArray(event)
    ? (event as Record<string, unknown>).attributes
    : undefined;
  const vcs = eventAttributes !== null && typeof eventAttributes === "object" && !Array.isArray(eventAttributes)
    ? (eventAttributes as Record<string, unknown>).vcs
    : undefined;
  const vcsRecord = vcs !== null && typeof vcs === "object" && !Array.isArray(vcs)
    ? vcs as Record<string, unknown>
    : {};
  const commit = vcsRecord.commit !== null && typeof vcsRecord.commit === "object" && !Array.isArray(vcsRecord.commit)
    ? vcsRecord.commit as Record<string, unknown>
    : {};
  const branch = text(vcsRecord.branch);
  // The API v3 Run schema exposes the revision only at references.event.attributes.vcs.revision.
  // Do not consume an undocumented top-level alias as trusted provenance.
  const commitSha = text(vcsRecord.revision);
  const commitMessage = text(commit.subject) ?? text(commit.body);
  const createdAt = iso(attrs.created_at);
  return {
    id: resource.id,
    projectId,
    status: runStatusOf(resource),
    ...(branch ? { branch } : {}),
    ...(commitSha ? { commitSha } : {}),
    ...(commitMessage ? { commitMessage } : {}),
    ...(createdAt ? { createdAt } : {})
  };
}

function mapWorkflow(resource: V3Resource, runId: string): CiWorkflow {
  const attrs = attributes(resource);
  const status = statusOf(resource);
  return {
    id: resource.id,
    runId,
    ...(text(attrs.name) ? { name: text(attrs.name) } : {}),
    ...(status !== "unknown" ? { status } : {})
  };
}

function mapJobSteps(attrs: Record<string, unknown>): CiJobStep[] {
  const executions = attrs.parallel_executions;
  if (executions === undefined || executions === null) return [];
  if (!Array.isArray(executions)) {
    throw new Error("CircleCI API v3 returned malformed job parallel-execution data.");
  }
  const result: CiJobStep[] = [];
  // API v3 returns parallel executions as an ordered array; the array position
  // is the execution number. Each entry contains step records directly (not
  // nested action arrays).
  for (let executionIndex = 0; executionIndex < executions.length; executionIndex++) {
    const execution = executions[executionIndex];
    if (execution === null || typeof execution !== "object" || Array.isArray(execution)) {
      throw new Error("CircleCI API v3 returned malformed job parallel-execution data.");
    }
    const executionRecord = execution as Record<string, unknown>;
    if (!Array.isArray(executionRecord.steps)) {
      throw new Error("CircleCI API v3 returned malformed job step data.");
    }
    for (const step of executionRecord.steps) {
      if (step === null || typeof step !== "object" || Array.isArray(step)) {
        throw new Error("CircleCI API v3 returned malformed job step data.");
      }
      const stepRecord = step as Record<string, unknown>;
      if (
        typeof stepRecord.name !== "string" ||
        typeof stepRecord.num !== "number" ||
        !Number.isInteger(stepRecord.num) ||
        stepRecord.num < 0 ||
        typeof stepRecord.phase !== "string" ||
        typeof stepRecord.type !== "string" ||
        typeof stepRecord.is_insignificant !== "boolean" ||
        (stepRecord.outcome !== undefined && stepRecord.outcome !== null && typeof stepRecord.outcome !== "string") ||
        (stepRecord.exit_code !== undefined && stepRecord.exit_code !== null &&
          (typeof stepRecord.exit_code !== "number" || !Number.isInteger(stepRecord.exit_code)))
      ) {
        throw new Error("CircleCI API v3 returned malformed job step data.");
      }
      const name = text(stepRecord.name);
      const outcome = text(stepRecord.outcome);
      const phase = text(stepRecord.phase);
      result.push({
        execution: executionIndex,
        ...(name ? { name } : {}),
        actions: [{
          ...(name ? { name } : {}),
          ...(outcome ?? phase ? { status: outcome ?? phase } : {}),
          ...(outcome ? { outcome } : {}),
          ...(typeof stepRecord.exit_code === "number" ? { exitCode: stepRecord.exit_code } : {}),
          stepNumber: stepRecord.num,
          isInsignificant: stepRecord.is_insignificant
        }]
      });
    }
  }
  return result;
}

function mapJob(resource: V3Resource, projectId: string, workflowId?: string, runId?: string): CiJob {
  const attrs = attributes(resource);
  const steps = mapJobSteps(attrs);
  const startedAt = iso(attrs.started_at);
  const completedAt = iso(attrs.ended_at);
  return {
    id: resource.id,
    projectId,
    ...(runId ? { runId } : {}),
    ...(workflowId ? { workflowId } : {}),
    status: statusOf(resource),
    ...(text(attrs.name) ? { name: text(attrs.name) } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(completedAt ? { completedAt } : {}),
    ...(steps.length ? { steps } : {})
  };
}

function cachedPromise<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  const existing = cache.get(key);
  if (existing) return existing;
  const pending = load();
  cache.set(key, pending);
  // A transient API/auth/network failure must not poison this adapter instance.
  // Concurrent callers still share the in-flight request; only rejected work is evicted.
  void pending.catch(() => {
    if (cache.get(key) === pending) cache.delete(key);
  });
  return pending;
}

function mapArtifact(artifact: CircleCiArtifact, jobId: string): CiArtifact | undefined {
  const path = text(artifact.attributes?.path);
  if (!path) return undefined;
  return {
    id: text(artifact.id) ?? path,
    jobId,
    path,
    ...(typeof artifact.attributes?.size === "number" && Number.isFinite(artifact.attributes.size)
      ? { size: artifact.attributes.size } : {})
  };
}

/**
 * CircleCI implementation of the shared read-only provider contract.
 * Every operation checks that the caller's Bridge connection matches this
 * adapter and validates resource ownership before reading sensitive job data.
 */
export class CircleCiReadOnlyAdapter implements ReadOnlyCiProviderAdapter {
  readonly provider = "circleci" as const;
  private projectPromise?: ReturnType<typeof resolveCircleCiProject>;
  private readonly runCache = new Map<string, Promise<CiRun>>();
  private readonly workflowCache = new Map<string, Promise<CiWorkflow[]>>();
  private readonly jobCache = new Map<string, Promise<CiJob>>();

  constructor(
    private readonly token: string,
    private readonly projectSlug: string,
    private readonly projectId: string,
    private readonly connectionId: string
  ) {}

  private assertScope(scope: CiProjectScope): void {
    if (scope.projectId !== this.projectId || scope.connectionId !== this.connectionId) {
      throw new Error("CI provider scope does not match the configured CircleCI project connection.");
    }
  }

  private async project(scope: CiProjectScope) {
    this.assertScope(scope);
    const pending = this.projectPromise ??= resolveCircleCiProject(this.token, this.projectSlug);
    // Project resolution is shared while in flight, but a rejected lookup can be retried.
    void pending.catch(() => {
      if (this.projectPromise === pending) this.projectPromise = undefined;
    });
    return pending;
  }

  async listRuns(scope: CiProjectScope, limit: number): Promise<CiRun[]> {
    const project = await this.project(scope);
    const runs = await listCircleCiRuns(this.token, project.id, limit);
    return runs.map((run) => mapRun(run, scope.projectId));
  }

  async getRun(scope: CiProjectScope, runId: string): Promise<CiRun> {
    this.assertScope(scope);
    return cachedPromise(this.runCache, runId, async () => {
      const project = await this.project(scope);
      const run = await getCircleCiRunForProject(this.token, runId, project.id);
      return mapRun(run, scope.projectId);
    });
  }

  async listWorkflows(scope: CiProjectScope, runId: string): Promise<CiWorkflow[]> {
    await this.getRun(scope, runId);
    return cachedPromise(this.workflowCache, runId, async () => {
      const workflows = await listCircleCiWorkflows(this.token, runId, 2);
      for (const workflow of workflows) assertCircleCiWorkflowOwnership(workflow, runId);
      return workflows.map((workflow) => mapWorkflow(workflow, runId));
    });
  }

  async listJobs(scope: CiProjectScope, runId: string, workflowId: string): Promise<CiJob[]> {
    const workflows = await this.listWorkflows(scope, runId);
    if (!workflows.some((workflow) => workflow.id === workflowId)) {
      throw new Error("CircleCI workflow does not belong to the selected run and project.");
    }
    const project = await this.project(scope);
    const jobs = await listCircleCiJobs(this.token, workflowId);
    for (const job of jobs) assertCircleCiJobOwnership(job, project.id, workflowId);
    return jobs.map((job) => mapJob(job, scope.projectId, workflowId, runId));
  }

  async getJob(scope: CiProjectScope, jobId: string): Promise<CiJob> {
    this.assertScope(scope);
    return cachedPromise(this.jobCache, jobId, async () => {
      const project = await this.project(scope);
      const job = await getCircleCiJob(this.token, jobId);
      assertCircleCiJobOwnership(job, project.id);
      const workflowId = workflowReference(job);
      if (workflowId && !isCircleCiUuid(workflowId)) {
        throw new Error("CircleCI job contains an invalid workflow ownership reference.");
      }
      return mapJob(job, scope.projectId, workflowId);
    });
  }

  async getJobLogs(scope: CiProjectScope, jobId: string, options: {
    step: number;
    execution?: number;
    stream: "stdout" | "stderr";
    maxBytes: number;
  }): Promise<CiLogOutput> {
    await this.getJob(scope, jobId);
    return getCircleCiJobStepOutput(
      this.token, jobId, options.step, options.stream, options.execution ?? 0, options.maxBytes
    );
  }

  async getTestReport(scope: CiProjectScope, jobId: string, maxBytes: number): Promise<CiTestReport> {
    await this.getJob(scope, jobId);
    const result = await getCircleCiJobTests(this.token, jobId, maxBytes);
    return { format: "jsonl", content: result.text, truncated: result.truncated };
  }

  async listArtifacts(scope: CiProjectScope, jobId: string): Promise<CiArtifact[]> {
    await this.getJob(scope, jobId);
    const artifacts = await listCircleCiJobArtifacts(this.token, jobId);
    return artifacts.map((artifact) => mapArtifact(artifact, jobId))
      .filter((artifact): artifact is CiArtifact => artifact !== undefined);
  }

  async getArtifact(scope: CiProjectScope, jobId: string, path: string, maxBytes: number): Promise<CiArtifactContent> {
    await this.getJob(scope, jobId);
    const result = await getCircleCiJobArtifact(this.token, jobId, path, maxBytes);
    return { path: result.path, content: result.text, truncated: result.truncated };
  }
}

export function createCircleCiReadOnlyAdapter(
  token: string,
  projectSlug: string,
  projectId: string,
  connectionId: string
): ReadOnlyCiProviderAdapter {
  return new CircleCiReadOnlyAdapter(token, projectSlug, projectId, connectionId);
}
