# Changelog

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
