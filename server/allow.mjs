// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright © 2026 Andrea Genovese

/**
 * The only service paths the atlas may reach. The proxy adds the admin key, so it must never become an open admin
 * gateway: read-only GETs of the people list, one person's snapshot and the telemetry stream.
 */
const ALLOWED = [
  /^\/api\/v1\/admin\/memories$/,
  /^\/api\/v1\/admin\/memories\/[0-9a-f-]{36}\/atlas$/,
  /^\/api\/v1\/admin\/telemetry\/stream$/,
];

export function allowed(method, url) {
  const path = new URL(url, 'http://x').pathname;
  return method === 'GET' && ALLOWED.some((r) => r.test(path));
}
