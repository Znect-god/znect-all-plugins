import { describe, expect, it } from "vitest";
import { inspectCiBridgeProvenance, parseCiBridgeManifest } from "../src/provenance";

const manifest = {
  schema_version: 1,
  project_id: "znect-ci-bridge",
  source_repository: "Znect-god/znect-all-plugins",
  source_ref: "feature/ci-bridge-android-exporter",
  source_sha: "a".repeat(40),
  build_target: "worker-validation",
  build_profile: "debug",
  recipe: "node-cloudflare-worker-validation",
  recipe_repository: "Znect-god/znect-build",
  recipe_sha: "b".repeat(40),
  recipe_path: "recipes/node/cloudflare-worker-validation.sh",
  recipe_exit_code: 0,
  recipe_outcome: "success",
  validation_steps: [
    "npm ci",
    "npm audit --audit-level=high",
    "npm run check",
    "node --check scripts/preview-smoke-test.mjs",
    "npx --no-install wrangler deploy --dry-run"
  ],
  deployment_performed: false,
  circleci_pipeline_mutation: false,
  circleci: {
    pipeline_id: "123e4567-e89b-42d3-a456-426614174001",
    workflow_id: "123e4567-e89b-42d3-a456-426614174002",
    job_id: "123e4567-e89b-42d3-a456-426614174003",
    job: "validate-ci-bridge-source"
  },
  generated_at: "2026-11-18T10:00:00.000Z"
};

