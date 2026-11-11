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

It no longer accepts unrelated AWS service hosts such as `ec2.amazonaws.com` or arbitrary `attacker.amazonaws.com` hosts. Regression tests cover both accepted S3 patterns and rejected unrelated AWS hosts.

Reference: https://circleci.com/docs/guides/security/security/

### Failed authentication attempts are not rate-limited — open

The Cloudflare token limiter runs only after successful Bearer authentication. This prevents unauthenticated requests from consuming the legitimate token's quota, but it does not mitigate repeated guesses against the endpoint.

Do not add a low per-IP application limit without considering shared NATs and legitimate clients. Preferred follow-up: configure a Cloudflare WAF/rate-limiting rule at the zone/Worker edge, with a conservative threshold and monitoring, then document its behavior. Until configured, this remains an explicit prototype limitation.

### Log redaction remains best-effort — open

Configured Worker secrets and common credential patterns are redacted, but custom formats, encoded values, split secrets, binary content, and unknown upstream credentials may evade detection. Treat returned logs as sensitive. Never claim that redaction guarantees secrets cannot appear.

### CircleCI API migration is not implemented — open

The current v1.1 adapter remains read-only. The v3 migration research and compatibility blockers are documented in `documentation/CIRCLECI_API_MIGRATION.md`. No token was tested and no API switch was made.

### Other controls reviewed

- CircleCI API calls are GET-only, use a fixed project path, have a timeout, and have a streaming JSON body ceiling.
- MCP authentication is checked before dispatch; the configured token is not used directly as the rate-limit key.
- Artifact redirects are manual, revalidated at every hop, limited to three hops, and use HTTPS/default-port checks.
- Log streams and final output have byte/character budgets.
- CORS is disabled and caller-supplied artifact URLs are not accepted.
- CI workflow uses read-only repository permissions and performs dry-run validation only.

## Remaining verification

- Add mocked CircleCI adapter integration tests and verify 401/403/429, malformed/oversized responses, and timeouts.
- Verify the artifact URL patterns against actual CircleCI responses without exposing presigned URLs.
- Configure edge-level throttling for failed authentication attempts.
- Review MCP transport behavior and SDK security advisories before production use.
- Complete token/project compatibility checks and API v3 parity tests.
- Perform a separate independent security review before any production deployment.

No deployment, live API call, or real-secret test was performed during this review.
