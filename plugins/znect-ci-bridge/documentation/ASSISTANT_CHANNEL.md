# Znect CI Bridge — private ChatGPT access channel

**Status:** authenticated Browser JSON API, bounded assistant report, and dashboard JSON export are implemented in source. Regression tests are authored; execution on the current head and live Preview verification remain pending.  
**Observed CI provider:** CircleCI (read-only).  
**CI Bridge validation executor:** Znect Build; no standalone CircleCI workflow is maintained in this repository.  
**ChatGPT report source:** private authenticated Browser JSON API. **Current handoff:** user-reviewed JSON export from the existing dashboard. Direct automatic ChatGPT authentication to the private API remains an unresolved platform integration requirement.  
**MCP:** legacy/optional only; it is not required for the intended ChatGPT channel.

## Request and response model

1. The user opens the existing Znect CI Bridge dashboard and selects a registered project and CircleCI connection.
2. The dashboard uses the existing Browser API session authentication. The Bearer token remains in tab memory and is sent only in the Authorization header.
3. On explicit action, **Export assistant report** calls authenticated `GET /api/v1/report` and retrieves up to three bounded failed-run diagnostic bundles through the existing diagnostics endpoint.
4. The dashboard validates diagnostic run UUIDs, constructs same-origin GET paths, marks partial/limited results, and enforces a 600 KB total export ceiling.
5. The browser downloads one JSON report. The user reviews it and explicitly attaches it to ChatGPT. The export contains no access token.

This is a controlled manual report handoff. It does not claim that ChatGPT has authenticated directly to the private API.

## Existing read-only endpoints

- `GET /api/v1/report?project_id=...&connection_id=...&run_limit=10&event_limit=20&after=0` — bounded assistant report with recent runs, failed-run diagnostic references, webhook events, correlation candidates, freshness and completeness metadata.
- `GET /api/v1/status` — scoped provider availability and read-probe status.
- `GET /api/v1/runs`, `GET /api/v1/runs/{run_uuid}`, `GET /api/v1/diagnostics/{run_uuid}` — bounded run and diagnostic data.
- `GET /api/v1/events`, `GET /api/v1/event-correlations` — webhook event history and conservative run correlations.

All Browser API requests require `Authorization: Bearer <WEB_ACCESS_TOKEN>`. The token must never be placed in a URL, report, repository file, issue, or ChatGPT message.

## CI and provider boundaries

- CircleCI is the observed CI provider. The Bridge may read registered CircleCI runs, jobs, logs, tests, artifacts, and signed webhook events.
- The CircleCI adapter is strictly read-only: no trigger, retry, cancel, deployment, or configuration-write operations.
- CI Bridge source validation belongs in the central Znect Build system. Do not add a standalone `.circleci/config.yml`, and do not bypass Znect Build with a second executor.
- GitHub Actions workflow files in this repository remain inert/historical and are not an alternate validation path.

## Security and cost boundaries

- Keep `CIRCLECI_TOKEN`, `WEB_ACCESS_TOKEN`, and `CIRCLECI_WEBHOOK_SECRET` server-side; never retrieve or disclose their values in chat.
- Preserve Bearer authentication, rate limiting, project/connection scope checks, bounded responses, redaction, and GET-only Browser API access.
- Keep report payloads private and bounded. Do not post raw logs or diagnostics in public comments or repositories.
- Use only approved free/included quotas. Do not enable paid add-ons, auto-refill, or unapproved Production deployment.
- No Production deployment or CI execution is authorized by this document.

## Current validation state

- The dashboard export and regression-test source are committed.
- The Worker test suite, including dashboard regression tests, has not yet been executed on the exact current branch head.
- Live Preview export and real CircleCI event round-trip remain unverified.
- Direct ChatGPT authentication to the private Browser API is not established. Do not infer it from the existence of the endpoint or the manual JSON download.

## Remaining work

- [ ] Validate the exact source revision through the central Znect Build recipe after the target is correctly registered and explicitly enabled.
- [ ] Inspect real typecheck, test, dependency-audit, and Worker-bundle validation results from Znect Build.
- [ ] Verify authenticated report retrieval and dashboard export against the existing isolated Preview, without creating a new Worker or touching Production.
- [ ] Verify that exported reports remain scoped, bounded, partial-aware, and free of credentials.
- [ ] Establish a supported private ChatGPT-to-API authentication/handoff path; do not weaken authentication or claim automatic access without an end-to-end proof.
- [ ] Complete authorized release-readiness checks and prepare the finished Reporting / Diagnostics v1 for transfer to `Znect-god/znect-build`.

## Explicit exclusions

- No mandatory MCP server or paid MCP distribution.
- No standalone CircleCI validation workflow.
- No GitHub Actions bypass of Znect Build.
- No public unauthenticated report endpoint or query-string secrets.
- No CI trigger/retry/cancel/configuration-write operation in the assistant-facing Bridge.
- No Production deployment without separate explicit authorization.

## Platform limitation

A private Bearer-protected REST endpoint is not automatically callable by a ChatGPT conversation merely because the endpoint exists. Until a supported authenticated integration is proven, the dashboard's user-reviewed JSON export is the explicit fallback handoff. It does not expose the token and must not be described as automatic ChatGPT connectivity.
