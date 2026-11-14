# Znect Screen Bridge

**Status:** `prototype` — concept and documentation only  
**Version:** `0.1.0`  
**Implementation priority:** deferred until the Znect Forge foundation is implemented and sufficiently stable.

Znect Screen Bridge is a proposed Android component for explicitly sharing the device screen with an authorized AI assistant or compatible client. Its initial use case is hands-on application testing: the user operates an app while an assistant can inspect the same visible interface and help diagnose behavior.

This entry records a design direction. It does **not** contain an implemented Android application, a working screen stream, or a verified ChatGPT integration.

## Goals

- Let the user start and stop screen sharing deliberately.
- Provide a small floating control surface for pause/resume and stop.
- Capture the screen using Android's supported screen-capture mechanisms.
- Make captured frames available to an explicitly selected, authorized AI/client adapter.
- Keep the capture layer independent of any one AI provider.
- Support testing and troubleshooting of Android applications, including Znect projects.

## Non-goals for the first implementation

- Hidden, background, or covert surveillance.
- Capturing another person's device without their knowledge and consent.
- Bypassing Android's screen-capture protections or protected/secure surfaces.
- Recording or storing screen sessions by default.
- Promising continuous ChatGPT video access on every ChatGPT plan.
- Making Screen Bridge a prerequisite for Znect Forge.

## Proposed component architecture

```text
Android user
    |
    v
Floating control surface
    |  start / pause / resume / stop
    v
Capture session manager
    |
    v
Android MediaProjection + foreground service
    |
    v
Frame processing and privacy guard
    |
    v
Screen Bridge transport interface
    |
    +---- ChatGPT-compatible handoff (capabilities/limits dependent)
    +---- Znect AI adapter
    +---- Other explicitly configured clients
```

### Components

1. **Capture session manager** — owns the session lifecycle and Android permission flow.
2. **Screen Capture** — obtains frames through Android `MediaProjection` after the system consent flow.
3. **Floating Controls** — provides visible session state, pause/resume, and immediate stop. Overlay permission, if used, is requested separately and explained.
4. **Privacy Guard** — supports user-controlled masking/exclusion of sensitive regions and avoids forwarding content the user has marked private.
5. **Frame Processor** — scales, samples, and encodes frames according to the selected transport's limits; avoids unnecessary high-frequency streaming.
6. **Bridge Transport** — authenticated, encrypted delivery to a selected client adapter.
7. **AI/Client Adapter** — provider-specific integration kept separate from Android capture code.

## Android platform approach

The likely Android foundation is `MediaProjection`, initiated through the system-mediated user consent flow. A foreground service and persistent notification are expected for a sustained capture session, subject to the Android version's current platform requirements.

The floating control surface may use Android overlay functionality where appropriate. Overlay permission is distinct from screen-capture consent; neither permission should be treated as blanket authorization for unrelated data collection.

Implementation must follow the target Android SDK's current rules for MediaProjection token/session handling, foreground-service types, notification behavior, and lifecycle. These details must be verified against the SDK version selected when implementation begins.

## Privacy and security requirements

These are product requirements, not optional polish:

- Sharing is off by default and starts only after a clear user action and Android's required consent.
- A persistent, unmistakable indicator shows when capture is active.
- Pause and stop controls remain readily accessible; stop ends capture and transport promptly.
- No hidden capture, automatic restart after reboot, or silent session continuation.
- No default recording or retention of frames. Any future recording feature requires a separate, explicit opt-in and retention controls.
- Transport must be authenticated and encrypted.
- Credentials and provider tokens must be stored using appropriate platform secure storage and never committed to source control.
- Sensitive surfaces, notifications, password fields, payment details, and private content require careful handling. The design should offer masking and a quick privacy pause; it must not claim perfect automatic detection.
- Respect Android secure-window flags and other capture restrictions; never attempt to bypass them.
- Provide clear disclosure of what is sent, to which provider/client, and whether that provider may retain or process it.
- Minimize frame rate, resolution, and data volume to what the selected task needs.
- Treat received AI instructions and remote commands as untrusted. A screen-viewing bridge must not silently gain device-control or shell-execution privileges.

## ChatGPT and subscription constraints

Screen Bridge itself can be developed independently of a ChatGPT subscription. Android capture, local preview, floating controls, and the transport abstraction do not require ChatGPT Plus.

A ChatGPT subscription does not automatically grant an external application access to a continuous screen/video input channel. ChatGPT mobile screen sharing availability depends on the product's supported voice mode and plan availability; Live mode does not provide screen sharing, while the older Advanced voice experience has had mobile screen-sharing support for eligible users. Product capabilities and plan limits can change and must be rechecked at integration time.

The OpenAI API is a separate developer platform with separate billing; a ChatGPT Free subscription does not include API credits. Therefore:
- Do not make ChatGPT subscription access a prerequisite for the Android app.
- Prefer a provider-neutral adapter interface.
- Treat ChatGPT as an optional integration whose exact handoff mechanism must be validated when built.
- Keep a local/manual screenshot workflow available as a limited fallback, not as a claim of continuous live viewing.

## Main use cases

- **Application testing:** inspect screens, reproduce UI issues, and discuss observed behavior while the user operates the app.
- **Development assistance:** help understand layout, navigation, runtime state, and visible errors.
- **Znect ecosystem testing:** support future testing workflows for Znect applications, including projects developed in Znect Forge.
- **User assistance:** explain what is visible on screen, only while the user intentionally shares it.

## Relationship with Znect Forge and implementation order

Screen Bridge is a separate project in the shared Znect plugin/bridge repository. It is not part of the Znect Forge codebase and must not be required for Forge to function.

The recommended order is:

1. Establish and implement the core Znect Forge foundation.
2. Stabilize the relevant Android project/build/test workflows in Forge.
3. Revisit Screen Bridge requirements against the actual Forge architecture and testing needs.
4. Build and validate Android capture and floating controls.
5. Add the provider-neutral transport and one adapter at a time.
6. Conduct privacy, security, lifecycle, and device-compatibility testing before any stable release.

This is a sequencing recommendation, not a claim that Forge is already complete or that Screen Bridge implementation has started.

## Initial acceptance criteria (future implementation)

- User can start a session through an explicit Android consent flow.
- Capture-active state is continuously visible.
- Pause and stop work reliably; stop terminates frame delivery.
- No frames are sent before consent or while paused/stopped.
- The app does not bypass secure surfaces.
- A local preview works without any AI provider configured.
- A provider adapter can be enabled/disabled independently.
- Transport is authenticated, encrypted, bounded, and observable.
- Sensitive-data handling and retention behavior are documented and tested.
- Lifecycle behavior is tested across app switching, screen lock, rotation, process interruption, and supported Android versions.

## Current state and limitations

- Concept and initial architecture documented only.
- No Android source code or executable build is included.
- No MediaProjection flow has been implemented or tested.
- No floating overlay has been implemented or tested.
- No transport, provider adapter, or ChatGPT integration exists.
- No device compatibility, privacy, or security testing has been performed.
- Implementation is intentionally deferred until after the Znect Forge foundation.

## Licensing

Undecided. The repository does not currently grant reuse or redistribution rights merely because it is public.
