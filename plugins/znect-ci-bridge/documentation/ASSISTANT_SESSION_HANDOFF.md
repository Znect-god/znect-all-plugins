# Znect CI Bridge — persistent assistant handoff

**Purpose:** this file is the durable working context for the assistant across conversations. Read it before asking the user for information, repeating setup steps, proposing changes, or touching CI/deployment. Update this file when verified state changes.

**Last updated:** 2026-11-19  
**Repository:** `Znect-god/znect-all-plugins`  
**Branch:** `ci-bridge`

## 1. Mandatory working rules

1. Continue from the latest recorded state. Do not make the user repeat facts already recorded here or in the linked project docs.
2. Use the connected GitHub integration to inspect and modify repository files directly whenever possible. Do not ask the user to copy terminal commands or logs that can be read through the connected integration.
3. Ask the user for an action only when it is genuinely impossible to proceed with available tools. State the exact missing evidence and request one concrete item, not a generic screenshot or a repeated setup exercise.
4. Never ask for API tokens, secret values, passwords, private keys, or UUIDs already supplied. Never put credentials in source, logs, URLs, commits, reports, or ChatGPT messages.
5. Do not claim a check, deployment, configuration, or connection is verified unless an actual tool result or supplied artifact proves it. Clearly distinguish **source validation**, **runtime verification**, and **deployed version**.
6. Do not create GitHub Actions for this project. Do not reactivate retired workflows.
7. Do not trigger, retry, cancel, approve, or mutate CircleCI pipelines/settings. The CircleCI integration is read-only in this workflow.
8. Do not deploy Cloudflare Preview or Production, change Worker settings, bindings, secrets, routes, or webhooks without separate explicit authorization.
9. Do not restart the investigation from the beginning. Inspect the current branch heads and this handoff first, then perform only the next uncompleted verification step.
10. Keep user communication concise and action-oriented. If no user action is required, say so and continue with available repository checks.

## 2. Repository and CI architecture

- Source repository: `Znect-god/znect-all-plugins`, source branch `ci-bridge`.
- Central validation/build repository: `Znect-god/znect-build`, branch `feat/ci-bridge-node-worker-recipe`.
- CI executor: **CircleCI**, via the central `Znect Build` recipe.
- GitHub stores source and version history; it is not the CI executor.
- A push to the source branch alone does not trigger the central recipe workflow. The verified automatic trigger is tied to pushes to the central recipe branch.
- Source fixes belong in `ci-bridge`. Change the central recipe only when evidence proves the defect is in that recipe.
- Never substitute GitHub Actions for CircleCI.
- Relevant project docs:
  - `ASSISTANT_CHANNEL.md`
  - `RUNTIME_READINESS.md`
  - `SECURITY_REVIEW.md`
  - `PROJECT_REGISTRY.md`
  - `ZNECT_BUILD_CONNECTION.md`
  - `ZNECT_BUILD_API_CONTRACT.md`

## 3. Latest known repository state (verify before relying on it)

### Source repository

At the last recorded check, `Znect-god/znect-all-plugins` branch `ci-bridge` HEAD was:

- Commit: `ffcc852eae6198b5a60918be38662c8f6ec3cc2e`
- Message: `revert: remove unintended GitHub Actions Cloudflare diagnostic workflow`
- Parent: `f25ba3e2a2ae943e466ef90bc3910cfc7673977b`
- This is a revert commit. Its source tree was compared with the previously validated source commit `c29829f8786e5dbc999b74d5b987e5bb67ad044d`; the comparison reported no changed files (`files: []`). Do not describe the branch HEAD as the old SHA: HEAD is the revert commit, while its tree matches the old source tree.
- The accidental workflow `.github/workflows/znect-ci-bridge-cloudflare-readonly.yml` was removed from this branch. Do not recreate it.

### Central build repository

Last known successful central recipe state:

