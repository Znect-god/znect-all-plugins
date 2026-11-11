# Znect CI Bridge

**Status:** `prototype`  
**Version:** `0.1.0`

Znect CI Bridge is an experimental, read-only MCP server for CircleCI build information. It runs as a Cloudflare Worker and is intended for an MCP-compatible client.

It is scoped to the fixed CircleCI project `Znect-god/znect-forge`. It must not modify, trigger, retry, cancel, or deploy Forge pipelines.

## Read-only MCP tools

- `list_recent_builds(limit)` — latest job runs; limit 1–30.
- `get_build_details(build_num)` — build metadata and step/action statuses.
- `get_build_logs(build_num, step_index?, max_actions?)` — bounded console output.

There are no build mutation tools.

## Source layout

- `src/index.ts` — Worker entry point, authentication, and MCP tools.
- `src/circleci.ts` — legacy v1.1 fixed-origin, read-only HTTP adapter.
- `src/circleci-v3.ts` — new Cloud API v3 read-only client foundation; not yet connected to MCP tools pending identity and mapping verification.
- `src/security.ts` — authentication comparison, artifact URL validation, bounded streams, redaction, output limits, and safe redirect handling.
- `test/security.test.ts` — security helper and artifact-host/redirect tests.
- `test/circleci.test.ts` — mocked v1.1 adapter tests.
- `test/circleci-v3.test.ts` — mocked v3 authentication, project resolution, pagination, resource traversal, and bounded job-output tests.
- `test/worker.test.ts` — Worker HTTP, authentication, and rate-limit boundary tests.
- `package.json` and `package-lock.json` — pinned direct and resolved dependency versions.
- `wrangler.toml` — Worker configuration and rate-limit binding.
- Root `.github/workflows/znect-ci-bridge.yml` — Linux validation workflow.

## Security controls

- `CIRCLECI_TOKEN` and `MCP_ACCESS_TOKEN` are expected as Cloudflare Worker Secrets.
- CircleCI API requests are GET-only, use fixed origins, 15-second timeouts, and bounded response bodies.
- MCP requests require a Bearer token. Comparison uses fixed-length SHA-256 digests.
- The MCP endpoint is rate-limited to 60 authenticated requests per 60 seconds per Cloudflare location. The rate-limit key is a SHA-256 digest of the configured MCP token, not the raw token.
- If the rate-limit binding is absent or unavailable, the MCP endpoint fails closed with HTTP 503.
- Cloudflare's built-in rate limiter is approximate and local to each Cloudflare location; it is not a strict global quota. Failed authentication attempts are not covered by this per-token limit.
- Artifact URLs and every redirect target must use HTTPS, a CircleCI artifact subdomain or S3-style AWS endpoint, and the default HTTPS port. Redirect chains are limited to three hops.
- Log response bodies are streamed with a byte ceiling, then limited to 80,000 characters per action and 160,000 across the complete response.
- Configured Worker secrets and common credential patterns are redacted heuristically. This is best-effort and cannot guarantee detection of every upstream secret.
- CORS is disabled. No arbitrary artifact URL is accepted from the MCP caller.

The rate-limit namespace ID in `wrangler.toml` must be unique within the Cloudflare account. Check it before deployment.

These controls reduce risk but do not constitute a complete security audit.

## API compatibility

The existing MCP tools still use the legacy CircleCI API v1.1 adapter. A new API v3 client foundation has been added for CircleCI Cloud: Bearer authentication, UUID validation, project slug resolution, cursor-paged runs, run → workflow → job traversal, and bounded stdout/stderr retrieval.

The v3 client is not connected to the MCP tools yet. The old v1.1 build number is not a v3 UUID, and the exact Forge project slug, hosting type, token compatibility, and historical build mapping have not been verified. See [the migration plan](documentation/CIRCLECI_API_MIGRATION.md).

CircleCI Server does not yet support API v3; if Forge is hosted on Server, API v2 is the correct target.

## Development

Use Node.js 22 on Linux, macOS, or Windows:

```bash
npm ci
npm run typecheck
npm run test
npx wrangler deploy --dry-run
```

Android ARM64 Termux cannot run the current Wrangler/workerd binary. Use GitHub Actions Linux workflow for Worker validation instead.

## Cloudflare setup — not yet performed

1. Check that the rate-limit namespace ID in `wrangler.toml` is unique in your Cloudflare account.
2. Configure `CIRCLECI_TOKEN` and `MCP_ACCESS_TOKEN` as Worker Secrets. Never commit them.
3. Deploy only after reviewing remaining limitations and explicitly authorizing deployment.

No live CircleCI token or endpoint has been used, and no Cloudflare deployment has been performed.

## Known limitations

- Prototype only; not production-ready.
- Live CircleCI Cloud/Server hosting, token compatibility, and project identity are unverified.
- The v3 client foundation is tested with mocked HTTP responses only.
- Legacy build-number mapping and MCP tool migration remain pending.
- Rate limiting is approximate and per Cloudflare location, not a strict global limit.
- Failed Bearer-token attempts are not covered by the per-token rate limiter.
- Log redaction is best-effort.
- No persistent storage, scheduled polling, alerts, or push notifications.
- Wrangler/workerd is unsupported in the current Android ARM64 Termux environment.
- License remains undecided; public visibility does not grant reuse or redistribution rights.

## Relationship to Znect Forge

This plugin only reads CircleCI build information. It does not change Forge source code or CircleCI configuration and does not start or alter Forge builds. The Forge 0.8.0 freeze remains in force unless explicitly changed by the user.
