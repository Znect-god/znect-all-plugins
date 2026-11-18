# Znect CI Bridge — implementation roadmap

**Status:** `in-development`; isolated engineering branch only.  
**Updated:** 2026-11-18 (normalized test summaries and assistant handoff contract)  
**Development repository:** `Znect-god/znect-all-plugins`  
**Build system:** `Znect-god/znect-build` (separate repository and responsibility)  
**Active working branch:** `ci-bridge` (the single permanent CI Bridge development branch)

**Repository/branch clarification:** CI Bridge is one plugin in the shared `znect-all-plugins` repository, not a separate Android application. Its complete current implementation is on the `ci-bridge` branch. `main` contains an earlier prototype registration (`plugin.json` and README), but not the current runnable project (`package.json`, `src/`, tests, and scripts). Legacy CI Bridge branches are consolidation sources only; all ongoing development belongs on `ci-bridge`.  
**Consolidation:** completed on 2026-11-18. The canonical implementation is on `ci-bridge`; the user removed all ten obsolete CI Bridge branches. `main` remains unchanged.  
**Cost constraint:** free tiers/included quotas only; no paid add-ons, auto-refill, or unapproved Production deployment.

This is the living implementation roadmap. Update it with every meaningful implementation change. When source implementation and its regression coverage are added, mark it **(выполнено)**. Test execution, live provider verification, deployment and operational readiness remain separate statuses. Do not confuse implementation with verification, deployment, or operational readiness. Historical sections preserve earlier decisions and intermediate architecture. Current architecture: CircleCI executes CI Bridge validation; Znect Build owns the central recipe, registry policy and development workflow; Znect All Plugins owns Bridge source; the Bridge observes CircleCI through a read-only adapter. Any earlier statement that CI Bridge validation executes through GitHub Actions or that Znect Build is the execution platform is superseded.

## 1. Project boundaries

- **Znect All Plugins** is the source-development home for CI Bridge: code, tests, docs, plugin metadata and release preparation.
- **Znect Build** (`Znect-god/znect-build`) is the development and central-recipe home for Znect projects, including CI Bridge; it is not the CI executor.
- **Znect CI Bridge** is a read-only diagnostics/integration plugin. It observes CircleCI and exposes reports; it does not execute or mutate builds.
- **CircleCI** is the CI execution platform for Znect Build and CI Bridge validation. The Bridge's CircleCI adapter remains strictly read-only.
- The root `.circleci/config.yml` and the optional native Android exporter were removed as redundant paths. Do not recreate them without a new explicit architectural decision.
- GitHub Actions workflows in this repository remain inert/historical and are not an execution path for CI Bridge validation.
- The central CircleCI recipe checks an exact source SHA from `Znect-god/znect-all-plugins`; the Bridge may observe the resulting CircleCI run and provenance artifacts only through its read-only provider.

No PR merge, Znect Build execution, Preview refresh, Production change, secret access or deployment is authorized by this roadmap alone.

## 2. Delivery stages

1. **Core CircleCI diagnostics and private report API — (выполнено):** provider adapter, authenticated bounded Browser API, webhook inbox, event correlation and aggregate `/api/v1/report` source are present.
2. **Dashboard assistant-report handoff — source implementation (выполнено):** the existing dashboard downloads a bounded aggregate report and up to three failed-run diagnostic bundles; regression-test source and partial-report handling are present.
3. **Private ChatGPT access and live handoff — in progress:** establish a supported authenticated path to the private Browser API, verify the existing Preview and prove a real report round-trip without MCP, public unauthenticated access or manual secret sharing.
4. **Znect Build validation and release readiness — pending:** validate the exact source SHA through the central recipe, inspect real test/security results, complete authorized integration checks and prepare Reporting / Diagnostics v1 for transfer to `Znect-god/znect-build`.

**Delivery milestone count:** the roadmap has four high-level delivery milestones, not a fixed 86-stage project plan. Milestones 1–2 have source implementation; milestone 3 (private ChatGPT access and live handoff) is in progress; milestone 4 (validation and release readiness) is pending. Therefore, two high-level milestones remain unfinished, with milestone 3 already underway. The numbered engineering stages below are an incremental audit/change log and do not define a fixed final stage number.

## 3. Intended result

ChatGPT and authorized users should be able to inspect current Znect project build health through a private, bounded report containing:
- registered projects, repositories and CI connections;
- CI runs, workflows and jobs;
- failed-step metadata and bounded/redacted logs;
- structured test results and allowlisted artifacts when the provider exposes them;
- signed webhook events and conservative event-to-run correlation;
- a browser dashboard/JSON API and a free private report handoff for ChatGPT (no MCP channel and no GitHub Actions dependency);
- a bounded assistant-facing report endpoint or equivalent direct private handoff that ChatGPT can consume.

The Bridge must remain read-only with respect to CI execution and project source/configuration: no trigger, retry, cancel, deployment, configuration-write or source-modification operations.

## 4. Current implementation inventory

### 3.1 Core Worker and access control

- [x] Cloudflare Worker project scaffold and Wrangler configuration **(выполнено)**.
- [x] Health endpoint and read-only HTTP API structure **(выполнено)**.
- [x] Separate Bearer authentication for MCP and browser API **(выполнено)**.
- [x] Request rate limiting and bounded request/response handling **(выполнено)**.
- [x] Secret redaction and safe error responses **(выполнено)**.
- [x] Preview/Production secret separation documented **(выполнено)**.
- [ ] Independent security review and operational threat-model sign-off.
- [ ] Re-validate all controls on the current branch head; latest isolated changes have not been typechecked or tested.

### 3.2 Project registry and provider architecture

- [x] Versioned multi-project registry with explicit project/repository/component registration **(выполнено)**.
- [x] No implicit Forge default; empty registry is allowed **(выполнено)**.
- [x] Multiple provider connections per project and explicit connection selection where ambiguous **(выполнено)**.
- [x] Separate registration, CI configuration and provider-availability states **(выполнено)**.
- [x] Provider-neutral read-only adapter contract **(выполнено)**.
- [x] CircleCI provider adapter for core API v3 operations **(выполнено)**.
- [x] Project/run/job/workflow ownership checks and bounded run traversal **(выполнено)**.
- [x] Optional read-only adapter for the separate `Znect-god/znect-build` repository exists as isolated/secondary integration code; it is not the CircleCI adapter and is not the CI Bridge validation executor. **(выполнено — source implementation; live verification pending)**
- [x] Keep the Znect Build read adapter isolated from the CircleCI assistant-report path; use it only for read-only central Build validation evidence and manifest retrieval **(выполнено — architecture boundary confirmed)**.
- [x] Route CI Bridge source validation through the central Znect Build target only; do not create a repository-local CircleCI/GitHub Actions executor **(выполнено — architecture and cleanup committed; actual validation run pending)**.
- [ ] Verify multi-project and multi-connection behavior against live, authorized projects.

### 3.3 CircleCI diagnostics

- [x] CircleCI API v3 connection probe and recent-run listing **(выполнено)**.
- [x] Run, workflow and job details **(выполнено)**.
- [x] Bounded job logs, structured test results and artifact listing/retrieval **(выполнено)**.
- [x] Bounded failed-run diagnostic report **(выполнено)**.
- [x] Legacy CircleCI API v1.1 tools retained as a separate compatibility path **(выполнено)**.
- [ ] Re-verify representative successful and failed live runs on a current authorized Preview.
- [ ] Verify real failed-step log, test-report and artifact round-trips, including truncation and redaction behavior.
- [ ] Decide whether to deprecate legacy v1.1 tools after v3 coverage is proven; do not silently mix build numbers with v3 run UUIDs.

### 3.4 Signed webhook inbox

- [x] CircleCI webhook receiver with raw-body HMAC-SHA256 verification **(выполнено)**.
- [x] Project allowlist and payload normalization using a field allowlist **(выполнено)**.
- [x] Project registry accepts the explicitly supported `gh/` and `github/` CircleCI slug forms and resolves both through the same registered-project boundary **(выполнено)**.
- [x] Event ID replay protection/deduplication **(выполнено)**.
- [x] Durable Object-backed bounded event history and retention policy **(выполнено)**.
- [x] Bound internal event append bodies and validate canonical timestamps, field lengths, CircleCI URLs and an explicit stored-field allowlist before persistence **(выполнено)**.
- [x] Signature input bounds and duplicate-v1-signature rejection **(выполнено)**.
- [x] Ingress regression tests for valid signatures, invalid signatures, unknown projects, storage failures and unsupported content types **(выполнено)**.
- [ ] Run the current ingress test suite and typecheck on the exact current head (not yet run).
- [ ] Verify a real ordinary CircleCI workflow-completed delivery against CircleCI delivery history and the Preview inbox.
- [ ] Verify real-event retrieval through both MCP and Browser API and confirm duplicate delivery behavior end-to-end.
- [ ] Keep synthetic webhook tests clearly distinguished from real provider deliveries.

### 3.5 Webhook-to-run correlation

- [x] Conservative correlation module using exact commit SHA, branch conflict checks and execution-time interval proximity **(выполнено)**.
- [x] Candidate, ambiguous and unmatched outcomes; no assumption that webhook pipeline ID equals API v3 run UUID **(выполнено)**.
- [x] Bounded correlation API and MCP tool **(выполнено)**.
- [x] Browser API correlation endpoint with generic provider/storage error handling **(выполнено)**.
- [x] Correlation edge-case tests: event inside run interval, malformed timestamp fallback, inverted interval rejection and invalid time-window rejection **(выполнено)**.
- [x] Defensive validation of stored event-page records, UUIDs, timestamps and monotonic cursors **(выполнено)**.
- [x] Validate event-page ownership against registered CircleCI project slugs; reject duplicate, unordered or inconsistent cursors and invalid empty-page cursor advancement **(выполнено)**.
- [x] Enforce the normalized event privacy allowlist, optional field bounds, canonical timestamps, CircleCI workflow URL constraints and safe numeric values again at the Browser/MCP output boundary **(выполнено)**.
- [x] API regression test for malformed event-store page/cursor responses **(выполнено)**.
- [ ] Run correlation unit/API/MCP tests and typecheck on the current head (not yet run).
- [ ] Verify correlation against real CircleCI webhook deliveries and corresponding API v3 runs.
- [ ] Tune matching thresholds only from observed provider behavior; preserve conservative ambiguity handling.

### 3.6 Browser dashboard

- [x] Project and connection selection, read-only status/run/diagnostics views **(выполнено)**.
- [x] Recent webhook events panel and refresh action **(выполнено)**.
- [x] Correlation candidate/status display **(выполнено)**.
- [x] Loading, empty and error states plus stale-response protection **(выполнено)**.
- [ ] Run UI tests and browser smoke checks against the current head (not yet run).
- [ ] Verify dashboard behavior using real inbox events and live correlation results.
- [ ] Accessibility, narrow-screen/mobile layout and broader usability review.

### 3.7 MCP (not the product access channel)

- [x] Historical Streamable HTTP MCP surface exists in the source **(выполнено — legacy implementation only)**.
- [x] Core CircleCI diagnostics are also available independently through the authenticated Browser JSON API **(выполнено)**.
- [x] Free ChatGPT access does not depend on MCP, a custom MCP server, or a paid MCP distribution channel **(выполнено — architecture decision)**.
- [ ] Remove MCP from the supported product/runtime path and prune its dependencies after confirming no non-MCP route or test relies on MCP-specific modules.
- [x] Keep the user-facing ChatGPT access on the authenticated Browser JSON API; the direct `/api/v1/report` endpoint is the primary aggregate report. **(выполнено — source implementation)**

### 3.8 Free ChatGPT report handoff (primary assistant channel)

- [x] Authenticated Browser JSON API provides direct read-only access to registered CircleCI projects, runs, diagnostics and events. **(выполнено)**
- [x] Separate `WEB_ACCESS_TOKEN`, Bearer authentication, rate limiting, bounded responses and redaction are implemented for Browser API access. **(выполнено — source implementation; current-head validation pending)**
- [x] MCP is optional legacy functionality and is not required for the ChatGPT channel. **(выполнено)**
- [x] Implement `GET /api/v1/report` as a bounded direct CircleCI assistant report: registered project/connection, recent runs, failed-run diagnostic links, webhook event page, correlation candidates, freshness timestamp and completeness indicators. **(выполнено — source implementation; regression execution pending)**
- [x] Protect the report with the existing Browser API Bearer authentication, rate limiter, GET-only guard, project/connection scope, secret redaction and response-size limit. **(выполнено — static source inspection)**
- [x] Add focused API regression tests for report authentication, project scope and query bounds. **(выполнено — test source added; execution pending)**
- [x] Add report regression coverage for successful aggregation, event-to-run correlation, provider-field secret redaction and graceful event-store failure. **(выполнено — test source added; execution pending)**
- [ ] Design and verify a supported, free ChatGPT-to-Browser-API authentication mechanism; do not assume ChatGPT can attach `WEB_ACCESS_TOKEN` to arbitrary HTTP requests.
- [ ] Verify ChatGPT can consume the report without MCP, GitHub Actions, paid intermediaries or manual secret sharing.
- [ ] Verify freshness, pagination/truncation indicators and failure behavior; stale reports must not be presented as current.
- [ ] Confirm operation stays within CircleCI and Cloudflare free/included quotas; quotas are finite.

### 4.9 Znect Build validation path

- [x] Confirm Znect Build is the central executor for CI Bridge validation; no independent CircleCI or GitHub Actions executor is supported **(выполнено — architecture decision)**.
- [x] Remove the redundant root `.circleci/config.yml` and the optional Android report-exporter application, tests, Gradle wrapper and setup guides **(выполнено — cleanup commit)**.
- [x] Confirm the central Node.js/Cloudflare Worker recipe is present on `feat/ci-bridge-node-worker-recipe` and matches the current Bridge package scripts **(выполнено — source review)**.
- [x] Add `npm audit --audit-level=high` to the central recipe and its provenance manifest; update the Bridge read-only manifest validator and add regression coverage for both the complete validation list and omission of the audit step **(выполнено — source/test implementation; execution pending)**.
- [x] Register the `znect-ci-bridge/worker-validation` target in the isolated Znect Build feature branch with the source repository and validation recipe; keep it disabled until reviewed and explicitly authorized **(выполнено — registry source exists; target remains disabled)**.
- [ ] Validate dependency install, typecheck, full Vitest suite, audit and Wrangler bundle dry-run through Znect Build on the exact candidate SHA.
- [ ] Retrieve the private report/validation manifest through the existing read-only Znect Build adapter and confirm source SHA ownership.
- [ ] Do not create an independent `.circleci/config.yml`, GitHub Actions runner or Android companion app as a workaround.

## 5. Validation and release gates

### Gate A — source validation
- [ ] Dependency install, typecheck and complete unit/integration test suite on the exact candidate SHA.
- [ ] Static/syntax checks and Wrangler dry-run on a supported Linux environment.
- [ ] Review test failures and security findings; record exact SHA and evidence.
- **Current state:** the active isolated branch has not been typechecked or tested. Earlier green runs apply only to older SHAs and must not be presented as validation of this branch.

### Gate B — isolated Preview
- [ ] Deploy only to the named non-production Preview after explicit authorization.
- [ ] Verify health, authenticated Browser API, MCP initialization and read-only tool behavior.
- [ ] Verify Durable Object persistence, webhook signature handling and correlation.
- [ ] Confirm Preview secrets/configuration by presence and behavior without revealing values.
- **Current state:** a prior Preview existed for an earlier branch. The current branch changes have not been deployed or smoke-tested.

### Gate C — real CircleCI integration
- [ ] Confirm real workflow-completed delivery in CircleCI delivery history.
- [ ] Match the delivery to a durable inbox record and retrieve through the Browser API and private report artifact.
- [ ] Verify representative run/job/log/test/artifact diagnostics.
- **Current state:** earlier webhook registration ping was accepted, but this is not proof of a real workflow delivery. Real end-to-end delivery remains pending.

### Gate D — private assistant report
- [ ] Establish the supported ChatGPT access mechanism for a private Bearer-authenticated Browser API (for example, a supported connector/auth flow or user-approved short-lived credential exchange); validate current product capability rather than assuming generic browser access can set authorization headers.
- [ ] Verify direct `/api/v1/report` retrieval by ChatGPT without MCP, GitHub Actions, a public unauthenticated URL, query-string secrets or manual secret sharing.
- [ ] Verify report freshness, pagination, truncation indicators and secret redaction against a live CircleCI project.
- **Current state:** `/api/v1/report` and regression-test source exist; ChatGPT authentication compatibility, test execution and live retrieval remain unverified.

### Gate E — release readiness
- [ ] Independent security review.
- [ ] All critical validation gates complete with evidence on exact SHAs.
- [ ] License selected and documented.
- [ ] User approval for PR/merge/release and separately for any Production deployment.
- **Current state:** not release-ready; no Production deployment is authorized.

## 6. Branch and repository policy

