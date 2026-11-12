# CircleCI API migration plan

**Status:** CircleCI Cloud target established; v3 read-only adapter and three v3 MCP tools implemented with mocked tests. Live token access and project UUID resolution remain unverified.  
**Current MCP tools:** legacy v1.1 tools remain for compatibility; three separate v3 tools are now available.  
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

## Implemented v3 client foundation

`src/circleci-v3.ts` now provides:
- fixed-origin `https://circleci.com/api/v3` GET-only JSON requests;
- Bearer authentication and 15-second timeouts;
- a 1 MB bounded JSON response parser;
- strict UUID validation for project, run, workflow and job identifiers;
- exact project-slug resolution that requires exactly one result and validates the returned slug when present;
- project-scoped run listing with a maximum of 30 items, using at most two v3 pages and treating cursors as opaque values;
- run → workflow → job traversal;
- bounded stdout/stderr retrieval using the documented step and execution filters;
- sanitized 401/403/404/429 and other upstream errors.

The v3 adapter is now wired to three new MCP tools, kept separate from the legacy tools:
- `list_recent_runs(limit)` resolves the fixed project slug and lists v3 runs.
- `get_run_details(run_id)` reads a run, its workflows and their jobs.
- `get_job_logs(job_id, step_num, execution, stream, max_chars)` reads bounded stdout/stderr and applies best-effort secret redaction.

Single-resource v3 responses are unwrapped from the documented `data` envelope. Legacy tools remain on v1.1; no automatic mapping from build number to run UUID or silent fallback is performed.

## Proposed v3 resource traversal

1. Resolve the fixed project slug to one UUID.
2. List runs using `GET /api/v3/runs?filter[project_id]=...`.
3. For each run, list workflows using `GET /api/v3/workflows?filter[run_id]=...`.
4. For each workflow, list jobs using `GET /api/v3/jobs?filter[workflow_id]=...`.
5. Fetch job details using `GET /api/v3/jobs/:id`.
6. Fetch each selected step's stdout/stderr using `GET /api/v3/jobs/:id/stdout` or `stderr` with `filter[step_num]` and optional `filter[execution]`.

## Remaining work

1. Configure a CircleCI personal API token as the Worker Secret `CIRCLECI_TOKEN` without exposing it in chat.
2. Configure the MCP access token as `MCP_ACCESS_TOKEN` and verify Cloudflare Worker bindings before any deployment.
3. Perform a live read-only API v3 smoke test after explicit authorization, verifying exact project slug, UUID, recent runs, workflows, jobs and bounded logs.
4. Compare one or more historical builds across v1.1 and v3 using commit SHA, branch and timestamps. Do not infer an identity match from build number alone.
5. If parity is proven, decide whether to deprecate the v1.1 tools in a later version. Do not silently retry v1.1 after a v3 authorization or data error.
6. Run Linux CI and review results. Keep plugin status `prototype`.

## Security decisions

- No token values in logs, fixtures, command output, PR descriptions, or committed files.
- No arbitrary URL input from the MCP caller.
- No non-GET API v3 calls.
- No Cloudflare deployment.
- No Forge workflow changes or triggers.
- No automatic v1.1 fallback that could hide v3 authorization or mapping errors.
- Live project UUID resolution and token authorization must be confirmed before production use.
- MCP v3 tools are implemented but have only been tested with synthetic/mocked responses.
- The existing v1.1 tools remain separately available during the transition.
