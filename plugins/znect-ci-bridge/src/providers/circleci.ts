import {
  assertCircleCiJobOwnership,
  getCircleCiJob,
  getCircleCiJobArtifact,
  getCircleCiJobStepOutput,
  getCircleCiJobTests,
  getCircleCiRunForProject,
  listCircleCiJobArtifacts,
  listCircleCiJobs,
  listCircleCiRuns,
  listCircleCiWorkflows,
  resolveCircleCiProject,
  type CircleCiArtifact,
  type V3Resource
} from "../circleci-v3";
import type {
  CiArtifact,
  CiArtifactContent,
  CiJob,
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
  return text(attrs.status) ?? text(attrs.phase) ?? text(attrs.current_outcome) ?? "unknown";
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
    ...(iso(attrs.start_time) ? { startedAt: iso(attrs.start_time) } : {}),
    ...(iso(attrs.stop_time) ? { completedAt: iso(attrs.stop_time) } : {}),
    ...(text(attrs.url) ? { url: text(attrs.url) } : {})
  };
}

function mapWorkflow(resource: V3Resource, runId: string): CiWorkflow {
  const attrs = attributes(resource);
  return {
    id: resource.id,
    runId,
    ...(text(attrs.name) ? { name: text(attrs.name) } : {}),
    ...(text(attrs.status) || text(attrs.outcome) ? { status: text(attrs.status) ?? text(attrs.outcome) } : {})
  };
}

function mapJob(resource: V3Resource, projectId: string, workflowId: string): CiJob {
  const attrs = attributes(resource);
  return {
    id: resource.id,
    projectId,
    workflowId,
    status: statusOf(resource),
    ...(text(attrs.name) ? { name: text(attrs.name) } : {}),
    ...(iso(attrs.start_time) ? { startedAt: iso(attrs.start_time) } : {}),
    ...(iso(attrs.stop_time) ? { completedAt: iso(attrs.stop_time) } : {})
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

  constructor(
    private readonly token: string,
    private readonly projectSlug: string,
    private readonly connectionId: string
  ) {}

  private assertScope(scope: CiProjectScope): void {
    if (!scope.projectId || scope.connectionId !== this.connectionId) {
      throw new Error("CI provider scope does not match the configured CircleCI connection.");
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
    const project = await this.project(scope);
    const run = await getCircleCiRunForProject(this.token, runId, project.id);
    return mapRun(run, scope.projectId);
  }

  async listWorkflows(scope: CiProjectScope, runId: string): Promise<CiWorkflow[]> {
    await this.getRun(scope, runId);
    const workflows = await listCircleCiWorkflows(this.token, runId);
    return workflows.map((workflow) => mapWorkflow(workflow, runId));
  }

  async listJobs(scope: CiProjectScope, runId: string, workflowId: string): Promise<CiJob[]> {
    const workflows = await this.listWorkflows(scope, runId);
    if (!workflows.some((workflow) => workflow.id === workflowId)) {
      throw new Error("CircleCI workflow does not belong to the selected run and project.");
    }
    const jobs = await listCircleCiJobs(this.token, workflowId);
    return jobs.map((job) => mapJob(job, scope.projectId, workflowId));
  }

  async getJob(scope: CiProjectScope, jobId: string): Promise<CiJob> {
    const project = await this.project(scope);
    const job = await getCircleCiJob(this.token, jobId);
    assertCircleCiJobOwnership(job, project.id);
    const workflowId = workflowReference(job);
    if (!workflowId) throw new Error("CircleCI job is missing its workflow ownership reference.");
    return mapJob(job, scope.projectId, workflowId);
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
  connectionId: string
): ReadOnlyCiProviderAdapter {
  return new CircleCiReadOnlyAdapter(token, projectSlug, connectionId);
}