describe("CI Bridge provenance manifest schema", () => {
  it("accepts the exact successful manifest emitted by Znect Build", () => {
    expect(parseCiBridgeManifest(JSON.stringify(manifest))).toMatchObject({
      project_id: "znect-ci-bridge",
      source_sha: "a".repeat(40),
      recipe_sha: "b".repeat(40),
      recipe_outcome: "success",
      deployment_performed: false,
      circleci_pipeline_mutation: false
    });
  });

  it("accepts preserved failure provenance when the recipe exits nonzero", () => {
    const failed = { ...manifest, recipe_exit_code: 2, recipe_outcome: "failed" };
    expect(parseCiBridgeManifest(JSON.stringify(failed)).recipe_outcome).toBe("failed");
  });

  it("rejects unknown fields instead of silently trusting schema drift", () => {
    expect(() => parseCiBridgeManifest(JSON.stringify({ ...manifest, access_token: "secret" })))
      .toThrow("manifest_fields_invalid");
  });

  it("rejects inconsistent recipe exit status and outcome", () => {
    expect(() => parseCiBridgeManifest(JSON.stringify({ ...manifest, recipe_exit_code: 1 })))
      .toThrow("manifest_values_invalid");
  });

  it("rejects manifests that claim deployment or CircleCI mutation", () => {
    expect(() => parseCiBridgeManifest(JSON.stringify({ ...manifest, deployment_performed: true })))
      .toThrow("manifest_values_invalid");
    expect(() => parseCiBridgeManifest(JSON.stringify({ ...manifest, circleci_pipeline_mutation: true })))
      .toThrow("manifest_values_invalid");
  });

  it("rejects malformed, truncated and oversized input", () => {
    expect(() => parseCiBridgeManifest("{")).toThrow("manifest_json_invalid");
    expect(() => parseCiBridgeManifest(JSON.stringify(manifest).slice(0, -1))).toThrow("manifest_json_invalid");
    expect(() => parseCiBridgeManifest(" ".repeat(32_769))).toThrow("manifest_size_invalid");
  });

  it("rejects mismatched source identity and invalid CircleCI identifiers", () => {
    expect(() => parseCiBridgeManifest(JSON.stringify({ ...manifest, source_repository: "attacker/repo" })))
      .toThrow("manifest_values_invalid");
    expect(() => parseCiBridgeManifest(JSON.stringify({
      ...manifest, circleci: { ...manifest.circleci, pipeline_id: "not-a-uuid" }
    }))).toThrow("manifest_circleci_invalid");
  });

  it("validates artifact provenance against the selected run, workflow, job and resolved checkout SHA", async () => {
    const runId = manifest.circleci.pipeline_id;
    const workflowId = manifest.circleci.workflow_id;
    const jobId = "123e4567-e89b-42d3-a456-426614174003";
    const artifacts = [
      { id: "manifest", jobId, path: "ci-bridge-validation-manifest.json", size: 900 },
      { id: "sha", jobId, path: "resolved-source-sha.txt", size: 41 }
    ];
    const adapter = {
      listJobs: async () => [{ id: jobId, projectId: "znect-build", workflowId, name: "validate-ci-bridge-source", status: "success" }],
      listArtifacts: async () => artifacts,
      getArtifact: async (_scope: unknown, _job: string, artifactPath: string) => ({
        path: artifactPath,
        content: artifactPath === "ci-bridge-validation-manifest.json" ? JSON.stringify(manifest) : manifest.source_sha + "\n",
        truncated: false
      })
    };
    const scope = { projectId: "znect-build", connectionId: "build-circleci" };
    const run = { id: runId, projectId: "znect-build", status: "success", commitSha: manifest.recipe_sha };
    const workflows = [{ id: workflowId, runId, name: "ci-bridge-exact-sha-validation", status: "success" }];
    await expect(inspectCiBridgeProvenance(adapter as never, scope, run, workflows))
      .resolves.toMatchObject({ status: "validated", source_sha: manifest.source_sha, job_id: jobId });

    const mismatchAdapter = {
      ...adapter,
      getArtifact: async (_scope: unknown, _job: string, artifactPath: string) => ({
        path: artifactPath,
        content: artifactPath === "ci-bridge-validation-manifest.json" ? JSON.stringify(manifest) : "c".repeat(40) + "\n",
        truncated: false
      })
    };
    await expect(inspectCiBridgeProvenance(mismatchAdapter as never, scope, run, workflows))
      .resolves.toMatchObject({ status: "invalid", reason: "circleci_identity_or_sha_mismatch" });
  });

  it("does not select the first manifest when artifact paths are duplicated", async () => {
    const runId = manifest.circleci.pipeline_id;
    const workflowId = manifest.circleci.workflow_id;
    const adapter = {
      listJobs: async () => [{ id: "123e4567-e89b-42d3-a456-426614174003", projectId: "znect-build", workflowId, name: "validate-ci-bridge-source", status: "success" }],
      listArtifacts: async () => [
        { id: "one", path: "ci-bridge-validation-manifest.json" },
        { id: "two", path: "ci-bridge-validation-manifest.json" },
        { id: "sha", path: "resolved-source-sha.txt" }
      ]
    };
    await expect(inspectCiBridgeProvenance(adapter as never, { projectId: "znect-build", connectionId: "build-circleci" },
      { id: runId, projectId: "znect-build", status: "success", commitSha: manifest.recipe_sha },
      [{ id: workflowId, runId, name: "ci-bridge-exact-sha-validation" }]))
      .resolves.toMatchObject({ status: "invalid", reason: "manifest_or_source_sha_artifact_missing_or_duplicate" });
  });

  it("does not scan unrelated workflow jobs and reports a missing validation workflow", async () => {
    const listJobs = async () => { throw new Error("must not inspect unrelated workflows"); };
    const result = await inspectCiBridgeProvenance({ listJobs } as never,
      { projectId: "znect-build", connectionId: "build-circleci" },
      { id: manifest.circleci.pipeline_id, projectId: "znect-build", status: "success" },
      [{ id: "123e4567-e89b-42d3-a456-426614174004", runId: manifest.circleci.pipeline_id, name: "znect-build-validation" }]);
    expect(result).toMatchObject({ status: "missing", reason: "validation_workflow_not_found" });
  });

  it("marks incomplete job scans unavailable instead of trusting a partial result", async () => {
    const jobs = Array.from({ length: 41 }, (_, i) => ({ id: `job-${i}`, name: "unrelated" }));
    const adapter = { listJobs: async () => jobs };
    const result = await inspectCiBridgeProvenance(adapter as never,
      { projectId: "znect-build", connectionId: "build-circleci" },
      { id: manifest.circleci.pipeline_id, projectId: "znect-build", status: "success" },
      [{ id: manifest.circleci.workflow_id, runId: manifest.circleci.pipeline_id, name: "ci-bridge-exact-sha-validation" }]);
    expect(result).toMatchObject({ status: "unavailable", reason: "job_scan_limit_reached" });
  });

  it("rejects a manifest whose exact job UUID differs from the CircleCI job resource", async () => {
    const runId = manifest.circleci.pipeline_id;
    const workflowId = manifest.circleci.workflow_id;
    const jobId = "123e4567-e89b-42d3-a456-426614174003";
    const wrongJobManifest = { ...manifest, circleci: { ...manifest.circleci, job_id: "123e4567-e89b-42d3-a456-426614174009" } };
    const adapter = {
      listJobs: async () => [{ id: jobId, projectId: "znect-build", workflowId, name: "validate-ci-bridge-source", status: "success" }],
      listArtifacts: async () => [
        { id: "manifest", path: "ci-bridge-validation-manifest.json", size: 900 },
        { id: "sha", path: "resolved-source-sha.txt", size: 41 }
      ],
      getArtifact: async (_scope: unknown, _job: string, artifactPath: string) => ({
        path: artifactPath,
        content: artifactPath === "ci-bridge-validation-manifest.json" ? JSON.stringify(wrongJobManifest) : manifest.source_sha + "\n",
        truncated: false
      })
    };
    const result = await inspectCiBridgeProvenance(adapter as never,
      { projectId: "znect-build", connectionId: "build-circleci" },
      { id: runId, projectId: "znect-build", status: "success", commitSha: manifest.recipe_sha },
      [{ id: workflowId, runId, name: "ci-bridge-exact-sha-validation" }]);
    expect(result).toMatchObject({ status: "invalid", reason: "circleci_identity_or_sha_mismatch" });
  });

  it("rejects artifact content returned under a different path", async () => {
    const runId = manifest.circleci.pipeline_id;
    const workflowId = manifest.circleci.workflow_id;
    const jobId = "123e4567-e89b-42d3-a456-426614174003";
    const adapter = {
      listJobs: async () => [{ id: jobId, projectId: "znect-build", workflowId, name: "validate-ci-bridge-source", status: "success" }],
      listArtifacts: async () => [
        { id: "manifest", path: "ci-bridge-validation-manifest.json", size: 900 },
        { id: "sha", path: "resolved-source-sha.txt", size: 41 }
      ],
      getArtifact: async (_scope: unknown, _job: string, artifactPath: string) => ({
        path: artifactPath === "ci-bridge-validation-manifest.json" ? "unexpected.json" : artifactPath,
        content: artifactPath === "ci-bridge-validation-manifest.json" ? JSON.stringify(manifest) : manifest.source_sha + "\n",
        truncated: false
      })
    };
    const result = await inspectCiBridgeProvenance(adapter as never,
      { projectId: "znect-build", connectionId: "build-circleci" },
      { id: runId, projectId: "znect-build", status: "success", commitSha: manifest.recipe_sha },
      [{ id: workflowId, runId, name: "ci-bridge-exact-sha-validation" }]);
    expect(result).toMatchObject({ status: "invalid", reason: "artifact_path_mismatch" });
  });

  it("rejects run, workflow and recipe revision identity mismatches", async () => {
    const runId = manifest.circleci.pipeline_id;
    const workflowId = manifest.circleci.workflow_id;
    const jobId = manifest.circleci.job_id;
    const adapter = {
      listJobs: async () => [{ id: jobId, projectId: "znect-build", workflowId, name: "validate-ci-bridge-source", status: "success" }],
      listArtifacts: async () => [
        { id: "manifest", path: "ci-bridge-validation-manifest.json", size: 900 },
        { id: "sha", path: "resolved-source-sha.txt", size: 41 }
      ],
      getArtifact: async (_scope: unknown, _job: string, artifactPath: string) => ({
        path: artifactPath,
        content: artifactPath === "ci-bridge-validation-manifest.json" ? JSON.stringify(manifest) : manifest.source_sha + "\n",
        truncated: false
      })
    };
    const scope = { projectId: "znect-build", connectionId: "build-circleci" };
    const workflow = { id: workflowId, runId, name: "ci-bridge-exact-sha-validation" };
    const baseRun = { id: runId, projectId: "znect-build", status: "success", commitSha: manifest.recipe_sha };
    await expect(inspectCiBridgeProvenance(adapter as never, scope, { ...baseRun, id: "123e4567-e89b-42d3-a456-426614174010" }, [workflow]))
      .resolves.toMatchObject({ status: "invalid", reason: "circleci_identity_or_sha_mismatch" });
    await expect(inspectCiBridgeProvenance(adapter as never, scope, baseRun, [{ ...workflow, id: "123e4567-e89b-42d3-a456-426614174011" }]))
      .resolves.toMatchObject({ status: "invalid", reason: "circleci_identity_or_sha_mismatch" });
    await expect(inspectCiBridgeProvenance(adapter as never, scope, { ...baseRun, commitSha: "c".repeat(40) }, [workflow]))
      .resolves.toMatchObject({ status: "invalid", reason: "circleci_identity_or_sha_mismatch" });
  });

  it("rejects missing and truncated provenance artifacts", async () => {
    const runId = manifest.circleci.pipeline_id;
    const workflowId = manifest.circleci.workflow_id;
    const jobId = manifest.circleci.job_id;
    const base = {
      listJobs: async () => [{ id: jobId, projectId: "znect-build", workflowId, name: "validate-ci-bridge-source", status: "success" }],
      listArtifacts: async () => [
        { id: "manifest", path: "ci-bridge-validation-manifest.json", size: 900 },
        { id: "sha", path: "resolved-source-sha.txt", size: 41 }
      ]
    };
    const scope = { projectId: "znect-build", connectionId: "build-circleci" };
    const run = { id: runId, projectId: "znect-build", status: "success", commitSha: manifest.recipe_sha };
    const workflows = [{ id: workflowId, runId, name: "ci-bridge-exact-sha-validation" }];
    const missing = { ...base, listArtifacts: async () => [{ id: "sha", path: "resolved-source-sha.txt", size: 41 }] };
    await expect(inspectCiBridgeProvenance(missing as never, scope, run, workflows))
      .resolves.toMatchObject({ status: "invalid", reason: "manifest_or_source_sha_artifact_missing_or_duplicate" });
    const truncated = { ...base, getArtifact: async (_scope: unknown, _job: string, artifactPath: string) => ({
      path: artifactPath, content: "", truncated: artifactPath === "ci-bridge-validation-manifest.json"
    }) };
    await expect(inspectCiBridgeProvenance(truncated as never, scope, run, workflows))
      .resolves.toMatchObject({ status: "invalid", reason: "artifact_truncated" });
  });

  it("reports a structurally valid failed recipe as failed_recipe", async () => {
    const failedManifest = { ...manifest, recipe_exit_code: 1, recipe_outcome: "failed" };
    const runId = manifest.circleci.pipeline_id;
    const workflowId = manifest.circleci.workflow_id;
    const jobId = manifest.circleci.job_id;
    const adapter = {
      listJobs: async () => [{ id: jobId, projectId: "znect-build", workflowId, name: "validate-ci-bridge-source", status: "failed" }],
      listArtifacts: async () => [
        { id: "manifest", path: "ci-bridge-validation-manifest.json", size: 900 },
        { id: "sha", path: "resolved-source-sha.txt", size: 41 }
      ],
      getArtifact: async (_scope: unknown, _job: string, artifactPath: string) => ({
        path: artifactPath,
        content: artifactPath === "ci-bridge-validation-manifest.json" ? JSON.stringify(failedManifest) : manifest.source_sha + "\n",
        truncated: false
      })
    };
    await expect(inspectCiBridgeProvenance(adapter as never,
      { projectId: "znect-build", connectionId: "build-circleci" },
      { id: runId, projectId: "znect-build", status: "failed", commitSha: manifest.recipe_sha },
      [{ id: workflowId, runId, name: "ci-bridge-exact-sha-validation" }]))
      .resolves.toMatchObject({ status: "failed_recipe", recipe_exit_code: 1, recipe_outcome: "failed" });
  });
});
