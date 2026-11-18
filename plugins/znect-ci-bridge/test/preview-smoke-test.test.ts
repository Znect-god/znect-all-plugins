import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const smoke = readFileSync(new URL("../scripts/preview-smoke-test.mjs", import.meta.url), "utf8");

describe("read-only Preview smoke-test contract", () => {
  it("uses the registered Forge project and CircleCI connection scope on Browser API reads", () => {
    expect(smoke).toContain('const PROJECT_ID = "znect-forge"');
    expect(smoke).toContain('const CONNECTION_ID = "forge-circleci"');
    expect(smoke).toContain('"/api/v1/status?" + SCOPE_QUERY');
    expect(smoke).toContain('"/api/v1/runs?limit=1&" + SCOPE_QUERY');
    expect(smoke).toContain('"/api/v1/diagnostics/" + latestRunId + "?" + SCOPE_QUERY');
    expect(smoke).toContain('"/api/v1/report?run_limit=10&event_limit=20&after=0&" + SCOPE_QUERY');
    expect(smoke).toContain('"/api/v1/events?limit=50&project_id=" + encodeURIComponent(PROJECT_ID)');
  });

  it("validates the assistant handoff and follows only locally reconstructed diagnostic IDs", () => {
    expect(smoke).toContain('handoff?.mode !== "user_reviewed_json_attachment"');
    expect(smoke).toContain('handoff?.automatic_api_access !== false');
    expect(smoke).toContain('handoff?.mcp_required !== false');
    expect(smoke).toContain('handoff?.bearer_token_included !== false');
    expect(smoke).toContain('handoff?.test_summary_count_scope !== "observed_records"');
    expect(smoke).toContain('JSON.stringify(assistantReport).includes(webToken)');
    expect(smoke).toContain('JSON.stringify(diagnostic).includes(mcpToken)');
    expect(smoke).toContain('encodeURIComponent(item.run_id) + "?" + SCOPE_QUERY');
  });

  it("passes required project and connection IDs to read-only MCP calls", () => {
    expect(smoke).toContain('arguments: { project_id: PROJECT_ID, connection_id: CONNECTION_ID }');
    expect(smoke).toContain('arguments: { project_id: PROJECT_ID, after: 0, limit: 50 }');
    expect(smoke).toContain('tool.annotations?.readOnlyHint === true');
    expect(smoke).toContain('/^(start|rerun|retry|cancel|deploy|trigger)_/i');
  });

  it("keeps the smoke test pinned to the approved Preview host", () => {
    expect(smoke).toContain('target.hostname !== APPROVED_PREVIEW_HOST');
    expect(smoke).toContain('target.protocol !== "https:"');
    expect(smoke).toContain('redirect: "error"');
  });
});
