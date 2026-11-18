# Znect CI Bridge — free ChatGPT access channel

**Status:** authenticated Browser JSON API is implemented; a direct private report handoff still requires completion and live verification.  
**Primary CI provider:** CircleCI.  
**ChatGPT transport:** free authenticated Browser JSON API + private report handoff.  
**MCP:** optional legacy surface only; not required and not the ChatGPT communication channel.  
**Build executor for CI Bridge:** CircleCI. GitHub Actions / Znect Build are not used for CI Bridge validation.

## Request and response model

1. An authorized user requests a CI Bridge report in ChatGPT.
2. The report is obtained through the authenticated Browser JSON API, using the separate `WEB_ACCESS_TOKEN`.
3. The API reads only registered CircleCI projects and connections and returns bounded, redacted status, run, workflow, job, diagnostic, test and event data.
4. A private report handoff makes the resulting JSON available to ChatGPT without MCP and without a paid intermediary.
5. ChatGPT analyzes the report; it cannot trigger, retry, cancel or modify CircleCI pipelines through this interface.

The direct API endpoints already implemented include:
- `GET /api/v1/report?project_id=znect-forge&connection_id=circleci-main&run_limit=10&event_limit=20&after=0` — bounded aggregate report for ChatGPT, including recent CircleCI runs, failed-run diagnostic links, webhook events, correlation candidates and completeness/freshness metadata.

- `GET /api/v1/projects`
- `GET /api/v1/status?project_id=znect-forge&connection_id=circleci-main`
- `GET /api/v1/runs?project_id=znect-forge&connection_id=circleci-main&limit=10`
- `GET /api/v1/runs/{run_uuid}?project_id=znect-forge&connection_id=circleci-main`
- `GET /api/v1/diagnostics/{run_uuid}?project_id=znect-forge&connection_id=circleci-main`
- `GET /api/v1/events?after=0&limit=20`
- `GET /api/v1/event-correlations?project_id=znect-forge&connection_id=circleci-main&after=0&event_limit=20&run_limit=20`

All requests require `Authorization: Bearer <WEB_ACCESS_TOKEN>`. The token must remain private and must never be placed in a URL, report, repository file or ChatGPT message.

## CircleCI execution for CI Bridge

The root `.circleci/config.yml` in `Znect-god/znect-all-plugins` defines CI Bridge's own validation pipeline. It runs dependency installation, typecheck/unit tests, smoke-script syntax validation and Wrangler dry-run. It does not deploy and does not require CircleCI pipeline mutation credentials.

This execution pipeline is separate from the Bridge's CircleCI API adapter. The adapter is read-only and inspects registered CircleCI projects; it exposes no trigger, retry, cancel or configuration-write operations.

## Cost and safety boundaries

- Use CircleCI and Cloudflare included/free-tier quotas only; do not enable paid add-ons, paid intermediaries or automatic credit top-ups.
- Free-tier quotas are finite, not unlimited. Monitor usage in the provider dashboards.
- Keep `CIRCLECI_TOKEN`, `WEB_ACCESS_TOKEN`, and `CIRCLECI_WEBHOOK_SECRET` server-side in the Cloudflare environment; never read or disclose secret values.
- Keep report payloads private, bounded and redacted. Do not post raw logs or diagnostics in public comments or repositories.
- CircleCI read operations do not consume pipeline execution minutes. CI Bridge's own CircleCI validation pipeline does consume the account's applicable CircleCI credits/quota.
- No Production deployment is authorized by this document.

## Remaining work

- [x] Implement the bounded direct `GET /api/v1/report` assistant report endpoint. **(выполнено — source implementation; tests pending)**
- [x] Reuse Browser API authentication, rate limiting, project/connection scope, bounded JSON and secret redaction. **(выполнено — static source inspection)**
- [ ] Add focused regression tests and verify direct Browser API retrieval end-to-end without MCP or GitHub Actions.
- Confirm CircleCI pipeline execution and its free-tier usage only after an authorized run.
- Keep source implementation, executed CircleCI checks, live provider verification and deployment as separate statuses.

## Explicit exclusions

- No MCP requirement or paid MCP service.
- No GitHub Actions / Znect Build execution for CI Bridge.
- No CircleCI trigger/retry/cancel/configuration-write API in the assistant-facing Bridge.
- No paid service, add-on or auto-refill.
- No Production deployment without separate explicit authorization.
