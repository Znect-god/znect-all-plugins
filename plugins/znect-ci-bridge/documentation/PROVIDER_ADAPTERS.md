# CI provider adapter architecture

> **Primary ChatGPT integration:** the authenticated Browser JSON API and private report-artifact handoff. MCP is not required and is not the assistant channel. The CircleCI adapter is shared by the direct Browser API and the legacy optional MCP surface.


**Status:** CircleCI adapter implemented for core MCP reads. A source-level Znect Build adapter is now implemented against GitHub Actions' documented read-only REST API; live credential, workflow and artifact verification remains pending. There is no separate Znect Build read API.

## Shared contract

`src/providers/contract.ts` defines the provider-neutral, read-only model:

- project scope is the stable Bridge `projectId` plus a registered `connectionId`;
- runs, workflows and jobs use provider-independent IDs and lifecycle fields;
- logs, test reports and artifact content are bounded;
- adapter methods expose reads only;
- implementations must verify project/resource ownership before returning job diagnostics or content.

A job's `runId` may be absent when the provider's direct job resource does not expose a verified parent run. The adapter must not fabricate a relationship.

## CircleCI adapter

`src/providers/circleci.ts` implements `ReadOnlyCiProviderAdapter` using the existing hardened CircleCI v3 client.

Currently routed through the adapter:
- MCP `check_connection`;
- `list_recent_runs` and `get_run_details`;
- `get_job_details` and automatic `diagnose_run`;
- normalized job step/action diagnostics, job logs and structured test reports;
- artifact metadata and bounded artifact content.

The adapter is constructed from a server-side CircleCI token, a registered CircleCI project slug, the stable Bridge project ID and the registered connection ID. Both project ID and connection ID must match the caller's scope; checking only the connection ID would be unsafe because connection IDs are unique only within a project. Run access is verified against the selected project's paginated run collection. Workflow access is verified twice: it is requested using the run filter, and every returned workflow must also carry an explicit `references.run.id` equal to the selected run ID; a missing or mismatched relationship fails closed. Jobs must expose both the expected project and a valid workflow reference, as required by the CircleCI API v3 job schema, before sensitive job data is read. When a run workflow is selected, the job's workflow reference must match that already-verified workflow. Job steps are normalized from API v3's direct step records: the step's `num`, `outcome`, `phase` and `exit_code` fields are mapped into the shared action model, and parallel-execution array positions supply execution numbers.


CircleCI v3's workflow collection is cursor-paginated, but its jobs-in-workflow endpoint returns a single unpaginated `data` collection and does not define page parameters. The adapter follows cursors only for workflows and reads jobs using only the required `filter[workflow_id]` parameter, with a 200-job safety ceiling. Run and workflow collection responses are also rejected if they exceed the exact requested page size, rather than processing an upstream response that violates the API's per-endpoint page contract.

Every run returned by the project-filtered collection and its subsequent detail lookup must carry `references.project.id` equal to the registered CircleCI project UUID. The provider filter is not treated as proof of ownership on its own. Job detail step arrays are validated against the documented required fields; malformed executions or steps fail closed rather than silently disappearing from diagnostics. The API's `is_insignificant` flag is retained in the shared action model, and insignificant failures are excluded from failed-step summaries and log collection.

Run metadata is normalized from the v3 run shape: the run's `created_at` is its available start timestamp, and branch, revision, commit subject and commit URL are read from `references.event.attributes.vcs`. A run completion timestamp is omitted when the API does not provide one. Job timestamps use `started_at` and `ended_at`. MCP diagnostics and browser run/diagnostics endpoints inspect at most 40 jobs per workflow and explicitly report `jobs_truncated`/incomplete when the cap is reached. For diagnostic runs, unavailable or truncated log streams, structured test reports, and selected report artifacts set `report_data_incomplete`; when more than one eligible report artifact exists, only the first is included and `report_artifact_limit_reached` is set; report-like artifacts larger than the 500 KB inspection limit are also treated as omitted diagnostic data. The overall `incomplete` flag aggregates these data gaps with workflow/job/action inspection limits. A missing or invalid failed-step number also marks the diagnostic incomplete rather than silently implying its logs were inspected.

