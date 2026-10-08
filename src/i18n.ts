// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright © 2026 Andrea Genovese

/**
 * The page's own tiny i18n: English (the default, always — never guessed from the browser) and Italian. The choice
 * comes from `?lang=en|it` or the header toggle and is remembered in this browser. Static text in index.html carries
 * `data-i18n*` attributes; dynamic text is re-rendered by the listeners registered with `onLangChange`.
 */

export type Lang = 'en' | 'it';
export const LANGS: readonly Lang[] = ['en', 'it'];

const en = {
  // page
  'page.stage': "Recordare's brain",
  'page.exitOnly': 'Exit · Esc',
  'page.lang': 'Language',
  // header
  'status.notConnected': 'not connected',
  'status.following': 'following activity{who}',
  'status.waiting': ' · waiting',
  'status.listening': 'listening{who}',
  'status.interrupted': 'stream interrupted · retrying',
  'status.closed': 'stream closed · retrying',
  'status.people': '{n} people · choose and connect',
  'status.badKey': 'invalid key or service unreachable ({error})',
  'ctl.key': 'Admin key',
  'ctl.keyPlaceholder': '(from the local proxy)',
  'ctl.person': 'Person',
  'ctl.follow': 'Follow activity (live)',
  'ctl.ownerItem': '{name} · {n} episodes',
  'ctl.connect': 'Connect',
  'ctl.rotate': 'Rotation',
  'ctl.rotateTitle': 'Slow rotation of the point of view (R key)',
  'ctl.onlyBrain': 'Only brain',
  'ctl.onlyBrainTitle': 'Only the brain, full screen (B key)',
  'phase.awake': 'awake',
  'phase.asleep': 'asleep · consolidating',
  'phase.title': 'Asleep: the service is consolidating (nightly digests)',
  'render.light': 'light',
  'render.lightNoBloom': 'light · no bloom',
  'render.noBloom': 'no bloom',
  'render.title': 'Lightened rendering (mode / bloom in the URL): changes how much drawing costs, not what is shown',
  // legend
  'legend.aria': 'Regions',
  'legend.title': 'Regions · components',
  'legend.thalamus': 'Thalamus',
  'legend.thalamusRole': 'message ingest',
  'legend.llm': "LLM · Wernicke's area",
  'legend.llmRole': 'model calls (real tokens)',
  'legend.broca': "Broca's area",
  'legend.brocaRole': "client agents' LLM",
  'legend.motor': 'Motor cortex',
  'legend.motorRole': "client agents' tools",
  'legend.hippo': 'Hippocampus',
  'legend.hippoRole': 'episodes: each neuron is a memory',
  'legend.acc': 'Cingulate',
  'legend.accRole': 'conflicts and third-party claims',
  'legend.cortex': 'Neocortex',
  'legend.cortexRole': 'facts, notes, digests',
  'legend.prefrontal': 'Prefrontal',
  'legend.prefrontalRole': "agents' recalls",
  'legend.note': 'Every impulse is a real event of the service. Without events the brain stays still.',
  // brain labels (anatomy · role)
  'region.thalamus': 'Thalamus',
  'region.llm': "Wernicke's area",
  'region.hippo': 'Hippocampus',
  'region.acc': 'Anterior cingulate',
  'region.cortex': 'Neocortex',
  'region.prefrontal': 'Prefrontal cortex',
  'region.broca': "Broca's area",
  'region.motor': 'Motor cortex',
  'region.auditory': 'Auditory cortex',
  'role.thalamus': 'ingest',
  'role.llm': 'LLM',
  'role.hippo': 'episodes',
  'role.acc': 'third parties',
  'role.cortex': 'facts',
  'role.prefrontal': 'recall',
  'role.broca': 'client LLM',
  'role.motor': 'client tools and voice',
  'role.auditory': 'listening',
  // event log
  'log.aria': 'Real events',
  'log.title': 'Events · live',
  'log.followAll': 'listening to the whole service: showing the active person',
  'log.connected': 'connected: from now on every impulse is a real event of the service',
  'log.switch': "another person's activity: switching view",
  'log.agent': 'agent',
  'log.error': ' · error',
  'log.userNoPerson': 'user with no known Recordare person',
  'log.noUser': 'no user',
  'log.hearing': 'listening',
  'log.audio': ' · {s} s of audio',
  'log.voice': 'voice',
  'log.chars': ' · {n} characters',
  'log.messages': 'messages received · {n}',
  'log.extraction': 'extraction · window of {n} messages',
  'log.extractionStatus': 'extraction {status}',
  'log.llmRunning': 'LLM running · {prompt}…',
  'log.claim': 'third-party claim isolated · {kind}',
  'log.episode': 'episode · {kind} · importance {n}',
  'log.fact': 'fact updated',
  'log.note': 'note updated',
  'log.correction': 'correction linked',
  'log.duplicate': 'duplicate hidden',
  'log.recallEpisodes': ' · {n} episodes',
  'log.recallClaims': ' · {n} third-party claims',
  'log.recallDigests': ' · {n} digests',
  'log.recallFacts': ' · {n} facts',
  'log.digestMonth': 'month digest · {period}',
  'log.digestDay': 'day digest · {period}',
  'log.consolidation': 'consolidation · {days} days, {months} months, {calls} calls',
  'log.forgotten': '{n} episodes forgotten',
  // counters
  'stat.episodes': 'Episodes',
  'stat.factsNotes': 'Facts · notes',
  'stat.llm': 'LLM calls',
  'stat.tokens': 'Tokens',
  'stat.recalls': 'Recalls',
  'stat.claims': 'Third-party claims',
} satisfies Record<string, string>;

