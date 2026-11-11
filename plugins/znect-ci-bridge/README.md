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
- `package.json` — pinned direct dependency versions and scripts.
- `tsconfig.json` — strict TypeScript configuration.
- `wrangler.toml` — Worker configuration; no credentials.
- Root `.github/workflows/znect-ci-bridge.yml` — isolated Linux validation workflow.

## Security controls in this prototype

- `CIRCLECI_TOKEN` and `MCP_ACCESS_TOKEN` are expected as Cloudflare Worker Secrets.
- CircleCI requests use a fixed project path and GET only.
- MCP requests require a Bearer token.
- CircleCI and artifact fetches have 15-second timeouts and reject redirects.
- Log URLs must use HTTPS and an allowed artifact host suffix.
- Log response bodies are streamed with an approximately 320 KB byte ceiling before decoding, then limited to approximately 80,000 output characters per action.
- Tokens and authorization headers are not intentionally logged or returned.
- CORS is disabled.

These are starter safeguards, not a completed security audit. Artifact host allowlisting, authentication, rate limiting, error handling, and log redaction still require review before sensitive use.

## API compatibility

The adapter uses CircleCI API v1.1 because the available project read-only token was intended for that API. v1.1 is legacy/deprecated. Do not assume the current token works with API v2 or v3.

## Development

Use a supported Linux, macOS, or Windows environment with Node.js 22:

```bash
npm install
npm run typecheck
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

Changes in this repository import:
- Direct dependency versions are pinned to versions that resolved locally.
- Log retrieval streams with a byte ceiling rather than downloading an unlimited body before truncation.
- CircleCI and artifact requests have explicit timeouts.
- A separate GitHub Actions workflow checks this plugin on Linux and performs a Wrangler dry-run.

Still pending:
- New Linux workflow result and fresh Linux build.
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
- Upstream build logs may contain secrets if CI jobs print them.
- License remains undecided; public visibility does not grant reuse or redistribution rights.

## Relationship to Znect Forge

This plugin only reads CircleCI build information. It does not change Forge source code or CircleCI configuration and does not start or alter Forge builds. The Forge 0.8.0 freeze remains in force unless explicitly changed by the user.