- Continue all CI Bridge source, tests, scripts, metadata and documentation work in `Znect-god/znect-all-plugins`, branch `ci-bridge`. This is the single permanent development branch.
- Keep `main` as the shared plugin-catalog branch. Do not merge CI Bridge development into `main`, move its ref, or open/merge a PR without explicit approval.
- The ten obsolete CI Bridge branches were removed by the user on 2026-11-18 after consolidation. Do not recreate them or resume development there.
- The repository still has unrelated branches `catalog/znect-forge` and `feature/znect-screen-bridge-foundation`; they are outside CI Bridge scope and must not be changed as part of this work.
- `Znect-god/znect-build` remains a separate infrastructure/recipe repository. Its CI Bridge validation configuration and central recipe are maintained there; it is not the CI Bridge source repository.
- CircleCI is the executor for CI Bridge source validation and the read-only provider observed by CI Bridge. The central exact-SHA validation workflow is opt-in and defaults to disabled. CI Bridge itself must never trigger, retry, cancel, approve or mutate CircleCI pipelines/jobs/settings.
- GitHub Actions workflows in this repository are inert historical files and are not an executor. Do not restore a repository-local executor or the removed Android exporter.
- Do not trigger CircleCI pipelines, builds, deployments, Preview refreshes or Production changes without the required separate explicit authorization. Do not access or change secrets/runtime configuration without separate authorization.
- Do not request already-configured credentials again. Never put secret values in code, docs, commits, chat or logs.

## 7. Operating rule for roadmap updates

For every meaningful feature or fix:
1. Update the code and relevant tests/docs.
2. Mark the corresponding roadmap item **(выполнено)** in the same development cycle.
3. Keep validation status separate: mark tested/verified only when the exact check actually ran and its result is available.
4. Record the exact commit/branch and any remaining limitations.
5. Do not mark a feature deployed or operational merely because its source code exists.

## 8. Development log — 2026-11-17

- Added the living roadmap to the active engineering branch and linked it from the plugin README and Usage Guide.
- Hardened internal event-page parsing, project-slug ownership checks, duplicate/order/cursor consistency validation and empty-page cursor handling; malformed pages fail closed.
- Hardened the Durable Object append boundary with an 8 KiB streaming body cap, JSON media-type enforcement, strict normalized-event validation and rejection of unknown fields.
- Updated the security review with the new storage trust-boundary controls and explicit current-head validation limitations.
- Added a second event-page output allowlist so legacy or corrupted stored rows cannot expose unknown fields through Browser API/MCP readers.
- Aligned project-registry validation with the two CircleCI GitHub slug forms already accepted by webhook normalization; added a registry regression test.
- Added a focused Browser API regression test for a malformed event-store page. This test has been authored but not executed.

## 9. Development log — 2026-11-18

- Completed the repository inventory stage: reviewed the active CI Bridge branch and the current Znect Build main-branch README, implementation status, request/result contracts, project inventory and central workflow definitions.
- Confirmed that Znect Build has request validation, request/result schemas, central orchestration and a central Android recipe prepared, but hosted-runner/credential gates and the Forge execution freeze still prevent an end-to-end build. No Bridge-facing result read API is present in the reviewed contracts or workflow outputs.
- Fixed a source-level mismatch: the project registry and webhook normalizer accepted explicitly registered `github/` CircleCI slugs, while the API v3 project resolver accepted only `gh/`. The resolver now accepts both registered slug forms; regression tests cover the alias and reject unsupported prefixes.
- Tightened CircleCI workflow URL validation at both event-ingress/storage and Browser/MCP output boundaries to allow HTTPS default port only (implicit 443 or explicit 443), rejecting non-standard ports. Added regression tests at normalization and output-reader boundaries.
- These changes and tests are authored on the isolated branch. No tests, typecheck, CI workflow, Preview deployment or live CircleCI calls were run.

## 9. Work stages — 2026-11-18

1. **Repository inventory and architecture alignment — (выполнено).** Existing work in All Plugins and Build reviewed; ownership boundaries and unavailable Build read interface recorded.
2. **Bridge source hardening and regression coverage — (выполнено as source implementation).** CircleCI slug-alias consistency and workflow URL port validation implemented with focused regression tests. Tests remain unexecuted.
3. **Build-system alignment review — (выполнено).** Confirmed that Znect Build is the mandatory central build orchestrator and uses GitHub Actions. The standalone CircleCI config previously added for Bridge validation was removed because it created a parallel workflow outside the established Znect Build architecture.
4. **Central recipe and onboarding — (выполнено as isolated source configuration).** Added a disabled `znect-ci-bridge/worker-validation` target and central Node/Cloudflare Worker validation recipe on Znect Build branch `feat/ci-bridge-node-worker-recipe`. The branch is not merged; execution remains disabled and no workflow has been triggered.

## 10. Next development priorities

1. Continue source-level review of webhook ingress, correlation and dashboard; fix any demonstrated authorization, parsing or output-boundary issues.
2. Continue reviewing webhook event-store transactionality, retention and replay boundaries; add focused regression tests and update this roadmap in the same development cycle.
3. Inspect the full Bridge implementation for security, authorization, bounded-output and provider-ownership gaps.
4. Review the isolated Znect Build Node/Worker recipe and disabled registry target; keep it unmerged/unexecuted until central runner and permission gates are reviewed.
5. Keep source validation, Preview deployment and live provider verification as separate gates. Do not trigger any of them without the required authorization and supported central recipe.
6. Design the Bridge-to-Build read-only result integration against the actual Znect Build result transport. The current Build contracts expose request validation artifacts and optional commit status callbacks, but no confirmed Bridge-facing read API or event feed; do not invent endpoints or make Bridge a build executor.


## 11. Repository alignment review — 2026-11-17

- Reviewed all nine CI Bridge-related branches in `Znect-god/znect-all-plugins`. The active engineering branch is `test/ci-bridge-webhook-ingress-contract`; `feature/ci-bridge-test-reports` is its ancestor, while the older webhook, smoke-test, free-channel and prototype branches are historical/diverged work lines. No branch was merged or deleted.
- Reviewed `Znect-god/znect-build` and its main README, implementation status, architecture, request/result contracts and project inventory. Confirmed that it is the central application build/orchestration repository; GitHub Actions executes central recipes, while project repositories retain source ownership. The current Build implementation is not a general Bridge diagnostics API, and live execution remains gated.
- The Bridge remains in `znect-all-plugins` for plugin source development. It must not be relocated into `znect-build` or duplicate application build recipes.


## 12. Znect Build architecture alignment — 2026-11-18

- Re-checked the canonical `Znect-god/znect-build` repository: Znect Build is the single central build/orchestration system for Znect projects, and GitHub Actions is its central execution engine.
- Confirmed the canonical request path is `repository_dispatch` with event type `znect-build-request`, or controlled `workflow_dispatch` for operator diagnostics. Requests require a registered project, exact source repository, source ref and full source SHA, target and profile.
- Confirmed the current Build registry contains only `znect-forge`; its `android-debug` target has `execution_enabled: false`. Build execution is also globally gated and requires external source-read/dispatch credentials. The Forge 0.7.0 user-testing gate remains in force.
- Confirmed Znect Build main currently defines the Android Gradle debug recipe. An isolated, unmerged branch `feat/ci-bridge-node-worker-recipe` now adds the CI Bridge Node.js/Cloudflare Worker validation recipe and a registered-but-disabled target; it is not active on main.
- Confirmed Build request/result schemas and central workflow artifacts exist, but no dedicated Bridge-facing read API or signed result-event feed is currently specified as implemented. The API document in this plugin remains a proposal only.
- Removed the standalone root `.circleci/config.yml` previously added for CI Bridge checks. It created an independent CircleCI workflow and was not the correct route for Znect project build orchestration.
- No CircleCI pipeline, Znect Build workflow, Forge build, test suite, typecheck, Wrangler dry-run, Preview deployment or Production action was triggered by this correction.
- Added the central Node/Worker recipe, safe onboarding entry and validated-source fingerprint artifact on an isolated Znect Build branch; it remains unmerged and disabled. Added a source-level GitHub Actions read-only adapter, MCP tools and authenticated Browser JSON API routes in CI Bridge. Live credential/workflow verification, central branch review and repository-scoped token permission review remain pending. GitHub Actions job logs and artifacts remain ZIP archives; the adapter does not fabricate per-step text logs or job-level artifact links.


## 10. Free ChatGPT channel correction — 2026-11-18

- The supported ChatGPT ↔ CircleCI path is **not MCP**. It is the private Forge issue #8 command → Forge GitHub Actions workflow → authenticated CI Bridge Browser JSON API → private one-day report artifact → ChatGPT via the existing GitHub integration.
- PR #9 is confirmed merged into Forge `main` at merge commit `fb226fb25e414f4ce0f53d1b7a8f280b00b2c60a`. The workflow and collector are present on Forge `main`.
- This proves the source/configuration handoff is merged, not that a report has run successfully. No fresh report artifact or live end-to-end handoff has been verified in this audit.
- The workflow uses GitHub Actions included quota and Cloudflare Worker free-tier limits; it does not consume CircleCI build minutes. No paid MCP channel is required.
- Existing MCP source is legacy/optional and is not part of the supported ChatGPT channel. Removal from runtime/dependencies remains a separate cleanup task after dependency and route analysis.


## 11. CircleCI free-channel request-scope correction — 2026-11-18

- Audited the merged Forge PR #9 and confirmed the owner-command workflow and report collector are present on Forge `main` **(выполнено)**.
- Found a blocking integration mismatch: the merged workflow called `/api/v1/status`, `/runs`, `/events`, and `/diagnostics` without the required `project_id`; status validation also expected a `project.slug` field that the Browser API does not return.
- Corrected the workflow on isolated Forge branch `fix/ci-bridge-free-circleci-report-params`: every CircleCI API request now supplies `project_id=znect-forge`; provider calls also select `connection_id=circleci-main`; status validation checks the actual response fields `project.id`, `connection.id`, and `provider` **(выполнено — source correction)**.
- Added `scripts/znect-ci-bridge-validate-workflow.sh` and wired it into the report workflow to guard required project/connection parameters and the Browser API response contract **(выполнено — source implementation; script/workflow not executed)**.
- No Forge `main` update, PR creation, workflow execution, Preview deployment, or live CircleCI request was performed. The correction remains isolated and unvalidated by a workflow run.
- Next: add/perform source-level workflow contract validation, review secret presence only, then obtain explicit approval before any report workflow run. Live report/artifact retrieval remains pending.


## 12. Central build ownership clarification — 2026-11-18

- All Znect project builds, including CI Bridge validation/builds, are owned and executed by the central repository `Znect-god/znect-build` **(выполнено — architecture decision)**.
- CircleCI remains the external CI provider inspected by CI Bridge in read-only mode. CI Bridge does not dispatch, retry, cancel, or mutate CircleCI pipelines.
- The free ChatGPT request/report path must be orchestrated and executed through Znect Build. A standalone Forge GitHub Actions workflow must not become an independent build executor or alternative orchestration system.
- Existing Forge issue #8 and PR #9 workflow are treated as the current report-handoff implementation to be reconciled/migrated into the central Znect Build flow; they do not authorize Forge Actions to own CI Bridge builds.
- No CI Bridge build or workflow was started during this clarification. Central Build branch changes remain isolated and unexecuted.


## 13. Central Build validation evidence — 2026-11-18

- Updated the isolated Znect Build recipe to emit a machine-readable CI Bridge validation provenance manifest and upload it with the resolved source SHA as a private 14-day central artifact **(выполнено — source implementation in Znect Build branch)**.
- The manifest records the exact project/source revision, recipe outcome, validation command list and central run identity; it explicitly states that deployment and CircleCI pipeline mutation did not occur **(выполнено — source implementation)**.
- The central registry target `znect-ci-bridge/worker-validation` remains `execution_enabled: false`. No build/test/workflow was run; manifest artifact creation remains live-unverified.
- The CI Bridge must consume central Build validation evidence through read-only central run/artifact metadata, without initiating a build or using MCP as its assistant channel.


## 14. Central Znect Build result visibility — 2026-11-18

- Repaired the Znect Build read-only provider adapter and aligned ownership verification with the central request-validation artifact fingerprint (project ID, registered source-repository SHA-256, exact source SHA and central run ID) **(выполнено — source implementation)**.
- Exposed authenticated Browser JSON API routes for central Build status, run listing and run details; run details now include verified source SHA, request-fingerprint artifact metadata, validation-manifest artifact metadata, and central job/step outcomes **(выполнено — source implementation)**.
- Added runtime registry/least-privilege credential instructions and regression coverage for validation manifest artifact metadata **(выполнено — source implementation)**.
- The Browser API still returns artifact metadata only; it does not download/unpack the private manifest ZIP or extract GitHub job log archives. These remain future work.
- No runtime registry/secrets were changed, no live API probe was performed, and no central workflow/build was triggered. The central target remains disabled.


## 15. Bounded central validation manifest retrieval — 2026-11-18

- Added a read-only Browser JSON API endpoint for `/api/v1/build/runs/{run_id}/validation-manifest`, requiring the existing Browser API bearer authentication, project scope and central run ownership verification **(выполнено — source implementation)**.
- Added bounded GitHub Actions artifact download: exact run-scoped artifact name, non-expired metadata, 2 MB compressed cap, one HTTPS Azure Blob redirect, no GitHub token forwarded to signed storage, and 15-second request timeout **(выполнено — source implementation)**.
- Added ZIP central-directory validation, exact manifest path selection, rejection of encrypted/duplicate/unsupported entries, 64 KiB decompressed cap and CRC integrity verification **(выполнено — source implementation)**.
- Added manifest schema/scope checks for project ID, registered repository, exact source SHA, central run identity, recipe outcome and explicit no-deployment/no-CircleCI-mutation assertions; response is allowlisted to known fields **(выполнено — source implementation)**.
- Added ZIP extraction regression tests. Tests and typecheck have not been executed; this is not a compile-pass or runtime-verification claim.
- No GitHub Actions run, central build, CircleCI request, deploy, Preview/Production change, secret read or runtime configuration change was performed. The central target remains disabled.
- Next: source-level contract review, then request explicit authorization before running the central validation recipe or any live read-only provider probe.


## 16. Source-level contract review — 2026-11-18

- Cross-checked the Browser API route against the existing Bearer authentication, rate-limit gate, GET-only method guard, project registry selection and connection scope **(выполнено — static inspection)**.
- Cross-checked the adapter's run ownership fingerprint against the central workflow identity, repository, workflow path, main branch, project run title, source repository hash, exact source SHA and run ID **(выполнено — static inspection)**.
- Cross-checked the artifact contract against the central workflow upload name and manifest schema. The adapter now requires the exact registered target/profile/recipe, the exact four validation commands, a supported recipe outcome, the matching source SHA and run URL, and both explicit no-deploy/no-CircleCI-mutation flags **(выполнено — source implementation + static inspection)**.
- Tightened artifact expiry and downloaded-size checks; corrected stale run-details capability descriptions **(выполнено)**.
- Confirmed the central registry still has `execution_enabled: false`; no workflow was dispatched.
- Typecheck, unit tests, ZIP decompression execution, and live artifact retrieval remain **not executed / not verified**.


## 17. [SUPERSEDED] CircleCI-first development direction — historical architecture snapshot

**This section supersedes the earlier Znect Build / GitHub Actions alignment recorded in sections 3, 8–16 wherever it conflicts with the user's latest direction.**

- **CI Bridge source and validation executor:** CircleCI. The Bridge repository will own a CircleCI configuration and use CircleCI pipelines to run its own dependency, typecheck, unit-test, smoke-script and Wrangler dry-run checks. Znect Build / GitHub Actions is not the executor for CI Bridge validation.
- **CircleCI as observed provider:** the Bridge's CircleCI API v3 adapter remains read-only for inspecting registered projects' runs, workflows, jobs, logs, test reports, artifacts and webhook events. ChatGPT access must not expose trigger/retry/cancel/configuration-write operations.
- **ChatGPT channel:** free authenticated Browser JSON API plus a private report handoff. MCP is not required and is not the supported channel. Do not rely on GitHub Actions as a report runner or on paid services.
- **Znect Build:** retain its own separate role for other Znect projects. The znect-ci-bridge/worker-validation GitHub Actions target/recipe is superseded for CI Bridge and must not be enabled or executed. Preserve the Forge android-debug execution freeze.
- **Repository inventory — (выполнено):** inspected the active All Plugins engineering branch, the CI Bridge source/docs/package and the isolated Znect Build registry/workflow/roadmap. The Build repository currently contains a disabled CI Bridge target and a Node/Worker GitHub Actions recipe; these are existing source changes, not executed validation.
- **CircleCI config discovery — (выполнено):** no .circleci/config.yml exists at the inspected paths on the active CI Bridge branch; the roadmap records that the previous standalone CircleCI config was removed. A CircleCI-native validation pipeline therefore still needs to be authored and reviewed.
- **Documentation conflict inventory — (выполнено):** README, assistant-channel guide, usage guide and earlier roadmap sections still contain stale GitHub Actions/Znect Build ChatGPT-handoff or validation statements. They must be reconciled to this section.
- **No execution claim:** no CircleCI pipeline, GitHub Actions workflow, tests, typecheck, deployment or live provider request was run as part of this audit.

### Compact remaining stages

