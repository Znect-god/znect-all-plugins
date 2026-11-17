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
    match_basis: "commit+branch+time" | "commit+time";
  }>;
}

/**
 * Correlate webhook events to API v3 runs conservatively.
 * CircleCI webhook pipeline IDs are deliberately not treated as API v3 run IDs.
 * A candidate requires the same commit SHA and a nearby run execution interval.
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
      const validStart = Number.isFinite(startedAt) ? startedAt : NaN;
      const validEnd = Number.isFinite(completedAt) ? completedAt : NaN;
      if (!Number.isFinite(validStart) && !Number.isFinite(validEnd)) return [];
      // Compare the event to the run's whole execution interval. Events emitted
      // while a run is active have zero distance; malformed/missing endpoints
      // fall back to the valid endpoint instead of hiding an otherwise useful match.
      const intervalStart = Number.isFinite(validStart) ? validStart : validEnd;
      const intervalEnd = Number.isFinite(validEnd) ? validEnd : validStart;
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
        match_basis: eventBranch && run.branch
          ? "commit+branch+time" as const
          : "commit+time" as const
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
