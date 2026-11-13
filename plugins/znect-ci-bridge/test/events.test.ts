import { describe, expect, it } from "vitest";
import { normalizeCircleCiWebhook, verifyCircleCiSignature } from "../src/events";

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
