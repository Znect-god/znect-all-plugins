## Unreleased

- Clarified that `feature/ci-bridge-android-exporter` is a historical branch name for the single Znect CI Bridge plugin, not a separate Android application; documented that the complete current source is on the feature branch while `main` retains only the earlier prototype registration and README.

## 2026-11-18 — repair Preview smoke-test API contract

- Added the required registered project and CircleCI connection scope to Browser API status, run, report, diagnostics and event requests.
- Aligned status and MCP connection assertions with the actual response schema and required MCP tool arguments.
- Extended the read-only smoke preflight to validate the aggregate assistant report handoff metadata and fetch up to three diagnostic reports using reconstructed same-origin paths.
- Added regression-test source for request scoping, handoff metadata, read-only MCP calls and the approved Preview host boundary.
- Tests, typecheck and live Preview checks remain unexecuted; no CircleCI pipeline, Preview deployment, secret access or Production change was performed.

## 2026-11-18 — require a valid JUnit report root

- Restricted accepted JUnit XML documents to the standard `testsuite` and `testsuites` root elements; arbitrary well-formed XML can no longer be counted as a test report.
- Rejected CDATA sections outside the XML root while retaining valid XML comments and processing instructions.
- Added regression cases for a non-JUnit root and CDATA before the root. Tests and typecheck remain unexecuted; no CircleCI pipeline, API request, deployment or runtime configuration change was performed.

## 2026-11-18 — correct CircleCI v3 job execution and artifact mapping

- Corrected job-detail parsing to match CircleCI's public CLI v3 acceptance-fixture model: `parallel_executions` is an array of step arrays, with the outer index identifying the zero-based execution.
- Made `is_insignificant` optional in step parsing instead of rejecting otherwise valid step records that omit it.
- Preserved artifact execution indexes in the provider model and artifact listings; added an optional execution selector for artifact downloads so duplicate paths across parallel executions cannot be confused.
- Updated diagnostics to pass the artifact execution index through to the downloader and added regression-test source for nested steps and duplicate-path artifacts.
- Updated API migration guidance and implementation roadmap. Tests and typecheck remain unexecuted; no live CircleCI API request, pipeline, deployment or credential access was performed.

## 2026-11-18 — retire GitHub Actions central Build adapter

- Removed the separate `znect-build` provider type, GitHub Actions REST adapter, ZIP manifest parser, MCP tools, Browser API `/api/v1/build/*` routes and `ZNECT_BUILD_GITHUB_TOKEN` requirement.
- Restricted the provider contract and project registry to CircleCI; Znect Build is now registered as a normal CircleCI project connection.
- Removed the obsolete central Build adapter and ZIP parser tests; added a regression check that retired Build routes return 404 without upstream requests and updated registry tests to CircleCI-only.
- Rewrote provider, usage, registry, Free access and Znect Build connection documentation to use CircleCI API v3 run/job/artifact reads.
- Test source was updated but not executed. No CircleCI pipeline, live API probe, Preview deployment or Production change was performed.

## 2026-11-18 — CircleCI execution alignment

- Corrected the CI Bridge validation architecture: CircleCI is the execution platform; Znect Build remains the development and central recipe repository.
- Added a CircleCI exact-SHA validation workflow to the Znect Build feature branch. It is opt-in, disabled by default, and records both source and recipe SHAs plus CircleCI run identity.
- Disabled legacy GitHub Actions jobs in the Znect Build feature branch; no GitHub Actions workflow is used as the current executor.
- Updated the Znect Build README, architecture, operations, security model, roadmap and registry notes.
- Updated the assistant-channel guide and plugin metadata to describe CircleCI execution and the remaining Free-plan authenticated-access limitation.
- Added source-level contract assertions for the CircleCI workflow and inert legacy workflows. Tests, CircleCI connectivity and pipeline execution remain unverified.

## 2026-11-18 — verify ChatGPT custom MCP availability boundary

- Checked current OpenAI Help Center guidance: custom MCP server connections are documented for Business and Enterprise/Edu, with Pro read/fetch support; Free is not listed as supported.
- Kept custom MCP optional and rejected it as a required Free-tier transport. The private Browser JSON API remains primary; the dashboard's reviewed JSON export remains the explicit fallback while direct ChatGPT Free REST authentication is unresolved.

## 2026-11-18 — reconcile plugin metadata and historical architecture notes

- Removed the retired Android exporter from current plugin platform, dependency, security and assistant-access metadata.
- Moved earlier GitHub Actions/Preview checks into an explicitly historical evidence section; current-head validation is pending through central Znect Build.
- Replaced the obsolete CircleCI executor policy with the central Znect Build target and marked conflicting earlier architecture notes as superseded.

## 2026-11-18 — verify aggregate report diagnostic-link contract

- Extended the aggregate CircleCI report regression test to assert the exact failed-run UUID, status, same-origin diagnostics path, and selected project/connection query scope.
- Asserted that the aggregate report explicitly marks diagnostic bundles as not yet included, matching the dashboard's subsequent bounded diagnostic retrieval.
- Reconciled current roadmap wording with the central Znect Build executor and marked obsolete CircleCI/Android stage snapshots as superseded.
- Test execution and live Preview verification remain pending.