1. **CircleCI pipeline and project integration:** add a minimal CircleCI config for CI Bridge validation, pin Node/toolchain and commands, define safe workflow filters and free-tier constraints; document required CircleCI project setup. Do not enable paid add-ons or auto-refill.
2. **ChatGPT private access path:** make the authenticated Browser API the primary interface, add a bounded assistant report endpoint/handoff if needed, and remove the GitHub Actions report-runner dependency. Keep MCP optional/legacy.
3. **Architecture cleanup and hardening:** remove or clearly retire the CI Bridge Znect Build adapter/routes/registry instructions that are no longer part of this plugin's role; preserve CircleCI read-only boundaries, project ownership, webhook security, redaction and response limits.
4. **Private ChatGPT access design:** inspect supported ChatGPT connector/authentication capabilities and choose a free, secure way to authorize the private Browser JSON API. Keep `WEB_ACCESS_TOKEN` out of URLs, chat, source and logs; do not disable authentication or expose an unauthenticated report route. If no supported direct-auth path exists, document the precise platform limitation and a safe user-approved alternative without presenting it as direct automatic access.
5. **Verification and handoff:** validate source and CircleCI pipeline results only after the pipeline is configured and explicitly authorized; distinguish source review, executed CircleCI checks, live CircleCI API verification and deployment. Update this roadmap at each stage and mark completed source work (выполнено).


### Stage 2 progress — CircleCI pipeline source added (2026-11-18)

- Added the root `.circleci/config.yml` to the isolated CI Bridge engineering branch. It pins the CircleCI Node image to 24.11.0 and defines dependency installation, typecheck/unit tests, smoke-script syntax validation and Wrangler dry-run **(выполнено — source configuration)**.
- The validation job uses a small resource class, requires no secrets, and has no deploy step or CircleCI API mutation capability **(выполнено — source configuration review)**.
- Updated the README and ChatGPT channel guide to remove GitHub Actions as the active CI Bridge validation/report executor and document the free Browser API + private report handoff direction **(выполнено — documentation source update)**.
- The new config has not yet been confirmed by a CircleCI run. No typecheck, unit tests, smoke check, Wrangler dry-run or live CircleCI API request is claimed as passed.
- Remaining in this stage: verify CircleCI project integration/branch checkout and the first pipeline result, then address any actual failure. Do not enable paid features or auto-refill.

### Stage 3 — private ChatGPT Browser API access (2026-11-18)

- `/api/v1/report` is implemented as a bounded, read-only aggregate endpoint protected by the existing Browser API Bearer authentication **(выполнено — source implementation; execution pending)**.
- Regression-test source covers report query/auth guards, successful CircleCI + event aggregation, correlation, provider-field secret redaction and graceful event-store failure **(выполнено — test source added; execution pending)**.
- The report endpoint and its authentication contract have received source-level inspection **(выполнено — static inspection only)**.
- **Open design blocker:** the existence of a private HTTP endpoint does not establish that ChatGPT can call it with the required Bearer header. A supported ChatGPT authentication/connector mechanism has not yet been identified or verified.
- Supported ChatGPT authentication options researched **(выполнено — documentation review)**: GPT Actions support API-key authentication in Bearer mode, but new GPT creation is unavailable on personal ChatGPT accounts, including Free, Go, Plus and Pro. This makes GPT Actions unsuitable as a newly created integration for this personal Free account. Existing GPTs may remain usable/editable only where account and permission requirements allow; no existing user-owned GPT has been established in this work.
- The Plugin Creator path currently documented for cloud plugins is Sites MCP-based; adopting it as the mandatory report transport would conflict with the explicit no-MCP architecture requirement. No non-MCP native custom REST connector with a securely managed Bearer credential was identified in the reviewed supported options.
- Next: retain the authenticated Browser API and document the direct ChatGPT-access blocker. Revisit only if OpenAI provides a supported non-MCP custom REST connector/authentication route for personal accounts, or if the user explicitly changes the no-MCP constraint. Do not create a public unauthenticated route, put credentials in URLs/chat/source/logs, request the existing `WEB_ACCESS_TOKEN`, or substitute a paid intermediary.
- Do not request or expose the existing `WEB_ACCESS_TOKEN`. Do not change authentication controls merely to make a generic browser request work.
- No test execution, CircleCI pipeline, live Browser API request, connector authentication test, deployment or secret inspection has been performed for this stage.


### Stage 3 research result — ChatGPT authentication compatibility (2026-11-18)

- Reviewed current OpenAI documentation for GPT Actions, GPT creation/availability, and plugin creation architecture.
- GPT Actions can call REST APIs and support API Key authentication configured as Bearer; this is technically compatible with the Browser API authentication style **(выполнено — documented capability)**.
- OpenAI currently states that personal accounts, including Free, Go, Plus and Pro, cannot create or publish new GPTs. The user account context for this work is Free, so a new GPT Action cannot be created through the personal account **(выполнено — documented plan limitation)**.
- Existing GPTs remain available, and editing an existing GPT depends on eligibility and permissions; no existing user-owned GPT suitable for this integration has been confirmed. Do not assume this route is available.
- The installed Plugin Creator workflow defaults to a cloud plugin hosted with Sites MCP. This is not accepted as a replacement because the CI Bridge architecture explicitly excludes MCP as a required ChatGPT access channel.
- **Current conclusion:** no supported, free, non-MCP direct ChatGPT-to-Browser-API authentication path has been established for this personal Free account. The report endpoint remains private and Bearer-protected; no auth weakening or unauthenticated fallback is warranted.
- This is a platform/access limitation, not a defect in `/api/v1/report`. Revisit if OpenAI offers a supported non-MCP custom REST connector for personal accounts, or if the user explicitly changes the no-MCP constraint.
- No plugin/GPT was created, no connector was connected, no secret was requested/read, no API request or tests were run, and no CircleCI pipeline/deployment was started.

### Stage 3 research update — native ChatGPT apps and safe fallback (2026-11-18)

- Reviewed current OpenAI documentation for custom MCP connections and the Apps SDK. The Apps SDK is built on MCP; it is not a separate direct-REST transport. **(выполнено — official documentation review)**
- OpenAI documents custom MCP server connections/full MCP support for Business and Enterprise/Edu workspaces; the documented connection flow is web-only, not mobile. This does not provide a usable native custom REST/Bearer connector for this personal Free account. **(выполнено — official documentation review)**
- Therefore, the direct ChatGPT → private Browser JSON API path remains blocked by current ChatGPT platform capabilities. Do not change /api/v1/report authentication and do not substitute an MCP transport.
- **Next implementation direction:** design a user-operated local report exporter as a fallback, not as direct automatic ChatGPT access. It must retrieve only the bounded read-only report, keep the Bearer credential inside the user's device secure storage, write a redacted JSON report to a user-selected local destination, and let the user explicitly attach/share that report to ChatGPT. No background upload, public link, cloud intermediary, GitHub Actions runner or credential transfer into chat.
- Because the user's primary client is Android, evaluate an Android-native companion/exporter using Android Keystore and the system Sharesheet before choosing a generic Node/Termux CLI. Do not assume Termux or any particular local runtime is installed.
- Keep this fallback separately labelled **manual secure report handoff**; it does not satisfy the original direct automatic ChatGPT access requirement.
- No exporter source code has been added yet. No secrets were requested/read, no API request was made, and no tests, CircleCI pipeline, build or deployment was run.

- Added `documentation/ANDROID_REPORT_EXPORTER_DESIGN.md` with the proposed Android-native manual handoff architecture: Keystore-backed credential storage, fixed-origin HTTPS GET-only access to `/api/v1/report`, bounded report validation, private temporary export and explicit Sharesheet sharing. **(выполнено — design specification only; no app source or runtime verification)**
### [SUPERSEDED] Android exporter implementation update — removed companion path

- Created isolated branch `feature/ci-bridge-android-exporter` from the report-handoff research branch.
- Added a native Kotlin Android application module under `plugins/znect-ci-bridge/android-exporter/` (application ID `com.znect.cibridge.exporter`, minSdk 26, target/compile SDK 35, JDK 17).
- Implemented local configuration, AES-GCM encryption of the Browser API Bearer token with a non-exportable Android Keystore key, strict HTTPS-origin validation, fixed GET-only `/api/v1/report` request, redirect rejection, 100 KB response cap, report identity/read-only validation, defensive credential-field checks, private temporary JSON export and explicit Android Sharesheet sharing.
- Disabled cleartext traffic and restricted TLS trust anchors to the Android system store. No background work, analytics, cloud upload, MCP or pipeline mutation capability was added.
- Added unit-test source for strict HTTPS-origin validation. **Test execution pending; no build or APK was produced.**
- No live API request was made; no token or other secret was requested/read. No CircleCI pipeline, CI workflow, build, deployment or device installation was run.
- Remaining work: source review and additional test coverage; then, only after explicit authorization, local Gradle build, tests and Android device verification as separate steps.


## 10. [SUPERSEDED] Development log — Android exporter and CircleCI alignment

- Confirmed the root `.circleci/config.yml` exists on the Android exporter branch and defines validation only: `npm ci`, `npm run check`, smoke-script syntax check and Wrangler dry-run; it contains no deploy step.
- Confirmed `Znect-god/znect-build` is a separate central build repository whose current README documents GitHub Actions as its executor. This remains separate from CI Bridge source development and its CircleCI validation; no Znect Build workflow was invoked.
- Confirmed the report schema emitted by `/api/v1/report`: `service`, `report_version`, `provider`, `permissions`, `project`, `connection`, `runs.items`, `events.items`, `completeness`, and `read_only`.
- Hardened Android report validation to check the actual CircleCI report schema, ISO-8601 generation timestamp, connection metadata, array bounds/counts and completeness section.
- No CircleCI pipeline, Gradle build, unit test, live API request, deployment or secret access was performed.


## 11. Verification review — 2026-11-18 (authorization received)

- User approved proceeding with verification.
- Inspected `.circleci/config.yml`: it defines a single Worker validation job (`npm ci`, `npm run check`, smoke-script syntax check, Wrangler `deploy --dry-run`) and contains no Android exporter job.
- Inspected Android exporter module: Gradle project files and test source exist, but `gradlew` and `gradle/wrapper/gradle-wrapper.properties` are absent. Android Gradle verification cannot be reproduced from the repository as currently committed.
- Checked commit status/check-runs for candidate SHA `5a2ef7800f41191118791cd3adc8aab77730be4a`: no CircleCI status was reported. The one completed successful check is `Workers Builds: znect-ci-bridge` from the Cloudflare GitHub App, not CircleCI; it must not be reported as CircleCI validation.
- No CircleCI run could be started or inspected because this session has no authenticated CircleCI API/control connection. No GitHub Actions, pipeline, Gradle tests/build, deployment, live API request or secret access was used as a substitute.


## 12. [SUPERSEDED] Android exporter build wiring review

- Added the missing Kotlin Android Gradle plugin to the root and app module build scripts; Kotlin source files are now explicitly included in the Android compilation configuration **(выполнено — source configuration)**.
- Pinned a mutually compatible toolchain: Android Gradle Plugin 8.7.2, Kotlin Gradle Plugin 2.1.10 and Gradle Wrapper 8.9, with Java/Kotlin bytecode target 17 **(выполнено — source configuration; compatibility checked against upstream version matrices)**.
- The CircleCI Android job already invokes testDebugUnitTest and assembleDebug; it will now compile the Kotlin source instead of silently omitting the Kotlin plugin configuration.
- No local Gradle execution or APK build has been performed in this session. CircleCI execution remains unverified until a run result is observable; no passing status is claimed.
- Remaining: inspect the first CircleCI Android job result, fix any observed failure, then complete a user-device install/runtime check separately. The CircleCI read-only ChatGPT access limitation remains open; no credential/authentication boundary was weakened.


## 13. CircleCI execution scope hardening — 2026-11-18

- Restricted both CI Bridge validation jobs to the isolated `feature/ci-bridge-android-exporter` branch and repository default branch `main`; unrelated branches will not consume CI minutes from this workflow **(выполнено — CircleCI configuration)**.
- Confirmed the configured `cimg/android:2024.01.1` Docker image is a published CircleCI Android image with JDK 17 and Android SDK tooling; the job installs API 35 platform/build-tools explicitly **(выполнено — official image metadata/documentation review)**.
- The branch's latest GitHub commit currently has no check runs or commit statuses. This does not prove that CircleCI is disconnected, but no CircleCI execution result is presently available to verify.
- No workflow dispatch, pipeline mutation, deployment, or secret access was performed.


## 14. [SUPERSEDED] Android CI artifact handoff

- Added CircleCI test-result collection and debug APK artifact storage after the Android test/build command **(выполнено — CircleCI configuration)**.
- The artifact is a debug APK for manual review/install only; no release signing, publishing, deployment, or automatic device installation is configured.
- Documented the artifact path in the Android exporter README. Artifact availability remains conditional on a successful CircleCI job; no APK artifact is currently verified.


## 15. [SUPERSEDED] Android Bearer credential validation hardening

- Extracted Bearer token validation into a separately testable policy and aligned the accepted characters with RFC 6750 `b64token`, including underscore. The previous validator rejected tokens containing `_`, which could block valid CircleCI-style credentials **(выполнено — source fix)**.
- Added JVM tests for underscore and other allowed characters, whitespace/CRLF header-injection rejection, empty input and the 4096-character boundary **(выполнено — test source added; execution pending)**.
- The Android app still accepts credentials only through its local UI and stores them encrypted with Android Keystore. No token was requested, copied, or transmitted during this change.
- Remaining validation is unchanged: CircleCI run, APK artifact and physical-device check are not yet verified.


## 16. [SUPERSEDED] Android report validation and disconnect hardening

- Tightened the report validator to enforce requested/returned limits, failed-run count bounds, object-only run/event entries, non-negative event cursor and consistency between event availability and completeness metadata **(выполнено — source fix)**.
- Added JVM test cases for inconsistent failed counts, malformed item types, mismatched completeness flags and out-of-contract requested limits **(выполнено — test source added; execution pending)**.
- Updated Disconnect to clear all locally stored settings, encrypted credential data and cached report files, and to report separately if Android Keystore alias cleanup cannot be verified **(выполнено — source fix)**.
- Runtime tests, CircleCI execution and device verification remain pending; no build success is claimed.


## 17. [SUPERSEDED] Android report schema type strictness

- Changed the Android validator to inspect actual JSON primitive types rather than coercing strings through `optInt`/`optLong`; report version, counters, requested limits and event cursor must be JSON numbers, while identity/permission fields must have their declared types **(выполнено — source fix)**.
- Added three JVM regression tests for numeric strings in counters, string report versions and string event cursors **(выполнено — test source added; execution pending)**.
- Updated Android exporter documentation to 17 report-schema/privacy test cases. Across the module, 8 origin + 17 report + 3 Bearer policy tests are authored (28 total); none has been executed.
- No Gradle build, CircleCI run, APK creation, live API request, deployment or secret access was performed.


## 18. [SUPERSEDED] Android disconnect cleanup verification

- Hardened Disconnect so cached report deletion is checked instead of assuming every file was removed; the UI now distinguishes verified cleanup from a failed cache-deletion attempt **(выполнено — source fix)**.
- Keystore alias deletion and cached-report deletion are reported independently, while preferences and encrypted credential clearing remain synchronous and checked.
- No Android runtime, filesystem fault-injection, Gradle test or CircleCI execution was performed; source behavior still requires device verification.


## 19. [SUPERSEDED] Android event cursor numeric compatibility

- Aligned the Android report validator with the Worker API's `Number.isSafeInteger(after)` contract: event cursors must be non-negative JSON integers no larger than JavaScript's maximum safe integer **(выполнено — source fix)**.
- Added a regression test for a cursor above the safe-integer range **(выполнено — test source added; execution pending)**.
- Android module test sources now total 40 cases: 8 origin + 18 report-schema/privacy + 3 Bearer-token + 11 CircleCI connection-status tests. None has been executed; build and device checks remain pending.

## 20. [SUPERSEDED] Android report handoff integrity and lifecycle

- The Android exporter now binds a report to the exact CircleCI connection selected in local configuration; a valid report for a different connection is rejected before export **(выполнено — source fix)**.
- The response must declare JSON media type before parsing. Private report writes now use a temporary file and rename-based finalization, and prior cache cleanup is checked **(выполнено — source fix)**.
- Activity teardown now suppresses late UI callbacks and avoids publishing a report after destruction; in-flight executor work is interrupted on teardown **(выполнено — source fix; device lifecycle verification pending)**.
- Added two report-validator regression tests for selected-connection acceptance and mismatch rejection. Android test sources then totaled 31 cases: 8 origin + 20 report-schema/privacy + 3 Bearer-token tests; execution remains pending.
- No Gradle tests, APK build, CircleCI run, live API request, deployment or device verification was performed.


## 21. Exact event cursor integer bounds — 2026-11-18

- Replaced floating-point range comparisons in the Android JSON integer validator with exact decimal comparisons. This closes a precision edge case where the largest safe JavaScript integer and the next integer can round to the same IEEE-754 double **(выполнено — source fix)**.
- Added a regression test for a floating-point event cursor at (2^{53}), in addition to the existing oversized-Long test **(выполнено — test source added; execution pending)**.
- Android test sources now total 32 cases: 8 origin + 21 report-schema/privacy + 3 Bearer-token tests. None has been executed.
- No build, CircleCI run, APK, live API call, deployment or device verification was performed.

## 22. Browser API authentication boundary regression tests — 2026-11-18

