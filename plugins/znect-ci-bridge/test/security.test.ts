import { describe, expect, it } from "vitest";
import {
  allowedArtifactUrl,
  limitText,
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
