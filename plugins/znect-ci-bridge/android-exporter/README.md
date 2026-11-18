# Znect CI Bridge Android Report Exporter

**Version:** 0.1.0 — source prototype  
**Status:** Android source prototype includes report-schema validation and local disconnect; build and device verification pending.

A native Android helper for a user-initiated, manual handoff of the private CI Bridge report to ChatGPT. It is not direct ChatGPT API access.

## Requirements

- Android 8.0 (API 26) or newer.
- Android Gradle Plugin 8.7.2, Kotlin Gradle Plugin 2.1.10 and JDK 17.
- Android SDK 35.
- Gradle 8.9 Wrapper is committed (`gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar` and properties). The wrapper JAR is sourced from the official `gradle/gradle` `v8.9.0` tag and checked against Gradle's published SHA-256; the distribution URL is pinned and its official SHA-256 is configured.

## Setup

1. Open this `android-exporter` directory in Android Studio.
2. Build/install only after reviewing the source and authorizing a build.
3. In the app, enter the HTTPS origin of the deployed CI Bridge Browser API, the registered project ID, optional connection ID, and the Browser API Bearer token.
4. Save configuration. The token is encrypted with an AES-GCM key held in Android Keystore; only ciphertext is stored in app-private preferences.
5. Tap **Fetch report** to request the bounded read-only `GET /api/v1/report`.
6. Review the report status, then tap **Share report** to open Android Sharesheet and explicitly choose ChatGPT.
7. Use **Disconnect and clear local data** to remove all locally saved configuration, the encrypted credential, its Keystore key entry and cached reports.

The app does not include a default API origin or project identifier. Do not paste tokens into ChatGPT, URLs, repository files, or issue comments.

## Security boundaries

- HTTPS only; only the configured origin on the standard HTTPS port is accepted.
- Fixed GET-only report path; redirects are rejected.
- Bearer token is never written to the report or filename.
- Response is capped at 100 KB and validated against the actual CircleCI report identity, permissions, timestamp, project/connection, run/event bounds and completeness schema before export.
- Export uses an app-private cache file and a read-only FileProvider grant.
- No background polling, analytics, cloud upload, public URL, MCP, GitHub Actions, or CircleCI mutation operations.

## Known limitations

- This is a source implementation, not a verified APK.
- Device screen-lock/biometric confirmation is not implemented yet.
- The user must explicitly configure the API origin, project and token locally.
- The exported report can contain private project/run metadata; review it before sharing.
- Eight HTTPS-origin tests, seventeen report-schema/privacy tests and three Bearer-token policy tests have been authored; none has been executed yet. The Android module now has a pinned Gradle 8.9 Wrapper, Android Gradle Plugin 8.7.2, Kotlin Android plugin 2.1.10, and a CircleCI job for JVM tests plus debug APK assembly; execution and device verification remain pending.

## Implemented in this source prototype

- Native Kotlin Activity with local origin/project/connection configuration.
- AES-GCM credential encryption using a non-exportable Android Keystore key; the app does not display a saved token.
- Strict HTTPS origin policy, fixed report endpoint, GET-only request and redirect rejection.
- 100 KB response cap, CircleCI report-schema validation, ISO timestamp and bounded collection checks, plus defensive credential-like field scan.
- Local disconnect action that clears the encrypted credential, Keystore key entry and temporary report.
- Local temporary JSON export and explicit Android Sharesheet handoff through FileProvider.
- Cleartext traffic disabled and system trust anchors required.
- Gradle 8.9 Wrapper with upstream JAR checksum verification and pinned distribution checksum.
- Unit-test source for accepted/rejected API origins.
- Isolated report validator with unit-test source for identity, read-only permission, project scope, timestamp, collection bounds/counts, completeness and recursive sensitive-key detection.

The first implementation intentionally has no background worker, scheduled polling, analytics, telemetry or server-side component.


## CircleCI build outputs

The `ci-bridge-android-exporter` CircleCI job runs the JVM unit tests and assembles a debug APK. On a successful run it stores the JUnit test results and the APK as CircleCI artifacts at `android-exporter/app-debug.apk`. This is a debug build for manual review/install only; it is not a release or deployment.


Bearer credentials are validated against the RFC 6750 `b64token` character set (including underscore), with a 4096-character upper bound. The policy has focused JVM tests for accepted token characters, whitespace/CRLF rejection and length bounds.

The report validator also checks strict JSON primitive types (not numeric strings), requested limits, returned counts, failed-run counts, JSON item types, event cursor and completeness flags are mutually consistent before the file can be shared.
