import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const PROJECT_UUID = "123e4567-e89b-42d3-a456-426614174000";
const RUN_UUID = "123e4567-e89b-42d3-a456-426614174001";
const EVENT_ID = "3888f21b-eaa7-4383-8f3d-75a63bba0001";
const REVISION = "a".repeat(40);
const REGISTRY = JSON.stringify({
  version: 1,
  projects: [{
    id: "znect-forge",
    name: "Znect Forge",
    repositories: [{ fullName: "Znect-god/znect-forge" }],
    components: [],
    connections: [{
      id: "forge-circleci",
      provider: "circleci",
      projectSlug: "gh/Znect-god/znect-forge"
    }]
  }]
});
const env = {
  CIRCLECI_TOKEN: "circle-test-token",
  MCP_ACCESS_TOKEN: "bridge-test-token",
  WEB_ACCESS_TOKEN: "web-test-token",
  ZNECT_PROJECT_REGISTRY: REGISTRY,
  MCP_RATE_LIMITER: { limit: async () => ({ success: true }) }
};
const ctx = {} as ExecutionContext;

afterEach(() => vi.unstubAllGlobals());

describe("read-only browser event correlation API", () => {
  it("returns bounded correlations between stored webhook events and CircleCI API v3 runs", async () => {
    const eventStore = {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async (input: RequestInfo | URL) => {
          expect(String(input)).toContain("/events?after=0&limit=5");
          return new Response(JSON.stringify({
            events: [{
              cursor: 1,
              id: EVENT_ID,
              type: "workflow-completed",
              happened_at: "2026-11-17T18:00:30.000Z",
              branch: "work/bridge",
              revision: REVISION
            }],
            next_cursor: 1
          }), { status: 200 });
        }
      })
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v3/projects") {
        return new Response(JSON.stringify({
          data: [{ id: PROJECT_UUID, attributes: { slug: "gh/Znect-god/znect-forge" } }]
        }), { status: 200 });
      }
      if (url.pathname === "/api/v3/runs") {
        return new Response(JSON.stringify({
          data: [{
            id: RUN_UUID,
            attributes: {
              phase: "completed",
              current_outcome: "success",
              created_at: "2026-11-17T17:59:00.000Z",
              ended_at: "2026-11-17T18:00:00.000Z"
            },
            references: {
              project: { id: PROJECT_UUID },
              event: { attributes: { vcs: { branch: "work/bridge", revision: REVISION } } }
            }
          }],
          page: { next: null }
        }), { status: 200 });
      }
      throw new Error("Unexpected CircleCI request: " + url.pathname);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://bridge.example/api/v1/event-correlations?project_id=znect-forge&event_limit=5&run_limit=5", {
        headers: { authorization: "Bearer web-test-token" }
      }),
      { ...env, EVENT_STORE: eventStore } as Parameters<typeof worker.fetch>[1],
      ctx
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      project: { id: "znect-forge" },
      correlations: [{
        event: { id: EVENT_ID, cursor: 1 },
        status: "candidate",
        candidates: [{
          run: { id: RUN_UUID, commitSha: REVISION, branch: "work/bridge" },
          time_delta_ms: 30_000,
          match_basis: "commit+branch+time"
        }]
      }],
      next_cursor: 1
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects out-of-range event and run limits before contacting CircleCI", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(
      new Request("https://bridge.example/api/v1/event-correlations?project_id=znect-forge&event_limit=51&run_limit=31", {
        headers: { authorization: "Bearer web-test-token" }
      }),
      env as Parameters<typeof worker.fetch>[1],
      ctx
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
