# Znect CI Bridge

**Status: `in-development` — experimental; not production-ready.**  
**Version:** `0.1.0`  
**Current CI diagnostics provider:** CircleCI Cloud (read-only; live API verification remains separate from source implementation). Projects and CI connections are explicitly registered; no project is injected as a default. Znect Build remains the separate central build system for other Znect application builds; CI Bridge source validation and development checks run through CircleCI.  
**Architecture:** one Bridge instance with a validated multi-project registry and a provider-neutral, read-only CircleCI adapter. CircleCI also runs CI Bridge's own validation pipeline; that execution role is separate from the Bridge's read-only CircleCI diagnostics API.

Znect CI Bridge is a free-tier-first, read-only Cloudflare Worker for collecting CI events and inspecting CircleCI runs, workflows, jobs, logs, test results and artifacts. Its project registry separates Znect products, components, repositories and CI connections. The supported ChatGPT access path is the free authenticated Browser JSON API plus a private report handoff. MCP is not required and GitHub Actions / Znect Build are not used to execute CI Bridge validation or the ChatGPT report request.

> **Development notice:** Treat every feature as unverified unless this repository explicitly marks the exact check as passed. Unit tests, mocked API tests, Wrangler dry-runs and synthetic webhook tests do not prove full live integration. Do not use this prototype for production decisions or as the only CI monitoring channel.

## Current state — 2026-11-18

