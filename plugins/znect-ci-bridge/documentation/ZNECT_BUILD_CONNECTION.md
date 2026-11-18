# Znect Build CircleCI project connection

Znect Build is the development and central recipe repository. CircleCI executes its checks and the opt-in exact-SHA CI Bridge validation workflow. CI Bridge observes those runs through the same read-only CircleCI API v3 adapter used for other registered projects; there is no separate Znect Build provider or GitHub Actions connection.

## Runtime registry configuration

Append this project to the existing JSON value supplied through `ZNECT_PROJECT_REGISTRY`; do not replace other registered projects:

```json
{
  "id": "znect-build",
  "name": "Znect Build",
  "repositories": [
    { "fullName": "Znect-god/znect-build" }
  ],
  "components": [],
  "connections": [
    {
      "id": "circleci-main",
      "provider": "circleci",
      "projectSlug": "gh/Znect-god/znect-build"
    }
  ]
}
```

Use the exact project slug shown by CircleCI. The registry accepts the explicitly supported `gh/` and `github/` GitHub slug forms. A configured entry does not prove live connectivity; provider availability remains `not_checked` until a successful authenticated read probe.

The Worker requires its existing server-side `CIRCLECI_TOKEN` for CircleCI reads and a separate `WEB_ACCESS_TOKEN` for the private Browser JSON API. Do not add `ZNECT_BUILD_GITHUB_TOKEN`; the GitHub Actions-based provider has been removed. Keep all token values out of the registry, source files, reports, URLs and chat.

## Browser API

Use the generic project-scoped CircleCI endpoints:

- `GET /api/v1/status?project_id=znect-build&connection_id=circleci-main`
- `GET /api/v1/runs?project_id=znect-build&connection_id=circleci-main&limit=10`
- `GET /api/v1/runs/{run_uuid}?project_id=znect-build&connection_id=circleci-main`
- `GET /api/v1/diagnostics/{run_uuid}?project_id=znect-build&connection_id=circleci-main`
- `GET /api/v1/report?project_id=znect-build&connection_id=circleci-main&run_limit=10&event_limit=20&after=0`

The run UUID is the CircleCI API v3 run identifier. Do not substitute the CircleCI pipeline ID, workflow ID, job ID, or legacy v1.1 build number. Use the returned workflow/job references to inspect the validation job and its artifacts.

## Validation manifest

The Znect Build CircleCI exact-SHA workflow stores `ci-bridge-validation-manifest.json` and `resolved-source-sha.txt` as job artifacts. Use the generic CircleCI artifact listing and bounded artifact retrieval methods to inspect the manifest after ownership checks. The manifest records source SHA, recipe SHA, validation commands and CircleCI pipeline/workflow/job identity. Pipeline ID and API v3 run UUID are different identifier types.

## Safety and current gate

- CircleCI reads from CI Bridge are GET-only.
- CI Bridge does not trigger, retry, cancel, approve or modify CircleCI pipelines or project settings.
- The exact-SHA validation workflow defaults to disabled and requires an explicit CircleCI pipeline parameter.
- The recipe performs dependency installation, high-severity audit, TypeScript/Vitest checks, smoke-script syntax validation and Wrangler dry-run only.
- No deploy, signing, publishing, Preview or Production operation is part of this workflow.
- CircleCI project connectivity, free-plan quota availability and live manifest retrieval remain unverified. No pipeline has been triggered by this documentation change.
