# Znect Forge Module Catalog

**Status:** prototype / catalog foundation  
**Branch:** `catalog/znect-forge`

This directory is the dedicated module catalog source for Znect Forge. It is intentionally separate from CI Bridge and other repository tooling.

## Files

- `catalog.json` — machine-readable catalog manifest.
- `catalog.schema.json` — JSON Schema for validating the manifest.
- `SECURITY.md` — signature and trust requirements for catalog publication.

## Current state

The catalog currently contains no published modules. An empty list means only that no module entries have been published here; it does not imply that a Forge installation has no installed modules.

The catalog must be cryptographically authenticated before Forge accepts it. Forge must pin a public verification key independently of catalog content. The corresponding private signing key must never be committed to this repository.

## Planned client behavior

Forge checks connectivity, fetches this catalog, verifies its signature and schema, then compares the declared modules and versions with the local installation. It presents explicit per-module actions such as Install, Update, or Remove. No package is installed, updated, or removed without user confirmation.

Do not publish installable module entries until their package locations, versions, hashes, compatibility, permissions, dependencies, and lifecycle behavior have been reviewed and verified.