## 2026-11-18 — central Build recipe contract coverage

- Added central Znect Build tests for exact CI Bridge recipe/manifest step ordering, the disabled validation target, and no-deploy dry-run behavior.
- Added shell syntax validation for the central Node/Cloudflare Worker recipe to Znect Build's own validation workflow and aligned the request fixture with the current Bridge branch.
- These are source-level changes only; no Znect Build workflow was run.

## 2026-11-18 — enforce byte-accurate assistant report size limit

- Changed the dashboard's 600 KB export ceiling from JavaScript string length to the actual JSON Blob byte size, preventing multi-byte UTF-8 content from exceeding the advertised file-size bound.
- Updated the dashboard regression test source. Execution through Znect Build remains pending.

## 2026-11-18 — harden central Znect Build validation provenance

- Added `npm audit --audit-level=high` to the central Node/Cloudflare Worker recipe after `npm ci`.
- Updated the central validation manifest and CI Bridge read-only adapter to require the dependency-audit step in the exact validation sequence.
- Added regression-test source for accepting the complete manifest and rejecting one that omits the audit step.
- The central target remains disabled; no workflow was dispatched and no test execution is claimed.

## 2026-11-18 — remove redundant CI executor and Android handoff prototype

- Removed the standalone root `.circleci/config.yml`; CI Bridge validation must use central `Znect-god/znect-build`, not a parallel CircleCI workflow.
- Removed the optional Android exporter application, unexecuted Android JVM tests, Gradle wrapper, APK job wiring and Android-specific setup/design guides. The app was a redundant manual transport and did not authenticate a ChatGPT session.
- Preserved the existing Cloudflare Worker, CircleCI read-only provider adapter, Browser JSON API, webhook inbox, dashboard and bounded assistant-report download.
- Updated the current roadmap, README, assistant-channel, free-access, security and usage documentation. Historical entries below are retained as audit history and are superseded by this entry.
- No tests, Znect Build run, Preview deployment or Production change were performed as part of cleanup.

## 2026-11-18 — browser-dashboard assistant report export

- Extended the existing Znect CI Bridge dashboard with an explicit **Export assistant report** action; reused the existing Worker and authenticated Browser JSON API rather than creating a parallel bridge.
- The export retrieves the bounded aggregate report and up to three failed-run diagnostics for the selected project/connection, validates run UUIDs, and keeps credentials in the Authorization header only.
- Added scope-change/disconnect cancellation guards, partial-diagnostic indicators and a 600 KB total JSON export ceiling.
- The browser downloads one reviewable JSON report for explicit user-controlled handoff to ChatGPT. This does not establish automatic ChatGPT authentication.
- Added UI regression-test source and updated the assistant-channel guide, README and implementation roadmap. CircleCI test execution and live Preview verification remain pending; no Preview deployment or Production change was performed.

## 2026-11-18 — [SUPERSEDED] intermediate CircleCI-only executor direction

- The current CI Bridge architecture uses CircleCI as the **only CI executor** for CI Bridge source validation and Android exporter checks, via the root `.circleci/config.yml`.
- Znect Build remains a separate build/orchestration project and is not the CI Bridge validation executor.
- The private authenticated Browser JSON API is the ChatGPT-facing report source. The Android exporter performs a local CircleCI read-path check and enables explicit manual report sharing through Android Sharesheet.
- MCP is not required and is not used as the ChatGPT channel. Legacy MCP routes/tools are not the supported handoff.
- GitHub Actions workflows/report collectors and private Forge inbox report plans described in older entries are historical/superseded, not active CI Bridge execution or ChatGPT transport.
- The Browser API's existence does not prove that ChatGPT can automatically authenticate to it. Automatic ChatGPT session authentication remains an open platform limitation; the Android Sharesheet handoff is manual.
- The current CircleCI pipeline has not yet produced verified results for the current engineering HEAD. Authored tests are not passed tests; no APK artifact is claimed until CircleCI supplies it.
- No CircleCI pipeline mutation, Production deployment, secret retrieval or secret-setting change was performed.

## 2026-11-18 — Central Znect Build ownership clarification

- Clarified that CI Bridge validation and all Znect builds are executed through `Znect-god/znect-build`.
- CircleCI remains a read-only external provider for status, run, job, log, test and artifact inspection; CI Bridge must not dispatch or mutate CircleCI pipelines.
- The standalone Forge report workflow is to be reconciled with/migrated into central Build orchestration, not treated as an alternative build executor.

## 2026-11-18 — CircleCI report workflow contract guard

- Added a static validator for the private Forge report workflow to prevent regressions in required project/connection query parameters and status response field names.
- Wired the validator into the workflow before CircleCI report collection.
- Changes are isolated in Forge branch `fix/ci-bridge-free-circleci-report-params`; no workflow run was started and no deployment occurred.

## 2026-11-18 — [HISTORICAL / SUPERSEDED] Free non-MCP ChatGPT channel experiment

