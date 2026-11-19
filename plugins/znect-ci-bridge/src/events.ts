import { loadProjectRegistry } from "./registry";

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

const DEFAULT_PROJECT_SLUGS = new Set([
  "gh/Znect-god/znect-forge",
  "github/Znect-god/znect-forge"
]);
const PROJECT_SLUG_RE = /^(?:gh|github)\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_EVENT_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_EVENTS = 500;
const MAX_STORED_EVENT_BYTES = 8 * 1024;

function isNormalizedStoredEvent(value: unknown, acceptedProjectSlugs: ReadonlySet<string>): value is BridgeEvent {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.id !== "string" || !UUID_RE.test(event.id) ||
      (event.type !== "workflow-completed" && event.type !== "job-completed") ||
      typeof event.project_slug !== "string" || event.project_slug.length > 256 || !PROJECT_SLUG_RE.test(event.project_slug) || !acceptedProjectSlugs.has(event.project_slug) ||
      typeof event.happened_at !== "string") return false;
  const timestamp = Date.parse(event.happened_at);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== event.happened_at ||
      timestamp > Date.now() + 5 * 60 * 1000 || timestamp < Date.now() - MAX_EVENT_AGE_MS) return false;

  const allowedFields = new Set([
    "id", "type", "happened_at", "project_slug", "pipeline_id", "pipeline_number",
    "branch", "revision", "commit_subject", "workflow_id", "workflow_name",
    "workflow_status", "workflow_url", "job_id", "job_name", "job_status", "job_number"
  ]);
  if (Object.keys(event).some((key) => !allowedFields.has(key))) return false;

  const stringLimits: Record<string, number> = {
    pipeline_id: 64, branch: 256, revision: 128, commit_subject: 512,
    workflow_id: 64, workflow_name: 256, workflow_status: 64, workflow_url: 2048,
    job_id: 64, job_name: 256, job_status: 64
  };
  for (const [key, max] of Object.entries(stringLimits)) {
    const field = event[key];
    if (field !== undefined && (typeof field !== "string" || field.length === 0 || field.length > max || /[\u0000-\u001f\u007f]/.test(field))) return false;
  }
  if (event.workflow_url !== undefined && safeCircleCiUrl(event.workflow_url) !== event.workflow_url) return false;
  for (const key of ["pipeline_number", "job_number"]) {
    const field = event[key];
    if (field !== undefined && (typeof field !== "number" || !Number.isSafeInteger(field) || field < 0)) return false;
  }
  return true;
}

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
    return url.protocol === "https:" && url.hostname === "app.circleci.com" && (url.port === "" || url.port === "443") && !url.username && !url.password
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
  if (!signatureHeader || signatureHeader.length > 1024 || !secret) return false;
  const signatures = signatureHeader.split(",").map((part) => part.trim());
  if (signatures.length > 8) return false;
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
  headerEventType: string | null,
  acceptedProjectSlugs: ReadonlySet<string> = DEFAULT_PROJECT_SLUGS
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
  if (!projectSlug || !PROJECT_SLUG_RE.test(projectSlug) || !acceptedProjectSlugs.has(projectSlug)) return null;

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
    project_slug: projectSlug,
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
    // Keep replay keys independently of the bounded event-history window.
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS seen_event_ids (
        event_id TEXT PRIMARY KEY,
        happened_at TEXT NOT NULL
      )
    `);
    this.sql.exec("CREATE INDEX IF NOT EXISTS seen_event_ids_happened_at ON seen_event_ids(happened_at)");
    // Preserve deduplication for events that were retained before this schema was introduced.
    this.sql.exec(
      "INSERT OR IGNORE INTO seen_event_ids (event_id, happened_at) SELECT event_id, happened_at FROM build_events"
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/append") {
      if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
        return Response.json({ error: "Unsupported media type." }, { status: 415 });
      }
      const declaredLength = request.headers.get("content-length");
      if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_STORED_EVENT_BYTES)) {
        try { await request.body?.cancel(); } catch { /* request is rejected */ }
        return Response.json({ error: "Event payload exceeds the storage limit." }, { status: 413 });
      }
      if (!request.body) return Response.json({ error: "Invalid event JSON." }, { status: 400 });
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value.byteLength > MAX_STORED_EVENT_BYTES - total) {
            try { await reader.cancel(); } catch { /* request is rejected */ }
            return Response.json({ error: "Event payload exceeds the storage limit." }, { status: 413 });
          }
          chunks.push(value);
          total += value.byteLength;
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let parsed: unknown;
      try { parsed = JSON.parse(new TextDecoder().decode(bytes)); }
      catch { return Response.json({ error: "Invalid event JSON." }, { status: 400 }); }
      // The SQLite sequence owns pagination. Ignore any caller-supplied cursor
      // rather than trusting it or rejecting an otherwise valid normalized event.
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        delete (parsed as Record<string, unknown>).cursor;
      }
      if (!isNormalizedStoredEvent(parsed, this.acceptedProjectSlugs)) {
        return Response.json({ error: "Invalid normalized event." }, { status: 400 });
      }
      const event = parsed;
      const existing = this.sql.exec(
        "SELECT event_id FROM seen_event_ids WHERE event_id = ? UNION SELECT event_id FROM build_events WHERE event_id = ?",
        event.id,
        event.id
      ).toArray();
      if (existing.length > 0) return Response.json({ accepted: true, duplicate: true });
      this.sql.exec(
        "INSERT INTO build_events (event_id, happened_at, event_json) VALUES (?, ?, ?)",
        event.id,
        event.happened_at,
        JSON.stringify(event)
      );
      this.sql.exec(
        "INSERT OR IGNORE INTO seen_event_ids (event_id, happened_at) VALUES (?, ?)",
        event.id,
        event.happened_at
      );
      const cutoff = new Date(Date.now() - MAX_EVENT_AGE_MS).toISOString();
      this.sql.exec("DELETE FROM build_events WHERE happened_at < ?", cutoff);
      this.sql.exec("DELETE FROM seen_event_ids WHERE happened_at < ?", cutoff);
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
      // The initial read is a recent snapshot (newest first). Once a caller
      // stores next_cursor, subsequent reads return only events received later.
      const rows = (after === 0
        ? this.sql.exec(
            "SELECT seq, event_json FROM build_events ORDER BY seq DESC LIMIT ?",
            limit
          )
        : this.sql.exec(
            "SELECT seq, event_json FROM build_events WHERE seq > ? ORDER BY seq ASC LIMIT ?",
            after,
            limit
          )).toArray() as Array<{ seq: number; event_json: string }>;
      // The database sequence is authoritative; never allow stored JSON to override its cursor.
      const events = rows.map((row) => ({ ...JSON.parse(row.event_json) as BridgeEvent, cursor: row.seq }));
      const nextCursor = rows.length ? Math.max(...rows.map((row) => row.seq)) : after;
      return Response.json({ events, next_cursor: nextCursor });
    }
    return new Response("Not found", { status: 404 });
  }
}
