# Recordare Atlas

<p align="center"><img src="docs/media/atlas-demo.webp" alt="Recordare Atlas: arrivano messaggi, un agente richiama ricordi e chiama il suo LLM, l'estrazione scrive nuovi ricordi, poi il consolidamento notturno nella palette del sonno" width="100%"></p>
<p align="center"><sub>Eventi reali da una sessione scriptata (pagina in inglese); tagliate le pause (<code>scripts/demo/</code>).</sub></p>

Copia italiana di `README.md` (il riferimento è la versione inglese).

Una vista dal vivo, a forma di cervello, di un'installazione di [Recordare](https://github.com/arkimedehq/recordare): le
regioni sono i componenti di Recordare, i neuroni sono gli episodi di una persona (disposti per significato), le
sinapsi sono relazioni reali, e ogni impulso è un evento reale dello stream di telemetria del servizio che percorre il
cammino reale di quel dato. Nessun movimento simulato o decorativo: quando il servizio è fermo, lo è anche il cervello.
Solo metadati — nessun contenuto di messaggi o ricordi arriva mai all'atlante.

**Opzionale.** Recordare funziona allo stesso modo senza (senza nessuno in ascolto, la sua telemetria non costa nulla).
L'atlante legge tre endpoint admin di sola lettura di Recordare e segue il contratto di eventi `atlas-events v1`
(Recordare `docs/ATLAS_EVENTS.md`); i due repository evolvono separatamente.

## Avvio

