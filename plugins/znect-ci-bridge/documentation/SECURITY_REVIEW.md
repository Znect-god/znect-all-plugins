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

### Browser dashboard DOM and credential handling — addressed

The dashboard renders CircleCI-controlled values through `textContent` and DOM node creation; no HTML injection sinks are used. The Web token remains in tab memory only, is cleared on disconnect or failed authentication, and is never placed in browser storage or the URL. Dashboard API requests now omit ambient cookies, reject redirects, suppress referrers, and use `cache: no-store`. Static regression tests cover these properties.

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

- CircleCI API calls are GET-only, use a fixed project path, have a 15-second timeout, normalize network/TLS failures without reflecting runtime details, parse Retry-After hints, and have a streaming JSON body ceiling.
- Nested MCP and browser run inspection use explicit workflow/job budgets designed to remain below Cloudflare Workers Free's 50-subrequest invocation limit. Legacy log retrieval is capped at 10 actions, accounting for up to three artifact redirects per action.
- MCP and browser authentication are checked before dispatch; authenticated traffic uses per-token digest keys, while failed attempts use a separate per-client-IP digest key.
- Artifact redirects are manual, revalidated at every hop, limited to three hops, and use HTTPS/default-port checks.
- Log streams and final output have byte/character budgets.
- CORS is disabled and caller-supplied artifact URLs are not accepted.
- CI workflow uses read-only repository permissions and performs dry-run validation only.
- Dashboard requests use an explicit Bearer header with `credentials: omit`, `redirect: error`, `referrerPolicy: no-referrer`, and `cache: no-store`; user-controlled and CircleCI-controlled strings are rendered as text nodes.

## Remaining verification

- Mocked CircleCI adapter tests now cover normalized timeout/network failures, numeric and HTTP-date Retry-After values, 401/403/429, malformed/oversized responses, and fixed-origin path validation.
- Verify the artifact URL patterns against actual CircleCI responses without exposing presigned URLs.
- Consider an additional Cloudflare WAF/rate-limiting rule for distributed failed-authentication attempts and monitor shared-NAT effects.
- Review MCP transport behavior and SDK security advisories before production use; Origin validation is covered by mocked Worker regression tests.
- Complete token/project compatibility checks and API v3 parity tests.
- The latest explicitly confirmed Cloudflare Preview deployment remains commit `51ea70791fa1f2862095653dd4ffd6a4664f5d3e`; the current PR head has not been independently deployed to Preview. GitHub Actions success and Wrangler dry-run do not establish a Preview deployment. The Preview also requires its own isolated `CIRCLECI_TOKEN`, `MCP_ACCESS_TOKEN`, and `WEB_ACCESS_TOKEN`; Production secrets are not inherited.
- Confirm that the actual CircleCI account/token can resolve `gh/Znect-god/znect-forge` and read run, job, test, and artifact resources.
- Verify actual production workload patterns against the bounded 40-job per-workflow and diagnostic inspection limits; large runs intentionally return bounded/incomplete diagnostics or a clear collection-limit error. Browser run details now report workflow truncation explicitly, while collections exceeding 40 resources per workflow fail with a clear collection-limit error.
- Perform a separate independent security review before any production deployment.

No deployment or real-secret test was performed during this review. The current source-level review does not establish live CircleCI connectivity.


### Signed CircleCI webhook ingress and durable event inbox — implemented, live verification pending

The feature branch adds `POST /webhooks/circleci` with the following controls:

- Verifies the `circleci-signature` v1 HMAC-SHA256 digest against the exact raw request bytes before JSON parsing.
- Rejects unknown/newer signature versions instead of accepting a v1 downgrade when a higher version is present.
- Requires `application/json`, caps the body at 64 KiB, and rate-limits failed signatures using the existing hashed client-IP limiter.
- Requires the webhook event type header to match the JSON payload type.
- Accepts only workflow/job completion events for the fixed Forge project; supports the CircleCI GitHub OAuth and API v3 slug spellings for that same repository.
- Extracts only a small allowlist of fields. It does not store the raw payload, author emails, arbitrary URLs, or webhook signing secret.
- Restricts workflow links to HTTPS `app.circleci.com` URLs.
- Deduplicates by CircleCI event ID in a SQLite-backed Durable Object, retains at most 500 events, and prunes records older than 30 days.
- Exposes the inbox through a read-only MCP tool and the authenticated browser API.

The signing secret must be configured independently as Cloudflare Preview/Production Worker Secret `CIRCLECI_WEBHOOK_SECRET` and as the CircleCI project webhook's Secret token. The Bridge does not create or mutate CircleCI webhook settings; that is a deliberate read-only boundary.

### Remaining webhook/notification verification

- Run the latest typecheck, unit tests, and Wrangler dry-run for the event-inbox branch.
- Confirm the SQLite Durable Object binding/migration deploys to the isolated Cloudflare Preview and the event inbox endpoint works against its real storage.
- Configure the Preview `CIRCLECI_WEBHOOK_SECRET` and register a CircleCI project webhook for `workflow-completed`.
- Verify a real signed event arrives, duplicate delivery is idempotent, and the MCP/browser event cursors return the stored event.
- The inbox is not a push channel into an open ChatGPT conversation. A supported polling/delivery integration is still required before proactive assistant notifications can be claimed.

The event receiver has not been promoted to Production. No webhook secret values or CircleCI credentials are stored in Git.


### 2026-11-14 Preview validation update

The feature-branch head `e15809bce835408e3b93745255c47d8ac3332257` was deployed to an isolated Cloudflare Worker Preview by GitHub Actions run [43566730976](https://github.com/Znect-god/znect-all-plugins/actions/runs/43566730976). The run passed dependency installation, TypeScript/unit checks, Preview deployment, Preview-only installation of `CIRCLECI_WEBHOOK_SECRET`, secret-name diagnostics, and the authenticated read-only smoke test.

The smoke test confirmed live CircleCI API v3 authentication and read access to the fixed Forge project, all 13 MCP tools marked read-only, the authenticated browser event inbox, and the SQLite-backed Durable Object binding. It sent a synthetic event signed with the configured webhook secret, confirmed first delivery acceptance and duplicate suppression, and verified retrieval through both the browser API and MCP `list_recent_events` tool. This verifies the Preview webhook implementation and storage path, but is not evidence that CircleCI itself has been configured to send webhooks.

The earlier pending items concerning Preview deployment, Preview secret installation, and synthetic signed-webhook/storage verification are therefore resolved for this commit. The following remain open:

- Register the real CircleCI project webhook for `workflow-completed` and verify an actual CircleCI-signed delivery and retry.
- Verify broader live CircleCI API v3 run/workflow/job/log/artifact response handling beyond project access.
- Implement a supported polling/delivery path before claiming proactive notifications into an open assistant conversation.
- Complete an independent security review before any Production deployment.

Production was not deployed or modified. PR #5 remains Draft and unmerged. The branch remains separate from `main`.
