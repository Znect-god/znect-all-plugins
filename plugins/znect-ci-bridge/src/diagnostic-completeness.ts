export type DiagnosticSourceStatus = "available" | "partial" | "unavailable" | "empty" | "none_found";

export function testResultsStatus(input: {
  content?: string;
  truncated?: boolean;
  error?: string;
}): DiagnosticSourceStatus {
  if (input.error) return "unavailable";
  if (input.truncated) return "partial";
  return input.content ? "available" : "empty";
}

export function reportArtifactsStatus(input: {
  artifacts: Array<{ content?: unknown; error?: unknown }>;
  incomplete: boolean;
}): DiagnosticSourceStatus {
  if (input.artifacts.length === 0) return input.incomplete ? "unavailable" : "none_found";
  const successful = input.artifacts.filter((artifact) => typeof artifact.content === "string").length;
  const failed = input.artifacts.length - successful;
  if (successful === 0) return "unavailable";
  if (failed > 0 || input.incomplete) return "partial";
  return "available";
}

export interface DiagnosticsSummaryInput {
  workflowsTotal: number;
  workflowsInspected: number;
  failedJobsInspected: number;
  failedJobLimitReached: boolean;
  jobsTruncated: boolean;
  reportDataIncomplete: boolean;
  reportArtifactLimitReached: boolean;
  logActionsInspected: number;
  logActionLimitReached: boolean;
}

export function buildDiagnosticsSummary(input: DiagnosticsSummaryInput) {
  const workflowsTruncated = input.workflowsTotal > input.workflowsInspected;
  const incomplete = workflowsTruncated ||
    input.jobsTruncated ||
    input.failedJobLimitReached ||
    input.logActionLimitReached ||
    input.reportDataIncomplete ||
    input.reportArtifactLimitReached;

  return {
    workflows_total: input.workflowsTotal,
    workflows_inspected: input.workflowsInspected,
    workflows_truncated: workflowsTruncated,
    failed_jobs_inspected: input.failedJobsInspected,
    failed_job_limit_reached: input.failedJobLimitReached,
    jobs_truncated: input.jobsTruncated,
    report_data_incomplete: input.reportDataIncomplete,
    report_artifact_limit_reached: input.reportArtifactLimitReached,
    incomplete,
    log_actions_inspected: input.logActionsInspected,
    log_action_limit_reached: input.logActionLimitReached
  };
}
