# Znect CI Bridge — free ChatGPT access channel

**Status:** workflow and collector merged to Forge `main`; live report round-trip still pending.  
**Primary provider:** CircleCI, read-only.  
**Transport:** private GitHub issue command + GitHub Actions + authenticated CI Bridge Browser JSON API + private GitHub Actions artifact.  
**MCP:** not used, not required, and not the ChatGPT communication channel.

## Request flow

1. ChatGPT/user requests a CircleCI status report.
2. The owner posts the exact command `/znect-ci-bridge check` to private Forge issue [#8](https://github.com/Znect-god/znect-forge/issues/8).
3. The merged Forge workflow `.github/workflows/znect-ci-bridge-request.yml` validates the request origin and the configured `ZNECT_CI_BRIDGE_WEB_TOKEN` secret.
4. The workflow reads CircleCI data through the CI Bridge Browser JSON API. It does not call an MCP endpoint.
5. The workflow collects project status, recent runs, bounded failed-run diagnostics, webhook events, and the companion GitHub Actions repository report.
6. The complete JSON report and selected diagnostics are uploaded as a private GitHub Actions artifact with one-day retention. The issue comment contains only a short status and run link.
7. ChatGPT retrieves the artifact through the already connected GitHub integration and analyzes it.

## Confirmed repository state

- Private inbox issue #8 exists.
- PR #9, **Add private on-demand Znect CI Bridge report channel**, is merged into Forge `main`.
- Merge commit: `fb226fb25e414f4ce0f53d1b7a8f280b00b2c60a`.
- Workflow: `.github/workflows/znect-ci-bridge-request.yml`.
- Collector: `scripts/znect-ci-bridge-collect-github-report.sh`.
- The workflow calls `/api/v1/status`, `/api/v1/runs`, `/api/v1/events`, and `/api/v1/diagnostics/{run_uuid}` on the Bridge Preview.
- The workflow is configured for a private artifact with one-day retention.
- Merge proves the code is on the default branch; it does not prove that a live report has run or that the artifact can be retrieved by ChatGPT.

## Cost and safety boundaries

- Free-tier-first: use only included GitHub Actions quota and Cloudflare Worker free-tier limits; no paid add-ons, auto-refill, or paid MCP service.
- CircleCI is queried read-only. The report flow does not trigger, retry, cancel, or modify CircleCI pipelines.
- Read-only CircleCI API calls do not consume CircleCI build minutes.
- GitHub Actions minutes and Cloudflare usage are still subject to their included quotas and platform limits; do not describe them as unlimited.
- Reports remain in the private Forge repository. Do not publish raw logs or diagnostics in the public plugin repository or public comments.
- The current workflow targets the named isolated Preview, not Production.
- The workflow must remain owner-command-only and narrowly scoped to issue #8.

## Remaining verification

- Confirm the `ZNECT_CI_BRIDGE_WEB_TOKEN` secret by presence/behavior only; never read or reveal its value.
- Run one fresh owner-requested report and inspect the workflow result.
- Confirm a private artifact is uploaded with the expected contents and one-day retention.
- Retrieve and parse the artifact through the existing GitHub integration in ChatGPT.
- Repeat once to prove freshness and correct latest-run selection.
- Verify logs and report data remain bounded and redacted.
- Confirm all usage remains within included/free-tier quotas.

## Explicit exclusions

- No MCP endpoint or custom MCP server is part of this channel.
- No CircleCI build, retry, cancellation, or configuration change.
- No Production deployment.
- No report data in public comments or repositories.


## Central Build result visibility (source implementation; live verification pending)

For the CI Bridge's own validation target, ChatGPT can use the authenticated Browser JSON API without MCP:

- `/api/v1/build/status?project_id=znect-ci-bridge&connection_id=znect-build-main`
- `/api/v1/build/runs?project_id=znect-ci-bridge&connection_id=znect-build-main&limit=10`
- `/api/v1/build/runs/{run_id}?project_id=znect-ci-bridge&connection_id=znect-build-main`

The read-only adapter verifies the central workflow and the request artifact fingerprint before exposing a run. Run details include the exact project source SHA, job/step outcomes, and metadata for the private validation manifest artifact. Artifact contents and ZIP job logs are not yet returned by the Browser API. Runtime registry and credential configuration are documented in `ZNECT_BUILD_CONNECTION.md`. The target remains disabled; live API access and artifact retrieval have not been verified.
