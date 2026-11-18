# Znect CI Bridge — implementation roadmap

**Status:** `in-development`; isolated engineering branch only.  
**Updated:** 2026-11-18 (CircleCI-first CI Bridge development alignment)  
**Development repository:** `Znect-god/znect-all-plugins`  
**Build system:** `Znect-god/znect-build` (separate repository and responsibility)  
**Active working branch:** `feature/ci-bridge-android-exporter`  
**Previous engineering base:** `test/ci-bridge-webhook-ingress-contract`  
**Cost constraint:** free tiers/included quotas only; no paid add-ons, auto-refill, or unapproved Production deployment.

This is the living implementation roadmap. Update it with every meaningful implementation change. When source implementation and its regression coverage are added, mark it **(выполнено)**. Test execution, live provider verification, deployment and operational readiness remain separate statuses. Do not confuse implementation with verification, deployment, or operational readiness.

## 1. Project boundaries

- **Znect All Plugins** is the source-development home for CI Bridge: code, tests, docs, plugin metadata, experiments and release preparation.
- **Znect Build** is the centralized build system for producing applications from pinned source revisions and build recipes. It is not the Bridge source repository.
- **Znect CI Bridge** is a read-only diagnostics/integration plugin. It observes CI systems and exposes reports; it does not become the build executor.
- **Znect Build** (`Znect-god/znect-build`) is a separate GitHub repository/system in the Znect ecosystem. Its own central build workflows are maintained independently; the repository itself is not a CI provider.
- **CircleCI** is the CI tool/provider used to execute CI Bridge's own validation pipeline and to provide CI run data to the Bridge. The root `.circleci/config.yml` in `znect-all-plugins` defines CI Bridge validation.
- The Bridge's CircleCI diagnostics adapter is strictly read-only for observed project pipelines: it must not trigger, retry, cancel or modify those pipelines.
- CI Bridge validation must run through CircleCI, not GitHub Actions or the Znect Build central recipe. Znect Build remains a separate repository and is not the CI Bridge validation executor.
- The optional legacy Znect Build read adapter is not part of the primary ChatGPT/CircleCI path and must not be treated as a CircleCI integration.

No PR merge, default-branch update, CI pipeline run, build, deployment, Preview refresh, Production change, or CircleCI action is authorized by this roadmap alone.

## 2. Delivery stages

1. **Core CircleCI diagnostics and private report API — (выполнено):** provider adapter, authenticated bounded Browser API, webhook inbox, event correlation and aggregate `/api/v1/report` source are present.
2. **Android private report handoff — source implementation (выполнено):** native exporter source, local Keystore-backed credential storage, strict HTTPS report fetch, schema checks and explicit Sharesheet export are present. Build and device verification remain pending.
3. **CircleCI validation and operational proof — in progress:** validate the exact candidate branch in CircleCI only after authorization, then verify a real CircleCI event and private report handoff. No run, build, deployment or secret access is authorized by this roadmap.

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
- [ ] Keep the Znect Build adapter outside the primary ChatGPT/CircleCI report path; review whether it should remain optional or be removed in a later scoped cleanup.
- [ ] Do not route CI Bridge validation through GitHub Actions or Znect Build.
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

### 4.10 Android private report exporter

- [x] Isolated native Android module under `android-exporter/` with HTTPS-only origin policy and fixed report endpoint **(выполнено — source implementation)**.
- [x] Android Keystore AES-GCM credential storage and app-private preferences **(выполнено — source implementation)**.
- [x] Bounded 100 KB report retrieval, redirect rejection, credential-field scan and explicit FileProvider/Sharesheet export **(выполнено — source implementation)**.
- [x] Validate report identity, CircleCI provider, read-only permissions, ISO timestamp, project/connection metadata, bounded run/event arrays and completeness metadata **(выполнено — source implementation; not yet compiled)**.
- [x] Eight origin-policy unit-test cases authored **(выполнено — test source only)**.
- [x] Ten report-schema/privacy unit-test cases authored with a JVM JSON test dependency **(выполнено — test source only)**.
- [x] Add a local disconnect action that removes the encrypted token, Android Keystore key entry and temporary report **(выполнено — source implementation; device verification pending)**.
- [x] Extract report-schema validation from Activity code and add focused JVM unit-test source for valid reports, provider/permission/project rejection, malformed timestamps, run bounds/counts, event counts, completeness and recursive sensitive-key detection **(выполнено — test source added; execution pending)**.
- [ ] Add device-auth/biometric confirmation and verify lifecycle/error handling.
- [ ] Add a reproducible Gradle Wrapper distribution and verify its provenance before enabling the Android CircleCI job; no wrapper binary or checksum has been fabricated.
- [ ] Run Android Gradle tests/build only after explicit authorization; no APK or device verification is claimed.

