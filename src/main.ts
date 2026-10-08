// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright © 2026 Andrea Genovese

/**
 * Neural Atlas (M5b.3 / 5b.6). Connects with the admin key, loads one owner's memory as a network and turns each
 * real telemetry event into an impulse along the real path of that data. No simulated or decorative motion: when the
 * service is quiet, so is the brain.
 */
import './style.css';
import { atlas, owners, stream, type TelemetryEvent } from './api';
import { Brain, COLORS, type Region } from './brain';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const brain = new Brain($('stage'));
const keyInput = $<HTMLInputElement>('key'), ownerSelect = $<HTMLSelectElement>('owner'), status = $('status');
const counters = { ep: 0, fn: 0, llm: 0, tok: 0, rec: 0, cl: 0 };
let stopStream: (() => void) | null = null;
let refreshTimer: number | undefined;

function show(): void {
  $('s-ep').textContent = String(counters.ep); $('s-fn').textContent = String(counters.fn);
  $('s-llm').textContent = String(counters.llm); $('s-tok').textContent = counters.tok >= 1e6 ? `${(counters.tok / 1e6).toFixed(2)}M` : counters.tok >= 1000 ? `${(counters.tok / 1000).toFixed(1)}k` : String(counters.tok);
  $('s-rec').textContent = String(counters.rec); $('s-cl').textContent = String(counters.cl);
}
function log(cls: string, text: string, at?: string): void {
  const li = document.createElement('li');
  const time = document.createElement('time'); time.textContent = (at ? new Date(at) : new Date()).toTimeString().slice(0, 8);
  const span = document.createElement('span'); span.className = cls; span.textContent = text;
  li.append(time, span); $('events').prepend(li);
  while ($('events').children.length > 40) $('events').lastChild?.remove();
}
function setStatus(state: 'on' | 'off' | 'err', text: string): void { status.className = `status ${state}`; status.textContent = text; }
let streamState: 'on' | 'off' | 'err' = 'off';
/** Connection state plus who is on screen (in follow mode the person changes by itself, so the name matters). */
function showStatus(): void {
  const who = shownName ? ` · ${shownName}` : '';
  setStatus(streamState, streamState === 'on'
    ? (following ? `segue l'attività${who || ' · in attesa'}` : `in ascolto${who}`)
    : streamState === 'err' ? 'stream interrotto · riprovo' : 'stream chiuso · riprovo');
  $('who').textContent = shownName;
}

try { keyInput.value = sessionStorage.getItem('atlas-key') ?? ''; } catch { /* storage unavailable */ }
keyInput.addEventListener('change', () => void loadOwners());
void loadOwners(); // with a local proxy holding the key, no key is needed here

async function loadOwners(): Promise<void> {
  try {
    const list = await owners(keyInput.value);
    latestOwner = list[0]?.id ?? null; // the list is ordered by last activity
    const follow = Object.assign(document.createElement('option'), { value: FOLLOW, textContent: 'Segui l\'attività (live)' });
    ownerSelect.replaceChildren(follow, ...list.map((o) => Object.assign(document.createElement('option'), { value: o.id, textContent: `${o.name} · ${o.episodes} episodi` })));
    ownerSelect.disabled = false;
    try { if (keyInput.value) sessionStorage.setItem('atlas-key', keyInput.value); } catch { /* storage unavailable */ }
    setStatus('off', `${list.length} persone · scegli e collega`);
    // Opened without a running stream: follow the service at once (a reload never leaves the brain disconnected).
    if (!stopStream) { ownerSelect.value = FOLLOW; void connect(FOLLOW); }
  } catch (err) {
    setStatus('err', `chiave non valida o servizio non raggiungibile (${(err as Error).message})`);
  }
}

$<HTMLFormElement>('connect').addEventListener('submit', (ev) => {
  ev.preventDefault();
  void connect(ownerSelect.value);
});