Sviluppo (hot reload, http://127.0.0.1:5175):

```sh
npm install
RECORDARE_URL=http://localhost:8080 RECORDARE_ADMIN_KEY=<chiave admin> npm run dev -- --host 127.0.0.1
```

Produzione (server Node senza dipendenze per l'app compilata):

```sh
npm ci && npm run build
RECORDARE_URL=http://recordare:8080 RECORDARE_ADMIN_KEY=<chiave admin> npm start     # ATLAS_HOST / ATLAS_PORT opzionali
docker build -t recordare-atlas . && docker run -p 127.0.0.1:5175:5175 -e RECORDARE_URL=… -e RECORDARE_ADMIN_KEY=… recordare-atlas
```

**Accesso.** Il server (e il proxy di sviluppo) tiene la chiave admin, così il browser non la ha mai — e inoltra
**solo** tre percorsi di sola lettura: l'elenco delle persone, lo snapshot di una persona e lo stream di telemetria; ogni
altra richiesta riceve 403, così la chiave non apre mai il resto dell'API admin (`server/allow.mjs`). Per impostazione
predefinita ascolta su 127.0.0.1: mettilo dietro la tua autenticazione prima di esporlo. Senza `RECORDARE_ADMIN_KEY` la
chiave si scrive nella pagina e la invia il browser. Stack: Vite + TypeScript + three.js (MIT, vedi
`THIRD_PARTY_NOTICES.md`); licenza AGPL-3.0-or-later.

## Agenti del client (OpenTelemetry)

Qualsiasi piattaforma di agenti strumentata con OpenTelemetry può mostrare il proprio lavoro sul cervello — agenti
invocati, le sue chiamate LLM, i suoi tool — accanto a quello di Recordare. L'atlante riceve le tracce su **`POST
/v1/traces`** (OTLP/HTTP, protobuf o JSON, gzip ammesso — vanno bene i default degli SDK; gRPC non è servito) con le
convenzioni semantiche GenAI (`gen_ai.*`, stato "Development": `invoke_agent` / `plan` → corteccia prefrontale, `chat` →
**area di Broca**, `execute_tool` / `embeddings` / `retrieval` → **corteccia motoria**). La ricezione richiede
`ATLAS_INGEST_TOKEN` (l'exporter invia `Authorization: Bearer <token>`); senza, il ricevitore è spento.

Gli agenti che girano in Docker sulla stessa macchina raggiungono il server di sviluppo come `host.docker.internal`:
avvialo con `ATLAS_ALLOWED_HOSTS=host.docker.internal` (altrimenti Vite rifiuta i nomi host sconosciuti).

```sh
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:5175/v1/traces
OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http/protobuf   # oppure http/json
OTEL_EXPORTER_OTLP_TRACES_HEADERS="Authorization=Bearer <ATLAS_INGEST_TOKEN>"
```

**Solo metadati, qualunque cosa invii il client:** uno span diventa un piccolo evento costruito da una allowlist
(operazione, agente, modello, provider, tool, token, durata, stato, persona); prompt, risposte, istruzioni di sistema,
argomenti e risultati dei tool non vengono mai letti (`server/otlp.mjs`). Non si salva nulla. Gli span arrivano
all'atlante quando finiscono (gli exporter li raggruppano), quindi ciascuno è mostrato una volta, all'arrivo, con la sua
durata reale nel log — mai allungato in una finta attesa dal vivo. Uno span muove il cervello solo quando porta la
persona Recordare sullo schermo (attributo `recordare.owner_id`); gli span di altre persone non sono mostrati, e quelli
senza persona (un utente della piattaforma senza memoria Recordare) compaiono solo nel log — mai disegnati sul cervello
di qualcun altro.

## Cosa si vede

**Lingua:** la pagina è in inglese o in italiano, inglese per impostazione predefinita (mai dedotta dal browser). Si
cambia con il selettore EN / IT nell'intestazione o con `?lang=it` / `?lang=en` nell'URL; la scelta resta in questo
browser. Il cambio riscrive subito ogni etichetta — comprese quelle delle regioni nel cervello e le righe di log già
mostrate — senza ricaricare la scena.

**Lavoro in corso:** una regione respira mentre lì gira lavoro reale — una chiamata LLM in volo (area di Wernicke,
l'LLM), gli embedding dei messaggi in arrivo (talamo), la lettura del contesto e gli embedding dei nuovi ricordi
(ippocampi), un richiamo (corteccia prefrontale), un consolidamento (corteccia, con la palette del sonno). Senza lavoro
in corso, il cervello è fermo.

**Contatori:** episodi, fatti · note e voci di terzi vengono dallo snapshot; chiamate LLM, token e richiami sono i
totali della persona da sempre (dal servizio), poi crescono con gli eventi dal vivo. **Segui l'attività** mostra una
persona alla volta: ciascuna resta sullo schermo almeno 20 s; dopo, l'attività di un'altra persona prende la vista anche
se quella mostrata è ancora al lavoro, così due persone attive si alternano (una lunga valutazione non nasconde mai
qualcuno che sta chattando).

**Rotazione:** un'orbita lenta del punto di vista, attiva per impostazione predefinita (il pulsante "Rotazione" o il
tasto `R`; ricordata in questo browser; spenta con movimento ridotto). **Veglia / sonno:** la palette vira verso una
notte di viola più profondo solo mentre il servizio consolida davvero (chiamate di diario e diari scritti), e si sveglia
a `consolidation.finished` o dopo un minuto di quiete — mai una ripetizione simulata.

**Modalità solo cervello (salvaschermo):** il pulsante "Solo cervello", il tasto `B` o
`http://127.0.0.1:5175/#onlybrain` nascondono tutto tranne il cervello (schermo intero, orbita lenta della camera — si
muove la vista, i dati mai da soli). Il cervello riempie lo schermo, centrato, a ogni angolo dell'orbita: un obiettivo
più lungo, e un'inquadratura (altezza e distanza) calcolata dal guscio per ogni lato che la camera attraversa; `Esc` o
`B` per uscire e tornare dolcemente alla vista precedente.

**Costo di disegno (GPU poco potenti, schermi sempre accesi).** Quando nulla si muove — nessun impulso in viaggio,
niente che stia ancora sfumando, la camera ferma — non si disegna nessun fotogramma: un servizio fermo lascia un
cervello fermo che non costa disegno (l'orbita lenta, se attiva, lo fa disegnare). `?mode=light` abbassa il costo di
ogni fotogramma per GPU deboli: pixel ratio 1, niente MSAA, bloom a metà risoluzione, al massimo 30 fotogrammi al
secondo; `&bloom=off` elimina del tutto il passaggio del bagliore (anche senza `mode=light`). Entrambi cambiano solo
quanto costa disegnare, mai cosa si mostra: stessi eventi, stessi cammini, stessi tempi. Un badge nell'intestazione dice
quando il disegno è alleggerito. Quale modalità per quale hardware: `docs/HARDWARE_it.md`.

## Sostieni il progetto

Recordare Atlas è libero e open source sotto AGPL-3.0. Se è utile a te o alla tua organizzazione, puoi sostenerne lo sviluppo tramite [GitHub Sponsors](https://github.com/sponsors/andreagenovese). La sponsorizzazione è del tutto volontaria: **non** modifica la licenza né concede diritti aggiuntivi — serve solo a sostenere la manutenzione e le nuove funzionalità.
