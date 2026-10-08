// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright © 2026 Andrea Genovese

/**
 * Demo setup: a fictional person (Emma, or Giulia with DEMO_LANG=it) with consent, a demo client and a personal token, and three earlier
 * conversations (the last days, telling of the last two weeks) ingested and really extracted, so the brain has memories to recall.
 * Writes the ids and the token to DEMO_STATE (outside the repository; delete it after recording).
 * Cost: three extraction calls of the service's LLM.
 */
import { writeFileSync } from 'node:fs';
import { admin, cfg, http, need, telemetry, sleep } from './lib.mjs';
import { at, story } from './scenario.mjs';

need('adminKey');
const name = process.env.DEMO_PERSON ?? story.person;

const client = await admin('POST', 'clients', { name: 'Atlas demo client', kind: 'mcp_client' });
const owner = await admin('POST', 'owners', { displayName: name, locale: story.locale, timezone: story.timezone, episodicEnabled: true });
const ownerId = owner.personId ?? owner.id;
const token = await admin('POST', `owners/${ownerId}/tokens`, { clientId: client.id, scopes: ['ingest', 'mcp', 'read'] });
const state = { ownerId, clientId: client.id, tokenId: token.id, token: token.token };
if (!state.token) throw new Error('no token in the response');
writeFileSync(cfg.state, JSON.stringify(state), { mode: 0o600 });
console.log(`person ${name} ${ownerId} · client ${client.id} · state in ${cfg.state}`);

// Earlier conversations (scenario.mjs): the assistant's replies are scripted (no LLM spent on them).
const seeds = story.seeds;

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