### 4.9 CircleCI validation pipeline

- [x] Root `.circleci/config.yml` defines the CI Bridge validation job: `npm ci`, `npm run check`, smoke-script syntax validation and Wrangler dry-run. **(выполнено — source configuration)**
- [x] Validation config does not deploy or mutate observed CircleCI project pipelines. **(выполнено — static source inspection)**
- [ ] Run the CircleCI pipeline on the exact candidate branch/SHA. User authorization received; execution is blocked in this session because no authenticated CircleCI control/API connection is available. Do not substitute GitHub Actions or Cloudflare checks.
- [ ] Review actual CircleCI job results, logs, tests and Wrangler dry-run output; do not infer success from config presence.
- [ ] Add Android exporter validation to CircleCI. Current config validates only the Worker; Android module has no Gradle wrapper committed, so it is not yet buildable through the checked-in project wrapper.

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

- Continue source work in `Znect-god/znect-all-plugins`, on the isolated branch `feature/ci-bridge-android-exporter`.
- Keep changes isolated. Do not merge, open a PR, or update `main` without explicit approval.
- Older branches (`feat/ci-bridge-circleci-webhooks`, `feature/ci-bridge-test-reports`, `feature/znect-ci-bridge-source`, `work/znect-ci-bridge-free-channel-v0.2.0`, `work/znect-ci-bridge-mcp-v0.2.0`) are historical work lines/prototypes; do not develop them in parallel unless a specific recovery or comparison requires it.
- The `docs/ci-bridge-implementation-roadmap` branch contains the earlier roadmap source; this living copy is maintained alongside the active engineering branch so implementation status and future work stay together.
- Znect Build remains a separate repository for centralized application builds, with GitHub Actions as its central execution engine. A dedicated Build API is not present. The actual run records, jobs, logs and run-level artifacts are available from GitHub Actions' read-only repository APIs; CI Bridge should integrate with those documented APIs rather than guessed Znect Build routes. A Node/Cloudflare Worker validation recipe, disabled CI Bridge registry target and validated-source fingerprint artifact are present on isolated Znect Build branch `feat/ci-bridge-node-worker-recipe`; that branch is not merged and no run has been triggered. CI Bridge now has a source-level GitHub Actions read-only adapter and MCP tools, but live verification is pending. Do not move Bridge source into Build.
- Do not trigger GitHub Actions, CircleCI, builds, deployments, Preview refreshes or Production changes without explicit authorization.
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


## 17. CircleCI-first development direction — 2026-11-18

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
### Android exporter implementation update (2026-11-18)

- Created isolated branch `feature/ci-bridge-android-exporter` from the report-handoff research branch.
- Added a native Kotlin Android application module under `plugins/znect-ci-bridge/android-exporter/` (application ID `com.znect.cibridge.exporter`, minSdk 26, target/compile SDK 35, JDK 17).
- Implemented local configuration, AES-GCM encryption of the Browser API Bearer token with a non-exportable Android Keystore key, strict HTTPS-origin validation, fixed GET-only `/api/v1/report` request, redirect rejection, 100 KB response cap, report identity/read-only validation, defensive credential-field checks, private temporary JSON export and explicit Android Sharesheet sharing.
- Disabled cleartext traffic and restricted TLS trust anchors to the Android system store. No background work, analytics, cloud upload, MCP or pipeline mutation capability was added.
- Added unit-test source for strict HTTPS-origin validation. **Test execution pending; no build or APK was produced.**
- No live API request was made; no token or other secret was requested/read. No CircleCI pipeline, CI workflow, build, deployment or device installation was run.
- Remaining work: source review and additional test coverage; then, only after explicit authorization, local Gradle build, tests and Android device verification as separate steps.


## 10. Development log — 2026-11-18 (Android exporter and CircleCI alignment)

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
