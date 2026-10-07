// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright © 2026 Andrea Genovese

import { defineConfig } from 'vite';
// @ts-expect-error plain ES module shared with the production server
import { allowed } from './server/allow.mjs';
// @ts-expect-error plain ES module shared with the production server
import { clientStream, receiveTraces } from './server/otlp.mjs';

/**
 * In development the atlas talks to the service through Vite's proxy (same origin: no CORS). On a local machine the proxy can
 * add the admin key itself (RECORDARE_ADMIN_KEY), so the browser never holds it; otherwise the key is typed in the UI.
 */
const adminKey = process.env.RECORDARE_ADMIN_KEY;
export default defineConfig({
  plugins: [{
    name: 'atlas-otlp', // the client-agent receiver, as in production (server/otlp.mjs)
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method === 'POST' && req.url === '/v1/traces') return receiveTraces(req, res);
        if (req.method === 'GET' && req.url === '/atlas/client-stream') return clientStream(req, res);
        next();
      });
    },
  }],
  server: {
    port: 5175,
    // Extra host names the dev server answers to (e.g. `host.docker.internal`, so agents in Docker can send traces).
    allowedHosts: (process.env.ATLAS_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean),
    proxy: {
      '/api': {
        target: process.env.RECORDARE_URL ?? 'http://localhost:8080',
        changeOrigin: true,
        ...(adminKey ? { headers: { authorization: `Bearer ${adminKey}` } } : {}),
        // Same allowlist as the production server: the key never opens other admin endpoints.
        bypass: (req, res) => {
          if (allowed(req.method, req.url ?? '')) return undefined;
          res?.writeHead(403).end();
          return false;
        },
      },
    },
  },
});
