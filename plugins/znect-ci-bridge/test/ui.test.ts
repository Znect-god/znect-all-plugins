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

  it("sends the token only in an authenticated same-origin GET without ambient credentials", () => {
    expect(DASHBOARD_HTML).toContain('method:"GET"');
    expect(DASHBOARD_HTML).toContain('Authorization:"Bearer "+token');
    expect(DASHBOARD_HTML).toContain('credentials:"omit"');
    expect(DASHBOARD_HTML).toContain('redirect:"error"');
    expect(DASHBOARD_HTML).toContain('referrerPolicy:"no-referrer"');
    expect(DASHBOARD_HTML).toContain('cache:"no-store"');
  });
});
