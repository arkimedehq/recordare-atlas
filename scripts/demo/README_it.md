# Registrazione della demo

Come nasce `docs/media/atlas-demo.webp` (in cima al README, qui e in Recordare). Vale la regola dell'atlante: ogni
animazione è un evento reale. Una sessione scriptata gira contro un servizio Recordare reale e un LLM reale, la pagina
reale viene registrata, e l'unico montaggio è il taglio delle pause senza attività (con una breve dissolvenza).

- `setup.mjs` — una persona di fantasia (Emma; Giulia con `DEMO_LANG=it`; con consenso), un client demo e un token personale; tre conversazioni
  precedenti acquisite ed estratte davvero (3 chiamate LLM). Scrive id e token in `DEMO_STATE`.
- `record.mjs` — apre l'atlante su quella persona e lo registra (screencast di Chrome) mentre lei scrive due volte a
  un piccolo agente demo: ogni turno viene acquisito e se ne legge il contesto di memoria (`POST api/v1/context`);
  l'agente risponde con una propria chiamata LLM e una volta cerca i suoi episodi via MCP (`search_episodes`); il suo
  lavoro arriva all'atlante come span OpenTelemetry GenAI (`invoke_agent`, `chat`, `execute_tool`). L'ultima risposta
  chiude la conversazione → estrazione reale. Poi la notte: `POST api/v1/admin/memories/:id/consolidate` con
  `X-Recordare-Now` alle 03:30 della notte successiva (serve `ALLOW_CLOCK_OVERRIDE` sul servizio) → diari del giorno e
  del mese con la palette del sonno; nel frattempo la vista passa alla modalità solo cervello.
- `scenario.mjs` — la storia (persona, conversazioni precedenti, turni dal vivo, nome e prompt dell'agente) in inglese
  o in italiano, scelta da `DEMO_LANG`.
- `cut.mjs` — tiene i fotogrammi vicini agli eventi reali, li unisce, codifica il WebP animato (ffmpeg + `img2webp`).

Ogni registrazione richiede una persona nuova (di nuovo `setup.mjs`): una seconda notte sulla stessa non ha più nulla da
riassumere.

## Esecuzione

Servono il servizio in esecuzione, il dev server dell'atlante (con `ATLAS_INGEST_TOKEN`), Playwright (installato fuori
dal repository), ffmpeg e `img2webp` di libwebp. Le chiavi si leggono a runtime dall'ambiente o dai file `.env` elencati
in `DEMO_ENV`; nel repository non si scrive nulla di segreto.

```sh
npm i --prefix /tmp/atlas-demo playwright && npx --prefix /tmp/atlas-demo playwright install chromium
export DEMO_ENV=../recordare/service/.env,.env.local     # ADMIN_API_KEY, LLM_*, ATLAS_INGEST_TOKEN
export DEMO_STATE=/tmp/atlas-demo/state.json OUT_DIR=/tmp/atlas-demo/run
export AGENT_LLM_EXTRA_BODY='{"thinking":{"type":"disabled"}}'   # DeepSeek: niente ragionamento per le risposte dell'agente
export PLAYWRIGHT_MODULE=/tmp/atlas-demo/node_modules/playwright/index.mjs
node scripts/demo/setup.mjs
node scripts/demo/record.mjs          # HEADFUL=1 per guardare; CHROMIUM_PATH per un altro browser
node scripts/demo/cut.mjs $OUT_DIR docs/media/atlas-demo.webp
rm $DEMO_STATE                        # contiene il token della persona
```

Impostazioni: `RECORDARE_URL` (predefinito `http://localhost:8080`), `ATLAS_URL` (`http://127.0.0.1:5175`),
`DEMO_SIZE` (`1600x900`), `DEMO_LANG` (la lingua della pagina e della storia, `en` o `it`; predefinito `en`), `DIGESTS_BEFORE_ONLY_BRAIN` (3); per l'agente `AGENT_LLM_BASE_URL` / `AGENT_LLM_API_KEY` /
`AGENT_LLM_MODEL` (predefinito: i `LLM_*` del servizio); per il taglio `PRE` / `POST` (secondi tenuti attorno a ogni
evento, 0,4 / 1,5), `FADE` (0,3), `FPS` (12), `WIDTH` (1280), `QUALITY` (36), `KMAX` (un fotogramma chiave ogni 8).
Costo di una registrazione: circa 16 chiamate LLM di un modello economico (3 estrazioni iniziali, 2 risposte
dell'agente, 1 estrazione, ~10 diari). Persone, client e token della demo restano nel servizio come dati di prova.
