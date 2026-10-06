// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright © 2026 Andrea Genovese

/**
 * Client agents on the brain (WORK_PLAN 5b.8): an OTLP/HTTP trace receiver (JSON encoding) for the OpenTelemetry GenAI
 * semantic conventions (`gen_ai.*`), relayed to the open pages as Server-Sent Events. Nothing is stored.
 *
 * Metadata only: a span becomes one small event built from an allowlist of attributes (operation, agent, model,
 * provider, tool, tokens, timing, status, the person). Prompts, replies, system instructions, tool arguments and
 * results are never read, whatever the client sends. Receiving needs ATLAS_INGEST_TOKEN (off when unset).
 */
const TOKEN = process.env.ATLAS_INGEST_TOKEN ?? '';
const MAX_BODY = 5 * 1024 * 1024;
const listeners = new Set();

/** OTLP JSON attribute list → plain object, keeping only the allowed keys. */
const KEEP = new Set(['gen_ai.operation.name', 'gen_ai.provider.name', 'gen_ai.request.model', 'gen_ai.response.model', 'gen_ai.agent.name',
  'gen_ai.agent.id', 'gen_ai.tool.name', 'gen_ai.tool.type', 'gen_ai.usage.input_tokens', 'gen_ai.usage.output_tokens',
  'gen_ai.usage.cache_read.input_tokens', 'recordare.owner_id', 'user.id', 'enduser.id', 'service.name']);
function attrs(list) {
  const out = {};
  for (const a of list ?? []) {
    if (!KEEP.has(a.key)) continue;
    const v = a.value ?? {};
    out[a.key] = v.stringValue ?? (v.intValue !== undefined ? Number(v.intValue) : v.doubleValue ?? v.boolValue);
  }
  return out;
}
const num = (x) => (x === undefined ? undefined : Number(x));

/** One span → one client event (or null when it is not a GenAI span). */
export function toEvent(span, resource) {
  const a = { ...attrs(resource), ...attrs(span.attributes) };
  const op = a['gen_ai.operation.name'];
  if (typeof op !== 'string') return null;
  const start = Number(BigInt(span.startTimeUnixNano ?? 0) / 1_000_000n), end = Number(BigInt(span.endTimeUnixNano ?? 0) / 1_000_000n);
  return {
    type: 'client.span', op, service: a['service.name'] ?? null,
    owner: a['recordare.owner_id'] ?? null, user: a['user.id'] ?? a['enduser.id'] ?? null,
    agent: a['gen_ai.agent.name'] ?? a['gen_ai.agent.id'] ?? null, model: a['gen_ai.response.model'] ?? a['gen_ai.request.model'] ?? null,
    provider: a['gen_ai.provider.name'] ?? null, tool: a['gen_ai.tool.name'] ?? null, toolType: a['gen_ai.tool.type'] ?? null,
    inputTokens: num(a['gen_ai.usage.input_tokens']), outputTokens: num(a['gen_ai.usage.output_tokens']),
    trace: typeof span.traceId === 'string' ? span.traceId.slice(0, 8) : null, startedAt: start, ms: Math.max(0, end - start),
    status: span.status?.code === 2 || span.status?.code === 'STATUS_CODE_ERROR' ? 'error' : 'ok',
  };
}

function broadcast(event) {
  const line = `event: client.span\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of listeners) res.write(line);
}

/** POST /v1/traces — OTLP/HTTP with JSON encoding. */
export function receiveTraces(req, res) {
  if (!TOKEN) { res.writeHead(404).end(); return; }
  if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401).end(); return; }
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
    res.writeHead(415, { 'content-type': 'text/plain' }).end('OTLP/HTTP JSON only: set the exporter protocol to http/json');
    return;
  }
  let body = '', size = 0;
  req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { res.writeHead(413).end(); req.destroy(); } else body += c; });
  req.on('end', () => {
    if (res.writableEnded) return;
    let data;
    try { data = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
    const events = [];
    for (const rs of data.resourceSpans ?? []) for (const ss of rs.scopeSpans ?? []) for (const s of ss.spans ?? []) {
      const e = toEvent(s, rs.resource?.attributes);
      if (e) events.push(e);
    }
    events.sort((x, y) => x.startedAt - y.startedAt).forEach(broadcast);
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  });
}

/** GET /atlas/client-stream — the client events for the page (same origin). */
export function clientStream(req, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
  res.write(`event: hello\ndata: ${JSON.stringify({ receiving: !!TOKEN })}\n\n`);
  listeners.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => { clearInterval(ping); listeners.delete(res); });
}
