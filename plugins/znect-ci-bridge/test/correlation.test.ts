import { describe, expect, it } from "vitest";
import { correlateEventsWithRuns } from "../src/correlation";
import type { CiRun } from "../src/providers/contract";

const revision = "a".repeat(40);
const event = {
  id: "3888f21b-eaa7-38e3-8f3d-75a63bba0001",
  happened_at: "2026-11-17T18:00:00.000Z",
  branch: "work/bridge",
  revision
};
const run = (overrides: Partial<CiRun> = {}): CiRun => ({
  id: "123e4567-e89b-42d3-a456-426614174001",
  projectId: "znect-forge",
  status: "success",
  branch: "work/bridge",
  commitSha: revision,
  completedAt: "2026-11-17T18:01:00.000Z",
  ...overrides
});

describe("webhook event and CircleCI API run correlation", () => {
  it("rejects invalid correlation time windows", () => {
    expect(() => correlateEventsWithRuns([event], [run()], -1)).toThrow("finite non-negative number");
    expect(() => correlateEventsWithRuns([event], [run()], Number.NaN)).toThrow("finite non-negative number");
  });

  it("matches an exact revision, branch and nearby completion time", () => {
    const [result] = correlateEventsWithRuns([event], [run()]);
    expect(result.status).toBe("candidate");
    expect(result.candidates[0]).toMatchObject({
      run: { id: "123e4567-e89b-42d3-a456-426614174001" },
      time_delta_ms: 60_000,
      match_basis: "commit+branch+time"
    });
  });

  it("does not correlate a different branch or a run outside the time window", () => {
    const [wrongBranch] = correlateEventsWithRuns([event], [run({ branch: "main" })]);
    const [tooOld] = correlateEventsWithRuns([event], [run({
      completedAt: "2026-11-15T18:00:00.000Z"
    })]);
    expect(wrongBranch.status).toBe("unmatched");
    expect(tooOld.status).toBe("unmatched");
  });

  it("marks repeated commit candidates as ambiguous instead of guessing", () => {
    const [result] = correlateEventsWithRuns([event], [
      run(),
      run({ id: "123e4567-e89b-42d3-a456-426614174002", completedAt: "2026-11-17T18:02:00.000Z" })
    ]);
    expect(result.status).toBe("ambiguous");
    expect(result.candidates).toHaveLength(2);
  });

  it("caps displayed candidates while preserving the total ambiguous count", () => {
    const runs = [
      run({ id: "123e4567-e89b-42d3-a456-426614174011" }),
      run({ id: "123e4567-e89b-42d3-a456-426614174012", completedAt: "2026-11-17T18:02:00.000Z" }),
      run({ id: "123e4567-e89b-42d3-a456-426614174013", completedAt: "2026-11-17T18:03:00.000Z" }),
      run({ id: "123e4567-e89b-42d3-a456-426614174014", completedAt: "2026-11-17T18:04:00.000Z" })
    ];
    const [result] = correlateEventsWithRuns([event], runs);
    expect(result.status).toBe("ambiguous");
    expect(result.candidate_count).toBe(4);
    expect(result.candidates_truncated).toBe(true);
    expect(result.candidates).toHaveLength(3);
  });

  it("treats events inside the run execution interval as zero-distance candidates", () => {
    const [result] = correlateEventsWithRuns([{ ...event, happened_at: "2026-11-17T18:00:30.000Z" }], [run({
      startedAt: "2026-11-17T17:50:00.000Z",
      completedAt: "2026-11-17T18:05:00.000Z"
    })]);
    expect(result.status).toBe("candidate");
    expect(result.candidates[0].time_delta_ms).toBe(0);
  });

  it("falls back to a valid start time when the completion timestamp is malformed", () => {
    const [result] = correlateEventsWithRuns([event], [run({
      startedAt: "2026-11-17T18:00:00.000Z",
      completedAt: "not-a-date"
    })]);
    expect(result.status).toBe("candidate");
    expect(result.candidates[0].time_delta_ms).toBe(0);
  });

  it("rejects runs whose start time is later than their completion time", () => {
    const [result] = correlateEventsWithRuns([event], [run({
      startedAt: "2026-11-17T18:10:00.000Z",
      completedAt: "2026-11-17T18:00:00.000Z"
    })]);
    expect(result.status).toBe("unmatched");
  });
  it("reports missing revisions without matching by branch alone", () => {
    const [result] = correlateEventsWithRuns([{ ...event, revision: undefined }], [run()]);
    expect(result).toMatchObject({
      status: "unmatched",
      reason: "missing_revision",
      candidates: []
    });
  });

  it("uses the documented CircleCI run creation time as a point, not a fabricated execution interval", () => {
    const [result] = correlateEventsWithRuns([event], [run({
      startedAt: undefined,
      completedAt: undefined,
      createdAt: "2026-11-17T18:00:00.000Z"
    })]);
    expect(result.status).toBe("candidate");
    expect(result.candidates[0]).toMatchObject({
      time_delta_ms: 0,
      match_basis: "commit+branch+created-at"
    });
  });

  it("uses commit and time when the run does not expose a branch", () => {
    const [result] = correlateEventsWithRuns([event], [run({ branch: undefined })]);
    expect(result.candidates[0].match_basis).toBe("commit+time");
  });
});
