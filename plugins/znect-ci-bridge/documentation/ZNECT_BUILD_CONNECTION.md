# Znect Build read-only Browser API connection

This connection lets the authenticated CI Bridge Browser JSON API expose central Znect Build workflow metadata to ChatGPT without MCP. It is a read-only consumer; it never dispatches or changes workflows. Znect Build is also the sole intended executor for CI Bridge source validation; the Bridge repository must not define a parallel CircleCI or GitHub Actions validation workflow.

## Runtime configuration

Append this project entry to the existing JSON value supplied through `ZNECT_PROJECT_REGISTRY` (do not replace the other registered projects):

```json
{
  "id": "znect-ci-bridge",
  "name": "Znect CI Bridge",
  "repositories": [
    { "fullName": "Znect-god/znect-all-plugins" }
  ],
  "components": [
    {
      "id": "ci-bridge",
      "name": "CI Bridge",
      "repository": "Znect-god/znect-all-plugins",
      "pathPrefix": "plugins/znect-ci-bridge"
    }
  ],
  "connections": [
    { "id": "znect-build-main", "provider": "znect-build" }
  ]
}
```

Configure `ZNECT_BUILD_GITHUB_TOKEN` as a server-side secret with the minimum read permissions required to list workflow runs, jobs and run artifacts in `Znect-god/znect-build`. It must not have Actions write, workflow dispatch, repository contents write, administration, or deployment permissions. Never put its value in the registry, source files, report, or logs.

The Bridge also requires its existing `WEB_ACCESS_TOKEN` for the Browser JSON API. Keep that token separate from the central GitHub read credential and from any legacy MCP token. Preview and Production configuration are independent.

## Browser JSON API

All requests use `GET` and the Browser API Bearer token:

- `/api/v1/build/status?project_id=znect-ci-bridge&connection_id=znect-build-main`
- `/api/v1/build/runs?project_id=znect-ci-bridge&connection_id=znect-build-main&limit=10`
- `/api/v1/build/runs/{run_id}?project_id=znect-ci-bridge&connection_id=znect-build-main`
- `/api/v1/build/runs/{run_id}/validation-manifest?project_id=znect-ci-bridge&connection_id=znect-build-main`

The central run must be from `Znect-god/znect-build`, workflow `.github/workflows/central-build.yml`, on `main`, and have the expected project run-name prefix. Before exposing it, the adapter verifies an unexpired central request-validation artifact whose name binds the registered project ID, SHA-256 of the registered source repository, exact 40-character source SHA, and central run ID.

The run-details response exposes the verified source SHA, request-fingerprint artifact metadata, validation-manifest artifact metadata, workflow jobs and step outcomes. The dedicated manifest endpoint downloads only the exact run-scoped validation ZIP after ownership verification, follows one approved HTTPS Azure Blob redirect without forwarding the GitHub token, enforces compressed/decompressed size ceilings, checks ZIP CRC, and extracts only `ci-bridge-validation-manifest.json`. It validates project, registered source repository, exact source SHA, central run identity, recipe outcome and the explicit no-deploy/no-CircleCI-mutation flags. Other archive entries are never returned. Job logs and structured test reports remain unavailable.

## Safety and current gate

- Central registry target `znect-ci-bridge/worker-validation` remains `execution_enabled: false`.
- The adapter only issues authenticated GitHub API GET requests; the signed artifact-storage GET carries no GitHub Authorization header.
- ZIP parsing rejects encrypted, Zip64/oversized, duplicate, malformed or path-mismatched manifest entries; decompressed output is capped at 64 KiB.
- No workflow dispatch, build, retry, cancellation, artifact deletion, deployment, or CircleCI mutation is exposed.
- The central Node/Cloudflare Worker validation recipe currently lives on the isolated Znect Build branch `feat/ci-bridge-node-worker-recipe`, and the registry target remains `execution_enabled: false`. The recipe must be reviewed and merged to Znect Build `main` through the approved process before the adapter can verify new runs against it. Its declared checks are `npm ci`, `npm audit --audit-level=high`, `npm run check` (TypeScript plus full Vitest suite), `node --check scripts/preview-smoke-test.mjs`, and `npx --no-install wrangler deploy --dry-run`. The dry-run does not deploy.
- A configured token or registry entry does not prove live connectivity. Keep provider availability unverified until a separately authorized read-only probe succeeds.
