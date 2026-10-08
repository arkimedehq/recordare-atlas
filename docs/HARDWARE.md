# Recordare Atlas — rendering modes and minimum hardware

Italian copy: `HARDWARE_it.md`.

> **Estimates, not measurements.** The grid below is reasoned from the renderer's cost and the GPUs' class; nothing has
> been benchmarked yet. Replace each cell with measured values (frame rate, GPU temperature after 1 h) as devices are
> tested — see `docs/TODO.md`.

## Modes

| | **Full** (default, built) | **Light** (`?mode=light`, planned — `docs/TODO.md`) |
|---|---|---|
| Pixel ratio | `min(devicePixelRatio, 2)` | 1 |
| Antialias | MSAA | off |
| Bloom | `UnrealBloomPass`, full resolution | half resolution (or off with `&bloom=off`) |
| Frame rate | uncapped (display refresh) | capped at 30 fps |
| When quiet | keeps drawing | planned: render on demand (both modes) |
| What is shown | every real event | the same — only the drawing cost changes |

Both modes need **WebGL 2** (three.js ≥ r163 has no WebGL 1 renderer) and a recent Chromium / Firefox / Safari.

## Hardware grid

✅ smooth · ⚠️ works, with drops when the brain is busy or at high resolution · ❌ not recommended

| Hardware (GPU) | Full @ 1080p | Full @ 2K–4K | Light @ 1080p / native | Notes |
|---|---|---|---|---|
| x86 mini PC, Intel N100 / N150 (UHD, 24 EU) or better | ✅ | ⚠️ | ✅ | Recommended for a wall panel: Linux + Chromium kiosk |
| Raspberry Pi 5 (VideoCore VII) | ⚠️ | ❌ | ✅ | Keep the display at 1080p or below |
| Rockchip RK3588 (Mali-G610 MP4) | ✅ | ⚠️ | ✅ | Android or Linux (Panthor) |
| Rockchip RK3576 (Mali-G52 MC3) | ⚠️ | ❌ | ✅ | Typical 2K tablets: use light mode |
| Entry tablets — RK3566, Helio G-class, Allwinner (Mali-G52 MC2 or less) | ❌ | ❌ | ⚠️ | Light mode with `&bloom=off` |
| Desktop / laptop with discrete or recent integrated GPU | ✅ | ✅ | ✅ | |

**Minimum hardware per mode (estimate):**

- **Full:** Intel N100-class iGPU or Mali-G610-class GPU, display at 1080p.
- **Light:** Mali-G52 MC3-class GPU (RK3576), any resolution (pixel ratio 1).
- **Below that:** light mode without bloom, best effort.

## Always-on panels

- IPS rather than OLED: the brain has a dark background and a fixed shape, which burns into OLED.
- Tablets on permanent charge: use a charge limit / bypass mode or cycle the charger (e.g. a smart plug), otherwise the
  battery swells.
- The panel only runs the browser; the atlas server (which holds the admin key) can run elsewhere on the LAN. LAN binding
  is opt-in and the server has no authentication of its own — keep it on a trusted network or behind your own auth.
