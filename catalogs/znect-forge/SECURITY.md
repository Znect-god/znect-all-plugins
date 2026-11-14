# Znect Forge Catalog Security

## Trust model

The Forge client must not trust a public key, certificate, fingerprint, or signature-verification setting delivered by the catalog itself.

Before the catalog is enabled for installation actions, the Forge application must contain an independently provisioned/pinned RSA public key (or a separately reviewed key-rotation mechanism). The matching private signing key must be held outside this repository in an appropriate secret-management system and must never be committed or shared in chat.

## Publication requirements

A release of the catalog must be authenticated over the exact manifest bytes using a documented RSA signature scheme and SHA-256. The client must verify the signature against its independently pinned key before parsing module entries as trusted instructions or offering package actions. The exact signature envelope, canonicalization/byte encoding, key identifier, and rotation procedure must be implemented and tested consistently by publisher and client before the first signed catalog release.

## Client requirements

- Use HTTPS and a fixed allowlist of approved GitHub hosts/endpoints.
- Reject redirects to hosts outside the allowlist.
- Bound response size and apply network timeouts.
- Verify signature before trusting manifest data.
- Validate the manifest against the checked-in schema.
- Verify each downloaded package against its declared SHA-256 before installation.
- Never execute catalog-provided shell commands or arbitrary install scripts without an explicit, separately reviewed module installation contract.
- Require explicit user confirmation for Install, Update, and Remove.
- Treat unknown module status or failed verification as an error, never as success.

## Current limitation

The initial catalog is an empty structural foundation. No signing key has been provisioned, no signed release has been published, and no module package is currently offered for installation.