/**
 * "Follow": listen to the whole service and show whichever owner is active (evaluation runs create new ones). One
 * owner at a time, each on screen at least STAY_MS: after that, activity of another owner takes the view even if the
 * shown one is still busy — two owners at work alternate instead of one hiding the other (a long evaluation run must
 * not hide a person chatting).
 */
const FOLLOW = '__follow__';
const STAY_MS = 20_000;
let current: string | null = null;
let shownSince = 0;
let following = false;
let latestOwner: string | null = null;
let shownName = '';

async function connect(choice: string): Promise<void> {
  if (!choice) { await loadOwners(); return; }
  stopStream?.();
  working.clear(); brain.idle();
  const follow = choice === FOLLOW;
  following = follow;
  current = follow ? latestOwner : choice; // follow starts from the person active most recently
  shownSince = Date.now();
  if (current) await refresh(current).catch(() => undefined);
  stopStream = stream(keyInput.value, follow ? null : choice, (e) => void route(e, follow), (s) => {
    streamState = s;
    showStatus();
  });
  log('idle', follow ? 'in ascolto di tutto il servizio: mostra la persona attiva' : 'collegato: ogni impulso da qui in poi è un evento reale del servizio');
}

/** Events of the shown owner animate the brain; in follow mode, activity of another owner switches the view to them. */
async function route(e: TelemetryEvent, follow: boolean): Promise<void> {
  const owner = typeof e.ownerId === 'string' ? e.ownerId : null;
  if (follow && owner && owner !== current && Date.now() - shownSince > STAY_MS) {
    current = owner;
    shownSince = Date.now();
    working.clear(); brain.idle(); // the previous person's jobs end out of sight
    log('idle', 'attività di un\'altra persona: cambio vista');
    await refresh(owner).catch(() => undefined);
  }
  if (current && owner && owner !== current) return;
  await onEvent(e, current ?? owner ?? '');
}

async function refresh(ownerId: string): Promise<void> {
  const a = await atlas(keyInput.value, ownerId);
  brain.load(a);
  shownName = a.owner.name;
  showStatus();
  counters.ep = a.episodes.filter((e) => !e.hidden && e.authorRole !== 'other' && e.authorRole !== 'tool').length;
  counters.cl = a.episodes.filter((e) => e.authorRole === 'other' || e.authorRole === 'tool').length;
  counters.fn = a.facts.filter((f) => f.status === 'current').length + a.notes.length;
  // Lifetime totals from the service; live events add to them until the next snapshot. (A service older than the
  // dashboard sends none: then the counters count from the connection.)
  if (a.totals) { counters.llm = a.totals.llmCalls; counters.tok = a.totals.inputTokens + a.totals.outputTokens; counters.rec = a.totals.recalls; }
  show();
}
/** New memories get their real place by meaning at the next snapshot (a few seconds after the writes stop). */
function scheduleRefresh(ownerId: string): void {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => void refresh(ownerId), 15_000);
}

const taskOf = (promptId: string) => promptId.split('.')[0] ?? promptId;

/** Where each kind of work happens: embeddings of incoming messages in the thalamus (ingest), the context read and the
 * embeddings of new memories in the hippocampi, a recall in the prefrontal cortex, a consolidation in the cortex. */
const WORK_REGIONS: Record<string, Region[]> = {
  'embed.messages': ['thalamus'], context: ['hippoL', 'hippoR'], 'embed.memories': ['hippoL', 'hippoR'],
  recall: ['prefrontal'], consolidation: ['cortex'],
};
const working = new Map<number, Region[]>();
function endWork(id: number): void {
  const regions = working.get(id);
  if (!regions) return;
  working.delete(id);
  regions.forEach((r) => brain.wait(r, -1));
}

// ---------- client agents (OpenTelemetry GenAI spans relayed by the atlas server, WORK_PLAN 5b.8) ----------
/** Spans reach the atlas when they end (the client's exporter batches them): each is shown once, on arrival, as what
 * it was — never stretched into a fake live wait. */
