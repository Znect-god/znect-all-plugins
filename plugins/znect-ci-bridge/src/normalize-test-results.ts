export type NormalizedTestStatus = "passed" | "failed" | "skipped" | "unknown";

export interface NormalizedTestCase {
  name: string;
  classname: string;
  file: string;
  status: NormalizedTestStatus;
  execution?: number;
  source: "circleci_jsonl" | "junit_xml";
}

export interface NormalizedTestSummary {
  status: "available" | "partial" | "unavailable" | "empty";
  sources: "jsonl_and_junit" | "jsonl_only" | "junit_only" | "none";
  count_scope: "observed_records";
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  unknown: number;
  jsonl_records: number;
  junit_records: number;
  duplicate_reports_removed: number;
  duplicate_identities_retained: number;
  ambiguous_duplicate_groups: number;
  conflicting_statuses: number;
  malformed_jsonl_records: number;
  malformed_junit_reports: number;
  incomplete: boolean;
}

export interface JunitReportInput {
  content?: string;
  execution?: number;
  error?: string;
}

export interface NormalizeJobTestResultsInput {
  jsonl?: string;
  jsonlTruncated?: boolean;
  jsonlUnavailable?: boolean;
  junitIncomplete?: boolean;
  junitArtifacts?: JunitReportInput[];
}

const MAX_JSONL_CHARS = 200_000;
const MAX_JUNIT_CHARS = 500_000;
const MAX_TEST_CASES = 10_000;
const MAX_XML_TOKENS = 50_000;
const MAX_XML_DEPTH = 64;

interface ParsedTests {
  tests: NormalizedTestCase[];
  malformed: number;
  truncated: boolean;
}

function normalizeStatus(value: unknown): NormalizedTestStatus {
  if (typeof value !== "string") return "unknown";
  switch (value.trim().toLowerCase()) {
    case "success":
    case "passed":
    case "pass":
      return "passed";
    case "failure":
    case "failed":
    case "error":
      return "failed";
    case "skipped":
    case "skip":
    case "pending":
      return "skipped";
    default:
      return "unknown";
  }
}

function readExecution(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function testIdentity(test: NormalizedTestCase): string {
  // CircleCI JSONL may omit file while JUnit includes it; classname + name is
  // the common identity, with file used as a conflict guard when both exist.
  return JSON.stringify([test.classname, test.name]);
}

function parseJsonl(content: string | undefined, alreadyTruncated: boolean): ParsedTests {
  if (!content) return { tests: [], malformed: 0, truncated: alreadyTruncated };
  const clipped = content.length > MAX_JSONL_CHARS;
  const bounded = clipped ? content.slice(0, MAX_JSONL_CHARS) : content;
  const lines = bounded.split(/\r?\n/);
  const tests: NormalizedTestCase[] = [];
  let malformed = 0;
  let truncated = alreadyTruncated || clipped;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    if (tests.length >= MAX_TEST_CASES) {
      truncated = true;
      break;
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      malformed++;
      continue;
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      malformed++;
      continue;
    }
    const record = value as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name || name.length > 1024) {
      malformed++;
      continue;
    }
    const classnameValue = record.classname ?? record.className;
    const fileValue = record.file;
    if ((classnameValue !== undefined && typeof classnameValue !== "string") ||
        (fileValue !== undefined && typeof fileValue !== "string") ||
        (typeof classnameValue === "string" && classnameValue.length > 1024) ||
        (typeof fileValue === "string" && fileValue.length > 2048)) {
      malformed++;
      continue;
    }
    const classname = typeof classnameValue === "string" ? classnameValue.trim().slice(0, 1024) : "";
    const file = typeof fileValue === "string" ? fileValue.trim().slice(0, 2048) : "";
    const execution = readExecution(record.execution);
    if (record.execution !== undefined && execution === undefined) {
      malformed++;
      continue;
    }
    tests.push({
      name,
      classname,
      file,
      status: normalizeStatus(record.result ?? record.status),
      ...(execution !== undefined ? { execution } : {}),
      source: "circleci_jsonl"
    });
  }
  return { tests, malformed, truncated };
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, token: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (token[0] !== "#") return named[token.toLowerCase()];
    const codePoint = token[1].toLowerCase() === "x"
      ? Number.parseInt(token.slice(2), 16)
      : Number.parseInt(token.slice(1), 10);
    if (!Number.isInteger(codePoint) || codePoint < 1 || codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      throw new Error("Invalid XML character reference.");
    }
    return String.fromCodePoint(codePoint);
  }).replace(/&[^;\s]+;/g, () => {
    throw new Error("Unsupported XML entity reference.");
  });
}

