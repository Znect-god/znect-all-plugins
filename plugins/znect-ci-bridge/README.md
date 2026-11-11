# Znect CI Bridge

<badge>prototype</badge> **Version:** 0.1.0

Znect CI Bridge is an experimental bridge intended to expose read-only CircleCI build information through an MCP-compatible interface hosted on Cloudflare Workers.

**This repository entry currently documents the prototype. It does not yet contain the complete source project.** The initial project archive was prepared and type-checked locally in an Android/Termux environment, but deployment, end-to-end MCP behavior, CircleCI connectivity, and a full security review have not been verified.

## Intended architecture

```text
MCP-compatible client
        |
        v
Cloudflare Worker — Znect CI Bridge
        |
        v
CircleCI API
        |
        v
Build metadata, details, and logs
```

GitHub is intended to hold source code and support cloud-based checks/deployment. CircleCI remains the build/test system for the separate Znect Forge project; this plugin must not change or trigger Forge pipelines without explicit authorization.

## Intended tools

The prototype is designed around three read-only MCP tools:

- `list_recent_builds(limit)` — list recent builds, with a bounded limit.
- `get_build_details(build_num)` — retrieve details for one build.
- `get_build_logs(build_num, step_index?, max_actions?)` — retrieve bounded logs for a build step.

The initial prototype targets the CircleCI project `/project/github/Znect-god/znect-forge`. Its current adapter uses CircleCI API v1.1 because the available token was intended for read-only access; that API is deprecated and should be replaceable with a maintained adapter.

## Current verified state

- The initial archive was unpacked in Termux on Android.
- Dependency versions in the local package manifest were adjusted to resolve a peer-dependency mismatch and an unavailable package version.
- `npm install` completed after those adjustments.
- `npm run typecheck` completed successfully.
- Wrangler/workerd could not run in the Android ARM64 Termux environment because the workerd binary reports an unsupported platform.

These checks do **not** establish that the Worker builds, deploys, connects to CircleCI, or serves working MCP requests.

## Known limitations and risks

- Status remains `prototype`; not production-ready.
- Cloudflare deployment has not been verified.
- MCP protocol behavior and all three tools have not been end-to-end tested.
- CircleCI connectivity and log retrieval have not been verified.
- CircleCI API v1.1 is deprecated; adapter migration is needed.
- A full security audit and Worker-side rate limiting have not been completed.
- CI logs and artifacts may contain sensitive information if upstream jobs print secrets.
- Real credentials must be stored as Cloudflare Worker Secrets, never in source control.
- Do not use with sensitive production logs or privileged credentials until security review and testing are complete.
- The Android Termux environment cannot run the current Wrangler/workerd binary; use a supported Linux CI environment for build and deployment work.

## Configuration names

The prototype expects secret values to be configured outside the repository:
- `CIRCLECI_TOKEN`
- `MCP_ACCESS_TOKEN`

Only the names are documented here. Never commit or share their values.

## Next development milestones

1. Review dependency tree and resolve security advisories without unsafe force upgrades.
2. Restore the complete source project into this plugin directory and review it.
3. Run reproducible typecheck/build checks in supported Linux CI.
4. Test Worker health endpoint and authenticated MCP endpoint.
5. Verify each read-only tool against a safe CircleCI test context.
6. Review authentication, authorization, rate limiting, input validation, redirects, output limits, and log redaction.
7. Deploy to a non-production Cloudflare environment and record test evidence.
8. Complete documentation and only then consider promotion to `testing`.

## License

Undecided. Do not assume reuse or redistribution permissions until licensing is explicitly selected.
