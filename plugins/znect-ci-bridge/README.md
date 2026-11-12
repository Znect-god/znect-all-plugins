# Znect CI Bridge

**Status:** `in-development`  
**Version:** `0.1.0`

Znect CI Bridge is an experimental, read-only CircleCI service running as a Cloudflare Worker. It exposes both an MCP endpoint for compatible clients and a standalone browser dashboard with an authenticated JSON API, so the free browser workflow does not require a paid ChatGPT plan.

It is scoped to the fixed CircleCI project `Znect-god/znect-forge`. It must not modify, trigger, retry, cancel, or deploy Forge pipelines.

## Read-only MCP tools

Legacy v1.1 tools remain available for compatibility:
- `list_recent_builds(limit)` — latest legacy job builds; limit 1–30.
- `get_build_details(build_num)` — legacy build metadata and step/action statuses.
- `get_build_logs(build_num, step_index?, max_actions?)` — bounded legacy console output; at most 10 actions are fetched per call.

New API v3 tools are also exposed:
- `check_connection()` — verifies read-only API v3 access and resolves the fixed project slug to its UUID.
- `list_recent_runs(limit)` — latest project runs with UUIDs and current outcomes; limit 1–30.
- `get_run_details(run_id)` — one run plus its workflows and jobs, addressed by UUID.
- `get_job_details(job_id)` — details for one job addressed by UUID.
- `get_job_logs(job_id, step_num, execution?, stream?, max_chars?)` — bounded stdout/stderr for a job step.
- `get_job_test_results(job_id, max_chars?)` — structured test results as bounded JSON Lines.
- `list_job_artifacts(job_id)` — artifact path/size metadata; presigned URLs are not exposed.
- `get_job_artifact(job_id, artifact_path, max_chars?)` — fetch one artifact by exact listed path through an internal HTTPS host allowlist; bounded text output.
- `diagnose_run(run_id)` — one-call diagnostic: finds failed jobs, failed steps, structured test results, and small JUnit artifacts automatically (maximum three failed jobs per run).

The v3 tools use the fixed project slug `gh/Znect-god/znect-forge`, resolve its UUID through CircleCI, and do not attempt to translate legacy build numbers into v3 UUIDs. Workflow and job collection endpoints follow opaque pagination cursors with a hard ceiling of 200 resources per collection; repeated cursors and collections exceeding that ceiling fail explicitly rather than silently returning partial data. Nested run inspection applies tighter page budgets: `get_run_details` inspects at most 10 workflows and 40 jobs per workflow; `diagnose_run` inspects at most five workflows, 40 jobs per workflow, three failed jobs per run, logs for three failed actions total, and one small JUnit/test-report artifact per failed job. These tighter limits keep the worst-case diagnostic path below Cloudflare Workers Free's 50-subrequest per-invocation ceiling, including up to three artifact redirects. Its `diagnostics_summary` reports total versus inspected workflows, failed-job and log-action limits, and an `incomplete` flag so a bounded report cannot be mistaken for exhaustive diagnostics. All tools are read-only; no build mutation tools exist.

CircleCI transport failures are normalized into safe timeout/network messages. HTTP 429 responses include a parsed `Retry-After` interval when CircleCI supplies a valid numeric or HTTP-date header; the Bridge does not retry automatically or increase upstream load.

## User guide

See [USAGE_GUIDE.md](documentation/USAGE_GUIDE.md) for step-by-step setup, ChatGPT connection requirements, Cloudflare secrets, MCP tool usage, diagnostics, troubleshooting, and safety rules.

## Free browser dashboard

Open the Worker root URL in any modern browser, including Android. Enter the dedicated `WEB_ACCESS_TOKEN` to view recent runs and workflow/job details without ChatGPT or an MCP client. The browser token is kept in tab memory only; it is not written to localStorage, cookies, or the URL. `CIRCLECI_TOKEN` remains a server-side Worker Secret.

Read-only JSON endpoints (all require `Authorization: Bearer <WEB_ACCESS_TOKEN>`):
- `GET /api/v1/status` — verify CircleCI project access.
- `GET /api/v1/runs?limit=10` — list 1–30 recent runs.
- `GET /api/v1/runs/{run_uuid}` — inspect run workflows and jobs.

The API rejects non-GET methods, validates UUIDs and limits, applies the Worker rate limiter, redacts known secrets, and enforces response-size ceilings. Run details inspect at most 10 workflows and 40 jobs per workflow, matching the MCP run-details limits and staying within the Worker subrequest budget. This initial browser release does not expose pipeline mutation actions.

See [the free access plan](documentation/FREE_ACCESS_PLAN.md) and [the usage guide](documentation/USAGE_GUIDE.md).

## Source layout