- Clarified that the supported ChatGPT access path is the private Forge issue command → GitHub Actions → authenticated CI Bridge Browser API → private short-lived report artifact; MCP is not required or used as the assistant channel.
- Confirmed Forge PR #9 merged the private report workflow and collector to Forge `main`.
- Corrected missing required project/connection query parameters and status-response validation in the report workflow on isolated Forge branch `fix/ci-bridge-free-circleci-report-params`.
- Live report execution and artifact retrieval remain unverified; no workflow was triggered and no deployment was performed.

## 2026-11-18 — Znect Build read-only adapter implementation

- Added a GET-only GitHub Actions adapter for the fixed central repository `Znect-god/znect-build`.
- Added MCP tools and authenticated Browser JSON API routes for connection probing, verified central run listing/details and run-scoped artifact metadata.
- Added source ownership verification using the central validation artifact name: registered project ID, SHA-256 source-repository fingerprint, validated source SHA and exact run ID. Also require the exact central repository, central workflow file and `main` branch.
- Updated the central workflow on the isolated Znect Build branch to publish the validated source fingerprint in its validation artifact name. The branch remains unmerged and no workflow was triggered.
- Extended the provider-neutral artifact contract to preserve run-scoped artifacts without assigning them to jobs.
- Explicitly report GitHub Actions job-log ZIP and generic test-report limitations rather than presenting them as CircleCI-style output.
- Added mocked adapter tests for source ownership, job-parent verification, run-scoped artifacts, unsupported ZIP log semantics and bounded ownership probes; they have not been executed on the current branch head.
- Added the central GitHub token to configured-secret redaction and added a regression test.
- Added mocked Browser API tests for central Build connection probing, run listing and request limits.
- Kept the central workflow's repository head branch/SHA separate from the validated project source revision; the run status is explicitly described as a workflow conclusion, not a project build result.

## 2026-11-18 — Central Znect Build onboarding correction

- Removed the standalone CircleCI validation workflow; Znect project builds and CI Bridge validation must go through Znect Build.
- Added a central Node.js 24.11.0 / Cloudflare Worker validation recipe and a registered-but-disabled `znect-ci-bridge/worker-validation` target on isolated Znect Build branch `feat/ci-bridge-node-worker-recipe`.
- The central recipe is not merged into Znect Build main and has not been executed. It runs dependency installation, TypeScript/Vitest checks, smoke-script syntax validation and Wrangler dry-run only; no deployment is included.
- Updated this roadmap and README to reflect the isolated central recipe and its disabled execution gate.
- Next integration direction: read-only GitHub Actions API access to Znect Build workflow runs/jobs/logs/artifacts; no guessed custom Build API.

## 2026-11-18 — Znect Build architecture alignment

### Corrected
- Confirmed that all Znect project builds must be orchestrated by `Znect-god/znect-build`, whose central execution engine is GitHub Actions.
- Removed the standalone `.circleci/config.yml` that had been added for CI Bridge checks; it was an independent workflow and not the correct central build path.
- Clarified that CircleCI remains a read-only diagnostics provider for projects that already use it, not the Znect build orchestrator.
- Recorded that CI Bridge is not yet a registered/enabled Znect Build target and that a Node.js/Cloudflare Worker recipe plus a real read-only result transport are still missing.

### Validation status
- No CircleCI pipeline or Znect Build workflow was triggered.
- No source tests, typecheck, Wrangler dry-run, Preview deployment, Forge build or Production action was run.
- The previous CircleCI workflow entry below is historical and superseded by this correction.

## 2026-11-18 — CircleCI validation workflow

### Added
- Added a root-level CircleCI configuration scoped to `test/ci-bridge-webhook-ingress-contract`.
- The job uses Node.js 24.11.0 and runs `npm ci`, `npm run check`, Preview smoke-test script syntax validation, and `wrangler deploy --dry-run`.
- The workflow contains no deploy, release, Forge build, or CircleCI mutation steps.

### Validation status
- Configuration and roadmap changes are committed to the isolated engineering branch.
- CircleCI has not been triggered. Typecheck, tests, smoke-script check and Wrangler dry-run have therefore not been executed on this branch head.
- No Preview or Production deployment was performed.

## 2026-11-18 — CircleCI slug and workflow URL validation alignment

### Fixed
- API v3 project resolution now accepts both explicitly supported CircleCI GitHub slug forms, `gh/` and `github/`, matching project-registry validation and webhook normalization.
- Reject non-default ports on HTTPS `app.circleci.com` workflow URLs at event normalization/storage and Browser/MCP output validation boundaries.

### Regression coverage
- Added API v3 resolver tests for the `github/` alias and unsupported slug prefixes.
- Added webhook-normalization and event-reader tests for non-default workflow URL ports.
- Tests and typecheck have not been executed on this branch head; no CI, Preview or deployment was started.

## 2026-11-17 — Durable Object append boundary hardening

