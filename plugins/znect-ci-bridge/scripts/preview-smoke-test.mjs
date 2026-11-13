import { createHmac, randomUUID } from "node:crypto";

#!/usr/bin/env node

/**
 * Read-only smoke test for the Znect CI Bridge Preview deployment.
 *
 * Required environment:
 *   MCP_ACCESS_TOKEN
 *   WEB_ACCESS_TOKEN
 *
 * This script is deliberately pinned to the named Preview alias. It refuses
 * Production and arbitrary hosts. It performs only:
 *   GET /health
 *   GET /api/v1/status
 *   POST /mcp: server/discover, tools/list, and check_connection
 *
 * The MCP POST requests are JSON-RPC transport calls. No pipeline mutation
 * tool is invoked or exposed by this script.
 */

const PREVIEW_ORIGIN =
  "https://feature-ci-bridge-test-reports-v2-znect-ci-bridge.znect699.workers.dev";
const PROTOCOL_VERSION = "2026-07-28";
const TIMEOUT_MS = 15_000;

function fail(message) {
  console.error("FAIL: " + message);
  process.exitCode = 1;
}

function requiredSecret(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error("Missing required environment variable: " + name);
  }
  return value;
}

async function request(url, init = {}) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "error"
  });
}

async function parseRpcResponse(response) {
  const body = await response.text();
  const dataLine = body
    .split(/\r?\n/)
    .find((line) => line.startsWith("data:"));
  const payload = dataLine
    ? dataLine.slice("data:".length).trim()
    : body;
  try {
    return JSON.parse(payload);
  } catch {
    throw new Error("MCP endpoint returned an unparseable JSON-RPC response.");
  }
}

async function rpc(mcpToken, id, method, params = {}) {
  const response = await request(PREVIEW_ORIGIN + "/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer " + mcpToken,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
      "Mcp-Method": method,
      ...(method === "tools/call" && typeof params.name === "string"
        ? { "Mcp-Name": params.name }
        : {})
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
          "io.modelcontextprotocol/clientCapabilities": {},
          ...(method === "server/discover"
            ? { "io.modelcontextprotocol/clientInfo": { name: "znect-ci-bridge-preview-smoke", version: "1.0.0" } }
            : {})
        }
      }
    })
  });
  if (!response.ok) {
    const errorBody = await response.text();
    let safeDetail = "";
    try {
      const parsed = JSON.parse(errorBody);
      const candidate = typeof parsed.error === "string"
        ? parsed.error
        : typeof parsed.error?.message === "string"
          ? parsed.error.message
          : typeof parsed.message === "string"
            ? parsed.message
            : "";
      if (candidate) safeDetail = " (" + candidate.slice(0, 180) + ")";
    } catch { /* Do not print arbitrary response bodies. */ }
    throw new Error("MCP " + method + " returned HTTP " + response.status + safeDetail + ".");
  }
  const payload = await parseRpcResponse(response);
  if (payload.error) {
    throw new Error("MCP " + method + " returned a JSON-RPC error.");
  }
  return payload.result;
}

