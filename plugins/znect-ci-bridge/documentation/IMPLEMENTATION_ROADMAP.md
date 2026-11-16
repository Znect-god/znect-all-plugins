# Znect CI Bridge — implementation roadmap

**Status:** in-development; isolated Preview only.  
**Updated:** 2026-11-16  
**Target project:** CircleCI Cloud `gh/Znect-god/znect-forge`.  
**Cost constraint:** free services and included quotas only; no paid add-ons, auto-refill, or Production deployment.

This roadmap reconciles the original implementation plan with the repository state observed on 2026-11-14. It is an execution checklist, not a claim that the end-to-end system is already operational.

## 1. Intended end-to-end result

The user asks ChatGPT to inspect Znect Forge. ChatGPT can retrieve a private, current report containing:

- Forge repository metadata, branches, commits, open PRs/issues;
- GitHub Actions and CircleCI run/workflow/job status;
- failed step metadata and bounded logs;
- structured test results and selected small test/JUnit artifacts;
- CircleCI workflow-completion events received by the Bridge.

ChatGPT analyses the report and continues debugging. The Bridge and its CircleCI adapter remain read-only: no build trigger, retry, cancellation, configuration write, deployment, or source modification.

## 2. Architecture and responsibilities

1. **Znect Forge / CircleCI Free** — builds and tests Android changes.
2. **CircleCI outbound webhook** — sends signed `workflow-completed` events to the existing Cloudflare Worker Preview.
3. **Existing Znect CI Bridge Worker** — verifies HMAC, filters the fixed Forge project, normalizes and deduplicates events, stores them in a SQLite-backed Durable Object, and exposes bounded read-only diagnostics.
4. **Private assistant delivery channel** — the intended free path is a private GitHub issue-comment command that starts a report workflow and stores the report as a short-lived private artifact.
5. **ChatGPT GitHub integration** — reads the private artifact and analyses the report.

The Worker does not push unsolicited messages into an open ChatGPT conversation. The private GitHub artifact is a request/response transport, not a real-time ChatGPT push channel.

## 3. Verified repository state on 2026-11-14

### Bridge repository: `Znect-god/znect-all-plugins`

- Working implementation branch: `feat/ci-bridge-circleci-webhooks`.
- PR #5, “Add signed CircleCI webhook event inbox to Znect CI Bridge”, is **merged into `feature/ci-bridge-test-reports`**, merge commit `2840dc49c0165b220b69344ff779624a83c03268`. It was not merged into `main`.
- The named Cloudflare Preview is `feat-ci-bridge-circleci-webhooks`; Preview URL and credentials remain isolated from Production.
- Preview checks previously passed: typecheck, 103 tests, authenticated MCP/browser API smoke checks, synthetic signed webhook acceptance, duplicate suppression, Durable Object persistence and retrieval.
- CircleCI project webhook `Znect CI Bridge Preview` was registered for `workflow-completed`; CircleCI accepted its initial ping with 2xx.
- **Not yet verified:** a real workflow-completed delivery correlated with CircleCI delivery history and retrieved from the durable inbox through MCP/browser API.
- **Not yet fully verified:** representative live run/workflow/job/log/test/artifact diagnostic coverage.
- No Production deployment is authorized.

### Private Forge repository: `Znect-god/znect-forge`