interface ClientSpan { op: string; owner: string | null; user: string | null; agent: string | null; model: string | null; tool: string | null; service: string | null;
  inputTokens?: number; outputTokens?: number; audioSeconds?: number; characters?: number; ms: number; status: string }
function onClientSpan(s: ClientSpan): void {
  const who = s.agent ?? s.service ?? 'agente';
  const took = s.ms >= 1000 ? `${(s.ms / 1000).toFixed(1)} s` : `${s.ms} ms`;
  const err = s.status === 'error' ? ' · errore' : '';
  // Only a span tied to the person on screen moves their brain. A span with no person (a user without Recordare
  // memory) is logged, never drawn on someone else's brain; another person's span is not shown at all.
  if (!s.owner) {
    // With a user but no person: the platform did not (yet) know the user's Recordare person when the span started.
    log('idle', `client · ${s.user ? 'utente senza persona Recordare nota' : 'nessun utente'} · ${who} · ${s.op} · ${took}${err}`);
    return;
  }
  if (s.owner !== current) return;
  if (s.op === 'transcription') {
    log('in', `client · ascolto · ${s.model ?? ''}${s.audioSeconds ? ` · ${s.audioSeconds.toFixed(1)} s di audio` : ''} · ${took}${err}`);
    void brain.fire('auditory', 'llm', COLORS.cyan, { size: 0.22 });
  } else if (s.op === 'speech') {
    log('in', `client · voce · ${s.model ?? ''}${s.characters ? ` · ${s.characters} caratteri` : ''} · ${took}${err}`);
    void brain.fire('broca', 'motor', COLORS.orange, { size: 0.22 });
  } else if (['invoke_agent', 'plan', 'invoke_workflow', 'create_agent'].includes(s.op)) {
    log('rec', `client · ${who} · ${s.op} · ${took}${err}`);
    void brain.fire('agent', 'prefrontal', COLORS.lime, { size: 0.22 });
  } else if (['chat', 'text_completion', 'generate_content'].includes(s.op)) {
    log('llm', `client · ${who} · LLM ${s.model ?? ''} · ${s.inputTokens ?? '?'}→${s.outputTokens ?? '?'} tok · ${took}${err}`);
    void brain.fire('prefrontal', 'broca', COLORS.orange, { size: 0.24 });
  } else if (['execute_tool', 'embeddings', 'retrieval'].includes(s.op)) {
    log('in', `client · ${who} · ${s.op === 'execute_tool' ? `tool ${s.tool ?? ''}` : s.op} · ${took}${err}`);
    void brain.fire('prefrontal', 'motor', COLORS.gold, { size: 0.2 });
  } else log('idle', `client · ${who} · ${s.op} · ${took}${err}`); // memory operations: Recordare shows its own side
}
function clientEvents(): void {
  const es = new EventSource('/atlas/client-stream');
  es.addEventListener('client.span', (ev) => { try { onClientSpan(JSON.parse((ev as MessageEvent<string>).data) as ClientSpan); } catch { /* malformed */ } });
}
clientEvents();

// ---------- awake / asleep: the sleep palette only while the service really consolidates ----------
let wakeTimer: number | undefined;
function asleep(on: boolean): void {
  brain.setSleep(on);
  const el = $('phase'); el.textContent = on ? 'sonno · consolidamento' : 'veglia'; el.classList.toggle('asleep', on);
  window.clearTimeout(wakeTimer);
  if (on) wakeTimer = window.setTimeout(() => asleep(false), 60_000); // no news for a minute: the night is over
}
const hippo = (id: string): Region => brain.regionOf(id) ?? 'hippoR';

