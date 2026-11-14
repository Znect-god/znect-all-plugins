# Znect CI Bridge — free assistant access channel

**Status:** implementation in progress; not yet active.  
**Goal:** let ChatGPT request and read a private CI report on demand through the already connected GitHub integration, without requiring a custom MCP connection.

## Intended request flow

1. The user asks ChatGPT to check Znect Forge.
2. ChatGPT posts the exact command `/znect-ci-bridge check` to the private inbox issue [#8](https://github.com/Znect-god/znect-forge/issues/8).
3. A GitHub Actions `issue_comment` workflow in the private `Znect-god/znect-forge` repository calls the existing Cloudflare Worker Preview using the Bridge browser API token.
4. The workflow collects connection status, recent CircleCI runs, workflow/job metadata, signed webhook events, and bounded failed-step diagnostics.
5. It uploads the full JSON report as a private GitHub Actions artifact with a one-day retention period. The issue comment contains only a run link and a short status.
6. ChatGPT reads the private workflow run and downloads the artifact through the GitHub integration, then analyzes the report and continues the project work.

## Implemented pieces

- The Bridge already provides authenticated read-only project status, recent runs, run metadata, and event inbox endpoints.
- Added `GET /api/v1/diagnostics/{run_uuid}` to expose bounded failed-step stdout/stderr, structured test results, and one small JUnit/test-results XML artifact per failed job. It uses the same fixed CircleCI project, GET-only API adapter, secret redaction, and inspection limits as the MCP diagnostic tool.
- Added a regression test covering a failed run, log retrieval, structured test results, and redaction of the configured browser token.
- Added the private Forge inbox issue #8.
- Added a Draft PR #9 with an on-demand workflow that gathers reports and stores them only as private artifacts.

## One-time setup and activation

1. Review and merge Draft PR #9 into the Forge default branch when explicitly approved. GitHub only runs `issue_comment` workflows when the workflow file exists on the default branch.
2. Add the existing Cloudflare Preview browser API token to the private Forge repository as Actions secret `ZNECT_CI_BRIDGE_WEB_TOKEN`. Never put its value in an issue, commit, or ChatGPT message.
3. Ensure the Preview Worker is still available and its `WEB_ACCESS_TOKEN` matches the secret.
4. In the private issue #8, ChatGPT can post the exact command `/znect-ci-bridge check`.
5. After the run completes, ChatGPT retrieves the artifact using the GitHub Actions artifact API and reads the report. Artifact retention is one day.

## Security and cost boundaries

- The report artifact stays in the private Forge repository. Do not copy raw CI logs into the public `znect-all-plugins` repository or public comments.
- Issue #8 accepts only the repository owner's exact command. The workflow is read-only against CircleCI and Bridge.
- No CircleCI build is triggered, retried, cancelled, or modified.
- The request workflow uses GitHub Actions minutes, not CircleCI build minutes. GitHub Actions usage is still subject to the account's included quota and limits.
- The Preview endpoint is temporary/test-only. Do not switch this workflow to Production without a separate explicit deployment decision.
- ChatGPT cannot receive the report until the workflow is merged to the default branch, the secret is configured, and the GitHub integration can read the private workflow artifact.

## Remaining verification

- Typecheck and unit-test the new diagnostics API.
- Deploy the updated Bridge to its isolated Preview and verify `GET /api/v1/diagnostics/{run_uuid}` against a representative real run.
- Validate the Forge workflow YAML and its private artifact round-trip after PR #9 is approved and activated.
- Confirm the GitHub integration can download and parse the report artifact.
- Only then mark the free assistant channel as operational.

## Known limitations

The first on-demand workflow report currently contains run summaries, workflow/job metadata, event inbox data, and diagnostics. It does not trigger builds or alter repository state. The current implementation is Preview-only and cannot be called directly by ChatGPT; the private GitHub artifact is the intended bridge between the Worker and ChatGPT's existing GitHub integration.