- Enforce an 8 KiB streaming request-body limit and JSON media type for internal event appends.
- Validate canonical ISO timestamps, retention/future bounds, registered-slug syntax, optional field lengths, CircleCI workflow URLs and safe numeric fields before persistence.
- Reject unrecognized fields at the storage boundary to preserve the normalized event privacy allowlist.
- Independently enforce the same event field allowlist, size/type constraints, canonical timestamps, CircleCI URL checks and safe numeric bounds on Browser API/MCP event-page reads.
- Align project-registry slug validation with the supported `gh/` and `github/` CircleCI project slug forms.
- Added regression coverage for malformed timestamps, foreign and oversized project slugs, empty/oversized fields, unsafe URLs, unexpected personal-data fields, unsupported media types and oversized declared bodies. Tests/typecheck have not been run; no CI or deployment was started.

## 2026-11-17 — event-page ownership and pagination hardening

- Validate every stored event page against the CircleCI project slugs registered to the owning Znect project.
- Reject duplicate or incorrectly ordered cursors, a next_cursor that does not equal the page's maximum cursor, and empty pages that unexpectedly advance the cursor.
- Added Browser API regression coverage for foreign project slugs, duplicate and out-of-order cursors, and empty-page cursor advancement. Tests and typecheck have not been executed; no CI, Preview or deployment was started.

## 2026-11-17 — roadmap and event-page hardening

- Added the living implementation roadmap and linked it from the README and Usage Guide; implemented source work is marked **(разработано)** separately from validation, live verification and release gates.
- Hardened internal event-page parsing against malformed records, invalid event UUIDs/timestamps and cursors that exceed the page cursor.
- Added a Browser API regression test for malformed event-store pages. This test has not been executed; no typecheck, CI run, Preview deployment or live CircleCI delivery was performed.

## [0.1.0] - 2026-11-17 correlation reliability hardening
### Reliability and security
- Measure webhook event distance against the full CircleCI run execution interval, with safe fallback when one timestamp is missing or malformed; reject inverted run intervals.
- Reject non-finite or negative correlation time-window configuration before evaluating events.
- Return bounded generic errors for CircleCI provider failures in both MCP and Browser API correlation paths instead of exposing upstream exception details.
- Added regression tests for in-interval events, malformed timestamps, inverted intervals, and MCP/Browser API provider-error privacy. Tests and typecheck have not yet been run on this branch.

## [0.1.0] - 2026-11-17 webhook signature parser hardening
### Security
- Bound the CircleCI signature header to 1 KiB and at most eight version entries before parsing; reject duplicate v1 signatures and malformed multi-version headers. Added regression coverage for oversized, excessive and duplicate signature entries.

## [0.1.0] - 2026-11-17 webhook-to-run correlation
### Diagnostics
- Added the read-only `correlate_recent_events` MCP tool to enrich signed webhook inbox events with candidate CircleCI API v3 runs.
- Added the authenticated read-only browser endpoint `/api/v1/event-correlations` with the same matching rules and explicit event/run limits.
- Added a dashboard panel for recent webhook events, correlation status and bounded candidate run summaries; rendering remains text-only and refreshes are invalidated when the selected project/connection changes.
- Correlation requires an exact commit revision, rejects conflicting branches, and uses a bounded 24-hour distance-to-run-interval window. Multiple candidates remain explicitly ambiguous; webhook pipeline IDs are never assumed to be API v3 run UUIDs.
- Candidate lists are capped at three per event while preserving the full candidate count and an explicit truncation flag.
- Added bounded request limits, unit coverage for matching/ambiguity/no-match cases, and MCP/browser API schema, error-boundary and integration coverage. Tests and typecheck have not yet been run on this branch.

## [0.1.0] - 2026-11-17 webhook ingress regression coverage
### Reliability and security
- Expanded signed webhook integration coverage for CircleCI ping acknowledgements, event-type mismatches, malformed JSON, oversized payloads, duplicate acknowledgements, invalid storage acknowledgements, job-completion normalization, URL allowlisting and future timestamps.
- Tests and typecheck have not yet been run on this branch.

## [0.1.0] - 2026-11-15 authoritative event cursors
### Data integrity
- Ensure event inbox cursors always come from the SQLite sequence, never from additional properties in stored event JSON.
- Added a regression test that submits a conflicting cursor field and verifies the returned cursor and next_cursor remain database-derived. Fresh CI/typecheck validation remains pending.

## [0.1.0] - 2026-11-15 CircleCI upstream error response handling
### Reliability
- Discard non-success CircleCI API response bodies without buffering or exposing upstream content.
- Include a safely parsed `Retry-After` interval for job stdout/stderr rate-limit errors, matching JSON API behavior; no automatic retries are performed.
- Added regression coverage for text-endpoint 429 handling and response-body cancellation. Fresh CI/typecheck validation remains pending.

## [0.1.0] - 2026-11-15 bounded event inbox reads
### Reliability and data integrity
- Bound event inbox response bodies to 60 KB while streaming and cancel oversized responses before buffering them.
- Validate event page shape, cursor fields and requested result count before exposing Durable Object data through MCP or the browser API.
- Convert thrown storage bindings, non-success responses and malformed event pages into safe, consistent errors; added Worker and MCP regression tests. Fresh CI/typecheck validation remains pending.

