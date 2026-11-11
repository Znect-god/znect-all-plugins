# Plugin Lifecycle and Versioning

## Status definitions

### `prototype`
An early experiment or proof of concept. It may have incomplete features, unverified integrations, temporary workarounds, or known security gaps. Not for production use.

### `in-development`
Active implementation. Some behavior may work, but interfaces, architecture, and setup may still change.

### `testing`
A release candidate undergoing structured functional, compatibility, and security testing. The test plan and results must be documented.

### `stable`
The declared feature set has passed its acceptance criteria on the documented supported environments. Installation, configuration, security review, troubleshooting, and upgrade guidance are available. Stable does not mean risk-free.

### `deprecated`
No longer recommended or maintained. Explain why, identify a replacement if one exists, and document migration guidance where possible.

## Promotion rules

- `prototype` → `in-development`: core direction and scope are established; implementation work is active and tracked.
- `in-development` → `testing`: declared scope is implemented; repeatable tests and a test plan exist.
- `testing` → `stable`: required tests pass, supported environments are verified, security-sensitive behavior is reviewed, documentation is complete, and release artifacts are reproducible.
- Any status → `deprecated`: maintenance or safety decision, with an explanation.

A typecheck, successful package installation, or successful build alone is not sufficient for `stable`.

## Versioning

Use Semantic Versioning where practical: `MAJOR.MINOR.PATCH`.
- MAJOR: incompatible public interface or behavior changes.
- MINOR: backward-compatible functionality.
- PATCH: backward-compatible fixes and documentation corrections.

For very early prototypes, `0.x.y` indicates pre-1.0 development. A version number does not imply maturity.

## Required release record

For each release, record:
- version and date;
- lifecycle status;
- notable changes;
- compatibility and dependency changes;
- tests actually performed and their results;
- known issues and security notes;
- upgrade or rollback guidance where relevant.
