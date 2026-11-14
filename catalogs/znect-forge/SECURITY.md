# Znect Forge Catalog Security

## Trust model

The Forge client must not trust a public key, certificate, fingerprint, or signature-verification setting delivered by the catalog itself.

Before catalog requests are accepted, the Forge application must contain an independently provisioned/pinned RSA public key (minimum 2048 bits), together with the exact HTTPS endpoint and host allowlist. The matching private signing key must be held outside this repository in an appropriate secret-management system and must never be committed or shared in chat.

## Signature contract

The current Forge implementation verifies a detached RSA/SHA-256 signature over its deterministic canonical catalog bytes. The signed envelope is schema version 2. Publisher tooling must use the exact canonical encoding implemented by `ForgeModulePolicy.canonicalCatalogBytes` and `ForgeModuleCatalogCodec`; do not sign arbitrary JSON text or invent a different canonicalization. Signature bytes are Base64-encoded in `signatureBase64`.

A signed `catalog.json` must have a valid issue/expiry interval. Expired catalogs and catalogs issued more than five minutes in the future are rejected.

## Publication and client requirements

- Serve the signed catalog over HTTPS from the exact configured endpoint on port 443.
- Allow only exact configured host names; reject redirects and hosts outside the allowlist.
- Verify the catalog signature against the independently pinned RSA root key before trusting module entries.
- Validate the manifest using the matching schema and strict Forge parser.
- Verify each downloaded package against signed size and SHA-256, and verify Android package identity and signing-certificate fingerprint.
- Never execute catalog-provided shell commands or arbitrary install scripts.
- Require explicit user confirmation for Install, Update, and Remove.
- Treat unknown state or failed verification as an error, never as success.

## Current limitation

The branch currently contains only an unsigned template and schema. No signing key has been provisioned, no signed `catalog.json` has been published, no modules are available, and the Forge app has not yet been connected to this branch. The template is not a production catalog.
