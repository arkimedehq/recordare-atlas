// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright © 2026 Andrea Genovese

/**
 * The atlas server: serves the built app (`dist/`) and relays the allowed read-only paths to Recordare, adding the
 * admin key so the browser never holds it. No dependencies (Node's http). Binds 127.0.0.1 by default: put it behind
 * your own authentication before exposing it.
 *
 *   RECORDARE_URL=http://localhost:8080 RECORDARE_ADMIN_KEY=… ATLAS_HOST=127.0.0.1 ATLAS_PORT=5175 node server/index.mjs
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { request as httpRequest, createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowed } from './allow.mjs';
import { clientStream, receiveTraces } from './otlp.mjs';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const TARGET = new URL(process.env.RECORDARE_URL ?? 'http://localhost:8080');
const KEY = process.env.RECORDARE_ADMIN_KEY ?? '';
const HOST = process.env.ATLAS_HOST ?? '127.0.0.1';
const PORT = Number(process.env.ATLAS_PORT ?? 5175);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

function proxy(req, res) {
  if (!allowed(req.method, req.url)) { res.writeHead(403).end(); return; }
  const send = TARGET.protocol === 'https:' ? httpsRequest : httpRequest;
  const headers = { accept: req.headers.accept ?? '*/*', ...(KEY ? { authorization: `Bearer ${KEY}` } : req.headers.authorization ? { authorization: req.headers.authorization } : {}) };
  const up = send(new URL(req.url, TARGET), { method: 'GET', headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, { 'content-type': r.headers['content-type'] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    r.pipe(res); // streams Server-Sent Events as they come
  });
  up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.on('close', () => up.destroy());
  up.end();
}

function serve(req, res) {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, path);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

if (!existsSync(join(DIST, 'index.html'))) { console.error('dist/ missing: run `npm run build` first'); process.exit(1); }
createServer((req, res) => {
  if (req.url?.startsWith('/api/')) return proxy(req, res);
  if (req.method === 'POST' && req.url === '/v1/traces') return receiveTraces(req, res);
  if (req.method === 'GET' && req.url === '/atlas/client-stream') return clientStream(req, res);
  return serve(req, res);
})
  .listen(PORT, HOST, () => console.log(`Recordare Atlas on http://${HOST}:${PORT} → ${TARGET.origin}${KEY ? ' (admin key held by the server)' : ''}`));
