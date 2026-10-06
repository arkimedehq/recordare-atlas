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
  $('s-llm').textContent = String(counters.llm); $('s-tok').textContent = counters.tok >= 1000 ? `${(counters.tok / 1000).toFixed(1)}k` : String(counters.tok);
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

try { keyInput.value = sessionStorage.getItem('atlas-key') ?? ''; } catch { /* storage unavailable */ }
keyInput.addEventListener('change', () => void loadOwners());
void loadOwners(); // with a local proxy holding the key, no key is needed here

async function loadOwners(): Promise<void> {
  try {
    const list = await owners(keyInput.value);
    ownerSelect.replaceChildren(...list.map((o) => Object.assign(document.createElement('option'), { value: o.id, textContent: `${o.name} · ${o.episodes} episodi` })));
    ownerSelect.disabled = list.length === 0;
    try { if (keyInput.value) sessionStorage.setItem('atlas-key', keyInput.value); } catch { /* storage unavailable */ }
    setStatus('off', `${list.length} persone · scegli e collega`);
  } catch (err) {
    setStatus('err', `chiave non valida o servizio non raggiungibile (${(err as Error).message})`);
  }
}

$<HTMLFormElement>('connect').addEventListener('submit', (ev) => {
  ev.preventDefault();
  void connect(ownerSelect.value);
});

async function connect(ownerId: string): Promise<void> {
  if (!ownerId) { await loadOwners(); return; }
  stopStream?.();
  await refresh(ownerId);
  stopStream = stream(keyInput.value, ownerId, (e) => void onEvent(e, ownerId), (s) =>
    setStatus(s, s === 'on' ? 'in ascolto · eventi reali' : s === 'err' ? 'stream interrotto · riprovo' : 'stream chiuso · riprovo'));
  log('idle', 'collegato: ogni impulso da qui in poi è un evento reale del servizio');
}

async function refresh(ownerId: string): Promise<void> {
  const a = await atlas(keyInput.value, ownerId);
  brain.load(a);
  counters.ep = a.episodes.filter((e) => !e.hidden && e.authorRole !== 'other' && e.authorRole !== 'tool').length;
  counters.cl = a.episodes.filter((e) => e.authorRole === 'other' || e.authorRole === 'tool').length;
  counters.fn = a.facts.filter((f) => f.status === 'current').length + a.notes.length;
  show();
}
/** New memories get their real place by meaning at the next snapshot (a few seconds after the writes stop). */
function scheduleRefresh(ownerId: string): void {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => void refresh(ownerId), 15_000);
}

const taskOf = (promptId: string) => promptId.split('.')[0] ?? promptId;
const hippo = (id: string): Region => brain.regionOf(id) ?? 'hippoR';

async function onEvent(e: TelemetryEvent, ownerId: string): Promise<void> {
  switch (e.type) {
    case 'message.ingested': {
      const n = Math.min(Number(e['messages']) || 1, 6);
      log('in', `messaggi ricevuti · ${String(e['messages'])}`, e.at);
      for (let i = 0; i < n; i++) window.setTimeout(() => void brain.fire('entry', 'thalamus', COLORS.white, { size: 0.2 }), i * 120);
      break;
    }
    case 'extraction.started':
      log('in', `estrazione · finestra di ${String(e['messages'])} messaggi`, e.at);
      break;
    case 'llm.call': {
      const task = taskOf(String(e['promptId']));
      counters.llm++; counters.tok += (Number(e['inputTokens']) || 0) + (Number(e['outputTokens']) || 0); show();
      log('llm', `LLM ${String(e['promptId'])} · ${String(e['model'])} · ${String(e['inputTokens'])}→${String(e['outputTokens'])} tok · ${String(e['latencyMs'])} ms${e['status'] === 'ok' ? '' : ` · ${String(e['status'])}`}`, e.at);
      if (task === 'resolve') void brain.fire('hippoR', 'acc', COLORS.red);
      else if (task === 'digest') void brain.fire('hippoL', 'cortex', COLORS.violet);
      else void brain.fire('thalamus', 'llm', COLORS.amber, { size: 0.24 + Math.min(0.3, (Number(e['inputTokens']) || 0) / 20000) });
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
      log('sleep', `diario ${e['level'] === 'month' ? 'del mese' : 'del giorno'} · ${String(e['period'])}`, e.at);
      void brain.fire('hippoR', 'cortex', COLORS.violet);
      scheduleRefresh(ownerId);
      break;
    case 'consolidation.finished':
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
