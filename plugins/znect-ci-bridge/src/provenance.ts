import type { CiProjectScope, CiRun, CiWorkflow, ReadOnlyCiProviderAdapter } from "./providers/contract";

const MANIFEST_PATH = "ci-bridge-validation-manifest.json";
const SOURCE_SHA_PATH = "resolved-source-sha.txt";
const MAX_MANIFEST_BYTES = 32_768;
const SHA1_RE = /^[0-9a-f]{40}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPECTED_STEPS = [
  "npm ci",
  "npm audit --audit-level=high",
  "npm run check",
  "node --check scripts/preview-smoke-test.mjs",
  "npx --no-install wrangler deploy --dry-run"
];

export interface ProvenanceSummary {
  status: "validated" | "failed_recipe" | "missing" | "invalid" | "unavailable";
  reason?: string;
  source_repository?: string;
  source_ref?: string;
  source_sha?: string;
  recipe_repository?: string;
  recipe_sha?: string;
  recipe_path?: string;
  recipe_exit_code?: number;
  recipe_outcome?: "success" | "failed";
  pipeline_id?: string;
  workflow_id?: string;
  job_id?: string;
  generated_at?: string;
}

/** Strictly validates the exact manifest emitted by Znect Build's CircleCI recipe. */
export function parseCiBridgeManifest(raw: string): Record<string, unknown> {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).byteLength > MAX_MANIFEST_BYTES) {
    throw new Error("manifest_size_invalid");
  }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("manifest_json_invalid"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("manifest_shape_invalid");
  const m = value as Record<string, unknown>;
  const allowed = new Set([
    "schema_version", "project_id", "source_repository", "source_ref", "source_sha",
    "build_target", "build_profile", "recipe", "recipe_repository", "recipe_sha",
    "recipe_path", "recipe_exit_code", "recipe_outcome", "validation_steps",
    "deployment_performed", "circleci_pipeline_mutation", "circleci", "generated_at"
  ]);
  if (Object.keys(m).length !== allowed.size || Object.keys(m).some((key) => !allowed.has(key))) {
    throw new Error("manifest_fields_invalid");
  }
  if (m.schema_version !== 1 || m.project_id !== "znect-ci-bridge" ||
      m.source_repository !== "Znect-god/znect-all-plugins" ||
      typeof m.source_ref !== "string" || m.source_ref.length < 1 || m.source_ref.length > 256 ||
      /[\u0000-\u001f\u007f]/.test(m.source_ref) ||
      typeof m.source_sha !== "string" || !SHA1_RE.test(m.source_sha) ||
      m.build_target !== "worker-validation" || m.build_profile !== "debug" ||
      m.recipe !== "node-cloudflare-worker-validation" ||
      m.recipe_repository !== "Znect-god/znect-build" ||
      typeof m.recipe_sha !== "string" || !SHA1_RE.test(m.recipe_sha) ||
      m.recipe_path !== "recipes/node/cloudflare-worker-validation.sh" ||
      !Number.isInteger(m.recipe_exit_code) || (m.recipe_exit_code as number) < 0 ||
      (m.recipe_outcome !== "success" && m.recipe_outcome !== "failed") ||
      m.recipe_outcome !== ((m.recipe_exit_code as number) === 0 ? "success" : "failed") ||
      m.deployment_performed !== false || m.circleci_pipeline_mutation !== false ||
      !Array.isArray(m.validation_steps) || JSON.stringify(m.validation_steps) !== JSON.stringify(EXPECTED_STEPS) ||
      typeof m.generated_at !== "string" || !Number.isFinite(Date.parse(m.generated_at)) ||
      new Date(m.generated_at).toISOString() !== m.generated_at) {
    throw new Error("manifest_values_invalid");
  }
  const c = m.circleci;
  if (!c || typeof c !== "object" || Array.isArray(c)) throw new Error("manifest_circleci_invalid");
  const ci = c as Record<string, unknown>;
  const ciKeys = ["pipeline_id", "workflow_id", "job", "build_num", "build_url"];
  if (Object.keys(ci).length !== ciKeys.length || Object.keys(ci).some((key) => !ciKeys.includes(key)) ||
      typeof ci.pipeline_id !== "string" || !UUID_RE.test(ci.pipeline_id) ||
      typeof ci.workflow_id !== "string" || !UUID_RE.test(ci.workflow_id) ||
      ci.job !== "validate-ci-bridge-source" ||
      typeof ci.build_num !== "string" || !/^[1-9][0-9]{0,11}$/.test(ci.build_num) ||
      typeof ci.build_url !== "string" || ci.build_url.length > 2048) {
    throw new Error("manifest_circleci_invalid");
  }
  let buildUrl: URL;
  try { buildUrl = new URL(ci.build_url as string); } catch { throw new Error("manifest_circleci_invalid"); }
  if (buildUrl.protocol !== "https:" || (buildUrl.hostname !== "app.circleci.com" && buildUrl.hostname !== "circleci.com") ||
      buildUrl.username || buildUrl.password) throw new Error("manifest_circleci_invalid");
  return m;
}

