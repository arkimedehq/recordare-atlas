// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright © 2026 Andrea Genovese

/**
 * Demo setup: a fictional person ("Giulia") with consent, a demo client and a personal token, and three earlier
 * conversations (the last days, telling of the last two weeks) ingested and really extracted, so the brain has memories to recall.
 * Writes the ids and the token to DEMO_STATE (outside the repository; delete it after recording).
 * Cost: three extraction calls of the service's LLM.
 */
import { writeFileSync } from 'node:fs';
import { admin, cfg, http, need, telemetry, sleep } from './lib.mjs';

need('adminKey');
const name = process.env.DEMO_PERSON ?? 'Giulia';
const at = (daysAgo, hh, mm) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(hh, mm, 0, 0); return d; };

const client = await admin('POST', 'clients', { name: 'Atlas demo client', kind: 'mcp_client' });
const owner = await admin('POST', 'owners', { displayName: name, locale: 'it', timezone: 'Europe/Rome', episodicEnabled: true });
const ownerId = owner.personId ?? owner.id;
const token = await admin('POST', `owners/${ownerId}/tokens`, { clientId: client.id, scopes: ['ingest', 'mcp', 'read'] });
const state = { ownerId, clientId: client.id, tokenId: token.id, token: token.token };
if (!state.token) throw new Error('no token in the response');
writeFileSync(cfg.state, JSON.stringify(state), { mode: 0o600 });
console.log(`person ${name} ${ownerId} · client ${client.id} · state in ${cfg.state}`);

// Earlier conversations: fictional, natural Italian; the assistant's replies are scripted (no LLM spent on them). Dates
// are written relative to the recording day ("sabato 10 ottobre"), so every recording gets the same story.
const day = (daysAgo) => at(daysAgo, 12, 0).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Rome' });
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const seeds = [
  { id: 'demo-seed-1', day: 3, turns: [
    ['user', 'Ciao! Ieri sera ho iniziato il corso di ceramica in via Tortona, una sera a settimana alle 19. Prima lezione: centrare l\'argilla sul tornio, un disastro divertente.'],
    ['assistant', 'Che bello! Il tornio all\'inizio è difficile per tutti: come ti sei trovata con gli altri del corso?'],
    ['user', `Benissimo, l'insegnante si chiama Elena ed è pazientissima. ${cap(day(-2))} poi c'è la cena per i 40 anni di mia sorella Chiara, alla Trattoria Masuelli alle 20:30, e devo ancora pensare al regalo.`],
    ['assistant', 'Segnato: cena per i 40 anni di Chiara alle 20:30. Hai già qualche idea per il regalo?'],
    ['user', `Non ancora. E ${day(-7)} ho la presentazione al cliente di Torino, sono un po' in ansia.`],
  ] },
  { id: 'demo-seed-2', day: 2, turns: [
    ['user', `Che settimana! ${cap(day(11))} sono stata a Bergamo Alta con la mia amica Sara, ${day(8)} ho consegnato le slide per il cliente di Torino, ${day(6)} sera concerto al Fabrique con Marco e ${day(5)} ho preparato le lasagne per i nonni.`],
    ['assistant', 'Davvero piena! Com\'è stato il concerto?'],
    ['user', 'Bellissimo, siamo tornati a casa alle due. Oggi invece ho comprato l\'argilla per esercitarmi a casa.'],
  ] },
  { id: 'demo-seed-3', day: 1, turns: [
    ['user', 'Stamattina ho corso 8 km al Parco Sempione con Marco: record personale!'],
    ['assistant', 'Complimenti! Che tempo avete fatto?'],
    ['user', `Quarantadue minuti. Ah, il dentista mi ha spostato l'appuntamento a ${day(-4)} alle 9.`],
    ['assistant', 'Ok, appuntamento dal dentista spostato.'],
    ['user', 'Per Chiara ho deciso: le regalo un set di tazze fatte da me al corso di ceramica. Spero di finirle in tempo!'],
  ] },
];

let finished = 0;
const stop = telemetry(ownerId, (e) => { if (e.type === 'extraction.finished') { finished++; console.log(`extraction ${e.status}`); } });
await sleep(500);
for (const s of seeds) {
  const start = at(s.day, 20, 15);
  await http('POST', '/api/v1/ingest/messages', { token: state.token, body: {
    conversation: { externalId: s.id, source: 'chat', title: 'Chat' },
    messages: s.turns.map(([role, content], i) => ({ externalId: `${s.id}-${i}`, role, content, sentAt: new Date(start.getTime() + i * 90_000).toISOString() })),
    hints: { conversationEnded: true },
  } });
}
for (let i = 0; i < 240 && finished < seeds.length; i++) await sleep(1000);
await sleep(5000); // embeddings of the new memories
stop();
const snap = await admin('GET', `owners/${ownerId}/atlas`);
console.log(`seeded: ${snap.episodes.length} episodes, ${snap.facts.length} facts, ${snap.notes.length} notes`);
