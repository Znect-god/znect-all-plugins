# Changelog

## [0.2.0] - 2026-11-17
### Added
- Free-first webhook/dashboard architecture; MCP is not a dependency.
- Cloudflare Worker endpoint with CircleCI HMAC-SHA256 signature verification.
- Bounded KV event storage, authenticated read-only API, dashboard, and Markdown export for ChatGPT Free.
- GitHub Actions typecheck/test workflow and deployment documentation.

### Limitations
- Not yet deployed or end-to-end tested.
- CircleCI job log and artifact retrieval remain future work.
- ChatGPT Free handoff is manual; no unsupported automatic ChatGPT API access is claimed.

## [0.1.0] - 2026-11-11
- Initial prototype documentation.