- Repository: `Znect-god/znect-build`
- Branch: `feat/ci-bridge-node-worker-recipe`
- Recipe HEAD: `c01e10e45a09f7b9cac7373250ad1270bae78e54`
- CircleCI context: `ci/circleci: validate-ci-bridge-source`
- Status: `success`
- Job: `validate-ci-bridge-source`
- Job URL: https://app.circleci.com/workflow/c7357ecf-7314-4aa0-9b97-2d971d776bb5/job/c8b80071-9d8f-4961-900e-f6b94434591c
- Source repository/branch tested: `Znect-god/znect-all-plugins` / `ci-bridge`
- Source SHA tested: `c29829f8786e5dbc999b74d5b987e5bb67ad044d`
- Checks reported: npm install succeeded (247 packages added, 248 audited); 0 audit vulnerabilities; TypeScript typecheck passed; Vitest 19 files / 290 tests passed; `node --check scripts/preview-smoke-test.mjs` passed; Wrangler deploy dry-run passed.
- Manifest reported recipe exit 0, outcome success, `deployment_performed=false`, and `circleci pipeline mutation=false`.
- This proves the central source-validation recipe path for that source SHA only. It does **not** prove current runtime secrets, registry, live CircleCI connectivity, or deployment.

Because this handoff file itself is a new source commit, re-check the source branch HEAD after creating it. Do not claim the new HEAD has passed CircleCI unless a new actual CircleCI result proves that.

## 4. Cloudflare Worker and Production evidence

- Worker name: `znect-ci-bridge`
- Worker URL: https://znect-ci-bridge.znect699.workers.dev
- User has already confirmed Cloudflare is connected and that read-permission API credentials exist in GitHub Secrets. Do not ask the user to reconnect Cloudflare, create tokens, or resend credentials.
- Known secret names mentioned by the user: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Their values must never be requested or exposed.
- User-supplied historical Cloudflare deployment UUID: `5bee14ec-697a-4656-8f2f-e2d9bea97148`. This is a deployment identifier, not a Git commit SHA.
- The user reported the latest deployment shown in Cloudflare Dashboard was approximately seven days old at the time of the report.

### Actual Production build log already inspected

A Production build log was uploaded to `Znect-god/znect-forge` in folder `журналы`, read, analyzed, and then deleted at the user's explicit request. Preserve these findings; do not ask for the log again.

- Log timestamp: `2026-11-12T07:45:12Z` onward.
- Environment: Node.js 24.22.1, npm 10.9.2.
- `npm clean-install`: 159 packages.
- User build command ran `npm ci`: 159 packages.
- Actual command: `npx wrangler deploy` (not a dry run).
- Wrangler: 4.160.0.
- Upload: 1258.13 KiB / gzip 219.00 KiB.
- Worker startup time: 46 ms.
- Binding shown in log: `MCP_RATE_LIMITER` (60 requests / 60 seconds).
- Worker uploaded in 3.05 sec; triggers deployed in 0.47 sec.
- URL: https://znect-ci-bridge.znect699.workers.dev
- Version ID: `920f2af4-18b4-4c1e-957e-d87f6e7e174b`
- Build ended with `Success: Deploy command completed` and `Success! Build completed.`
- This Version ID matches the version the user later supplied from Cloudflare deployment history.
- The log contained no source commit SHA, so it does not identify which Git commit was deployed.
- The Wrangler binding summary does not prove that secrets are absent: secret values are not normally listed in this build output.
- This was an actual Production deployment, not a dry run.

### Log deletion

The user explicitly requested that the analyzed log be deleted after retaining the useful findings.

- Deleted only `журналы/znect-ci-bridge.production.1cb3d134-aae2-4733-8988-aaef3389116d.build.log.txt` from `Znect-god/znect-forge`, branch `main`.
- Deletion commit: `996d9b5bcb91ac9da4116cb3f45fc9395393378c`.
- Folder and `README.md` were retained.
- This removed the file from the current branch tree; do not claim its bytes were purged from all Git history.

### Runtime mismatch clue

The user previously supplied this `/health` response:

```json
{"service":"znect-ci-bridge","status":"ok","project":"Znect-god/znect-forge","mode":"read-only"}
```

The source handler recorded in the current project uses `project_count`, not `project`. This suggests the responding Worker may be an older or different deployed build, but the cause is not proven. Do not state a definitive cause without matching deployment/source evidence.

Current source health handler shape:

```ts
return json({
  service: "znect-ci-bridge",
  status: "ok",
  project_count: projectCount,
  mode: "read-only"
});
```

## 5. Cloudflare access limitation — do not misstate it

