// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright © 2026 Andrea Genovese

/**
 * Shared helpers of the demo recording: settings from the environment (or .env files named in DEMO_ENV), Recordare's
 * REST / MCP / telemetry endpoints, and OTLP/JSON spans sent to the atlas for the demo agent's real work.
 * Never prints a key or a token.
 */
import { readFileSync } from 'node:fs';

/** Reads KEY=VALUE lines of the files listed in DEMO_ENV (comma separated) without overriding the environment. */
function loadEnvFiles() {
  for (const file of (process.env.DEMO_ENV ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}
loadEnvFiles();

const env = (name, ...fallbacks) => [name, ...fallbacks].map((n) => process.env[n]).find((v) => v !== undefined && v !== '');
export const cfg = {
  recordare: (env('RECORDARE_URL') ?? 'http://localhost:8080').replace(/\/$/, ''),
  adminKey: env('RECORDARE_ADMIN_KEY', 'ADMIN_API_KEY'),
  atlas: (env('ATLAS_URL') ?? 'http://127.0.0.1:5175').replace(/\/$/, ''),
  ingestToken: env('ATLAS_INGEST_TOKEN'),
  // The demo agent's own LLM (any OpenAI-compatible endpoint); falls back to the service's settings.
  llmBase: (env('AGENT_LLM_BASE_URL', 'LLM_BASE_URL') ?? '').replace(/\/$/, ''),
  llmKey: env('AGENT_LLM_API_KEY', 'LLM_API_KEY'),
  llmModel: env('AGENT_LLM_MODEL', 'LLM_MODEL'),
  llmExtraBody: JSON.parse(env('AGENT_LLM_EXTRA_BODY') ?? '{}'), // e.g. {"thinking":{"type":"disabled"}} for DeepSeek
  state: env('DEMO_STATE') ?? `${process.env.TMPDIR ?? '/tmp'}/recordare-atlas-demo.json`,
};
export function need(...names) {
  for (const n of names) if (!cfg[n]) throw new Error(`missing setting: ${n} (see scripts/demo/README.md)`);
}

export async function http(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${cfg.recordare}${path}`, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
export const admin = (method, path, body, headers) => http(method, `/api/v1/admin/${path}`, { token: cfg.adminKey, body, headers });

/** The service's live telemetry for one person (admin SSE); calls onEvent for each event until stop(). */
export function telemetry(ownerId, onEvent) {
  const ctrl = new AbortController();
  (async () => {
    const res = await fetch(`${cfg.recordare}/api/v1/admin/telemetry/stream?owner=${ownerId}`, {
      headers: { authorization: `Bearer ${cfg.adminKey}`, accept: 'text/event-stream' }, signal: ctrl.signal,
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const data = buf.slice(0, i).split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
        buf = buf.slice(i + 2);
        if (data) try { onEvent(JSON.parse(data)); } catch { /* malformed */ }
      }
    }
  })().catch(() => undefined);
  return () => ctrl.abort();
}

/** Minimal MCP streamable-HTTP client (initialize once, then tools/call); answers may come as JSON or SSE. */
export class Mcp {
  constructor(token, conversation) { this.token = token; this.conversation = conversation; this.session = null; this.n = 0; }
  async rpc(method, params, notify = false) {
    const res = await fetch(`${cfg.recordare}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream',
        ...(this.session ? { 'mcp-session-id': this.session } : {}), ...(this.conversation ? { 'x-recordare-conversation': this.conversation } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, ...(notify ? {} : { id: ++this.n }) }),
    });
    this.session ??= res.headers.get('mcp-session-id');
    const text = await res.text();
    if (!res.ok) throw new Error(`MCP ${method} → ${res.status} ${text.slice(0, 200)}`);
    if (notify) return null;
    const json = text.trimStart().startsWith('{') ? text : text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).pop();
    const msg = JSON.parse(json);
    if (msg.error) throw new Error(`MCP ${method}: ${msg.error.message}`);
    return msg.result;
  }
  async callTool(name, args) {
    if (!this.session) {
      await this.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'atlas-demo', version: '1' } });
      await this.rpc('notifications/initialized', {}, true);
    }
    const r = await this.rpc('tools/call', { name, arguments: args });
    const text = r.content?.find((c) => c.type === 'text')?.text ?? '';
    try { return JSON.parse(text); } catch { return text; }
  }
}

/** The demo agent's own LLM call (OpenAI-compatible chat completions): returns the reply and the real usage. */
export async function chat(messages, maxTokens = 120) {
  const res = await fetch(`${cfg.llmBase}/chat/completions`, {
    method: 'POST', headers: { authorization: `Bearer ${cfg.llmKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: cfg.llmModel, messages, max_tokens: maxTokens, temperature: 0.7, ...cfg.llmExtraBody }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`LLM → ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return { text: json.choices?.[0]?.message?.content ?? '', model: json.model ?? cfg.llmModel, usage: json.usage ?? {} };
}

// ---------- OpenTelemetry GenAI spans (OTLP/HTTP JSON) for the demo agent's real work ----------
const hex = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
const nanos = (ms) => `${BigInt(Math.round(ms)) * 1_000_000n}`;
const attr = (key, v) => ({ key, value: typeof v === 'number' ? { intValue: v } : { stringValue: String(v) } });

/** Runs fn as one span and sends it to the atlas when it ends (as an exporter would): the span is the real work. */
export async function span(trace, name, attributes, fn, parent) {
  const id = hex(8), start = Date.now();
  let status = { code: 1 }, extra = {};
  try {
    const out = await fn(id);
    extra = out?.spanAttributes ?? {};
    return out;
  } catch (err) { status = { code: 2 }; throw err; } finally {
    const all = { ...attributes, ...extra };
    const body = { resourceSpans: [{
      resource: { attributes: [attr('service.name', 'atlas-demo-agent')] },
      scopeSpans: [{ scope: { name: 'atlas-demo' }, spans: [{
        traceId: trace, spanId: id, ...(parent ? { parentSpanId: parent } : {}), name, kind: 1,
        startTimeUnixNano: nanos(start), endTimeUnixNano: nanos(Date.now()), status,
        attributes: Object.entries(all).filter(([, v]) => v !== undefined).map(([k, v]) => attr(k, v)),
      }] }],
    }] };
    await fetch(`${cfg.atlas}/v1/traces`, {
      method: 'POST', headers: { authorization: `Bearer ${cfg.ingestToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => undefined);
  }
}
export const newTrace = () => hex(16);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