function findXmlTagEnd(source: string, start: number): number {
  let quote: string | null = null;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index;
    }
  }
  return -1;
}

function parseXmlAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  let index = 0;
  while (index < source.length) {
    while (/\s/.test(source[index] ?? "")) index++;
    if (index >= source.length) break;
    const nameMatch = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(source.slice(index));
    if (!nameMatch) throw new Error("Invalid XML attribute name.");
    const name = nameMatch[0];
    index += name.length;
    while (/\s/.test(source[index] ?? "")) index++;
    if (source[index] !== "=") throw new Error("Invalid XML attribute assignment.");
    index++;
    while (/\s/.test(source[index] ?? "")) index++;
    const quote = source[index];
    if (quote !== '"' && quote !== "'") throw new Error("Unquoted XML attribute.");
    index++;
    const end = source.indexOf(quote, index);
    if (end < 0) throw new Error("Unterminated XML attribute.");
    if (Object.prototype.hasOwnProperty.call(attributes, name)) throw new Error("Duplicate XML attribute.");
    attributes[name] = decodeXmlEntities(source.slice(index, end));
    index = end + 1;
  }
  return attributes;
}

/** Strict, bounded JUnit subset parser: no DTDs, external entities or network resolution. */
function parseJunitXml(content: string, execution?: number): ParsedTests {
  const tests: NormalizedTestCase[] = [];
  const stack: string[] = [];
  let malformed = 0;
  let tokens = 0;
  let index = 0;
  let rootSeen = false;
  let rootClosed = false;
  let current: { name: string; classname: string; file: string; status: NormalizedTestStatus } | null = null;

  try {
    while (index < content.length) {
      const open = content.indexOf("<", index);
      if (open < 0) {
        if (stack.length === 0 && content.slice(index).trim()) {
          throw new Error("Non-whitespace content outside the XML root element.");
        }
        break;
      }
      if (stack.length === 0 && content.slice(index, open).trim()) {
        throw new Error("Non-whitespace content outside the XML root element.");
      }
      index = open;
      if (content.startsWith("<!--", index)) {
        const end = content.indexOf("-->", index + 4);
        if (end < 0) throw new Error("Unterminated XML comment.");
        index = end + 3;
        continue;
      }
      if (content.startsWith("<![CDATA[", index)) {
        if (stack.length === 0) throw new Error("CDATA is not allowed outside the XML root element.");
        const end = content.indexOf("]]>", index + 9);
        if (end < 0) throw new Error("Unterminated XML CDATA.");
        index = end + 3;
        continue;
      }
      if (content.startsWith("<?", index)) {
        const end = content.indexOf("?>", index + 2);
        if (end < 0) throw new Error("Unterminated XML processing instruction.");
        index = end + 2;
        continue;
      }
      if (/^<!DOCTYPE|^<!ENTITY/i.test(content.slice(index))) {
        throw new Error("DTD and entity declarations are not supported.");
      }
      if (content.startsWith("<!", index)) throw new Error("Unsupported XML declaration.");

      const close = findXmlTagEnd(content, index + 1);
      if (close < 0) throw new Error("Unterminated XML tag.");
      const raw = content.slice(index + 1, close);
      index = close + 1;
      tokens++;
      if (tokens > MAX_XML_TOKENS) throw new Error("XML token limit exceeded.");

      if (raw.startsWith("/")) {
        const name = raw.slice(1).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(name) || stack.pop() !== name) {
          throw new Error("Mismatched XML closing tag.");
        }
        if (name === "testcase" && current) {
          tests.push({
            ...current,
            ...(execution !== undefined ? { execution } : {}),
            source: "junit_xml"
          });
          current = null;
          if (tests.length > MAX_TEST_CASES) throw new Error("JUnit testcase limit exceeded.");
        }
        if (stack.length === 0) rootClosed = true;
        continue;
      }

      const selfClosing = raw.endsWith("/");
      const body = selfClosing ? raw.slice(0, -1).trimEnd() : raw;
      const nameMatch = /^([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*)$/.exec(body);
      if (!nameMatch) throw new Error("Invalid XML opening tag.");
      const name = nameMatch[1];
      const attrs = parseXmlAttributes(nameMatch[2]);
      if (!rootSeen) {
        if (name !== "testsuite" && name !== "testsuites") {
          throw new Error("JUnit XML root must be testsuite or testsuites.");
        }
        rootSeen = true;
      } else if (rootClosed || stack.length === 0) {
        throw new Error("Multiple XML root elements.");
      }

      if (name === "testcase") {
        if (current) throw new Error("Nested JUnit testcases are invalid.");
        const testName = attrs.name;
        if (!testName || testName.length > 1024) throw new Error("JUnit testcase has no valid name.");
        if ((attrs.classname?.length ?? 0) > 1024 || (attrs.file?.length ?? 0) > 2048) {
          throw new Error("JUnit testcase identity exceeds the configured limit.");
        }
        current = {
          name: testName,
          classname: attrs.classname ?? "",
          file: attrs.file ?? "",
          status: "passed"
        };
      } else if (current && (name === "failure" || name === "error")) {
        current.status = "failed";
      } else if (current && name === "skipped" && current.status !== "failed") {
        current.status = "skipped";
      }

      if (!selfClosing) {
        stack.push(name);
        if (stack.length > MAX_XML_DEPTH) throw new Error("XML nesting limit exceeded.");
      } else if (name === "testcase" && current) {
        tests.push({
          ...current,
          ...(execution !== undefined ? { execution } : {}),
          source: "junit_xml"
        });
        current = null;
        if (tests.length > MAX_TEST_CASES) throw new Error("JUnit testcase limit exceeded.");
      }
      if (selfClosing && stack.length === 0) rootClosed = true;
    }
    if (!rootSeen || !rootClosed || stack.length !== 0 || current) {
      throw new Error("Incomplete JUnit XML document.");
    }
    if (tests.length > MAX_TEST_CASES) throw new Error("JUnit testcase limit exceeded.");
    return { tests, malformed, truncated: false };
  } catch {
    malformed = 1;
    return { tests: [], malformed, truncated: false };
  }
}

