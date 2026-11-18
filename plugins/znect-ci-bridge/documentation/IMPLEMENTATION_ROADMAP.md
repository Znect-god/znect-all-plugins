# Znect CI Bridge — implementation roadmap

**Status:** `in-development`; isolated engineering branch only.  
**Updated:** 2026-11-18 (Znect Build architecture alignment)  
**Development repository:** `Znect-god/znect-all-plugins`  
**Build system:** `Znect-god/znect-build` (separate repository and responsibility)  
**Active working branch:** `test/ci-bridge-webhook-ingress-contract`  
**Base:** `c72a67e33177985a57f4d9d6180e4e8d8a970edb`  
**Cost constraint:** free tiers/included quotas only; no paid add-ons, auto-refill, or unapproved Production deployment.

This is the living implementation roadmap. Update it with every meaningful implementation change. When source implementation and its regression coverage are added, mark it **(выполнено)**. Test execution, live provider verification, deployment and operational readiness remain separate statuses. Do not confuse implementation with verification, deployment, or operational readiness.

## 1. Project boundaries

- **Znect All Plugins** is the source-development home for CI Bridge: code, tests, docs, plugin metadata, experiments and release preparation.
- **Znect Build** is the centralized build system for producing applications from pinned source revisions and build recipes. It is not the Bridge source repository.
- **Znect CI Bridge** is a read-only diagnostics/integration plugin. It observes CI systems and exposes reports; it does not become the build executor.
- **Znect Build** is the mandatory central execution path for Znect application builds; its central executor is GitHub Actions. Project repositories must not duplicate build recipes or start project builds independently.
- **CircleCI** remains an external CI provider for projects that already use it (including Forge). CI Bridge may inspect CircleCI through its read-only adapter, but must not trigger, retry, cancel or modify CircleCI pipelines.
- Bridge-to-Build integration is a separate provider integration. A registry entry or written API contract does not mean that the Build API exists or is operational.

No PR merge, default-branch update, CI pipeline run, build, deployment, Preview refresh, Production change, or CircleCI action is authorized by this roadmap alone.

## 2. Intended result

ChatGPT and authorized users should be able to inspect current Znect project build health through a private, bounded report containing:
- registered projects, repositories and CI connections;
- CI runs, workflows and jobs;
- failed-step metadata and bounded/redacted logs;
- structured test results and allowlisted artifacts when the provider exposes them;
- signed webhook events and conservative event-to-run correlation;
- a browser dashboard/JSON API and a free private GitHub Actions report handoff for ChatGPT (no MCP channel);
- eventually, a free request/response handoff that can deliver a private report for ChatGPT to inspect.

The Bridge must remain read-only with respect to CI execution and project source/configuration: no trigger, retry, cancel, deployment, configuration-write or source-modification operations.

## 3. Current implementation inventory

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
- [x] Implement a read-only GitHub Actions adapter for the central `Znect-god/znect-build` repository using the documented Actions REST API; treat GitHub Actions workflow runs as the source of central Build lifecycle truth. **(выполнено — source implementation; live verification pending)**
- [x] Map run/workflow/job ownership conservatively and expose only data whose parent relationship is verifiable; keep run-level artifacts distinct from job-level artifacts. **(выполнено — source implementation; central fingerprint workflow change remains unmerged)**
- [x] Expose verified Build reads through MCP and authenticated Browser JSON API endpoints. **(выполнено — source implementation; mocked tests added, execution pending)**
- [ ] Confirm the minimum repository-scoped read permissions and bounded log/artifact handling before enabling the connection. Do not invent a custom Build API or duplicate build execution.
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
- [ ] Keep all user-facing ChatGPT access on the private GitHub report handoff and authenticated Browser API.

### 3.8 Free ChatGPT report handoff (primary assistant channel)