async function onEvent(e: TelemetryEvent, ownerId: string): Promise<void> {
  switch (e.type) {
    case 'message.ingested': {
      const n = Math.min(Number(e['messages']) || 1, 6);
      log('in', `messaggi ricevuti · ${String(e['messages'])}`, e.at);
      for (let i = 0; i < n; i++) window.setTimeout(() => void brain.fire('entry', 'thalamus', COLORS.white, { size: 0.2 }), i * 120);
      break;
    }
    case 'work.started':
    case 'work.finished': {
      // Real work without an LLM call (embeddings, the context read, a recall, a consolidation): its regions breathe
      // from start to finish. Matched by id, so a lost "finished" cannot leave a region lit forever.
      const regions = WORK_REGIONS[String(e['op'])] ?? [];
      const id = Number(e['id']);
      if (e.type === 'work.started') {
        working.set(id, regions);
        regions.forEach((r) => brain.wait(r, 1));
        window.setTimeout(() => endWork(id), 120_000);
      } else endWork(id);
      if (e['op'] === 'consolidation') asleep(e.type === 'work.started');
      break;
    }
    case 'extraction.started':
      log('in', `estrazione · finestra di ${String(e['messages'])} messaggi`, e.at);
      break;
    case 'llm.started': {
      // The request leaves now; the LLM region stays lit until the answer comes back (llm.call).
      const task = String(e['task']);
      brain.wait('llm', 1);
      if (task === 'resolve') void brain.fire('hippoR', 'llm', COLORS.red, { size: 0.2 });
      else if (task === 'digest') { asleep(true); void brain.fire('hippoL', 'llm', COLORS.violet, { size: 0.2 }); }
      else void brain.fire('thalamus', 'llm', COLORS.amber, { size: 0.24 });
      log('llm', `LLM in corso · ${String(e['promptId'])}…`, e.at);
      break;
    }
    case 'llm.call': {
      const task = taskOf(String(e['promptId']));
      brain.wait('llm', -1);
      counters.llm++; counters.tok += (Number(e['inputTokens']) || 0) + (Number(e['outputTokens']) || 0); show();
      log('llm', `LLM ${String(e['promptId'])} · ${String(e['model'])} · ${String(e['inputTokens'])}→${String(e['outputTokens'])} tok · ${String(e['latencyMs'])} ms${e['status'] === 'ok' ? '' : ` · ${String(e['status'])}`}`, e.at);
      // The answer leaves the LLM: verdicts to the conflict region, diaries to the cortex; extraction answers become
      // memory.written impulses (llm → the exact neuron).
      if (task === 'resolve') void brain.fire('llm', 'acc', COLORS.red);
      else if (task === 'digest') void brain.fire('llm', 'cortex', COLORS.violet);
      break;
    }
    case 'memory.written': {
      const id = String(e['id']), table = String(e['table']);
      const claim = e['authorRole'] === 'other' || e['authorRole'] === 'tool';
      brain.addNeuron(id, e['kind'] as string | undefined, e['authorRole'] as string | undefined, table);
      if (table === 'episodes') {
        if (claim) { counters.cl++; log('warn', `affermazione di terzi isolata · ${String(e['kind'])}`, e.at); }
        else { counters.ep++; log('ep', `episodio · ${String(e['kind'])} · importanza ${String(e['importance'])}`, e.at); }
        void brain.fire('llm', claim ? 'acc' : hippo(id), claim ? COLORS.red : COLORS.cyan, { to: id });
      } else {
        counters.fn++; log('sleep', `${table === 'facts' ? 'fatto' : 'nota'} aggiornato`, e.at);
        void brain.fire('llm', 'cortex', COLORS.violet, { to: id });
      }
      show(); scheduleRefresh(ownerId);
      break;
    }
    case 'episode.linked':
      log('warn', e['relation'] === 'corrects' ? 'correzione collegata' : 'doppione nascosto', e.at);
      brain.link(String(e['from']), String(e['to']), e['relation'] === 'corrects' ? COLORS.red : 0x8899aa);
      scheduleRefresh(ownerId);
      break;
    case 'recall.served': {
      counters.rec++; show();
      const ids = (e['episodeIds'] as string[] | undefined) ?? [], claims = (e['claimIds'] as string[] | undefined) ?? [];
      log('rec', `${String(e['tool'])}${e['mode'] ? ` (${String(e['mode'])})` : ''} · ${ids.length} episodi${claims.length ? ` · ${claims.length} voci di terzi` : ''}${Number(e['digests']) ? ` · ${String(e['digests'])} diari` : ''}${Number(e['facts']) ? ` · ${String(e['facts'])} fatti` : ''}`, e.at);
      await brain.fire('agent', 'prefrontal', COLORS.lime);
      const reach: Array<Promise<void>> = [];
      ids.slice(0, 20).forEach((id) => reach.push(brain.fire('prefrontal', hippo(id), COLORS.lime, { to: id, size: 0.18 })));
      claims.slice(0, 10).forEach((id) => reach.push(brain.fire('prefrontal', 'acc', COLORS.red, { to: id, size: 0.18 })));
      if (Number(e['digests']) || Number(e['facts']) || Number(e['notes'])) reach.push(brain.fire('prefrontal', 'cortex', COLORS.violet, { size: 0.18 }));
      await Promise.all(reach);
      void brain.fire('prefrontal', 'agent', COLORS.lime);
      break;
    }
    case 'digest.written':
      asleep(true);
      log('sleep', `diario ${e['level'] === 'month' ? 'del mese' : 'del giorno'} · ${String(e['period'])}`, e.at);
      void brain.fire('hippoR', 'cortex', COLORS.violet);
      scheduleRefresh(ownerId);
      break;
    case 'consolidation.finished':
      asleep(false);
      log('sleep', `consolidamento · ${String(e['days'])} giorni, ${String(e['months'])} mesi, ${String(e['llmCalls'])} chiamate`, e.at);
      break;
    case 'episode.forgotten':
      brain.forget((e['ids'] as string[] | undefined) ?? []);
      log('warn', `dimenticati ${((e['ids'] as string[] | undefined) ?? []).length} episodi`, e.at);
      break;
    case 'extraction.finished':
      if (e['status'] !== 'done') log('warn', `estrazione ${String(e['status'])}`, e.at);
      break;
  }
}

