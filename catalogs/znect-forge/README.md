# Znect Forge Module Catalog

**Status:** catalog foundation / no published modules  
**Branch:** `catalog/znect-forge`  
**Repository:** `Znect-god/znect-all-plugins`

This directory is the dedicated remote catalog source for Znect Forge. It is separate from CI Bridge, CircleCI workflows, and other build/bridge tooling.

## Files

- `catalog.template.json` — unsigned schema-v2 template for preparing a release; it is not a live catalog and must never be fetched as trusted data.
- `catalog.schema.json` — schema matching the current Forge schema-v2 parser and manifest contract.
- `SECURITY.md` — signature and trust requirements for publication.

A production release will publish a signed `catalog.json` in this directory. Forge must fetch that exact file from this branch over HTTPS and verify it before using any module entry.

## Current state

No module packages have been published in this catalog. The template has an empty module list and placeholder timestamps/signature; it is deliberately not installable or valid as a signed release.

An empty, successfully verified catalog means no modules are currently published. It is different from a missing catalog, failed network request, invalid signature, or unconfigured trust anchor.

## Forge behavior

When internet connectivity is available, Forge will offer the explicit action **“Проверить необходимые модули и обновление их”**. On activation, it refreshes this catalog, verifies the signature/schema, compares entries with locally reconciled package state, and presents the appropriate per-module action: Install, Update, or Remove. The user must confirm each state-changing operation.

Do not publish installable entries until package URLs, versions, hashes, publisher certificate fingerprints, compatibility, permissions, dependencies, and lifecycle behavior have been reviewed and verified.
