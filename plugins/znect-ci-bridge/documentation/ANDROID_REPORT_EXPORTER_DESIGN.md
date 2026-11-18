# Znect CI Bridge — Android private report exporter

**Status:** design specification plus Android source prototype; build/device verification pending.  
**Target:** Android companion utility for a user-operated, manual ChatGPT report handoff.  
**Relationship to CI Bridge:** client-side helper only; it does not replace the Worker, Browser API, or server-side authorization.

## 1. Purpose

Provide a safe way to retrieve the existing private aggregate report from a phone and explicitly attach it to ChatGPT when ChatGPT cannot directly authenticate to the private Browser JSON API.

This is a **manual secure handoff**, not direct or automatic ChatGPT API access.

## 2. Required user flow

1. The user opens the exporter and unlocks access using the device's configured screen lock or optional biometric confirmation.
2. The user selects a previously configured CI Bridge project and requests a report.
3. The app sends one HTTPS GET request to the exact configured Browser API origin and the fixed report route.
4. The app validates the response, displays report timestamp, project identity, completeness metadata and any provider/storage errors.
5. The user chooses **Share report**.
6. Android's system Sharesheet opens with the generated JSON file. The user explicitly selects ChatGPT or another destination.
7. The app retains the report only in app-private temporary storage and deletes it on expiry or the next cleanup.

No background polling, automatic upload, cloud synchronization, public link creation, or unsolicited sharing.

## 3. Credential handling

- Store the Browser API Bearer token encrypted with an Android Keystore-backed key. The key must be non-exportable.
- Store only ciphertext and non-secret metadata in app-private storage.
- Never log, display, copy to clipboard, include in crash reports, analytics, exported files, or report JSON.
- Never place the token in a URL, query parameter, filename, intent extra, notification, or ChatGPT message.
- Require local user interaction to add or replace a credential. Credential entry occurs only inside the app; ChatGPT must never ask the user to paste it into chat.
- Do not read or migrate any existing token automatically. The user configures the app locally if they choose to use it.
- Provide a local disconnect action that deletes the encrypted credential and associated key material.

## 4. Network contract

- HTTPS only; disable cleartext traffic.
- Allow only an explicitly configured HTTPS origin. Reject arbitrary URL schemes, user-info components, unexpected ports and path overrides.
- Call only GET /api/v1/report with bounded query parameters:
  - project_id: required, selected from the user's configured project entry;
  - connection_id: optional, selected explicitly when needed;
  - run_limit: 1–10;
  - event_limit: 1–20;
  - after: non-negative cursor.
- Never call CircleCI directly from the Android app.
- Do not follow cross-origin redirects. Do not forward Authorization to another origin.
- Apply connection and read timeouts, enforce the documented response-size cap, and fail closed on oversized or malformed responses.
- Treat HTTP errors and provider/storage error fields as report state, not as permission to weaken authentication or retry indefinitely.
- Do not add POST, PUT, PATCH, DELETE, pipeline trigger, retry, cancel, or deployment operations.

## 5. Report validation and export

- Verify service identifier, report version, project identity, generated_at, read_only flag, and expected bounded collections before enabling Share.
- Preserve freshness and completeness metadata. Clearly mark stale, partial, truncated, or provider-unavailable reports.
- Do not synthesize missing runs, events, diagnostics or test results.
- Export only the JSON response body after validating that no authorization material or known credential fields are present.
- Use a neutral filename that contains no token, private repository secret, or sensitive log excerpt.
- Save to app-private cache and expose the file through Android FileProvider using a short-lived content URI and read-only grant.
- Launch the system Sharesheet only after an explicit tap. Never start a share intent automatically after fetch.
- Keep the server's existing redaction as the primary protection; add client-side defensive checks as a second boundary.

## 6. Android implementation shape

- Native Kotlin application; no embedded web server and no local network listener.
- Android Keystore for credential encryption.
- App-private storage for encrypted configuration and temporary reports.
- Network Security Config with cleartext disabled.
- A narrowly scoped HTTP client configured for HTTPS, strict origin validation, bounded response bodies and no cross-origin redirect forwarding.
- Android FileProvider plus Sharesheet for explicit file handoff.
- No analytics SDK, advertising SDK, remote crash upload, third-party proxy, or cloud storage dependency.
- Keep dependencies minimal and pinned.

The minimum Android version and packaging/distribution approach must be chosen before implementation. Do not assume that Termux, Node.js, or another runtime is installed.

## 7. Threat model and limits

The exporter reduces the need to expose the Bearer token to ChatGPT, GitHub, a public URL or a cloud intermediary. It does not make the exported report secret-free: the report may contain private project names, run metadata, diagnostics and event details. The user must review the report and choose the destination.

A compromised or unlocked device, malicious keyboard/accessibility service, rooted environment, or a destination app with broad file access may still expose data. The app must not claim protection against a compromised device.

## 8. Acceptance criteria

- Credential is encrypted at rest with a non-exportable Keystore key.
- No credential appears in logs, exported report, filenames, URLs, intents or crash data.
- Only the configured HTTPS origin and GET report route can be called.
- Redirects cannot leak Authorization to another origin.
- Oversized, malformed, stale and partial reports are handled explicitly.
- The app performs no background requests or data uploads.
- Report sharing requires a user tap and uses a read-only content URI.
- Disconnect removes stored credential and key material.
- Unit tests cover URL/origin validation, response bounds, report schema validation, export redaction and temporary-file cleanup.
- Device tests cover credential unlock, fetch errors, offline state, Android Sharesheet and file-grant expiry.
- Build, tests, signing, installation and live API access are separate gates and require explicit authorization before execution.

## 9. Out of scope

- Direct ChatGPT-to-API authentication.
- MCP server or Apps SDK dependency.
- GitHub Actions or Znect Build as a report runner.
- Public or unauthenticated report endpoint.
- Cloud token vault, paid intermediary or hosted report relay.
- Automatic upload, scheduled polling or background sharing.
- Any CircleCI pipeline mutation or deployment capability.

## 10. Current state

The Android source prototype is present under `android-exporter/`. It includes Keystore-backed credential storage, HTTPS-only bounded report retrieval, strict validation against the actual CircleCI `/api/v1/report` schema, defensive secret-field checks, local JSON export, explicit Sharesheet sharing, a local disconnect/key-deletion action and eight origin-policy test cases. The tests have not been executed. Device screen-lock/biometric confirmation and dedicated report-schema tests remain future work. No APK, live API request, credential access, Gradle build, device installation or deployment has been performed.
