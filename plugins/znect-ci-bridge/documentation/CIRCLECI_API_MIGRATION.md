# CircleCI API migration plan

**Current assistant-channel boundary:** this document describes CircleCI provider/API compatibility, not a requirement to use MCP. The authenticated Browser JSON API is the primary ChatGPT-facing surface; MCP tools are optional compatibility functionality. The former GitHub Actions-backed Znect Build adapter is retired. CircleCI API v3 is the primary read-only provider path, while the explicitly separate v1.1 methods are legacy compatibility only.

**Status:** CircleCI Cloud target established; v3 read-only adapter and nine v3 MCP tools implemented with mocked tests, including cursor pagination for workflow and job collections. Live token access and project UUID resolution remain unverified.  
**Current MCP tools:** legacy v1.1 tools remain for compatibility; nine separate v3 tools are now available.  
**Target:** API v3 for the existing CircleCI Cloud project. No Forge hosting migration is needed.

## Current documentation findings

CircleCI identifies API v3 as the current API for new Cloud integrations. V3 uses:
- `Authorization: Bearer <token>`;
- UUID resource identifiers;
- opaque cursor pagination via `page[cursor]`;
- structured error envelopes and documented rate-limit headers.

CircleCI Server does not yet support API v3; Server integrations must use API v2. The v3 reference documents project resolution by `filter[slug]`, project-scoped runs, workflows within a run, jobs within a workflow, and job stdout/stderr endpoints.

Sources:
- https://circleci.com/docs/guides/toolkit/api-intro/
- https://circleci.com/docs/guides/toolkit/api-v3-developers-guide/
- https://circleci.com/docs/api/v3
- https://circleci.com/docs//guides/server/toolkit/api-intro/

## Compatibility gates

1. **Hosting:** CircleCI Cloud is the established target from the earlier Forge setup; no hosting migration is required.
2. **Token:** configure a CircleCI personal API token with the required read access as the Worker Secret `CIRCLECI_TOKEN`. V3 uses Bearer authentication. Never paste the token into chat or commit it.
3. **Project identity:** the v3 tool resolves `gh/Znect-god/znect-forge` using `GET /api/v3/projects?filter[slug]=...` on each recent-runs request and requires exactly one matching project with a valid UUID. Live resolution remains to be tested.
4. **Read-only scope:** only GET requests may be implemented. Do not add pipeline triggers, reruns, cancellations, environment-variable reads, deploy controls, or any other mutation.
5. **Legacy build number mapping:** the v1.1 build number is not a v3 UUID. Never pass a build number as a v3 resource ID or guess a match.
6. **Logs:** v3 exposes stdout/stderr by job UUID, step number and execution index. The implementation must preserve byte limits and redact output before returning it.

## Job execution timestamp semantics

The CircleCI API v3 developer guide's single-job response example names `started_at` and `ended_at` as execution timestamps. The adapter now maps only those fields to `CiJob.startedAt` and `CiJob.completedAt`. It does not treat `created_at`, `start_time`, `stop_time` or `stopped_at` as execution timestamps. A queued job without a documented start/end field therefore has no execution interval in the shared model.

The regression fixture supplies only creation/legacy aliases and expects both execution timestamps to remain absent. This test-source coverage is pending execution.

## Run outcome semantics

CircleCI documents that a Run's `current_outcome` is authoritative because reruns can change the outcome; it is not interchangeable with a generic `outcome` field. The adapter now uses `current_outcome` first for Run status and does not allow a stale `outcome` field to override it. Workflow/job status normalization remains separate because those resources have their own outcome contract.

The adapter test fixture intentionally supplies conflicting values (`outcome: success`, `current_outcome: failed`) and expects the Run to remain failed. This is test-source coverage only until the CircleCI suite executes.

## Run VCS field contract

The machine-readable CircleCI API v3 response schema for `GET /api/v3/runs/:id` defines the run's VCS context under `references.event.attributes.vcs`, with:
- `branch`
- `revision`
- `commit.subject`
- `commit.body`
- `commit.url`

The adapter now maps branch, revision and commit message only from those documented nested fields. It does not consume top-level `attributes.branch`, `attributes.vcs_revision` or `attributes.subject` aliases. The Run schema exposes `attributes.created_at` but does not define run-level start/end timestamps or a run `web_url`; the adapter therefore reports `createdAt` rather than mislabelling creation as execution start, and does not fabricate a run URL. Event correlation uses the actual execution interval when a provider supplies one, otherwise it compares against the CircleCI run's creation timestamp as a point in time. The adapter fixture models the documented nested shape and includes regression-test source rejecting undocumented aliases.

**Verification boundary:** the field path is confirmed against CircleCI's published machine-readable OpenAPI schema. The actual live API response for the configured Znect Build project remains unobserved; do not mark runtime mapping as verified until an authorized read-only response is inspected.

## Implemented v3 client foundation