/** Finds and verifies the unique validation-job manifest without trusting manifest-supplied URLs. */
export async function inspectCiBridgeProvenance(
  adapter: ReadOnlyCiProviderAdapter,
  scope: CiProjectScope,
  run: CiRun,
  workflows: CiWorkflow[]
): Promise<ProvenanceSummary> {
  try {
    if (workflows.length > 5) return { status: "unavailable", reason: "workflow_scan_limit_reached" };
    const candidates: Array<{ workflow: CiWorkflow; jobId: string }> = [];
    let truncated = false;
    for (const workflow of workflows) {
      const jobs = await adapter.listJobs(scope, run.id, workflow.id);
      if (jobs.length > 40) truncated = true;
      for (const job of jobs.slice(0, 40)) {
        if (workflow.name === "ci-bridge-exact-sha-validation" &&
            job.name === "validate-ci-bridge-source") {
          candidates.push({ workflow, jobId: job.id });
        }
      }
    }
    if (truncated) return { status: "unavailable", reason: "job_scan_limit_reached" };
    if (candidates.length === 0) return { status: "missing", reason: "validation_job_not_found" };
    if (candidates.length !== 1) return { status: "invalid", reason: "duplicate_validation_jobs" };
    const candidate = candidates[0];
    if (candidate.workflow.id.length === 0 || candidate.workflow.runId !== run.id) {
      return { status: "invalid", reason: "workflow_identity_mismatch" };
    }
    const listed = await adapter.listArtifacts(scope, candidate.jobId);
    const manifests = listed.filter((item) => item.path === MANIFEST_PATH);
    const sourceShaFiles = listed.filter((item) => item.path === SOURCE_SHA_PATH);
    if (manifests.length !== 1 || sourceShaFiles.length !== 1) {
      return { status: "invalid", reason: "manifest_or_source_sha_artifact_missing_or_duplicate" };
    }
    if ((manifests[0].size ?? 0) > MAX_MANIFEST_BYTES ||
        (sourceShaFiles[0].size ?? 0) > 128) {
      return { status: "invalid", reason: "artifact_size_invalid" };
    }
    const [manifestArtifact, sourceShaArtifact] = await Promise.all([
      adapter.getArtifact(scope, candidate.jobId, MANIFEST_PATH, MAX_MANIFEST_BYTES),
      adapter.getArtifact(scope, candidate.jobId, SOURCE_SHA_PATH, 128)
    ]);
    if (manifestArtifact.truncated || sourceShaArtifact.truncated) {
      return { status: "invalid", reason: "artifact_truncated" };
    }
    let manifest: Record<string, unknown>;
    try { manifest = parseCiBridgeManifest(manifestArtifact.content); }
    catch (error) { return { status: "invalid", reason: error instanceof Error ? error.message : "manifest_invalid" }; }
    const ci = manifest.circleci as Record<string, unknown>;
    if (ci.pipeline_id !== run.id || ci.workflow_id !== candidate.workflow.id ||
        ci.job !== "validate-ci-bridge-source" ||
        typeof run.commitSha !== "string" || manifest.recipe_sha !== run.commitSha ||
        sourceShaArtifact.content.trim() !== manifest.source_sha) {
      return { status: "invalid", reason: "circleci_identity_or_sha_mismatch" };
    }
    const result: ProvenanceSummary = {
      status: manifest.recipe_outcome === "success" ? "validated" : "failed_recipe",
      source_repository: manifest.source_repository as string,
      source_ref: manifest.source_ref as string,
      source_sha: manifest.source_sha as string,
      recipe_repository: manifest.recipe_repository as string,
      recipe_sha: manifest.recipe_sha as string,
      recipe_path: manifest.recipe_path as string,
      recipe_exit_code: manifest.recipe_exit_code as number,
      recipe_outcome: manifest.recipe_outcome as "success" | "failed",
      pipeline_id: ci.pipeline_id as string,
      workflow_id: ci.workflow_id as string,
      job_id: candidate.jobId,
      generated_at: manifest.generated_at as string
    };
    return result;
  } catch {
    return { status: "unavailable", reason: "provenance_artifact_read_failed" };
  }
}
