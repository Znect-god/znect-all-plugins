import { afterEach, describe, expect, it, vi } from "vitest";
import { circleGet } from "../src/circleci";

describe("CircleCI read-only HTTP adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the fixed v1.1 origin, GET, token header, and bounded JSON parser", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ build_num: 42, status: "success" }]), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      circleGet<Array<{ build_num: number; status: string }>>(
        "synthetic-token",
        "/project/github/Znect-god/znect-forge?limit=5"
      )
    ).resolves.toEqual([{ build_num: 42, status: "success" }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://circleci.com/api/v1.1/project/github/Znect-god/znect-forge?limit=5"
    );
    expect(init).toMatchObject({
      method: "GET",
      headers: {
        "Circle-Token": "synthetic-token",
        "Accept": "application/json"
      },
      redirect: "manual"
    });
    expect(init.signal).toBeDefined();
  });

  it("rejects paths that could escape the fixed CircleCI API origin", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(circleGet("token", "https://attacker.example/steal"))
      .rejects.toThrow("Invalid internal CircleCI API path.");
    await expect(circleGet("token", "//attacker.example/steal"))
      .rejects.toThrow("Invalid internal CircleCI API path.");
    await expect(circleGet("token", "/\\\\attacker.example/steal"))
      .rejects.toThrow("Invalid internal CircleCI API path.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403])("returns a sanitized authentication error for HTTP %i", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("sensitive upstream body", { status }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(circleGet("token", "/project/github/Znect-god/znect-forge"))
      .rejects.toThrow("CircleCI rejected the configured read-only token. Check the Worker secret.");
  });

  it("does not expose upstream error bodies for other HTTP failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("internal stack trace", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(circleGet("token", "/project/github/Znect-god/znect-forge"))
      .rejects.toThrow("CircleCI API returned HTTP 429.");
  });

  it("rejects malformed and oversized JSON responses", async () => {
    const malformed = vi.fn().mockResolvedValue(new Response("{broken", { status: 200 }));
    vi.stubGlobal("fetch", malformed);
    await expect(circleGet("token", "/project/github/Znect-god/znect-forge"))
      .rejects.toThrow("CircleCI API returned invalid JSON.");

    const oversized = vi.fn().mockResolvedValue(
      new Response(JSON.stringify("x".repeat(1_000_001)), { status: 200 })
    );
    vi.stubGlobal("fetch", oversized);
    await expect(circleGet("token", "/project/github/Znect-god/znect-forge"))
      .rejects.toThrow("CircleCI API response exceeded the configured size limit.");
  });
});
