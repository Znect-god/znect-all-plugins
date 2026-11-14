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
  return {
    id: resource.id,
    projectId,
    status: statusOf(resource),
    ...(text(attrs.branch) ? { branch: text(attrs.branch) } : {}),
    ...(text(attrs.vcs_revision) ? { commitSha: text(attrs.vcs_revision) } : {}),
    ...(text(attrs.subject) ? { commitMessage: text(attrs.subject) } : {}),
    ...(iso(attrs.start_time ?? attrs.created_at) ? { startedAt: iso(attrs.start_time ?? attrs.created_at) } : {}),
    ...(iso(attrs.stop_time ?? attrs.stopped_at) ? { completedAt: iso(attrs.stop_time ?? attrs.stopped_at) } : {}),
    ...(text(attrs.url ?? attrs.web_url) ? { url: text(attrs.url ?? attrs.web_url) } : {})
  };
}

function mapWorkflow(resource: V3Resource, runId: string): CiWorkflow {
  const attrs = attributes(resource);
  return {
    id: resource.id,
    runId,
    ...(text(attrs.name) ? { name: text(attrs.name) } : {}),
    ...(text(attrs.outcome) || text(attrs.status) ? { status: text(attrs.outcome) ?? text(attrs.status) } : {})
  };
}

function mapJobSteps(attrs: Record<string, unknown>): CiJobStep[] {
  if (!Array.isArray(attrs.parallel_executions)) return [];
  const result: CiJobStep[] = [];
  for (const execution of attrs.parallel_executions) {
    if (execution === null || typeof execution !== "object" || Array.isArray(execution)) continue;
    const executionRecord = execution as Record<string, unknown>;
    const executionIndex = typeof executionRecord.execution === "number" && Number.isInteger(executionRecord.execution)
      ? executionRecord.execution
      : 0;
    if (!Array.isArray(executionRecord.steps)) continue;
    for (const step of executionRecord.steps) {
      if (step === null || typeof step !== "object" || Array.isArray(step)) continue;
      const stepRecord = step as Record<string, unknown>;
      const actions = Array.isArray(stepRecord.actions) ? stepRecord.actions : [];
      result.push({
        execution: executionIndex,
        ...(text(stepRecord.name) ? { name: text(stepRecord.name) } : {}),
        actions: actions.flatMap((candidate) => {
          if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) return [];
          const action = candidate as Record<string, unknown>;
          return [{
            ...(text(action.name) ? { name: text(action.name) } : {}),
            ...(text(action.status) ? { status: text(action.status) } : {}),
            ...(text(action.outcome) ? { outcome: text(action.outcome) } : {}),
            ...(typeof action.exit_code === "number" ? { exitCode: action.exit_code } : {}),
            ...(typeof action.step_num === "number" && Number.isInteger(action.step_num)
              ? { stepNumber: action.step_num } : {})
          }];
        })
      });
    }
  }
  return result;
}

function mapJob(resource: V3Resource, projectId: string, workflowId?: string, runId?: string): CiJob {
  const attrs = attributes(resource);
  const steps = mapJobSteps(attrs);
  return {
    id: resource.id,
    projectId,
    ...(runId ? { runId } : {}),
    ...(workflowId ? { workflowId } : {}),
    status: statusOf(resource),
    ...(text(attrs.name) ? { name: text(attrs.name) } : {}),
    ...(iso(attrs.start_time ?? attrs.created_at) ? { startedAt: iso(attrs.start_time ?? attrs.created_at) } : {}),
    ...(iso(attrs.stop_time ?? attrs.stopped_at) ? { completedAt: iso(attrs.stop_time ?? attrs.stopped_at) } : {}),
    ...(steps.length ? { steps } : {})
  };
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
    this.projectPromise ??= resolveCircleCiProject(this.token, this.projectSlug);
    return this.projectPromise;
  }

  async listRuns(scope: CiProjectScope, limit: number): Promise<CiRun[]> {
    const project = await this.project(scope);
    const runs = await listCircleCiRuns(this.token, project.id, limit);
    return runs.map((run) => mapRun(run, scope.projectId));
  }

  async getRun(scope: CiProjectScope, runId: string): Promise<CiRun> {
    this.assertScope(scope);
    let pending = this.runCache.get(runId);
    if (!pending) {
      pending = (async () => {
        const project = await this.project(scope);
        const run = await getCircleCiRunForProject(this.token, runId, project.id);
        return mapRun(run, scope.projectId);
      })();
      this.runCache.set(runId, pending);
    }
    return pending;
  }

  async listWorkflows(scope: CiProjectScope, runId: string): Promise<CiWorkflow[]> {
    await this.getRun(scope, runId);
    let pending = this.workflowCache.get(runId);
    if (!pending) {
      pending = listCircleCiWorkflows(this.token, runId, 2)
        .then((workflows) => {
          for (const workflow of workflows) assertCircleCiWorkflowOwnership(workflow, runId);
          return workflows.map((workflow) => mapWorkflow(workflow, runId));
        });
      this.workflowCache.set(runId, pending);
    }
    return pending;
  }

  async listJobs(scope: CiProjectScope, runId: string, workflowId: string): Promise<CiJob[]> {
    const workflows = await this.listWorkflows(scope, runId);
    if (!workflows.some((workflow) => workflow.id === workflowId)) {
      throw new Error("CircleCI workflow does not belong to the selected run and project.");
    }
    const project = await this.project(scope);
    const jobs = await listCircleCiJobs(this.token, workflowId, 2);
    for (const job of jobs) assertCircleCiJobOwnership(job, project.id, workflowId);
    return jobs.map((job) => mapJob(job, scope.projectId, workflowId, runId));
  }

  async getJob(scope: CiProjectScope, jobId: string): Promise<CiJob> {
    this.assertScope(scope);
    let pending = this.jobCache.get(jobId);
    if (!pending) {
      pending = (async () => {
        const project = await this.project(scope);
        const job = await getCircleCiJob(this.token, jobId);
        assertCircleCiJobOwnership(job, project.id);
        const workflowId = workflowReference(job);
        if (workflowId && !isCircleCiUuid(workflowId)) {
          throw new Error("CircleCI job contains an invalid workflow ownership reference.");
        }
        return mapJob(job, scope.projectId, workflowId);
      })();
      this.jobCache.set(jobId, pending);
    }
    return pending;
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
