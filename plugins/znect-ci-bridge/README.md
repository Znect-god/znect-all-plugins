# Znect CI Bridge

**Status:** in-development · **Version:** 0.2.0

A free-first CI diagnostics channel for Znect projects. It receives signed CircleCI webhooks, stores bounded event history, and provides a browser dashboard plus a Markdown export that can be pasted into ChatGPT Free.

**MCP is not required or used by this free channel.** Paid MCP integrations, if offered, belong to a separate plugin and are not dependencies of this project.

## Free channel architecture

```text
CircleCI ──signed webhook──> Cloudflare Worker (Free plan)
                                  │
                                  ├── Cloudflare KV event history
                                  │
Browser dashboard <── HTTPS ─────┤
                                  │
ChatGPT Free <── manual Markdown export
```

The Worker verifies CircleCI's `circleci-signature` HMAC-SHA256 header. The browser dashboard uses a separate read-only bearer token. The read token is held in tab memory only and is not written to local storage.

## Implemented in this branch

- `POST /webhooks/circleci`: verify CircleCI v1 signature and accept events.
- `GET /health`: public health check.
- `GET /api/events`: authenticated recent event list.
- `GET /api/export`: authenticated Markdown diagnostic export.
- `/`: minimal Russian-language dashboard.
- Redaction of common secret/token fields before storage.
- 30-day event TTL and a bounded 100-event listing.
- GitHub Actions workflow for typecheck and tests.

## Cost model

The design targets Cloudflare Workers Free and Cloudflare KV Free allowances. Cloudflare currently documents 100,000 Worker requests/day on the Free plan; usage is subject to published quotas and limits. No paid MCP subscription, model API, paid database, or paid messaging provider is required for the basic channel.

This does not make ChatGPT Free an automatically callable API. The free workflow is: open the dashboard, copy the diagnostic export, and paste it into ChatGPT Free. Automatic delivery into a ChatGPT Free conversation is not available through this architecture and must not be claimed.

## Deployment configuration

1. Create a KV namespace in Cloudflare and replace the placeholder ID in `wrangler.toml`.
2. Configure Worker secrets (never commit their values):
   - `CIRCLECI_SIGNING_SECRET` — same secret configured on the CircleCI webhook.
   - `BRIDGE_READ_TOKEN` — a separate high-entropy token for dashboard/API read access.
3. Deploy from a supported Linux environment using Wrangler after installing dependencies. The Android ARM64 Termux environment previously used for the prototype could not run the current `workerd` binary; use GitHub Actions or another supported Linux environment.
4. Create a CircleCI outbound webhook for the Forge project:
   - URL: `https://<your-worker-host>/webhooks/circleci`
   - Events: `workflow-completed`, `job-completed`
   - Signing secret: the value stored as `CIRCLECI_SIGNING_SECRET`
   - TLS verification: enabled.

Do not enable any build-trigger or write capability. This bridge is read-only with respect to CircleCI.

## Security and limitations

- Event payloads are untrusted data.
- Common credential-like keys and text patterns are redacted, but this is not a substitute for upstream secret hygiene.
- This initial implementation stores event metadata/payloads only; it does not yet fetch full job logs or artifacts from CircleCI.
- Event retention is 30 days; the dashboard currently lists at most 100 recent records.
- The browser dashboard does not persist the read token.
- No automatic push notification into ChatGPT Free is possible here; export is a deliberate manual handoff.
- Configure usage monitoring and observe free-tier quotas.
- Do not use with sensitive production CI data until security review and tests pass.

## Next milestones

1. Pass Linux typecheck and unit/integration tests.
2. Add GitHub Actions webhook ingestion with signature verification.
3. Add authenticated on-demand CircleCI API v2 detail/log retrieval with bounded output.
4. Deploy to a non-production Cloudflare Worker and verify a real signed CircleCI webhook.
5. Validate redaction, deduplication, retention, and access control.
6. Only after evidence, promote status to `testing`.

## Licensing

No license has been selected yet. Do not assume redistribution rights.
