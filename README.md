# Deskmate

Deskmate is a seated mixed-reality planning workspace built with Meta IWSDK. XR
means an immersive headset session; IWER is IWSDK's browser-based XR emulator.
The app keeps its existing living-room scene and central spatial dashboard.

## Features

- Six hand-grabbable task cards with create, edit, duplicate, delete, status,
  priority, category, duration, and same-day scheduling controls.
- A working-day timeline, conflict detection, workload/capacity analysis, and
  explicit scheduling suggestions. Pip schedule suggestions require confirmation.
- Configurable focus sessions with pause/resume/stop, deadline-based timing,
  daily and lifetime totals, and recent session history.
- Pip local command support for creating, listing, completing, scheduling,
  summarizing, and starting focus. Voice recognition is optional; typed requests
  are the fallback. No external AI provider is configured, and the app discloses
  that Pip uses local command parsing rather than a hosted AI model.
- A productivity garden and seven-day analytics derived from saved task completion
  dates and focus history. Growth and streaks are retained through that source data.
- Versioned local browser storage with validation and a protected read-only
  recovery mode for unreadable task/focus data.

## Run

Install workspace dependencies with `pnpm install`, then start the managed IWSDK
app with `pnpm run dev`. Select a task card, use its controls, and press Enter XR
to enter the immersive session. The browser canvas is the desktop mouse fallback;
task cards support hand pinch grabbing in the emulator.

Run `pnpm run typecheck` and `pnpm run build` to validate the TypeScript and
production bundle.

## Known limitations

- Tasks are capped at six cards and schedules cover one local day (08:00-18:00).
- Data is stored in this browser's local storage; there is no account, cloud sync,
  cross-device backup, or export/import flow.
- Pip is a privacy-disclosed local command parser, not a generative AI service.
  Speech transcription depends on browser support and permissions.
- The garden visualization and analytics are dashboard-scale UIKit, not a
  persistent 3D garden environment.
- Physical desk detection, plane raycasting, and persistent world anchors are
  not enabled or claimed. The app retains AR/passthrough configuration, but this
  workspace has not been tested on a physical Quest headset.
- The current runtime validation target is the managed IWER Quest 3 profile on a
  Windows desktop; it is not evidence of Quest hand-tracking or frame-rate
  performance on hardware.

## References

- Minimal scene walkthrough: https://iwsdk.dev/guides/01b-minimal-scene.html
- IWER emulator controls: https://iwsdk.dev/guides/02-testing-experience.html#iwer-controls