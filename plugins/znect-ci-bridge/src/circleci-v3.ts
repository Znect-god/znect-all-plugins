import { allowedArtifactUrl, fetchAllowedArtifact, fetchWithSafeErrors, readBoundedJson, readBoundedText, retryAfterSeconds } from "./security";

const CIRCLECI_V3_API = "https://circleci.com/api/v3";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_JSON_BYTES = 1_000_000;
const MAX_TEXT_BYTES = 1_000_000;
const MAX_ARTIFACTS = 100;
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

export interface V3SingleResource<T = Record<string, unknown>> {
  data: V3Resource<T>;
}

export function isCircleCiUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function assertUuid(value: string, label: string): void {
  if (!isCircleCiUuid(value)) throw new Error(`Invalid CircleCI ${label}.`);
}

function validateApiPath(path: string): URL {
  const rawPath = path.split("?", 1)[0];
  if (
    !rawPath.startsWith("/api/v3/") ||
    rawPath.startsWith("//") ||
    rawPath.includes("//") ||
    rawPath.includes("\\") ||
    /%2f|%5c/i.test(rawPath) ||
    rawPath.split("/").some((part) => part === "." || part === "..")
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
  const response = await fetchWithSafeErrors(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    },
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });

  if (!response.ok) {
    const safeMessage = response.status === 401
      ? "CircleCI API v3 authentication failed (HTTP 401). Check whether CIRCLECI_TOKEN is a valid, unexpired Personal API Token."
      : response.status === 403
        ? "CircleCI API v3 authorization failed (HTTP 403). The authenticated account or token does not have access to this project."
        : response.status === 404
        ? "The requested CircleCI API v3 resource was not found or is not accessible."
        : response.status === 429
          ? `CircleCI API v3 rate limit exceeded.${retryAfterSeconds(response.headers.get("retry-after")) === null ? " Retry after the indicated interval." : ` Retry after ${retryAfterSeconds(response.headers.get("retry-after"))} seconds.`}`
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
  const response = await fetchWithSafeErrors(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "text/plain"
    },
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });

  if (response.status === 204) return { text: "", truncated: false };
  if (!response.ok) {
    const safeMessage = response.status === 401
      ? "CircleCI API v3 authentication failed (HTTP 401). Check whether CIRCLECI_TOKEN is a valid, unexpired Personal API Token."
      : response.status === 403
        ? "CircleCI API v3 authorization failed (HTTP 403). The authenticated account or token does not have access to this project."
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
  // CircleCI v3 resolves this resource through filter[slug]. The API's
  // project collection guarantees that a single returned item is the project
  // matching that filter; unlike many other v3 resources, the project slug is
  // not guaranteed to be present in attributes on every response shape.
  // Requiring attributes.slug here can reject a valid, successfully resolved
  // project even though the server already applied the exact slug filter.
  return project;
}

export async function getCircleCiRun(
  token: string,
  runId: string
): Promise<V3Resource> {
  assertUuid(runId, "run ID");
  const result = await circleV3Get<V3SingleResource>(token, `/api/v3/runs/${runId}`);
  if (!result || !result.data || typeof result.data.id !== "string") {
    throw new Error("CircleCI API v3 returned an invalid run resource.");
  }
  return result.data;
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
    for (const run of page.data) assertUuid(run.id, "run ID");
    runs.push(...page.data);
    const next: string | null | undefined = page.page?.next;
    if (typeof next !== "string" || next.length === 0) break;
    if (seenCursors.has(next)) throw new Error("CircleCI API v3 repeated a pagination cursor.");
    seenCursors.add(next);
    cursor = next;
  }
  return runs.slice(0, limit);
}

const COLLECTION_PAGE_SIZE = 20;
const MAX_COLLECTION_PAGES = 10;

/** Fetch a bounded collection completely, following only opaque API cursors. */
async function listCircleCiCollection(
  pathForCursor: (cursor: string | null) => string,
  resourceLabel: "workflow" | "job",
  token: string,
  maxPages = MAX_COLLECTION_PAGES
): Promise<V3Resource[]> {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > MAX_COLLECTION_PAGES) {
    throw new Error(`Collection page limit must be between 1 and ${MAX_COLLECTION_PAGES}.`);
  }
  const resources: V3Resource[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const page: V3Collection = await circleV3Get<V3Collection>(
      token,
      pathForCursor(cursor)
    );
    if (!Array.isArray(page.data)) {
      throw new Error(`CircleCI API v3 returned an invalid ${resourceLabel}s collection.`);
    }
    for (const resource of page.data) assertUuid(resource.id, `${resourceLabel} ID`);
    resources.push(...page.data);

    const next = page.page?.next;
    if (typeof next !== "string" || next.length === 0) return resources;
    if (seenCursors.has(next)) {
      throw new Error(`CircleCI API v3 repeated a pagination cursor while listing ${resourceLabel}s.`);
    }
    seenCursors.add(next);
    cursor = next;
  }

  throw new Error(`CircleCI API v3 ${resourceLabel}s collection exceeded the safety limit of ${maxPages * COLLECTION_PAGE_SIZE} items.`);
}

