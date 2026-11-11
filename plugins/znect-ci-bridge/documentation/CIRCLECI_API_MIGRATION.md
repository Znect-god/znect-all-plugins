# CircleCI API migration plan

**Status:** v3 client foundation implemented with mocked tests; MCP tool migration remains blocked pending project/token verification and build-number mapping.  
**Current MCP tools:** still use the v1.1 adapter.  
**Target:** API v3 for CircleCI Cloud; API v2 remains the supported fallback if the project is CircleCI Server.

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

1. **Hosting:** confirm the Forge project is CircleCI Cloud. If it is Server, stop v3 migration and design a v2 adapter instead. No migration of Forge hosting is authorized by this plan.
2. **Token:** inspect the token type in CircleCI settings without sharing its value. V3 requires Bearer authentication; do not assume the existing v1.1 token works.
3. **Project identity:** resolve the exact slug `gh/Znect-god/znect-forge` using `GET /api/v3/projects?filter[slug]=...`, then verify the returned slug and UUID before saving the UUID as configuration.
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

The v3 adapter is deliberately not wired into the existing MCP tools yet. Existing tool inputs and responses are based on v1.1 build numbers and step/action objects. A premature switch would risk returning the wrong build or silently changing tool semantics.

## Proposed v3 resource traversal

1. Resolve the fixed project slug to one UUID.
2. List runs using `GET /api/v3/runs?filter[project_id]=...`.
3. For each run, list workflows using `GET /api/v3/workflows?filter[run_id]=...`.
4. For each workflow, list jobs using `GET /api/v3/jobs?filter[workflow_id]=...`.
5. Fetch job details using `GET /api/v3/jobs/:id`.
6. Fetch each selected step's stdout/stderr using `GET /api/v3/jobs/:id/stdout` or `stderr` with `filter[step_num]` and optional `filter[execution]`.

## Remaining work

1. Confirm Cloud vs Server and token type in the user's CircleCI account; never paste token values into chat.
2. Confirm the exact project slug from CircleCI project settings. The current code uses the conventional GitHub slug as a candidate, not as a verified live identity.
3. Add fixtures based on actual, sanitized v3 response shapes and test run/workflow/job mapping.
4. Establish whether the old build number can be mapped unambiguously to a run/workflow/job using VCS revision, branch and timestamps. If not, introduce new MCP tool inputs based on v3 UUIDs instead of pretending the old build-number contract is equivalent.
5. Compare v1.1 and v3 results for the same historical Forge builds after live access is authorized.
6. Wire the v3 adapter into MCP tools only after mapping parity is demonstrated. Keep v1.1 as a temporary fallback until then; never silently retry v1.1 after a v3 authorization or data error.
7. Run Linux CI and review results. Keep plugin status `prototype`.

## Security decisions

- No token values in logs, fixtures, command output, PR descriptions, or committed files.
- No arbitrary URL input from the MCP caller.
- No non-GET API v3 calls.
- No Cloudflare deployment.
- No Forge workflow changes or triggers.
- No automatic v1.1 fallback that could hide v3 authorization or mapping errors.
- Project UUID and token compatibility must be confirmed before live use.