- PR #9, “Add private on-demand Znect CI Bridge report channel”, is **merged into `main`** at `fb226fb25e414f4ce0f53d1b7a8f280b00b2c60a`. The issue-comment workflow is therefore present on the default branch.
- Two requests were posted to private issue #8. GitHub Actions runs #43588698423 and #43589116587 both failed before any workflow step ran; their job summaries have no steps/logs. The failure reason is not established from the accessible GitHub response. Do not assume billing is the cause until the check-run annotation or account billing/usage state is verified.
- PR #10, “ci(circleci): add free-tier Android CI fallback”, was **merged on 2026-11-14** into `work/0.7.0-finish-daedric-workshop` (merge commit `670503fe7c35839dee75b77c3874d373afa496e2`). It did not target `main`; `.circleci/config.yml` is therefore on the 0.7.0 work line, not the default branch.
- The first PR #10 pipeline failure identifiers recorded earlier (`ae0ae4b7-3ad3-4323-b9b4-6f29544b155a` / `7223c6d2-46aa-49fb-bc49-9f5e9a5ec7af`) are historical and must not be used as the current failure.
- The latest verified CircleCI status on merge commit `670503fe7c35839dee75b77c3874d373afa496e2` is **failure**. Its status description requests `circleci run get c9081783-3269-4ca1-8043-e3d3c777b52a --failure-report`; the linked CircleCI workflow is `9e7851cd-08a8-44ba-ae92-339207a47a08`, job `7a81f847-93c8-44de-b769-3cf8963f1adc`. The actual failure report/log has not yet been retrieved, so no root cause is established.
- A separate GitHub Actions Android CI run `43610052025` on the same merge commit also failed before any job steps ran (job `132492925330`, zero steps, runner ID 0, no downloadable job log). This is not evidence of the CircleCI failure cause.
- The current `main` branch still has no `.circleci/config.yml`; the CircleCI “No configuration was found” status on the default-branch commit is expected. Do not move the work-branch config into `main` without explicit approval.

## 4. Execution phases and acceptance gates

### Phase A — establish the CircleCI baseline

- [x] Confirm the CircleCI project is connected to the private Forge repository.
- [x] Add a free-tier Android pipeline on an isolated branch.
- [ ] Retrieve the failure report and logs for the current CircleCI workflow `9e7851cd-08a8-44ba-ae92-339207a47a08` / job `7a81f847-93c8-44de-b769-3cf8963f1adc` (CLI failure-report request ID `c9081783-3269-4ca1-8043-e3d3c777b52a`). The earlier `ae0ae4b7...` / `7223c6d2...` identifiers are superseded.
- [ ] Fix only the demonstrated configuration/toolchain/test failure; do not guess.
- [ ] Re-run on the same feature branch and confirm unit tests, APK build, test results and artifact upload.
- [ ] Record the actual free-credit/resource-class usage; do not enable paid features or auto-refill.

**Gate A:** CircleCI Android CI succeeds on the feature branch and the reason for the first failure is documented. PR #10 remains unmerged until separately approved.

### Phase B — complete the existing CircleCI-to-Bridge webhook

- [x] Preview Worker has the signed webhook receiver and durable event inbox.
- [x] CircleCI webhook registration and initial ping accepted.
- [ ] Use the next ordinary Forge CircleCI workflow completion; do not create unnecessary builds just to generate an event.
- [ ] Correlate CircleCI delivery history (event ID, event type, project, workflow ID and timestamp) with the Preview inbox.
- [ ] Verify duplicate delivery does not create duplicate stored events.
- [ ] Retrieve the same event through both `list_recent_events` and `GET /api/v1/events`.
- [ ] Record this as “real CircleCI delivery verified” only after the correlation succeeds.

**Gate B:** a real CircleCI event is durably stored, deduplicated and retrievable.

### Phase C — verify live diagnostics

- [x] Read-only CircleCI API v3 adapter and diagnostic methods exist.
- [x] Preview smoke test confirmed live project resolution and basic read-only access.
- [ ] Use an existing failed Forge run to verify run → workflow → job traversal.
- [ ] Retrieve failed-step stdout/stderr with the configured limits and redaction.
- [ ] Retrieve structured test results and list/download only allowlisted, explicitly listed small artifacts.
- [ ] Verify `diagnose_run` produces a bounded, useful report and marks partial/incomplete data honestly.
- [ ] Compare the same historical run across legacy v1.1 and v3 only by commit SHA, branch and timestamps; never equate a legacy build number with a v3 UUID.

**Gate C:** at least one real successful run and one real failed run have representative read-only diagnostics, to the extent their jobs published logs/tests/artifacts.

### Phase D — restore the free ChatGPT request/response channel

Current intended path:

