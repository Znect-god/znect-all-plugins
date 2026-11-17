import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const WEBHOOK_SECRET = "circleci-webhook-test-secret";
const EVENT_ID = "3888f21b-eaa7-4383-8f3d-75a63bba0001";
const WORKFLOW_ID = "123e4567-e89b-42d3-a456-426614174001";
const PIPELINE_ID = "123e4567-e89b-42d3-a456-426614174002";
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
const ctx = {} as ExecutionContext;

function makePayload(projectSlug = "gh/Znect-god/znect-forge") {
  return {
    id: EVENT_ID,
    type: "workflow-completed",
    happened_at: new Date().toISOString(),
    project: { slug: projectSlug },
    pipeline: {
      id: PIPELINE_ID,
      number: 42,
      vcs: {
        branch: "work/bridge-validation",
        revision: "0123456789abcdef",
        commit: { subject: "Exercise signed webhook ingress" }
      }
    },
    workflow: {
      id: WORKFLOW_ID,
      name: "build-and-test",
      status: "success",
      url: "https://app.circleci.com/pipelines/github/Znect-god/znect-forge/42/workflows/123e4567-e89b-42d3-a456-426614174001"
    },
    author_email: "must-not-be-stored@example.invalid"
  };
}

async function signBody(body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body)
  ));
  return "v1=" + Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function makeNamespace(
  append: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
) {
  return {
    idFromName: (name: string) => name,
    get: () => ({ fetch: append })
  };
}

async function postWebhook(
  body: string,
  signature: string,
  namespace: ReturnType<typeof makeNamespace>,
  extraHeaders: Record<string, string> = {}
) {
  return worker.fetch(
    new Request("https://bridge.example/webhooks/circleci", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "circleci-event-type": "workflow-completed",
        "circleci-signature": signature,
        ...extraHeaders
      },
      body
    }),
    {
      CIRCLECI_TOKEN: "circleci-api-test-token",
      MCP_ACCESS_TOKEN: "mcp-test-token",
      WEB_ACCESS_TOKEN: "web-test-token",
      CIRCLECI_WEBHOOK_SECRET: WEBHOOK_SECRET,
      ZNECT_PROJECT_REGISTRY: REGISTRY,
      MCP_RATE_LIMITER: { limit: async () => ({ success: true }) },
      EVENT_STORE: namespace
    } as Parameters<typeof worker.fetch>[1],
    ctx
  );
}

describe("CircleCI webhook ingress integration", () => {
  afterEach(() => vi.restoreAllMocks());

  it("verifies the raw-body signature and stores only the normalized Forge event", async () => {
    const body = JSON.stringify(makePayload());
    const append = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      return new Response(JSON.stringify({ accepted: true, duplicate: false }), { status: 200 });
    });
    const response = await postWebhook(body, await signBody(body), makeNamespace(append));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true, duplicate: false });
    expect(append).toHaveBeenCalledTimes(1);

    const stored = JSON.parse(String(append.mock.calls[0][1]?.body));
    expect(stored).toMatchObject({
      id: EVENT_ID,
      type: "workflow-completed",
      project_slug: "gh/Znect-god/znect-forge",
      pipeline_number: 42,
      branch: "work/bridge-validation",
      revision: "0123456789abcdef",
      workflow_id: WORKFLOW_ID,
      workflow_status: "success"
    });
    expect(stored).not.toHaveProperty("author_email");
  });

  it("rejects an invalid signature before accessing event storage", async () => {
    const body = JSON.stringify(makePayload());
    const append = vi.fn(async () => new Response(
      JSON.stringify({ accepted: true, duplicate: false }),
      { status: 200 }
    ));
    const response = await postWebhook(body, "v1=" + "0".repeat(64), makeNamespace(append));

    expect(response.status).toBe(401);
    expect(append).not.toHaveBeenCalled();
  });

  it("acknowledges a signed event from an unregistered project without storing it", async () => {
    const body = JSON.stringify(makePayload("gh/another-owner/another-repo"));
    const append = vi.fn(async () => new Response(
      JSON.stringify({ accepted: true, duplicate: false }),
      { status: 200 }
    ));
    const response = await postWebhook(body, await signBody(body), makeNamespace(append));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      accepted: true,
      ignored: true
    });
    expect(append).not.toHaveBeenCalled();
  });

  it("returns a retryable response when durable event storage is unavailable", async () => {
    const body = JSON.stringify(makePayload());
    const append = vi.fn(async () => {
      throw new Error("private storage implementation detail");
    });
    const response = await postWebhook(body, await signBody(body), makeNamespace(append));

    expect(response.status).toBe(503);
    const result = await response.text();
    expect(result).toContain("Event storage is temporarily unavailable");
    expect(result).not.toContain("private storage implementation detail");
  });

  it("rejects non-JSON webhook requests before reading or storing an event", async () => {
    const body = JSON.stringify(makePayload());
    const append = vi.fn(async () => new Response(
      JSON.stringify({ accepted: true, duplicate: false }),
      { status: 200 }
    ));
    const response = await postWebhook(
      body,
      await signBody(body),
      makeNamespace(append),
      { "content-type": "text/plain" }
    );

    expect(response.status).toBe(415);
    expect(append).not.toHaveBeenCalled();
  });
});
