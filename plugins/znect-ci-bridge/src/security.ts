export interface SecretEnv {
  CIRCLECI_TOKEN?: string;
  MCP_ACCESS_TOKEN?: string;
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
  for (const secret of [env.CIRCLECI_TOKEN, env.MCP_ACCESS_TOKEN]) {
    if (secret) redacted = redacted.split(secret).join("[REDACTED]");
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
  const trustedHost =
    host.endsWith(".amazonaws.com") ||
    host.endsWith(".circle-artifacts.com");

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