function reconcileTests(jsonl: NormalizedTestCase[], junit: NormalizedTestCase[]) {
  const jsonByIdentity = new Map<string, NormalizedTestCase[]>();
  const junitByIdentity = new Map<string, NormalizedTestCase[]>();
  for (const test of jsonl) {
    const key = testIdentity(test);
    jsonByIdentity.set(key, [...(jsonByIdentity.get(key) ?? []), test]);
  }
  for (const test of junit) {
    const key = testIdentity(test);
    junitByIdentity.set(key, [...(junitByIdentity.get(key) ?? []), test]);
  }

  const removed = new Set<NormalizedTestCase>();
  let duplicateReportsRemoved = 0;
  let conflictingStatuses = 0;
  let ambiguousDuplicateGroups = 0;
  for (const [key, jsonTests] of jsonByIdentity) {
    const junitTests = junitByIdentity.get(key) ?? [];
    // Only reconcile a one-to-one identity. Repeated names can be real retries
    // or executions on separate shards, so ambiguous groups are never collapsed.
    if (junitTests.length === 0) continue;
    if (jsonTests.length !== 1 || junitTests.length !== 1) {
      ambiguousDuplicateGroups++;
      continue;
    }
    const jsonTest = jsonTests[0];
    const junitTest = junitTests[0];
    if (jsonTest.execution !== undefined && junitTest.execution !== undefined &&
        jsonTest.execution !== junitTest.execution) continue;
    if (jsonTest.file && junitTest.file && jsonTest.file !== junitTest.file) continue;
    removed.add(junitTest);
    duplicateReportsRemoved++;
    if (jsonTest.status === "unknown" && junitTest.status !== "unknown") {
      jsonTest.status = junitTest.status;
    } else if (jsonTest.status !== "unknown" && junitTest.status !== "unknown" &&
        jsonTest.status !== junitTest.status) {
      conflictingStatuses++;
    }
  }
  return {
    tests: [...jsonl, ...junit.filter((test) => !removed.has(test))],
    duplicateReportsRemoved,
    ambiguousDuplicateGroups,
    conflictingStatuses
  };
}

