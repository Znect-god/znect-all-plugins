# Znect CI Bridge

**Status:** `prototype`  
**Version:** `0.1.0`

Znect CI Bridge is an experimental, read-only MCP server for CircleCI build information. It runs as a Cloudflare Worker and is intended for use by an MCP-compatible client.

The complete starter source project is now included in this directory. It has not yet been deployed or tested against live CircleCI credentials.

## Architecture

```text
MCP-compatible client
        |
        v
Cloudflare Worker — Znect CI Bridge
        |
        v
CircleCI API v1.1
        |
        v
Build metadata, details, and logs
```

The bridge is scoped to `/project/github/Znect-god/znect-forge`. It is independent of the Znect Forge Android source tree and must not modify, trigger, retry, cancel, or deploy Forge pipelines.

## Read-only MCP tools

- `list_recent_builds(limit)` — latest job runs; limit 1–30.
- `get_build_details(build_num)` — build metadata and step/action statuses.
- `get_build_logs(build_num, step_index?, max_actions?)` — bounded console output.

There are deliberately no build mutation tools.

## Source layout

- `src/index.ts` — Worker entry point, authentication, MCP tools, and CircleCI adapter.
- `src/security.ts` — reusable authentication, artifact URL validation, bounded stream, redaction, and output-limit helpers.
- `test/security.test.ts` — automated security-helper regression tests.
- `package.json` — pinned direct dependency versions and scripts. The MCP/Agents toolchain uses the mutually compatible 0.33.0 / 2.4.0 releases.
- `tsconfig.json` — strict TypeScript configuration.
- `wrangler.toml` — Worker configuration; no credentials.
- Root `.github/workflows/znect-ci-bridge.yml` — isolated Linux validation workflow.

## Security controls in this prototype

- `CIRCLECI_TOKEN` and `MCP_ACCESS_TOKEN` are expected as Cloudflare Worker Secrets.
- CircleCI requests use a fixed project path and GET only; API JSON bodies are streamed with a 1 MB ceiling.
- MCP requests require a Bearer token; comparison uses fixed-length SHA-256 digests.
- The recent-build request uses CircleCI's documented `limit` query parameter.
- CircleCI API fetches have 15-second timeouts and reject redirects; artifact redirects are followed manually only after each target passes the HTTPS host allowlist.
- Log URLs must use HTTPS and an allowed artifact host suffix.
- Log response bodies are streamed with an approximately 320 KB byte ceiling before decoding, then limited to 80,000 output characters per action and 160,000 across the complete log response.
- Artifact URLs are restricted to HTTPS, approved host suffixes, and the default HTTPS port.
- The two configured Worker secret values are redacted from returned log text.
- Tokens and authorization headers are not intentionally logged or returned.
- CORS is disabled.

These are starter safeguards, not a completed security audit. Artifact host allowlisting, authentication, rate limiting, error handling, and broader log redaction still require review before sensitive use. Only the two configured Worker secrets are explicitly redacted; other secrets printed by upstream jobs may still appear.

## API compatibility

The adapter uses CircleCI API v1.1 because the available project read-only token was intended for that API. v1.1 is legacy/deprecated. Do not assume the current token works with API v2 or v3.

## Development

Use a supported Linux, macOS, or Windows environment with Node.js 22:

```bash
npm install
npm run typecheck
npm run test
npx wrangler deploy --dry-run
```

For local development use `npx wrangler dev`. Android ARM64 Termux cannot run the current Wrangler/workerd binary; use the GitHub Actions Linux workflow for validation instead.

## Cloudflare setup (not yet performed)

Configure these as Worker Secrets; never put their values in Git:

- `CIRCLECI_TOKEN`
- `MCP_ACCESS_TOKEN`

Then deploy from a supported environment after review:

```bash
npx wrangler secret put CIRCLECI_TOKEN
npx wrangler secret put MCP_ACCESS_TOKEN
npm run deploy
```

The expected routes are `/health` and `/mcp`. The health route does not prove CircleCI connectivity. The MCP route requires Bearer authentication.

## Verification status

Previously confirmed in Termux:
- Original archive extraction.
- `npm install` after direct dependency version adjustments.
- `npm run typecheck` completed successfully.
- Wrangler/workerd could not run on Android ARM64.

Confirmed in GitHub Actions on Linux (current branch):
- `npm audit --audit-level=high` reported zero vulnerabilities after dependency upgrades.
- `npm run typecheck` passed.
- `npm run test` passed (16 tests across two files).
- `npx wrangler deploy --dry-run` passed.

Previously confirmed in GitHub Actions on Linux (commit `2d35753`):
- `npm install` completed successfully.
- `npm run typecheck` completed successfully.
- `npx wrangler deploy --dry-run` completed successfully.
- This run included the streaming log byte ceiling, outbound timeouts, and configured-secret redaction in the source.

The current branch adds security-helper regression tests and an aggregate log-output budget; its new GitHub Actions run is pending.

Still pending:
- Cloudflare deployment.
- Health and authenticated MCP endpoint behavior.
- Live CircleCI API access and tool responses.
- Full security review and rate limiting.

No live credentials were used and no deployment has been performed.

## Known limitations

- Prototype only; not production-ready.
- CircleCI API v1.1 is legacy.
- No persistent storage, scheduled polling, alerts, or push notifications.
- Worker-side rate limiting is not implemented.
- `package-lock.json` is not yet committed, so transitive dependency resolution is not fully reproducible.
- Artifact redirect chains are limited to three hops and revalidated at every hop.
- Other upstream secrets may still appear in build logs.
- License remains undecided; public visibility does not grant reuse or redistribution rights.

## Relationship to Znect Forge

This plugin only reads CircleCI build information. It does not change Forge source code or CircleCI configuration and does not start or alter Forge builds. The Forge 0.8.0 freeze remains in force unless explicitly changed by the user.
