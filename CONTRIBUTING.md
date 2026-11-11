# Contributing to Znect All Plugins

Thank you for helping improve the Znect plugin ecosystem.

## Before making changes
1. Read the repository [plugin standard](documentation/PLUGIN_STANDARD.md), [lifecycle guide](documentation/PLUGIN_LIFECYCLE.md), and [security policy](documentation/SECURITY.md).
2. Identify the plugin and its current maturity status.
3. Keep changes scoped to the relevant plugin unless a repository-wide standard is being changed.
4. Never include secrets, private logs, credentials, or personal data.

## Adding a plugin
1. Create a folder under `plugins/<plugin-id>/`.
2. Add `README.md`, `plugin.json`, and `CHANGELOG.md` using the template in `templates/plugin-template/`.
3. Start at `prototype` unless there is documented evidence for a more mature status.
4. List supported platforms, dependencies, permissions, setup steps, known limitations, and test evidence.
5. Do not claim that deployment, integration, or security testing succeeded unless it actually did.

## Updating a plugin
- Update the changelog for user-visible changes.
- Update the version according to the versioning guidance.
- Keep the manifest and README consistent.
- Record breaking changes and migration steps.
- Do not upgrade status just because code compiles or type-checks.

## Review checklist
- [ ] Scope and purpose are clear.
- [ ] No secrets or sensitive data are present.
- [ ] Dependencies and versions are documented.
- [ ] Permissions and network access are documented.
- [ ] Tests and their actual results are recorded.
- [ ] Known limitations and unsupported environments are listed.
- [ ] Version, status, README, manifest, and changelog agree.

## Stable release requirement
A plugin may be marked `stable` only after its documented acceptance criteria have passed, its supported environments have been tested, security-sensitive behavior has been reviewed, and installation and rollback/recovery instructions are available.

## Licensing
Do not add third-party code or assets without checking their licenses. Repository visibility does not itself grant reuse rights. The repository maintainers must select and document an appropriate license before granting broad reuse permissions.
