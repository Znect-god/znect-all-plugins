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

The adapter is constructed from a server-side CircleCI token, a registered CircleCI project slug, the stable Bridge project ID and the registered connection ID. Both project ID and connection ID must match the caller's scope; checking only the connection ID would be unsafe because connection IDs are unique only within a project. Run access is verified against the selected project's paginated run collection. Workflow access is verified against the selected run. Job details must expose the expected project before sensitive job data is read. If a workflow reference is supplied, it must be a valid UUID; run diagnostics additionally require it to match the workflow already verified for that run.

The browser JSON API and dashboard now consume the provider-neutral run/workflow/job model. The legacy v1.1 `list_recent_builds`, `get_build_details` and `get_build_logs` tools remain direct compatibility paths. Automatic `diagnose_run` now uses normalized `CiJobStep`/`CiJobAction` structures rather than exposing provider response objects.

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

1. Keep the CircleCI v3 adapter and legacy compatibility paths behaviourally equivalent.
2. Keep the browser API and dashboard aligned with the shared model. The MCP and browser `diagnose_run` paths both use normalized step/action/execution types; extend those types deliberately if another provider needs additional diagnostic detail.
3. Decide whether legacy v1.1 build tools should be represented as a compatibility API or replaced by provider-neutral run/job operations.
4. Implement Znect Build only after its real API and credentials are available.
5. Add provider contract tests and provider-specific fixture tests before switching any registered project from CircleCI to Znect Build.

## Verification status

The adapter and tests have been committed to the feature branch, but they have not yet been typechecked or executed. No workflow was manually triggered as part of this work.
