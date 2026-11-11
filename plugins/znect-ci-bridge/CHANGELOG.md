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
