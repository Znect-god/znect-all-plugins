import { describe, expect, it } from "vitest";
import { normalizeJobTestResults } from "../src/normalize-test-results";

describe("unified CircleCI test result normalization", () => {
  it("normalizes JSONL pass, failure and skipped records", () => {
    const result = normalizeJobTestResults({
      jsonl: [
        JSON.stringify({ classname: "unit.Math", name: "adds", result: "success", run_time: 0.2 }),
        JSON.stringify({ classname: "unit.Math", name: "subtracts", result: "failure", message: "assertion failed" }),
        JSON.stringify({ classname: "unit.Math", name: "pending", result: "skipped" })
      ].join("\n")
    });
    expect(result).toMatchObject({
      status: "available", sources: "jsonl_only", count_scope: "observed_records", total: 3, passed: 1, failed: 1, skipped: 1, unknown: 0,
      jsonl_records: 3, junit_records: 0, incomplete: false
    });
  });

  it("parses JUnit XML testcase states and decodes safe XML entities", () => {
    const result = normalizeJobTestResults({
      junitArtifacts: [{
        execution: 1,
        content: `<?xml version="1.0"?>
          <testsuites><testsuite name="unit">
            <testcase classname="pkg.Math" name="adds &amp; sums" file="src/math.test.ts"/>
            <testcase classname="pkg.Math" name="fails"><failure message="expected &lt;actual"/></testcase>
            <testcase classname="pkg.Math" name="pending"><skipped/></testcase>
            <testcase classname="pkg.Math" name="throws"><error message="boom"/></testcase>
          </testsuite></testsuites>`
      }]
    });
    expect(result).toMatchObject({
      status: "available", sources: "junit_only", total: 4, passed: 1, failed: 2, skipped: 1,
      junit_records: 4, malformed_junit_reports: 0, incomplete: false
    });
  });

  it("removes a one-to-one JSONL/JUnit duplicate and trusts the CircleCI JSONL status", () => {
    const result = normalizeJobTestResults({
      jsonl: JSON.stringify({ classname: "pkg.Math", name: "adds", result: "success" }),
      junitArtifacts: [{
        content: '<testsuite><testcase classname="pkg.Math" name="adds"><failure/></testcase></testsuite>'
      }]
    });
    expect(result).toMatchObject({
      sources: "jsonl_and_junit", total: 1, passed: 1, failed: 0, duplicate_reports_removed: 1,
      conflicting_statuses: 1, incomplete: true
    });
  });


  it("matches JSONL without a file field to a unique JUnit identity that includes a file", () => {
    const result = normalizeJobTestResults({
      jsonl: JSON.stringify({ classname: "pkg.Math", name: "adds", result: "success" }),
      junitArtifacts: [{
        content: '<testsuite><testcase classname="pkg.Math" name="adds" file="src/math.test.ts"/></testsuite>'
      }]
    });
    expect(result).toMatchObject({
      total: 1, passed: 1, duplicate_reports_removed: 1, incomplete: false
    });
  });

  it("does not merge same-name tests when both sources identify different files", () => {
    const result = normalizeJobTestResults({
      jsonl: JSON.stringify({ classname: "pkg.Math", name: "adds", file: "src/a.test.ts", result: "success" }),
      junitArtifacts: [{
        content: '<testsuite><testcase classname="pkg.Math" name="adds" file="src/b.test.ts"/></testsuite>'
      }]
    });
    expect(result).toMatchObject({
      total: 2, passed: 2, duplicate_reports_removed: 0, incomplete: false
    });
  });

  it("does not collapse repeated test identities from parallel executions", () => {
    const result = normalizeJobTestResults({
      jsonl: JSON.stringify({ classname: "pkg.Math", name: "same", result: "success" }),
      junitArtifacts: [
        { execution: 0, content: '<testsuite><testcase classname="pkg.Math" name="same"/></testsuite>' },
        { execution: 1, content: '<testsuite><testcase classname="pkg.Math" name="same"/></testsuite>' }
      ]
    });
    expect(result).toMatchObject({
      total: 3, passed: 3, duplicate_reports_removed: 0,
      ambiguous_duplicate_groups: 1, incomplete: true
    });
  });

  it("retains duplicate test invocations within one source rather than guessing retries", () => {
    const result = normalizeJobTestResults({
      jsonl: [
        JSON.stringify({ classname: "pkg.Math", name: "retry", result: "failure" }),
        JSON.stringify({ classname: "pkg.Math", name: "retry", result: "success" })
      ].join("\n")
    });
    expect(result).toMatchObject({
      total: 2, failed: 1, passed: 1, duplicate_identities_retained: 1,
      incomplete: false
    });
  });

  it("marks malformed JSONL records partial without discarding valid records", () => {
    const result = normalizeJobTestResults({
      jsonl: [
        JSON.stringify({ classname: "pkg.Math", name: "valid", result: "success" }),
        "{invalid-json"
      ].join("\n")
    });
    expect(result).toMatchObject({
      status: "partial", total: 1, passed: 1, malformed_jsonl_records: 1, incomplete: true
    });
  });

  it.each([
    '<!DOCTYPE testsuite [<!ENTITY x SYSTEM "https://example.invalid/x">]><testsuite/>',
    '<testsuite><testcase name="broken"></testsuite>',
    '<testsuite><testcase name="missing-end">',
    '<testsuite/>trailing-garbage',
    '<testsuite/><testsuite/>',
    '<report><testcase name="not-junit"/></report>',
    '<![CDATA[not-a-root]]><testsuite/>'
  ])("rejects unsafe or malformed JUnit XML: %s", (xml) => {
    const result = normalizeJobTestResults({ junitArtifacts: [{ content: xml }] });
    expect(result).toMatchObject({
      status: "unavailable", total: 0, malformed_junit_reports: 1, incomplete: true
    });
  });

  it("keeps XML reports without a root self-closing testsuite valid", () => {
    const result = normalizeJobTestResults({ junitArtifacts: [{ content: '<testsuite/>' }] });
    expect(result).toMatchObject({ status: "empty", sources: "junit_only", malformed_junit_reports: 0, incomplete: false });
  });



  it("marks a valid JUnit subset partial when the artifact collector hit its cap", () => {
    const result = normalizeJobTestResults({
      junitIncomplete: true,
      junitArtifacts: [{
        content: '<testsuite><testcase classname="pkg.Math" name="collected"/></testsuite>'
      }]
    });
    expect(result).toMatchObject({
      status: "partial", sources: "junit_only", total: 1, passed: 1, incomplete: true
    });
  });

  it("marks an unavailable JSONL source partial when JUnit records remain available", () => {
    const result = normalizeJobTestResults({
      jsonlUnavailable: true,
      junitArtifacts: [{
        content: '<testsuite><testcase classname="pkg.Math" name="from-xml"/></testsuite>'
      }]
    });
    expect(result).toMatchObject({
      status: "partial", sources: "junit_only", total: 1, passed: 1, incomplete: true
    });
  });

  it("marks truncated JSONL and artifact retrieval failures incomplete", () => {
    const result = normalizeJobTestResults({
      jsonl: JSON.stringify({ name: "partial", result: "success" }),
      jsonlTruncated: true,
      junitArtifacts: [{ error: "unavailable" }]
    });
    expect(result).toMatchObject({
      status: "partial", total: 1, passed: 1, malformed_junit_reports: 1, incomplete: true
    });
  });


  it("uses the JUnit status when a matching JSONL record has an unknown outcome", () => {
    const result = normalizeJobTestResults({
      jsonl: JSON.stringify({ classname: "pkg.Math", name: "unknown", result: "new-circleci-state" }),
      junitArtifacts: [{
        content: '<testsuite><testcase classname="pkg.Math" name="unknown"><failure/></testcase></testsuite>'
      }]
    });
    expect(result).toMatchObject({
      total: 1, failed: 1, unknown: 0, duplicate_reports_removed: 1, incomplete: false
    });
  });


  it("rejects JSONL records with malformed parallel execution metadata", () => {
    const result = normalizeJobTestResults({
      jsonl: JSON.stringify({ classname: "pkg.Math", name: "bad-execution", result: "success", execution: -1 })
    });
    expect(result).toMatchObject({
      status: "partial", total: 0, malformed_jsonl_records: 1, incomplete: true
    });
  });

  it("rejects JUnit artifacts with malformed parallel execution metadata", () => {
    const result = normalizeJobTestResults({
      junitArtifacts: [{
        execution: -1,
        content: '<testsuite><testcase classname="pkg.Math" name="must-not-be-unscoped"/></testsuite>'
      }]
    });
    expect(result).toMatchObject({
      status: "unavailable", total: 0, malformed_junit_reports: 1, incomplete: true
    });
  });

  it("does not reconcile records with different known parallel execution indexes", () => {
    const result = normalizeJobTestResults({
      jsonl: JSON.stringify({ classname: "pkg.Math", name: "same", result: "success", execution: 0 }),
      junitArtifacts: [{
        execution: 1,
        content: '<testsuite><testcase classname="pkg.Math" name="same"><failure/></testcase></testsuite>'
      }]
    });
    expect(result).toMatchObject({
      total: 2, passed: 1, failed: 1, duplicate_reports_removed: 0, incomplete: false
    });
  });
});
