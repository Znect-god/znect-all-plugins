import type { CiRun } from "./providers/contract";

export interface EventRunCorrelation {
  event: Record<string, unknown>;
  status: "candidate" | "ambiguous" | "unmatched";
  reason?: "missing_revision" | "no_matching_run";
  candidate_count: number;
  candidates_truncated: boolean;
  candidates: Array<{
    run: CiRun;
    time_delta_ms: number;
    match_basis: "commit+branch+time" | "commit+time" | "commit+branch+created-at" | "commit+created-at";
  }>;
}

/**
 * Correlate webhook events to API v3 runs conservatively.
 * CircleCI webhook pipeline IDs are deliberately not treated as API v3 run IDs.
 * A candidate requires the same commit SHA and a nearby run execution interval; when API v3 exposes only the run creation timestamp, that timestamp is used as a conservative point-in-time fallback.
 */
export function correlateEventsWithRuns(
  events: unknown[],
  runs: CiRun[],
  maxTimeDeltaMs = 24 * 60 * 60 * 1000
): EventRunCorrelation[] {
  if (!Number.isFinite(maxTimeDeltaMs) || maxTimeDeltaMs < 0) {
    throw new RangeError("Correlation time window must be a finite non-negative number.");
  }
  return events.map((value): EventRunCorrelation => {
    const event = value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    const revision = typeof event.revision === "string" ? event.revision.toLowerCase() : "";
    if (!revision) {
      return { event, status: "unmatched", reason: "missing_revision", candidate_count: 0, candidates_truncated: false, candidates: [] };
    }
    const happenedAt = typeof event.happened_at === "string" ? Date.parse(event.happened_at) : NaN;
    if (!Number.isFinite(happenedAt)) {
      return { event, status: "unmatched", reason: "no_matching_run", candidate_count: 0, candidates_truncated: false, candidates: [] };
    }

    const candidates = runs.flatMap((run) => {
      if (!run.commitSha || run.commitSha.toLowerCase() !== revision) return [];
      const eventBranch = typeof event.branch === "string" ? event.branch : undefined;
      if (eventBranch && run.branch && eventBranch !== run.branch) return [];
      const startedAt = typeof run.startedAt === "string" ? Date.parse(run.startedAt) : NaN;
      const completedAt = typeof run.completedAt === "string" ? Date.parse(run.completedAt) : NaN;
      const createdAt = typeof run.createdAt === "string" ? Date.parse(run.createdAt) : NaN;
      const validStart = Number.isFinite(startedAt) ? startedAt : NaN;
      const validEnd = Number.isFinite(completedAt) ? completedAt : NaN;
      const hasExecutionInterval = Number.isFinite(validStart) || Number.isFinite(validEnd);
      const validCreatedAt = Number.isFinite(createdAt) ? createdAt : NaN;
      if (!hasExecutionInterval && !Number.isFinite(validCreatedAt)) return [];
      // Prefer a real execution interval when a provider supplies one. CircleCI
      // API v3 Run currently documents created_at but not start/end timestamps,
      // so its run is compared as a point in time rather than mislabelled as an interval.
      const intervalStart = hasExecutionInterval
        ? (Number.isFinite(validStart) ? validStart : validEnd)
        : validCreatedAt;
      const intervalEnd = hasExecutionInterval
        ? (Number.isFinite(validEnd) ? validEnd : validStart)
        : validCreatedAt;
      if (intervalEnd < intervalStart) return [];
      const delta = happenedAt < intervalStart
        ? intervalStart - happenedAt
        : happenedAt > intervalEnd
          ? happenedAt - intervalEnd
          : 0;
      if (delta > maxTimeDeltaMs) return [];
      return [{
        run,
        time_delta_ms: delta,
        match_basis: hasExecutionInterval
          ? (eventBranch && run.branch ? "commit+branch+time" as const : "commit+time" as const)
          : (eventBranch && run.branch ? "commit+branch+created-at" as const : "commit+created-at" as const)
      }];
    }).sort((left, right) => left.time_delta_ms - right.time_delta_ms);

    return {
      event,
      status: candidates.length === 1 ? "candidate" : candidates.length > 1 ? "ambiguous" : "unmatched",
      ...(candidates.length === 0 ? { reason: "no_matching_run" as const } : {}),
      candidate_count: candidates.length,
      candidates_truncated: candidates.length > 3,
      candidates: candidates.slice(0, 3)
    };
  });
}
