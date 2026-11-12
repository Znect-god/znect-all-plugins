import { readBoundedJson } from "./security";

const CIRCLECI_API = "https://circleci.com/api/v1.1";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_CIRCLECI_JSON_BYTES = 1_000_000;

/**
 * Read a CircleCI v1.1 endpoint using a fixed origin and bounded response body.
 * The caller must construct paths from fixed project constants and validated IDs.
 */
export async function circleGet<T>(
  token: string,
  path: string
): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("Invalid internal CircleCI API path.");
  }

  const url = new URL(`${CIRCLECI_API}${path}`);
  if (
    url.origin !== "https://circleci.com" ||
    !url.pathname.startsWith("/api/v1.1/project/") ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("Invalid internal CircleCI API path.");
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { "Circle-Token": token, "Accept": "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });

  if (!response.ok) {
    const safeMessage = response.status === 401 || response.status === 403
      ? "CircleCI rejected the configured read-only token. Check the Worker secret."
      : `CircleCI API returned HTTP ${response.status}.`;
    throw new Error(safeMessage);
  }

  return await readBoundedJson<T>(response, MAX_CIRCLECI_JSON_BYTES);
}
