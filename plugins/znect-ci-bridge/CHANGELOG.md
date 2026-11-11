# Changelog

## [0.1.0] - 2026-11-11
### Added
- Imported the complete initial Cloudflare Worker/MCP source project.
- Pinned direct dependency versions based on the successful Termux install.
- Added a Linux GitHub Actions workflow for TypeScript validation and Wrangler dry-run.
- Added outbound request timeouts.
- Added streaming byte limits for CircleCI log responses before decoding.

### Security notes
- The plugin remains a prototype.
- No live credentials were used and no Cloudflare deployment was performed.
- CircleCI API v1.1 compatibility, artifact host allowlisting, rate limiting, and log redaction still need review.
