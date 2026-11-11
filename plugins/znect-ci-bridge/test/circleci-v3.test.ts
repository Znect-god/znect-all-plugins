import { afterEach, describe, expect, it, vi } from "vitest";
import {
  circleV3Get,
  circleV3GetText,
  getCircleCiJob,
  getCircleCiJobStepOutput,
  isCircleCiUuid,
  listCircleCiJobs,
  listCircleCiRuns,
  listCircleCiWorkflows,
  resolveCircleCiProject
} from "../src/circleci-v3";

const PROJECT_ID = "123e4567-e89b-42d3-a456-426614174000";
const RUN_ID = "123e4567-e89b-42d3-a456-426614174001";
const WORKFLOW_ID = "123e4567-e89b-42d3-a456-426614174002";
const JOB_ID = "123e4567-e89b-42d3-a456-426614174003";

describe("CircleCI API v3 client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("recognizes UUIDs and rejects slug-like resource IDs", () => {
    expect(isCircleCiUuid(PROJECT_ID)).toBe(true);
    expect(isCircleCiUuid("gh/Znect-god/znect-forge")).toBe(false);
  });

  it("uses fixed API v3 origin, GET and Bearer authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [], page: { next: null } }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(circleV3Get("synthetic-token", "/api/v3/runs?filter%5Bproject_id%5D=" + PROJECT_ID))
      .resolves.toEqual({ data: [], page: { next: null } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("https://circleci.com/api/v3/runs?");
    expect(init).toMatchObject({
      method: "GET",
      headers: {
        Authorization: "Bearer synthetic-token",
        Accept: "application/json"
      },
      redirect: "error"
    });
    expect(init.signal).toBeDefined();
  });

  it("rejects paths that attempt to escape the fixed API origin", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(circleV3Get("token", "https://attacker.example/api/v3/runs"))
      .rejects.toThrow("Invalid internal CircleCI API v3 path.");
    await expect(circleV3Get("token", "/api/v3/../v2/me"))
      .rejects.toThrow("Invalid internal CircleCI API v3 path.");
    await expect(circleV3Get("token", "/api/v3//evil"))
      .rejects.toThrow("Invalid internal CircleCI API v3 path.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 429])("sanitizes upstream HTTP %i errors", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("sensitive upstream details", { status })
    ));
    const expected = status === 401 || status === 403
      ? "CircleCI API v3 rejected the configured read-only token. Check its type and project access."
      : status === 404
        ? "The requested CircleCI API v3 resource was not found or is not accessible."
        : "CircleCI API v3 rate limit exceeded. Retry after the indicated interval.";
    await expect(circleV3Get("token", "/api/v3/runs")).rejects.toThrow(expected);
  });

  it("rejects malformed and oversized JSON bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{broken", { status: 200 })));
    await expect(circleV3Get("token", "/api/v3/runs"))
      .rejects.toThrow("CircleCI API returned invalid JSON.");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: "x".repeat(1_000_001) }), { status: 200 })
    ));
    await expect(circleV3Get("token", "/api/v3/runs"))
      .rejects.toThrow("CircleCI API response exceeded the configured size limit.");
  });

  it("resolves only one project and validates the returned project UUID and slug", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: PROJECT_ID, attributes: { slug: "gh/Znect-god/znect-forge" } }]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveCircleCiProject("token", "gh/Znect-god/znect-forge"))
      .resolves.toMatchObject({ id: PROJECT_ID });
    expect(fetchMock.mock.calls[0][0]).toContain("filter%5Bslug%5D=gh%2FZnect-god%2Fznect-forge");
  });

  it("rejects zero, multiple, or mismatched project resolutions", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: PROJECT_ID }, { id: RUN_ID }]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: PROJECT_ID, attributes: { slug: "gh/other/repo" } }]
      }), { status: 200 })));

    await expect(resolveCircleCiProject("token", "gh/Znect-god/znect-forge"))
      .rejects.toThrow("did not resolve to exactly one project");
    await expect(resolveCircleCiProject("token", "gh/Znect-god/znect-forge"))
      .rejects.toThrow("did not resolve to exactly one project");
    await expect(resolveCircleCiProject("token", "gh/Znect-god/znect-forge"))
      .rejects.toThrow("did not match the configured slug");
  });

  it("paginates runs using opaque cursors and caps the result at 30", async () => {
    const first = Array.from({ length: 20 }, (_, i) => ({ id: `run-${i}` }));
    const second = Array.from({ length: 20 }, (_, i) => ({ id: `next-${i}` }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: first, page: { next: "opaque/cursor+value", prev: null }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: second, page: { next: null, prev: "opaque" }
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const runs = await listCircleCiRuns("token", PROJECT_ID, 30);
    expect(runs).toHaveLength(30);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain("page%5Bcursor%5D=opaque%2Fcursor%2Bvalue");
  });

  it("rejects repeated cursors and invalid page sizes", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: RUN_ID }], page: { next: "same" }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: RUN_ID }], page: { next: "same" }
      }), { status: 200 })));
    await expect(listCircleCiRuns("token", PROJECT_ID, 30))
      .rejects.toThrow("repeated a pagination cursor");
    await expect(listCircleCiRuns("token", PROJECT_ID, 31))
      .rejects.toThrow("between 1 and 30");
  });

  it("traverses run to workflow to jobs with UUID validation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: WORKFLOW_ID }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: JOB_ID }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: JOB_ID, attributes: { name: "typecheck" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listCircleCiWorkflows("token", RUN_ID)).resolves.toHaveLength(1);
    await expect(listCircleCiJobs("token", WORKFLOW_ID)).resolves.toHaveLength(1);
    await expect(getCircleCiJob("token", JOB_ID)).resolves.toMatchObject({ id: JOB_ID });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reads bounded stdout and uses the documented step/execution filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("line1\nline2\nline3", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getCircleCiJobStepOutput("token", JOB_ID, 2, "stdout", 1, 8))
      .resolves.toEqual({ text: "line1\nli", truncated: true });
    expect(fetchMock.mock.calls[0][0]).toContain("/api/v3/jobs/" + JOB_ID + "/stdout?");
    expect(fetchMock.mock.calls[0][0]).toContain("filter%5Bstep_num%5D=2");
    expect(fetchMock.mock.calls[0][0]).toContain("filter%5Bexecution%5D=1");
  });

  it("handles no-content output and sanitizes text endpoint failures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response("secret body", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(circleV3GetText("token", "/api/v3/jobs/" + JOB_ID + "/stdout?filter%5Bstep_num%5D=0"))
      .resolves.toEqual({ text: "", truncated: false });
    await expect(circleV3GetText("token", "/api/v3/jobs/" + JOB_ID + "/stdout?filter%5Bstep_num%5D=0"))
      .rejects.toThrow("CircleCI API v3 rejected the configured read-only token");
  });
});
