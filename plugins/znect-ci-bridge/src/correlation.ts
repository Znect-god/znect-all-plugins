import type { CiRun } from "./providers/contract";

export interface EventRunCorrelation {
  event: Record<string, unknown>;
  status: "matched" | "ambiguous" | "unmatched";
  reason?: "missing_revision" | "no_matching_run";
  candidates: Array<{
    run: CiRun;
    time_delta_ms: number;
    match_basis: "commit+branch+time" | "commit+time";
  }>;
}

/**
 * Correlate webhook events to API v3 runs conservatively.
 * CircleCI webhook pipeline IDs are deliberately not treated as API v3 run IDs.
 * A candidate requires the same commit SHA and a nearby run completion/start time.
 */
export function correlateEventsWithRuns(
  events: unknown[],
  runs: CiRun[],
  maxTimeDeltaMs = 24 * 60 * 60 * 1000
): EventRunCorrelation[] {
  return events.map((value) => {
    const event = value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    const revision = typeof event.revision === "string" ? event.revision.toLowerCase() : "";
    if (!revision) {
      return { event, status: "unmatched", reason: "missing_revision", candidates: [] };
    }
    const happenedAt = typeof event.happened_at === "string" ? Date.parse(event.happened_at) : NaN;
    if (!Number.isFinite(happenedAt)) {
      return { event, status: "unmatched", reason: "no_matching_run", candidates: [] };
    }

    const candidates = runs.flatMap((run) => {
      if (!run.commitSha || run.commitSha.toLowerCase() !== revision) return [];
      const eventBranch = typeof event.branch === "string" ? event.branch : undefined;
      if (eventBranch && run.branch && eventBranch !== run.branch) return [];
      const runTime = Date.parse(run.completedAt ?? run.startedAt ?? "");
      if (!Number.isFinite(runTime)) return [];
      const delta = Math.abs(happenedAt - runTime);
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
      status: candidates.length === 1 ? "matched" : candidates.length > 1 ? "ambiguous" : "unmatched",
      ...(candidates.length === 0 ? { reason: "no_matching_run" as const } : {}),
      candidates: candidates.slice(0, 3)
    };
  });
}
