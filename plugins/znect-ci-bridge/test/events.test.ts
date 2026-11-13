import { describe, expect, it } from "vitest";
import { BuildEventStore, normalizeCircleCiWebhook, verifyCircleCiSignature } from "../src/events";

const workflowPayload = {
  id: "3888f21b-eaa7-38e3-8f3d-75a63bba8895",
  type: "workflow-completed",
  happened_at: new Date().toISOString(),
  project: { slug: "gh/Znect-god/znect-forge" },
  workflow: {
    id: "fda08377-fe7e-46b1-8992-3a7aaecac9c3",
    name: "build-test",
    status: "failed",
    url: "https://app.circleci.com/pipelines/github/Znect-god/znect-forge/1/workflows/fda08377-fe7e-46b1-8992-3a7aaecac9c3"
  },
  pipeline: {
    id: "1285fe1d-d3a6-44fc-8886-8979558254c4",
    number: 130,
    vcs: { branch: "work/0.7.0", revision: "a".repeat(40), commit: { subject: "Fix tests" } }
  }
};

describe("CircleCI webhook verification", () => {
  it("accepts the documented HMAC-SHA256 example", async () => {
    const body = new TextEncoder().encode("foo").buffer;
    expect(await verifyCircleCiSignature(
      body,
      "v1=773ba44693c7553d6ee20f61ea5d2757a9a4f4a44d2841ae4e95b52e4cd62db4",
      "secret"
    )).toBe(true);
  });

  it("rejects an invalid signature and missing v1 signature", async () => {
    const body = new TextEncoder().encode("foo").buffer;
    expect(await verifyCircleCiSignature(body, "v1=not-a-valid-signature", "secret")).toBe(false);
    expect(await verifyCircleCiSignature(body, "v1=" + "a".repeat(64) + ",v2=" + "b".repeat(64), "secret")).toBe(false);
    expect(await verifyCircleCiSignature(body, "v2=" + "a".repeat(64), "secret")).toBe(false);
  });

  it("normalizes only Forge workflow completion events", () => {
    const event = normalizeCircleCiWebhook(workflowPayload, "workflow-completed");
    expect(event).toMatchObject({
      id: workflowPayload.id,
      type: "workflow-completed",
      project_slug: "gh/Znect-god/znect-forge",
      workflow_status: "failed",
      branch: "work/0.7.0",
      commit_subject: "Fix tests"
    });
    expect(event?.workflow_url).toBe(workflowPayload.workflow.url);
  });

  it("ignores events from other projects", () => {
    expect(normalizeCircleCiWebhook({
      ...workflowPayload,
      project: { slug: "gh/someone/else" }
    }, "workflow-completed")).toBeNull();
  });

  it("rejects a mismatched event type and unsafe workflow URLs", () => {
    expect(() => normalizeCircleCiWebhook(workflowPayload, "job-completed")).toThrow(/event type mismatch/i);
    const event = normalizeCircleCiWebhook({
      ...workflowPayload,
      workflow: { ...workflowPayload.workflow, url: "https://attacker.example/run" }
    }, "workflow-completed");
    expect(event?.workflow_url).toBeUndefined();
  });

  it("ignores stale webhook events rather than asking CircleCI to retry them", () => {
    expect(normalizeCircleCiWebhook({
      ...workflowPayload,
      happened_at: "2001-01-01T00:00:00.000Z"
    }, "workflow-completed")).toBeNull();
  });
});


describe("Durable event inbox storage contract", () => {
  class FakeSql {
    rows: Array<{ seq: number; event_id: string; happened_at: string; event_json: string }> = [];
    next = 1;

    exec(query: string, ...values: unknown[]) {
      const sql = query.replace(/\\s+/g, " ").trim();
      if (sql.startsWith("SELECT seq FROM build_events WHERE event_id")) {
        const row = this.rows.find((entry) => entry.event_id === values[0]);
        return { toArray: () => row ? [{ seq: row.seq }] : [] };
      }
      if (sql.startsWith("INSERT INTO build_events")) {
        this.rows.push({
          seq: this.next++,
          event_id: String(values[0]),
          happened_at: String(values[1]),
          event_json: String(values[2])
        });
        return { toArray: () => [] };
      }
      if (sql.startsWith("DELETE FROM build_events WHERE happened_at")) {
        this.rows = this.rows.filter((entry) => entry.happened_at >= String(values[0]));
        return { toArray: () => [] };
      }
      if (sql.startsWith("DELETE FROM build_events WHERE seq NOT IN")) {
        const keep = Number(values[0]);
        this.rows = this.rows.sort((a, b) => b.seq - a.seq).slice(0, keep);
        return { toArray: () => [] };
      }
      if (sql.startsWith("SELECT seq, event_json FROM build_events")) {
        const after = Number(values[0]);
        const limit = Number(values[1]);
        return {
          toArray: () => this.rows
            .filter((entry) => entry.seq > after)
            .sort((a, b) => a.seq - b.seq)
            .slice(0, limit)
            .map((entry) => ({ seq: entry.seq, event_json: entry.event_json }))
        };
      }
      return { toArray: () => [] };
    }
  }

  it("deduplicates CircleCI event IDs and serves cursor-based event reads", async () => {
    const sql = new FakeSql();
    const store = new BuildEventStore({
      storage: { sql }
    } as unknown as DurableObjectState);
    const event = normalizeCircleCiWebhook(workflowPayload, "workflow-completed");
    expect(event).not.toBeNull();

    const append = () => store.fetch(new Request("https://event-store/append", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event)
    }));
    const first = await append();
    await expect(first.json()).resolves.toMatchObject({ accepted: true, duplicate: false });
    const duplicate = await append();
    await expect(duplicate.json()).resolves.toMatchObject({ accepted: true, duplicate: true });

    const page = await store.fetch(new Request("https://event-store/events?after=0&limit=10"));
    await expect(page.json()).resolves.toMatchObject({
      events: [{ cursor: 1, id: workflowPayload.id, workflow_status: "failed" }],
      next_cursor: 1
    });
    const empty = await store.fetch(new Request("https://event-store/events?after=1&limit=10"));
    await expect(empty.json()).resolves.toMatchObject({ events: [], next_cursor: 1 });
  });
});
