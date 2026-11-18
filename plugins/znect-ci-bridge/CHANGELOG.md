## 2026-11-18 — Znect Build read-only adapter implementation

- Added a GET-only GitHub Actions adapter for the fixed central repository `Znect-god/znect-build`.
- Added MCP tools for connection probing, verified central run listing/details and run-scoped artifact metadata.
- Added source ownership verification using the central validation artifact name: registered project ID, SHA-256 source-repository fingerprint, validated source SHA and exact run ID.
- Updated the central workflow on the isolated Znect Build branch to publish the validated source fingerprint in its validation artifact name. The branch remains unmerged and no workflow was triggered.
- Extended the provider-neutral artifact contract to preserve run-scoped artifacts without assigning them to jobs.
- Explicitly report GitHub Actions job-log ZIP and generic test-report limitations rather than presenting them as CircleCI-style output.
- Added mocked adapter tests for source ownership, job-parent verification, run-scoped artifacts, unsupported ZIP log semantics and bounded ownership probes; they have not been executed on the current branch head.
- Added the central GitHub token to configured-secret redaction and added a regression test.
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
