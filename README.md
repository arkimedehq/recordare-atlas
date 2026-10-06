# Recordare Atlas

A live brain view of a [Recordare](https://github.com/arkimedehq/recordare) installation: regions are Recordare's
components, neurons are a person's episodes (placed by meaning), synapses are real relations, and every impulse is a
real event from the service's telemetry stream travelling the real path of that data. No simulated or decorative
motion: when the service is quiet, so is the brain. Metadata only — no message or memory content ever reaches the
atlas.

**Optional.** Recordare works the same without it (with no listener, its telemetry costs nothing). The atlas reads
three read-only admin endpoints of Recordare and follows the event contract `atlas-events v1`
(Recordare `docs/ATLAS_EVENTS.md`); the two repositories evolve separately.

## Run

Development (hot reload, http://127.0.0.1:5175):

```sh
npm install
RECORDARE_URL=http://localhost:8080 RECORDARE_ADMIN_KEY=<admin key> npm run dev -- --host 127.0.0.1
```

Production (zero-dependency Node server for the built app):

```sh
npm ci && npm run build
RECORDARE_URL=http://recordare:8080 RECORDARE_ADMIN_KEY=<admin key> npm start     # ATLAS_HOST / ATLAS_PORT optional
docker build -t recordare-atlas . && docker run -p 127.0.0.1:5175:5175 -e RECORDARE_URL=… -e RECORDARE_ADMIN_KEY=… recordare-atlas
```

**Access.** The server (and the dev proxy) holds the admin key, so the browser never does — and relays **only** three
read-only paths: the people list, one person's snapshot and the telemetry stream; every other request gets 403, so the
key never opens the rest of the admin API (`server/allow.mjs`). It binds to 127.0.0.1 by default: put it behind your
own authentication before exposing it. Without `RECORDARE_ADMIN_KEY` the key is typed in the page and sent by the
browser. Stack: Vite + TypeScript + three.js (MIT, see `THIRD_PARTY_NOTICES.md`); licence AGPL-3.0-or-later.

## What you see

**Work in progress:** a region breathes while real work runs there — an LLM call in flight (Wernicke's area, the
LLM), embeddings of incoming messages (thalamus), the context read and the embeddings of new memories (hippocampi), a
recall (prefrontal cortex), a consolidation (cortex, with the sleep palette). With no work running, the brain is still.

**Counters:** episodes, facts · notes and claims come from the snapshot; LLM calls, tokens and recalls are the
person's lifetime totals (from the service), then grow with live events. **Follow mode** shows one person at a time:
it stays on the shown person while they are active and moves to another only after 20 s without their events.

**Rotation:** a slow orbit of the point of view, on by default (the "Rotazione" button or the `R` key; remembered in
this browser; off with reduced motion). **Awake / asleep:** the palette turns to a deeper violet night only while the
service really consolidates (digest calls and digests written), and wakes at `consolidation.finished` or after a quiet
minute — never a simulated replay.

**Only-brain mode (screensaver):** the "Solo cervello" button, the `B` key or `http://127.0.0.1:5175/#onlybrain` hide
everything but the brain (full screen, slow orbit of the camera — the view moves, the data never does on its own);
`Esc` or `B` to exit.