- Added Worker tests proving the MCP bearer token cannot authenticate to the separate Browser JSON API, and that an authenticated POST is rejected with `405 Allow: GET` before provider access **(выполнено — test source added; execution pending)**.
- These tests preserve the separate `WEB_ACCESS_TOKEN` boundary and GET-only report handoff. They do not add MCP-based CircleCI access or any write capability.
- The Android module has 32 authored JVM test cases; Worker tests have been extended by two cases. No test suite or CircleCI job has been executed.

## 23. [SUPERSEDED] Android temporary-report retention verification

- Startup TTL cleanup now checks whether expired cached report files/directories were actually removed and surfaces a warning when cleanup cannot be verified **(выполнено — source fix)**.
- Before a new report is accepted, the exporter now requires the private cache directory to be inspectable and verifies removal of prior temporary reports; it does not silently treat a failed directory listing as successful cleanup **(выполнено — source fix)**.
- No Android filesystem fault-injection, Gradle test, APK build, CircleCI run or device verification was performed.

## 24. [SUPERSEDED] Android request cancellation on Activity teardown

- The exporter now tracks its active HTTPS connection and disconnects it when the Activity is destroyed, in addition to interrupting the executor and suppressing late UI callbacks **(выполнено — source fix; Android runtime verification pending)**.
- A queued request exits before decrypting the local credential when its Activity has already been destroyed. An in-flight request is disconnected on teardown; network cancellation behavior still requires device verification.
- The response decoder now rejects malformed UTF-8 rather than silently replacing invalid byte sequences before JSON validation **(выполнено — source fix)**.
- No Gradle test, APK build, CircleCI run or device verification was performed.

## 25. [SUPERSEDED] CircleCI dependency audit coverage — historical executor snapshot

- Added `npm audit --audit-level=high` to the CircleCI Worker validation job immediately after deterministic `npm ci`, so dependency advisories are checked by the current CircleCI executor rather than relying only on historical GitHub Actions evidence **(выполнено — CircleCI config source)**.
- Updated the CircleCI setup guide and project README. No audit command or CircleCI job has been run on the current branch; result remains unverified.

## 26. [SUPERSEDED] Android connection selection guidance

- Updated the connection field hint and setup documentation: `connection_id` may be omitted only when the selected project has exactly one CircleCI connection; projects with multiple connections require an explicit ID **(выполнено — UI/docs clarification)**.
- The returned report is independently checked against the selected connection ID when one is supplied.


## 7. [SUPERSEDED] Android connection-check behavior

- [x] Add a user-triggered **Check CircleCI ↔ ChatGPT handoff** action to the Android exporter **(выполнено — source implementation)**.
- [x] Probe authenticated `GET /api/v1/status` with the locally stored Bearer credential; enforce HTTPS, GET-only, redirect rejection, timeouts and an 8 KB response ceiling **(выполнено — source implementation)**.
- [x] Validate service identity, CircleCI provider, expected project/connection, explicit read-only permission, provider availability and recent-run probe result **(выполнено — source implementation)**.
- [x] Follow the status probe with the bounded `GET /api/v1/report` request and existing report/privacy validation to test the assistant-facing report endpoint **(выполнено — source implementation)**.
- [x] Add eleven JVM regression tests for the connection-status response validator **(выполнено — test source added; execution pending)**.
- [x] Serialize report fetch and connection checks through the existing single-thread executor; disable conflicting actions while a request is active **(выполнено — source implementation)**.
- [ ] Verify the button and network behavior on a physical Android device.
- [ ] Verify a real CircleCI-backed response from CircleCI-run validation/Preview evidence.
- [ ] Establish a supported direct ChatGPT authentication mechanism for the private API. The Android check cannot attest that ChatGPT itself has an active authenticated session; it proves only that the Bridge endpoint and CircleCI read path respond to the app's credential.


## 8. [SUPERSEDED] Android connection-check hardening

- [x] Match the Android status validator against the actual Worker `GET /api/v1/status` response contract: `service`, `connected`, `provider`, project/connection identity, provider availability, read-only permission and `read_probe.recent_runs_available` **(выполнено — source review)**.
- [x] Preserve the server's safe provider/read-probe failure reason in the Android UI rather than collapsing it into a generic network message **(выполнено — source implementation)**.
- [x] Add regression cases rejecting negative and fractional recent-run counts **(выполнено — test source added; execution pending)**.
- [x] Android connection-status validator suite now contains 11 cases; Android total is 40 authored JVM test cases **(выполнено — source count reviewed; execution pending)**.
- [ ] Execute all 40 Android JVM tests and assemble the debug APK through CircleCI; no successful CircleCI result has been retrieved.
- [ ] Verify the status and report calls against a real configured CircleCI connection and test the manual report handoff on Android.
- [ ] Direct ChatGPT authentication remains an explicit platform integration blocker; do not describe manual Sharesheet handoff as automatic ChatGPT connectivity.


## 9. [SUPERSEDED] CI executor isolation — historical CircleCI snapshot

- [x] Retire the legacy GitHub Actions Cloudflare Preview workflow on this engineering branch. It is now inert: its job is hard-disabled and it performs no checkout, runner allocation, Preview deployment or secret access **(выполнено — workflow source updated)**.
- [x] Keep `.circleci/config.yml` as the only CI Bridge validation workflow definition; it contains Worker validation and Android test/APK jobs and no deployment command **(выполнено — source inspection)**.
- [ ] Confirm CircleCI project integration recognizes this repository and branch, then retrieve actual CircleCI job/test/artifact results. No CircleCI run result is currently available.
- Note: externally configured Cloudflare Workers Builds may still react to repository commits independently; such activity is not CI Bridge validation and must not be treated as CircleCI evidence. Do not change Cloudflare account settings from this workflow.


## 27. [SUPERSEDED] Android action recovery and CircleCI status API test correction

- [x] Restore the Android connection-check button after a failed report fetch; previously it could remain disabled until Activity recreation **(выполнено — source fix)**.
- [x] Remove duplicate button-state restoration in the connection-check error handler **(выполнено — source cleanup)**.
- [x] Fix the Worker CircleCI status API test to provide its required `project_id=znect-forge` query parameter. The previous test invoked the endpoint without required project scope and expected a success response, inconsistent with the handler's 400 validation **(выполнено — test source fix)**.
- [x] Strengthen the status API test to assert `provider_availability`, read-only permission and the exact registered CircleCI connection ID/status **(выполнено — test source fix)**.
- [ ] Execute Worker and Android test suites in CircleCI. Source corrections are not evidence of passing tests.


## 28. CircleCI connection-check clarity and provider-failure coverage — 2026-11-18

- [x] Correct Android connection-check progress text and button label: the action is now **Check CircleCI + ChatGPT report path**, and the result explicitly says it does not authenticate a ChatGPT conversation **(выполнено — UI wording corrected)**.
- [x] Add Worker coverage for an unavailable CircleCI read probe, including safe generic error output, absence of false read-only/connected claims, and GET-only upstream calls **(выполнено — test source added)**.
- [ ] Run the updated Worker and Android suites in CircleCI and inspect the actual test results and APK artifact.
- Note: the Android check verifies the app's authenticated Bridge → CircleCI read path and report endpoint. It does not prove a separate ChatGPT session has connected or consumed the report.


## 29. Repository boundary audit — 2026-11-18

- [x] Rechecked the separate `Znect-god/znect-build` project documentation and the shared `Znect-god/znect-all-plugins` implementation **(выполнено — repository source review)**.
- [x] Confirmed that Znect Build documents its own central orchestration through GitHub Actions and explicitly states that it performs no CircleCI actions; it is a separate system and is not the CI executor for CI Bridge validation **(выполнено — boundary documented)**.
- [x] Keep CI Bridge validation isolated to the CircleCI workflow in `.circleci/config.yml`; do not treat Znect Build or GitHub Actions statuses as CircleCI evidence **(выполнено — scope confirmed)**.
- [ ] Verify that the CircleCI project is connected to `Znect-god/znect-all-plugins` and obtain actual CircleCI job results. No CircleCI-specific connected action is available in this session, so this operational verification remains pending.


## 30. Current-state documentation reconciliation — 2026-11-18

- [x] Refresh the README's authoritative snapshot to report 40 authored Android JVM tests (not the obsolete 32-case count) and the expanded Worker regression coverage **(выполнено — documentation updated)**.
- [x] Reframe the historical Forge GitHub Actions report-collector experiment as superseded; it is not the active ChatGPT channel or CI Bridge executor **(выполнено — documentation clarified)**.
- [x] Correct the assistant-channel guide: Android authenticates to the private Bridge API and shares a validated report manually through Sharesheet; it does not authenticate a ChatGPT conversation or provide automatic direct API access **(выполнено — documentation corrected)**.
- [ ] Continue reviewing historical roadmap entries and supporting docs for stale architecture statements; latest CircleCI-first sections remain authoritative where older notes conflict.
- [ ] Execute the current source on CircleCI and retrieve actual Worker test results, Android test results and the debug APK artifact.


## 31. Historical documentation consistency pass — 2026-11-18

- [x] Remove the stale statement that a current GitHub Actions Preview workflow installs `CIRCLECI_WEBHOOK_SECRET`; the GitHub Actions workflow is retired/inert and is not a secret-delivery path **(выполнено — README corrected)**.
- [x] Reconcile the Android README test breakdown to 8 origin + 18 report/privacy + 3 Bearer-token + 11 CircleCI status cases = 40 authored JVM tests **(выполнено — documentation corrected; execution pending)**.
- [x] Correct the active Android inventory's report-schema/privacy test count from 10 to 18; preserve earlier 17/21/32 counts only as dated historical snapshots **(выполнено — roadmap reconciled)**.
- [x] Keep the CircleCI setup guide explicit that validation jobs require no CircleCI API token and that a configuration commit alone is not proof of a successful run **(выполнено — reviewed)**.
- [x] Recheck the Android README and assistant-channel guide: both correctly describe the app as a manual Sharesheet report exporter and distinguish its CircleCI read-path check from ChatGPT session authentication **(выполнено — reviewed)**.
- [ ] Continue checking older README/roadmap passages for historical claims that could be mistaken for current CI executor, secret-delivery or ChatGPT authentication behavior.
- [ ] Connect/confirm the CircleCI project and retrieve actual Worker tests, Android tests and APK artifact from CircleCI; no run result is available in this session.

## 32. Current access-channel and operating-guide reconciliation — 2026-11-18

- [x] Rewrite `documentation/FREE_ACCESS_PLAN.md` to describe the private authenticated Browser JSON API, Android manual Sharesheet handoff, no required MCP, CircleCI-only validation execution, and the unverified automatic ChatGPT-authentication limitation **(выполнено)**.
- [x] Add an authoritative changelog correction that explicitly supersedes historical GitHub Actions inbox/report collector and Znect Build executor proposals **(выполнено)**.
- [x] Replace the stale multi-branch `documentation/USAGE_GUIDE.md` with a current CircleCI setup, Browser API, Android exporter, security and verification guide **(выполнено)**.
- [x] Clarify in `documentation/SECURITY_REVIEW.md` that MCP-specific security findings concern only the legacy optional surface and do not define the ChatGPT access channel **(выполнено)**.
- [ ] Continue source-level review of Worker routes, CircleCI v3 adapter ownership checks, Android lifecycle/concurrency and report validation; add focused regression tests for any concrete defect.
- [ ] Run the CircleCI workflow for the current branch HEAD and retrieve actual Worker test results, Android test results and debug APK artifact. No such run/result is currently available.
- [ ] Verify Android behavior on a physical device and separately resolve the supported automatic ChatGPT-to-private-API authentication limitation.

**Verification boundary:** these are documentation/source commits only. They do not establish that tests passed, CircleCI ran, an APK was assembled, ChatGPT authenticated to the API, or any Preview/Production deployment occurred.

## 33. [SUPERSEDED] Android configuration mutation guard and source security review

- [x] Review CircleCI v3 request construction, fixed API origin, GET-only behavior, redirect handling, bounded JSON/text reads, project/run/workflow/job ownership checks, artifact path matching and artifact-host allowlisting **(выполнено — source review)**.
- [x] Review the CircleCI adapter's scope checks and its run/workflow/job relationship validation **(выполнено — source review)**.
- [x] Add an Android guard that prevents saving or replacing the locally encrypted credential/configuration while a status or report request is in flight; this closes a UI race where a request could combine captured project/origin values with a newly saved token **(выполнено — source fix)**.
- [ ] Add focused automated coverage for configuration mutation/request coordination where the Android architecture permits it.
- [ ] Continue source review of Worker auth/routing and Android report lifecycle; fix only concrete findings.
- [ ] Execute Worker and Android suites in CircleCI, inspect test reports and retrieve the debug APK. No execution or APK artifact is claimed by this source change.
- [ ] Verify the connection check and manual report handoff on a physical Android device; direct ChatGPT session authentication remains unproven.

**Verification boundary:** the Android configuration guard is committed source code, not an executed test result. CircleCI has not been queried from this session and no CI run is asserted.

## 34. Artifact fetch boundary hardening — 2026-11-18

- [x] Re-check the CircleCI artifact URL path from provider metadata through redirects **(выполнено — source review)**.
- [x] Enforce the HTTPS artifact-host allowlist inside `fetchAllowedArtifact` itself, not only in its current caller; untrusted initial URLs now fail before any network request **(выполнено — source fix)**.
- [x] Add a regression test proving an untrusted initial artifact URL is rejected without calling `fetch` **(выполнено — test authored)**.
- [ ] Run the Worker/security suite in CircleCI and inspect the actual test report.
- [ ] Continue the remaining Worker and Android lifecycle review; keep source changes limited to concrete findings.
- [ ] Retrieve and verify the CircleCI Android test result and debug APK; perform device verification and resolve the separate ChatGPT authentication limitation.

**Verification boundary:** source and regression-test changes are committed. The new test has not been executed in this session; no CircleCI run, green status, or APK artifact is claimed.


## 35. Worker read API and [SUPERSEDED] Android export boundary review

- [x] Re-review authenticated Browser JSON API routing: Bearer verification, constant-time comparison, failed-auth rate limiting, authenticated-request rate limiting, GET-only enforcement, no-store JSON responses and bounded report serialization **(выполнено — source review)**.
- [x] Re-review `/api/v1/status` and `/api/v1/report`: registered project/connection selection, CircleCI-only provider selection, bounded query parameters, safe provider failure responses, bounded event-store parsing and explicit read-only report metadata **(выполнено — source review)**.
- [x] Re-review CircleCI v3 adapter ownership boundaries: run membership is verified against the project-scoped collection and explicit project reference; workflow and job references are checked before logs, tests or artifacts are read **(выполнено — source review)**.
- [x] Re-review Android export boundaries: backup disabled, cleartext traffic disabled, system trust anchors only, FileProvider limited to the private reports cache, non-exported provider, local Keystore-backed credential storage and explicit read-only Sharesheet grant **(выполнено — manifest/resource/source review)**.
- [x] Re-review Android report validation and lifecycle handling: bounded response reads, schema/project/connection checks, sensitive-key rejection, serialized network actions, request cancellation on Activity destruction and temporary-file cleanup paths **(выполнено — source review)**.
- [ ] No new source defect was confirmed in this pass; do not introduce speculative code changes. Continue with targeted review and add regression tests only for reproducible findings.
- [ ] Execute Worker/security and all 40 authored Android JVM tests in CircleCI; inspect actual test reports and retrieve the debug APK. No execution or APK artifact is claimed.
- [ ] Verify the real CircleCI-backed status/report path and manual Sharesheet handoff on a physical Android device. The app's check still does not prove that a separate ChatGPT conversation is authenticated.

**Verification boundary:** this section records static source review only. It does not establish passing tests, a CircleCI run, an assembled APK, device verification, automatic ChatGPT authentication or deployment.


## 36. [SUPERSEDED] Enforce temporary report expiry at Android share time

- [x] Confirmed a lifecycle gap: the 30-minute cache cleanup previously ran only when the Activity was created, so a report could remain shareable beyond its intended TTL if the app stayed open **(выполнено — concrete source finding)**.
- [x] Add a dedicated report-expiry policy with explicit TTL boundary handling **(выполнено — source implementation)**.
- [x] Enforce expiry immediately before opening Android Sharesheet; expired reports are not shared, are deleted when possible, and the UI requires a fresh fetch **(выполнено — source fix)**.
- [x] Reuse the same expiry policy during startup cache cleanup **(выполнено — source refactor)**.
- [x] Add five JVM regression cases for fresh, exact-boundary, stale, future-dated and invalid-TTL inputs **(выполнено — tests authored; execution pending)**.
- [x] Update Android documentation to describe the expiry behavior and 45 authored JVM test cases **(выполнено — documentation updated)**.
- [ ] Execute all 45 Android JVM tests and assemble the debug APK through CircleCI; no test result or APK is claimed.
- [ ] Verify expiry and manual Sharesheet behavior on a physical Android device.

**Verification boundary:** source and tests are committed, but the five new tests have not been executed. The CircleCI run, APK assembly and physical-device behavior remain unverified.

## 37. [SUPERSEDED] Remove the remaining GitHub Actions CI Bridge executor — historical snapshot

