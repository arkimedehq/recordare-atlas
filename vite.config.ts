// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright © 2026 Andrea Genovese

import { defineConfig } from 'vite';

/**
 * The dashboard talks to the service through the dev proxy (same origin: no CORS). On a local machine the proxy can
 * add the admin key itself (RECORDARE_ADMIN_KEY), so the browser never holds it; otherwise the key is typed in the UI.
 */
const adminKey = process.env.RECORDARE_ADMIN_KEY;
export default defineConfig({
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: process.env.RECORDARE_URL ?? 'http://localhost:8080',
        changeOrigin: true,
        ...(adminKey ? { headers: { authorization: `Bearer ${adminKey}` } } : {}),
      },
    },
  },
});