1. ChatGPT posts exact command `/znect-ci-bridge check` to private issue #8.
2. GitHub Actions `issue_comment` workflow gathers GitHub metadata/logs and Bridge/CircleCI diagnostics.
3. Workflow uploads a private artifact with one-day retention.
4. ChatGPT reads that artifact through the existing GitHub integration.

- [x] The workflow and report collector are merged into Forge `main`.
- [x] The collector shell syntax and mocked fixture path were checked.
- [ ] Establish why the two live GitHub Actions runs failed before their first step; inspect check-run annotations/account usage using an authorized surface.
- [ ] Confirm the existing `ZNECT_CI_BRIDGE_WEB_TOKEN` secret is present and matches the Preview `WEB_ACCESS_TOKEN`; never reveal or copy its value into chat.
- [ ] Once the runner is available, execute one request and verify the private artifact upload, one-day retention, no secret leakage, and ChatGPT artifact retrieval.
- [ ] Repeat once to prove a fresh request produces a fresh report.

**Gate D:** a user request produces a current private artifact which ChatGPT can read and analyse. Until then, label this channel “implemented but not operationally verified”.

### Phase E — investigate a CircleCI-native fallback only if Phase D remains blocked

The existing Bridge and its CircleCI adapter are explicitly read-only. Do not silently add pipeline-trigger, GitHub-write, retry, cancellation or deployment capabilities.

Potential designs to evaluate, in order:

1. Resolve the GitHub Actions runner failure first; this preserves the already implemented architecture and the read-only Bridge boundary.
2. If GitHub-hosted execution is unavailable, assess whether a CircleCI scheduled read-only poller can inspect a private inbox at an acceptable Free-credit cost. This requires a narrowly scoped GitHub read credential in CircleCI and a clear polling interval/cost budget.
3. A webhook-driven CircleCI report runner would require a GitHub `issue_comment` webhook receiver plus a CircleCI pipeline trigger. CircleCI documents pipeline triggering as a POST operation. This changes the existing read-only boundary and requires a separate explicit security/architecture decision; it is **not authorized by this roadmap**.

Do not create a second Cloudflare Worker. Extend the existing Preview Worker only after the chosen design is approved and its trust boundary is documented. No paid services, paid add-ons, or auto-refill.

## 5. Free-tier and safety rules

- Use CircleCI Free and Cloudflare Workers Free within their included quotas.
- GitHub Actions is also subject to its private-repository included usage quota; do not assume it is unlimited or that an immediate runner failure proves a payment problem.
- Do not enable spending, paid plans, auto-refill, or add-ons.
- Keep the Worker Preview isolated; no Production deployment or Production secrets.
- Keep CircleCI diagnostics GET-only and read-only.
- Do not trigger, retry, cancel, or mutate Forge pipelines through the Bridge.
- Keep private logs and reports in private systems; do not copy them into the public plugin repository.
- Never disclose secrets in chat, logs, comments, commits or artifacts.
- Do not merge PR #10 or change Forge `main`/Production without explicit approval.
- Keep plugin status `in-development` until all acceptance gates and an independent security review are complete.

## 6. Current next actions

1. Diagnose the current failed CircleCI Android job (`9e7851cd-08a8-44ba-ae92-339207a47a08` / `7a81f847-93c8-44de-b769-3cf8963f1adc`) using its failure report; fix only the observed cause.
2. Use that ordinary run to verify the registered CircleCI webhook reaches the existing Preview inbox.
3. Complete representative live CircleCI diagnostics.
4. Resolve the GitHub Actions runner allocation failure and verify the private artifact round-trip.
5. If GitHub Actions remains unavailable, present the CircleCI polling/trigger alternatives with their exact permission and credit implications before changing the read-only design.

## 7. Related implementation documents

- [Usage and verification guide](USAGE_GUIDE.md)
- [Free ChatGPT access plan](FREE_ACCESS_PLAN.md)
- [Assistant channel design](ASSISTANT_CHANNEL.md)
- [CircleCI API migration](CIRCLECI_API_MIGRATION.md)
- [Security review](SECURITY_REVIEW.md)
