# Recordare Atlas — TODO

Italian copy: `TODO_it.md`.

## Light mode (low-power GPUs, wall panels)

**Why.** The atlas is meant to run all day on wall panels and tablets (screensaver, kiosk). Today the renderer always
pays the full cost (`src/brain.ts`): MSAA antialias, pixel ratio up to 2, `UnrealBloomPass` at full resolution and an
uncapped `requestAnimationFrame` loop that keeps drawing even when the service is quiet. On weak mobile GPUs (e.g.
Mali-G52 on RK3576 / RK3566 tablets) with high-DPI screens this means low frame rate, heat and battery wear.

**What.** A rendering mode, chosen from the URL (`?mode=light`), that changes only how much drawing costs — never what is
shown. **Built** (2026-10-08), except the measurements:

- [x] Pixel ratio 1 (instead of `min(devicePixelRatio, 2)`); glow points are sized from it, so they stay consistent.
- [x] No MSAA (`antialias: false`).
- [x] Bloom at half resolution; `bloom=off` drops it entirely (in any mode).
- [x] Frame cap at 30 fps.
- [x] Render on demand when idle (both modes): no impulse travelling, nothing fading, camera still → no frame until the
      next event or touch. With the slow orbit on, the camera moves, so frames keep coming (30 fps in light mode).
- [x] Same events, same paths, same timing as full mode: all motion is timed in seconds (the orbit too, now), so a lower
      frame rate never slows or drops impulses.
- [x] Mode shown in the UI (badge in the header) so a slow panel is not mistaken for a quiet service.
- [x] Parameters in `README.md`, the hardware grid in `docs/HARDWARE.md`.
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
