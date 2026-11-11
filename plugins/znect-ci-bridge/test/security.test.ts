import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allowedArtifactUrl,
  fetchAllowedArtifact,
  limitText,
  readBoundedJson,
  readBoundedText,
  redactKnownSecrets,
  safeEqual
} from "../src/security";

describe("safeEqual", () => {
  it("accepts identical values and rejects different values", async () => {
    await expect(safeEqual("same-token", "same-token")).resolves.toBe(true);
    await expect(safeEqual("same-token", "other-token")).resolves.toBe(false);
    await expect(safeEqual("short", "a much longer value")).resolves.toBe(false);
  });
});

describe("redactKnownSecrets", () => {
  it("redacts both configured secret values", () => {
    expect(
      redactKnownSecrets("Circle abc123; MCP def456", {
        CIRCLECI_TOKEN: "abc123",
        MCP_ACCESS_TOKEN: "def456"
      })
    ).toBe("Circle [REDACTED]; MCP [REDACTED]");
  });

  it("redacts common credential patterns in JSON, headers, and environment output", () => {
    const output = [
      'Authorization: Bearer abc.def.ghi',
      'Authorization: Basic dXNlcjpwYXNzd29yZA==',
      'SESSION_JWT=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.signature12345',
      'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz123456',
      'SLACK_TOKEN=xoxb-1234567890-abcdefghijk',
      'AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF',
      '{"client_secret":"shhh-value","password":"pass-value"}',
      '-----BEGIN PRIVATE KEY-----secret-material-----END PRIVATE KEY-----'
    ].join(" ");
    const redacted = redactKnownSecrets(output, {});
    expect(redacted).not.toContain("abc.def.ghi");
    expect(redacted).not.toContain("dXNlcjpwYXNzd29yZA==");
    expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.signature12345");
    expect(redacted).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz123456");
    expect(redacted).not.toContain("xoxb-1234567890-abcdefghijk");
    expect(redacted).not.toContain("AKIA1234567890ABCDEF");
    expect(redacted).not.toContain("shhh-value");
    expect(redacted).not.toContain("pass-value");
    expect(redacted).not.toContain("secret-material");
    expect(redacted).toContain("[REDACTED]");
  });

  it("leaves unrelated text unchanged when secrets are absent", () => {
    expect(redactKnownSecrets("ordinary output", {})).toBe("ordinary output");
  });
});

describe("allowedArtifactUrl", () => {
  it("accepts HTTPS CircleCI artifact and AWS subdomains", () => {
    expect(allowedArtifactUrl("https://123-gh.circle-artifacts.com/0/log.txt")).not.toBeNull();
    expect(allowedArtifactUrl("https://bucket.s3.amazonaws.com/log.txt")).not.toBeNull();
  });

  it("rejects non-HTTPS, deceptive hosts, credentials, and non-standard ports", () => {
    expect(allowedArtifactUrl("http://123-gh.circle-artifacts.com/log.txt")).toBeNull();
    expect(allowedArtifactUrl("https://circle-artifacts.com.evil.test/log.txt")).toBeNull();
    expect(allowedArtifactUrl("https://amazonaws.com.evil.test/log.txt")).toBeNull();
    expect(allowedArtifactUrl("https://user:pass@bucket.s3.amazonaws.com/log.txt")).toBeNull();
    expect(allowedArtifactUrl("https://bucket.s3.amazonaws.com:8443/log.txt")).toBeNull();
    expect(allowedArtifactUrl("not a URL")).toBeNull();
  });
});

describe("readBoundedText", () => {
  it("reads no more than the byte budget and marks truncation", async () => {
    await expect(readBoundedText(new Response("abcdefgh"), 5)).resolves.toEqual({
      text: "abcde",
      truncated: true
    });
  });

  it("does not mark an exactly-sized body as truncated", async () => {
    await expect(readBoundedText(new Response("abcde"), 5)).resolves.toEqual({
      text: "abcde",
      truncated: false
    });
  });

  it("rejects invalid limits", async () => {
    await expect(readBoundedText(new Response("x"), -1)).rejects.toThrow(
      "maxBytes must be a non-negative safe integer."
    );
  });
});

describe("readBoundedJson", () => {
  it("parses a bounded JSON response", async () => {
    await expect(readBoundedJson(new Response('{"ok":true}'), 64)).resolves.toEqual({ ok: true });
  });

  it("rejects oversized and malformed JSON without exposing response contents", async () => {
    await expect(readBoundedJson(new Response('"123456789"'), 4)).rejects.toThrow(
      "CircleCI API response exceeded the configured size limit."
    );
    await expect(readBoundedJson(new Response("{broken"), 64)).rejects.toThrow(
      "CircleCI API returned invalid JSON."
    );
  });
});

describe("limitText", () => {
  it("keeps output within the requested character budget", () => {
    const result = limitText("0123456789".repeat(10), 32);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(32);
    expect(result.text).toContain("TRUNCATED");
  });

  it("marks byte-truncated text even when decoded text is short", () => {
    const result = limitText("short", 32, true);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("TRUNCATED");
  });
});

describe("fetchAllowedArtifact", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows a redirect only when the destination remains allowlisted", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "https://bucket.s3.amazonaws.com/log.txt?sig=test" }
      }))
      .mockResolvedValueOnce(new Response("log output"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchAllowedArtifact(
      new URL("https://123-gh.circle-artifacts.com/log.txt")
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("log output");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "GET",
      redirect: "manual"
    });
  });

  it("rejects a redirect to a non-allowlisted host", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: "https://attacker.example/log.txt" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchAllowedArtifact(new URL("https://123-gh.circle-artifacts.com/log.txt"))
    ).rejects.toThrow("Artifact redirect target is not allowed.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