- `src/index.ts` — Worker entry point, authentication, read-only JSON API, and MCP tools.
- `src/ui.ts` — standalone browser dashboard.
- `src/circleci.ts` — legacy v1.1 fixed-origin, read-only HTTP adapter.
- `src/circleci-v3.ts` — CircleCI Cloud API v3 read-only adapter used by the v3 MCP tools, including structured test results and safe artifact retrieval.
- `src/security.ts` — authentication comparison, artifact URL validation, bounded streams, redaction, output limits, and safe redirect handling.
- `test/security.test.ts` — security helper and artifact-host/redirect tests.
- `test/circleci.test.ts` — mocked v1.1 adapter tests.
- `test/circleci-v3.test.ts` — mocked v3 authentication, project resolution, pagination, resource traversal, and bounded job-output tests.
- `test/worker.test.ts` — Worker HTTP, authentication, and rate-limit boundary tests.
- `scripts/preview-smoke-test.mjs` — opt-in, Preview-only read-only smoke test for health, browser auth, MCP discovery, tool annotations, and CircleCI access.
- `package.json` and `package-lock.json` — pinned direct and resolved dependency versions.
- `wrangler.toml` — Worker configuration and rate-limit binding.
- Root `.github/workflows/znect-ci-bridge.yml` — Linux validation workflow.

## Security controls

- `CIRCLECI_TOKEN`, `MCP_ACCESS_TOKEN`, and `WEB_ACCESS_TOKEN` are expected as Cloudflare Worker Secrets. The browser and MCP use separate access tokens.
- CircleCI API requests are GET-only, use fixed origins, 15-second timeouts, and bounded response bodies.
- MCP requests require `MCP_ACCESS_TOKEN`; browser API requests require the separate `WEB_ACCESS_TOKEN`. Comparison uses fixed-length SHA-256 digests.
- MCP and browser API requests are rate-limited to 60 authenticated requests per 60 seconds per Cloudflare location. Each endpoint uses a SHA-256 digest of its own access token as the rate-limit key, never the raw token.
- If the rate-limit binding is absent or unavailable, both the MCP endpoint and browser JSON API fail closed with HTTP 503.
- Cloudflare's built-in rate limiter is approximate and local to each Cloudflare location; it is not a strict global quota. Authenticated requests are keyed by a SHA-256 digest of the relevant access token; failed authentication attempts are separately keyed by a SHA-256 digest of Cloudflare's client-IP header, so repeated token guesses from one address are rate-limited without storing the raw address as the limiter key.
- Artifact URLs and every redirect target must use HTTPS, a CircleCI artifact subdomain or S3-style AWS endpoint, and the default HTTPS port. Redirect chains are limited to three hops.
- Log response bodies are streamed with a byte ceiling, then limited to 80,000 characters per action and 160,000 across the complete response. Legacy log retrieval is capped at 10 output actions per call to keep worst-case artifact redirect requests below the Worker subrequest ceiling.
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
2. Configure `CIRCLECI_TOKEN`, `MCP_ACCESS_TOKEN`, and `WEB_ACCESS_TOKEN` as Worker Secrets. Never commit them.
3. Deploy only after reviewing remaining limitations and explicitly authorizing deployment.

GitHub Actions passed on source commit `5db3d90524680836bf9ed39a610d408cef0b3ba5` on 2026-11-12 (run [#258](https://github.com/Znect-god/znect-all-plugins/actions/runs/43211114233)): dependency installation, npm audit, TypeScript typecheck, unit tests, and Wrangler Worker dry-run. This confirms source validation, not a Cloudflare deployment. The latest explicitly confirmed Cloudflare Preview deployment is commit `51ea70791fa1f2862095653dd4ffd6a4664f5d3e` (2026-11-12 11:14 UTC), with alias URL `https://feature-ci-bridge-test-reports-znect-ci-bridge.znect699.workers.dev` and immutable deployment URL `https://0cf637e9-znect-ci-bridge.znect699.workers.dev`. The current branch head is newer and has no independently confirmed Preview deployment yet. No production deployment has been performed. No live CircleCI token or API request has been used, so CircleCI authentication, project resolution, and end-to-end MCP access remain unverified. The GitHub Actions Wrangler dry-run does not deploy.

## Known limitations

- In development; not production-ready.
- CircleCI Cloud hosting is established from the earlier Forge setup; live API v3 token access and project UUID resolution are not yet verified.
- The v3 adapter and MCP tools are tested with mocked HTTP responses. Live project resolution, run retrieval, failed-step log retrieval, test-result access, and artifact access still require verification against CircleCI using the configured token. `get_run_details` inspects at most 10 workflows and 40 jobs per workflow; `diagnose_run` inspects at most five workflows, three failed jobs, three failed-action log bundles, and one report artifact per failed job to control Worker subrequests and response size.
- CircleCI API v3 test-result and artifact endpoints may return no data when test metadata or artifacts were not uploaded by the job. Artifact retrieval is restricted to exact paths returned by CircleCI and allowlisted HTTPS hosts.
- Legacy v1.1 tools remain alongside the v3 tools. There is intentionally no automatic build-number-to-UUID mapping or silent fallback.
- Rate limiting is approximate and per Cloudflare location, not a strict global limit.
- Failed Bearer-token attempts use a separate per-client-IP digest bucket; this is approximate and location-local, and does not replace a dedicated edge WAF rule.
- Log redaction is best-effort.
- No persistent storage, scheduled polling, alerts, or push notifications yet.
- Wrangler/workerd is unsupported in the current Android ARM64 Termux environment.
- License remains undecided; public visibility does not grant reuse or redistribution rights.

## Relationship to Znect Forge

This plugin only reads CircleCI build information. It does not change Forge source code or CircleCI configuration and does not start or alter Forge builds. The Forge 0.8.0 freeze remains in force unless explicitly changed by the user.

