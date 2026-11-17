import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";

class MemoryKV {
  data = new Map<string, string>();
  async put(key: string, value: string) { this.data.set(key, value); }
  async get(key: string, type?: string) {
    const value = this.data.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }
  async list({ prefix = "", limit = 100 } = {}) {
    return { keys: [...this.data.keys()].filter(k => k.startsWith(prefix)).slice(0, limit).map(name => ({ name })) };
  }
}

async function signature(body: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return "v1=" + [...digest].map(b => b.toString(16).padStart(2, "0")).join("");
}

describe("free CircleCI webhook channel", () => {
  const secret = "test-signing-secret";
  const env = { EVENTS: new MemoryKV(), CIRCLECI_SIGNING_SECRET: secret, BRIDGE_READ_TOKEN: "read-token" } as unknown as Env;

  it("rejects an unsigned webhook", async () => {
    const request = new Request("https://bridge.test/webhooks/circleci", { method: "POST", body: "{}" });
    const result = await worker.fetch(request, env);
    expect(result.status).toBe(401);
  });

  it("stores a valid signed event and exposes it only to an authorized reader", async () => {
    const body = JSON.stringify({
      id: "event-1",
      project: { name: "znect-forge" },
      pipeline: { vcs: { branch: "work/test", revision: "abc123" } },
      workflow: { name: "unit-tests", status: "success" }
    });
    const request = new Request("https://bridge.test/webhooks/circleci", {
      method: "POST",
      headers: { "circleci-signature": await signature(body, secret), "circleci-event-type": "workflow-completed" },
      body
    });
    const accepted = await worker.fetch(request, env);
    expect(accepted.status).toBe(202);

    const denied = await worker.fetch(new Request("https://bridge.test/api/events"), env);
    expect(denied.status).toBe(401);

    const allowed = await worker.fetch(new Request("https://bridge.test/api/events", {
      headers: { authorization: "Bearer read-token" }
    }), env);
    expect(allowed.status).toBe(200);
    const result = await allowed.json() as { events: Array<{ status: string; project: string }> };
    expect(result.events).toHaveLength(1);
    expect(result.events[0].status).toBe("success");
    expect(result.events[0].project).toBe("znect-forge");
  });
});
