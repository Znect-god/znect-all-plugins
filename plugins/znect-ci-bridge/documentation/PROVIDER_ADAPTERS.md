# CI provider adapter architecture

> **Current architecture:** CircleCI is the sole CI provider and execution platform. Znect Build is a development/recipe repository whose CircleCI project is registered like any other CircleCI project. MCP is optional legacy compatibility, not the required ChatGPT channel.

## Shared contract

`src/providers/contract.ts` defines the provider-neutral, read-only model:

- project scope is the stable Bridge `projectId` plus a registered CircleCI `connectionId`;
- runs, workflows and jobs use provider-independent IDs and lifecycle fields;
- logs, test reports and artifact content are bounded;
- adapter methods expose reads only;
- implementations verify project/resource ownership before returning job diagnostics or content.

A job's `runId` may be absent when the provider's direct job resource does not expose a verified parent run. The adapter must not fabricate a relationship.

## CircleCI adapter

`src/providers/circleci.ts` implements `ReadOnlyCiProviderAdapter` using the existing hardened CircleCI v3 client.

Routed capabilities:
- project connection probe and recent-run listing;
- run, workflow and job details;
- normalized step/action outcomes and automatic diagnostics;
- bounded job stdout/stderr;
- structured test reports;
- artifact metadata and bounded artifact content;
- authenticated Browser JSON API and the optional legacy MCP compatibility surface.

The adapter is constructed from a server-side CircleCI token, a registered CircleCI project slug, the stable Bridge project ID and the registered connection ID. Both project ID and connection ID must match the caller's scope. Run access is verified against the selected project's paginated run collection. Workflow and job relationships are checked against the CircleCI API v3 references; missing or mismatched ownership metadata fails closed.

CircleCI v3 workflow collections are cursor-paginated. The jobs-in-workflow endpoint returns one unpaginated collection, so the adapter uses the required workflow filter and a bounded job ceiling. It rejects upstream responses that exceed the requested page/collection bounds. Job step arrays are validated against the documented fields and normalized into the shared action model. Insignificant failures are excluded from failed-step summaries and log collection.

Run metadata is normalized from API v3 references: branch, revision, commit subject and commit URL are read from the event's VCS metadata. Completion timestamps are omitted when the API does not provide one. Browser and MCP diagnostics inspect at most 40 jobs per workflow and explicitly report truncation/incompleteness. Log streams, test reports and report-like artifacts are bounded and redacted.

The legacy v1.1 `list_recent_builds`, `get_build_details` and `get_build_logs` tools are a CircleCI-only compatibility API. They use numeric `build_num` identifiers and v1.1 project-scoped endpoints. They must never translate a build number into a v3 run UUID or a CircleCI pipeline ID.

## Registering Znect Build

Znect Build is not a separate provider type. Register its CircleCI project as an ordinary project connection in `ZNECT_PROJECT_REGISTRY`:

```json
{
  "id": "znect-build",
  "name": "Znect Build",
  "repositories": [{ "fullName": "Znect-god/znect-build" }],
  "components": [],
  "connections": [{
    "id": "circleci-main",
    "provider": "circleci",
    "projectSlug": "gh/Znect-god/znect-build"
  }]
}
```

Use the exact project slug reported by CircleCI; the registry accepts the explicitly supported `gh/` and `github/` GitHub slug forms. A registry entry only records configuration. Provider availability is `not_checked` until an authenticated read probe succeeds.

The CircleCI exact-SHA validation workflow stores `ci-bridge-validation-manifest.json` and `resolved-source-sha.txt` as CircleCI job artifacts. Discover them through the normal CircleCI run/workflow/job/artifact APIs. The manifest's `circleci.pipeline_id`, `workflow_id`, and job identity are provenance fields; do not assume a pipeline ID is a v3 run UUID. The artifact remains scoped to its owning job and selected project connection.

## Read-only boundary

CI Bridge must not trigger, retry, cancel, approve or modify CircleCI pipelines, workflows, jobs, project settings, contexts or environment variables. The CircleCI configuration is executed by CircleCI itself; the Bridge only observes its results.

There is no separate Znect Build GitHub Actions adapter, no `ZNECT_BUILD_GITHUB_TOKEN` requirement and no `/api/v1/build/*` Browser API. Central validation evidence is consumed through the existing CircleCI project connection and generic read-only endpoints.

## Verification status

The CircleCI adapter source and mocked API tests exist. The new Znect Build CircleCI configuration and provenance artifact contract are committed on isolated feature branches, but the CircleCI project connection, exact-SHA pipeline, live artifact retrieval and current-HEAD test suite have not yet been verified. Historical GitHub Actions runs are not evidence for the current branch.
