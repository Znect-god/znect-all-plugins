/**
 * Provider-neutral, read-only CI model.
 *
 * This is the adapter boundary for CircleCI and the future native Znect Build
 * integration. It deliberately contains no provider credentials or write methods.
 */
export type CiProviderId = "circleci" | "znect-build";

export interface CiProjectScope {
  /** Stable Bridge registry ID, never a provider-native slug. */
  projectId: string;
  /** Provider connection ID from the project registry. */
  connectionId: string;
}

export interface CiRun {
  id: string;
  projectId: string;
  status: string;
  branch?: string;
  commitSha?: string;
  commitMessage?: string;
  startedAt?: string;
  completedAt?: string;
  url?: string;
  componentId?: string;
}

export interface CiWorkflow {
  id: string;
  runId: string;
  name?: string;
  status?: string;
}

export interface CiJob {
  id: string;
  projectId: string;
  runId?: string;
  workflowId?: string;
  name?: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CiLogOutput {
  text: string;
  truncated: boolean;
}

export interface CiTestReport {
  format: "jsonl" | "junit" | "json" | "unknown";
  content: string;
  truncated: boolean;
}

export interface CiArtifact {
  id: string;
  jobId: string;
  path: string;
  size?: number;
  contentType?: string;
}

export interface CiArtifactContent {
  path: string;
  content: string;
  truncated: boolean;
}

/**
 * Provider adapters expose only bounded reads. Implementations must verify
 * resource ownership against scope before returning logs, tests or artifacts.
 */
export interface ReadOnlyCiProviderAdapter {
  readonly provider: CiProviderId;
  listRuns(scope: CiProjectScope, limit: number): Promise<CiRun[]>;
  getRun(scope: CiProjectScope, runId: string): Promise<CiRun>;
  listWorkflows(scope: CiProjectScope, runId: string): Promise<CiWorkflow[]>;
  listJobs(scope: CiProjectScope, runId: string, workflowId: string): Promise<CiJob[]>;
  getJob(scope: CiProjectScope, jobId: string): Promise<CiJob>;
  getJobLogs(scope: CiProjectScope, jobId: string, options: {
    step: number;
    execution?: number;
    stream: "stdout" | "stderr";
    maxBytes: number;
  }): Promise<CiLogOutput>;
  getTestReport(scope: CiProjectScope, jobId: string, maxBytes: number): Promise<CiTestReport>;
  listArtifacts(scope: CiProjectScope, jobId: string): Promise<CiArtifact[]>;
  getArtifact(scope: CiProjectScope, jobId: string, path: string, maxBytes: number): Promise<CiArtifactContent>;
}
