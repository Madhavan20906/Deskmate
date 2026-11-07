# Deskmate

Deskmate is a seated mixed-reality planning workspace built with Meta IWSDK.
The first milestone includes a daily workload overview, a three-block timeline,
three selectable task cards, and hand-pinch grabbing for repositioning cards.
The welcome panel retains the Enter XR and Exit to Browser controls.

The active scene, asset catalog, component catalog, AR session settings, and
hand-tracking feature are configured in `iwsdk.config.json`. Runtime systems
remain explicitly registered in `src/index.ts`.

## Run

Install dependencies with `npm install`, then start the managed IWSDK app with
`npm run dev`. In the managed browser, use the Runtime and Editor controls to
switch between the running experience and its authored scene. Select a task
with its button; pinch and move a task card to reposition it. Use Enter XR to
launch the immersive session and Exit to Browser to return.

## References

- Minimal scene walkthrough: https://iwsdk.dev/guides/01b-minimal-scene.html
- IWER emulator controls: https://iwsdk.dev/guides/02-testing-experience.html#iwer-controls