- [x] Inspect all CI Bridge workflow files in the active engineering branch and identify the still-active `.github/workflows/znect-ci-bridge.yml`, which ran validation on pull requests and pushes to `main` **(выполнено — concrete configuration finding)**.
- [x] Retire that workflow in place with an inert `if: false` job, empty permissions, and no checkout, runner work, tests, build, deployment or secret access **(выполнено — source/configuration fix)**.
- [x] Preserve the historical workflow file while making `.circleci/config.yml` the sole CI Bridge validation executor **(выполнено)**.
- [x] Reconfirm that the separate `znect-ci-bridge-preview.yml` workflow is also inert **(выполнено — source review)**.
- [ ] Confirm the next validation run is created by CircleCI on this exact branch HEAD; do not use GitHub Actions statuses as CircleCI evidence.
- [ ] Execute Worker checks and all 45 authored Android JVM tests in CircleCI, inspect test reports, and retrieve the debug APK artifact.
- [ ] Verify Android behavior on a physical device and continue the separate ChatGPT private Browser API authentication work.

**Repository responsibility boundary:** `znect-all-plugins` remains the CI Bridge source-development repository. `znect-build` remains a separate central build/orchestration system for Znect project development builds; its GitHub Actions implementation is not reused as the CI Bridge validation executor. The optional Znect Build read-only adapter remains a distinct provider path and must not replace CircleCI in the primary ChatGPT/CircleCI diagnostics flow.

**Verification boundary:** the legacy GitHub Actions workflow was disabled by committed source configuration. This does not establish a CircleCI run, passing tests, APK assembly, device verification or deployment.

## 38. [SUPERSEDED] Final targeted review before CircleCI execution — historical snapshot

- [x] Re-check the authenticated Browser JSON API status/report routes, bounded query parameters, GET-only access, provider error handling and event-page byte limits **(выполнено — source review)**.
- [x] Re-check CircleCI adapter construction and cache lifetime; adapter instances are created per selected request, so failed per-instance promise caches do not persist as a cross-request outage **(выполнено — source review)**.
- [x] Re-check Android temporary report creation, previous-file cleanup, 30-minute expiry enforcement at share time, FileProvider read-only grant and Activity cancellation/disconnection **(выполнено — source review)**.
- [x] Reconcile the Android test inventory at 48 authored JVM cases (8 origin + 21 report validator + 3 Bearer policy + 11 CircleCI status + 5 report-file expiry); execution remains pending **(выполнено — inventory reconciliation)**.
- [x] Reconfirm the CircleCI setup guide specifies the connected GitHub project, .circleci/config.yml, allowed feature branch, two jobs, test-result/APK artifact retrieval and no CI secrets for validation **(выполнено — documentation review)**.
- [ ] Connect/confirm the repository project in CircleCI and obtain an actual workflow run for the exact feature branch HEAD. This session has no CircleCI-specific read integration, so no run can be queried or asserted here.
- [ ] Inspect CircleCI Worker test/audit/dry-run results and Android JUnit report; retrieve the debug APK only from the completed CircleCI job.
- [ ] Install and verify the APK on a physical Android device; separately establish whether the intended private Browser JSON API can be authenticated from a ChatGPT session without manual Sharesheet transfer.

**Verification boundary:** this pass found no additional reproducible source defect, so no speculative code change was made. The GitHub workflow files remain inert; CircleCI is the only configured CI Bridge validation executor. No tests, CircleCI run, APK, device test, ChatGPT authentication or deployment are claimed.


## 39. [SUPERSEDED] Correct Android test inventory across project documentation — historical snapshot

- [x] Count the actual JUnit `@Test` declarations in all five Android test files: 8 origin-policy + 21 report-validator + 3 Bearer-token-policy + 11 CircleCI connection-status + 5 report-file-expiry = **48 authored tests** **(выполнено — source inventory inspected)**.
- [x] Identify and correct the stale report-validator count (18 instead of 21) and stale totals (40/45 instead of 48) in the Android README, Assistant Channel, Free Access Plan and Usage Guide **(выполнено — documentation commits)**.
- [x] Update the current roadmap inventory and keep prior sections as historical snapshots of the test inventory at those earlier stages **(выполнено)**.
- [ ] Execute all 48 Android JVM tests and assemble the debug APK through CircleCI; no test result or APK is claimed.
- [ ] Inspect the actual CircleCI Worker and Android job results and retrieve the APK artifact only after a successful run.
- [ ] Verify the exporter on a physical Android device and continue the separate private Browser JSON API / ChatGPT authentication feasibility work.

**Verification boundary:** 48 is the count of authored JUnit test methods, not a passing-test count. No Android test execution, APK assembly, CircleCI run, device test, ChatGPT session authentication or deployment is established by these documentation corrections.


## 40. Harden project component path-prefix validation — 2026-11-18

- [x] Identify a registry-validation gap: component path prefixes were described as safe relative paths but accepted dot segments, encoded traversal strings, backslashes and ambiguous path characters **(выполнено — concrete source finding)**.
- [x] Require non-empty slash-separated path segments restricted to ASCII letters, digits, dot, underscore and hyphen; continue accepting the documented `app/` prefix **(выполнено — source fix)**.
- [x] Reject absolute paths, empty segments, `.` / `..`, percent-encoded traversal/separators, backslashes, query and fragment characters **(выполнено — source fix)**.
- [x] Add focused registry regression cases for dot segments, encoded traversal, backslashes, empty segments, query and fragment input **(выполнено — tests authored; execution pending)**.
- [x] Document the exact path-prefix contract in the project registry guide **(выполнено — documentation updated)**.
- [ ] Run the Worker typecheck and complete Vitest suite through CircleCI; no test result is claimed.
- [ ] Obtain and inspect the actual CircleCI pipeline and Android exporter results/artifact for the current branch head.

**Verification boundary:** this change tightens configuration parsing and adds regression-test source only. No local or CircleCI test execution, APK build, device verification, ChatGPT authentication or deployment is claimed.

## 41. Enforce forward-only incremental event cursors — 2026-11-18

- [x] Identify a defensive validation gap: an event-store response to `after=N` could include a stale event with cursor `<= N`; a single stale record passed the existing ordering and maximum-cursor checks **(выполнено — concrete source finding)**.
- [x] Reject every incremental event cursor that is not strictly greater than the requested cursor **(выполнено — source fix)**.
- [x] Add a Browser API regression test where `after=5` receives cursor `4`; the response must be rejected as invalid event-store data **(выполнено — test authored; execution pending)**.
- [ ] Run the Worker typecheck and complete Vitest suite through CircleCI; no test result is claimed.
- [ ] Verify the current CircleCI workflow, Android test results and debug APK artifact for the exact feature branch HEAD.

**Verification boundary:** the API now fails closed on stale incremental event pages and has a focused regression test. The test has not been executed; no CircleCI run, APK assembly, device verification, ChatGPT authentication or deployment is claimed.


## 42. [SUPERSEDED] Clarify Android connection-check scope — historical snapshot

- [x] Review the Android connection-check flow against its actual behavior: it authenticates to the private Browser JSON API, performs a CircleCI read-only status probe, then validates a bounded report response **(выполнено — source review)**.
- [x] Identify misleading UI wording that named the check as a “ChatGPT report path”, which could imply that ChatGPT itself had authenticated **(выполнено — concrete UX finding)**.
- [x] Rename the action to “Check CircleCI + private report API”; preserve the explicit in-app explanation that this validates Android → CI Bridge → CircleCI and the report endpoint, not a separate ChatGPT session **(выполнено — source fix)**.
- [ ] Run the Android test suite and assemble the debug APK through CircleCI; no execution or artifact is claimed.
- [ ] Verify the revised wording and report handoff on a physical Android device; direct ChatGPT session authentication remains a separate unresolved platform capability.

**Verification boundary:** this is a source/UI wording correction only. It does not establish Android test execution, APK assembly, CircleCI execution, physical-device verification or ChatGPT authentication.

## 43. [SUPERSEDED] Reconcile Android request lifecycle and CircleCI validation configuration — historical snapshot

- [x] Review both Android status/report requests for HTTPS-only origin validation, explicit GET methods, disabled redirects, bounded response reads, JSON content-type checks and Bearer-token non-disclosure checks **(выполнено — source review)**.
- [x] Review request cancellation and Activity teardown: the active HTTPS connection is disconnected and the single-thread executor is shut down when the Activity is destroyed **(выполнено — source review)**.
- [x] Review report-file lifecycle: private cache creation, previous-report cleanup, 30-minute expiry at share time, startup cleanup and read-only FileProvider sharing **(выполнено — source review)**.
- [x] Reconcile CircleCI configuration with the setup guide: the Worker validation and Android test/APK jobs are separate, branch-filtered, non-deploying jobs; Android JUnit results and the debug APK are configured as artifacts **(выполнено — configuration/documentation review)**.
- [x] Audit Android credential and platform boundaries: RFC 6750 Bearer-token character validation, AES-GCM with Android Keystore, app-private preferences, disabled Android backup/cleartext traffic, system-only trust anchors and cache-only FileProvider scope **(выполнено — source/configuration review)**.
- [x] Audit project-registry validation and regression coverage: duplicate project/component/connection identifiers, globally unique CircleCI slugs, provider-specific connection requirements, bounded JSON input, repository/component references and malformed configuration cases **(выполнено — source/test review; test execution pending)**.
- [x] Reconfirm both legacy GitHub Actions workflows are inert (`if: ${{ false }}`) and CircleCI remains the sole configured CI Bridge validation executor **(выполнено — workflow/configuration review)**.
- [x] Complete this extended source/configuration pass without finding another reproducible defect; no speculative source edits were made **(выполнено — review outcome)**.
- [x] Correct the duplicated roadmap section number so the Android connection-check scope item follows sections 40 and 41 **(выполнено — documentation correction)**.
- [ ] Execute Worker validation and all 48 authored Android JVM tests in CircleCI; inspect the actual job results.
- [ ] Retrieve the debug APK from a successful CircleCI job and verify installation and behavior on a physical Android device.
- [ ] Separately establish whether ChatGPT can authenticate to the private Browser JSON API without manual Android Sharesheet handoff; do not infer this from Android's successful API probe.

**Verification boundary:** this pass is source/configuration review only. It does not establish test execution, a CircleCI workflow run, APK assembly, device verification, direct ChatGPT authentication or deployment.


## 44. Add a browser-dashboard assistant report download — 2026-11-18

- [x] Continue the existing Znect CI Bridge Worker and Browser JSON API; reuse the already implemented authenticated `GET /api/v1/report` and `GET /api/v1/diagnostics/{run_uuid}` routes rather than creating another Worker or rebuilding the service **(выполнено — existing source reused)**.
- [x] Add an explicit **Export assistant report** action to the existing browser dashboard for the selected registered project and CircleCI connection **(выполнено — source implementation)**.
- [x] Fetch the bounded aggregate report and retrieve at most three failed-run diagnostic bundles; validate each run UUID and construct same-origin paths instead of following arbitrary endpoint strings **(выполнено — source implementation)**.
- [x] Preserve Bearer authentication in the request header only, GET-only access, in-memory token handling, and scope isolation when the user switches project/connection or disconnects **(выполнено — source implementation)**.
- [x] Mark missing/limited diagnostics in the exported report, enforce a 600 KB total JSON ceiling, and download a single reviewable JSON file for explicit user handoff to ChatGPT **(выполнено — source implementation)**.
- [x] Add dashboard regression coverage for report endpoint use, UUID validation, selected-scope diagnostics, size ceiling, partial-report state and download behavior **(выполнено — test source added; execution pending)**.
- [x] Confirm the central Znect Build recipe runs `npm run check`, which invokes TypeScript typecheck and the complete Vitest suite including dashboard regression tests **(выполнено — recipe/package-script review; execution pending)**.
- [x] Update the assistant-channel guide and README to describe the existing web-dashboard handoff; the redundant Android companion path was subsequently removed in stage 45 **(выполнено — documentation updated and later reconciled)**.
- [ ] Execute the Worker/dashboard regression suite through the central Znect Build validation target; no test execution is claimed.
- [ ] Verify the export action against the existing isolated Cloudflare Preview, including one failed run with diagnostic output and a partial/unavailable diagnostic case. Do not create a new Worker or touch Production.

**Verification boundary:** this is an incremental change to the existing dashboard and reuses the existing private Worker API. Source and regression-test changes are committed, but CircleCI execution and live Preview download have not yet been verified. No Worker deployment, secret access, CircleCI pipeline mutation, Production change or APK build is claimed.


## 45. Remove redundant validation and Android handoff paths — 2026-11-18

- [x] Remove the standalone root `.circleci/config.yml`; CI Bridge validation must use the central Znect Build executor, not an independent CircleCI workflow **(выполнено — file deletion committed)**.
- [x] Remove the optional Android exporter application, its unexecuted JVM test sources, Gradle wrapper, APK pipeline wiring and Android-specific design/setup guides **(выполнено — source/configuration cleanup committed)**.
- [x] Preserve the existing Cloudflare Worker, CircleCI read-only diagnostics adapter, Browser JSON API, webhook inbox, dashboard and bounded assistant-report download **(выполнено — existing core paths retained)**.
- [x] Rewrite the current assistant-channel and free-access documentation to remove Android Sharesheet as a supported route and establish Znect Build as the sole validation executor **(выполнено)**.
- [x] Keep old Android/CircleCI execution notes only as historical records; they are superseded by this cleanup and must not be treated as current instructions **(выполнено)**.
- [x] Keep both legacy GitHub Actions workflow files inert with `if: ${{ false }}` and correct their comments so they point to central Znect Build / explicit Preview authorization rather than CircleCI **(выполнено — workflow source updated)**.
- [x] Inspect the central Znect Build target: `znect-ci-bridge/worker-validation` is registered but `execution_enabled: false`; no validation run was triggered **(выполнено — registry source review)**.
- [x] Inspect the Znect Build recipe and disabled target; align the Worker validation requirements and manifest contract, including a high-severity dependency audit **(выполнено — source review and coordinated source edits)**.
- [ ] Review/merge the central recipe to Znect Build `main` through the approved process; the current feature branch is not yet the adapter's trusted main-branch workflow.
- [ ] Execute the full validation only through Znect Build after explicit authorization; no test run, Preview deployment or Production change is claimed by this cleanup.

**Verification boundary:** this stage removes redundant source/configuration and updates current documentation. It does not establish passing tests, a live Znect Build run, a Preview update, direct ChatGPT authentication or release readiness.


## 46. Align central Znect Build validation and provenance — 2026-11-18

- [x] Inspect the existing central Node/Cloudflare Worker recipe and registered CI Bridge target in `Znect-god/znect-build` **(выполнено — source review)**.
- [x] Add a high-severity dependency audit (`npm audit --audit-level=high`) after deterministic `npm ci` and before typecheck/tests **(выполнено — central recipe source)**.
- [x] Add the audit step to the machine-readable validation manifest and update the Bridge adapter's exact expected-step contract **(выполнено — source implementation)**.
- [x] Add regression tests proving the Bridge accepts the complete recipe provenance and rejects a manifest that omits the dependency audit **(выполнено — test source added; execution pending)**.
- [x] Keep the central target disabled and do not dispatch a workflow, modify secrets, or alter repository settings **(выполнено — registry remains execution_enabled=false)**.
- [x] Update the central registry target notes to list the dependency audit alongside typecheck, Vitest, syntax validation and Wrangler dry-run **(выполнено — registry source updated)**.
- [x] Add central Build contract tests for exact recipe/manifest step order, disabled target policy and no-deploy dry-run semantics; include shell syntax validation in the central Build repository's own validation workflow **(выполнено — test/workflow source; execution pending)**.
- [x] Align the central Build request-validation test fixture with the active CI Bridge feature branch **(выполнено — test fixture updated)**.
- [ ] Review the central recipe changes and their validation on the intended Znect Build branch; no test execution is claimed.
- [ ] Continue with the private report/ChatGPT access path and exact-SHA validation readiness.

**Verification boundary:** the recipe, manifest, adapter contract and regression-test source have been updated in their respective feature branches. Neither branch has been executed or merged by this stage; no CI run, test result, Preview deployment or Production change is claimed.


## 47. Enforce assistant-report export size in bytes — 2026-11-18

- [x] Identify that JavaScript string length counts UTF-16 code units, not the actual UTF-8 JSON file size **(выполнено — concrete source finding)**.
- [x] Construct the JSON Blob before enforcing the 600 KB ceiling and compare `blob.size` in bytes **(выполнено — source fix)**.
- [x] Update the dashboard regression assertion to require the byte-based limit **(выполнено — test source added; execution pending)**.
- [ ] Run the dashboard and full Worker regression suites through the central Znect Build recipe on the exact candidate SHA.

**Verification boundary:** the source and regression-test assertion are committed. No test execution, live Preview download or Znect Build run is claimed.


## 48. Verify aggregate-report diagnostic link contract — 2026-11-18

- [x] Compare the dashboard export's expected report fields with the existing Worker `GET /api/v1/report` response and `GET /api/v1/diagnostics/{run_uuid}` route **(выполнено — source review)**.
- [x] Confirm the report returns UUID run identifiers, failed-run status, same-origin diagnostic paths, selected project/connection scope, and an explicit `diagnostics_included: false` marker before diagnostic bundles are fetched **(выполнено — source review)**.
- [x] Extend the Worker report regression test to assert the exact diagnostic link path and query scope, failed-run count, and initial completeness marker **(выполнено — test source committed; execution pending)**.
- [x] Confirm the dashboard validates UUIDs, reconstructs its own same-origin route, and never follows the endpoint string returned by the API **(выполнено — source review and existing regression assertion)**.
- [ ] Run the report/API/dashboard regression suite through the central Znect Build recipe on the exact candidate source SHA.
- [ ] Verify the same report and diagnostic round-trip against the existing Preview; no deployment or live request is performed in this stage.