export async function listCircleCiWorkflows(
  token: string,
  runId: string,
  maxPages = MAX_COLLECTION_PAGES
): Promise<V3Resource[]> {
  assertUuid(runId, "run ID");
  return listCircleCiCollection((cursor) => {
    const query = new URLSearchParams({
      "filter[run_id]": runId,
      "page[limit]": String(COLLECTION_PAGE_SIZE)
    });
    if (cursor) query.set("page[cursor]", cursor);
    return `/api/v3/workflows?${query.toString()}`;
  }, "workflow", token, maxPages);
}

export async function listCircleCiJobs(
  token: string,
  workflowId: string,
  maxPages = MAX_COLLECTION_PAGES
): Promise<V3Resource[]> {
  assertUuid(workflowId, "workflow ID");
  return listCircleCiCollection((cursor) => {
    const query = new URLSearchParams({
      "filter[workflow_id]": workflowId,
      "page[limit]": String(COLLECTION_PAGE_SIZE)
    });
    if (cursor) query.set("page[cursor]", cursor);
    return `/api/v3/jobs?${query.toString()}`;
  }, "job", token, maxPages);
}

export async function getCircleCiJob(
  token: string,
  jobId: string
): Promise<V3Resource> {
  assertUuid(jobId, "job ID");
  const result = await circleV3Get<V3SingleResource>(token, `/api/v3/jobs/${jobId}`);
  if (!result || !result.data || typeof result.data.id !== "string") {
    throw new Error("CircleCI API v3 returned an invalid job resource.");
  }
  return result.data;
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


export interface CircleCiArtifact {
  id?: string;
  attributes?: {
    path?: string;
    url?: string;
    node_index?: number;
    size?: number;
  };
}

/** Read the structured test results as bounded JSON Lines. */
export async function getCircleCiJobTests(
  token: string,
  jobId: string,
  maxBytes = MAX_TEXT_BYTES
): Promise<{ text: string; truncated: boolean }> {
  assertUuid(jobId, "job ID");
  return circleV3GetText(token, `/api/v3/jobs/${jobId}/tests`, maxBytes);
}

/** List artifact metadata for one job; presigned URLs are kept internal. */
export async function listCircleCiJobArtifacts(
  token: string,
  jobId: string
): Promise<CircleCiArtifact[]> {
  assertUuid(jobId, "job ID");
  const result = await circleV3Get<V3Collection<CircleCiArtifact["attributes"]>>(
    token,
    `/api/v3/jobs/${jobId}/artifacts`
  );
  if (!Array.isArray(result.data)) {
    throw new Error("CircleCI API v3 returned an invalid artifacts collection.");
  }
  if (result.data.length > MAX_ARTIFACTS) {
    throw new Error("CircleCI job returned more than 100 artifacts; refusing an unbounded response.");
  }
  return result.data;
}


/** Fetch one artifact by its exact listed path; caller cannot supply a URL. */
export async function getCircleCiJobArtifact(
  token: string,
  jobId: string,
  artifactPath: string,
  maxBytes = MAX_TEXT_BYTES
): Promise<{ path: string; text: string; truncated: boolean }> {
  if (typeof artifactPath !== "string" || artifactPath.length < 1 || artifactPath.length > 512 ||
      artifactPath.startsWith("/") || artifactPath.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("Invalid CircleCI artifact path.");
  }
  const artifacts = await listCircleCiJobArtifacts(token, jobId);
  const matches = artifacts.filter((artifact) => artifact.attributes?.path === artifactPath);
  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? "The requested artifact path was not found for this job."
      : "The requested artifact path is ambiguous for this job.");
  }
  const rawUrl = matches[0].attributes?.url;
  if (typeof rawUrl !== "string") throw new Error("CircleCI artifact does not include a download URL.");
  const url = allowedArtifactUrl(rawUrl);
  if (!url) throw new Error("CircleCI artifact URL is not on an allowed HTTPS host.");
  const response = await fetchAllowedArtifact(url);
  if (!response.ok) throw new Error(`CircleCI artifact download failed (HTTP ${response.status}).`);
  const bounded = await readBoundedText(response, maxBytes);
  return { path: artifactPath, ...bounded };
}
