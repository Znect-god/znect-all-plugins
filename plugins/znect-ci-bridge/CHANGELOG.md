## [0.1.0] - 2026-11-15 CircleCI API v3 schema alignment
### Security and correctness
- Require the API-mandated job workflow relationship before returning job details, logs, test reports or artifacts; missing or malformed references now fail closed.
- Normalize the documented API v3 step records directly, using each step's `num`, `outcome`, `phase` and `exit_code`; derive parallel execution numbers from the ordered execution array instead of assuming a non-schema `execution` property.
- Reject missing or malformed pagination metadata rather than silently treating an incomplete upstream collection as complete. Run listing now fails explicitly if its two-page safety window ends before the requested result limit is met.
- Added regression coverage for missing job relationships, native API v3 step records, parallel execution indexing and malformed pagination. Fresh CI/typecheck validation remains pending.

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
