// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright © 2026 Andrea Genovese

/**
 * Client agents on the brain (WORK_PLAN 5b.8): an OTLP/HTTP trace receiver (JSON encoding) for the OpenTelemetry GenAI
 * semantic conventions (`gen_ai.*`), JSON or protobuf encoding, optionally gzip, relayed to the open pages as
 * Server-Sent Events. Nothing is stored.
 *
 * Metadata only: a span becomes one small event built from an allowlist of attributes (operation, agent, model,
 * provider, tool, tokens, timing, status, the person). Prompts, replies, system instructions, tool arguments and
 * results are never read, whatever the client sends. Receiving needs ATLAS_INGEST_TOKEN (off when unset).
 */
import { gunzipSync } from 'node:zlib';

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

/** POST /v1/traces — OTLP/HTTP, JSON (`application/json`) or protobuf (`application/x-protobuf`), gzip allowed. */
export function receiveTraces(req, res) {
  if (!TOKEN) { res.writeHead(404).end(); return; }
  if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401).end(); return; }
  const type = String(req.headers['content-type'] ?? '');
  const json = type.startsWith('application/json'), pb = type.startsWith('application/x-protobuf');
  if (!json && !pb) { res.writeHead(415).end(); return; }
  const chunks = [];
  let size = 0;
  req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { res.writeHead(413).end(); req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    if (res.writableEnded) return;
    let data;
    try {
      let body = Buffer.concat(chunks);
      if (req.headers['content-encoding'] === 'gzip') body = gunzipSync(body, { maxOutputLength: MAX_BODY });
      data = json ? JSON.parse(body.toString('utf8')) : decodeTraces(body);
    } catch { res.writeHead(400).end(); return; }
    const events = [];
    for (const rs of data.resourceSpans ?? []) for (const ss of rs.scopeSpans ?? []) for (const s of ss.spans ?? []) {
      const e = toEvent(s, rs.resource?.attributes);
      if (e) events.push(e);
    }
    events.sort((x, y) => x.startedAt - y.startedAt).forEach(broadcast);
    if (pb) res.writeHead(200, { 'content-type': 'application/x-protobuf' }).end(); // empty ExportTraceServiceResponse
    else res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
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

// ── OTLP protobuf, decoded by hand (no dependency) ──────────────────────────────────────────────────────────────────
// Only the fields the atlas reads, with the field numbers of opentelemetry-proto (Apache-2.0, see
// THIRD_PARTY_NOTICES.md); everything else is skipped. The result has the shape of OTLP JSON, so one path handles both.

/** Reads the fields of one message: calls `on(field, wireType, value)`; length-delimited values are sub-buffers. */
function fields(buf, on) {
  let i = 0;
  const varint = () => {
    let v = 0n, shift = 0n;
    for (;;) {
      if (i >= buf.length) throw new Error('truncated');
      const b = buf[i++];
      v |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) return v;
      shift += 7n;
    }
  };
  while (i < buf.length) {
    const key = Number(varint()), field = key >>> 3, wire = key & 7;
    if (wire === 0) on(field, 0, varint());
    else if (wire === 1) { on(field, 1, buf.readBigUInt64LE(i)); i += 8; }
    else if (wire === 2) { const len = Number(varint()); on(field, 2, buf.subarray(i, i + len)); i += len; }
    else if (wire === 5) { on(field, 5, buf.readUInt32LE(i)); i += 4; }
    else throw new Error(`wire type ${wire}`);
  }
}
const str = (b) => b.toString('utf8');
function anyValue(b) {
  const v = {};
  fields(b, (f, w, x) => {
    if (f === 1 && w === 2) v.stringValue = str(x);
    else if (f === 2 && w === 0) v.boolValue = x !== 0n;
    else if (f === 3 && w === 0) v.intValue = BigInt.asIntN(64, x).toString();
    else if (f === 4 && w === 1) v.doubleValue = Buffer.from(BigInt.asUintN(64, x).toString(16).padStart(16, '0'), 'hex').readDoubleBE(0);
  });
  return v;
}
function keyValue(b) {
  const kv = { key: '', value: {} };
  fields(b, (f, w, x) => { if (f === 1 && w === 2) kv.key = str(x); else if (f === 2 && w === 2) kv.value = anyValue(x); });
  return kv;
}
function span(b) {
  const s = { attributes: [] };
  fields(b, (f, w, x) => {
    if (f === 1 && w === 2) s.traceId = x.toString('hex');
    else if (f === 5 && w === 2) s.name = str(x);
    else if (f === 7 && w === 1) s.startTimeUnixNano = x.toString();
    else if (f === 8 && w === 1) s.endTimeUnixNano = x.toString();
    else if (f === 9 && w === 2) s.attributes.push(keyValue(x));
    else if (f === 15 && w === 2) fields(x, (sf, sw, sx) => { if (sf === 3 && sw === 0) s.status = { code: Number(sx) }; });
  });
  return s;
}
export function decodeTraces(buf) {
  const resourceSpans = [];
  fields(buf, (f, w, x) => {
    if (f !== 1 || w !== 2) return;
    const rs = { resource: { attributes: [] }, scopeSpans: [] };
    fields(x, (rf, rw, rx) => {
      if (rf === 1 && rw === 2) fields(rx, (af, aw, ax) => { if (af === 1 && aw === 2) rs.resource.attributes.push(keyValue(ax)); });
      else if (rf === 2 && rw === 2) {
        const ss = { spans: [] };
        fields(rx, (sf, sw, sx) => { if (sf === 2 && sw === 2) ss.spans.push(span(sx)); });
        rs.scopeSpans.push(ss);
      }
    });
    resourceSpans.push(rs);
  });
  return { resourceSpans };
}
