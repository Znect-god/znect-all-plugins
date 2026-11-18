import type { CiArtifact, CiArtifactContent, CiProjectScope, ReadOnlyCiProviderAdapter } from "./providers/contract";

export const MAX_REPORT_ARTIFACTS_PER_JOB = 4;
export const MAX_REPORT_BYTES_PER_JOB = 500_000;

export interface JobReportArtifact {
  path?: string;
  size?: number;
  execution?: number;
  content?: string;
  error?: string;
}

export interface JobReportArtifactCollection {
  artifacts: JobReportArtifact[];
  incomplete: boolean;
  limitReached: boolean;
}

type ReportArtifactAdapter = Pick<ReadOnlyCiProviderAdapter, "listArtifacts" | "getArtifact">;

/** Collect bounded JUnit XML reports while preserving CircleCI parallel-execution identity. */
export async function collectJobReportArtifacts(
  adapter: ReportArtifactAdapter,
  scope: CiProjectScope,
  jobId: string
): Promise<JobReportArtifactCollection> {
  const artifacts: JobReportArtifact[] = [];
  let incomplete = false;
  let limitReached = false;
  let remainingBytes = MAX_REPORT_BYTES_PER_JOB;

  const listed: CiArtifact[] = await adapter.listArtifacts(scope, jobId);
  const candidates = listed.filter((artifact) => /(?:junit|test-results).*\.xml$/i.test(artifact.path));
  if (candidates.length > MAX_REPORT_ARTIFACTS_PER_JOB) {
    incomplete = true;
    limitReached = true;
  }

  for (const artifact of candidates.slice(0, MAX_REPORT_ARTIFACTS_PER_JOB)) {
    if (remainingBytes <= 0 || (typeof artifact.size === "number" && artifact.size > remainingBytes)) {
      incomplete = true;
      limitReached = true;
      continue;
    }

    try {
      const report: CiArtifactContent = await adapter.getArtifact(
        scope, jobId, artifact.path, remainingBytes, artifact.execution
      );
      const actualBytes = new TextEncoder().encode(report.content).byteLength;
      if (actualBytes > remainingBytes) {
        // Fail closed if an adapter violates its per-download byte contract.
        artifacts.push({
          path: artifact.path,
          ...(typeof artifact.size === "number" ? { size: artifact.size } : {}),
          ...(typeof report.execution === "number" ? { execution: report.execution } : {}),
          error: "Retrieved report exceeded the remaining byte budget."
        });
        incomplete = true;
        limitReached = true;
        continue;
      }
      remainingBytes -= actualBytes;
      artifacts.push({
        path: artifact.path,
        ...(typeof artifact.size === "number" ? { size: artifact.size } : {}),
        ...(typeof report.execution === "number" ? { execution: report.execution } : {}),
        content: report.content
      });
      if (report.truncated) incomplete = true;
    } catch {
      artifacts.push({
        path: artifact.path,
        ...(typeof artifact.size === "number" ? { size: artifact.size } : {}),
        ...(typeof artifact.execution === "number" ? { execution: artifact.execution } : {}),
        error: "Unable to retrieve this report artifact."
      });
      incomplete = true;
    }
  }

  return { artifacts, incomplete, limitReached };
}
