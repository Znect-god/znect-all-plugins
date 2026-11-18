import { afterEach, describe, expect, it, vi } from "vitest";
import {
  circleV3Get,
  circleV3GetText,
  getCircleCiJob,
  getCircleCiRun,
  getCircleCiRunForProject,
  assertCircleCiJobOwnership,
  assertCircleCiRunOwnership,
  getCircleCiJobStepOutput,
  getCircleCiJobTests,
  getCircleCiJobArtifact,
  listCircleCiJobArtifacts,
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
      redirect: "manual"
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
      new Response("sensitive upstream details", {
        status,
        headers: status === 429 ? { "retry-after": "17" } : undefined
      })
    ));
    const expected = status === 401
      ? "CircleCI API v3 authentication failed (HTTP 401). Check whether CIRCLECI_TOKEN is a valid, unexpired Personal API Token."
      : status === 403
        ? "CircleCI API v3 authorization failed (HTTP 403). The authenticated account or token does not have access to this project."
        : status === 404
          ? "The requested CircleCI API v3 resource was not found or is not accessible."
          : "CircleCI API v3 rate limit exceeded. Retry after 17 seconds.";
    await expect(circleV3Get("token", "/api/v3/runs")).rejects.toThrow(expected);
  });

  it("reports the upstream Retry-After interval for text endpoints and discards error bodies", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode("sensitive upstream details")); },
      cancel() { cancelled = true; }
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, {
      status: 429,
      headers: { "retry-after": "17" }
    })));
    await expect(circleV3GetText("token", `/api/v3/jobs/${JOB_ID}/stdout`))
      .rejects.toThrow("CircleCI API v3 rate limit exceeded. Retry after 17 seconds.");
    expect(cancelled).toBe(true);
  });

  it("normalizes upstream network and timeout failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(
      new DOMException("sensitive runtime detail", "TimeoutError")
    ));
    await expect(circleV3Get("token", "/api/v3/runs"))
      .rejects.toThrow("CircleCI API request timed out.");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(
      new TypeError("sensitive socket detail")
    ));
    await expect(circleV3GetText("token", "/api/v3/jobs/" + JOB_ID + "/stdout"))
      .rejects.toThrow("CircleCI API request failed due to a network or TLS error.");
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

  it("resolves one project by slug and validates its returned UUID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: PROJECT_ID, attributes: { slug: "gh/Znect-god/znect-forge" } }]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveCircleCiProject("token", "gh/Znect-god/znect-forge"))
      .resolves.toMatchObject({ id: PROJECT_ID });
    expect(fetchMock.mock.calls[0][0]).toContain("filter%5Bslug%5D=gh%2FZnect-god%2Fznect-forge");
  });

  it("resolves the explicitly supported github/ CircleCI API v3 slug alias", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: PROJECT_ID, attributes: { slug: "github/Znect-god/znect-forge" } }]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveCircleCiProject("token", "github/Znect-god/znect-forge"))
      .resolves.toMatchObject({ id: PROJECT_ID });
    expect(fetchMock.mock.calls[0][0]).toContain("filter%5Bslug%5D=github%2FZnect-god%2Fznect-forge");
  });

  it("rejects unsupported CircleCI project slug prefixes before network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveCircleCiProject("token", "gitlab/Znect-god/znect-forge"))
      .rejects.toThrow("Invalid CircleCI GitHub project slug.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects zero, multiple, or explicitly mismatched project resolutions", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: PROJECT_ID }, { id: RUN_ID }]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: PROJECT_ID, attributes: { slug: "gh/other/repo" } }]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: PROJECT_ID, attributes: {} }]
      }), { status: 200 })));

    await expect(resolveCircleCiProject("token", "gh/Znect-god/znect-forge"))
      .rejects.toThrow("did not resolve to exactly one project");
    await expect(resolveCircleCiProject("token", "gh/Znect-god/znect-forge"))
      .rejects.toThrow("did not resolve to exactly one project");
    await expect(resolveCircleCiProject("token", "gh/Znect-god/znect-forge"))
      .rejects.toThrow("did not match the configured slug");
    await expect(resolveCircleCiProject("token", "gh/Znect-god/znect-forge"))
      .resolves.toMatchObject({ id: PROJECT_ID });
  });

  it("verifies run ownership through the documented project-scoped runs collection", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: RUN_ID, references: { project: { id: PROJECT_ID } } }], page: { next: null }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: RUN_ID, attributes: { phase: "ended" }, references: { project: { id: PROJECT_ID } } }
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCircleCiRunForProject("token", RUN_ID, PROJECT_ID))
      .resolves.toMatchObject({ id: RUN_ID });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("filter%5Bproject_id%5D=" + PROJECT_ID);
  });

  it("rejects project-scoped run collection entries with a mismatched project reference", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: RUN_ID, references: { project: { id: WORKFLOW_ID } } }],
      page: { next: null }
    }), { status: 200 })));
    await expect(listCircleCiRuns("token", PROJECT_ID, 10))
      .rejects.toThrow("does not belong to the selected project");
  });

  it("rejects a run detail whose project reference differs from the verified collection", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: RUN_ID, references: { project: { id: PROJECT_ID } } }],
        page: { next: null }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: RUN_ID, references: { project: { id: WORKFLOW_ID } } }
      }), { status: 200 })));
    await expect(getCircleCiRunForProject("token", RUN_ID, PROJECT_ID))
      .rejects.toThrow("does not belong to the selected project");
  });

  it("rejects runs absent from the selected project-scoped collection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: WORKFLOW_ID, references: { project: { id: PROJECT_ID } } }], page: { next: null }
    }), { status: 200 })));

    await expect(getCircleCiRunForProject("token", RUN_ID, PROJECT_ID))
      .rejects.toThrow("does not belong to the selected project");
  });

  it("fails closed when run ownership cannot be established within the scan window", async () => {
    const pages = Array.from({ length: 20 }, (_, index) => new Response(JSON.stringify({
      data: [{
        id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
        references: { project: { id: PROJECT_ID } }
      }],
      page: { next: `cursor-${index + 1}` }
    }), { status: 200 }));
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(pages.shift())));

    await expect(getCircleCiRunForProject("token", RUN_ID, PROJECT_ID))
      .rejects.toThrow("400-run safety window");
  });
  it("rejects a run whose explicit project reference is missing or mismatched", () => {
    expect(() => assertCircleCiRunOwnership({
      id: RUN_ID, references: { project: { id: PROJECT_ID } }
    }, PROJECT_ID)).not.toThrow();
    expect(() => assertCircleCiRunOwnership({ id: RUN_ID }, PROJECT_ID))
      .toThrow("does not belong to the selected project");
    expect(() => assertCircleCiRunOwnership({
      id: RUN_ID, references: { project: { id: WORKFLOW_ID } }
    }, PROJECT_ID)).toThrow("does not belong to the selected project");
  });

  it("checks job project and workflow references before exposing job data", () => {
    const job = {
      id: JOB_ID,
      references: { project: { id: PROJECT_ID }, workflow: { id: WORKFLOW_ID } }
    };
    expect(() => assertCircleCiJobOwnership(job, PROJECT_ID, WORKFLOW_ID)).not.toThrow();
    expect(() => assertCircleCiJobOwnership(job, RUN_ID, WORKFLOW_ID))
      .toThrow("does not belong to the selected project");
    expect(() => assertCircleCiJobOwnership(job, PROJECT_ID, RUN_ID))
      .toThrow("does not belong to the selected run workflow");
    expect(() => assertCircleCiJobOwnership({ id: JOB_ID }, PROJECT_ID))
      .toThrow("does not belong to the selected project");
    expect(() => assertCircleCiJobOwnership({
      id: JOB_ID, references: { project: { id: PROJECT_ID } }
    }, PROJECT_ID)).toThrow("valid workflow ownership reference");
  });

  it("paginates runs using opaque cursors and caps the result at 30", async () => {
    const first = Array.from({ length: 20 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      references: { project: { id: PROJECT_ID } }
    }));
    const second = Array.from({ length: 20 }, (_, i) => ({
      id: `00000000-0000-4000-8001-${String(i + 1).padStart(12, "0")}`,
      references: { project: { id: PROJECT_ID } }
    }));
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

  it("rejects collection pages with missing pagination metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: RUN_ID, references: { project: { id: PROJECT_ID } } }]
    }), { status: 200 })));
    await expect(listCircleCiRuns("token", PROJECT_ID, 10))
      .rejects.toThrow("invalid runs pagination metadata");
    await expect(listCircleCiWorkflows("token", RUN_ID))
      .rejects.toThrow("invalid workflow pagination metadata");
  });

  it("rejects run and workflow pages that exceed the requested API page limit", async () => {
    const oversizedRuns = Array.from({ length: 11 }, (_, index) => ({
      id: `00000000-0000-4000-8001-${String(index + 1).padStart(12, "0")}`,
      references: { project: { id: PROJECT_ID } }
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      data: oversizedRuns, page: { next: null }
    }), { status: 200 })));
    await expect(listCircleCiRuns("token", PROJECT_ID, 10))
      .rejects.toThrow("more runs than the requested page limit");

    const oversizedWorkflows = Array.from({ length: 21 }, (_, index) => ({
      id: `00000000-0000-4000-8001-${String(index + 1).padStart(12, "0")}`
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      data: oversizedWorkflows, page: { next: null }
    }), { status: 200 })));
    await expect(listCircleCiWorkflows("token", RUN_ID))
      .rejects.toThrow("more workflows than the requested page limit");
  });

  it("rejects malformed run resource IDs returned by the API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: "not-a-uuid" }], page: { next: null }
    }), { status: 200 })));
    await expect(listCircleCiRuns("token", PROJECT_ID, 10))
      .rejects.toThrow("Invalid CircleCI run ID.");
  });

  it("rejects repeated cursors and invalid page sizes", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: RUN_ID, references: { project: { id: PROJECT_ID } } }], page: { next: "same" }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: RUN_ID, references: { project: { id: PROJECT_ID } } }], page: { next: "same" }
      }), { status: 200 })));
    await expect(listCircleCiRuns("token", PROJECT_ID, 30))
      .rejects.toThrow("repeated a pagination cursor");
    await expect(listCircleCiRuns("token", PROJECT_ID, 31))
      .rejects.toThrow("between 1 and 30");
  });

  it("traverses run to workflow to jobs with UUID validation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: RUN_ID, attributes: { phase: "ended", current_outcome: "succeeded" } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: WORKFLOW_ID }], page: { next: null, prev: null } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: JOB_ID }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: JOB_ID, attributes: { name: "typecheck" } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCircleCiRun("token", RUN_ID)).resolves.toMatchObject({
      id: RUN_ID,
      attributes: { current_outcome: "succeeded" }
    });
    await expect(listCircleCiWorkflows("token", RUN_ID)).resolves.toHaveLength(1);
    await expect(listCircleCiJobs("token", WORKFLOW_ID)).resolves.toHaveLength(1);
    await expect(getCircleCiJob("token", JOB_ID)).resolves.toMatchObject({
      id: JOB_ID,
      attributes: { name: "typecheck" }
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("rejects mismatched IDs in single-resource responses", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: WORKFLOW_ID }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: WORKFLOW_ID }
      }), { status: 200 })));

    await expect(getCircleCiRun("token", RUN_ID))
      .rejects.toThrow("invalid or mismatched run resource");
    await expect(getCircleCiJob("token", JOB_ID))
      .rejects.toThrow("invalid or mismatched job resource");
  });

  it("paginates workflows and reads the unpaginated jobs collection", async () => {
    const workflow2 = "123e4567-e89b-42d3-a456-426614174004";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: WORKFLOW_ID }], page: { next: "workflow-cursor", prev: null }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: workflow2 }], page: { next: null, prev: "workflow-cursor" }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: JOB_ID }]
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listCircleCiWorkflows("token", RUN_ID)).resolves.toHaveLength(2);
    await expect(listCircleCiJobs("token", WORKFLOW_ID)).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toContain("page%5Bcursor%5D=workflow-cursor");
    expect(fetchMock.mock.calls[0][0]).toContain("page%5Blimit%5D=20");
    expect(fetchMock.mock.calls[2][0]).toContain("filter%5Bworkflow_id%5D=" + WORKFLOW_ID);
    expect(fetchMock.mock.calls[2][0]).not.toContain("page%5B");
  });

  it("rejects repeated cursors while traversing workflows", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: WORKFLOW_ID }], page: { next: "repeat" }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: WORKFLOW_ID }], page: { next: "repeat" }
      }), { status: 200 })));
    await expect(listCircleCiWorkflows("token", RUN_ID))
      .rejects.toThrow("repeated a pagination cursor while listing workflows");
  });

  it("enforces a caller-selected page ceiling for workflow collections", async () => {
    const nextJobId = "123e4567-e89b-42d3-a456-426614174006";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: JOB_ID }], page: { next: "cursor-1" }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: nextJobId }], page: { next: "cursor-2" }
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listCircleCiWorkflows("token", RUN_ID, 2))
      .rejects.toThrow("safety limit of 40 items");
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
      .rejects.toThrow("CircleCI API v3 authorization failed (HTTP 403). The authenticated account or token does not have access to this project.");
  });

  it("reads bounded structured test results as JSON Lines", async () => {
    const body = '{"name":"sampleTest","result":"failure"}\n';
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getCircleCiJobTests("token", JOB_ID, 128))
      .resolves.toEqual({ text: body, truncated: false });
    expect(fetchMock.mock.calls[0][0]).toBe("https://circleci.com/api/v3/jobs/" + JOB_ID + "/tests");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "GET",
      headers: { Authorization: "Bearer token", Accept: "text/plain" },
      redirect: "manual"
    });
  });

  it("returns an empty test result when CircleCI has no test data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(getCircleCiJobTests("token", JOB_ID))
      .resolves.toEqual({ text: "", truncated: false });
  });

  it("lists artifact metadata without altering or exposing the API response shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { id: "artifact-1", attributes: { path: "test-results/junit.xml", url: "https://example.s3.amazonaws.com/file", size: 512, node_index: 0 } }
      ]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(listCircleCiJobArtifacts("token", JOB_ID)).resolves.toMatchObject([
      { id: "artifact-1", attributes: { path: "test-results/junit.xml", size: 512, node_index: 0 } }
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://circleci.com/api/v3/jobs/" + JOB_ID + "/artifacts");
  });

  it("rejects an invalid artifacts collection and excessive artifact count", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: Array.from({ length: 101 }, () => ({})) }), { status: 200 })));
    await expect(listCircleCiJobArtifacts("token", JOB_ID))
      .rejects.toThrow("invalid artifacts collection");
    await expect(listCircleCiJobArtifacts("token", JOB_ID))
      .rejects.toThrow("more than 100 artifacts");
  });


  it("downloads a listed artifact by exact path through an allowlisted URL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: "artifact-1", attributes: { path: "test-results/junit.xml", url: "https://s3.amazonaws.com/bucket/report.xml" } }]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("<testsuite failures=\"1\"/>", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getCircleCiJobArtifact("token", JOB_ID, "test-results/junit.xml", 256))
      .resolves.toEqual({ path: "test-results/junit.xml", text: "<testsuite failures=\"1\"/>", truncated: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "GET", redirect: "manual" });
  });

  it("rejects path traversal and artifact URLs outside the allowlist", async () => {
    await expect(getCircleCiJobArtifact("token", JOB_ID, "../secrets.txt"))
      .rejects.toThrow("Invalid CircleCI artifact path.");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: "artifact-1", attributes: { path: "report.xml", url: "https://attacker.example/report.xml" } }]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getCircleCiJobArtifact("token", JOB_ID, "report.xml"))
      .rejects.toThrow("not on an allowed HTTPS host");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

});