/** Combine CircleCI JSONL and per-execution JUnit reports without collapsing ambiguous retries/shards. */
export function normalizeJobTestResults(input: NormalizeJobTestResultsInput): NormalizedTestSummary {
  const json = parseJsonl(input.jsonl, input.jsonlTruncated === true);
  const junitReports = input.junitArtifacts ?? [];
  const junitTests: NormalizedTestCase[] = [];
  let malformedJunitReports = 0;
  let junitAvailable = false;
  let junitChars = 0;
  let incomplete = json.truncated || json.malformed > 0 || input.jsonlUnavailable === true || input.junitIncomplete === true;

  for (const report of junitReports) {
    if (report.error || typeof report.content !== "string") {
      malformedJunitReports++;
      incomplete = true;
      continue;
    }
    const remaining = MAX_JUNIT_CHARS - junitChars;
    if (remaining <= 0 || report.content.length > remaining) {
      malformedJunitReports++;
      incomplete = true;
      continue;
    }
    const execution = readExecution(report.execution);
    if (report.execution !== undefined && execution === undefined) {
      malformedJunitReports++;
      incomplete = true;
      continue;
    }
    junitChars += report.content.length;
    const parsed = parseJunitXml(report.content, execution);
    malformedJunitReports += parsed.malformed;
    if (parsed.malformed || parsed.truncated) incomplete = true;
    else junitAvailable = true;
    junitTests.push(...parsed.tests);
    if (junitTests.length > MAX_TEST_CASES) {
      junitTests.length = MAX_TEST_CASES;
      incomplete = true;
      break;
    }
  }

  const reconciled = reconcileTests(json.tests, junitTests);
  const counts = { passed: 0, failed: 0, skipped: 0, unknown: 0 };
  const identityCounts = new Map<string, number>();
  for (const test of reconciled.tests) {
    counts[test.status]++;
    const key = testIdentity(test);
    identityCounts.set(key, (identityCounts.get(key) ?? 0) + 1);
  }
  const duplicateIdentitiesRetained = [...identityCounts.values()].filter((count) => count > 1).length;
  if (reconciled.conflictingStatuses > 0 || reconciled.ambiguousDuplicateGroups > 0) incomplete = true;

  const total = reconciled.tests.length;
  const hasJsonl = input.jsonl !== undefined && input.jsonlUnavailable !== true;
  const hasJunit = junitAvailable;
  const hasSource = json.tests.length > 0 || junitTests.length > 0;
  const status = !hasSource
    ? (incomplete ? "unavailable" : "empty")
    : (incomplete ? "partial" : "available");
  const sources = hasJsonl && hasJunit ? "jsonl_and_junit" : hasJsonl ? "jsonl_only" : hasJunit ? "junit_only" : "none";

  return {
    status,
    sources,
    count_scope: "observed_records",
    total,
    ...counts,
    jsonl_records: json.tests.length,
    junit_records: junitTests.length,
    duplicate_reports_removed: reconciled.duplicateReportsRemoved,
    duplicate_identities_retained: duplicateIdentitiesRetained,
    ambiguous_duplicate_groups: reconciled.ambiguousDuplicateGroups,
    conflicting_statuses: reconciled.conflictingStatuses,
    malformed_jsonl_records: json.malformed,
    malformed_junit_reports: malformedJunitReports,
    incomplete
  };
}