The browser JSON API and dashboard now consume the provider-neutral run/workflow/job model. The legacy v1.1 `list_recent_builds`, `get_build_details` and `get_build_logs` tools are an explicit CircleCI-only compatibility API, not part of the provider-neutral contract. They retain numeric `build_num` identifiers and the v1.1 project-scoped endpoint; they must never translate a build number into a v3 run UUID or be used for the central Znect Build adapter. The log tool only follows CircleCI-supplied output URLs that pass the shared HTTPS artifact-host allowlist, applies per-action and aggregate output limits, and redacts known secrets. Automatic `diagnose_run` uses normalized `CiJobStep`/`CiJobAction` structures rather than exposing provider response objects.

## Znect Build adapter

`src/providers/znect-build.ts` implements `ZnectBuildReadOnlyAdapter` against the fixed GitHub Actions repository `Znect-god/znect-build`. It uses only GET requests, a repository-scoped `ZNECT_BUILD_GITHUB_TOKEN`, fixed-origin API paths, manual redirect rejection, a 15-second timeout, bounded JSON responses, numeric resource-ID validation and safe upstream error messages.

Implemented MCP reads:
- `check_znect_build_connection`;
- `list_build_runs`;
- `get_build_run_details`;
- `list_build_run_artifacts`.

The authenticated Browser JSON API also exposes `GET /api/v1/build/status`, `GET /api/v1/build/runs` and `GET /api/v1/build/runs/{run_id}`. The dashboard's existing visual controls remain CircleCI-focused; these Build routes are available to authenticated API clients.

Run discovery is only a candidate filter. Before a run is returned, the adapter requires the exact central repository identity, workflow path `.github/workflows/central-build.yml`, the protected default branch `main`, a matching project display title, and an unexpired validation artifact whose name contains the project ID, SHA-256 fingerprint of the registered source repository, validated 40-character source commit SHA and exact run ID. The central workflow computes these values only after its registry validator accepts the request. Runs from non-main branches or other workflows are rejected. The adapter reports the validated source SHA as the project commit; the central workflow's own head SHA/branch are not substituted. Run discovery is bounded to five 100-run pages and at most 20 artifact ownership probes per call to remain within Worker subrequest budgets. The returned run `status` is the GitHub Actions workflow status/conclusion, not proof that a project build succeeded; the validation artifact's JSON content is not parsed by this first adapter iteration.

The validation artifact naming/fingerprint change is present on the isolated Znect Build branch `feat/ci-bridge-node-worker-recipe`, not merged into `main`. Until that change is merged and executed, no live run can satisfy the new ownership proof. The adapter therefore fails closed and has not been live-verified.

GitHub Actions artifacts are run-scoped, so the shared artifact model now allows `runId` without inventing a `jobId`. The adapter exposes artifact metadata only and never returns archive download URLs. GitHub Actions job logs are ZIP archives rather than per-step stdout/stderr, and the generic API does not provide a standard job test-report endpoint. Those methods return explicit unsupported errors; run details describe the capability gaps. ZIP extraction and structured report ingestion remain future work.

Before enabling the connection, provision only read permissions for Actions metadata and logs on the central repository, verify the exact registry source repository, and complete tests/live verification. A registry entry alone does not establish provider availability.

## Migration order

1. Keep the CircleCI v3 adapter and the explicit v1.1 compatibility API isolated; preserve their distinct identifier and response contracts.
2. Preserve the browser API and dashboard's alignment with the shared model. The MCP and browser diagnostics paths both use normalized step/action/execution types; extend those types deliberately if another provider needs additional diagnostic detail.
3. Decide whether legacy v1.1 build tools should be represented as a compatibility API or replaced by provider-neutral run/job operations.
4. Complete the live Znect Build adapter verification after the central fingerprint workflow change is merged through the approved path and the repository-scoped read-only credential is provisioned; do not assume a separate Build API exists.
5. Maintain focused compatibility tests for the three v1.1 tools, including project-scoped URLs and artifact URL validation. Add provider contract tests and provider-specific fixture tests before switching any registered project from CircleCI to Znect Build.