- Historical integration branch: `feature/ci-bridge-test-reports`. Current isolated engineering branch: `feature/ci-bridge-android-exporter` in [Znect-god/znect-all-plugins](https://github.com/Znect-god/znect-all-plugins). The previous webhook-ingress branch is its engineering base.
- PR #5 was merged into this feature branch; it was not merged into `main`. PR #2, #4 and #6 remain separate draft workstreams and must not be merged without approval.
- Isolated Cloudflare Preview: `https://feat-ci-bridge-circleci-webhooks-znect-ci-bridge.znect699.workers.dev`.
- Legacy MCP route: `/mcp` remains in the experimental source but is not the supported ChatGPT channel and is not required. CircleCI webhook endpoint: append `/webhooks/circleci`.
- GitHub Actions Preview run [#43581014497](https://github.com/Znect-god/znect-all-plugins/actions/runs/43581014497) passed on commit `aae93a027626c978a049dd95f7e2254e97f78c7e`: typecheck, all 103 tests, isolated Preview deployment, Preview webhook-secret installation, authenticated browser API, live diagnostics endpoint, event inbox and MCP read-only smoke checks.
- On 2026-11-12, after replacing a CircleCI API token that v3 rejected, live `list_recent_runs` returned three Forge runs and `get_job_details` returned the real `build-0-7-0` job (115 tests, 2 failed). This is verified live API read coverage.
- The later Preview smoke test verified authenticated MCP discovery/read-only connection and browser API access, plus a **synthetic** signed webhook path, deduplication, durable storage and retrieval. Synthetic delivery is not a real CircleCI workflow delivery.
- On 2026-11-15, the feature branch gained a version-1 project registry, validation tests, allowlisted multi-project CircleCI webhook normalization, and project-specific event inbox routing. Subsequent commits removed the Forge-only implicit default, exposed the `list_projects` catalog, separated project registration / CI configuration / provider availability, and added explicit CircleCI connection selection across MCP, browser API and dashboard. A project with multiple CircleCI connections now requires `connection_id`; a successful read probe is the only state that reports provider availability as `available`. The current feature-branch head has not been typechecked or tested. A separate isolated branch `test/ci-bridge-webhook-ingress-contract` now contains expanded webhook ingress tests, conservative event-to-run correlation in MCP and browser API, and a dashboard event panel; that branch has not been typechecked, tested, deployed, or opened as a PR. The registry has no Forge-only default and permits projects without CI connections. Multiple CircleCI connections are selected explicitly by connection ID; omitting the ID is supported only when exactly one CircleCI connection exists. The project catalog separates registration status, CI configuration status, and provider availability (not checked until a read probe succeeds). Multi-project selection now reaches the legacy v1.1 tools, the v3 run/job/log/test/artifact/diagnostic MCP tools, and the read-only browser API. Run ownership is checked through the selected project's paginated run collection (bounded to 400 recent runs); job detail resources must expose matching project references, and run traversal also verifies workflow ownership. A provider-neutral read-only adapter is now implemented for CircleCI and is used by MCP connection checks plus the core v3 list-runs, run-details, job-details, logs, test-report and artifact tools. The automatic `diagnose_run` path now uses normalized adapter methods and normalized job step/action data. The browser JSON API (`/status`, `/runs`, run details and `/diagnostics`) now uses the same provider-neutral adapter and response model as MCP. The dashboard was updated to consume normalized run/workflow/job fields. Legacy v1.1 build tools still use their existing CircleCI client as a compatibility path. A legacy illustrative Znect Build API contract remains documented as superseded; the actual adapter uses GitHub Actions' read-only REST API. GitHub Actions run [#43581613616](https://github.com/Znect-god/znect-all-plugins/actions/runs/43581613616) passed on PR #2 commit `2840dc49c0165b220b69344ff779624a83c03268` (not the later feature-branch head). It completed dependency installation, `npm audit` (0 vulnerabilities), TypeScript typecheck, 103 Vitest tests, smoke-test syntax validation and Wrangler dry-run. The install emitted a non-fatal npm warning that install scripts for `core-js-pure`, `esbuild` and `workerd` are not covered by `allowScripts`. The later compatibility-test changes and current branch head have not been validated by that run; no current-head check run is recorded. No production deployment was performed.
- The three legacy v1.1 tools are explicitly retained as a CircleCI-only compatibility API. They use numeric `build_num` values and project-scoped v1.1 URLs; they are separate from the provider-neutral v3 adapter and must not be reused for Znect Build.
- The CircleCI project webhook has since been registered successfully. CircleCI's automatic Add Webhook ping/check was accepted with a 2xx response.
- **Still pending:** a real CircleCI `workflow-completed` delivery from an ordinary Forge workflow, verification of that event in the durable inbox and retrieval through MCP. The actual event has not yet been confirmed.
- Companion private Forge Draft PR [#9](https://github.com/Znect-god/znect-forge/pull/9) adds the free on-demand ChatGPT channel and collects repository branches, commits, open PRs/issues, GitHub Actions statuses and bounded failed-job logs alongside this Bridge's CircleCI report. The report collector is not yet activated; it still needs review/merge and the private `ZNECT_CI_BRIDGE_WEB_TOKEN` Actions secret.
- Production is not deployed or authorized. Do not change Production, `main`, or merge PR #5 without explicit approval.

See [the launch and verification guide](documentation/USAGE_GUIDE.md) for the chronological action log, credential ledger, exact launch steps and remaining checks. The [provider adapter architecture](documentation/PROVIDER_ADAPTERS.md) describes the implemented CircleCI adapter and remaining migration. The [Znect Build API contract](documentation/ZNECT_BUILD_API_CONTRACT.md) is retained as a superseded proposal; the implemented adapter uses the GitHub Actions API instead. The intended free ChatGPT access path is documented in [ASSISTANT_CHANNEL.md](documentation/ASSISTANT_CHANNEL.md).

## Isolated development — 2026-11-18

The branch [`test/ci-bridge-webhook-ingress-contract`](https://github.com/Znect-god/znect-all-plugins/tree/test/ci-bridge-webhook-ingress-contract) contains expanded signed-webhook regression coverage, bounded HMAC signature parsing, conservative webhook-to-run correlation through MCP and the authenticated Browser API, and a dashboard event panel. Correlation candidates require an exact commit SHA, no conflicting branch, and proximity to the run execution interval; a CircleCI pipeline ID is never assumed to be a v3 run UUID. This is isolated work based on `c72a67e33177985a57f4d9d6180e4e8d8a970edb`, not a merge or release. The current branch head has not been typechecked or tested, deployed, or verified with a real CircleCI delivery.

The 2026-11-18 source review aligned API v3 project resolution with both explicitly registered CircleCI GitHub slug forms (`gh/` and `github/`) and tightened workflow-link validation to the default HTTPS port. Regression tests were added but have not been executed on the current head. The active branch remains isolated and undeployed.

## Living implementation roadmap

The maintained [implementation roadmap](documentation/IMPLEMENTATION_ROADMAP.md) tracks what is already implemented and what remains. Completed source items are marked **(выполнено)**; validation, real-provider verification, deployment and release gates are tracked separately. Update the roadmap whenever implementation changes.

## Capabilities

### Optional legacy MCP surface (not the ChatGPT access channel)

The MCP endpoint is not required for operation, is not used by the free ChatGPT handoff, and must not be treated as the product's integration channel. The supported ChatGPT path is described in `documentation/ASSISTANT_CHANNEL.md`.

- Legacy CircleCI v1.1 compatibility API: `list_recent_builds`, `get_build_details`, `get_build_logs` (numeric build numbers; separate from v3 UUID run IDs).
- Registry: `list_projects` — project registration, CI configuration, and connection catalog; provider availability remains `not_checked` until probed.
- CircleCI API v3: `check_connection`, `list_recent_runs`, `get_run_details`, `get_job_details`, `get_job_logs`, `get_job_test_results`, `list_job_artifacts`, `get_job_artifact`, `diagnose_run`.
- Znect Build / GitHub Actions: `check_znect_build_connection`, `list_build_runs`, `get_build_run_details`, `list_build_run_artifacts`.
- Event inbox: `list_recent_events`, `correlate_recent_events`.

All project-scoped CircleCI tools require `project_id` and accept an optional `connection_id`. If a project has exactly one CircleCI connection, it may be selected implicitly for compatibility; if it has multiple connections, `connection_id` is mandatory and ambiguous selection fails closed. Run lookups verify membership in the selected project's paginated runs collection (bounded to 400 recent runs); job operations verify the job detail's project reference, and run traversal also checks its workflow reference. Missing or mismatched ownership metadata fails closed. All tools are read-only; there are no pipeline trigger, retry, cancel, configuration-write or deployment tools.

### Browser dashboard and JSON API

Open the root URL of a confirmed Worker deployment in a modern browser. The dashboard uses the separate `WEB_ACCESS_TOKEN`, held in tab memory only, and provides project and CircleCI connection selectors populated from the registered catalog, plus a read-only webhook event panel with conservative run-correlation candidates.

- `GET /api/v1/projects` — registered project IDs/names and configured provider types.
- `GET /api/v1/status?project_id=znect-forge&connection_id=circleci-main` — performs a live read probe; only then reports provider availability as `available`.
- `GET /api/v1/runs?project_id=znect-forge&connection_id=circleci-main&limit=10`
- `GET /api/v1/runs/{run_uuid}?project_id=znect-forge&connection_id=circleci-main`
- `GET /api/v1/diagnostics/{run_uuid}?project_id=znect-forge&connection_id=circleci-main` — bounded failed-step logs, structured tests, and a small JUnit/test-results artifact for failed jobs.
- `GET /api/v1/events?after=0&limit=20`
- `GET /api/v1/event-correlations?project_id=znect-forge&connection_id=circleci-main&after=0&event_limit=20&run_limit=20` — correlates the selected project's stored webhook events with bounded recent API v3 run candidates.
- `GET /api/v1/build/status?project_id=znect-ci-bridge` — read-only probe of the central Znect Build GitHub Actions connection.
- `GET /api/v1/build/runs?project_id=znect-ci-bridge&limit=10` — lists verified central workflow runs (limit 1–20).
- `GET /api/v1/build/runs/{run_id}?project_id=znect-ci-bridge` — returns verified workflow/job metadata and run-scoped artifact metadata. Job logs and archive contents are explicitly unavailable in this adapter iteration.

All JSON API requests require `Authorization: Bearer <WEB_ACCESS_TOKEN>`.

### Signed CircleCI webhook inbox

CircleCI sends signed events to `POST /webhooks/circleci`. The Worker verifies the HMAC-SHA256 signature, accepts only CircleCI project slugs explicitly registered in `ZNECT_PROJECT_REGISTRY` (there is no implicit project default), normalizes a small field allowlist, deduplicates event IDs in a separate 30-day replay-key table, and stores the latest 500 event records in a project-specific SQLite-backed Durable Object. Replay protection therefore survives event-history eviction. MCP event reads accept `project_id`; the browser API accepts `project_id` as a query parameter. The inbox is readable through `list_recent_events` and `GET /api/v1/events`. Event records are capped at 500, while event IDs remain in the independent deduplication table for up to 30 days. Its initial `after=0` read returns the newest events first; the returned cursor then lets clients request only later arrivals.

`correlate_recent_events` enriches stored webhook events with candidate API v3 runs. It requires an exact commit SHA, rejects conflicting branches, and limits time distance to 24 hours. It does not assume CircleCI webhook pipeline IDs are API v3 run UUIDs. Multiple candidates are reported as `ambiguous`; a single candidate is a heuristic correlation, not proof of identity. Events without a revision remain unmatched. At most three candidates are returned per event, alongside the full candidate count and a truncation flag. The tool reads at most 50 events and 30 recent runs per request.

The inbox does **not** push unsolicited messages into an open ChatGPT conversation. A separate supported polling/delivery mechanism would be needed for proactive assistant notifications.

## Project registry

`ZNECT_PROJECT_REGISTRY` is optional non-secret JSON configuration. When absent, the Bridge loads an empty version-1 registry; it does not inject a Forge project. The schema supports projects without CI connections, multiple repositories, components, and provider connections (`circleci` and `znect-build`). See [PROJECT_REGISTRY.md](documentation/PROJECT_REGISTRY.md). A Znect Build connection requires exactly one registered source repository and the server-side `ZNECT_BUILD_GITHUB_TOKEN` secret with read-only Actions access to `Znect-god/znect-build`. The adapter verifies central run ownership using a validation artifact whose name includes the project ID, a SHA-256 fingerprint of the centrally validated source repository, the validated source commit SHA, and the run ID. The central workflow change that publishes this fingerprint is on the isolated Znect Build feature branch and is not merged or live-verified yet. Provider-neutral types live in `src/providers/contract.ts`; adapters live in `src/providers/circleci.ts` and `src/providers/znect-build.ts`. CircleCI supports per-job logs, test reports and artifacts. GitHub Actions currently exposes run-scoped artifact metadata; job logs are ZIP archives and generic test reports are not exposed by the API, so the adapter explicitly marks those capabilities unavailable rather than fabricating CircleCI-style data.

## Free ChatGPT access (no MCP)

The supported assistant interface is the authenticated Browser JSON API. ChatGPT access must use a private report handoff that reads this API directly; MCP is not required and is not the supported channel. GitHub Actions report workflows are not part of the active CI Bridge access path. Until a direct private handoff is available in the ChatGPT environment, an authorized user can retrieve a bounded report from the authenticated dashboard/API and provide that report to ChatGPT.

CircleCI runs CI Bridge's own validation pipeline from the repository's root `.circleci/config.yml`. This is distinct from the Bridge's read-only CircleCI adapter, which inspects registered projects' pipelines and never starts, retries, cancels or modifies them.

See `documentation/ASSISTANT_CHANNEL.md` for the supported access boundary and `documentation/IMPLEMENTATION_ROADMAP.md` for remaining handoff work.

## Secrets and configuration

Never commit or disclose secret values. Configure secrets in the correct environment:

- `CIRCLECI_TOKEN` — CircleCI API access; server-side only.
- `MCP_ACCESS_TOKEN` — separate MCP client Bearer token.
- `WEB_ACCESS_TOKEN` — separate browser API Bearer token.
- `CIRCLECI_WEBHOOK_SECRET` — shared signing secret configured in CircleCI and the matching Worker Preview/Production environment.
- `ZNECT_BUILD_GITHUB_TOKEN` — repository-scoped GitHub token with read-only Actions metadata/logs access to `Znect-god/znect-build`; no contents write, Actions write, dispatch, workflow, or administration permissions.

Preview and Production secrets are independent. The current Preview workflow installs `CIRCLECI_WEBHOOK_SECRET` from the GitHub Actions secret into the named Preview. Do not infer that Production has any of these secrets.


### Dependency install-script policy

The npm `allowScripts` policy is intentionally version-pinned: `esbuild@0.28.2` and `workerd@1.20261110.1` are approved because their install scripts validate/select the platform binaries used by the Wrangler toolchain. `core-js-pure@3.51.0` is explicitly denied because its postinstall is only an optional project-support message. Review and update these pins when dependency versions change; do not approve all dependency scripts globally. The policy change still requires a fresh CI run on the updated branch head.

## Development

Use Node.js 24 on a supported desktop/Linux environment for local source validation:

```bash
npm ci
npm run check
node --check scripts/preview-smoke-test.mjs
npx wrangler deploy --dry-run
```

These commands are local validation steps, not a project build or deployment. Android ARM64 Termux is not a supported Wrangler/workerd deployment environment. **CI Bridge's own source validation is defined in the root `.circleci/config.yml` and is executed by CircleCI.** Znect Build remains a separate central build system for other Znect application builds; its executor is documented in that repository and is not used to validate or run CI Bridge.

The CircleCI validation config performs `npm ci`, `npm run check`, smoke-script syntax validation and Wrangler dry-run only; it has no deployment step. The pipeline has not been triggered for the current exporter branch.

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

The Bridge is being generalized to serve multiple Znect projects. The MCP diagnostic path is project-scoped and verifies run/job ownership. Core API v3 MCP and browser diagnostics use the provider-neutral CircleCI adapter; the legacy v1.1 tools remain an explicit CircleCI-only compatibility path. Project-scoped webhook ingestion and event inbox routing use the registry. The Bridge must not modify project source/configuration, trigger or retry builds, or alter release/freeze decisions. Testing should use the next ordinary Forge workflow; do not create unnecessary builds solely to generate an event.


## Central Znect Build visibility

CI Bridge includes a read-only adapter and authenticated Browser JSON API for central Znect Build runs. The endpoints `/api/v1/build/status`, `/api/v1/build/runs`, `/api/v1/build/runs/{run_id}`, and `/api/v1/build/runs/{run_id}/validation-manifest` expose verified run metadata, exact source SHA, job/step outcomes, private validation-artifact metadata, and (through the dedicated endpoint) the validated manifest JSON. Ownership is checked against the central request-validation artifact fingerprint. The Browser API uses `WEB_ACCESS_TOKEN`; the adapter uses a separate repository-scoped `ZNECT_BUILD_GITHUB_TOKEN`. Neither credential grants or invokes build execution. See `documentation/ZNECT_BUILD_CONNECTION.md` for the runtime registry entry and least-privilege configuration.

The central recipe's manifest is uploaded as a private GitHub Actions artifact. Source code now implements bounded retrieval of only the manifest JSON from that ZIP; job-log ZIP parsing and structured test report ingestion remain future work. This retrieval code has not yet been executed or live-verified. The central target is still disabled and no live connection is claimed.


## CircleCI validation pipeline

The root `.circleci/config.yml` defines the CI Bridge validation workflow on CircleCI using Node.js 24.11.0. It installs package dependencies, runs typecheck and unit tests, validates the smoke-test script syntax, and performs Wrangler dry-run only. It does not deploy, access Cloudflare credentials, or mutate monitored CircleCI pipelines. Pipeline execution status must be verified separately in CircleCI; adding the config is not evidence that checks passed.
