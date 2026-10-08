# Demo recording

How `docs/media/atlas-demo.webp` (top of the README, here and in Recordare) is made. The atlas's rule holds: every
animation is a real event. A scripted session runs against a real Recordare service and a real LLM, the real page is
recorded, and the only edit is cutting idle gaps (with a short cross-fade).

- `setup.mjs` — a fictional person (Emma; Giulia with `DEMO_LANG=it`; with consent), a demo client and a personal token; three earlier
  conversations ingested and really extracted (3 LLM calls). Writes ids and token to `DEMO_STATE`.
- `record.mjs` — opens the atlas on that person and records it (Chrome screencast) while she writes twice to a small
  demo agent: each turn is ingested and its memory context read (`POST api/v1/context`); the agent answers with its own
  LLM call and once searches her episodes over MCP (`search_episodes`); its work reaches the atlas as OpenTelemetry
  GenAI spans (`invoke_agent`, `chat`, `execute_tool`). The last reply ends the conversation → real extraction. Then
  the night: `POST api/v1/admin/owners/:id/consolidate` with `X-Recordare-Now` at 03:30 of the coming night (needs
  `ALLOW_CLOCK_OVERRIDE` on the service) → day and month digests in the sleep palette; the view switches to only-brain
  mode during it.
- `scenario.mjs` — the story (person, earlier conversations, live turns, the agent's name and prompt) in English or
  Italian, picked by `DEMO_LANG`.
- `cut.mjs` — keeps the frames near real events, joins them, encodes the animated WebP (ffmpeg + `img2webp`).

Each recording needs a new person (`setup.mjs` again): a second night on the same one has nothing left to digest.

## Run

Needs a running service, the atlas dev server (with `ATLAS_INGEST_TOKEN`), Playwright (installed outside the repo),
ffmpeg and libwebp's `img2webp`. Keys are read at run time from the environment or from the `.env` files listed in
`DEMO_ENV`; nothing secret is written to the repository.

```sh
npm i --prefix /tmp/atlas-demo playwright && npx --prefix /tmp/atlas-demo playwright install chromium
export DEMO_ENV=../recordare/service/.env,.env.local     # ADMIN_API_KEY, LLM_*, ATLAS_INGEST_TOKEN
export DEMO_STATE=/tmp/atlas-demo/state.json OUT_DIR=/tmp/atlas-demo/run
export AGENT_LLM_EXTRA_BODY='{"thinking":{"type":"disabled"}}'   # DeepSeek: no reasoning for the agent's replies
export PLAYWRIGHT_MODULE=/tmp/atlas-demo/node_modules/playwright/index.mjs
node scripts/demo/setup.mjs
node scripts/demo/record.mjs          # HEADFUL=1 to watch; CHROMIUM_PATH for another browser
node scripts/demo/cut.mjs $OUT_DIR docs/media/atlas-demo.webp
rm $DEMO_STATE                        # it holds the person's token
```

Settings: `RECORDARE_URL` (default `http://localhost:8080`), `ATLAS_URL` (`http://127.0.0.1:5175`), `DEMO_SIZE`
(`1600x900`), `DEMO_LANG` (the page's and the story's language, `en` or `it`; default `en`), `DIGESTS_BEFORE_ONLY_BRAIN` (3); for the
agent `AGENT_LLM_BASE_URL` / `AGENT_LLM_API_KEY` /
`AGENT_LLM_MODEL` (default: the service's `LLM_*`); for the cut `PRE` / `POST` (seconds kept around each event, 0.4 /
1.5), `FADE` (0.3), `FPS` (12), `WIDTH` (1280), `QUALITY` (36), `KMAX` (key frame every 8 frames). Cost of a
recording: about 16 LLM calls of a cheap model (3 seed extractions, 2 agent replies, 1 extraction, ~10 digests).
The demo people, clients and tokens stay in the service as test data.
