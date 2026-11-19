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


## 10. Additional deployment-source investigation — 2026-11-19

### Confirmed repository evidence

- Private repository `Znect-god/znect-forge` is an Android/Kotlin project. Its current `main` root contains `.github/`, `README.md`, `app/`, `scripts/` and `журналы/`; there is no root `package.json`, `wrangler.toml` or Cloudflare Worker source in the complete recursive tree. Therefore its current `main` root is not the source directory used by the recorded Wrangler Worker build.
- The Forge workflows are separate from the Worker deployment:
  - `.github/workflows/znect-build-request.yml` is `workflow_dispatch` only. It dispatches a request to `Znect-god/znect-build` and explicitly logs that Forge execution is disabled; it is not a Worker deploy.
  - `.github/workflows/znect-ci-bridge-request.yml` is an on-demand private diagnostic workflow, pinned to the historical Preview hostname `feat-ci-bridge-circleci-webhooks-znect-ci-bridge.znect699.workers.dev` and the Forge CircleCI project. It is not the Production deployment workflow.
- The Worker source and Wrangler project are in `Znect-god/znect-all-plugins`, branch `ci-bridge`, directory `plugins/znect-ci-bridge/`.
- That directory contains:
  - `package.json` with `deploy: wrangler deploy` and Wrangler `4.160.0`.
  - `package-lock.json`.
  - `wrangler.toml` with Worker name `znect-ci-bridge`, entrypoint `src/index.ts`, compatibility date `2026-11-11`, and the declared rate-limit and Durable Object bindings.
- The Production build log's sequence (`npm clean-install`, a configured `npm ci`, then `npx wrangler deploy`) is consistent with a Cloudflare Workers Builds configuration rooted at `plugins/znect-ci-bridge/` in the source repository. This is a strong match, but the actual Cloudflare Git integration configuration has not been read.

### Strong timestamp correlation for the recorded Production deployment

- Production log first timestamp: `2026-11-12T07:45:12Z`.
- GitHub commit `060b159375da2ce153f0dcaa4bff98a56ad940bb` was created at `2026-11-12T07:45:08Z`, four seconds earlier.
- That commit changes only `plugins/znect-ci-bridge/src/index.ts`, adding the read-only `get_job_details` MCP tool.
- The time correlation strongly suggests that this is the source commit that triggered the recorded Production build. However, the build log itself contains no commit SHA. Do not mark this commit as proven deployed until Cloudflare deployment metadata or build configuration explicitly ties the Version ID `920f2af4-18b4-4c1e-957e-d87f6e7e174b` to it.
- Another earlier source commit `32ef124c293f10c9aa36a392c7a1cb8398e52d48` at `2026-11-12T00:06:36Z` is explicitly titled `chore: trigger Cloudflare Workers build`; it may correspond to a different build. Do not conflate it with the 07:45:12Z log.

### Remaining exact evidence needed

GitHub source inspection has narrowed the likely Cloudflare source to:
- Repository: `Znect-god/znect-all-plugins`
- Branch: likely `ci-bridge` (the correlated commit is on this branch)
- Root directory: likely `plugins/znect-ci-bridge`
- Deploy command: likely `npx wrangler deploy` (explicitly recorded in the Production log and package script)

These are strong source-based inferences, not a verified reading of Cloudflare's configuration. The single remaining configuration evidence is the Cloudflare Worker project's **Builds & deployments** configuration showing the connected repository, production branch, root directory, build command and deploy command. Request only those non-secret fields if no read-only Cloudflare tool becomes available. Do not ask for a broad screenshot, credentials, or another log already analyzed.

### New tool limitation

- The available GitHub connector can read repository contents, commit history and related GitHub resources, but its allowlist rejected the repository deployments endpoint in this investigation. Do not claim GitHub deployment records were inspected.

## 11. Continuation checkpoint — 2026-11-19

### Cloudflare Production branch discrepancy checked through GitHub

- The user explicitly identified the Cloudflare Production branch as `feature/znect-ci-bridge-source`. Preserve this as the branch name reported from the Cloudflare dashboard; do not silently replace it with `ci-bridge`.
- GitHub repository search confirmed the connected installation can see `Znect-god/znect-all-plugins` (default branch `main`).
- GitHub branch search in that repository returned:
  - `ci-bridge` exists.
  - Exact branch `feature/znect-ci-bridge-source` was not found.
  - Searching branches matching `feature` returned `feature/znect-screen-bridge-foundation`; this is a different branch and must not be treated as a match.
- GitHub commit search for `znect-ci-bridge-source` within org `Znect-god` returned no matches.
- This establishes only that the connected GitHub view did not find the reported branch in the known source repository. It does not prove the Cloudflare configuration is wrong: the branch may belong to another repository, another owner, or a repository not exposed by the current GitHub installation.
- No branch was created, renamed, pushed, or changed. No Cloudflare configuration or deployment was touched.

### User's requested working approach

