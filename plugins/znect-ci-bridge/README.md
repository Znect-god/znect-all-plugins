# Znect CI Bridge

**Status: `in-development` — experimental; not production-ready.**  
**Version:** `0.1.0`  
**Target:** CircleCI Cloud project `gh/Znect-god/znect-forge`.

Znect CI Bridge is a read-only Cloudflare Worker for inspecting CircleCI runs, workflows, jobs, logs, test results and artifacts. It exposes a Streamable HTTP MCP endpoint, a browser dashboard/JSON API, and a signed CircleCI webhook inbox.

> **Development notice:** Treat every feature as unverified unless this repository explicitly marks the exact check as passed. Unit tests, mocked API tests, Wrangler dry-runs and synthetic webhook tests do not prove full live integration. Do not use this prototype for production decisions or as the only CI monitoring channel.

## Current state — 2026-11-14

- Work is isolated on branch `feat/ci-bridge-circleci-webhooks` in [Znect-god/znect-all-plugins](https://github.com/Znect-god/znect-all-plugins).
- [Draft PR #5](https://github.com/Znect-god/znect-all-plugins/pull/5) remains open and unmerged. Its base is `feature/ci-bridge-test-reports`; it is not `main`.
- Isolated Cloudflare Preview: `https://feat-ci-bridge-circleci-webhooks-znect-ci-bridge.znect699.workers.dev`.
- MCP endpoint: append `/mcp`. CircleCI webhook endpoint: append `/webhooks/circleci`.
- GitHub Actions Preview run [#43581014497](https://github.com/Znect-god/znect-all-plugins/actions/runs/43581014497) passed on commit `aae93a027626c978a049dd95f7e2254e97f78c7e`: typecheck, all 103 tests, isolated Preview deployment, Preview webhook-secret installation, authenticated browser API, live diagnostics endpoint, event inbox and MCP read-only smoke checks.
- On 2026-11-12, after replacing a CircleCI API token that v3 rejected, live `list_recent_runs` returned three Forge runs and `get_job_details` returned the real `build-0-7-0` job (115 tests, 2 failed). This is verified live API read coverage.
- The later Preview smoke test verified authenticated MCP discovery/read-only connection and browser API access, plus a **synthetic** signed webhook path, deduplication, durable storage and retrieval. Synthetic delivery is not a real CircleCI workflow delivery.
- The CircleCI project webhook has since been registered successfully. CircleCI's automatic Add Webhook ping/check was accepted with a 2xx response.
- **Still pending:** a real CircleCI `workflow-completed` delivery from an ordinary Forge workflow, verification of that event in the durable inbox and retrieval through MCP. The actual event has not yet been confirmed.
- Companion private Forge Draft PR [#9](https://github.com/Znect-god/znect-forge/pull/9) adds the free on-demand ChatGPT channel and collects repository branches, commits, open PRs/issues, GitHub Actions statuses and bounded failed-job logs alongside this Bridge's CircleCI report. The report collector is not yet activated; it still needs review/merge and the private `ZNECT_CI_BRIDGE_WEB_TOKEN` Actions secret.
- Production is not deployed or authorized. Do not change Production, `main`, or merge PR #5 without explicit approval.

See [the launch and verification guide](documentation/USAGE_GUIDE.md) for the chronological action log, credential ledger, exact launch steps and remaining checks. The intended free ChatGPT access path is documented in [ASSISTANT_CHANNEL.md](documentation/ASSISTANT_CHANNEL.md).

## Capabilities

### Read-only MCP tools

- Legacy v1.1: `list_recent_builds`, `get_build_details`, `get_build_logs`.
- API v3: `check_connection`, `list_recent_runs`, `get_run_details`, `get_job_details`, `get_job_logs`, `get_job_test_results`, `list_job_artifacts`, `get_job_artifact`, `diagnose_run`.
- Event inbox: `list_recent_events`.

All tools are intended for reading only. There are no pipeline trigger, retry, cancel, configuration-write or deployment tools.

### Browser dashboard and JSON API

Open the root URL of a confirmed Worker deployment in a modern browser. The dashboard uses the separate `WEB_ACCESS_TOKEN`, held in tab memory only.

- `GET /api/v1/status`
- `GET /api/v1/runs?limit=10`
- `GET /api/v1/runs/{run_uuid}`
- `GET /api/v1/diagnostics/{run_uuid}` — bounded failed-step logs, structured tests, and a small JUnit/test-results artifact for failed jobs.
- `GET /api/v1/events?after=0&limit=20`

All JSON API requests require `Authorization: Bearer <WEB_ACCESS_TOKEN>`.

### Signed CircleCI webhook inbox

CircleCI sends signed events to `POST /webhooks/circleci`. The Worker verifies the HMAC-SHA256 signature, filters the fixed Forge project, normalizes a small field allowlist, deduplicates event IDs and stores events in a SQLite-backed Durable Object. The inbox is readable through `list_recent_events` and `GET /api/v1/events`. Its initial `after=0` read returns the newest events first; the returned cursor then lets clients request only later arrivals.

The inbox does **not** push unsolicited messages into an open ChatGPT conversation. A separate supported polling/delivery mechanism would be needed for proactive assistant notifications.

## Secrets and configuration

Never commit or disclose secret values. Configure secrets in the correct environment:

- `CIRCLECI_TOKEN` — CircleCI API access; server-side only.
- `MCP_ACCESS_TOKEN` — separate MCP client Bearer token.
- `WEB_ACCESS_TOKEN` — separate browser API Bearer token.
- `CIRCLECI_WEBHOOK_SECRET` — shared signing secret configured in CircleCI and the matching Worker Preview/Production environment.

Preview and Production secrets are independent. The current Preview workflow installs `CIRCLECI_WEBHOOK_SECRET` from the GitHub Actions secret into the named Preview. Do not infer that Production has any of these secrets.

## Development

Use Node.js 24 on a supported desktop/Linux environment:

```bash
npm ci
npm run check
node --check scripts/preview-smoke-test.mjs
npx wrangler deploy --dry-run
```

Android ARM64 Termux is not a supported Wrangler/workerd deployment environment for this project. Use the repository's Linux GitHub Actions workflow.

## Safety and limitations

- The Bridge is experimental and not production-ready.
- CircleCI Personal API tokens can have broad account permissions. The Bridge's own adapter is GET-only, but protect the token as a high-value credential.
- Secret redaction is heuristic/best-effort, not a guarantee.
- Cloudflare rate limiting is approximate and location-local, not a strict global quota.
- CircleCI may return no test results/artifacts if the original job did not publish them.
- API v3 live project resolution and the authenticated diagnostics route have passed Preview smoke checks. Unit tests cover failed-step logs, structured test results and token redaction; a real failed-run log round-trip still needs a representative live verification.
- Real CircleCI webhook workflow delivery is pending; successful webhook registration ping is not the same as a real workflow event.
- An independent security review and broader operational verification are required before any Production consideration.

## Relationship to Znect Forge

The Bridge reads CI data for `Znect-god/znect-forge`. It must not modify Forge source/configuration, trigger or retry builds, or alter Forge release/freeze decisions. Testing should use the next ordinary Forge workflow; do not create unnecessary builds solely to generate an event.