## Verification status

GitHub Actions run [#43581613616](https://github.com/Znect-god/znect-all-plugins/actions/runs/43581613616) passed on PR #2 commit `2840dc49c0165b220b69344ff779624a83c03268`, not on the later feature-branch head. Dependency installation, `npm audit` (zero vulnerabilities), TypeScript typecheck, 103 Vitest tests, smoke-test syntax validation and Wrangler dry-run passed for that earlier commit. The install emitted a non-fatal npm warning that install scripts for `core-js-pure`, `esbuild` and `workerd` are not covered by `allowScripts`. The subsequent compatibility-test changes and current branch head remain unverified by this run. This run did not deploy the Worker. The real CircleCI workflow-completed delivery and live verification of the source-implemented GitHub Actions read-only adapter for Znect Build remain pending.


## Webhook event persistence

After signature verification and event normalization, the Worker writes the event to the project-scoped Durable Object. A non-2xx storage response, a thrown binding request, or an invalid acknowledgement is treated as a transient persistence failure and returned to CircleCI as HTTP 503. The Worker returns HTTP 202 only after it receives a valid acknowledgement containing both `accepted: true` and a boolean `duplicate` field. This preserves retry behavior and prevents malformed storage responses from being reported as successful ingestion.


Event inbox reads through both MCP and the browser JSON API share a bounded response reader. The reader enforces a 60 KB streaming byte ceiling, validates the event-page envelope, cursor values and requested event count, and rejects malformed or oversized responses before returning data. Durable Object binding exceptions and non-success responses are converted to safe failures; no raw storage exception details are exposed to callers.


CircleCI v3 requests are GET-only and are not automatically retried. HTTP 401/403/404/429 and other non-success statuses are mapped to bounded, sanitized errors; `Retry-After` accepts either delta-seconds or an HTTP date and is reported to callers without being used for an implicit retry. Non-success response bodies are cancelled best-effort instead of being buffered or exposed. Job stdout/stderr 429 errors include the same parsed retry interval as JSON API errors. Network and timeout failures are normalized without reflecting runtime details.


The event inbox cursor is always derived from the SQLite `seq` column. Stored event JSON is treated as payload only and cannot override the cursor returned to clients. Initial reads return the newest bounded snapshot; subsequent reads with `after` return events whose database sequence is greater than that cursor, in ascending sequence order.


**Build ownership:** CI Bridge validation and builds are executed only through central `Znect-god/znect-build`. CircleCI is an inspected read-only provider, not the CI Bridge build executor.


## Central Znect Build adapter — ownership and evidence update

The read-only adapter validates the central repository identity, workflow path, default branch, project run-name prefix, and the unexpired request-validation artifact fingerprint. The fingerprint binds the registered project ID, SHA-256 of the expected source repository, exact source SHA and central run ID. The adapter therefore does not mistake the central workflow's own GitHub head SHA for the checked-out project SHA.

The Browser API exposes `/api/v1/build/status`, `/api/v1/build/runs` and `/api/v1/build/runs/{run_id}`. Run details include the verified project source SHA, request-fingerprint artifact metadata, the `znect-ci-bridge-validation-{run_id}` manifest artifact when present, and central job/step outcomes. Artifact contents remain private and are not downloaded/unpacked by this iteration; per-step logs and generic test reports remain unsupported. See `ZNECT_BUILD_CONNECTION.md` for the runtime registry entry and token permissions.

The central recipe and target remain on an isolated Znect Build branch with `execution_enabled: false`. These source changes do not establish live provider availability or successful artifact publication.