## [0.1.0] - 2026-11-15 webhook event-store failure handling
### Reliability
- Convert Durable Object binding failures and malformed event-store acknowledgements into explicit retryable HTTP 503 responses, so webhook delivery failures do not escape as unhandled Worker exceptions or false acceptances.
- Added Worker-boundary regression tests for a thrown storage binding and an invalid acknowledgement. Fresh CI/typecheck validation remains pending.

## [0.1.0] - 2026-11-15 CircleCI API v3 schema alignment
### Security and correctness
- Require the API-mandated job workflow relationship before returning job details, logs, test reports or artifacts; missing or malformed references now fail closed.
- Verify `references.project.id` on every project-filtered run and on the fetched run detail; malformed or mismatched upstream relationships fail closed.
- Validate required CircleCI v3 job-step fields and reject malformed parallel-execution/step structures instead of silently omitting diagnostics.
- Preserve `is_insignificant` on normalized actions and omit insignificant failures from failed-step diagnostics and log retrieval.
- Mark MCP and browser diagnostics incomplete when failed-step logs, structured test reports or report artifacts are unavailable/truncated; expose the one-report-artifact cap and avoid silently treating missing step references as fully inspected.
- Normalize the documented API v3 step records directly, using each step's `num`, `outcome`, `phase` and `exit_code`; derive parallel execution numbers from the ordered execution array instead of assuming a non-schema `execution` property.
- Reject missing or malformed pagination metadata rather than silently treating an incomplete upstream collection as complete. Run listing now fails explicitly if its two-page safety window ends before the requested result limit is met.
- Follow cursors only for CircleCI v3 workflows; read the unpaginated jobs collection with its documented `filter[workflow_id]` parameter and a 200-job safety ceiling.
- Map run branch, revision and commit message from the documented event/VCS references, workflow outcome/phase from native fields, and job start/end timestamps from `started_at`/`ended_at`.
- Enforce the advertised 40-job-per-workflow inspection cap in MCP diagnostics and browser run/diagnostics endpoints; report per-workflow and summary truncation flags so omitted jobs cannot be mistaken for a complete inspection.
- Added regression coverage for missing job relationships, native API v3 step records, parallel execution indexing and malformed pagination. Fresh CI/typecheck validation remains pending.

## [0.1.0] - 2026-11-15 bounded webhook request streaming
### Security
- Enforce the 64 KiB CircleCI webhook body ceiling while reading the incoming request stream, cancelling oversized bodies before buffering the full payload.
- Added a Worker-boundary regression test for an oversized request without a declared Content-Length. Fresh CI/typecheck validation remains pending.

## [0.1.0] - 2026-11-15 strict CircleCI page-size validation
### Security and correctness
- Reject API v3 run and workflow collection pages that contain more records than the requested endpoint-specific page limit.
- Added regression tests for oversized upstream run and workflow pages. Fresh CI/typecheck validation remains pending.

# Changelog

## [0.1.0] - 2026-11-15 workflow ownership verification
### Security
- Added explicit validation of each CircleCI workflow's `references.run.id`; provider-side filter parameters are no longer treated as sufficient proof of ownership.
- Added regression coverage for a workflow linked to a different run and updated browser API fixtures to include the required ownership reference.
- Added coverage for legacy Durable Object event-ID migration and cross-workflow job rejection. Fresh CI/typecheck validation remains pending.


## [0.1.0] - 2026-11-15 webhook replay protection
### Security
- Separated CircleCI event-ID replay keys from the 500-record event-history cap. Duplicate deliveries remain detectable for the full 30-day event retention window even after their event records are evicted.
- Added a regression test that appends 501 distinct events and confirms the first event is still recognized as a duplicate after leaving the visible history.
- Existing retained event IDs are migrated into the new replay-key table when the Durable Object initializes. Fresh CI/typecheck validation is pending.


## [0.1.0] - 2026-11-15 npm install-script policy
### Security
- Added version-pinned npm `allowScripts` decisions: approved the native-binary validation scripts for `esbuild@0.28.2` and `workerd@1.20261110.1`; explicitly denied the optional support-message script for `core-js-pure@3.51.0`.
- This is a reviewed least-privilege policy, not blanket permission for dependency lifecycle scripts. Fresh CI validation is pending.


