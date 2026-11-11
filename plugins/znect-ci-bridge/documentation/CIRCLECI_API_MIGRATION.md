# CircleCI API migration plan

**Status:** research complete; implementation blocked pending token and project-scope verification  
**Current adapter:** API v1.1, read-only GET operations  
**Target:** API v3 for CircleCI Cloud, with API v2 as the supported fallback if v3 does not expose a required read operation

## Why migrate

CircleCI now identifies API v3 as the current API for new integrations. API v1.1 is legacy and has an end-of-life planned, but CircleCI has not announced a general shutdown date for every v1.1 read endpoint. The February 1, 2027 removal notice applies to specific legacy trigger/rerun endpoints; this plugin does not call those endpoints and must remain read-only.

Sources:
- https://circleci.com/docs/guides/toolkit/api-intro/
- https://circleci.com/docs/api/v3
- https://circleci.com/changelog/deprecation-of-v1-and-v1-1-trigger-and-rerun-apis-february-1-2027/

## Important compatibility gates

1. **Token type:** CircleCI API v3 accepts personal API tokens with Bearer authentication. Do not assume a project token or the current v1.1 token is accepted. The current token must not be exposed or copied into tests.
2. **Project identity:** v1.1 uses a path such as `/project/github/Znect-god/znect-forge`. API v3 uses UUID resource IDs. Resolve the project with `GET /api/v3/projects?filter[slug]=...` using the exact slug shown in the CircleCI project settings, then validate the returned project identity before persisting its UUID.
3. **Cloud-only:** API v3 is for CircleCI Cloud. If the project is hosted on CircleCI Server, use API v2 instead.
4. **Read-only scope:** implement only GET endpoints. Do not add pipeline triggers, reruns, cancels, environment-variable access, deploy controls, or any other mutation operation.
5. **Response compatibility:** v3 uses UUIDs, structured error objects, and opaque cursor pagination. Do not reuse v1.1 response assumptions or treat cursor values as URLs.

## Proposed endpoint mapping

| Existing MCP tool | Current v1.1 behavior | Candidate v3 read path |
|---|---|---|
| `list_recent_builds` | List recent project job runs | Resolve project UUID, list `GET /api/v3/runs?filter[project_id]=...`, then list workflows for each run and jobs for each workflow |
| `get_build_details` | Get one build and nested steps/actions | Map the legacy build number to a v3 run/workflow/job by commit, branch, and timestamps; retrieve workflow and job details |
| `get_build_logs` | Read step/action output URLs | Retrieve job details and step data; verify the v3 log/artifact mechanism before implementation |

The mapping is not one-to-one: the existing API v1.1 build number is not a v3 resource ID. The adapter must not silently treat a build number as a UUID or return an unrelated job. If an unambiguous mapping cannot be established, return a clear unsupported/ambiguous result rather than guessing.

Relevant v3 reference areas:
- Projects: `GET /api/v3/projects`
- Runs: `GET /api/v3/runs`
- Workflows: `GET /api/v3/workflows?filter[run_id]=...`
- Jobs: `GET /api/v3/jobs?filter[workflow_id]=...` and `GET /api/v3/jobs/:id`
- Job artifacts: `GET /api/v3/jobs/:id/artifacts`

## Implementation sequence

1. Confirm CircleCI Cloud vs Server and inspect the token type without sharing its value.
2. Confirm the exact project slug in CircleCI project settings.
3. Verify that a dedicated least-privilege personal API token can read the project through v3. Do this manually in the user's CircleCI account; never ask the user to paste the token into chat.
4. Add a v3 client with Bearer auth, fixed host/path construction, 15-second timeout, bounded JSON bodies, strict UUID validation, cursor pagination limits, and sanitized error handling.
5. Add mocked integration tests for project resolution, pagination, run → workflow → job traversal, HTTP 401/403/404/429 handling, malformed responses, timeouts, and ambiguous build mapping.
6. Add a read-only artifact/log adapter only after confirming the v3 response schema and trusted artifact host patterns. Preserve per-action and aggregate output limits and redirect validation.
7. Run Linux CI and compare v1.1/v3 outputs against the same historical builds. Keep v1.1 as a temporary fallback until parity is demonstrated.
8. Remove v1.1 only after parity, token compatibility, and user's explicit acceptance are established.

## Security decisions

- No automatic fallback that retries a failed v3 request against v1.1; that can hide authorization or data-mapping errors.
- No token values in logs, fixtures, command output, PR descriptions, or committed files.
- No arbitrary URL input from the MCP caller.
- Keep all tools read-only.
- Do not deploy the Worker as part of migration work.
- Keep this plugin at `prototype` until live verification is completed.

## Current blockers

- The current token's type and v3 compatibility are not verified.
- The exact CircleCI project slug and project UUID are not verified.
- The v3 mapping from legacy build numbers to runs/workflows/jobs requires fixture-backed validation.
- The v3 log/artifact response shape and allowed redirect hosts need review before implementation.

