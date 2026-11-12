# Security review notes

**Review date:** 2026-11-11  
**Scope:** source-level review of the prototype Worker and its security helpers  
**Result:** targeted hardening applied; not a complete security audit

## Findings and decisions

### Artifact host allowlist was broader than necessary — addressed

The original rule accepted every hostname ending in `.amazonaws.com`. CircleCI documentation describes non-HTML artifacts as redirects to S3, while HTML/XHTML artifacts use project-specific `*.circle-artifacts.com` subdomains.

The allowlist now accepts:
- project-specific subdomains of `circle-artifacts.com`;
- S3-style AWS endpoints, including regional S3 endpoints.

The fixed-origin CircleCI HTTP client was also isolated and given mocked tests for path confinement, authentication errors, sanitized upstream failures, and bounded JSON parsing.

It no longer accepts unrelated AWS service hosts such as `ec2.amazonaws.com` or arbitrary `attacker.amazonaws.com` hosts. Regression tests cover both accepted S3 patterns and rejected unrelated AWS hosts.

Reference: https://circleci.com/docs/guides/security/security/

### Failed authentication attempts are rate-limited — partially addressed

Failed Bearer authentication on both MCP and browser API routes now consumes a separate Cloudflare rate-limit bucket keyed by a SHA-256 digest of the Cloudflare-provided client-IP header. The raw address is not used as the limiter key. The configured threshold is 60 requests per 60 seconds per Cloudflare location, matching the existing binding.

This mitigates repeated token guesses from one address, but Cloudflare's built-in limiter is approximate and location-local. Clients behind a shared NAT also share a bucket, and distributed attempts can use multiple locations or addresses. A dedicated Cloudflare WAF/rate-limiting rule with monitoring remains a useful additional edge control.

### Browser API error responses redact configured credentials — addressed

The browser JSON API now applies configured-secret redaction to upstream exception messages before returning an HTTP 502 response. A regression test injects all three configured credentials into a synthetic transport error and verifies that none is returned.

### Automatic diagnostic output remains valid JSON when bounded — addressed

The `diagnose_run` response now shortens the largest string fields when its 120,000-character response budget is exceeded, records `response_truncated: true`, and preserves valid JSON instead of cutting the serialized document mid-token. A regression test parses an oversized diagnostic response and checks the budget and truncation flag.

### Log redaction remains best-effort — open

Configured Worker secrets and common credential patterns are redacted, but custom formats, encoded values, split secrets, binary content, and unknown upstream credentials may evade detection. Treat returned logs as sensitive. Never claim that redaction guarantees secrets cannot appear.

### CircleCI API v3 integration — implemented, live verification open

The read-only v3 adapter is now wired to MCP tools for project resolution, recent runs, run/workflow/job details, step stdout/stderr, structured test results, artifact metadata/downloads, and one-call failed-run diagnosis. The legacy v1.1 tools remain available for build-number-based access. Both paths are GET-only. The configured CircleCI token has not yet been verified against the live v3 project endpoint, and the documented Forge failure has not yet been re-diagnosed through the Bridge.

### MCP Origin validation — addressed by the transport wrapper

The Worker delegates Streamable HTTP handling to Cloudflare Agents SDK v2 `createMcpHandler`. The SDK validates every present `Origin` header, rejects malformed and opaque origins, and applies its default hostname allowlist. Regression tests verify rejection of an untrusted web origin, `null`, and a `file:` origin with HTTP 403. Requests from non-browser MCP clients without an Origin header remain supported. This control is distinct from CORS; `corsOptions: false` disables CORS handling but does not opt out of the SDK's Origin validation.

Reference: https://developers.cloudflare.com/agents/model-context-protocol/protocol/transport/

### Other controls reviewed

- CircleCI API calls are GET-only, use a fixed project path, have a timeout, and have a streaming JSON body ceiling.
- MCP and browser authentication are checked before dispatch; authenticated traffic uses per-token digest keys, while failed attempts use a separate per-client-IP digest key.
- Artifact redirects are manual, revalidated at every hop, limited to three hops, and use HTTPS/default-port checks.
- Log streams and final output have byte/character budgets.
- CORS is disabled and caller-supplied artifact URLs are not accepted.
- CI workflow uses read-only repository permissions and performs dry-run validation only.

## Remaining verification

- Expand mocked CircleCI adapter tests to cover timeout/abort behavior and additional response edge cases; current tests cover 401/403/429, malformed/oversized responses, and fixed-origin path validation.
- Verify the artifact URL patterns against actual CircleCI responses without exposing presigned URLs.
- Consider an additional Cloudflare WAF/rate-limiting rule for distributed failed-authentication attempts and monitor shared-NAT effects.
- Review MCP transport behavior and SDK security advisories before production use; Origin validation is covered by mocked Worker regression tests.
- Complete token/project compatibility checks and API v3 parity tests.
- Confirm that the actual CircleCI account/token can resolve `gh/Znect-god/znect-forge` and read run, job, test, and artifact resources.
- Perform a separate independent security review before any production deployment.

No deployment or real-secret test was performed during this review. The current source-level review does not establish live CircleCI connectivity.