`src/circleci-v3.ts` now provides:
- fixed-origin `https://circleci.com/api/v3` GET-only JSON requests;
- Bearer authentication and 15-second timeouts;
- a 1 MB bounded JSON response parser;
- strict UUID validation for project, run, workflow and job identifiers;
- exact project-slug resolution that requires exactly one result and validates the returned slug when present;
- project-scoped run listing with a maximum of 30 items, using at most two v3 pages and treating cursors as opaque values;
- run → workflow → job traversal; workflow collections follow opaque cursors with a 20-item page size and a bounded page ceiling; the documented jobs collection is a single unpaginated response with a 200-job hard ceiling; repeated workflow cursors and over-limit collections fail explicitly;
- bounded stdout/stderr retrieval using the documented step and execution filters;
- sanitized 401/403/404/429 and other upstream errors.
- CircleCI API v3 `429` responses are surfaced with a sanitized, parsed `Retry-After` interval when available; the adapter does not sleep or retry internally, leaving retry scheduling to the caller/runtime rather than holding a Worker request open.

The v3 adapter is exposed through the authenticated Browser JSON API and nine optional MCP compatibility tools, kept separate from the legacy v1.1 tools:
- `check_connection()` verifies read access to the fixed project and returns its UUID and slug.
- `list_recent_runs(limit)` resolves the fixed project slug and lists v3 runs.
- `get_run_details(run_id)` reads a run, its workflows and their jobs.
- `get_job_details(job_id)` reads one job resource.
- `get_job_logs(job_id, step_num, execution, stream, max_chars)` reads bounded stdout/stderr and applies best-effort secret redaction.
- `get_job_test_results(job_id, max_chars)` reads structured JSON Lines test results.
- `list_job_artifacts(job_id)` returns artifact metadata without exposing presigned URLs.
- `get_job_artifact(job_id, artifact_path, max_chars)` downloads a specifically listed artifact through the internal HTTPS host allowlist.
- `diagnose_run(run_id)` combines failed job/step metadata, failed-step logs, structured test results, and up to two small JUnit reports per failed job.

Single-resource v3 responses are unwrapped from the documented `data` envelope. Legacy tools remain on v1.1; no automatic mapping from build number to run UUID or silent fallback is performed.

## Implemented v3 resource traversal

1. Resolve the fixed project slug to one UUID.
2. List runs using `GET /api/v3/runs?filter[project_id]=...`.
3. For each run, list workflows using `GET /api/v3/workflows?filter[run_id]=...`.
4. For each workflow, list jobs using `GET /api/v3/jobs?filter[workflow_id]=...`.
5. Fetch job details using `GET /api/v3/jobs/:id`.
6. Fetch each selected step's stdout/stderr using `GET /api/v3/jobs/:id/stdout` or `stderr` with `filter[step_num]` and optional `filter[execution]`.

### Job detail step shape

CircleCI's public CLI v3 acceptance-fixture model represents `attributes.parallel_executions` as an array of step arrays (`[][]JobStep`): each outer-array position is the zero-based execution index, and each inner array contains that execution's steps. The adapter maps `num` to the API step number and does not require the optional `is_insignificant` extension field to be present. Queued jobs may omit `parallel_executions` entirely; they are represented as having no reported steps, not as a failed parse. The regression fixtures use this nested-array wire shape.

Artifact metadata preserves CircleCI's zero-based `execution` index when supplied. Parallel executions can produce the same artifact path more than once; callers must pass the execution index to `get_job_artifact` to disambiguate those entries. A path-only request that matches multiple artifacts is rejected rather than selecting an arbitrary execution.

## Remaining work

1. Confirm the configured CircleCI personal API token as the Worker Secret `CIRCLECI_TOKEN` without exposing it in chat.
2. Verify the private Browser API's separate `WEB_ACCESS_TOKEN` and required Worker bindings without changing Production.
3. Perform a live read-only API v3 smoke test, verifying exact project slug, UUID, recent runs, workflows, jobs, test results, bounded logs and provenance artifacts.
4. Re-diagnose the known historical Forge failure using its existing run UUID; do not trigger a new build.
5. Compare any historical v1.1/v3 records using commit SHA, branch and timestamps. Do not infer an identity match from build number alone.
6. Decide later whether to deprecate v1.1 compatibility tools; do not silently retry v1.1 after a v3 authorization or data error.
7. Establish a supported private ChatGPT Free access/handoff path without making MCP mandatory or weakening Browser API authentication.
8. Complete typecheck and unit tests through the authorized opt-in CircleCI workflow after explicit authorization. Keep plugin status `in-development` until live verification is complete.

## Security decisions

- No token values in logs, fixtures, command output, PR descriptions, or committed files.
- No arbitrary URL input from the MCP caller.
- No non-GET API v3 calls.
- No production Cloudflare deployment without explicit authorization; Preview verification is a separate step.
- No Forge workflow changes or triggers.
- No automatic v1.1 fallback that could hide v3 authorization or mapping errors.
- Live project UUID resolution and token authorization must be confirmed before production use.
- MCP v3 tools are implemented but have only been tested with synthetic/mocked responses.
- The existing v1.1 tools remain separately available during the transition.
