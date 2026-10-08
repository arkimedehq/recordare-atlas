# Recordare Atlas — TODO

Italian copy: `TODO_it.md`.

## Light mode (low-power GPUs, wall panels)

**Why.** The atlas is meant to run all day on wall panels and tablets (screensaver, kiosk). Today the renderer always
pays the full cost (`src/brain.ts`): MSAA antialias, pixel ratio up to 2, `UnrealBloomPass` at full resolution and an
uncapped `requestAnimationFrame` loop that keeps drawing even when the service is quiet. On weak mobile GPUs (e.g.
Mali-G52 on RK3576 / RK3566 tablets) with high-DPI screens this means low frame rate, heat and battery wear.

**What.** A rendering mode, chosen from the URL (`?mode=light`), that changes only how much drawing costs — never what is
shown:

- [ ] Pixel ratio 1 (instead of `min(devicePixelRatio, 2)`); keep the glow point size consistent with it.
- [ ] No MSAA (`antialias: false`).
- [ ] Bloom at half resolution (option: `?mode=light&bloom=off` to drop it entirely).
- [ ] Frame cap at 30 fps.
- [ ] Render on demand when idle: when no impulse is travelling, the camera is still and no transition is running, stop
      drawing frames until the next event or touch (useful in full mode too — the brain is still when the service is quiet).
- [ ] Same events, same paths, same timing as full mode: light mode must not drop, merge or delay impulses (real events
      only).
- [ ] Mode shown in the UI (small badge) so a slow panel is not mistaken for a quiet service.
- [ ] Document the parameter in `README.md` and the hardware grid in `docs/HARDWARE.md`.
- [ ] Measure on real devices (frame rate, GPU temperature after 1 h) and replace the estimates in `docs/HARDWARE.md`.

Possible follow-up (not now): pick light mode automatically from a short frame-time probe at start-up.

## Idea, after the light-mode measurements: native client (Rust)

Only if light mode still does not run well on the target devices (`docs/HARDWARE.md`). A native renderer (Rust + wgpu)
would draw the same pixels — bloom and fill rate cost the GPU the same in any language — but saves the browser's memory
(hundreds of MB vs tens), the compositor's extra full-screen copy per frame and garbage-collector stutters. Costs: a
second renderer and UI to keep in step with `atlas-events`, the browser stays on the panel anyway (Home Assistant,
photos), and on Android it would have to be its own screensaver (Dream service) instead of a Fully Kiosk URL. If done,
it is a separate, focused product (e.g. a native atlas screensaver for Linux ARM), not a second client of everything.
Tauri does not help: it is still a web view.
