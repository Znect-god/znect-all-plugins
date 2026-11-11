# Znect CI Bridge

**Status:** `prototype`  
**Version:** `0.1.0`

Znect CI Bridge is an experimental, read-only MCP server for CircleCI build information. It runs as a Cloudflare Worker and is intended for an MCP-compatible client.

It is scoped to the fixed CircleCI project `/project/github/Znect-god/znect-forge`. It must not modify, trigger, retry, cancel, or deploy Forge pipelines.

## Read-only MCP tools

- `list_recent_builds(limit)` — latest job runs; limit 1–30.
- `get_build_details(build_num)` — build metadata and step/action statuses.
- `get_build_logs(build_num, step_index?, max_actions?)` — bounded console output.

There are no build mutation tools.

## Source layout

- `src/index.ts` — Worker entry point, authentication, and MCP tools.
- `src/circleci.ts` — fixed-origin, read-only CircleCI HTTP adapter with timeout and bounded JSON parsing.
- `src/security.ts` — authentication comparison, artifact URL validation, bounded streams, redaction, output limits, and safe redirect handling.
- `test/security.test.ts` — security helper and artifact-host/redirect tests.
- `test/circleci.test.ts` — mocked CircleCI HTTP adapter tests; no live token or network request.
- `test/worker.test.ts` — Worker HTTP, authentication, and rate-limit boundary tests.
- `package.json` and `package-lock.json` — pinned direct and resolved dependency versions.
- `wrangler.toml` — Worker configuration and rate-limit binding; no credentials.
- Root `.github/workflows/znect-ci-bridge.yml` — Linux validation workflow.

## Security controls

- `CIRCLECI_TOKEN` and `MCP_ACCESS_TOKEN` are expected as Cloudflare Worker Secrets.
- CircleCI calls use a fixed project path, GET only, a 15-second timeout, and a 1 MB streaming JSON body ceiling.
- MCP requests require a Bearer token. Comparison uses fixed-length SHA-256 digests.
- The MCP endpoint is rate-limited to 60 authenticated requests per 60 seconds per Cloudflare location. The rate-limit key is a SHA-256 digest of the configured MCP token, not the raw token.
- If the rate-limit binding is absent or unavailable, the MCP endpoint fails closed with HTTP 503.
- Cloudflare's built-in rate limiter is approximate and local to each Cloudflare location; it is not a strict global quota. Failed authentication attempts are not covered by this per-token limit.
- Artifact URLs and every redirect target must use HTTPS, a CircleCI artifact subdomain or S3-style AWS endpoint, and the default HTTPS port. Redirect chains are limited to three hops.
- Log response bodies are streamed with a byte ceiling, then limited to 80,000 characters per action and 160,000 across the complete response.
- The two configured Worker secret values are redacted, along with heuristic patterns for common Bearer/Basic credentials, GitHub/GitLab/Slack tokens, Stripe keys, Google API keys, npm tokens, AWS access-key IDs, JWTs, PEM private keys, and credential-like key/value fields. Pattern matching is best-effort and cannot guarantee detection of every upstream secret.
- CORS is disabled. No arbitrary artifact URL is accepted from the MCP caller.

The rate-limit namespace ID in `wrangler.toml` must be unique within the Cloudflare account. Check it against existing Worker rate-limit namespaces before deployment; change it if already in use.

These controls reduce risk but do not constitute a complete security audit.

## API compatibility

The adapter still uses CircleCI API v1.1. The HTTP adapter is isolated in `src/circleci.ts` and has mocked tests for fixed-origin requests, auth failures, HTTP errors, malformed/oversized JSON, and path validation. CircleCI now recommends API v3 for new Cloud integrations; v1.1 is legacy, although the announced February 1, 2027 removal applies to specific trigger/rerun endpoints and not every read endpoint. The bridge calls only read endpoints.

A researched migration plan is maintained in [`documentation/CIRCLECI_API_MIGRATION.md`](documentation/CIRCLECI_API_MIGRATION.md). Migration is not implemented yet: API v3 requires a personal API token, project UUIDs, and a verified mapping from legacy build numbers to runs/workflows/jobs. Do not assume the existing token is compatible.

## Development

Use Node.js 22 on Linux, macOS, or Windows:

```bash
npm ci
npm run typecheck
npm run test
npx wrangler deploy --dry-run
```

Android ARM64 Termux cannot run the current Wrangler/workerd binary. Use the GitHub Actions Linux workflow for Worker validation instead.

## Cloudflare setup — not yet performed

1. Check that the rate-limit namespace ID in `wrangler.toml` is unique in your Cloudflare account.
2. Configure `CIRCLECI_TOKEN` and `MCP_ACCESS_TOKEN` as Worker Secrets. Never commit them.
3. Deploy only after reviewing the remaining limitations and explicitly authorizing deployment.

Example commands for a supported environment:

```bash
npx wrangler secret put CIRCLECI_TOKEN
npx wrangler secret put MCP_ACCESS_TOKEN
npm run deploy
```

The expected routes are `/health` and `/mcp`. The health route does not prove CircleCI connectivity. The MCP route requires Bearer authentication and the rate-limit binding.

## Verification

Previously confirmed:
- The original source archive was extracted and inspected.
- TypeScript typecheck completed in Termux.
- GitHub Actions on Linux passed dependency audit, typecheck, 18 automated tests, and Wrangler dry-run on the previous validated revision.
- No live credentials were used and no Cloudflare deployment has been performed.

Confirmed in GitHub Actions on Linux for the current rate-limited revision: `npm ci` using the committed lockfile, dependency audit with zero vulnerabilities, TypeScript typecheck, all 22 tests, and Wrangler dry-run with the `MCP_RATE_LIMITER` binding.

Still pending:
- Live deployment and endpoint checks.
- Live CircleCI API integration and log retrieval.
- Review of upstream log-secret exposure and authentication-failure throttling.
- Live CircleCI API integration remains untested; mocked HTTP adapter coverage is in place.
- Implementation of the researched CircleCI API v3 migration plan, including token compatibility, project identity, and read-only response mapping.

## Known limitations

- Prototype only; not production-ready.
- CircleCI API v1.1 is legacy; the migration plan and blockers are documented.
- Rate limiting is approximate and per Cloudflare location, not a strict global limit.
- Failed Bearer-token attempts are not covered by the per-token rate limiter.
- Configured Worker secrets and common credential patterns are redacted heuristically.
- No persistent storage, scheduled polling, alerts, or push notifications.
- Wrangler/workerd is unsupported in the current Android ARM64 Termux environment.
- License remains undecided; public visibility does not grant reuse or redistribution rights.

## Relationship to Znect Forge

This plugin only reads CircleCI build information. It does not change Forge source code or CircleCI configuration and does not start or alter Forge builds. The Forge 0.8.0 freeze remains in force unless explicitly changed by the user.