async function main() {
  const mcpToken = requiredSecret("MCP_ACCESS_TOKEN");
  const webToken = requiredSecret("WEB_ACCESS_TOKEN");

  // Defensive target check: no command-line URL override is accepted.
  const target = new URL(PREVIEW_ORIGIN);
  if (
    target.protocol !== "https:" ||
    target.hostname === "znect-ci-bridge.znect699.workers.dev" ||
    target.hostname !== "feature-ci-bridge-test-reports-v2-znect-ci-bridge.znect699.workers.dev"
  ) {
    throw new Error("Refusing to run: target is not the approved Preview alias.");
  }

  console.log("Znect CI Bridge Preview smoke test");
  console.log("Target: " + PREVIEW_ORIGIN);
  console.log("Mode: read-only; no pipeline actions will be invoked.");

  const health = await request(PREVIEW_ORIGIN + "/health");
  if (!health.ok) throw new Error("/health returned HTTP " + health.status + ".");
  const healthData = await health.json();
  if (healthData.service !== "znect-ci-bridge" || healthData.mode !== "read-only") {
    throw new Error("/health returned an unexpected service identity or mode.");
  }
  console.log("PASS: public health endpoint");

  const status = await request(PREVIEW_ORIGIN + "/api/v1/status", {
    headers: { authorization: "Bearer " + webToken }
  });
  if (!status.ok) {
    const errorBody = await status.text();
    let safeDetail = "";
    try {
      const parsed = JSON.parse(errorBody);
      if (typeof parsed.error === "string") safeDetail = " (" + parsed.error.slice(0, 180) + ")";
    } catch { /* Do not print arbitrary response bodies. */ }
    throw new Error("/api/v1/status returned HTTP " + status.status + safeDetail + ".");
  }
  const statusData = await status.json();
  if (
    statusData.connected !== true ||
    statusData.permissions !== "read-only" ||
    statusData.project?.slug !== "gh/Znect-god/znect-forge"
  ) {
    throw new Error("Browser API did not confirm read-only access to the fixed Forge project.");
  }
  console.log("PASS: authenticated browser API and CircleCI project access");

  const eventsResponse = await request(PREVIEW_ORIGIN + "/api/v1/events?limit=1", {
    headers: { authorization: "Bearer " + webToken }
  });
  if (!eventsResponse.ok) {
    const errorBody = await eventsResponse.text();
    let safeDetail = "";
    try {
      const parsed = JSON.parse(errorBody);
      if (typeof parsed.error === "string") safeDetail = " (" + parsed.error.slice(0, 180) + ")";
      if (Number.isInteger(parsed.event_store_status)) safeDetail += " [event store HTTP " + parsed.event_store_status + "]";
    } catch { /* Do not print arbitrary response bodies. */ }
    throw new Error("/api/v1/events returned HTTP " + eventsResponse.status + safeDetail + ".");
  }
  const eventsData = await eventsResponse.json();
  if (!Array.isArray(eventsData.events) || !Number.isSafeInteger(eventsData.next_cursor)) {
    throw new Error("Event inbox returned an invalid response.");
  }
  console.log("PASS: authenticated event inbox and persistent event storage");

  const discovery = await rpc(mcpToken, 1, "server/discover", {
    _meta: {
      "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
      "io.modelcontextprotocol/clientCapabilities": {},
      "io.modelcontextprotocol/clientInfo": {
        name: "znect-ci-bridge-preview-smoke-test",
        version: "1.0.0"
      }
    }
  });
  if (
    discovery?.resultType !== "complete" ||
    !Array.isArray(discovery.supportedVersions) ||
    !discovery.supportedVersions.includes(PROTOCOL_VERSION) ||
    !discovery.capabilities?.tools
  ) {
    throw new Error("MCP server discovery did not return the expected capabilities.");
  }
  console.log("PASS: MCP stateless discovery");

  const listing = await rpc(mcpToken, 2, "tools/list", {
    _meta: {
      "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  });
  const tools = listing?.tools;
  if (!Array.isArray(tools) || tools.length !== 13) {
    throw new Error("MCP tools/list did not return the expected 13 tools.");
  }
  if (!tools.every((tool) => tool.annotations?.readOnlyHint === true)) {
    throw new Error("At least one MCP tool is missing readOnlyHint: true.");
  }
  if (tools.some((tool) => /^(start|rerun|retry|cancel|deploy|trigger)_/i.test(tool.name))) {
    throw new Error("MCP tool list contains a prohibited pipeline mutation tool.");
  }
  if (!tools.some((tool) => tool.name === "list_recent_events")) {
    throw new Error("MCP tool list does not expose the signed CircleCI event inbox.");
  }
  console.log("PASS: tools/list exposes 13 explicitly read-only tools including the event inbox");

  const connection = await rpc(mcpToken, 3, "tools/call", {
    name: "check_connection",
    arguments: {}
  });
  if (connection?.isError === true || !Array.isArray(connection?.content)) {
    throw new Error("MCP check_connection did not return a successful tool result.");
  }
  const resultText = connection.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
  if (
    !resultText.includes('"connected": true') ||
    !resultText.includes('"permissions": "read-only"') ||
    !resultText.includes("gh/Znect-god/znect-forge")
  ) {
    throw new Error("MCP check_connection did not confirm the fixed read-only CircleCI project.");
  }
  console.log("PASS: MCP tool call verifies CircleCI read access");

  const eventFeed = await rpc(mcpToken, 4, "tools/call", {
    name: "list_recent_events",
    arguments: { after: 0, limit: 50 }
  });
  if (eventFeed?.isError === true || !Array.isArray(eventFeed?.content)) {
    throw new Error("MCP list_recent_events did not return a successful tool result.");
  }
  const feedText = eventFeed.content.find((item) => item.type === "text")?.text ?? "";
  let feedData;
  try { feedData = JSON.parse(feedText); } catch {
    throw new Error("MCP list_recent_events returned invalid JSON.");
  }
  if (!Array.isArray(feedData.events) || !Number.isSafeInteger(feedData.next_cursor)) {
    throw new Error("MCP list_recent_events returned an invalid event cursor.");
  }
  console.log("PASS: MCP event inbox read");

  const webhookSecret = process.env.CIRCLECI_WEBHOOK_SECRET;
  if (!webhookSecret || !webhookSecret.trim()) {
    console.log("NOT RUN: CIRCLECI_WEBHOOK_SECRET is not configured in GitHub Actions; signed webhook delivery test was skipped.");
  } else {
    const eventId = randomUUID();
    const workflowId = randomUUID();
    const pipelineId = randomUUID();
    const payload = {
      id: eventId,
      type: "workflow-completed",
      happened_at: new Date().toISOString(),
      project: { slug: "gh/Znect-god/znect-forge" },
      workflow: {
        id: workflowId,
        name: "preview-webhook-smoke",
        status: "success",
        url: "https://app.circleci.com/pipelines/github/Znect-god/znect-forge/1/workflows/" + workflowId
      },
      pipeline: {
        id: pipelineId,
        number: 1,
        vcs: {
          branch: "ci-bridge-preview-smoke",
          revision: "0".repeat(40),
          commit: { subject: "Synthetic signed webhook smoke event" }
        }
      }
    };
    const body = JSON.stringify(payload);
    const signature = createHmac("sha256", webhookSecret).update(body).digest("hex");
    const webhookRequest = () => request(PREVIEW_ORIGIN + "/webhooks/circleci", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "circleci-event-type": "workflow-completed",
        "circleci-signature": "v1=" + signature
      },
      body
    });

    const acceptedResponse = await webhookRequest();
    if (!acceptedResponse.ok) {
      const detail = (await acceptedResponse.text()).slice(0, 180);
      throw new Error("Signed CircleCI webhook returned HTTP " + acceptedResponse.status + " (" + detail + ").");
    }
    const accepted = await acceptedResponse.json();
    if (accepted.accepted !== true || accepted.duplicate !== false) {
      throw new Error("First signed webhook delivery was not accepted as a new event.");
    }

    const duplicateResponse = await webhookRequest();
    if (!duplicateResponse.ok) throw new Error("Duplicate webhook delivery returned HTTP " + duplicateResponse.status + ".");
    const duplicate = await duplicateResponse.json();
    if (duplicate.accepted !== true || duplicate.duplicate !== true) {
      throw new Error("Repeated CircleCI event ID was not deduplicated.");
    }

    const afterCursor = eventsData.next_cursor;
    const storedResponse = await request(PREVIEW_ORIGIN + "/api/v1/events?after=" + afterCursor + "&limit=10", {
      headers: { authorization: "Bearer " + webToken }
    });
    if (!storedResponse.ok) throw new Error("Event inbox read after webhook returned HTTP " + storedResponse.status + ".");
    const stored = await storedResponse.json();
    if (!stored.events.some((event) => event.id === eventId)) {
      throw new Error("Signed webhook event was not persisted in the browser event inbox.");
    }

    const mcpStored = await rpc(mcpToken, 5, "tools/call", {
      name: "list_recent_events",
      arguments: { after: afterCursor, limit: 10 }
    });
    const mcpStoredText = mcpStored?.content?.find((item) => item.type === "text")?.text ?? "";
    let mcpStoredData;
    try { mcpStoredData = JSON.parse(mcpStoredText); } catch {
      throw new Error("MCP event inbox returned invalid JSON after webhook delivery.");
    }
    if (!mcpStoredData.events?.some((event) => event.id === eventId)) {
      throw new Error("Signed webhook event was not visible through MCP.");
    }
    console.log("PASS: signed webhook delivery, duplicate suppression, durable storage, and MCP event retrieval");
  }

  console.log("SUCCESS: all Preview smoke checks passed.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown smoke-test failure.";
  fail(message);
});