- Cloudflare is connected on the user's side; that is established by the user's statement and existing configured credentials.
- In the assistant's available tools for this project, no direct Cloudflare Worker environment/secret inspection or deployment action is available.
- This means **the assistant cannot inspect Cloudflare settings directly in this session**. It does not mean Cloudflare is disconnected or unconfigured.
- GitHub repository access does not expose Cloudflare Dashboard build settings or Worker secret values.
- Do not promise to inspect Cloudflare settings through a nonexistent tool.
- Exhaust read-only GitHub repository evidence first: inspect repo files, deployment configuration, workflows, scripts, package/build manifests, deployment history references and commit provenance.
- If those sources cannot establish the configured Cloudflare build source, state exactly which one piece of Cloudflare Dashboard evidence is still required. Do not repeatedly ask for broad screenshots.
- Do not ask the user to send secrets. If configuration evidence is needed, request only non-secret fields such as repository, branch, root directory, build command, deploy command, environment name and deployment version/commit.

## 6. Runtime verification requirements

Read `RUNTIME_READINESS.md` before runtime work. Important facts:

- Worker reads `ZNECT_PROJECT_REGISTRY`. If the optional binding is absent, source intentionally falls back to an empty registry. A healthy Worker can therefore have zero projects.
- CircleCI adapter requires `CIRCLECI_TOKEN`.
- Authenticated Browser JSON API requires `WEB_ACCESS_TOKEN` and `MCP_RATE_LIMITER`.
- Event inbox/correlation requires `EVENT_STORE` Durable Object.
- MCP transport requires `MCP_ACCESS_TOKEN`.
- Signed webhook ingestion requires `CIRCLECI_WEBHOOK_SECRET` and separately configured CircleCI webhook delivery.
- Never inspect or output secret values; check presence by name only when authorized access exists.
- `GET /health` is not proof of registry or CircleCI connectivity.
- `GET /api/v1/projects` verifies registry visibility only.
- `GET /api/v1/status?project_id=<id>&connection_id=<id>` is the read-only CircleCI connectivity probe; success should show `connected:true`, `provider:"circleci"`, `permissions:"read-only"`.
- Only after status succeeds should bounded run/job/log/test/artifact reads be inspected.
- Synthetic signed webhook tests are not proof of real CircleCI webhook delivery.
- The checked-in `scripts/preview-smoke-test.mjs` is pinned to a historical Preview alias and fixed `znect-forge` / `forge-circleci` identifiers. It is not a generic current-head test and does not prove Znect Build is registered.

## 7. Next work sequence — no user action until repository checks are exhausted

1. Read this file and `RUNTIME_READINESS.md`; inspect latest branch HEADs before doing anything.
2. Inspect `Znect-god/znect-forge` and all relevant repositories for Cloudflare deployment/build configuration, `wrangler` files, scripts, package manifests, GitHub workflows, commit references and deployment provenance. Read only; do not run or trigger deployment.
3. Inspect available GitHub deployment records and commit metadata for the Worker version `920f2af4-18b4-4c1e-957e-d87f6e7e174b` and deployment UUID `5bee14ec-697a-4656-8f2f-e2d9bea97148`, where repository evidence permits. Do not confuse either identifier with a Git SHA.
4. Determine whether repository configuration identifies the Production source repository, branch, root directory, build command and deploy command. Report only fields supported by evidence.
5. If GitHub evidence is insufficient, ask for exactly the missing non-secret Cloudflare Dashboard field(s), not for tokens and not for a full repeated setup.
6. Once the deployed commit is known, compare it with current source HEAD and the successful central validation SHA. Then identify the smallest safe next step. Do not deploy without explicit authorization.
7. Update this file with new verified facts, including exact commit/version IDs and evidence URLs. Never overwrite historical evidence; mark it as superseded and add a dated entry.

## 8. User communication and workflow preferences

- The user expects the assistant to use already connected GitHub access and do the repository investigation itself.
- Do not send the user around the same setup loop, ask for known IDs/tokens, or request logs already inspected and deleted.
- Do not ask the user to paste shell commands, manually create files, or repeat steps that GitHub integration can perform.
- Be explicit about what has actually been done versus what is blocked by a missing capability.
- When asking for user input, request one precise, minimal, non-secret item.
- Avoid profanity in the assistant's response even if the user is frustrated; respond calmly, directly, and take action.

## 9. Security

This file intentionally contains operational identifiers, public repository paths, non-secret build metadata and verification state only. It must never contain token values, secret values, private keys, passwords, authorization headers, signed URLs, or unredacted private artifact URLs.
