import { readBoundedJson, readBoundedText } from "./security";

const CIRCLECI_V3_API = "https://circleci.com/api/v3";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_JSON_BYTES = 1_000_000;
const MAX_TEXT_BYTES = 1_000_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface V3Resource<T = Record<string, unknown>> {
  id: string;
  attributes?: T;
  references?: Record<string, unknown>;
}

export interface V3Collection<T = Record<string, unknown>> {
  data: Array<V3Resource<T>>;
  page?: { next?: string | null; prev?: string | null };
}

export function isCircleCiUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function assertUuid(value: string, label: string): void {
  if (!isCircleCiUuid(value)) throw new Error(`Invalid CircleCI ${label}.`);
}

function validateApiPath(path: string): URL {
  if (
    !path.startsWith("/api/v3/") ||
    path.startsWith("//") ||
    path.includes("\\\\") ||
    /%2f|%5c/i.test(path) ||
    path.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error("Invalid internal CircleCI API v3 path.");
  }
  const url = new URL(path, CIRCLECI_V3_API);
  if (
    url.origin !== "https://circleci.com" ||
    !url.pathname.startsWith("/api/v3/") ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("Invalid internal CircleCI API v3 path.");
  }
  return url;
}

/** Fixed-origin, GET-only CircleCI API v3 request with bounded JSON parsing. */
export async function circleV3Get<T>(token: string, path: string): Promise<T> {
  const url = validateApiPath(path);
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    },
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });

  if (!response.ok) {
    const safeMessage = response.status === 401 || response.status === 403
      ? "CircleCI API v3 rejected the configured read-only token. Check its type and project access."
      : response.status === 404
        ? "The requested CircleCI API v3 resource was not found or is not accessible."
        : response.status === 429
          ? "CircleCI API v3 rate limit exceeded. Retry after the indicated interval."
          : `CircleCI API v3 returned HTTP ${response.status}.`;
    throw new Error(safeMessage);
  }

  return readBoundedJson<T>(response, MAX_JSON_BYTES);
}

/** Fixed-origin, GET-only text endpoint for job stdout/stderr. */
export async function circleV3GetText(
  token: string,
  path: string,
  maxBytes = MAX_TEXT_BYTES
): Promise<{ text: string; truncated: boolean }> {
  const url = validateApiPath(path);
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "text/plain"
    },
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });

  if (response.status === 204) return { text: "", truncated: false };
  if (!response.ok) {
    const safeMessage = response.status === 401 || response.status === 403
      ? "CircleCI API v3 rejected the configured read-only token. Check its type and project access."
      : response.status === 404
        ? "The requested CircleCI job output was not found or is not accessible."
        : response.status === 429
          ? "CircleCI API v3 rate limit exceeded. Retry after the indicated interval."
          : `CircleCI API v3 returned HTTP ${response.status}.`;
    throw new Error(safeMessage);
  }

  return readBoundedText(response, maxBytes);
}

export async function resolveCircleCiProject(
  token: string,
  projectSlug: string
): Promise<V3Resource<Record<string, unknown>>> {
  if (!/^gh\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(projectSlug)) {
    throw new Error("Invalid CircleCI GitHub project slug.");
  }
  const query = new URLSearchParams({ "filter[slug]": projectSlug });
  const result = await circleV3Get<V3Collection<Record<string, unknown>>>(
    token,
    `/api/v3/projects?${query.toString()}`
  );
  if (!Array.isArray(result.data) || result.data.length !== 1) {
    throw new Error("CircleCI project slug did not resolve to exactly one project.");
  }
  const project = result.data[0];
  assertUuid(project.id, "project ID");
  const slug = project.attributes?.slug;
  if (typeof slug === "string" && slug !== projectSlug) {
    throw new Error("CircleCI project identity did not match the configured slug.");
  }
  return project;
}

export async function listCircleCiRuns(
  token: string,
  projectId: string,
  limit: number
): Promise<V3Resource[]> {
  assertUuid(projectId, "project ID");
  if (!Number.isInteger(limit) || limit < 1 || limit > 30) {
    throw new Error("Run limit must be an integer between 1 and 30.");
  }

  const runs: V3Resource[] = [];
  let cursor: string | null = null;
  const seenCursors = new Set<string>();

  // v3 caps a run page at 20. A maximum of two pages is enough for this tool's
  // 30-item contract; cursor values remain opaque and are never interpreted.
  for (let pageIndex = 0; pageIndex < 2 && runs.length < limit; pageIndex++) {
    const query = new URLSearchParams({
      "filter[project_id]": projectId,
      "page[limit]": String(Math.min(20, limit - runs.length))
    });
    if (cursor) query.set("page[cursor]", cursor);
    const page = await circleV3Get<V3Collection>(
      token,
      `/api/v3/runs?${query.toString()}`
    );
    if (!Array.isArray(page.data)) throw new Error("CircleCI API v3 returned an invalid runs collection.");
    runs.push(...page.data);
    const next = page.page?.next;
    if (typeof next !== "string" || next.length === 0) break;
    if (seenCursors.has(next)) throw new Error("CircleCI API v3 repeated a pagination cursor.");
    seenCursors.add(next);
    cursor = next;
  }
  return runs.slice(0, limit);
}

export async function listCircleCiWorkflows(
  token: string,
  runId: string
): Promise<V3Resource[]> {
  assertUuid(runId, "run ID");
  const query = new URLSearchParams({
    "filter[run_id]": runId,
    "page[limit]": "20"
  });
  const page = await circleV3Get<V3Collection>(
    token,
    `/api/v3/workflows?${query.toString()}`
  );
  if (!Array.isArray(page.data)) throw new Error("CircleCI API v3 returned an invalid workflows collection.");
  return page.data;
}

export async function listCircleCiJobs(
  token: string,
  workflowId: string
): Promise<V3Resource[]> {
  assertUuid(workflowId, "workflow ID");
  const query = new URLSearchParams({
    "filter[workflow_id]": workflowId,
    "page[limit]": "100"
  });
  const page = await circleV3Get<V3Collection>(
    token,
    `/api/v3/jobs?${query.toString()}`
  );
  if (!Array.isArray(page.data)) throw new Error("CircleCI API v3 returned an invalid jobs collection.");
  return page.data;
}

export async function getCircleCiJob(
  token: string,
  jobId: string
): Promise<V3Resource> {
  assertUuid(jobId, "job ID");
  return circleV3Get<V3Resource>(token, `/api/v3/jobs/${jobId}`);
}

export async function getCircleCiJobStepOutput(
  token: string,
  jobId: string,
  stepNum: number,
  stream: "stdout" | "stderr",
  execution = 0,
  maxBytes = MAX_TEXT_BYTES
): Promise<{ text: string; truncated: boolean }> {
  assertUuid(jobId, "job ID");
  if (!Number.isInteger(stepNum) || stepNum < 0) throw new Error("Step number must be a non-negative integer.");
  if (!Number.isInteger(execution) || execution < 0) throw new Error("Execution must be a non-negative integer.");
  if (stream !== "stdout" && stream !== "stderr") throw new Error("Unsupported job output stream.");
  const query = new URLSearchParams({
    "filter[step_num]": String(stepNum),
    "filter[execution]": String(execution)
  });
  return circleV3GetText(
    token,
    `/api/v3/jobs/${jobId}/${stream}?${query.toString()}`,
    maxBytes
  );
}