export type Key = keyof typeof en;

/** Same keys as `en`: a missing or extra key fails the typecheck. */
const it: Record<Key, string> = {
  'page.stage': 'Cervello di Recordare',
  'page.exitOnly': 'Esci · Esc',
  'page.lang': 'Lingua',
  'status.notConnected': 'non collegato',
  'status.following': "segue l'attività{who}",
  'status.waiting': ' · in attesa',
  'status.listening': 'in ascolto{who}',
  'status.interrupted': 'stream interrotto · riprovo',
  'status.closed': 'stream chiuso · riprovo',
  'status.people': '{n} persone · scegli e collega',
  'status.badKey': 'chiave non valida o servizio non raggiungibile ({error})',
  'ctl.key': 'Chiave admin',
  'ctl.keyPlaceholder': '(dal proxy locale)',
  'ctl.person': 'Persona',
  'ctl.follow': "Segui l'attività (live)",
  'ctl.ownerItem': '{name} · {n} episodi',
  'ctl.connect': 'Collega',
  'ctl.rotate': 'Rotazione',
  'ctl.rotateTitle': 'Rotazione lenta del punto di vista (tasto R)',
  'ctl.onlyBrain': 'Solo cervello',
  'ctl.onlyBrainTitle': 'Solo il cervello, a schermo intero (tasto B)',
  'phase.awake': 'veglia',
  'phase.asleep': 'sonno · consolidamento',
  'phase.title': 'Sonno: il servizio sta consolidando (diari della notte)',
  'render.light': 'leggera',
  'render.lightNoBloom': 'leggera · senza bloom',
  'render.noBloom': 'senza bloom',
  'render.title': "Rendering alleggerito (parametri mode / bloom nell'URL): cambia quanto costa disegnare, non cosa viene mostrato",
  'legend.aria': 'Regioni',
  'legend.title': 'Regioni · componenti',
  'legend.thalamus': 'Talamo',
  'legend.thalamusRole': 'ingest dei messaggi',
  'legend.llm': 'LLM · area di Wernicke',
  'legend.llmRole': 'chiamate al modello (token reali)',
  'legend.broca': 'Area di Broca',
  'legend.brocaRole': 'LLM degli agenti del client',
  'legend.motor': 'Corteccia motoria',
  'legend.motorRole': 'tool degli agenti del client',
  'legend.hippo': 'Ippocampo',
  'legend.hippoRole': 'episodi: ogni neurone è un ricordo',
  'legend.acc': 'Cingolo',
  'legend.accRole': 'conflitti e voci di terzi',
  'legend.cortex': 'Neocorteccia',
  'legend.cortexRole': 'fatti, note, diari',
  'legend.prefrontal': 'Prefrontale',
  'legend.prefrontalRole': 'richiami degli agenti',
  'legend.note': 'Ogni impulso è un evento reale del servizio. Senza eventi il cervello resta fermo.',
  'region.thalamus': 'Talamo',
  'region.llm': 'Area di Wernicke',
  'region.hippo': 'Ippocampo',
  'region.acc': 'Cingolo anteriore',
  'region.cortex': 'Neocorteccia',
  'region.prefrontal': 'Corteccia prefrontale',
  'region.broca': 'Area di Broca',
  'region.motor': 'Corteccia motoria',
  'region.auditory': 'Corteccia uditiva',
  'role.thalamus': 'ingest',
  'role.llm': 'LLM',
  'role.hippo': 'episodi',
  'role.acc': 'terzi',
  'role.cortex': 'fatti',
  'role.prefrontal': 'richiamo',
  'role.broca': 'LLM del client',
  'role.motor': 'tool e voce del client',
  'role.auditory': 'ascolto',
  'log.aria': 'Eventi reali',
  'log.title': 'Eventi · live',
  'log.followAll': 'in ascolto di tutto il servizio: mostra la persona attiva',
  'log.connected': 'collegato: ogni impulso da qui in poi è un evento reale del servizio',
  'log.switch': "attività di un'altra persona: cambio vista",
  'log.agent': 'agente',
  'log.error': ' · errore',
  'log.userNoPerson': 'utente senza persona Recordare nota',
  'log.noUser': 'nessun utente',
  'log.hearing': 'ascolto',
  'log.audio': ' · {s} s di audio',
  'log.voice': 'voce',
  'log.chars': ' · {n} caratteri',
  'log.messages': 'messaggi ricevuti · {n}',
  'log.extraction': 'estrazione · finestra di {n} messaggi',
  'log.extractionStatus': 'estrazione {status}',
  'log.llmRunning': 'LLM in corso · {prompt}…',
  'log.claim': 'affermazione di terzi isolata · {kind}',
  'log.episode': 'episodio · {kind} · importanza {n}',
  'log.fact': 'fatto aggiornato',
  'log.note': 'nota aggiornata',
  'log.correction': 'correzione collegata',
  'log.duplicate': 'doppione nascosto',
  'log.recallEpisodes': ' · {n} episodi',
  'log.recallClaims': ' · {n} voci di terzi',
  'log.recallDigests': ' · {n} diari',
  'log.recallFacts': ' · {n} fatti',
  'log.digestMonth': 'diario del mese · {period}',
  'log.digestDay': 'diario del giorno · {period}',
  'log.consolidation': 'consolidamento · {days} giorni, {months} mesi, {calls} chiamate',
  'log.forgotten': 'dimenticati {n} episodi',
  'stat.episodes': 'Episodi',
  'stat.factsNotes': 'Fatti · note',
  'stat.llm': 'Chiamate LLM',
  'stat.tokens': 'Token',
  'stat.recalls': 'Richiami',
  'stat.claims': 'Voci di terzi',
};