**Verification boundary:** the source contract and regression-test assertions now agree. This is static/source-level verification only; test execution and live Preview retrieval remain pending.


## 49. Reconcile plugin metadata and historical architecture notes — 2026-11-18

- [x] Remove the Android exporter from the current plugin description, platform list, dependencies, security controls and assistant handoff metadata **(выполнено — plugin manifest updated)**.
- [x] Move old GitHub Actions/Preview test claims into an explicitly historical evidence section and state that they do not validate the current branch HEAD **(выполнено — metadata reconciliation)**.
- [x] Replace the obsolete CircleCI executor declaration with the central Znect Build target and its current validation command list **(выполнено — metadata reconciliation)**.
- [x] Mark the old CircleCI-first roadmap and changelog entries as superseded historical snapshots **(выполнено — documentation cleanup)**.
- [x] Re-scan active plugin metadata and docs for stale Android exporter and CircleCI-executor claims; remaining matches are confined to explicitly historical changelog/roadmap entries **(выполнено — source/documentation scan)**.
- [ ] Keep the direct ChatGPT authentication limitation explicit until a supported private credential flow is proven; dashboard JSON export remains a manual fallback.

**Verification boundary:** metadata and documentation now describe the current architecture. This does not validate code execution, live Preview behavior, direct ChatGPT authentication or release readiness.


## 50. Verify ChatGPT custom-MCP plan availability boundary — 2026-11-18

- [x] Check current OpenAI Help Center guidance for connecting custom MCP servers in ChatGPT **(выполнено — official documentation review)**.
- [x] Record that the documented availability is Business and Enterprise/Edu, with Pro read/fetch support; Free is not listed as supporting custom MCP server connections **(выполнено — platform-availability finding)**.
- [x] Keep custom MCP optional and explicitly exclude it as a required transport for the Free-tier requirement **(выполнено — assistant-channel guide updated)**.
- [x] Preserve the existing private Browser JSON API and user-reviewed dashboard JSON export as the current fallback; do not weaken authentication to simulate direct access **(выполнено — architecture boundary reaffirmed)**.
- [ ] Determine whether a supported direct authenticated REST access path exists for ChatGPT Free; if not, document the limitation rather than inventing a connector or requiring an upgrade.

**Evidence:** OpenAI Help Center, “Connecting custom MCP servers in ChatGPT”: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt. This stage records documented plan availability; it does not establish direct REST authentication from ChatGPT Free.


## 51. Reconcile the actual CI executor with the CircleCI requirement — 2026-11-18

- [x] Re-read the current heads of `Znect-god/znect-all-plugins` (`1e5d4500a5a80d43c17d8cd4c3f1cd9cc2ce28e3`) and `Znect-god/znect-build` (`72b633f120580739f965f672efd2fcc6881f3dd0`) **(выполнено — branch-head verification)**.
- [x] Confirm that the existing Bridge CircleCI API v3 read-only adapter and provider contract are already implemented; preserve them rather than rebuilding the plugin **(выполнено — source inventory)**.
- [x] Identify that the current Znect Build central workflow and its read-only Bridge adapter still depend on GitHub Actions endpoints and metadata **(выполнено — source inventory; architectural mismatch confirmed)**.
- [x] Confirm that the inspected Znect Build feature branch has no `.circleci/config.yml`, while its README, architecture, operations and roadmap still describe GitHub Actions as the execution engine **(выполнено — repository/documentation review)**.
- [x] Confirm the `znect-ci-bridge/worker-validation` registry target remains `execution_enabled: false`; no workflow or CircleCI pipeline was triggered **(выполнено — registry review; no execution performed)**.
- [x] Replace the Znect Build GitHub Actions execution path with an opt-in CircleCI exact-SHA validation flow while retaining Znect Build as the development/recipe source **(выполнено — CircleCI config source added; live execution pending)**.
- [x] Retire the separate GitHub Actions-based central Build adapter and its routes/tests; use the existing generic CircleCI read-only adapter for Znect Build runs and artifacts **(выполнено — source/test cleanup; live verification pending)**.
- [x] Update Znect Build architecture, operations, security, README and both project roadmaps to match the CircleCI flow; legacy GitHub Actions jobs are inert **(выполнено — source/documentation updates)**.
- [x] Preserve exact source-SHA verification, bounded provenance artifacts, read-only Bridge access and disabled execution/deployment safeguards **(выполнено — source/config review; runtime verification pending)**.

**Historical verification boundary (superseded by stages 52–54):** at the time of stage 51, CircleCI migration was still pending. Stage 52 subsequently added the CircleCI configuration and recipe; stage 53 retired the GitHub Actions-specific Bridge adapter; stage 54 verified that both repositories and their separate development responsibilities remain intact. No CircleCI pipeline or current-head test suite has yet been executed.


## 52. Implement CircleCI validation in Znect Build — 2026-11-18

- [x] Add `Znect-god/znect-build/.circleci/config.yml` with automatic Znect Build contract checks and an opt-in CI Bridge exact-SHA validation workflow **(выполнено — source implementation)**.
- [x] Require `run_ci_bridge_validation=true` and a full lowercase 40-character source SHA; default remains false **(выполнено — source implementation)**.
- [x] Check out public `Znect-god/znect-all-plugins` at the exact requested commit and verify the resolved SHA before executing package scripts **(выполнено — source implementation)**.
- [x] Execute the existing central Znect Build recipe, preserving dependency audit, TypeScript/Vitest checks, syntax validation and Wrangler dry-run **(выполнено — CircleCI recipe wiring)**.
- [x] Generate a provenance manifest with source SHA, recipe SHA, command list, CircleCI pipeline/workflow/job identity and explicit no-deploy/no-pipeline-mutation fields **(выполнено — source implementation)**.
- [x] Preserve failure provenance by storing the manifest before propagating the original recipe exit code **(выполнено — source implementation)**.
- [x] Disable the legacy GitHub Actions central and validation jobs in the Znect Build feature branch **(выполнено — workflow source; no Actions run used)**.
- [x] Add regression-test source for CircleCI workflow parameters, exact-SHA checkout, provenance fields, disabled-by-default behavior and inert GitHub Actions workflows **(выполнено — test source; execution pending)**.
- [x] Reconcile Znect Build README, architecture, operations, security, roadmap and registry notes; update CI Bridge assistant-channel docs, plugin metadata and changelog **(выполнено — documentation/metadata updates)**.
- [ ] Configure/verify the Znect Build CircleCI project using free/included resources only.
- [ ] Execute the Znect Build contract tests and an explicitly authorized exact-SHA CI Bridge pipeline; capture actual run and artifact evidence.
- [x] Replace or retire the legacy GitHub Actions-based Znect Build adapter in CI Bridge and route central validation evidence through CircleCI **(выполнено — adapter/routes/tests retired; generic CircleCI adapter retained)**.

**Verification boundary:** source configuration, tests and documentation are committed on isolated feature branches. No CircleCI project connection was inspected or configured, no pipeline or test suite was run, and no Preview/Production deployment or secret change occurred.


## 53. Retire the GitHub Actions central Build adapter — 2026-11-18

- [x] Remove the separate `znect-build` provider type from the shared contract and project registry; CircleCI is now the sole CI provider **(выполнено — source implementation)**.
- [x] Remove the GitHub Actions REST adapter, ZIP manifest extraction helper, central Build MCP tools, Browser API `/api/v1/build/*` routes and `ZNECT_BUILD_GITHUB_TOKEN` runtime requirement **(выполнено — source cleanup)**.
- [x] Remove obsolete adapter/ZIP tests and add a regression assertion that retired GitHub Actions Browser API routes return 404 without making upstream requests **(выполнено — test source; execution pending)**.
- [x] Update registry tests to accept CircleCI connections only and remove the reserved `znect-build` provider fixture **(выполнено — test source; execution pending)**.
- [x] Register Znect Build as a normal CircleCI project connection in the registry documentation; document that CircleCI pipeline, workflow, job and v3 run IDs are distinct **(выполнено — documentation)**.
- [x] Reconcile README, provider architecture, usage guide, Free access plan, Znect Build connection guide, API-contract history, plugin metadata and changelog **(выполнено — documentation/metadata source)**.
- [ ] Add the actual Znect Build CircleCI project connection to the private runtime registry and verify it with a read-only probe.
- [ ] Execute the current Worker typecheck and full Vitest suite through the CircleCI exact-SHA workflow after explicit authorization.
- [ ] Verify a real CircleCI run, job, manifest artifact and exact source/recipe SHA round-trip through the generic Bridge CircleCI adapter.
- [ ] Complete the supported private ChatGPT Free access/handoff path without MCP or weakening Browser API authentication.

**Verification boundary:** the legacy GitHub Actions adapter and routes are removed from source, and the generic CircleCI adapter is the only provider implementation. Test source was updated but not executed; the Znect Build runtime CircleCI connection and live artifact round-trip remain pending. No CircleCI pipeline, Preview deployment or Production change was performed.


## 54. Verify repository boundaries and preserve Znect Build as the development home — 2026-11-18

- [x] Verify that `Znect-god/znect-build` still exists, is private, is not archived and retains its own `feat/ci-bridge-node-worker-recipe` development branch **(выполнено — repository metadata and branch inventory)**.
- [x] Verify that `Znect-god/znect-all-plugins` remains a separate public source repository and retains its own CI Bridge engineering branch **(выполнено — repository metadata and branch inventory)**.
- [x] Reconfirm responsibility split: all-plugins owns CI Bridge source; Znect Build owns central recipes, schemas, registry policy and development; CircleCI executes checks; Bridge observes CircleCI read-only **(выполнено — source and documentation audit)**.
- [x] Confirm Znect Build's CircleCI config, exact-SHA source checkout, centrally maintained recipe, provenance artifacts and disabled-by-default validation parameter remain present **(выполнено — static source verification)**.
- [x] Correct stale provider-contract wording that still described a GitHub Actions Build adapter **(выполнено — source comment correction)**.
- [x] Reconcile prior roadmap entries that predated the CircleCI migration and mark the adapter retirement as completed in stage 52 **(выполнено — roadmap reconciliation)**.
- [ ] Configure and verify the existing Znect Build CircleCI project with free/included resources only.
- [ ] After explicit authorization, run the Znect Build contract checks and CI Bridge exact-SHA validation through CircleCI; record real run/job/artifact evidence.
- [ ] Register the Znect Build CircleCI project in the private runtime registry and verify run/job/log/test/artifact reads through the generic read-only adapter.
- [ ] Finish a supported private ChatGPT Free handoff without mandatory MCP or weakened authentication.

**Verification boundary:** both repositories and their isolated engineering branches are intact. This stage was a repository/source/documentation audit only; no branch was merged, no CI pipeline was triggered, no tests were executed, and no Preview/Production deployment or secret change occurred.


## 55. Audit the live Znect Build CircleCI connection prerequisites — 2026-11-18

- [x] Confirm the Bridge runtime loads project connections only from the `ZNECT_PROJECT_REGISTRY` environment binding; no project is implicitly registered when the binding is absent **(выполнено — source inspection)**.
- [x] Confirm the documentation contains a separate `znect-build` registry entry using the CircleCI slug form `gh/Znect-god/znect-build`, while credentials remain outside the registry **(выполнено — documentation inspection)**.
- [x] Confirm the Worker requires its existing server-side `CIRCLECI_TOKEN` for provider reads and the private Browser API requires a separate `WEB_ACCESS_TOKEN` **(выполнено — runtime interface/source inspection)**.
- [x] Confirm no CircleCI or Cloudflare account-management connector is available in this session to inspect project setup or runtime secrets **(выполнено — available integration inventory)**.
- [ ] Verify the exact project slug and project visibility from the authenticated CircleCI account; documentation's example slug is not live evidence.
- [ ] Verify the Znect Build project is connected to CircleCI and uses this repository's `.circleci/config.yml`, with included/free quotas only.
- [ ] Add the Znect Build entry to the existing private Worker `ZNECT_PROJECT_REGISTRY` without replacing existing projects, then perform an authenticated read-only status probe.
- [ ] Confirm the Worker runtime's `CIRCLECI_TOKEN` can read the Znect Build CircleCI project and that no credential or registry value is exposed.

**Verification boundary:** source and documentation prerequisites were audited. CircleCI account state, Cloudflare runtime bindings/secrets and live provider access are not accessible through the connected tools in this session. No runtime configuration was changed, no secret was read or modified, no CircleCI pipeline was started, and no deployment occurred.

## 56. Harden project registry schema and reconcile validation contracts — 2026-11-18

- [x] Reject unknown keys at the registry root, project, repository, component and connection levels so misspelled or misplaced configuration cannot be silently ignored **(выполнено — parser source change)**.
- [x] Add regression-test source for unknown root/project/repository/connection fields, including an attempted credential field in a connection **(выполнено — test source added; execution pending)**.
- [x] Correct a pre-existing multi-connection test expectation that contradicted its fixture (`circleci-tools` was expected as `build-main`) **(выполнено — test source corrected)**.
- [x] Reconcile the current roadmap's project-boundary summary with the actual architecture: CircleCI executes; Znect Build owns central recipes/development; All Plugins owns Bridge source; Bridge reads CircleCI only **(выполнено — roadmap source updated)**.
- [ ] Run registry tests, typecheck and the full suite on the resulting exact source SHA through the authorized CircleCI validation workflow.
- [ ] Verify the registered Znect Build slug and private runtime connection using authenticated read-only access; no account/runtime connector is currently available.

**Verification boundary:** parser and regression-test source were committed. No tests or CircleCI workflow were executed, no secrets/runtime bindings were changed, and no deployment occurred.
## 57. Correct diagnostics semantics and close the provenance-manifest gap — 2026-11-18

- [x] Remove stale GitHub Actions wording from the CircleCI diagnostics report; explicitly distinguish provider execution outcomes from verified project-release outcomes **(выполнено — source correction committed)**.
- [x] Confirm the central CircleCI job emits `ci-bridge-validation-manifest.json` with exact source repository/ref/SHA, recipe repository/SHA/path, recipe exit code/outcome, CircleCI pipeline/workflow/job identifiers, timestamp and explicit no-deploy/no-mutation flags **(выполнено — static inspection of Znect Build config)**.
- [x] Confirm the Bridge currently reads bounded JUnit/test artifacts but does not fetch, parse or validate the CI Bridge provenance manifest; do not treat manifest metadata as trusted evidence **(выполнено — provider/report source audit)**.
- [ ] Implement strict manifest schema validation and cross-check its pipeline/workflow/job identity against the selected CircleCI run before presenting provenance.
- [ ] Cross-check manifest recipe SHA against the CircleCI run's source revision and source SHA against the declared exact-SHA checkout; reject malformed, mismatched, truncated or duplicate manifests.
- [ ] Add bounded regression tests for valid, failed-recipe, malformed, truncated, mismatched-SHA, wrong-pipeline and duplicate-manifest cases.
- [ ] Execute the test suite and typecheck through the opt-in CircleCI exact-SHA workflow after explicit authorization.

**Verification boundary:** the report's stale provider label was corrected. The manifest is still not parsed or trusted by Bridge; its presence in CircleCI artifacts is not proof that the Bridge validated it. All findings are from static source inspection; no tests, pipeline, runtime configuration or deployment were executed.

## 58. Parse and verify Znect Build CircleCI provenance in Bridge diagnostics — 2026-11-18

- [x] Add a strict, bounded parser for the exact ci-bridge-validation-manifest.json schema emitted by the central Znect Build CircleCI recipe; reject unknown keys, malformed JSON, invalid hashes/identifiers, inconsistent exit/outcome values, altered validation commands and unsafe deployment/mutation claims **(выполнено — source implementation)**.
- [x] Discover the dedicated exact-SHA validation workflow and uniquely identify its validate-ci-bridge-source job across bounded workflow/job listings, including successful jobs that ordinary failure-only diagnostics do not inspect **(выполнено — source implementation)**.
- [x] Fetch the manifest and resolved-source-sha.txt only by exact artifact paths returned by CircleCI; reject missing/duplicate artifacts, oversized/truncated content and untrusted manifest URLs **(выполнено — source implementation)**.
- [x] Cross-check the manifest pipeline ID against the selected CircleCI v3 run, workflow ID against the selected workflow, exact job UUID and job name against the dedicated validation job, recipe SHA against the Znect Build run revision, and source SHA against the separately stored exact-checkout SHA **(выполнено — source implementation; live round-trip pending)**.
- [x] Expose a bounded provenance summary in both MCP diagnose_run and authenticated Browser API /api/v1/diagnostics/:runId; distinguish validated recipe success, validated recipe failure, missing, invalid and unavailable evidence **(выполнено — source integration)**.
- [x] Add unit-test source for successful and failed recipe manifests, unknown fields, inconsistent outcome, deployment/mutation claims, malformed/truncated/oversized content and invalid identity values **(выполнено — test source added; execution pending)**.
- [x] Add adapter-level regression tests for successful validation-job discovery, exact pipeline/workflow/job identity, resolved source SHA mismatch and duplicate artifact rejection **(выполнено — test source added; execution pending)**.
- [ ] Run the focused provenance tests, TypeScript check and complete Vitest suite on the exact source SHA through the authorized opt-in CircleCI workflow.
- [ ] Verify a real CircleCI run/artifact round-trip and confirm the actual CircleCI API v3 run revision equals the recipe repository commit SHA before treating the integration as runtime-verified.

