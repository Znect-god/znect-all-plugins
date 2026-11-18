# Znect CI Bridge — Assistant Channel and Free Access

## Intended access model

The intended ChatGPT access path must work on the Free plan and must not require a custom MCP connection.

- CircleCI is the CI execution platform. Znect Build is the development and central recipe repository.
- CI Bridge reads CircleCI through its existing bounded, read-only CircleCI API v3 adapter.
- The private Browser JSON API exposes bounded GET-only project, run, event, correlation and aggregate-report data using a separate `WEB_ACCESS_TOKEN`.
- The dashboard can export a bounded JSON report for explicit user-reviewed handoff to ChatGPT.
- MCP remains optional/legacy compatibility functionality. It is not the required assistant channel.

## Security and provider boundaries

- CI Bridge may inspect CircleCI pipelines, workflows, jobs, logs, tests and allowlisted artifacts.
- CI Bridge must not trigger, retry, cancel, approve or modify CircleCI pipelines, jobs, project settings, contexts or environment variables.
- CircleCI runs CI Bridge source validation using the centrally maintained recipe in `Znect-god/znect-build`; the exact source commit is supplied by full SHA.
- GitHub Actions workflows are not executors. Legacy GitHub Actions files are inert.
- Do not expose a public unauthenticated report endpoint, place credentials in query strings, or ask the user to paste secrets into ChatGPT.
- Use only free/included CircleCI quotas. Do not enable paid add-ons, auto-refill, or unapproved deployment.
- No CircleCI pipeline execution, Preview deployment or Production change is authorized by this document.

## Current validation state

- Znect Build now contains a CircleCI configuration with automatic repository contract checks and an opt-in exact-SHA CI Bridge validation workflow.
- The exact-SHA workflow defaults to disabled and records source SHA, recipe SHA and CircleCI pipeline identity in a manifest.
- The Znect Build CircleCI project has not yet been configured or live-verified; no CircleCI pipeline or test suite has been run.
- The CircleCI source/test configuration is committed on an isolated Znect Build feature branch; it is not merged into `main`.
- The existing Bridge CircleCI API v3 adapter is implemented and remains the correct read-only provider path.
- A separate legacy Znect Build adapter still reads GitHub Actions. It must be migrated to CircleCI evidence or retired before it can be treated as current.
- Direct ChatGPT authentication to the private Browser API is not established. Do not infer it from the endpoint's existence or from the manual JSON download.

## Remaining work

- [ ] Verify the Znect Build CircleCI project connection and free-plan resource availability without enabling paid add-ons.
- [ ] Run Znect Build contract checks and, after explicit authorization, the CI Bridge exact-SHA validation workflow; record actual CircleCI run and artifact evidence.
- [ ] Migrate or retire the legacy GitHub Actions-based Znect Build adapter, routes, tests and runtime token requirement; use CircleCI identifiers and artifacts only.
- [ ] Verify CircleCI run, workflow, job, log, test and artifact reads through the existing Bridge CircleCI adapter.
- [ ] Establish a supported private ChatGPT-to-Browser-API authentication/handoff path for Free users; do not weaken authentication or claim automatic access without an end-to-end proof.
- [ ] Verify the existing isolated Preview only after separate explicit deployment authorization.
- [ ] Complete independent security review and release readiness.

## Explicit exclusions

- No mandatory MCP server or paid MCP distribution.
- No GitHub Actions executor or GitHub Actions run/status as CI Bridge validation evidence.
- No CI Bridge tool or API operation that triggers, retries, cancels or modifies CircleCI.
- No public unauthenticated report endpoint or query-string secrets.
- No manual sharing of Bearer tokens or private credentials.
- No Preview/Production deployment without separate explicit authorization.

## Platform limitation

A private Bearer-protected REST endpoint is not automatically callable by a ChatGPT conversation merely because the endpoint exists. Until a supported authenticated integration is proven, the dashboard's user-reviewed JSON export is the explicit fallback handoff. It does not expose the token and must not be described as automatic ChatGPT connectivity.

Custom MCP availability is not a substitute for the Free-plan requirement. The current OpenAI Help Center documents custom MCP server connections for Business and Enterprise/Edu workspaces and read/fetch support for Pro; Free is not listed. See [OpenAI Help Center — Connecting custom MCP servers in ChatGPT](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).

This does not prove that ChatGPT Free can directly authenticate to an arbitrary private REST endpoint. The direct Browser API route remains a platform capability to verify; until then, the bounded dashboard JSON download is the supported fallback.