- [x] Private Forge inbox issue #8 and exact command `/znect-ci-bridge check` **(выполнено)**.
- [x] Private Forge GitHub Actions request workflow merged to Forge `main` in PR #9 (`.github/workflows/znect-ci-bridge-request.yml`) **(выполнено)**.
- [x] Collector script merged to Forge `main` (`scripts/znect-ci-bridge-collect-github-report.sh`) **(выполнено)**.
- [x] Workflow collects read-only CircleCI status, recent runs, failed-run diagnostics and webhook events through the Bridge Browser API **(выполнено — source/configuration)**.
- [x] Workflow stores the report as a private artifact with one-day retention and posts only a short status/link to the private inbox **(выполнено — source/configuration)**.
- [ ] Confirm the `ZNECT_CI_BRIDGE_WEB_TOKEN` secret exists by presence only; never retrieve or expose its value.
- [ ] Run one fresh owner-requested report and verify the private artifact round-trip.
- [ ] Verify ChatGPT can retrieve, parse and analyze the private artifact through the existing GitHub integration.
- [ ] Repeat the request to prove freshness and verify no stale artifact is mistaken for the latest report.
- [ ] Confirm the complete workflow remains within included/free-tier quotas; do not enable paid add-ons or auto-refill.

## 4. Validation and release gates

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
- [ ] Resolve report workflow runner/queue issue.
- [ ] Complete private artifact upload, retention, secret-leakage and retrieval checks.
- **Current state:** workflow implementation exists; operational round-trip is not verified.

### Gate E — release readiness
- [ ] Independent security review.
- [ ] All critical validation gates complete with evidence on exact SHAs.
- [ ] License selected and documented.
- [ ] User approval for PR/merge/release and separately for any Production deployment.
- **Current state:** not release-ready; no Production deployment is authorized.

## 5. Branch and repository policy

- Continue source work in `Znect-god/znect-all-plugins`, currently on `test/ci-bridge-webhook-ingress-contract`.
- Keep changes isolated. Do not merge, open a PR, or update `main` without explicit approval.
- Older branches (`feat/ci-bridge-circleci-webhooks`, `feature/ci-bridge-test-reports`, `feature/znect-ci-bridge-source`, `work/znect-ci-bridge-free-channel-v0.2.0`, `work/znect-ci-bridge-mcp-v0.2.0`) are historical work lines/prototypes; do not develop them in parallel unless a specific recovery or comparison requires it.
- The `docs/ci-bridge-implementation-roadmap` branch contains the earlier roadmap source; this living copy is maintained alongside the active engineering branch so implementation status and future work stay together.
- Znect Build remains a separate repository for centralized application builds, with GitHub Actions as its central execution engine. A dedicated Build API is not present. The actual run records, jobs, logs and run-level artifacts are available from GitHub Actions' read-only repository APIs; CI Bridge should integrate with those documented APIs rather than guessed Znect Build routes. A Node/Cloudflare Worker validation recipe, disabled CI Bridge registry target and validated-source fingerprint artifact are present on isolated Znect Build branch `feat/ci-bridge-node-worker-recipe`; that branch is not merged and no run has been triggered. CI Bridge now has a source-level GitHub Actions read-only adapter and MCP tools, but live verification is pending. Do not move Bridge source into Build.
- Do not trigger GitHub Actions, CircleCI, builds, deployments, Preview refreshes or Production changes without explicit authorization.
- Do not request already-configured credentials again. Never put secret values in code, docs, commits, chat or logs.

## 6. Operating rule for roadmap updates

For every meaningful feature or fix:
1. Update the code and relevant tests/docs.
2. Mark the corresponding roadmap item **(выполнено)** in the same development cycle.
3. Keep validation status separate: mark tested/verified only when the exact check actually ran and its result is available.
4. Record the exact commit/branch and any remaining limitations.
5. Do not mark a feature deployed or operational merely because its source code exists.

## 7. Development log — 2026-11-17

- Added the living roadmap to the active engineering branch and linked it from the plugin README and Usage Guide.
- Hardened internal event-page parsing, project-slug ownership checks, duplicate/order/cursor consistency validation and empty-page cursor handling; malformed pages fail closed.
- Hardened the Durable Object append boundary with an 8 KiB streaming body cap, JSON media-type enforcement, strict normalized-event validation and rejection of unknown fields.
- Updated the security review with the new storage trust-boundary controls and explicit current-head validation limitations.
- Added a second event-page output allowlist so legacy or corrupted stored rows cannot expose unknown fields through Browser API/MCP readers.
- Aligned project-registry validation with the two CircleCI GitHub slug forms already accepted by webhook normalization; added a registry regression test.
- Added a focused Browser API regression test for a malformed event-store page. This test has been authored but not executed.

## 8. Development log — 2026-11-18

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
