# Znect Build provider API contract for CI Bridge

**Status: legacy proposal — not an existing or deployed API.**  
**Owner:** Znect Build.  
**Consumer:** the single shared Znect CI Bridge.  
**Access model:** project-scoped, read-only for CI Bridge.

This document defines the minimum API surface the Bridge needs. It does not claim that these endpoints already exist. The internal build engine is an implementation detail of Znect Build and must not leak into the Bridge contract.

## Integration principles

- Znect Build is the canonical source of build lifecycle state for projects migrated to it.
- A project is registered once in the Bridge registry and is associated with one Znect Build connection.
- Bridge credentials are held in runtime secrets, never in `ZNECT_PROJECT_REGISTRY`.
- Authorization is scoped to registered project IDs and read-only operations.
- Build source code remains in each project's own repository. Znect Build is the build infrastructure, not a source monorepo.
- Events are delivered by signed push/webhook where available. Polling is a separate fallback and must be labelled as polling, not represented as push delivery.
- Every response carries stable IDs and explicit project ownership so the Bridge can reject cross-project references.
- All collections use bounded cursor pagination. All text and binary metadata responses have explicit size ceilings.

## Proposed API surface

The route names below are illustrative contract names. They must be agreed with the Znect Build implementation before the adapter makes network requests.

| Capability | Proposed operation | Required behaviour |
|---|---|---|
| Health/capabilities | `GET /api/v1/bridge/capabilities` | Advertise API version, event modes, pagination and supported data types. |
| Project access | `GET /api/v1/bridge/projects/{project_id}` | Confirm that the credential can read this exact project. |
| Run listing | `GET /api/v1/bridge/projects/{project_id}/runs?limit=&cursor=` | Return recent runs, next cursor and project ID. |
| Run details | `GET /api/v1/bridge/projects/{project_id}/runs/{run_id}` | Return lifecycle state, source repository/commit, branch, component and timestamps. |
| Workflows | `GET /api/v1/bridge/projects/{project_id}/runs/{run_id}/workflows` | Return workflows belonging to that run. |
| Jobs | `GET /api/v1/bridge/projects/{project_id}/workflows/{workflow_id}/jobs` | Return jobs with project, run and workflow ownership references. |
| Job details | `GET /api/v1/bridge/projects/{project_id}/jobs/{job_id}` | Return job metadata and ownership references. |
| Logs | `GET /api/v1/bridge/projects/{project_id}/jobs/{job_id}/logs` | Support bounded stream/step selection or a bounded log cursor. |
| Test reports | `GET /api/v1/bridge/projects/{project_id}/jobs/{job_id}/tests` | Return normalized test outcomes and/or bounded report content. |
| Artifacts | `GET /api/v1/bridge/projects/{project_id}/jobs/{job_id}/artifacts` | Return metadata only; do not expose reusable signed URLs. |
| Artifact content | `GET /api/v1/bridge/projects/{project_id}/jobs/{job_id}/artifacts/{artifact_id}/content` | Stream bounded content through authenticated API, with content type and size. |

## Normalized lifecycle event

A signed event envelope should include:

- `event_id`: globally unique immutable delivery/event ID;
- `event_type`: run/workflow/job lifecycle event;
- `occurred_at`: ISO-8601 UTC timestamp;
- `project_id`, `run_id`, optional `workflow_id` and `job_id`;
- `status` and optional `outcome`;
- `source.repository`, `source.commit_sha`, optional `source.branch`;
- optional `component_id`;
- optional schema version.

The Bridge verifies the signature over the exact raw request body before parsing. It enforces a payload limit, timestamp tolerance, event-ID deduplication, supported event types and registered project mapping. Unknown projects are acknowledged or rejected according to the final retry contract; they are never routed to a default project.

## Security and operational requirements

1. **Project-scoped authorization:** every read operation is authorized against the path's project ID. A credential with access to one project must not read another project's resources by substituting UUIDs.
2. **Ownership references:** run, workflow, job and artifact responses include enough immutable references to prove their parent chain. The Bridge fails closed if a reference is absent or inconsistent.
3. **Read-only scope:** the Bridge credential cannot trigger, cancel, retry, approve, mutate configuration, alter secrets, publish releases or deploy.
4. **Pagination:** opaque cursors, stable ordering, maximum page size, explicit next cursor, and safe handling of repeated cursors.
5. **Bounds:** documented maximum request/response sizes, log bytes, test report bytes, artifact sizes and nested collection depth.
6. **Deduplication:** event IDs are unique within a documented retention period; retries return an idempotent acknowledgement.
7. **Retention:** define lifecycle event retention and log/artifact availability independently. Bridge inbox retention must not be confused with source build retention.
8. **Redaction:** secrets must not be embedded in normal event payloads or logs. The Bridge still applies defensive redaction.
9. **Versioning:** additive fields are backward compatible; breaking changes require an explicit API version transition.
10. **Observability:** responses expose request/correlation IDs and safe error codes without leaking credentials or internal engine details.

## Adapter readiness checklist

- [ ] Znect Build API owner confirms the route and schema contract.
- [ ] Read-only project-scoped credential issuance is available.
- [ ] Signed event delivery and key rotation are specified.
- [ ] Project/run/workflow/job ownership references are implemented.
- [ ] Cursor pagination and payload/log/artifact limits are documented.
- [ ] Test report and artifact retention/availability are documented.
- [ ] Contract fixtures and integration tests are available.
- [ ] Bridge adapter passes ownership, signature, pagination, redaction and size-limit tests.

Until these items are satisfied, the Bridge must report the Znect Build connection as configured-but-not-implemented and must not attempt guessed endpoints.


## Architecture correction — 2026-11-18

Znect Build's central executor is GitHub Actions. The Bridge should not implement the illustrative `/api/v1/bridge/*` routes above unless the Znect Build project explicitly decides to ship that separate API. The current integration direction is to use GitHub's documented read-only Actions REST endpoints against the fixed central repository `Znect-god/znect-build`:

- workflow-run collection and run detail;
- jobs belonging to a workflow run;
- bounded job log download;
- artifacts belonging to a workflow run.

This is a GitHub Actions provider integration, not a custom Znect Build API. The provider adapter must preserve the distinction between run-level artifacts and job-level resources, must not invent per-step log streams or test reports where GitHub does not expose them, and must enforce repository ownership, read-only permissions, redirect validation, pagination and response-size limits. This correction supersedes the illustrative route proposal above.
