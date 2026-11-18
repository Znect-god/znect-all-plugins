import { describe, expect, it, vi } from "vitest";
import {
  collectJobReportArtifacts,
  MAX_REPORT_ARTIFACTS_PER_JOB,
  MAX_REPORT_BYTES_PER_JOB
} from "../src/diagnostic-artifacts";
import type { CiArtifact, CiArtifactContent, CiProjectScope } from "../src/providers/contract";

const scope: CiProjectScope = { projectId: "znect-forge", connectionId: "forge-circleci" };
const report = (path: string, execution?: number, size?: number): CiArtifact => ({
  id: path + (execution === undefined ? "" : ":" + execution),
  jobId: "job-1",
  path,
  ...(execution === undefined ? {} : { execution }),
  ...(size === undefined ? {} : { size })
});
const content = (path: string, value: string, execution?: number, truncated = false): CiArtifactContent => ({
  path, content: value, truncated, ...(execution === undefined ? {} : { execution })
});

function adapter(
  artifacts: CiArtifact[],
  retrieve: (path: string, maxBytes: number, execution?: number) => Promise<CiArtifactContent>
) {
  return {
    listArtifacts: vi.fn(async () => artifacts),
    getArtifact: vi.fn(async (_scope: CiProjectScope, _jobId: string, path: string, maxBytes: number, execution?: number) =>
      retrieve(path, maxBytes, execution))
  };
}

describe("bounded diagnostic JUnit artifact collection", () => {
  it("retains distinct parallel execution identities, including duplicate paths", async () => {
    const source = adapter(
      [report("junit/results.xml", 0), report("junit/results.xml", 1)],
      async (path, _maxBytes, execution) => content(path, "xml-" + execution, execution)
    );

    const result = await collectJobReportArtifacts(source, scope, "job-1");

    expect(result.artifacts).toMatchObject([
      { path: "junit/results.xml", execution: 0, content: "xml-0" },
      { path: "junit/results.xml", execution: 1, content: "xml-1" }
    ]);
    expect(source.getArtifact.mock.calls.map((call) => call[4])).toEqual([0, 1]);
    expect(result.incomplete).toBe(false);
  });

  it("collects no more than four eligible reports and flags the count limit", async () => {
    const source = adapter(
      Array.from({ length: 5 }, (_, index) => report(`test-results/${index}.xml`, index)),
      async (path, _maxBytes, execution) => content(path, "ok", execution)
    );

    const result = await collectJobReportArtifacts(source, scope, "job-1");

    expect(MAX_REPORT_ARTIFACTS_PER_JOB).toBe(4);
    expect(result.artifacts).toHaveLength(4);
    expect(source.getArtifact).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({ incomplete: true, limitReached: true });
  });

  it("passes the remaining aggregate byte budget to each download, including unknown-size artifacts", async () => {
    const source = adapter(
      [report("junit/first.xml", 0), report("junit/second.xml", 1)],
      async (path, maxBytes, execution) => {
        const bytes = path.includes("first") ? 300_000 : Math.min(300_000, maxBytes);
        return content(path, "x".repeat(bytes), execution, bytes < 300_000);
      }
    );

    const result = await collectJobReportArtifacts(source, scope, "job-1");

    expect(MAX_REPORT_BYTES_PER_JOB).toBe(500_000);
    expect(source.getArtifact.mock.calls.map((call) => call[3])).toEqual([500_000, 200_000]);
    expect(result.artifacts.map((item) => item.content?.length)).toEqual([300_000, 200_000]);
    expect(result.incomplete).toBe(true);
  });

  it("skips a known oversized artifact and marks the result incomplete", async () => {
    const source = adapter(
      [report("junit/too-large.xml", 0, MAX_REPORT_BYTES_PER_JOB + 1)],
      async (path, _maxBytes, execution) => content(path, "should-not-fetch", execution)
    );

    const result = await collectJobReportArtifacts(source, scope, "job-1");

    expect(source.getArtifact).not.toHaveBeenCalled();
    expect(result).toMatchObject({ artifacts: [], incomplete: true, limitReached: true });
  });

  it("retains successful reports when another artifact retrieval fails", async () => {
    const source = adapter(
      [report("junit/fail.xml", 0), report("junit/success.xml", 1)],
      async (path, _maxBytes, execution) => {
        if (path.includes("fail")) throw new Error("private upstream detail");
        return content(path, "valid", execution);
      }
    );

    const result = await collectJobReportArtifacts(source, scope, "job-1");

    expect(result.artifacts).toMatchObject([
      { path: "junit/fail.xml", execution: 0, error: "Unable to retrieve this report artifact." },
      { path: "junit/success.xml", execution: 1, content: "valid" }
    ]);
    expect(JSON.stringify(result)).not.toContain("private upstream detail");
    expect(result.incomplete).toBe(true);
  });

  it("marks truncated provider responses incomplete", async () => {
    const source = adapter(
      [report("junit/truncated.xml", 0)],
      async (path, _maxBytes, execution) => content(path, "<testsuite/>", execution, true)
    );

    const result = await collectJobReportArtifacts(source, scope, "job-1");

    expect(result.artifacts[0].content).toBe("<testsuite/>");
    expect(result.incomplete).toBe(true);
    expect(result.limitReached).toBe(false);
  });

  it("fails closed if an adapter returns more bytes than the remaining budget", async () => {
    const source = adapter(
      [report("junit/oversized-response.xml", 0)],
      async (path, maxBytes, execution) => content(path, "x".repeat(maxBytes + 1), execution)
    );

    const result = await collectJobReportArtifacts(source, scope, "job-1");

    expect(result.artifacts).toMatchObject([{
      path: "junit/oversized-response.xml",
      error: "Retrieved report exceeded the remaining byte budget."
    }]);
    expect(result.artifacts[0].content).toBeUndefined();
    expect(result).toMatchObject({ incomplete: true, limitReached: true });
  });

  it("ignores artifacts that are not JUnit or test-results XML", async () => {
    const source = adapter(
      [report("logs/output.txt"), report("coverage/summary.json"), report("junit/results.xml")],
      async (path, _maxBytes, execution) => content(path, "xml", execution)
    );

    const result = await collectJobReportArtifacts(source, scope, "job-1");

    expect(source.getArtifact).toHaveBeenCalledTimes(1);
    expect(result.artifacts).toMatchObject([{ path: "junit/results.xml", content: "xml" }]);
  });

  it("propagates artifact-list failures so callers can report unavailable diagnostics", async () => {
    const source = {
      listArtifacts: vi.fn(async () => { throw new Error("list failed"); }),
      getArtifact: vi.fn()
    };

    await expect(collectJobReportArtifacts(source, scope, "job-1")).rejects.toThrow("list failed");
    expect(source.getArtifact).not.toHaveBeenCalled();
  });
});
