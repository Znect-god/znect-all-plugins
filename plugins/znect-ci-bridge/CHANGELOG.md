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

- Added Worker-level tests for the health route, Bearer authentication rejection, unsupported HTTP methods, and missing secrets; all 16 automated tests pass.

- Implemented manual artifact redirect handling with per-hop HTTPS/host/port validation and a three-hop ceiling.
- Added regression tests for valid and blocked redirect targets.