**Verification boundary:** strict manifest parsing, bounded artifact discovery, identity/SHA cross-checks and both diagnostics integrations are committed as source. Unit-test source is committed but has not been executed. No CircleCI pipeline, tests, runtime configuration, secrets, Preview or Production deployment were changed or run. A live run/artifact round-trip remains required; until then, source-level implementation is not runtime proof.
## 59. Harden provenance trust boundary and bound discovery — 2026-11-18

- [x] Restrict CircleCI job discovery to the uniquely named exact-SHA validation workflow instead of querying every workflow; reject duplicate target workflows/jobs and incomplete job scans **(выполнено — source implementation)**.
- [x] Verify the returned artifact paths match the exact requested manifest and resolved-SHA paths before parsing their contents **(выполнено — source implementation)**.
- [x] Add regression-test source for unrelated workflow exclusion, missing validation workflow, bounded job-scan overflow, exact job UUID mismatch, pipeline/workflow/recipe SHA mismatch, missing/truncated artifacts, failed-recipe outcome and artifact path mismatch **(выполнено — test source added; execution pending)**.
- [ ] Run focused provenance tests and TypeScript/Vitest checks through the authorized opt-in CircleCI path; no test execution is claimed yet.

**Verification boundary:** this stage improves source-level resource bounds and artifact identity checks. Test source has not been executed; no CircleCI pipeline or runtime operation was performed.
## 60. Remove legacy CircleCI build metadata from v3 provenance — 2026-11-18

- [x] Verify from current CircleCI documentation that API v3 Run ID is the pipeline-run ID and corresponds to `CIRCLE_PIPELINE_ID`; workflow and job UUIDs correspond to `CIRCLE_WORKFLOW_ID` and `CIRCLE_WORKFLOW_JOB_ID` **(выполнено — official documentation review)**.
- [x] Remove `CIRCLE_BUILD_NUM` and `CIRCLE_BUILD_URL` from the central manifest producer; these are legacy build-summary concepts and are not required for API v3 run identity **(выполнено — Znect Build config source update)**.
- [x] Narrow the Bridge manifest schema to the v3-native pipeline/workflow/job UUIDs and job name; reject legacy build-number/URL fields as unknown schema drift **(выполнено — parser source update)**.
- [x] Update the manifest fixture and add a regression test rejecting reintroduction of obsolete build metadata **(выполнено — test source added; execution pending)**.
- [ ] Execute focused provenance tests, typecheck and the full suite on the exact source SHA through the authorized opt-in CircleCI path.
- [ ] Confirm the v3 run revision and provenance artifacts against a real CircleCI run; documentation/source review is not a runtime round-trip.

**Verification boundary:** the producer, strict parser and fixture now agree on CircleCI API v3 identity fields only. No tests or CircleCI pipeline were run; no runtime, secret or deployment settings were changed.
## 61. Match the provenance producer to the strict v3 job identity contract — 2026-11-18

- [x] Align the CircleCI manifest producer with the strict parser's four-field identity object: pipeline UUID, workflow UUID, job UUID and configured job name **(выполнено — cross-repository source alignment)**.
- [x] Ensure the configured job name is emitted deterministically rather than depending on a legacy `CIRCLE_JOB` environment variable **(выполнено — Znect Build config source update)**.
- [x] Reconfirm that the three dynamic CircleCI UUID variables are captured before project scripts and exported to the manifest process **(выполнено — static config inspection)**.
- [ ] Execute the provenance schema/adapter tests and validate an actual manifest through the Bridge against live API v3 resources.

**Verification boundary:** producer and consumer schema now agree at source level. No test execution, CircleCI pipeline, runtime configuration change or deployment was performed.
## 62. Repair CircleCI adapter regression fixture and enforce job outcome consistency — 2026-11-18

- [x] Fix a duplicated `references` property in the CircleCI run adapter test fixture that silently overwrote the project ownership reference and made the fixture invalid for the API v3 ownership contract **(выполнено — test source correction)**.
- [x] Require the provider-reported CircleCI job outcome to agree with the manifest recipe outcome before reporting `validated` or `failed_recipe` **(выполнено — provenance source implementation)**.
- [x] Add regression-test source for a successful recipe manifest paired with a failed CircleCI job; mismatched outcomes are rejected **(выполнено — test source added; execution pending)**.
- [ ] Execute adapter/provenance tests, TypeScript checks and the full suite on the exact source SHA through the authorized opt-in CircleCI workflow.

**Verification boundary:** these are source and test-fixture corrections. No test suite or CircleCI pipeline was executed.
## 63. Match CircleCI API v3 outcome vocabulary in provenance tests — 2026-11-18

- [x] Use the documented API v3 successful job outcome `succeeded` in the positive adapter-level provenance test; the validator accepts both `succeeded` and the existing normalized `success` representation **(выполнено — test source correction)**.
- [ ] Execute the focused provenance tests and confirm the runtime adapter returns the expected API v3 outcome string.

**Verification boundary:** the test fixture now models CircleCI's documented API v3 vocabulary. The test has not been executed.
## 64. Keep CircleCI run links distinct from VCS commit links — 2026-11-18

- [x] Stop mapping an embedded VCS commit URL into the shared CircleCI run URL field; after checking the machine-readable API v3 Run schema, omit `CiRun.url` entirely because `web_url` is not a documented Run response field **(выполнено — official OpenAPI/source correction)**.
- [x] Extend the run adapter fixture with a GitHub commit URL while asserting the normalized CircleCI run result does not expose it as a run URL **(выполнено — test source added; execution pending)**.
- [ ] Execute the CircleCI adapter tests and confirm the negative URL-field regression test passes; the published API v3 Run schema does not define a run `web_url`.

**Verification boundary:** this prevents a misleading link from being presented as a CircleCI run. No tests or pipeline were run.

## Stage 65 — Recover read-only CircleCI lookups after transient failures — 2026-11-18

- [x] Keep concurrent requests deduplicated while a CircleCI project, run, workflow or job lookup is in flight **(выполнено — source implementation)**.
- [x] Evict rejected in-flight cache promises so temporary API/network/auth failures do not permanently poison the adapter instance; allow the next read request to retry **(выполнено — source implementation)**.
- [x] Add an adapter regression test proving a failed run lookup is retried and can subsequently return the CircleCI run **(выполнено — test source added; execution pending)**.
- [x] Add regression coverage for project-resolution retry and concurrent requests sharing one in-flight run lookup **(выполнено — test source added; execution pending)**.
- [ ] Execute the adapter test suite and verify retry behavior against a real CircleCI read-only connection after explicit authorization.

**Verification boundary:** this is a source-level resilience improvement only. No tests were executed, no CircleCI request was sent from this development session, and no pipeline or CircleCI resource was modified.

## Stage 66 — Reconcile run discovery with the current CircleCI API v3 contract — 2026-11-18

- [x] Re-check the current official API v3 reference: run collections require project/user scoping, use opaque cursor pagination, and accept at most 20 items per page **(выполнено — official documentation review)**.
- [x] Confirm the current adapter's run listing uses `filter[project_id]`, a maximum page size of 20, and bounded cursor traversal; the project-ownership lookup remains bounded to 20 pages / 400 recent runs **(выполнено — source inspection)**.
- [x] Confirm the official run reference documents `phase` and `current_outcome`, and the current mapper reads `current_outcome` through its shared status normalization path **(выполнено — documentation/source cross-check)**.
- [x] Inspect CircleCI's machine-readable API v3 OpenAPI response schema: `GET /api/v3/runs/:id` defines VCS revision at `references.event.attributes.vcs.revision`; update the mapper to use only that documented path and add a regression-test source rejecting the undocumented top-level `vcs_revision` alias **(выполнено — official OpenAPI/source/test-source alignment; execution pending)**.
- [ ] Verify the documented `references.event.attributes.vcs.revision` shape against a real, authorized CircleCI API v3 run response. The machine-readable OpenAPI schema now confirms the field path, but the configured project's live response has not been observed.
- [x] Align the existing adapter fixture with the documented nested VCS response and add a negative test rejecting undocumented top-level VCS aliases **(выполнено — test source update; execution pending)**.
- [x] Map only the documented Run `attributes.created_at` as `CiRun.createdAt`; stop treating it as `startedAt` or inventing run-level completion timestamps, and make event correlation use that creation timestamp as a point-in-time fallback when no execution interval exists **(выполнено — provider contract, adapter, dashboard and correlation source/test updates; execution pending)**.
- [ ] Run adapter tests and TypeScript checks through the authorized opt-in CircleCI workflow after explicit authorization.

**Verification boundary:** official API documentation and source were inspected; no CircleCI API request, test run, or pipeline execution was performed. VCS revision mapping remains explicitly unverified.

## Stage 67 — Reconcile the assistant-channel contract with the retired GitHub Actions adapter — 2026-11-18

- [x] Audit the current Bridge source and confirm the former GitHub Actions-backed Znect Build adapter, routes, tests and runtime token requirement are retired; the generic CircleCI read-only adapter remains the provider path **(выполнено — source and test inventory)**.
- [x] Find and correct stale `ASSISTANT_CHANNEL.md` statements that still described the retired GitHub Actions adapter as active and requested its future migration **(выполнено — documentation source update)**.
- [x] Make the private Browser API contract explicit: separate Bearer credential, GET-only routes, disabled CORS, bounded project-scoped responses, and no implied direct ChatGPT authentication **(выполнено — source/documentation cross-check and guide update)**.
- [x] Clarify that dashboard JSON export is a user-reviewed manual handoff and that the historical Android-exporter branch name does not mean an Android exporter is implemented **(выполнено — documentation correction)**.
- [x] Preserve the small legacy CircleCI API v1.1 compatibility surface as explicitly separate, read-only compatibility; do not confuse its build numbers with API v3 UUIDs **(выполнено — source/documentation boundary review)**.
- [x] Reconcile remaining security-review and API-migration passages that described the retired GitHub Actions adapter as current; retain the old implementation only as clearly labelled historical context **(выполнено — documentation source updates)**.
- [ ] Resolve API v3 VCS revision field nesting from an authorized real CircleCI run response; public operation documentation inspected so far does not establish the exact field path.
- [ ] Run typecheck, focused adapter/provenance tests and the complete Vitest suite on the exact source SHA through the authorized opt-in CircleCI workflow after explicit authorization.
- [ ] Verify the private Browser API and dashboard export end-to-end against an isolated authorized runtime; do not claim ChatGPT Free direct authentication until supported and tested.

**Verification boundary:** this stage corrects an active assistant-channel document that contradicted the already-retired source implementation. The correction is committed on the isolated engineering branch. This was a static source/documentation audit only: no tests, CircleCI API request, pipeline, Preview/Production deployment, secret access or runtime change was performed.

## Stage 68 — Respect CircleCI's authoritative current Run outcome — 2026-11-18

- [x] Compare the adapter's shared status normalization with the API v3 Run contract; identify that generic `outcome` could override the authoritative `current_outcome` on a Run **(выполнено — source audit against official API reference)**.
- [x] Add Run-specific status normalization that prefers `current_outcome` and keeps workflow/job normalization separate **(выполнено — adapter source update)**.
- [x] Add a regression fixture where `outcome: success` conflicts with `current_outcome: failed`; expected Run status remains `failed` **(выполнено — test source update; execution pending)**.
- [x] Document why Run outcomes must use `current_outcome` **(выполнено — API migration guide update)**.
- [ ] Run focused CircleCI adapter tests and TypeScript checks through the authorized opt-in CircleCI workflow after explicit execution approval.
- [ ] Inspect a real authorized CircleCI Run containing rerun history and confirm the returned current outcome against the live API.

**Verification boundary:** the authoritative field rule is confirmed in CircleCI's current API v3 reference and the source/test fixture are updated. No test command, CircleCI API request, pipeline execution, deployment or runtime credential access was performed in this stage.

## Stage 69 — Keep job execution timestamps distinct from queue/creation time — 2026-11-18

- [x] Compare shared job timestamp mapping with CircleCI's API v3 developer-guide job response example, which defines `started_at` and `ended_at` as execution timestamps **(выполнено — official documentation/source review)**.
- [x] Remove fallback mapping from `created_at`, `start_time`, `stop_time` and `stopped_at` into execution start/completion fields **(выполнено — adapter source correction)**.
- [x] Add a queued-job regression fixture containing only creation/legacy aliases and assert that execution timestamps remain absent **(выполнено — test source update; execution pending)**.
- [x] Document the distinction in the CircleCI API migration guide **(выполнено — documentation update)**.
- [ ] Execute focused provider tests and TypeScript checks through the authorized opt-in CircleCI workflow after explicit execution approval.
- [ ] Verify a live queued and completed job response from the configured CircleCI project.

**Verification boundary:** source mapping and regression-test source are updated against CircleCI's published developer-guide example. No tests, live API requests, pipeline execution, deployment or credential changes were performed.

### Stage 70 — Align collection pagination and rate-limit behavior with the API v3 contract
- [x] Re-check the current official API v3 reference for workflows, jobs, artifacts, stdout/stderr, tests and rate-limit responses.
- [x] Correct migration documentation: workflows use opaque cursor pagination; jobs and job artifacts are documented as unpaginated collection responses and remain protected by explicit item-count bounds.
- [x] Confirm 429 handling parses and reports a sanitized `Retry-After` value for JSON and text endpoints; the adapter intentionally does not sleep/retry inside a Worker request.
- [ ] Execute focused provider/API tests and typecheck through the authorized CircleCI validation workflow.
- [ ] Verify live pagination and 429 response behavior against an authorized CircleCI project.
- **Verification boundary:** official documentation and source/tests inspected; documentation correction only. No tests, live API calls, pipeline, deployment or credentials accessed.

### Stage 71 — Match job parallel-execution parsing to CircleCI's actual v3 wire shape
- [x] Cross-check the job detail model against CircleCI's public CLI v3 acceptance-fixture types: `parallel_executions` is an array of step arrays (`[][]JobStep`), not an array of `{ steps: [...] }` objects.
- [x] Update the adapter to iterate nested step arrays and use each outer-array position as the zero-based execution index.
- [x] Stop requiring `is_insignificant` on every step; preserve it only when the response actually supplies a boolean value.
- [x] Correct provider regression fixtures for single and multiple executions, and retain malformed-step rejection coverage.
- [x] Document the corrected response shape and queued-job omission behavior.
- [ ] Execute focused provider tests and TypeScript checks through the authorized opt-in CircleCI workflow.
- [ ] Verify the mapping against a live authorized CircleCI job detail response.
- **Verification boundary:** source and regression-test fixtures corrected using CircleCI's public CLI v3 acceptance-fixture model; no tests, live API calls, pipeline, deployment or credentials accessed.

### Stage 72 — Preserve parallel-execution identity for CircleCI artifacts
- [x] Cross-check CircleCI's public CLI v3 artifact model, which exposes the zero-based execution index for each artifact.
- [x] Carry optional artifact execution identity through the provider-neutral contract and CircleCI adapter.
- [x] Add an optional execution selector to artifact retrieval; reject ambiguous same-path results when no selector is supplied.
- [x] Expose execution metadata in artifact listings and include it when diagnostics fetch JUnit reports.
- [x] Add regression coverage for same-path artifacts produced by separate parallel executions and tool-schema exposure.
- [x] Document the disambiguation rule.
- [ ] Execute focused provider/API tests and TypeScript checks through the authorized opt-in CircleCI workflow.
- [ ] Verify duplicate-path artifact behavior against a live authorized parallel job.
- **Verification boundary:** source and regression-test fixtures updated against CircleCI's public CLI v3 model; no tests, live API calls, pipeline, deployment or credentials accessed.


### Stage 73 — Keep parallel artifact identity in diagnostic result types
- [x] Audit both MCP `diagnose_run` and Browser JSON API diagnostics for execution-index propagation through JUnit artifact selection and output **(выполнено — static source inspection)**.
- [x] Correct the MCP diagnostics artifact collection type so its optional `execution` property matches the provider contract and the emitted report object **(выполнено — source update; TypeScript check pending)**.
- [x] Confirm diagnostics pass each artifact's execution index into exact-path retrieval and surface the returned execution index; when multiple eligible JUnit artifacts exist, the current one-artifact cap is reported as incomplete rather than silently presented as complete **(выполнено — static source inspection)**.
- [x] Confirm failed-step stdout/stderr retrieval passes the step's parallel execution index; structured job test results remain a job-level JSONL endpoint without an execution selector **(выполнено — static source inspection)**.
- [ ] Execute TypeScript check and focused diagnostics/provider tests through the authorized opt-in CircleCI workflow.
- [ ] Verify parallel execution log and artifact behavior against a live authorized CircleCI job.

**Verification boundary:** source audit identified a TypeScript excess-property mismatch: the MCP diagnostics artifact collection type omitted the optional `execution` field even though the provider contract and pushed report object include it. The type was corrected. At the time of this stage, the diagnostic design capped JUnit artifact retrieval at one per job; Stage 74 supersedes that limitation with bounded multi-artifact collection. No tests, typecheck, live API request, CircleCI pipeline, deployment or runtime configuration change was performed.


