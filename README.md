# Znect All Plugins

**The shared plugin library for the Znect ecosystem.**

This repository is the central home for Znect plugins, integrations, developer tools, experiments, and reusable components. Experimental work must be clearly identified and must not be presented as stable before review and testing.

## Repository map

```text
plugins/                 Individual plugin projects
  znect-ci-bridge/       Free-first CircleCI diagnostics channel
documentation/           Repository-wide standards and guides
templates/               Starter files for new plugins
```

## Plugin maturity statuses

| Status | Meaning |
|---|---|
| `prototype` | Early proof of concept; incomplete and not production-ready |
| `in-development` | Actively being implemented; interfaces or behavior may change |
| `testing` | Feature-complete candidate undergoing documented tests |
| `stable` | Reviewed, tested, documented, and suitable for its declared use |
| `deprecated` | Retained for reference but no longer recommended |

A status describes maturity, not a guarantee of security.

## Plugin directory

| Plugin | Status | Current version | Purpose |
|---|---|---:|---|
| [Znect CI Bridge](plugins/znect-ci-bridge/) | `in-development` | `0.2.0` | Free signed-webhook diagnostics, dashboard, and manual ChatGPT Free export; no MCP dependency |

## Required information for every plugin

Each plugin folder should contain a README, machine-readable `plugin.json`, changelog, source/tests when available, and explicit licensing status.

See [Plugin documentation](documentation/README.md), [the plugin standard](documentation/PLUGIN_STANDARD.md), and [the lifecycle guide](documentation/PLUGIN_LIFECYCLE.md).

## Security and secrets

Never commit API tokens, passwords, private keys, personal data, production credentials, or unredacted logs. Use the secret-management facility of the deployment platform. See [Security policy](documentation/SECURITY.md).

## Contributing

Changes should be focused, documented, and reviewable. Do not silently promote a plugin's status. Stable status requires evidence; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Licensing

No repository-wide open-source license has been selected yet. Until a license is added, do not assume that the code may be reused, redistributed, or sublicensed merely because this repository is public. Each plugin's licensing terms must be explicit before public release.
