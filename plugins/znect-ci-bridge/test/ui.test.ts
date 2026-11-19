import { describe, expect, it } from "vitest";
import { DASHBOARD_HTML } from "../src/ui";

describe("browser dashboard security", () => {
  it("renders untrusted API values only as text nodes", () => {
    expect(DASHBOARD_HTML).toContain("node.textContent=String(text)");
    expect(DASHBOARD_HTML).toContain("rawBox.textContent=JSON.stringify(data,null,2)");
    for (const sink of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function"]) {
      expect(DASHBOARD_HTML).not.toContain(sink);
    }
  });

  it("does not persist the web token in browser storage or URL state", () => {
    expect(DASHBOARD_HTML).toContain('var token=""');
    for (const storageOrUrl of ["localStorage", "sessionStorage", "location.search", "location.hash"]) {
      expect(DASHBOARD_HTML).not.toContain(storageOrUrl);
    }
    expect(DASHBOARD_HTML).toContain("tokenInput.value");
    expect(DASHBOARD_HTML).toContain("tokenInput.value=\"\"");
  });

  it("loads registered projects and scopes dashboard reads to the selected project", () => {
    expect(DASHBOARD_HTML).toContain('id="project"');
    expect(DASHBOARD_HTML).toContain('request("/api/v1/projects")');
    expect(DASHBOARD_HTML).toContain('function scopeQuery(){return "project_id="+encodeURIComponent(currentProject)+"&connection_id="+encodeURIComponent(currentConnection);}');
    expect(DASHBOARD_HTML).toContain('request("/api/v1/status?"+scopeQuery())');
    expect(DASHBOARD_HTML).toContain('request("/api/v1/runs?limit=20&"+scopeQuery())');
    expect(DASHBOARD_HTML).toContain("run.commitMessage||run.branch||run.commitSha||run.id");
    expect(DASHBOARD_HTML).toContain("workflow.name||workflow.id||\"Workflow\"");
    expect(DASHBOARD_HTML).toContain('"?project_id="+encodeURIComponent(currentProject)');
  });

  it("shows webhook event correlation results for the selected project and connection", () => {
    expect(DASHBOARD_HTML).toContain('id="events-panel"');
    expect(DASHBOARD_HTML).toContain('id="refresh-events"');
    expect(DASHBOARD_HTML).toContain('request("/api/v1/event-correlations?event_limit=20&run_limit=20&"+scopeQuery())');
    expect(DASHBOARD_HTML).toContain('entry.status==="candidate"?"Candidate"');
    expect(DASHBOARD_HTML).toContain('entry.reason==="missing_revision"?"Webhook event has no commit revision.":"No recent run met the correlation criteria."');
    expect(DASHBOARD_HTML).toContain('eventsBox.replaceChildren(element("p","status error",error.message))');
  });
  it("exports a bounded ChatGPT-ready report and only follows validated run UUIDs", () => {
    expect(DASHBOARD_HTML).toContain('id="export-report"');
    expect(DASHBOARD_HTML).toContain('request("/api/v1/report?run_limit=10&event_limit=20&after=0&"+scopeQuery())');
    expect(DASHBOARD_HTML).toContain('report.runs.diagnostics.slice(0,3)');
    expect(DASHBOARD_HTML).toContain('request("/api/v1/diagnostics/"+encodeURIComponent(runId)+"?"+scopeQuery())');
    expect(DASHBOARD_HTML).toContain('report.completeness.diagnostics_included');
    expect(DASHBOARD_HTML).toContain('report.completeness.diagnostics_limited=failedCount>diagnostics.length');
    expect(DASHBOARD_HTML).toContain('report.completeness.export_complete=report.completeness.runs_limited!==true&&report.completeness.events_limited!==true&&report.events?.available===true&&report.completeness.diagnostics_included===true');
    expect(DASHBOARD_HTML).toContain('report.completeness.export_complete?"Assistant report exported.');
    expect(DASHBOARD_HTML).toContain('"Partial assistant report exported. Review run, event and diagnostic completeness markers');
    expect(DASHBOARD_HTML).toContain('"Partial assistant report exported.');
    expect(DASHBOARD_HTML).toContain('blob.size>600000');
    expect(DASHBOARD_HTML).toContain('new Blob([serialized],{type:"application/json"})');
    expect(DASHBOARD_HTML).toContain('URL.createObjectURL(blob)');
    expect(DASHBOARD_HTML).toContain('link.download="znect-ci-report-"');
    expect(DASHBOARD_HTML).toContain('eventsRequestId++;exportRequestId++');
    expect(DASHBOARD_HTML).not.toContain('window.open(item.endpoint)');
  });

  it("sends the token only in an authenticated same-origin GET without ambient credentials", () => {
    expect(DASHBOARD_HTML).toContain('method:"GET"');
    expect(DASHBOARD_HTML).toContain('Authorization:"Bearer "+token');
    expect(DASHBOARD_HTML).toContain('credentials:"omit"');
    expect(DASHBOARD_HTML).toContain('redirect:"error"');
    expect(DASHBOARD_HTML).toContain('referrerPolicy:"no-referrer"');
    expect(DASHBOARD_HTML).toContain('cache:"no-store"');
  });
});