// ---------- rotation (normal view: on by default, remembered; only-brain view: always on) ----------
let rotate = true;
try { rotate = localStorage.getItem('atlas-rotate') !== 'off'; } catch { /* storage unavailable */ }
function setRotate(on: boolean): void {
  rotate = on;
  $('rotate').setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('atlas-rotate', on ? 'on' : 'off'); } catch { /* storage unavailable */ }
  if (!document.body.classList.contains('only-brain')) brain.setOrbit(on);
}
setRotate(rotate);
$('rotate').addEventListener('click', () => setRotate(!rotate));

// ---------- only-brain mode (screensaver) ----------
let pointerTimer: number | undefined;
function setOnlyBrain(on: boolean): void {
  document.body.classList.toggle('only-brain', on);
  brain.setOrbit(on || rotate);
  brain.setFill(on);
  if (on) { document.documentElement.requestFullscreen?.().catch(() => undefined); history.replaceState(null, '', '#onlybrain'); }
  else { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); history.replaceState(null, '', location.pathname); }
}
$('only').addEventListener('click', () => setOnlyBrain(true));
$('exit-only').addEventListener('click', () => setOnlyBrain(false));
addEventListener('keydown', (ev) => {
  if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
  if (ev.key === 'Escape') setOnlyBrain(false);
  if (ev.key === 'b' || ev.key === 'B') setOnlyBrain(!document.body.classList.contains('only-brain'));
  if (ev.key === 'r' || ev.key === 'R') setRotate(!rotate);
});
addEventListener('mousemove', () => {
  if (!document.body.classList.contains('only-brain')) return;
  document.body.classList.add('pointer');
  window.clearTimeout(pointerTimer);
  pointerTimer = window.setTimeout(() => document.body.classList.remove('pointer'), 2500);
});
if (location.hash === '#onlybrain') setOnlyBrain(true);
addEventListener('hashchange', () => setOnlyBrain(location.hash === '#onlybrain'));
