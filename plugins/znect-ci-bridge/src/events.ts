export interface BridgeEvent {
  id: string;
  type: "workflow-completed" | "job-completed";
  happened_at: string;
  project_slug: string;
  pipeline_id?: string;
  pipeline_number?: number;
  branch?: string;
  revision?: string;
  commit_subject?: string;
  workflow_id?: string;
  workflow_name?: string;
  workflow_status?: string;
  workflow_url?: string;
  job_id?: string;
  job_name?: string;
  job_status?: string;
  job_number?: number;
}

const EXPECTED_PROJECTS = new Set([
  "gh/Znect-god/znect-forge",
  "github/Znect-god/znect-forge"
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_EVENT_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_EVENTS = 500;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeString(value: unknown, max = 512): string | undefined {
  return typeof value === "string" && value.length > 0
    ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max)
    : undefined;
}

function safeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function safeCircleCiUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "app.circleci.com" && !url.username && !url.password
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

/** Verify CircleCI's v1 HMAC-SHA256 signature against the exact raw request body. */
export async function verifyCircleCiSignature(
  body: ArrayBuffer,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const signatures = signatureHeader.split(",").map((part) => part.trim());
  const parsed: Array<{ version: number; digest: string }> = [];
  for (const part of signatures) {
    const separator = part.indexOf("=");
    if (separator < 0) return false;
    const versionLabel = part.slice(0, separator).trim();
    const digest = part.slice(separator + 1).trim().toLowerCase();
    const versionMatch = /^v([1-9][0-9]*)$/.exec(versionLabel);
    if (!versionMatch || !/^[0-9a-f]{64}$/.test(digest)) return false;
    parsed.push({ version: Number(versionMatch[1]), digest });
  }
  const highestVersion = Math.max(...parsed.map((entry) => entry.version));
  // CircleCI requires clients to validate only the newest signature version.
  // Fail closed on an unknown newer version instead of downgrading to v1.
  if (highestVersion !== 1) return false;
  const v1 = parsed.filter((entry) => entry.version === 1);
  if (v1.length !== 1) return false;
  const supplied = v1[0].digest;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
  const expected = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  let difference = supplied.length ^ expected.length;
  for (let index = 0; index < expected.length; index++) {
    difference |= expected.charCodeAt(index) ^ (supplied.charCodeAt(index) || 0);
  }
  return difference === 0;
}

/** Reduce the open CircleCI webhook payload to a bounded, non-sensitive event record. */
export function normalizeCircleCiWebhook(
  payload: unknown,
  headerEventType: string | null
): BridgeEvent | null {
  const root = record(payload);
  const type = safeString(root.type, 64);
  // CircleCI Test Ping Event uses an abbreviated payload and is only a
  // connectivity check. It must be acknowledged, never stored as a build event.
  // The request signature has already been verified by the caller.
  // Ping payloads are intentionally abbreviated. After signature verification,
  // acknowledge any payload that is not one of the two supported build events.
  // This also tolerates Ping variants that omit the payload type or event header.
  if (type !== "workflow-completed" && type !== "job-completed") return null;
  if (type !== headerEventType) throw new Error("CircleCI webhook event type mismatch.");

  const project = record(root.project);
  const projectSlug = safeString(project.slug, 256);
  if (!projectSlug || !EXPECTED_PROJECTS.has(projectSlug)) return null;

  const id = safeString(root.id, 64);
  if (!id || !UUID_RE.test(id)) throw new Error("Invalid CircleCI webhook event ID.");
  const happenedAt = safeString(root.happened_at, 64);
  if (!happenedAt || !Number.isFinite(Date.parse(happenedAt))) {
    throw new Error("Invalid CircleCI webhook timestamp.");
  }
  const happenedTime = Date.parse(happenedAt);
  if (happenedTime > Date.now() + 5 * 60 * 1000) throw new Error("CircleCI webhook timestamp is in the future.");
  if (happenedTime < Date.now() - MAX_EVENT_AGE_MS) return null;

  const pipeline = record(root.pipeline);
  const vcs = record(pipeline.vcs);
  const triggerParameters = record(pipeline.trigger_parameters);
  const git = record(triggerParameters.git);
  const workflow = record(root.workflow);
  const job = record(root.job);
  const workflowUrl = safeCircleCiUrl(workflow.url);

  return {
    id,
    type,
    happened_at: new Date(happenedTime).toISOString(),
    project_slug: "gh/Znect-god/znect-forge",
    pipeline_id: safeString(pipeline.id, 64),
    pipeline_number: safeNumber(pipeline.number),
    branch: safeString(vcs.branch, 256) ?? safeString(git.branch, 256),
    revision: safeString(vcs.revision, 128) ?? safeString(git.commit_sha, 128) ?? safeString(git.checkout_sha, 128),
    commit_subject: safeString(record(vcs.commit).subject, 512),
    workflow_id: safeString(workflow.id, 64),
    workflow_name: safeString(workflow.name, 256),
    workflow_status: safeString(workflow.status, 64),
    workflow_url: workflowUrl,
    job_id: safeString(job.id, 64),
    job_name: safeString(job.name, 256),
    job_status: safeString(job.status, 64),
    job_number: safeNumber(job.number)
  };
}

/** SQLite-backed Durable Object event inbox. CircleCI event IDs are unique for deduplication. */
export class BuildEventStore {
  private readonly sql: SqlStorage;

  constructor(state: DurableObjectState) {
    this.sql = state.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS build_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        happened_at TEXT NOT NULL,
        event_json TEXT NOT NULL
      )
    `);
    this.sql.exec("CREATE INDEX IF NOT EXISTS build_events_happened_at ON build_events(happened_at)");
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/append") {
      let event: BridgeEvent;
      try {
        event = await request.json() as BridgeEvent;
      } catch {
        return Response.json({ error: "Invalid event JSON." }, { status: 400 });
      }
      if (!event || typeof event.id !== "string" || !UUID_RE.test(event.id) ||
          (event.type !== "workflow-completed" && event.type !== "job-completed") ||
          !EXPECTED_PROJECTS.has(event.project_slug) || !Number.isFinite(Date.parse(event.happened_at))) {
        return Response.json({ error: "Invalid normalized event." }, { status: 400 });
      }
      const existing = this.sql.exec("SELECT seq FROM build_events WHERE event_id = ?", event.id).toArray();
      if (existing.length > 0) return Response.json({ accepted: true, duplicate: true });
      this.sql.exec(
        "INSERT INTO build_events (event_id, happened_at, event_json) VALUES (?, ?, ?)",
        event.id,
        event.happened_at,
        JSON.stringify(event)
      );
      const cutoff = new Date(Date.now() - MAX_EVENT_AGE_MS).toISOString();
      this.sql.exec("DELETE FROM build_events WHERE happened_at < ?", cutoff);
      this.sql.exec(
        "DELETE FROM build_events WHERE seq NOT IN (SELECT seq FROM build_events ORDER BY seq DESC LIMIT ?)",
        MAX_EVENTS
      );
      return Response.json({ accepted: true, duplicate: false });
    }

    if (request.method === "GET" && url.pathname === "/events") {
      const afterRaw = url.searchParams.get("after") ?? "0";
      const limitRaw = url.searchParams.get("limit") ?? "20";
      const after = Number(afterRaw);
      const limit = Number(limitRaw);
      if (!Number.isSafeInteger(after) || after < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
        return Response.json({ error: "after must be a non-negative integer and limit must be 1–50." }, { status: 400 });
      }
      const rows = this.sql.exec(
        "SELECT seq, event_json FROM build_events WHERE seq > ? ORDER BY seq ASC LIMIT ?",
        after,
        limit
      ).toArray() as Array<{ seq: number; event_json: string }>;
      const events = rows.map((row) => ({ cursor: row.seq, ...JSON.parse(row.event_json) as BridgeEvent }));
      return Response.json({ events, next_cursor: rows.length ? rows[rows.length - 1].seq : after });
    }
    return new Response("Not found", { status: 404 });
  }
}