### Stage 74 — Aggregate JUnit reports across parallel executions within a strict byte budget
- [x] Replace the one-report-per-job behavior in both MCP and Browser JSON API diagnostics with one shared bounded collector.
- [x] Collect up to four JUnit/test-results XML artifacts per job, preserving each artifact's execution index and exact path.
- [x] Enforce a shared 500,000-byte aggregate retrieval budget per job; each next download receives only the remaining budget.
- [x] Mark diagnostics incomplete and set the artifact-limit indicator when the artifact-count or aggregate-byte budget prevents full collection; preserve per-artifact retrieval errors without hiding successful reports.
- [x] Keep oversized known artifacts out of retrieval and report incompleteness rather than attempting an over-budget download.
- [x] Add focused regression-test source for multiple executions, same-path artifacts, count cap, aggregate byte cap, unknown sizes and partial retrieval failure **(выполнено — Stage 75; execution pending)**.
- [ ] Execute TypeScript checks and focused tests through the authorized opt-in CircleCI workflow.
- [ ] Verify multi-execution JUnit collection against a live authorized CircleCI job.

**Verification boundary:** shared collector and both diagnostics call sites updated in source; static review only. The four-artifact and 500,000-byte limits are code-enforced, but TypeScript and runtime behavior remain unverified. No tests, live API requests, CircleCI pipeline, deployment or credential changes were performed.


### Stage 75 — Extract and regression-test the bounded diagnostic artifact collector — 2026-11-18
- [x] Move the shared JUnit/test-results collector into `src/diagnostic-artifacts.ts`, with explicit typed inputs/results and exported count/byte limits.
- [x] Keep both MCP and Browser JSON API diagnostics on the same extracted collector; preserve artifact path, optional size, parallel execution index and per-artifact safe errors.
- [x] Add isolated regression tests for parallel executions and duplicate paths, the four-artifact cap, aggregate byte budgeting, unknown artifact sizes, oversized known artifacts, partial retrieval failures, truncated downloads, filtering and list failures.
- [x] Fail closed when an adapter returns report content larger than the remaining byte budget, rather than emitting an over-budget report.
- [ ] Execute the focused Vitest file and TypeScript checks through the authorized opt-in CircleCI workflow after explicit execution approval.
- [ ] Review test results and address any failures before broader validation.
- [ ] Verify bounded multi-execution JUnit collection against a live authorized CircleCI job.

**Verification boundary:** module extraction, both call-site imports and focused regression-test source are committed to the feature branch. Tests and TypeScript checks were not executed; no CircleCI API requests, pipeline execution, deployment or credential/configuration changes were performed.


### Stage 76 — Make diagnostic completeness explicit and consistent across MCP and Browser API — 2026-11-18
- [x] Extract shared diagnostic summary construction so MCP and Browser JSON API use identical workflow/job/log/report completeness rules.
- [x] Ensure the overall `incomplete` flag is true whenever the report artifact count/byte limit indicator is true, even if an upstream caller misses the separate report-data flag.
- [x] Add per-job `test_results_status` values to distinguish available, partial/truncated, empty and unavailable structured JSONL results.
- [x] Add per-job `report_artifacts_status` values to distinguish available, partial, unavailable and no matching JUnit artifacts.
- [x] Add per-job `failed_step_logs_status` values to distinguish available, partial, unavailable and not-applicable logs; account for retrieval errors, truncation, invalid step numbers and global log-action caps.
- [x] Correct MCP failed-step log requests to use the `execution_index` field emitted by its normalized failed-step structure, preserving parallel-execution selection just like Browser API.
- [x] Add focused regression-test source for source-status classification, failed-step log completeness and shared overall summary semantics.
- [ ] Execute focused Vitest files and TypeScript checks through the authorized opt-in CircleCI workflow after explicit execution approval.
- [ ] Review test/typecheck results and correct any failures.
- [ ] Verify the same diagnostic status fields and summary flags against a real authorized CircleCI run through both MCP and Browser API.

**Verification boundary:** shared status/summary helpers, both API call sites, the MCP parallel-execution selector correction and regression-test source are committed to the feature branch. No tests or typecheck were executed; no CircleCI API requests, pipeline execution, deployment or credential/runtime configuration changes were performed.


### Stage 77 — Normalize CircleCI JSONL and parallel JUnit results into one test summary — 2026-11-18
- [x] Add a dedicated bounded normalizer for CircleCI job JSONL and collected JUnit XML reports; emit one shared per-job summary with total, passed, failed, skipped and unknown counts.
- [x] Parse the documented JSONL identity/status fields and a strict JUnit testcase subset; reject DTD/entity declarations, malformed XML, oversized inputs and excessive testcase/token/depth counts.
- [x] Preserve parallel-execution indexes from JUnit artifacts and optional JSONL execution metadata.
- [x] Deduplicate only unambiguous one-to-one JSONL/JUnit matches using shared classname/name identity; use file and execution as conflict guards when both sources provide them. Keep repeated identities that may represent retries or parallel shards; flag ambiguous groups rather than silently collapsing them.
- [x] Prefer CircleCI JSONL when a one-to-one cross-source status conflict occurs, expose the conflict count and mark the summary incomplete.
- [x] Attach the same `test_summary` contract to MCP diagnostics and the private Browser JSON API diagnostics; propagate JSONL retrieval failures, JUnit collector limits and summary incompleteness to the overall diagnostic report. Include explicit source coverage and label counts as observed records, not inferred project-wide totals.
- [x] Add focused regression-test source for status normalization, JUnit XML, safe entity handling, malformed/truncated inputs, one-to-one deduplication, status conflicts, retries and parallel execution ambiguity.
- [ ] Execute the focused Vitest file and TypeScript checks through the authorized opt-in CircleCI workflow after explicit execution approval.
- [ ] Review test/typecheck results and fix any implementation or type errors.
- [ ] Verify the normalized summary against an authorized real CircleCI job with both JSONL results and per-execution JUnit artifacts.

**Verification boundary:** normalizer source, both diagnostics call sites and focused regression-test source are committed on the isolated feature branch. Tests and TypeScript checks have not been executed. No CircleCI API requests, pipeline trigger, deployment, credential change or runtime configuration change was performed.

## Remaining delivery in two controlled stages
1. **Stage 80 — Validation:** the user has now explicitly requested execution. Run focused and full source checks through the opt-in CircleCI workflow; resolve failures and record exact-SHA provenance. Execution is currently blocked because this ChatGPT session has no CircleCI control/API connector or authenticated CircleCI action. Do not substitute GitHub Actions or claim validation succeeded.
2. **Stage 81 — Readiness:** verify the private authenticated Browser JSON API report/export round-trip in the authorized Preview, perform read-only live CircleCI checks, review security/limits, and prepare Reporting / Diagnostics v1. Live execution is currently blocked because this session has no Preview/Cloudflare access or configured smoke-test secrets. No merge or Production deployment without separate approval.


### Stage 78 — Make the free assistant report handoff explicit and self-describing — 2026-11-18
- [x] Add an `assistant_handoff` contract to the aggregate Browser JSON API report: user-reviewed JSON attachment, no automatic API access claim, no mandatory MCP and no Bearer token in the report.
- [x] Preserve normalized per-job `test_summary` data when the dashboard bundles the aggregate report with up to three failed-run diagnostics.
- [x] Label test counts as observed records and expose source coverage so ChatGPT does not infer project-wide completeness from a partial job report.
- [x] Extend Browser API regression-test source to assert the normalized summary and handoff metadata.
- [x] Update README, assistant-channel guidance and usage documentation to describe the manual handoff accurately.
- [ ] Execute the report/API/UI tests and TypeScript checks through the authorized opt-in CircleCI workflow after explicit execution approval.
- [ ] Verify a real export from an authorized Preview and review the resulting JSON for completeness and redaction.
- [ ] Establish a supported automatic ChatGPT Free authentication path only if the platform provides one without sharing secrets or weakening authentication.

**Verification boundary:** report metadata, Browser diagnostics output, regression-test source and documentation are committed. This does not establish direct automatic ChatGPT-to-API connectivity; the current supported fallback remains a user-reviewed JSON attachment. No tests, CircleCI pipeline, Preview/Production deployment, credential or runtime configuration change was performed.


### Stage 79 — Harden normalized report parsing before CircleCI validation — 2026-11-18
- [x] Reject non-whitespace text outside the JUnit XML root element, reject multiple roots, require the root to be `testsuite` or `testsuites`, and reject CDATA outside the root; preserve a valid self-closing empty testsuite.
- [x] Fail closed on malformed JSONL/JUnit parallel execution metadata instead of silently dropping an invalid execution index and risking cross-shard deduplication.
- [x] Add regression-test source for trailing XML garbage, multiple XML roots, non-JUnit roots, CDATA outside the root and invalid execution indexes in both report formats.
- [ ] Execute the normalizer Vitest file and TypeScript checks through the explicitly authorized opt-in CircleCI workflow.
- [ ] Review parser behavior against representative real CircleCI JSONL and JUnit artifacts; adjust only with evidence from the API contract.

**Verification boundary:** parser hardening and regression-test source are committed to the feature branch. Static source inspection only; tests and TypeScript checks remain unexecuted. No CircleCI pipeline, API request, deployment or runtime configuration change was performed.



### Stage 81 — Repair Preview smoke-test contract before live readiness — 2026-11-18

- [x] Correct the Preview smoke script to send the required project_id and connection_id to authenticated Browser API status, run, report and diagnostics reads; include project_id on initial, paginated and post-webhook event-inbox reads.
- [x] Align status assertions with the actual Browser API response contract (project.id, connection.id, provider, and read-only permission), rather than an undocumented project slug field.
- [x] Pass required project/connection arguments to MCP check_connection and project scope to list_recent_events, including the post-webhook verification read.
- [x] Extend the smoke preflight to retrieve /api/v1/report, validate the explicit assistant-handoff/no-token metadata, and round-trip up to three diagnostic UUIDs using locally reconstructed same-origin paths.
- [x] Add regression-test source for Preview smoke request scoping, report handoff validation, read-only MCP calls and the approved Preview host boundary.
- [x] Make the dashboard export status reflect overall report completeness: run-list truncation, event-store availability and successful inclusion of all available failed-run diagnostics; preserve explicit partial-export messaging.
- [ ] Execute the smoke-script contract tests and complete Bridge test/typecheck suite through Stage 80's authorized CircleCI exact-SHA workflow.
- [ ] Run the corrected smoke test against the authorized Preview and review a real exported JSON report, diagnostics, redaction and completeness fields.
- [ ] Verify live CircleCI read-only connectivity and representative successful/failed run, logs, JSONL/JUnit and artifact retrieval.
- [ ] Confirm the private ChatGPT Free access/handoff path without MCP or manual secret sharing; do not claim automatic access unless the supported authentication path is proven.

**Verification boundary:** source and regression-test updates are committed. Static contract inspection only; no Vitest, typecheck, CircleCI API request, CircleCI pipeline, Preview request/deployment, secret access or Production change was performed. Stage 81 remains incomplete pending the live checks above. The required CircleCI and Preview/Cloudflare control integrations are not available in the current execution session; the user has authorized the stages, but no live request can be issued from the available tools.


### Stage 82 — Canonical branch consolidation and source-audit corrections — 2026-11-18

- [x] Verify that the ten obsolete CI Bridge branches have been removed; retain `ci-bridge` as the only permanent CI Bridge development branch.
- [x] Verify that `main` remains at `4a814052eb9a057d0d9f41840783f37ceb2f23d4` and is not used for CI Bridge development.
- [x] Reconcile the root plugin catalog, plugin README, `plugin.json`, Usage Guide and this roadmap with the canonical `ci-bridge` branch and the `in-development` maturity status.
- [x] Correct a duplicate `content-type` property in `test/worker.test.ts` that could fail a TypeScript diagnostic.
- [x] Add a strict allowlist for the event-store page envelope (`events`, `next_cursor`) in `readEventPage`; add a regression test proving that unexpected top-level personal-data fields are rejected.
- [x] Review the complete tracked source/test inventory, package manifest/lockfile alignment, Worker route boundaries, CircleCI provider ownership checks, webhook storage validation, dashboard DOM rendering, and inert repository-local GitHub Actions workflows.
- [x] Review the separate Znect Build CircleCI exact-SHA workflow and central Worker validation recipe. The opt-in parameter remains disabled by default; the recipe performs install, audit, typecheck/tests, smoke-script syntax validation and Wrangler dry-run only.
- [ ] Run `npm ci`, dependency audit, TypeScript, full Vitest suite, smoke-script syntax check and Wrangler dry-run on the exact current source SHA through the authorized CircleCI workflow.
- [ ] Resolve any failures found by actual execution, then update this roadmap with exact run/job IDs and evidence.

**Verification boundary:** source and documentation corrections are committed. The audit is source-level only. No test suite, dependency audit, typecheck, CircleCI pipeline, Preview deployment, live CircleCI API request, secret access or Production change was performed. Stage 82 implementation items are complete; validation remains open.


### Stage 83 — Preserve event-page truncation in assistant-report completeness — 2026-11-18

- [x] Treat a webhook event page that reaches its requested limit as potentially incomplete; expose `completeness.events_limited` in `GET /api/v1/report`.
- [x] Make dashboard export status remain partial when the event page is saturated, even if the event store is reachable and all linked failed-run diagnostics were fetched.
- [x] Add API regression coverage for a full 20-event report page and update the dashboard contract test for the new completeness rule.
- [ ] Execute the focused report/UI tests and full Vitest suite through the authorized CircleCI exact-SHA workflow.

**Verification boundary:** implementation and regression-test source are committed. Tests have not been executed. The change is conservative: a page exactly at its requested limit is marked potentially limited because the bounded report cannot prove that no additional events exist beyond the page.


### Stage 84 — Validate CircleCI artifact byte metadata — 2026-11-18

- [x] Reject negative, fractional, unsafe-integer and non-numeric artifact `size` metadata rather than silently omitting it or using it in aggregate-byte budget decisions.
- [x] Preserve valid zero-byte and positive safe-integer artifact sizes.
- [x] Add provider regression-test source for negative, fractional, unsafe-integer and non-numeric sizes, plus valid zero-byte and positive integer sizes.
- [ ] Execute the provider and artifact-collector Vitest suites plus TypeScript checks through the authorized opt-in CircleCI exact-SHA workflow.

**Verification boundary:** source-level validation and regression-test source are committed. The CircleCI v3 API remains read-only; no live API request or pipeline was made, and tests/typecheck remain unexecuted.


### Stage 85 — Bind exact-SHA validation to the canonical development branch — 2026-11-18

- [x] Require provenance manifests to identify `ci-bridge` as the only accepted CI Bridge source ref; reject obsolete feature-branch identities.
- [x] Require the opt-in CircleCI exact-SHA workflow in the separate `Znect-god/znect-build` repository to accept only the canonical `ci-bridge` ref.
- [x] Fetch the canonical branch tip and verify the requested source SHA is an ancestor of that tip before checking out the exact SHA for validation.
- [x] Update provenance and Znect Build recipe-contract regression-test source for the canonical-ref and ancestry requirements.
- [ ] Execute provenance tests, Znect Build contract tests, TypeScript checks and the full CI Bridge suite through the authorized opt-in CircleCI workflow.
- [ ] Review actual CircleCI provenance artifacts to confirm the recorded source ref, requested SHA and resolved checkout SHA agree.

**Verification boundary:** source, CircleCI configuration and regression-test updates are committed in their respective development branches. This closes a source-level gap where a manifest could name an obsolete or unrelated branch even though the SHA itself was exact. No tests, CircleCI pipeline, live API request, Preview/Production deployment, secret access or runtime configuration change was performed.

### Stage 86 — Validate upstream response budgets before network access — 2026-11-18

- [x] Validate CircleCI text-response byte budgets as non-negative safe integers before issuing the API request.
- [x] Validate artifact-download byte budgets before listing artifact metadata or contacting the download host.
- [x] Add regression-test source proving negative and unsafe-integer budgets are rejected without any network request.
- [ ] Execute focused CircleCI client tests, full Vitest suite and TypeScript checks through the authorized opt-in CircleCI exact-SHA workflow.

**Verification boundary:** implementation and regression-test source are committed. This prevents invalid internal budgets from causing unnecessary authenticated API or artifact requests before the existing bounded-reader validation runs. No tests, CircleCI API request, CircleCI pipeline, Preview/Production deployment, secret access or runtime configuration change was performed.


### Stage 87 — Reject duplicate resources in paginated CircleCI collections — 2026-11-18

- [x] Detect repeated run IDs while traversing project-scoped run ownership pages and recent-run pages; fail closed instead of returning duplicated or ambiguous run records.
- [x] Detect repeated workflow IDs while traversing workflow pages, including duplicates returned within one page.
- [x] Add regression-test source for duplicate run and workflow records returned on distinct cursor pages.
- [ ] Execute focused CircleCI client tests, the full Vitest suite and TypeScript checks through the authorized opt-in CircleCI exact-SHA workflow.

**Verification boundary:** the source and regression-test updates are committed on the canonical `ci-bridge` branch. This is source-level work only; no test execution, typecheck, CircleCI API request, CircleCI pipeline, Preview/Production deployment, secret access or runtime configuration change was performed.
