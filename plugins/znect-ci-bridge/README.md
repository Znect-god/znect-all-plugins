# Znect CI Bridge

**Status:** `prototype`  
**Version:** `0.1.0`

Znect CI Bridge is an experimental, read-only MCP server for CircleCI build information. It runs as a Cloudflare Worker and is intended for an MCP-compatible client.

It is scoped to the fixed CircleCI project `Znect-god/znect-forge`. It must not modify, trigger, retry, cancel, or deploy Forge pipelines.

## Read-only MCP tools

Legacy v1.1 tools remain available for compatibility:
- `list_recent_builds(limit)` — latest legacy job builds; limit 1–30.
- `get_build_details(build_num)` — legacy build metadata and step/action statuses.
- `get_build_logs(build_num, step_index?, max_actions?)` — bounded legacy console output.

New API v3 tools are also exposed:
- `check_connection()` — verifies read-only API v3 access and resolves the fixed project slug to its UUID.
- `list_recent_runs(limit)` — latest project runs with UUIDs and current outcomes; limit 1–30.
- `get_run_details(run_id)` — one run plus its workflows and jobs, addressed by UUID.
- `get_job_details(job_id)` — details for one job addressed by UUID.
- `get_job_logs(job_id, step_num, execution?, stream?, max_chars?)` — bounded stdout/stderr for a job step.
- `get_job_test_results(job_id, max_chars?)` — structured test results as bounded JSON Lines.
- `list_job_artifacts(job_id)` — artifact path/size metadata; presigned URLs are not exposed.
- `get_job_artifact(job_id, artifact_path, max_chars?)` — fetch one artifact by exact listed path through an internal HTTPS host allowlist; bounded text output .
- `diagnose_run(run_id)` — one-call diagnostic: finds failed jobs, failed steps, structured test results, and small JUnit artifacts automatically (maximum five failed jobs per run).

The v3 tools use the fixed project slug `gh/Znect-god/znect-forge`, resolve its UUID through CircleCI, and do not attempt to translate legacy build numbers into v3 UUIDs. Workflow and job collection endpoints follow opaque pagination cursors with a hard ceiling of 200 resources per collection; repeated cursors and collections exceeding that ceiling fail explicitly rather than silently returning partial data. `diagnose_run` examines at most 20 workflows and five failed jobs per run, collecting failed-step metadata, bounded stdout/stderr, structured test results, and up to two small JUnit/test-report artifacts per failed job. Its `diagnostics_summary` reports total versus inspected workflows, whether either inspection limit was reached, and an `incomplete` flag so a bounded report cannot be mistaken for exhaustive diagnostics. All tools are read-only; no build mutation tools exist.

## Source layout

- `src/index.ts` — Worker entry point, authentication, and MCP tools.
- `src/circleci.ts` — legacy v1.1 fixed-origin, read-only HTTP adapter.
- `src/circleci-v3.ts` — CircleCI Cloud API v3 read-only adapter used by the v3 MCP tools, including structured test results and safe artifact retrieval.
- `src/security.ts` — authentication comparison, artifact URL validation, bounded streams, redaction, output limits, and safe redirect handling.
- `test/security.test.ts` — security helper and artifact-host/redirect tests.
- `test/circleci.test.ts` — mocked v1.1 adapter tests.
- `test/circleci-v3.test.ts` — mocked v3 authentication, project resolution, pagination, resource traversal, and bounded job-output tests.
- `test/worker.test.ts` — Worker HTTP, authentication, and rate-limit boundary tests.
- `package.json` and `package-lock.json` — pinned direct and resolved dependency versions.
- `wrangler.toml` — Worker configuration and rate-limit binding.
- Root `.github/workflows/znect-ci-bridge.yml` — Linux validation workflow.

## Security controls

