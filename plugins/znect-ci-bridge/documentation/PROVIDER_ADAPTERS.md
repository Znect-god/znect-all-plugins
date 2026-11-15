# CI provider adapter architecture

**Status:** CircleCI adapter implemented for core MCP reads; migration remains in progress. Znect Build adapter is not implemented because its API is still a proposed contract.

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


CircleCI v3's workflow collection is cursor-paginated, but its jobs-in-workflow endpoint returns a single unpaginated `data` collection and does not define page parameters. The adapter follows cursors only for workflows and reads jobs using only the required `filter[workflow_id]` parameter, with a 200-job safety ceiling.

Every run returned by the project-filtered collection and its subsequent detail lookup must carry `references.project.id` equal to the registered CircleCI project UUID. The provider filter is not treated as proof of ownership on its own. Job detail step arrays are validated against the documented required fields; malformed executions or steps fail closed rather than silently disappearing from diagnostics. The API's `is_insignificant` flag is retained in the shared action model, and insignificant failures are excluded from failed-step summaries and log collection.

Run metadata is normalized from the v3 run shape: the run's `created_at` is its available start timestamp, and branch, revision, commit subject and commit URL are read from `references.event.attributes.vcs`. A run completion timestamp is omitted when the API does not provide one. Job timestamps use `started_at` and `ended_at`. MCP diagnostics and browser run/diagnostics endpoints inspect at most 40 jobs per workflow and explicitly report `jobs_truncated`/incomplete when the cap is reached. For diagnostic runs, unavailable or truncated log streams, structured test reports, and selected report artifacts set `report_data_incomplete`; when more than one eligible report artifact exists, only the first is included and `report_artifact_limit_reached` is set. The overall `incomplete` flag aggregates these data gaps with workflow/job/action inspection limits. A missing or invalid failed-step number also marks the diagnostic incomplete rather than silently implying its logs were inspected.

The browser JSON API and dashboard now consume the provider-neutral run/workflow/job model. The legacy v1.1 `list_recent_builds`, `get_build_details` and `get_build_logs` tools are an explicit CircleCI-only compatibility API, not part of the provider-neutral contract. They retain numeric `build_num` identifiers and the v1.1 project-scoped endpoint; they must never translate a build number into a v3 run UUID or be used as a future Znect Build integration. The log tool only follows CircleCI-supplied output URLs that pass the shared HTTPS artifact-host allowlist, applies per-action and aggregate output limits, and redacts known secrets. Automatic `diagnose_run` uses normalized `CiJobStep`/`CiJobAction` structures rather than exposing provider response objects.

## Znect Build adapter

The shared contract is intended to be implemented by a future `ZnectBuildReadOnlyAdapter`. Do not add guessed HTTP routes or assume an API exists. Before implementation, Znect Build must provide:
- a confirmed versioned API and capabilities response;
- project-scoped read-only credentials;
- signed event delivery and key rotation details;
- run/workflow/job ownership references;
- cursor pagination and documented payload/log/artifact limits;
- test report and artifact retrieval semantics.

The proposed route/schema contract is documented separately in [ZNECT_BUILD_API_CONTRACT.md](ZNECT_BUILD_API_CONTRACT.md). A registry entry with provider `znect-build` is only configuration metadata; it does not activate a working adapter.

## Migration order

1. Keep the CircleCI v3 adapter and the explicit v1.1 compatibility API isolated; preserve their distinct identifier and response contracts.
2. Preserve the browser API and dashboard's alignment with the shared model. The MCP and browser diagnostics paths both use normalized step/action/execution types; extend those types deliberately if another provider needs additional diagnostic detail.
3. Decide whether legacy v1.1 build tools should be represented as a compatibility API or replaced by provider-neutral run/job operations.
4. Implement Znect Build only after its real API and credentials are available.
5. Maintain focused compatibility tests for the three v1.1 tools, including project-scoped URLs and artifact URL validation. Add provider contract tests and provider-specific fixture tests before switching any registered project from CircleCI to Znect Build.

## Verification status

GitHub Actions run [#43581613616](https://github.com/Znect-god/znect-all-plugins/actions/runs/43581613616) passed on PR #2 commit `2840dc49c0165b220b69344ff779624a83c03268`, not on the later feature-branch head. Dependency installation, `npm audit` (zero vulnerabilities), TypeScript typecheck, 103 Vitest tests, smoke-test syntax validation and Wrangler dry-run passed for that earlier commit. The install emitted a non-fatal npm warning that install scripts for `core-js-pure`, `esbuild` and `workerd` are not covered by `allowScripts`. The subsequent compatibility-test changes and current branch head remain unverified by this run. This run did not deploy the Worker. The real CircleCI workflow-completed delivery and Znect Build API integration remain separate pending work.
