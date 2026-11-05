'use client';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { AccEvent, ServerMessage, Snapshot } from '@acc/shared';
import { applyEvent, applySnapshot, emptyState, type AccState } from './reducer';

export const accStore = createStore<AccState & { selectedAgentId: string | null }>(() => ({ ...emptyState, selectedAgentId: null }));

export function useAcc<T>(selector: (s: AccState & { selectedAgentId: string | null }) => T): T {
  return useStore(accStore, selector);
}

export function selectAgent(id: string | null) {
  accStore.setState({ selectedAgentId: id });
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/acc/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Erro ${res.status}`);
  return data as T;
}

/**
 * Sincronização: abre o fluxo de eventos, carrega o snapshot e aplica os eventos em ordem.
 * Se faltar algum número de sequência, recarrega o snapshot.
 */
export function startSync(): () => void {
  let buffer: AccEvent[] = [];
  let loading = false;
  let stopped = false;
  const es = new EventSource('/api/stream');

  async function resync() {
    if (loading || stopped) return;
    loading = true;
    try {
      const snap = await api<Snapshot>('snapshot');
      const feed = await api<AccEvent[]>(`events?after=${Math.max(0, snap.seq - 400)}&limit=400`);
      let state = applySnapshot(accStore.getState(), snap, feed);
      for (const e of buffer) state = applyEvent(state, e);
      buffer = [];
      accStore.setState({ ...state, connected: true });
    } catch {
      accStore.setState({ connected: false });
      setTimeout(() => {
        loading = false;
        void resync();
      }, 2000);
      return;
    }
    loading = false;
  }

  es.onopen = () => {
    accStore.setState({ synced: false });
    void resync();
  };
  es.onerror = () => accStore.setState({ connected: false });
  es.onmessage = (msg) => {
    const data = JSON.parse(msg.data) as ServerMessage;
    if (data.type !== 'event') return;
    const s = accStore.getState();
    if (!s.synced || loading) {
      buffer.push(data.event);
      return;
    }
    if (data.event.seq > s.seq + 1) {
      buffer.push(data.event);
      accStore.setState({ synced: false });
      void resync();
      return;
    }
    accStore.setState(applyEvent(s, data.event));
  };
  return () => {
    stopped = true;
    es.close();
  };
}
