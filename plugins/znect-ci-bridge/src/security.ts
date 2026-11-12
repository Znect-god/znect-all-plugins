/** Normalize network failures so runtime internals and request details never reach callers. */
export async function fetchWithSafeErrors(
  url: string,
  init: RequestInit,
  label = "CircleCI API"
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error(`${label} request timed out.`);
    }
    throw new Error(`${label} request failed due to a network or TLS error.`);
  }
}

/** Parse Retry-After without reflecting arbitrary upstream header contents. */
export function retryAfterSeconds(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\\d+(?:\\.\\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : null;
  }
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? Math.max(0, Math.ceil((timestamp - now) / 1000)) : null;
}

export interface SecretEnv {
  CIRCLECI_TOKEN?: string;
  MCP_ACCESS_TOKEN?: string;
  WEB_ACCESS_TOKEN?: string;
}

export async function safeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b))
  ]);
  const aa = new Uint8Array(left);
  const bb = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i];
  return difference === 0;
}

export function redactKnownSecrets(value: string, env: SecretEnv): string {
  let redacted = value;
  for (const secret of [env.CIRCLECI_TOKEN, env.MCP_ACCESS_TOKEN, env.WEB_ACCESS_TOKEN]) {
    if (secret) redacted = redacted.split(secret).join("[REDACTED]");
  }

  const patterns: Array<[RegExp, string]> = [
    [/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]"],
    [/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]"],
    [/\bBasic\s+[A-Za-z0-9+/=]{12,}/gi, "Basic [REDACTED]"],
    [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED GITHUB TOKEN]"],
    [/\bglpat-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED GITLAB TOKEN]"],
    [/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, "[REDACTED STRIPE KEY]"],
    [/\bAIza[0-9A-Za-z_-]{35}\b/g, "[REDACTED GOOGLE API KEY]"],
    [/\bnpm_[A-Za-z0-9]{36}\b/g, "[REDACTED NPM TOKEN]"],
    [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "[REDACTED SLACK TOKEN]"],
    [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED AWS ACCESS KEY ID]"],
    [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED JWT]"],
    [/(["']?\b(?:api[_-]?key|api[_-]?token|access[_-]?token|refresh[_-]?token|auth[_-]?token|client[_-]?secret|token|password|passwd|secret|private[_-]?key|aws_secret_access_key)\b["']?\s*[:=]\s*["']?)([^"'\s,;&}]+)(["']?)/gi, "$1[REDACTED]$3"]
  ];

  for (const [pattern, replacement] of patterns) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

export function allowedArtifactUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  // CircleCI serves HTML artifacts from project-specific circle-artifacts.com
  // subdomains and redirects other artifacts to Amazon S3. Do not allow every
  // AWS hostname: that would unnecessarily include unrelated services.
  const trustedS3Host =
    /^(?:s3|.+\.s3)(?:[.-][a-z0-9-]+){0,2}\.amazonaws\.com$/.test(host);
  const trustedHost = host.endsWith(".circle-artifacts.com") || trustedS3Host;

  if (
    url.protocol !== "https:" ||
    !trustedHost ||
    (url.port !== "" && url.port !== "443") ||
    url.username !== "" ||
    url.password !== ""
  ) {
    return null;
  }

  return url;
}

export async function readBoundedText(
  response: Response,
  maxBytes: number
): Promise<{ text: string; truncated: boolean }> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new Error("maxBytes must be a non-negative safe integer.");
  }
  if (!response.body || maxBytes === 0) {
    return { text: "", truncated: Boolean(response.body && maxBytes === 0) };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - total;
      if (value.byteLength > remaining) {
        if (remaining > 0) chunks.push(value.slice(0, remaining));
        total += Math.max(remaining, 0);
        truncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(bytes), truncated };
}

export function limitText(
  value: string,
  maxChars: number,
  forceTruncated = false
): { text: string; truncated: boolean } {
  if (!Number.isSafeInteger(maxChars) || maxChars < 0) {
    throw new Error("maxChars must be a non-negative safe integer.");
  }
  if (!forceTruncated && value.length <= maxChars) {
    return { text: value, truncated: false };
  }
  if (maxChars === 0) return { text: "", truncated: true };

  const marker = "\n[TRUNCATED: output budget reached]";
  const suffix = marker.slice(0, maxChars);
  const prefixLength = Math.max(0, maxChars - suffix.length);
  return {
    text: value.slice(0, prefixLength) + suffix,
    truncated: true
  };
}


/**
 * Serialize JSON without returning a syntactically broken document when large
 * diagnostic strings exceed the response budget. Longest string fields are
 * shortened first and the root object records that content was omitted.
 */
export function stringifyBoundedJson(value: Record<string, unknown>, maxChars: number): string {
  if (!Number.isSafeInteger(maxChars) || maxChars < 1) {
    throw new Error("maxChars must be a positive safe integer.");
  }
  const clone = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  let serialized = JSON.stringify(clone, null, 2);
  if (serialized.length <= maxChars) return serialized;

  clone.response_truncated = true;
  type StringSlot = { parent: Record<string, unknown> | unknown[]; key: string | number; value: string };
  const findLongest = (node: unknown, parent?: Record<string, unknown> | unknown[], key?: string | number): StringSlot | null => {
    if (typeof node === "string") {
      return parent === undefined || key === undefined ? null : { parent, key, value: node };
    }
    if (Array.isArray(node)) {
      let longest: StringSlot | null = null;
      node.forEach((child, index) => {
        const candidate = findLongest(child, node, index);
        if (candidate && (!longest || candidate.value.length > longest.value.length)) longest = candidate;
      });
      return longest;
    }
    if (node && typeof node === "object") {
      let longest: StringSlot | null = null;
      for (const [childKey, child] of Object.entries(node)) {
        const candidate = findLongest(child, node as Record<string, unknown>, childKey);
        if (candidate && (!longest || candidate.value.length > longest.value.length)) longest = candidate;
      }
      return longest;
    }
    return null;
  };

  for (let attempt = 0; serialized.length > maxChars && attempt < 10_000; attempt++) {
    const slot = findLongest(clone);
    if (!slot || slot.value.length === 0) break;
    const excess = serialized.length - maxChars;
    const nextBudget = Math.max(0, slot.value.length - excess - 64);
    const shortened = limitText(slot.value, nextBudget).text;
    if (Array.isArray(slot.parent)) slot.parent[slot.key as number] = shortened;
    else slot.parent[slot.key as string] = shortened;
    serialized = JSON.stringify(clone, null, 2);
  }

  if (serialized.length <= maxChars) return serialized;
  return JSON.stringify({ response_truncated: true, error: "Diagnostic response exceeded the JSON size limit." });
}

export async function readBoundedJson<T>(
  response: Response,
  maxBytes: number
): Promise<T> {
  const bounded = await readBoundedText(response, maxBytes);
  if (bounded.truncated) {
    throw new Error("CircleCI API response exceeded the configured size limit.");
  }
  try {
    return JSON.parse(bounded.text) as T;
  } catch {
    throw new Error("CircleCI API returned invalid JSON.");
  }
}

export async function fetchAllowedArtifact(
  initialUrl: URL,
  maxRedirects = 3
): Promise<Response> {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const response = await fetchWithSafeErrors(currentUrl.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000)
    }, "CircleCI artifact");
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    try {
      await response.body?.cancel();
    } catch {
      // The redirect response body is discarded; cancellation failure is non-fatal.
    }
    if (!location) {
      throw new Error("Artifact redirect did not include a Location header.");
    }
    if (redirectCount === maxRedirects) {
      throw new Error("Artifact redirect limit exceeded.");
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      throw new Error("Artifact redirect target is invalid.");
    }
    const allowedUrl = allowedArtifactUrl(nextUrl.toString());
    if (!allowedUrl) {
      throw new Error("Artifact redirect target is not allowed.");
    }
    currentUrl = allowedUrl;
  }
  throw new Error("Artifact redirect limit exceeded.");
}
