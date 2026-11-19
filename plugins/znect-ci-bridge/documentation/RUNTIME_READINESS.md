# CI Bridge runtime readiness

**Scope:** read-only verification of the deployed Cloudflare Worker and its CircleCI connection. This document does not authorize deployment, secret changes, webhook registration, or Production changes.

## What source inspection confirms

- The Worker reads the non-secret project registry from `ZNECT_PROJECT_REGISTRY`.
- If that optional binding is absent, `loadProjectRegistry()` deliberately loads an empty registry. A healthy Worker can therefore report zero registered projects.
- The CircleCI adapter requires `CIRCLECI_TOKEN`.
- The authenticated Browser JSON API requires `WEB_ACCESS_TOKEN` and the `MCP_RATE_LIMITER` binding.
- The event inbox and correlation routes require the `EVENT_STORE` Durable Object binding.
- The MCP transport also requires `MCP_ACCESS_TOKEN`.
- Signed webhook ingestion requires `CIRCLECI_WEBHOOK_SECRET`; the same secret must be configured on the CircleCI webhook side by an authorized operator. CI Bridge itself does not create or change CircleCI webhook settings.
- `wrangler.toml` declares `MCP_RATE_LIMITER` and `EVENT_STORE`; secrets and the registry are configured separately in the Cloudflare Worker environment.

## Required non-secret registry shape

The registry is JSON, version 1, limited to 32 KiB and 100 projects. Each CircleCI connection requires a unique project slug in `gh/owner/repo` or `github/owner/repo` form. The registry contains identifiers and repository metadata only; never put credentials in it.

Example structure (replace the illustrative IDs and repository with the actual registered project details; do not paste secrets here):

```json
{
  "version": 1,
  "projects": [
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
  ]
}
```

Do not overwrite an existing registry with this example. Merge a verified entry into the existing registry while preserving every existing project and connection. Confirm the actual CircleCI slug in the CircleCI project before registering it.

## Read-only verification sequence

1. In the correct Cloudflare environment (Preview first), verify that the required bindings/secrets exist by **name only**. Do not display, export, or paste secret values.
2. Confirm `ZNECT_PROJECT_REGISTRY` parses and contains the intended project and a unique CircleCI connection. Do not modify Production.
3. Authenticate to the Browser API using the dashboard's secure session. Never put `WEB_ACCESS_TOKEN` in a URL, exported report, source file, or ChatGPT message.
4. Call `GET /api/v1/projects` and confirm the intended project and connection appear.
5. Call `GET /api/v1/status?project_id=<registered-project-id>&connection_id=<registered-connection-id>`. A successful response must show `connected: true`, `provider: circleci`, and `permissions: read-only`.
6. Only after status succeeds, inspect the bounded runs/report/diagnostics and allowlisted artifacts endpoints. Record response status, timestamps, project/connection IDs and redacted outcomes; do not record tokens or presigned artifact URLs.
7. Test the event inbox only after confirming the Durable Object binding. A synthetic signed event tests Worker validation/storage, not real CircleCI webhook delivery. Real delivery requires a separately authorized CircleCI webhook configuration and a real signed event.

## Interpretation

- `/health` is not proof of CircleCI connectivity. It is intentionally non-sensitive and may be healthy with an empty project registry.
- `/api/v1/projects` verifies registry visibility, not provider credentials.
- `/api/v1/status` is the read-only CircleCI connectivity probe.
- A successful CircleCI recipe status in the Znect Build repository validates the recipe-branch CI path; it does not prove that the deployed Worker has the required runtime secrets, registry or live API connectivity.
- The last historical Preview evidence recorded in `SECURITY_REVIEW.md` applies to an older commit and must not be represented as validation of the current `ci-bridge` head.

## Current execution limitation

The current development session has GitHub repository read/write access but no Cloudflare Worker environment/secret inspection or deployment control and no direct CircleCI API credential. Therefore runtime bindings, secret presence, live API reads and real webhook delivery cannot be truthfully marked verified from this session. No attempt should be made to bypass that boundary by exposing credentials or weakening authentication.
