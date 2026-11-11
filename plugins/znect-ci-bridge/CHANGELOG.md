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
- A Linux GitHub Actions run passed dependency installation, TypeScript typecheck, and Wrangler dry-run before the final log-redaction change.
- The final log-redaction change is awaiting a fresh CI run.
- No live credentials were used and no Cloudflare deployment was performed.

### Security notes
- The plugin remains a prototype.
- CircleCI API v1.1 compatibility, artifact host allowlisting, rate limiting, and broader log redaction still need review.
