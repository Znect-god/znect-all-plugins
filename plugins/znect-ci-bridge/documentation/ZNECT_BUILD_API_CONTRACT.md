# Superseded: Znect Build API contract proposal

> **Status:** superseded on 2026-11-18. This document is retained as an architectural history record only. Do not implement or depend on the proposed custom Znect Build API or the former GitHub Actions adapter described in earlier revisions.

## Current architecture

- Znect Build is the development and central recipe repository.
- CircleCI executes Znect Build checks and the opt-in exact-SHA CI Bridge validation workflow.
- CI Bridge uses its existing CircleCI API v3 read-only adapter to inspect the Znect Build CircleCI project like any other registered CircleCI project.
- The Bridge does not trigger, retry, cancel, approve or modify CircleCI pipelines.
- The Bridge no longer has a separate `znect-build` provider type, GitHub Actions adapter, `ZNECT_BUILD_GITHUB_TOKEN` requirement or `/api/v1/build/*` endpoints.

## Validation evidence

The CircleCI exact-SHA workflow stores `ci-bridge-validation-manifest.json` and `resolved-source-sha.txt` as CircleCI job artifacts. The manifest records:

- project ID, source repository, source ref and exact source SHA;
- Znect Build recipe repository, recipe SHA and recipe path;
- validation command list and recipe outcome;
- explicit `deployment_performed: false` and `circleci_pipeline_mutation: false`;
- CircleCI pipeline ID, workflow ID, job, build number and build URL.

The source SHA is the immutable project revision. CircleCI pipeline IDs, workflow IDs, job IDs and API v3 run UUIDs are distinct identifiers and must not be interchanged.

## Consumption

Register `Znect-god/znect-build` as an ordinary CircleCI project in the runtime `ZNECT_PROJECT_REGISTRY`, using the exact CircleCI slug and a stable project/connection ID. Inspect runs, workflows, jobs and the manifest artifact through the generic authenticated Browser JSON API and existing read-only CircleCI adapter.

A registry entry does not prove provider availability. Only a successful authenticated CircleCI read probe establishes connectivity.

## Historical note

Earlier versions of this proposal described a custom Browser API under `/api/v1/build/*` and a read-only GitHub Actions adapter. That implementation has been retired because the required execution and evidence source is CircleCI. Historical GitHub Actions run IDs, commit statuses and workflow artifacts are not valid evidence for the current CircleCI validation path.
