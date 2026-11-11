# Znect All Plugins

**The shared plugin library for the Znect ecosystem.**

This repository is the central home for Znect plugins, integrations, developer tools, experiments, and reusable components. It intentionally keeps projects at different maturity levels in one place, while clearly identifying their status and limitations.

> **Repository policy:** experimental work may be stored here, but it must never be presented as stable or production-ready until it has passed the documented review and testing process.

## Repository map

```text
plugins/                 Individual plugin projects
  znect-ci-bridge/       Cloudflare Worker / MCP bridge for CircleCI (prototype)
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
| `deprecated` | Retained for reference but no longer recommended; migration guidance should be provided |

A status describes maturity, not a guarantee of security. Each plugin must document its own risks and supported environments.

## Plugin directory

| Plugin | Status | Current version | Purpose |
|---|---|---:|---|
| [Znect CI Bridge](plugins/znect-ci-bridge/) | `prototype` | `0.1.0` | Read-only MCP bridge to CircleCI build information |

## Required information for every plugin

Each plugin folder should contain:
- `README.md` — purpose, setup, usage, support, limitations, and testing evidence.
- `plugin.json` — machine-readable metadata and maturity status.
- `CHANGELOG.md` — version history and notable changes.
- Source code and tests, when available.
- A license or an explicit note that licensing has not yet been decided.

See [Plugin documentation](documentation/README.md), [the plugin standard](documentation/PLUGIN_STANDARD.md), and [the lifecycle guide](documentation/PLUGIN_LIFECYCLE.md).

## Security and secrets

Never commit API tokens, passwords, private keys, personal data, production credentials, or unredacted logs. Use the secret-management facility of the deployment platform. See [Security policy](documentation/SECURITY.md).

## Contributing

Changes should be focused, documented, and reviewable. Do not silently promote a plugin's status. Stable status requires evidence; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Licensing

No repository-wide open-source license has been selected yet. Until a license is added, do not assume that the code may be reused, redistributed, or sublicensed merely because this repository is public. Each plugin's licensing terms must be made explicit before public release.