- `CIRCLECI_TOKEN` and `MCP_ACCESS_TOKEN` are expected as Cloudflare Worker Secrets.
- CircleCI API requests are GET-only, use fixed origins, 15-second timeouts, and bounded response bodies.
- MCP requests require a Bearer token. Comparison uses fixed-length SHA-256 digests.
- The MCP endpoint is rate-limited to 60 authenticated requests per 60 seconds per Cloudflare location. The rate-limit key is a SHA-256 digest of the configured MCP token, not the raw token.
- If the rate-limit binding is absent or unavailable, the MCP endpoint fails closed with HTTP 503.
- Cloudflare's built-in rate limiter is approximate and local to each Cloudflare location; it is not a strict global quota. Failed authentication attempts are not covered by this per-token limit.
- Artifact URLs and every redirect target must use HTTPS, a CircleCI artifact subdomain or S3-style AWS endpoint, and the default HTTPS port. Redirect chains are limited to three hops.
- Log response bodies are streamed with a byte ceiling, then limited to 80,000 characters per action and 160,000 across the complete response.
- Configured Worker secrets and common credential patterns are redacted heuristically. This is best-effort and cannot guarantee detection of every upstream secret.
- CORS is disabled. No arbitrary artifact URL is accepted from the MCP caller.

The rate-limit namespace ID in `wrangler.toml` must be unique within the Cloudflare account. Check it before deployment.

These controls reduce risk but do not constitute a complete security audit.

## API compatibility

The Forge project was set up on CircleCI Cloud in the earlier project workflow. CircleCI's current API for new Cloud integrations is v3; the v3 adapter powers the run, job, test-result, artifact, and automatic-diagnosis tools. CircleCI Server is not the target for this project.

The legacy v1.1 tools remain temporarily for compatibility. They use build numbers, while v3 uses UUIDs, so no automatic mapping or fallback is attempted. The exact v3 project resolution and Bearer-token access still require a live check using the user's CircleCI API token. See [the migration plan](documentation/CIRCLECI_API_MIGRATION.md).

## Development

Use Node.js 24 on Linux, macOS, or Windows:

```bash
npm ci
npm run typecheck
npm run test
npx wrangler deploy --dry-run
```

Android ARM64 Termux cannot run the current Wrangler/workerd binary. Use GitHub Actions Linux workflow for Worker validation instead.

## Deployment and live verification

1. Check that the rate-limit namespace ID in `wrangler.toml` is unique in your Cloudflare account.
2. Configure `CIRCLECI_TOKEN` and `MCP_ACCESS_TOKEN` as Worker Secrets. Never commit them.
3. Deploy only after reviewing remaining limitations and explicitly authorizing deployment.

No live CircleCI token or API request has been used. Cloudflare Workers Builds reported a successful Preview build and deployment for current PR head commit `6ae0902dad253dae807d2e22cafc1b4cf21b0196` on 2026-11-12. The Preview URL is `https://816c685c-znect-ci-bridge.znect699.workers.dev`. This confirms Preview deployment only; production deployment and live MCP/CircleCI authentication and API access remain unverified. The GitHub Actions Wrangler dry-run does not deploy.

## Known limitations

- Prototype only; not production-ready.
- CircleCI Cloud hosting is established from the earlier Forge setup; live API v3 token access and project UUID resolution are not yet verified.
- The v3 adapter and MCP tools are tested with mocked HTTP responses. Live project resolution, run retrieval, failed-step log retrieval, test-result access, and artifact access still require verification against CircleCI using the configured token. The `diagnose_run` aggregator limits itself to five failed jobs per run and two report artifacts per job to control API usage and response size.
- CircleCI API v3 test-result and artifact endpoints may return no data when test metadata or artifacts were not uploaded by the job. Artifact retrieval is restricted to exact paths returned by CircleCI and allowlisted HTTPS hosts.
- Legacy v1.1 tools remain alongside the v3 tools. There is intentionally no automatic build-number-to-UUID mapping or silent fallback.
- Rate limiting is approximate and per Cloudflare location, not a strict global limit.
- Failed Bearer-token attempts are not covered by the per-token rate limiter.
- Log redaction is best-effort.
- No persistent storage, scheduled polling, alerts, or push notifications yet.
- Wrangler/workerd is unsupported in the current Android ARM64 Termux environment.
- License remains undecided; public visibility does not grant reuse or redistribution rights.

## Relationship to Znect Forge

This plugin only reads CircleCI build information. It does not change Forge source code or CircleCI configuration and does not start or alter Forge builds. The Forge 0.8.0 freeze remains in force unless explicitly changed by the user.