## [0.1.0] - 2026-11-15 CI verification
### Validation
- GitHub Actions run [#43581613616](https://github.com/Znect-god/znect-all-plugins/actions/runs/43581613616) passed on PR #2 commit `2840dc49c0165b220b69344ff779624a83c03268`, not on the later feature-branch head.
- Dependency installation, `npm audit` (zero vulnerabilities), TypeScript typecheck, 103 Vitest tests, smoke-test syntax validation and Wrangler dry-run passed for that earlier commit.
- The install emitted a non-fatal npm `allowScripts` warning for `core-js-pure`, `esbuild` and `workerd`. The subsequent compatibility-test changes and current branch head remain unverified by this run. No Worker deployment occurred.


## [0.1.0] - 2026-11-15 compatibility follow-up
### Changed
- Defined the three CircleCI API v1.1 tools as an explicit CircleCI-only compatibility API, separate from the provider-neutral API v3 adapter.
- Documented that legacy numeric build numbers are never converted into API v3 UUID run IDs and are not a future Znect Build integration path.

### Tests added
- Added MCP-level mocked coverage for legacy build listing, build details, bounded action-log retrieval, project-scoped v1.1 request paths, and rejection of artifact URLs outside the HTTPS host allowlist.
- Tests and typecheck have not yet been executed; no GitHub Actions workflow was manually triggered.


## [0.1.0] - 2026-11-11
### Added
- Imported the complete initial Cloudflare Worker/MCP source project.
- Pinned direct dependency versions compatible with the Agents/MCP SDK and Wrangler peer requirements.
- Added a Linux GitHub Actions workflow for TypeScript validation and Wrangler dry-run.
- Added outbound request timeouts.
- Added streaming byte limits for CircleCI log responses before decoding.
- Added redaction of the configured Worker secret values from returned build logs.

### Validation
- GitHub Actions passed dependency installation, TypeScript typecheck, and Wrangler dry-run with the log-redaction change included.
- The current branch's subsequent documentation and metadata updates are also checked by the same workflow.
- No live credentials were used and no Cloudflare deployment was performed.

### Security notes
- The plugin remains a prototype.
- CircleCI API v1.1 compatibility, artifact host allowlisting, rate limiting, and broader log redaction still need review.

### Security review follow-up
- Added fixed-length digest comparison for MCP bearer-token checks.
- Added artifact URL port validation and automated tests for security helpers.
- Enforced a 160,000-character aggregate log-output budget across actions.
- Used CircleCI's documented `limit` query parameter for recent-build listing.
- Added security tests to the Linux GitHub Actions workflow.

- Added a 1 MB streaming response-body ceiling and safe JSON parsing for CircleCI API responses.

- Upgraded the MCP server/client and Agents SDK to compatible 2.4.0 / 0.33.0 releases, Zod to 4.6.7, Wrangler to 4.160.0, Vitest to 5.1.0, and Workers types to 5.20261110.1 after the audit identified vulnerable older dependencies.

- Added a documented note that a committed lockfile is still required for fully reproducible transitive dependency resolution.

- Added Worker-level tests for the health route, Bearer authentication rejection, unsupported HTTP methods, and missing secrets; all 18 automated tests pass.

- Implemented manual artifact redirect handling with per-hop HTTPS/host/port validation and a three-hop ceiling.
- Added regression tests for valid and blocked redirect targets.

- Added a Cloudflare rate-limiting binding for authenticated MCP requests (60 requests per 60 seconds per Cloudflare location), keyed by a SHA-256 digest of the configured MCP token; the Worker fails closed if the binding is missing or unavailable.
- Added Worker regression tests for missing and exceeded rate limits.
- Updated the Linux workflow to publish the generated npm lockfile as a short-lived artifact for review and commit.

- Generated and committed `package-lock.json` from the Linux CI environment; CI then validated clean `npm ci` installs.
- Reduced CI permissions back to `contents: read` after the one-time lockfile commit.

- Simplified the validation workflow to use only `npm ci` and read-only repository permissions after the lockfile was committed; the resulting GitHub Actions run passed all checks.

- Extended log redaction beyond configured Worker secrets to cover common authorization headers, GitHub/Slack token patterns, AWS access-key IDs, JWTs, PEM private keys, and credential-like key/value pairs; added regression tests. This remains best-effort, not a guarantee.

- Expanded best-effort redaction coverage to GitLab, Stripe, Google API, npm tokens, and encrypted PEM private keys; synthetic regression fixtures are generated at runtime to avoid committing secret-shaped literals.

- GitHub Actions validated the expanded redaction implementation with 22 passing tests, zero high-severity-or-higher dependency audit findings, successful TypeScript checks, and Wrangler dry-run.

### API migration research
- Added a CircleCI API v3 migration plan covering authentication, UUID-based project identity, run/workflow/job mapping, pagination, read-only scope, and blockers.
- Confirmed from CircleCI's current documentation that API v3 is the recommended API for new Cloud integrations, requires personal API token authentication, and is not available on CircleCI Server.
- No API version switch, live token test, or Cloudflare deployment was performed.

### Security and integration-test follow-up
- Narrowed the artifact host allowlist from all AWS subdomains to CircleCI artifact subdomains and S3-style endpoints; added regional S3 and unrelated-AWS-host regression coverage.
- Isolated the fixed-origin, read-only CircleCI HTTP client in `src/circleci.ts`.
- Added mocked adapter tests for request construction, path confinement, 401/403 handling, sanitized HTTP errors, malformed JSON, and oversized responses.
- Added an explicit redirect-hop-limit regression test.
- These are mocked tests only; no live CircleCI token or endpoint was used.

- GitHub Actions run [43088128444](https://github.com/Znect-god/znect-all-plugins/actions/runs/43088128444) passed `npm ci`, `npm audit` (zero vulnerabilities), TypeScript typecheck, all 29 tests across three files, and Wrangler dry-run with the rate-limit binding.

- Added a separate CircleCI API v3 read-only client foundation with Bearer authentication, fixed-origin GET requests, UUID checks, project-slug resolution, cursor-based run pagination, run/workflow/job traversal, and bounded stdout/stderr reads.
- Added 15 mocked v3 client tests covering authentication, path validation, project resolution, pagination, resource traversal, output limits, and sanitized upstream failures.
- Kept the existing MCP tools on v1.1 until the Forge hosting type, token compatibility, exact project identity, and legacy build-number mapping are verified.
- Updated the migration plan and README to distinguish implemented v3 client groundwork from the still-pending MCP tool migration.


### CircleCI API v3 MCP tools
- Added three separate read-only MCP tools: `list_recent_runs`, `get_run_details`, and `get_job_logs`.
- Kept the legacy v1.1 build-number tools intact; no build-number-to-UUID guessing or automatic fallback is performed.
- Corrected single-resource response handling to unwrap CircleCI v3's `data` envelope.
- Matched the v3 jobs-list request to its documented filter parameters.
- Applied best-effort secret redaction and response-size ceilings to v3 run/job output.
- Updated the README and migration plan: the Forge project is already set up on CircleCI Cloud; live v3 token/project access remains to be verified.


### Signed CircleCI webhook event inbox (in development)
- Added a public webhook receiver that validates CircleCI's v1 HMAC-SHA256 signature against the exact raw request body.
- Added strict project/event validation, a 64 KiB request ceiling, safe field normalization, and CircleCI event-ID deduplication.
- Added a SQLite-backed Durable Object event inbox with a 500-event cap and 30-day retention.
- Exposed the inbox through the read-only MCP tool `list_recent_events` and authenticated browser endpoint `GET /api/v1/events`.
- Added unit and Worker-boundary tests for signature validation, event normalization, foreign-project filtering, and inbox access.
- Updated Preview smoke checks to require the event inbox and new MCP tool.
- Live webhook registration, webhook-secret provisioning, end-to-end delivery, and proactive ChatGPT notification delivery remain pending. An MCP event feed alone does not push messages into an open ChatGPT conversation.


## [0.1.0] — 2026-11-14 documentation/status correction

- Replaced stale branch, PR, Preview URL, workflow and verification statements in the README and usage guide with the current feature-branch state.
- Documented the exact isolated Preview endpoint, current Draft PR #5, and latest confirmed GitHub Actions run #43568774133.
- Clarified that CircleCI's successful Add Webhook ping/check verifies endpoint acknowledgement only; a real `workflow-completed` delivery is still pending.
- Added an ordered launch and end-to-end verification procedure, including delivery-history correlation, durable inbox inspection, duplicate verification, and MCP retrieval.
- Reaffirmed that the bridge remains in-development, Production is not deployed, and no PR merge or Production change is authorized.


## 2026-11-18 — Central Znect Build result visibility

- Repaired the central Znect Build read-only adapter and strengthened project/source ownership verification using the central request-validation artifact fingerprint.
- Added Browser JSON API evidence fields for verified source SHA, request fingerprint, validation manifest artifact metadata, and central job/step outcomes.
- Documented the runtime `ZNECT_PROJECT_REGISTRY` entry and least-privilege `ZNECT_BUILD_GITHUB_TOKEN` requirements.
- Added a regression test for central validation manifest artifact metadata. Tests were not executed in this change set.
- Preserved read-only behavior: no workflow dispatch, build execution, retry, cancellation, artifact download, deployment, or CircleCI mutation.


## 2026-11-18 — Bounded central validation manifest retrieval

- Added authenticated Browser JSON API endpoint to retrieve the central CI Bridge validation manifest for a verified run.
- Added bounded artifact download with strict redirect-host validation; GitHub credentials are not forwarded to the signed artifact-storage URL.
- Added ZIP path selection, size/entry limits, CRC validation and strict manifest-to-project/source/run checks.
- Added regression tests for exact-path extraction, missing manifest and corrupt entry handling. Tests and typecheck were not run.
- No central workflow/build, live API probe, deployment or runtime configuration change was performed.
 

## 2026-11-18 — Static contract review

- Reviewed Browser API authentication, rate limiting, GET-only routing, project/connection scope and read-only adapter call paths.
- Cross-checked central workflow ownership and the manifest schema against the central Build recipe.
- Tightened manifest checks to the exact target/profile/recipe/validation command list and supported outcomes.
- Confirmed central execution remains disabled. No typecheck, tests, workflow run, live API request or artifact download was performed.


## 2026-11-18 — Diagnostics parallel-execution type alignment

- Corrected the MCP diagnostics JUnit artifact result type to carry the optional CircleCI parallel execution index already supplied by the provider adapter.
- Audited failed-step log retrieval and confirmed stdout/stderr requests preserve the execution index; job-level structured test results remain unpartitioned by execution.
- Confirmed the current one-report-per-job diagnostics cap marks multiple eligible JUnit artifacts as incomplete rather than implying full coverage. Aggregating multiple per-execution reports remains future work.
- Static source review only; TypeScript, tests, live CircleCI requests and pipeline execution were not performed.


## 2026-11-18 — Bounded multi-execution JUnit diagnostics

- Replaced the one-report-per-job diagnostics cap with a shared collector used by MCP and Browser JSON API diagnostics.
- Collects up to four JUnit/test-results XML artifacts per job, retaining exact artifact paths and CircleCI parallel execution indexes.
- Enforces a 500,000-byte aggregate retrieval budget per job; later downloads are limited to the remaining byte budget.
- Marks reports incomplete and surfaces the artifact-limit indicator when count or byte limits prevent full collection. Individual artifact failures are retained alongside successfully retrieved reports.
- Static source review only. Focused regression tests and TypeScript checks remain pending; no CircleCI API calls or pipeline executions were performed.


## 2026-11-18 — Extracted bounded diagnostic artifact collector

- Moved JUnit/test-results collection into a standalone typed module shared by MCP and Browser JSON API diagnostics.
- Preserved the four-artifact and 500,000-byte per-job limits, including remaining-budget propagation for artifacts without known sizes.
- Added a fail-closed guard for adapter responses that exceed the remaining byte budget.
- Added focused regression-test source for parallel execution identity, duplicate paths, count/byte caps, unknown sizes, oversized artifacts, partial failures, truncation and filtering.
- Tests and typecheck were not executed. No CircleCI API calls, pipeline execution, deployment or runtime configuration changes were performed.


## 2026-11-18 — Explicit diagnostic completeness across MCP and Browser API

- Centralized diagnostic summary construction so MCP and Browser JSON API apply the same overall incompleteness rules.
- Ensured artifact-count/byte-limit indicators independently force the overall diagnostic `incomplete` flag.
- Added per-job source statuses for structured test results, JUnit artifacts and failed-step logs, distinguishing available, partial, empty/not-found, unavailable and not-applicable states.
- Corrected MCP failed-step log retrieval to pass the parallel execution index from its normalized failed-step record; previously that path read the wrong property name.
- Distinguish wholly unavailable failed-step logs from partially retrieved logs when every output stream request fails.
- Added focused regression-test source for source classification and shared completeness semantics.
- Tests and TypeScript checks were not executed. No CircleCI API requests, pipeline execution, deployment or runtime configuration changes were performed.


## 2026-11-18 — Unified CircleCI test result summaries

- Added a bounded normalizer that combines CircleCI job JSONL records with per-execution JUnit XML artifacts into one per-job count summary.
- Counts passed, failed, skipped and unknown test outcomes; labels totals as observed records, exposes which sources contributed, and retains malformed/truncated/incomplete indicators.
- Deduplicates only unambiguous one-to-one cross-source matches using shared classname/name identity, with file and execution conflict guards. Repeated identities that may represent retries or parallel shards remain separate and ambiguous groups are explicitly flagged.
- Gives CircleCI JSONL precedence on one-to-one status conflicts while surfacing the conflict and marking the summary incomplete.
- Exposes the same `test_summary` in both diagnostics paths, including the private Browser JSON API used for report handoff; JSONL retrieval failures and JUnit collection limits propagate to summary completeness.
- Added focused regression-test source. Tests and typecheck were not executed; no CircleCI API request, pipeline trigger, deployment or runtime configuration change was performed.


## 2026-11-18 — Self-describing free assistant report handoff

- Added explicit `assistant_handoff` metadata to the aggregate Browser JSON API report. It identifies the current path as a user-reviewed JSON attachment, states that automatic API access is not established, confirms MCP is not required and declares that no Bearer token is included.
- Preserved normalized per-job `test_summary` objects inside the dashboard's bounded aggregate export.
- Clarified that test totals represent observed records and that source coverage/incompleteness must be reviewed before drawing conclusions.
- Added Browser API contract-test source and updated the assistant-channel, README and usage documentation.
- Direct authenticated ChatGPT Free access remains unverified. Tests/typecheck and live Preview export were not run; no CircleCI pipeline, deployment or runtime configuration change was performed.


## 2026-11-18 — JUnit parser and parallel-execution metadata hardening

- Reject non-whitespace data outside the XML document root and multiple root elements while preserving valid empty self-closing JUnit suites.
- Reject malformed execution indexes in JSONL records and JUnit artifact metadata instead of silently treating the records as unscoped.
- Added regression-test source for malformed XML document boundaries and invalid execution metadata.
- Tests and typecheck remain pending CircleCI opt-in authorization; no pipeline or live API call was made.


## 2026-11-18 — Preview smoke event-scope follow-up

- Fixed both post-webhook verification reads to include the required `project_id`: the authenticated Browser API event inbox request and the MCP `list_recent_events` call.
- Added regression-test source asserting project scope on these follow-up reads, not only the initial inbox checks.
- Static source change only; tests and live Preview verification remain pending. No webhook was sent and no event store was modified.


## 2026-11-18 — Honest assistant export completeness status

- The dashboard now marks an assistant report export as complete only when the run list is not capped, webhook event storage is available, and every listed failed-run diagnostic is successfully included.
- Partial exports remain downloadable but are explicitly labelled partial, with a prompt to review run, event and diagnostic completeness markers.
- Added dashboard regression-test source for the combined completeness contract. Tests and live Preview checks remain pending.
