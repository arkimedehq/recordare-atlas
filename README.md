# Recordare Neural Atlas (M5b)

Live view of one owner's memory as a brain: regions are Recordare's components, neurons are episodes (placed by
meaning), synapses are real relations, and every impulse is a real event from the service's telemetry stream
(`GET api/v1/admin/telemetry/stream`) travelling the real path of that data. No simulated or decorative motion:
when the service is quiet, so is the brain (WORK_PLAN 5b.6). Metadata only — no message or memory content.

```sh
npm install
RECORDARE_URL=http://localhost:8080 RECORDARE_ADMIN_KEY=<admin key> npm run dev   # http://127.0.0.1:5175
```

With `RECORDARE_ADMIN_KEY` the local dev proxy adds the admin key itself, so the browser never holds it; without it,
type the key in the header. Stack: Vite + TypeScript + three.js (MIT), dependencies only.

**Only-brain mode (screensaver):** the "Solo cervello" button, the `B` key or `http://127.0.0.1:5175/#onlybrain` hide
everything but the brain (full screen, slow orbit of the camera — the view moves, the data never does on its own);
`Esc` or `B` to exit.
