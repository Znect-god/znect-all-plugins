# Znect CI Bridge Android Report Exporter

**Version:** 0.1.0 — source prototype  
**Status:** initial Android source implementation and origin-policy test source added; build and device verification pending.

A native Android helper for a user-initiated, manual handoff of the private CI Bridge report to ChatGPT. It is not direct ChatGPT API access.

## Requirements

- Android 8.0 (API 26) or newer.
- Android Studio / Android Gradle Plugin 8.7.3 and JDK 17 to build.
- Android SDK 35.

## Setup

1. Open this `android-exporter` directory in Android Studio.
2. Build/install only after reviewing the source and authorizing a build.
3. In the app, enter the HTTPS origin of the deployed CI Bridge Browser API, the registered project ID, optional connection ID, and the Browser API Bearer token.
4. Save configuration. The token is encrypted with an AES-GCM key held in Android Keystore; only ciphertext is stored in app-private preferences.
5. Tap **Fetch report** to request the bounded read-only `GET /api/v1/report`.
6. Review the report status, then tap **Share report** to open Android Sharesheet and explicitly choose ChatGPT.

The app does not include a default API origin or project identifier. Do not paste tokens into ChatGPT, URLs, repository files, or issue comments.

## Security boundaries

- HTTPS only; only the configured origin on the standard HTTPS port is accepted.
- Fixed GET-only report path; redirects are rejected.
- Bearer token is never written to the report or filename.
- Response is capped at 100 KB and validated before export.
- Export uses an app-private cache file and a read-only FileProvider grant.
- No background polling, analytics, cloud upload, public URL, MCP, GitHub Actions, or CircleCI mutation operations.

## Known limitations

- This is an initial source implementation, not a verified APK.
- The user must explicitly configure the API origin, project and token locally.
- The exported report can contain private project/run metadata; review it before sharing.
- Unit-test source for HTTPS origin validation has been added but not executed. No build, installation, live API request, or deployment has been run.

## Implemented in this source prototype

- Native Kotlin Activity with local origin/project/connection configuration.
- AES-GCM credential encryption using a non-exportable Android Keystore key; the app does not display a saved token.
- Strict HTTPS origin policy, fixed report endpoint, GET-only request and redirect rejection.
- 100 KB response cap, report identity/read-only validation and defensive credential-like field scan.
- Local temporary JSON export and explicit Android Sharesheet handoff through FileProvider.
- Cleartext traffic disabled and system trust anchors required.
- Unit-test source for accepted/rejected API origins.

The first implementation intentionally has no background worker, scheduled polling, analytics, telemetry or server-side component.
