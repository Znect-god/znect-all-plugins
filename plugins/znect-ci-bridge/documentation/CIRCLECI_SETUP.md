# Running Znect CI Bridge validation in CircleCI

## Project setup

1. In CircleCI, connect the GitHub repository `Znect-god/znect-all-plugins` as a CircleCI project using the account's existing GitHub authorization.
2. Configure the project to use the repository config at `.circleci/config.yml`.
3. Ensure the project is allowed to build the `feature/ci-bridge-android-exporter` branch. The workflow is deliberately restricted to that branch and `main`.
4. Push a commit to either allowed branch. CircleCI starts the configured workflow from the repository commit; no CircleCI API token or project environment variable is required for these validation jobs.

## Jobs

The workflow runs two independent jobs:

- `ci-bridge-validation`: installs the Worker package dependencies, runs `npm audit --audit-level=high`, runs `npm run check`, checks the smoke-test script syntax and runs Wrangler in dry-run mode. It does not deploy.
- `ci-bridge-android-exporter`: verifies the committed Gradle Wrapper JAR checksum, installs Android SDK 35 components, runs the Android JVM unit tests and assembles a debug APK.

The Android job stores JUnit test results and, when the build succeeds, the APK at `android-exporter/app-debug.apk` in the CircleCI job artifacts. Open the completed Android job and use its Artifacts section to retrieve the file. The APK is an unsigned/debug validation artifact for manual review and installation, not a release build.

## Security and cost boundaries

- These jobs do not need `CIRCLECI_TOKEN`, `WEB_ACCESS_TOKEN`, Cloudflare credentials or other project secrets.
- The workflow does not call CircleCI trigger/retry/cancel/configuration APIs, deploy a Worker, publish an app, sign a release, or install anything on a device.
- The Android job uses the standard Docker `medium` resource class (2 vCPU / 4 GB RAM). CircleCI currently lists this class on the Free plan at 10 credits/minute; the Free plan includes 30,000 monthly credits for personal usage. Actual consumption depends on job duration and organization eligibility. Review the CircleCI usage dashboard and do not enable paid add-ons or automatic credit top-ups.
- A configuration commit is not proof of a successful run. Treat tests, APK assembly, artifact availability and device verification as separate results.

## If no pipeline starts

Confirm that the repository is connected to the expected CircleCI organization/project, that the branch is one of the two allowed names, and that the project is configured to read `.circleci/config.yml`. Do not substitute GitHub Actions or enable an unauthenticated/public API to work around a missing CircleCI connection.