- The user wants the assistant to retain non-confidential operational facts in this handoff file and stop asking them to repeat already supplied information.
- The user plans to send Cloudflare quota/configuration screenshots later, when available. Until then, continue with read-only GitHub investigation and Znect Forge work; do not block on screenshots.
- Continue the user's project named **Znect Forge** (repository `Znect-god/znect-forge`) rather than treating the Cloudflare branch discrepancy as a reason to restart the whole investigation.
- Before asking the user for anything, inspect existing repository state and prior project notes. Ask only for a genuinely necessary, specific missing item.
- Keep all credentials and secret values out of this file. Record only non-secret identifiers, findings, and evidence links.


## 11. Separate active project: Znect Forge Android development — 2026-11-19

**Important distinction:** Znect Forge is the user's active Android product-development project. CI Bridge is a separate integration/workstream and must not replace or narrow Forge development. Do not introduce Jenkins into this workflow. The user expects continued feature development in Forge, not another CI Bridge investigation loop.

### Repository and active milestone

- Repository: `Znect-god/znect-forge`.
- Product: Android-first mobile development workstation; target device documented as Blackview BV9200, Android 12 / API 31 / arm64-v8a.
- Active milestone: 0.7.0, “Forge Workspace, File Manager integration, Aedra and Daedra”.
- Active implementation branch: `work/0.7.0-finish-daedric-workshop`.
- Draft PR: https://github.com/Znect-god/znect-forge/pull/1
- PR title: `WIP: Znect Forge 0.7.0 completion`.
- PR base: `develop/0.7.0-daedric-workshop`; head: `work/0.7.0-finish-daedric-workshop`.
- PR head SHA observed: `dd66b32003e04159016d368b5e8eeb88de1396f2`; base SHA observed: `01e053b86f42932351ebd2622fcbb5c4ffc8e481`.
- PR was open, draft, and mergeable at the time checked; 167 changed files, 42,226 additions, 653 deletions. Do not merge without explicit authorization.
- Forge README says 0.6.1 is the retained practical baseline. 0.7.0 implementation, CI verification and physical-device testing are separate gates.

### Forge source/verification rules

- Implement the agreed Android 0.7.0 scope before starting CI/build troubleshooting.
- Before editing a file, fetch its current content and blob SHA from the active work branch; use that SHA for updates.
- Preserve working behavior. Keep domain/storage logic separate from Activity UI where practical.
- No feature is complete merely because source code exists. Record source implementation, tests, CI/APK and BV9200 device verification separately.
- Do not trigger or mutate CircleCI/GitHub Actions or dispatch workflows unless the user explicitly authorizes it. The user's Forge PR describes a CircleCI Android CI job; source review alone is not a CI result.
- Do not claim build/tests/APK/device checks passed unless actual results exist. Do not merge or release/tag without explicit authorization.
- No Jenkins is part of the agreed Forge workflow.

### Key project docs

- `docs/0.7.0-implementation-plan.md` — ordered workstreams, priorities, acceptance criteria.
- `docs/KNOWN_ISSUES_0.7.0.md` — canonical feature/problem register; consult before each task and update without duplicating existing items.
- `docs/0.7.0_COMPLETION_PLAN.md`, `docs/RELEASE_0.7.0_PLAN.md`, `docs/RELEASE_0.7.0_CANDIDATE.md` — completion and release gates.
- `docs/file-manager-reference-audit.md` and `docs/FILE_MANAGER_3.6.3_FEATURE_MATRIX.md` — reference File Manager 3.6.3 parity work.
- `docs/network-file-system-adapter-contract.md` — FTP/FTPS/SFTP/SMB/network provider contract and limits.
- `docs/SECURITY_MODEL.md` — security requirements.

### Current confirmed development finding: F07-087 text editor gap

- Canonical issue: F07-087 in `docs/KNOWN_ISSUES_0.7.0.md`.
- In `WorkspaceActivity.kt`, `showPhoneStoragePreview()` reads at most 512 KiB as UTF-8 and opens `showCopyableInfoDialog()`. There is no edit buffer, Save action, dirty-state confirmation or write-back in this path.
- The preference key `file_manager_internal_text_editor` therefore currently selects a read-only preview, despite the old key name. The issue register already changed the visible setting labels to “Internal text preview” / “Внутренний просмотр текста”.
- `FileManagerEngine.createTextFileAtPath()` can create new files and write UTF-8 content up to 1 MiB. For WORKSPACE/PHONE_STORAGE it creates a new document then writes via `ContentResolver.openOutputStream(uri, "wt")`; on failure it attempts to delete the newly created file. This is not a safe generic existing-file replacement contract.
- Project storage uses `projects.createTextFile(...)` for creation. Do not assume it supplies an edit/replace operation without inspecting its implementation.
- Network provider contract documents staged upload, backup/rename publication and provider-specific limits; SAF downloads may write directly and cannot promise atomic rollback. Root/Direct/Network/SAF providers have different guarantees.
- Safe next engineering step: inspect existing storage-provider write/replace APIs and policies, then design a bounded UTF-8 editor with dirty-state confirmation, capability checks and safe staged replacement only for providers that can guarantee it. Keep preview-only/Open-with behavior for providers without safe replacement. Add policy/provider regression tests before exposing Save.
- Do not implement generic `openOutputStream(uri, "wt")` overwrite for arbitrary existing files; it risks truncation/data loss on partial failure.
- At the last source inspection, `WorkspaceActivity.kt` blob SHA was `7b3e2a50c9a9effdea7186612cb72e4e406fb4f8`; `FileManagerEngine.kt` blob SHA was `347ba8e1677cc6c5ccfad5dec1e3d8b494c59ad4`. Re-fetch before edits.
- No Forge source files were changed and no tests/build/CI/APK/device checks were run during this investigation.

