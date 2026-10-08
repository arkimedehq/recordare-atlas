# Recordare Atlas

<p align="center"><img src="docs/media/atlas-demo.webp" alt="Recordare Atlas: messages arrive, an agent recalls memories and calls its LLM, extraction writes new memories, then the nightly consolidation in the sleep palette" width="100%"></p>
<p align="center"><sub>Real events from a scripted session; idle gaps cut (<code>scripts/demo/</code>).</sub></p>

A live brain view of a [Recordare](https://github.com/arkimedehq/recordare) installation: regions are Recordare's
components, neurons are a person's episodes (placed by meaning), synapses are real relations, and every impulse is a
real event from the service's telemetry stream travelling the real path of that data. No simulated or decorative
motion: when the service is quiet, so is the brain. Metadata only — no message or memory content ever reaches the
atlas. Italian copy: [`README_it.md`](README_it.md).

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

## Client agents (OpenTelemetry)

Any agent platform instrumented with OpenTelemetry can show its own work on the brain — agents invoked, its LLM
calls, its tools — next to Recordare's. The atlas receives traces at **`POST /v1/traces`** (OTLP/HTTP, protobuf or
JSON, gzip allowed — the SDK defaults work; gRPC is not served) with the GenAI semantic conventions (`gen_ai.*`, status
"Development": `invoke_agent` / `plan` → prefrontal cortex, `chat` → **Broca's area**, `execute_tool` / `embeddings` /
`retrieval` → **motor cortex**). Receiving needs `ATLAS_INGEST_TOKEN` (the exporter sends `Authorization: Bearer
<token>`); without it the receiver is off.

Agents running in Docker on the same machine reach the dev server as `host.docker.internal`: start it with
`ATLAS_ALLOWED_HOSTS=host.docker.internal` (Vite refuses unknown host names otherwise).

```sh
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:5175/v1/traces
OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http/protobuf   # or http/json
OTEL_EXPORTER_OTLP_TRACES_HEADERS="Authorization=Bearer <ATLAS_INGEST_TOKEN>"
```

**Metadata only, whatever the client sends:** a span becomes one small event built from an allowlist (operation,
agent, model, provider, tool, tokens, duration, status, person); prompts, replies, system instructions, tool arguments
and results are never read (`server/otlp.mjs`). Nothing is stored. Spans reach the atlas when they end (exporters
batch them), so each is shown once, on arrival, with its real duration in the log — never stretched into a fake live
wait. A span moves the brain only when it carries the Recordare person on screen (attribute `recordare.owner_id`); spans
of other people are not shown, and spans with no person (a user of the platform without Recordare memory) only appear
in the log — never drawn on someone else's brain.

## What you see

**Language:** the page is in English or Italian, English by default (never guessed from the browser). Switch with the
EN / IT toggle in the header or `?lang=it` / `?lang=en` in the URL; the choice is remembered in this browser. Switching
rewrites every label at once — region labels in the brain and log lines already shown included — without reloading
the scene.

**Work in progress:** a region breathes while real work runs there — an LLM call in flight (Wernicke's area, the
LLM), embeddings of incoming messages (thalamus), the context read and the embeddings of new memories (hippocampi), a
recall (prefrontal cortex), a consolidation (cortex, with the sleep palette). With no work running, the brain is still.

**Counters:** episodes, facts · notes and claims come from the snapshot; LLM calls, tokens and recalls are the
person's lifetime totals (from the service), then grow with live events. **Follow mode** shows one person at a time:
each person stays on screen at least 20 s; after that, activity of another person takes the view even if the shown one
is still busy, so two people at work alternate (a long evaluation never hides someone chatting).

**Rotation:** a slow orbit of the point of view, on by default (the "Rotation" button or the `R` key; remembered in
this browser; off with reduced motion). **Awake / asleep:** the palette turns to a deeper violet night only while the
service really consolidates (digest calls and digests written), and wakes at `consolidation.finished` or after a quiet
minute — never a simulated replay.

**Only-brain mode (screensaver):** the "Only brain" button, the `B` key or `http://127.0.0.1:5175/#onlybrain` hide
everything but the brain (full screen, slow orbit of the camera — the view moves, the data never does on its own). The
brain fills the screen, centred, at every angle of the orbit: a longer lens, and a framing (height and distance) computed
from the shell for each side the camera passes; `Esc` or `B` to exit and glide back to the previous view.

**Drawing cost (low-power GPUs, always-on screens).** When nothing moves — no impulse travelling, nothing still fading,
the camera still — no frame is drawn: a quiet service leaves a still brain that costs no drawing (the slow orbit, when
on, keeps it drawing). `?mode=light` lowers the cost of each frame for weak GPUs: pixel ratio 1, no MSAA, bloom at half
resolution, at most 30 frames per second; `&bloom=off` drops the glow pass entirely (also without `mode=light`). Both
change only how much drawing costs, never what is shown: same events, same paths, same timing. A badge in the header
says when the drawing is lightened. Which mode suits which hardware: `docs/HARDWARE.md`.
