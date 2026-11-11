# Plugin Standard

## 1. Folder layout

Every plugin should use this baseline:

```text
plugins/<plugin-id>/
  README.md
  plugin.json
  CHANGELOG.md
  src/                 (when source code exists)
  tests/               (when tests exist)
  docs/                (optional plugin-specific documentation)
```

Do not create empty placeholder source or test files merely to make the layout look complete. Explain what is not yet present.

## 2. Plugin ID and naming

- Use a stable, lowercase kebab-case ID, for example `znect-ci-bridge`.
- Keep the folder name, manifest `id`, and documentation references aligned.
- Avoid renaming an ID after external projects depend on it.

## 3. Required manifest

The `plugin.json` file must be valid JSON and include:
- `id`: stable plugin identifier.
- `name`: human-readable name.
- `version`: current version.
- `status`: one of the lifecycle statuses.
- `description`: concise purpose.
- `platforms`: supported or intended platforms; distinguish tested from untested.
- `permissions`: filesystem, network, account, or other access required.
- `dependencies`: direct runtime/build dependencies where known.
- `limitations`: known gaps and unsupported cases.
- `testing`: actual checks performed and their outcomes.

Use `null`, empty arrays, or explicit `unknown` values where information is not yet established. Never invent evidence.

## 4. README requirements

Every plugin README should explain:
1. What it does and does not do.
2. Current status and version.
3. Architecture and data flow.
4. Supported and tested environments.
5. Installation and configuration.
6. Required secrets/permissions (names only; never values).
7. Usage examples.
8. Tests performed, with dates or commit references when practical.
9. Known limitations, risks, and troubleshooting.
10. License and support/maintenance expectations.

For prototypes, make the experimental nature prominent near the top.

## 5. Dependencies

- Pin or constrain dependencies deliberately.
- Explain important compatibility constraints.
- Review security advisories before upgrades.
- Avoid force-upgrading dependencies without assessing breaking changes.
- Keep lockfiles when the package manager expects them.

## 6. Documentation quality

Documentation must distinguish:
- implemented behavior;
- locally verified behavior;
- CI-verified behavior;
- deployed and integration-tested behavior;
- planned behavior.

These are not interchangeable claims.
