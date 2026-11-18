import { describe, expect, it } from "vitest";
import {
  buildDiagnosticsSummary,
  reportArtifactsStatus,
  testResultsStatus
} from "../src/diagnostic-completeness";

describe("diagnostic source completeness", () => {
  it("distinguishes available, empty, truncated and unavailable structured test results", () => {
    expect(testResultsStatus({ content: '{"tests":1}' })).toBe("available");
    expect(testResultsStatus({ content: "" })).toBe("empty");
    expect(testResultsStatus({ content: '{"tests":', truncated: true })).toBe("partial");
    expect(testResultsStatus({ error: "unavailable" })).toBe("unavailable");
  });

  it("distinguishes absent, available, partial and unavailable JUnit artifacts", () => {
    expect(reportArtifactsStatus({ artifacts: [], incomplete: false })).toBe("none_found");
    expect(reportArtifactsStatus({ artifacts: [{ content: "<testsuite/>" }], incomplete: false })).toBe("available");
    expect(reportArtifactsStatus({
      artifacts: [{ content: "<testsuite/>" }, { error: "failed" }],
      incomplete: true
    })).toBe("partial");
    expect(reportArtifactsStatus({ artifacts: [{ error: "failed" }], incomplete: true })).toBe("unavailable");
    expect(reportArtifactsStatus({ artifacts: [], incomplete: true })).toBe("unavailable");
  });

  it("uses the same overall incompleteness rules for MCP and Browser API summaries", () => {
    const base = {
      workflowsTotal: 2,
      workflowsInspected: 2,
      failedJobsInspected: 1,
      failedJobLimitReached: false,
      jobsTruncated: false,
      reportDataIncomplete: false,
      reportArtifactLimitReached: false,
      logActionsInspected: 1,
      logActionLimitReached: false
    };

    expect(buildDiagnosticsSummary(base)).toEqual({
      workflows_total: 2,
      workflows_inspected: 2,
      workflows_truncated: false,
      failed_jobs_inspected: 1,
      failed_job_limit_reached: false,
      jobs_truncated: false,
      report_data_incomplete: false,
      report_artifact_limit_reached: false,
      incomplete: false,
      log_actions_inspected: 1,
      log_action_limit_reached: false
    });
    expect(buildDiagnosticsSummary({ ...base, reportDataIncomplete: true }).incomplete).toBe(true);
    expect(buildDiagnosticsSummary({ ...base, logActionLimitReached: true }).incomplete).toBe(true);
    expect(buildDiagnosticsSummary({ ...base, failedJobLimitReached: true }).incomplete).toBe(true);
    expect(buildDiagnosticsSummary({ ...base, jobsTruncated: true }).incomplete).toBe(true);
    expect(buildDiagnosticsSummary({ ...base, workflowsInspected: 1 }).incomplete).toBe(true);
    expect(buildDiagnosticsSummary({ ...base, reportArtifactLimitReached: true }).incomplete).toBe(false);
  });

  it("keeps the artifact-limit indicator distinct while incomplete report data controls overall completeness", () => {
    const summary = buildDiagnosticsSummary({
      workflowsTotal: 1,
      workflowsInspected: 1,
      failedJobsInspected: 1,
      failedJobLimitReached: false,
      jobsTruncated: false,
      reportDataIncomplete: true,
      reportArtifactLimitReached: true,
      logActionsInspected: 0,
      logActionLimitReached: false
    });

    expect(summary.report_artifact_limit_reached).toBe(true);
    expect(summary.report_data_incomplete).toBe(true);
    expect(summary.incomplete).toBe(true);
  });
});