### Other open Forge parity/verification facts

- F07-034: full global File Manager 3.6.3 integration remains in progress; static source dimensions/navigation review does not prove runtime parity. Gesture/edge-swipe, orientation, artwork, viewer transitions, TalkBack and BV9200 acceptance remain open.
- Archive support is source-integrated for ZIP/JAR and split ZIP/7z paths, but dependency resolution and real provider/device fixtures remain unverified.
- Network protocol adapters (FTP/FTPS/SFTP/SMB3 and cloud providers) are source-integrated; no live-server interoperability/device verification is established.
- README records several remaining gaps: read-only text preview vs editor, safe/licensed external FFmpeg implementation, runtime subtitle rendering, removable media/live provider compatibility, archive/media matrices, OEM dual-app coverage, accessibility, task history/recovery, theme portrait/landscape validation and device acceptance.
- README says English/Russian string keys currently match 993/993 with no duplicates; this is source-level inventory, not runtime localization acceptance.
- The Android CircleCI config runs `:app:testDebugUnitTest` and `:app:assembleDebug` on matching branch patterns. Do not dispatch it or claim a result without actual read-only evidence/authorization.

### User communication

- The user has explicitly said Forge is in active development and wants work to continue across all agreed 0.7.0 scope, not only CI Bridge.
- Do not ask the user to repeat known project context or send logs already available in GitHub.
- Give one concrete next action/result at a time; avoid cycling through setup questions.


### Forge text-editor follow-up — 2026-11-19

- Further inspection found the project-scoped editor already exists: `WorkspaceActivity.showEditFileDialog()` uses the EN/RU resource strings and saves via `WorkspaceManager.writeTextFile()`.
- `WorkspaceManager.writeTextFile()` writes and fsyncs a sibling temporary file, renames the original to a backup, publishes the replacement, and restores the backup on publication or workspace-sync failure. Reuse this design; do not duplicate project editor logic.
- Root provider write path is staged and backup-aware. Network provider write path is staged, checks source version and publishes by rename with backup recovery. These Forge-owned provider authorities are candidates for the first global editor save path.
- Direct provider currently opens the original file directly with `ParcelFileDescriptor.open(file, modeFlags)`; do not enable global editor save there until a transactional replacement path is implemented.
- Generic SAF `FLAG_SUPPORTS_WRITE` does not prove safe rollback. Keep generic SAF preview-only until a provider-specific transactional adapter is implemented and tested.
- The canonical issue register `docs/KNOWN_ISSUES_0.7.0.md`, issue F07-087, was updated in commit `2d3954974543a3e5e13074cfe3b6a45224c895e6` with this architecture boundary. Global editor UI is still not implemented; no tests/build/device checks were run.


### F07-087 global text editor implementation — 2026-11-19

- Implemented in Forge branch `work/0.7.0-finish-daedric-workshop` (same draft PR #1). Global File Manager opens the editor only for exact Forge-owned Root and Network Storage content authorities; Direct Storage and third-party SAF remain read-only preview.
- Added `GlobalTextEditorPolicy.kt` and `GlobalTextEditorPolicyTest.kt` for exact authority allowlisting.
- `WorkspaceActivity.showPhoneStoragePreview()` now uses strict UTF-8 decoding, keeps the 512 KiB cap, and opens a Save/Close editor only for non-truncated text in approved providers. Save enforces the same byte cap, re-reads and compares original bytes to detect changes since open, then writes via `ContentResolver.openOutputStream(uri, "wt")` so the existing Root/Network staged/backup provider pipelines handle publication. Back/Close prompts before discarding dirty text; write failure keeps the editor content available.
- Added EN/RU strings for size limit, conflict and discard confirmation.
- Forge issue register F07-087 updated in commit `8e05987373884affbe7e6313598d00e1518c0c85`.
- Current Forge branch head at handoff update: `8e05987373884affbe7e6313598d00e1518c0c85`.
- A local standalone Kotlin smoke check for the provider allowlist passed. The JUnit source exists but was not run. No full Gradle tests, Android build, CircleCI run, APK or BV9200 device validation were performed. GitHub combined commit status returned no statuses for the prior source head; re-check after the final documentation commit.
- Do not describe F07-087 as release-verified until the actual Gradle/JUnit suite, Android build and target-device checks pass.
