# Znect CI Bridge — free ChatGPT access channel

**Status:** authenticated Browser JSON API and browser-dashboard assistant-report export are implemented in source; CircleCI execution and live Preview export remain pending. Android exporter is an optional companion path; its build/device verification also remains pending.  
**Primary CI provider:** CircleCI.  
**Report source:** private authenticated Browser JSON API. **ChatGPT handoff:** user-reviewed JSON download from the existing web dashboard or explicit Android Sharesheet export; direct automatic ChatGPT authentication is not yet supported.  
**MCP:** optional legacy surface only; not required and not the ChatGPT communication channel.  
**Build executor for CI Bridge:** CircleCI. GitHub Actions / Znect Build are not used for CI Bridge validation.

## Request and response model

1. The user opens the existing Znect CI Bridge web dashboard, enters the Browser API Bearer token for the session, and selects a registered project and CircleCI connection. The token remains in tab memory only.
2. On explicit action, **Export assistant report** calls the authenticated `GET /api/v1/report` endpoint and retrieves up to three separately bounded diagnostics for failed runs.
3. The dashboard validates each diagnostic run ID before requesting it, keeps all calls GET-only and same-origin, marks incomplete/limited diagnostics in the exported JSON, and enforces a 600 KB total export ceiling.
4. The browser downloads a JSON report. The user reviews it and explicitly attaches/shares it into ChatGPT; no token is included in the report or URL.
5. The optional Android exporter provides the same private report source through Android Sharesheet. Neither path authenticates a ChatGPT session or establishes automatic ChatGPT-to-API access. The interface exposes no CircleCI trigger, retry, cancel or configuration-write operation.

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

## Current source validation state — 2026-11-18

- Browser dashboard assistant export: source and regression test are added; CircleCI test execution and a live Preview download have not yet been verified.
- Android exporter: 48 JVM test cases are authored (8 origin, 21 report-schema/privacy, 3 Bearer-token policy, 11 CircleCI connection-status, 5 report-file expiry); none has been executed. APK assembly and device verification remain pending.
- Worker Browser API regression source additionally covers token separation, authenticated GET-only enforcement, scoped CircleCI status and safe handling of an unavailable provider read probe. Worker suite execution remains pending on the current branch.
- The Android client now checks the selected connection ID against the returned report, requires JSON media type, writes report files through temporary-file finalization, and suppresses late Activity UI callbacks after teardown.
- Integer bounds for the event cursor use exact decimal comparison, including the JavaScript maximum-safe-integer edge.
- CircleCI is the only current executor for CI Bridge development/validation. No CircleCI result is verified on the current head; no pipeline was manually triggered.

## Remaining work

- [x] Implement the bounded direct `GET /api/v1/report` assistant report endpoint. **(выполнено — source implementation; regression source added, execution pending)**
- [x] Reuse Browser API authentication, rate limiting, project/connection scope, bounded JSON and secret redaction. **(выполнено — static source inspection)**
- [x] Add focused regression tests for authentication, query bounds, successful aggregation, event-to-run correlation, provider-field secret redaction and event-store failure fallback. **(выполнено — test source added; execution pending)**
- [ ] Run the dashboard UI regression tests through the configured CircleCI validation pipeline and verify a real assistant-report download against the existing Preview.
- [ ] Verify the downloaded JSON contains bounded failed-run diagnostics, correctly marks partial data, and never includes the Browser API token.
- [ ] Verify direct Browser API retrieval end-to-end without MCP or GitHub Actions.
- Confirm CircleCI pipeline execution and its free-tier usage only after an authorized run.
- Keep source implementation, executed CircleCI checks, live provider verification and deployment as separate statuses.

## Explicit exclusions

- No MCP requirement or paid MCP service.
- No GitHub Actions / Znect Build execution for CI Bridge.
- No CircleCI trigger/retry/cancel/configuration-write API in the assistant-facing Bridge.
- No paid service, add-on or auto-refill.
- No Production deployment without separate explicit authorization.

## ChatGPT platform limitation and manual handoff

Current OpenAI documentation confirms that the Apps SDK is built on MCP. Custom MCP server connections are documented for Business and Enterprise/Edu workspaces and are web-only. This does not provide a direct custom REST/Bearer connector for a personal Free account.

Accordingly:
- The private Browser JSON API remains the canonical report source and stays Bearer-protected. The Android app can authenticate to that API, but it cannot provide or inspect ChatGPT's own session credentials.
- Direct automatic ChatGPT retrieval is currently blocked by the available account/platform integration path; do not claim it is working.
- The existing browser dashboard now includes a bounded assistant-report download action on branch `feature/ci-bridge-android-exporter`; it is a source change pending CircleCI and live Preview verification.
- An isolated native Android exporter source prototype also exists in `plugins/znect-ci-bridge/android-exporter/` on branch `feature/ci-bridge-android-exporter`.
- It stores the Bearer credential locally using Android Keystore AES-GCM, requests only the bounded read-only report over HTTPS, validates the CircleCI report schema and shares a private JSON file only after an explicit Sharesheet action.
- This is a manual secure handoff, not direct automatic ChatGPT API access. No credential is placed in chat, URL, report, source or logs.
- Source implementation is not a verified APK: Gradle tests/build, device installation, live API request, CircleCI pipeline and deployment have not been run.

Official platform references:
- https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
- https://help.openai.com/en/articles/12515353-building-with-the-apps-sdk
