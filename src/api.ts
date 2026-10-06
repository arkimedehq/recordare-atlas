// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright © 2026 Andrea Genovese

/** Client of the service's admin endpoints: owners, the atlas snapshot and the live telemetry stream. */

export interface OwnerItem { id: string; name: string; episodes: number; lastActivity: string | null }
export interface AtlasEpisode { id: string; kind: string; authorRole: string; importance: number; day: string | null; precision: string;
  planStatus: string | null; hidden: 'duplicate' | 'invalidated' | null; xyz: [number, number, number] }
export interface AtlasEdge { a: string; b: string; kind: 'similar' | 'corrects' | 'duplicate' | 'outcome' | 'rescheduled' | 'people' }
export interface Atlas {
  owner: { id: string; name: string }; generatedAt: string; episodes: AtlasEpisode[]; edges: AtlasEdge[];
  facts: Array<{ id: string; key: string; status: string }>; notes: Array<{ id: string; category: string; pending: boolean }>;
  digests: Array<{ id: string; level: string; period: string }>;
  totals?: { llmCalls: number; inputTokens: number; outputTokens: number; recalls: number };
}
export type TelemetryEvent = { type: string; at: string; ownerId?: string | null } & Record<string, unknown>;

/** With an empty key the request goes without credentials (the local dev proxy adds the admin key). */
const auth = (key: string): Record<string, string> => (key ? { authorization: `Bearer ${key}` } : {});

async function get<T>(path: string, key: string): Promise<T> {
  const res = await fetch(path, { headers: auth(key) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const owners = (key: string) => get<OwnerItem[]>('/api/v1/admin/owners', key);
export const atlas = (key: string, ownerId: string) => get<Atlas>(`/api/v1/admin/owners/${ownerId}/atlas`, key);

/**
 * Server-Sent Events over fetch (EventSource cannot send the admin key as a header). Reconnects with backoff;
 * returns a stop function.
 */
export function stream(key: string, ownerId: string | null, onEvent: (e: TelemetryEvent) => void, onState: (s: 'on' | 'off' | 'err') => void): () => void {
  let stopped = false;
  let ctrl: AbortController | null = null;
  const run = async (attempt: number): Promise<void> => {
    if (stopped) return;
    ctrl = new AbortController();
    try {
      const res = await fetch(`/api/v1/admin/telemetry/stream${ownerId ? `?owner=${encodeURIComponent(ownerId)}` : ''}`, {
        headers: { ...auth(key), accept: 'text/event-stream' }, signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(String(res.status));
      onState('on');
      attempt = 0;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
          if (data) { try { onEvent(JSON.parse(data) as TelemetryEvent); } catch { /* malformed event: skip */ } }
        }
      }
      onState('off');
    } catch {
      if (stopped) return;
      onState('err');
    }
    if (!stopped) setTimeout(() => void run(attempt + 1), Math.min(30_000, 1000 * 2 ** attempt));
  };
  void run(0);
  return () => { stopped = true; ctrl?.abort(); };
}
