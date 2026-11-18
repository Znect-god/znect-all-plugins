# Znect CI Bridge

**Status:** `in-development` — experimental; not production-ready.  
**Version:** `0.1.0`  
**Source repository:** `Znect-god/znect-all-plugins`  
**Active branch:** `feature/ci-bridge-android-exporter` (legacy branch name; Android exporter source has been removed).

**Repository/branch clarification:** This is the same Znect CI Bridge plugin intended for the shared `znect-all-plugins` repository, not a separate Android application. The complete plugin source currently lives on this feature branch; `main` does not yet contain `plugins/znect-ci-bridge/`. The branch name is historical and does not describe the current implementation.

Znect CI Bridge is a free-tier-first, read-only Cloudflare Worker for inspecting registered CircleCI projects and collecting signed CI events. The existing CircleCI API v3 adapter, bounded diagnostics, webhook inbox, private Browser JSON API, dashboard and assistant-report export are retained and developed incrementally; this is not a rewrite.

## Current architecture

- **CircleCI:** CI execution platform for the Znect Build validation flow and the observed CI provider for registered projects.
- **Znect Build:** development and central recipe repository. Its `.circleci/config.yml` contains Znect Build contract checks and an opt-in exact-SHA CI Bridge validation workflow.
- **CI Bridge:** reads CircleCI through a bounded read-only API v3 adapter. It never triggers, retries, cancels, approves or modifies CircleCI pipelines, jobs or settings.
- **GitHub Actions:** not used as an executor. Legacy GitHub Actions workflows in Znect Build are inert.
- **ChatGPT access:** MCP is optional/legacy and not required. The private Browser JSON API uses a separate Bearer token; the dashboard can export a bounded JSON report for explicit user-reviewed handoff. Direct authenticated ChatGPT Free access to the private API remains unverified.

## Current implementation state — 2026-11-18

- The existing Worker and provider-neutral CircleCI read-only adapter are preserved.
- The Browser JSON API provides project-scoped status, runs, run details, diagnostics, events, event correlations and aggregate reports.
- The dashboard exports one bounded JSON report, including up to three failed-run diagnostic bundles, with a 600 KB byte-size ceiling and partial-data markers. Each job diagnostic includes normalized JSONL/JUnit test counts; the report declares that handoff is a user-reviewed JSON attachment, not automatic ChatGPT API access.
- Znect Build's CircleCI exact-SHA workflow and the central validation recipe are implemented on an isolated feature branch. The workflow defaults to disabled and records source SHA, recipe SHA and CircleCI pipeline identity.
- The Znect Build CircleCI project has not yet been configured or live-verified. No CircleCI pipeline or current-head test suite has been run.
- The separate GitHub Actions-based Znect Build adapter, provider type, Browser/MCP routes and GitHub token requirement have been removed. Znect Build must be registered as an ordinary CircleCI project connection.
- Direct ChatGPT Free authentication to the private Browser API is unresolved. Manual JSON export remains the honest fallback; it is not automatic connectivity.
- No current-branch Preview deployment, Production change, release or live CircleCI event round-trip is claimed.

## Core capabilities

- Multi-project registry and explicit CircleCI connection selection.
- CircleCI API v3 read-only access to runs, workflows, jobs, step outcomes, logs, structured test results and allowlisted artifacts.
- Legacy CircleCI v1.1 compatibility tools, kept separate from v3 UUID identifiers.
- Signed CircleCI webhook ingestion, bounded durable event history, deduplication and conservative event-to-run correlation.
- Authenticated GET-only Browser JSON API and dashboard.
- Bounded assistant report export for manual handoff.

## Validation flow

The CircleCI configuration and central recipe are maintained in [Znect Build](https://github.com/Znect-god/znect-build/tree/feat/ci-bridge-node-worker-recipe).

The opt-in workflow requires `run_ci_bridge_validation=true`, a branch ref and a full 40-character source SHA. CircleCI checks out the exact commit from this public repository, verifies the resolved SHA, then runs:

1. `npm ci`
2. `npm audit --audit-level=high`
3. `npm run check` (TypeScript and Vitest)
4. `node --check scripts/preview-smoke-test.mjs`
5. `npx --no-install wrangler deploy --dry-run`

The workflow performs no deployment. Its default is disabled; no pipeline is started merely by editing the source or roadmap.

## Security boundaries

- The assistant-facing Browser API is authenticated and GET-only.
- CircleCI provider calls from CI Bridge are read-only.
- No Bearer token is stored in localStorage, exported JSON or query strings.
- No public unauthenticated report endpoint is provided.
- No CI Bridge operation triggers, retries, cancels or changes CircleCI.
- No Preview or Production deployment is authorized by this repository's development work.

## Current next steps

- Verify the Znect Build CircleCI project connection and free-plan quota availability.
- After separate explicit authorization, run the exact-SHA validation workflow and inspect the real CircleCI manifest/artifact evidence.
- Register the Znect Build CircleCI project in the runtime project registry and verify its run/job/manifest-artifact reads through the generic CircleCI adapter.
- Verify live CircleCI run/job/log/test/artifact reads and real webhook delivery through the existing CircleCI adapter.
- Establish a supported private ChatGPT Free authentication/handoff path without MCP or weakened authentication.
- Complete independent security review and release readiness.

See [the implementation roadmap](documentation/IMPLEMENTATION_ROADMAP.md), [assistant-channel guide](documentation/ASSISTANT_CHANNEL.md), [usage guide](documentation/USAGE_GUIDE.md), and [provider adapter architecture](documentation/PROVIDER_ADAPTERS.md).
