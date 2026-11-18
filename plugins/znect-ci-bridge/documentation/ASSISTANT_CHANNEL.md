# Znect CI Bridge — Assistant Channel and Free Access

## Intended access model

The intended ChatGPT access path must work on the Free plan and must not require a custom MCP connection.

- CircleCI is the CI execution platform and the only configured CI provider for Bridge diagnostics.
- Znect Build is the separate development repository and owner of central validation recipes and policy.
- CI Bridge reads CircleCI through its bounded, read-only API v3 adapter.
- The private Browser JSON API exposes bounded GET-only project, run, event, correlation and aggregate-report data using a separate `WEB_ACCESS_TOKEN`.
- The dashboard can export a bounded JSON report for explicit user-reviewed handoff to ChatGPT. The report labels this as a manual attachment flow, declares that automatic API access is not established, and never includes the Bearer token.
- MCP remains optional compatibility functionality. It is not the required assistant channel.

## Security and provider boundaries

- CI Bridge may inspect CircleCI pipelines, workflows, jobs, logs, tests and allowlisted artifacts.
- CI Bridge must not trigger, retry, cancel, approve or modify CircleCI pipelines, jobs, project settings, contexts or environment variables.
- CircleCI runs CI Bridge source validation using the centrally maintained recipe in `Znect-god/znect-build`; the exact source commit is supplied by full SHA.
- GitHub Actions is not used as an executor. Legacy GitHub Actions workflows in Znect Build are inert.
- The former GitHub Actions-based Znect Build adapter, routes, tests and token requirement have been retired from Bridge source (see implementation roadmap stage 53). Do not reintroduce that adapter.
- A small legacy CircleCI API v1.1 compatibility surface remains separate from the primary API v3 adapter; it must remain read-only and must never be used to infer or translate a v1.1 build number into a v3 UUID.
- Do not expose a public unauthenticated report endpoint, place credentials in query strings, or ask the user to paste secrets into ChatGPT.
- Use only free/included CircleCI quotas. Do not enable paid add-ons, auto-refill, or unapproved deployment.
- No CircleCI pipeline execution, Preview deployment or Production change is authorized by this document.

## Current validation state

- Znect Build contains a CircleCI configuration with routine repository contract checks and an opt-in exact-SHA CI Bridge validation workflow.
- The exact-SHA workflow defaults to disabled and records source SHA, recipe SHA and CircleCI pipeline/workflow/job identity in a provenance manifest.
- The Znect Build CircleCI project has not yet been configured or live-verified; no CircleCI pipeline or current-head test suite has been run.
- The CircleCI source and test configuration is committed on isolated engineering branches in both repositories; neither branch is merged into `main`.
- The Bridge source has the generic CircleCI read-only provider adapter. The retired GitHub Actions-backed Znect Build adapter is not part of the current source.
- Direct ChatGPT authentication to the private Browser API is not established. Do not infer it from the endpoint's existence or from the manual JSON download.
- The dashboard JSON export is the currently implemented explicit handoff. A separate Android/local exporter is not implemented merely because the active feature branch retains a historical Android-exporter name.
- No current-head CircleCI validation, current-branch Preview deployment, Production change, release or live CircleCI event round-trip is claimed.

## Browser API contract

- Browser API requests require `Authorization: Bearer <WEB_ACCESS_TOKEN>`; the secret is distinct from `CIRCLECI_TOKEN`.
- API routes are GET-only and CORS is disabled. Do not claim that arbitrary cross-origin browser JavaScript or a ChatGPT conversation can call the endpoint directly.
- The Worker checks the Bearer token, applies rate limiting, scopes requests to registered project/connection entries, bounds response sizes and redacts configured secrets.
- The dashboard can authenticate interactively and export a bounded report; its token is kept in tab memory and is not included in the exported report. Each failed-job diagnostic carries a normalized `test_summary` with source coverage, observed-record counts, duplicate/conflict indicators and completeness status.
- A private Bearer-protected REST endpoint is not automatically callable by ChatGPT. Until a supported authenticated integration is demonstrated end-to-end on ChatGPT Free, user-reviewed JSON export remains the honest fallback. The aggregate report now includes `assistant_handoff.mode=user_reviewed_json_attachment`, `automatic_api_access=false`, `mcp_required=false`, `bearer_token_included=false` and `test_summary_count_scope=observed_records`.
- Never weaken authentication, expose an unauthenticated report endpoint, put a token in a URL, or ask the user to paste a token into the conversation to simulate connectivity.

## Remaining work

- [ ] Verify the Znect Build CircleCI project connection and free/included resource availability without enabling paid add-ons.
- [ ] After separate explicit authorization, run Znect Build contract checks and the CI Bridge exact-SHA validation workflow; record actual CircleCI run/job/artifact evidence.
- [ ] Register the Znect Build CircleCI project in the private runtime registry without replacing existing projects, then verify its run/job/provenance-artifact reads through the generic CircleCI adapter.
- [ ] Verify live CircleCI run, workflow, job, log, test and artifact reads through the existing adapter.
- [ ] Verify real CircleCI webhook delivery and the durable inbox round-trip; synthetic test fixtures are not live delivery evidence.
- [ ] Establish a supported private ChatGPT-to-Browser-API authentication/handoff path for Free users without mandatory MCP or weakened authentication.
- [ ] Resolve the exact API v3 VCS revision response field using an authorized real run response before changing revision mapping or fixtures.
- [ ] Execute typecheck, focused tests and the complete suite through the authorized opt-in CircleCI workflow after explicit approval.
- [ ] Complete independent security review and release readiness.

## Explicit exclusions

- No mandatory MCP server or paid MCP distribution.
- No GitHub Actions executor or GitHub Actions run/status as CI Bridge validation evidence.
- No CI Bridge tool or API operation that triggers, retries, cancels or modifies CircleCI.
- No public unauthenticated report endpoint or query-string secrets.
- No manual sharing of Bearer tokens or private credentials.
- No Preview/Production deployment without separate explicit authorization.
- No claim of automatic ChatGPT Free connectivity based solely on the existence of the private API or dashboard export.

## Confirmed Free-plan / no-MCP boundary — 2026-11-18

- OpenAI's current help documentation describes custom MCP connections for Business and Enterprise/Edu; it does not establish personal Free access to custom MCP apps.
- The plugin directory is available across plans, but individual plugin/app access depends on plan, region, interface and workspace permissions. Directory availability alone does not grant a custom private API connector.
- GPT Actions can use Bearer/API-key or OAuth authentication, but creating a new custom GPT on a personal Free account is not an available implementation route.
- Therefore automatic authenticated ChatGPT Free calls to the private Browser API without MCP are not currently an established supported capability. Do not claim otherwise or weaken authentication to force it.
- The supported no-MCP free fallback remains a user-reviewed bounded JSON attachment exported from the authenticated dashboard. Automatic direct access is blocked pending an official compatible ChatGPT app/connector path and end-to-end verification on the target plan/region.

## Platform limitation

A private Bearer-protected REST endpoint is not automatically callable by a ChatGPT conversation merely because the endpoint exists. The dashboard's user-reviewed JSON download is an explicit fallback handoff, not automatic ChatGPT authentication.

Custom MCP availability is not a substitute for the Free-plan requirement. The current OpenAI Help Center documents custom MCP server connections for eligible paid/workspace plans; this project must not make MCP mandatory for its Free-plan target. Platform availability can change, so verify current OpenAI documentation before asserting plan access.