const DICT: Record<Lang, Record<Key, string>> = { en, it };
const STORE = 'atlas-lang';
const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);

/** The URL wins (and is remembered), then the remembered choice, then English. */
function initial(): Lang {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (isLang(fromUrl)) { remember(fromUrl); return fromUrl; }
  try { const saved = localStorage.getItem(STORE); if (isLang(saved)) return saved; } catch { /* storage unavailable */ }
  return 'en';
}
function remember(l: Lang): void {
  try { localStorage.setItem(STORE, l); } catch { /* storage unavailable */ }
}

let lang: Lang = initial();
const listeners: Array<() => void> = [];

export const getLang = (): Lang => lang;

/** `{name}` placeholders are replaced by `params[name]`. */
export function t(key: Key, params?: Record<string, string | number>): string {
  const text = DICT[lang][key];
  return params ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : text;
}

/** Re-renders everything registered here; a `lang` already in the URL follows the choice (a reload keeps it). */
export function setLang(l: Lang): void {
  if (l === lang) return;
  lang = l;
  remember(l);
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) { url.searchParams.set('lang', l); history.replaceState(null, '', url); }
  listeners.forEach((f) => f());
}
export function onLangChange(f: () => void): void { listeners.push(f); }

/** Static text of the page: `data-i18n` (text), `data-i18n-title`, `data-i18n-placeholder`, `data-i18n-aria-label`. */
export function applyStatic(root: ParentNode = document): void {
  document.documentElement.lang = lang;
  const attrs: Array<[string, string | null]> = [['i18n', null], ['i18nTitle', 'title'], ['i18nPlaceholder', 'placeholder'], ['i18nAriaLabel', 'aria-label']];
  for (const [data, attr] of attrs) {
    const sel = `[data-${data.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`;
    root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      const text = t(el.dataset[data] as Key);
      if (attr) el.setAttribute(attr, text); else el.textContent = text;
    });
  }
}
