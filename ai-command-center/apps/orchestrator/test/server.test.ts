import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { AccEvent, ServerMessage, Snapshot } from '@acc/shared';
import { createAccServer } from '../src/server.ts';
import { makeEngine, waitFor } from './helpers.ts';

const TOKEN = 'token-de-teste-com-tamanho-suficiente';
const ORIGIN = 'http://localhost:3000';
let closeFn: (() => Promise<void>) | null = null;

async function start() {
  const app = makeEngine();
  const { server, close } = createAccServer({ ...app, mode: 'demo', token: TOKEN, allowedOrigin: ORIGIN });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  closeFn = close;
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = (path: string, init: RequestInit = {}) =>
    fetch(base + path, { ...init, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...init.headers } });
  return { ...app, base, api };
}

afterEach(async () => {
  await closeFn?.();
  closeFn = null;
});

describe('API e WebSocket', () => {
  it('exige token', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/api/snapshot`)).status).toBe(401);
    expect((await fetch(`${base}/api/snapshot`, { headers: { authorization: 'Bearer errado' } })).status).toBe(401);
  });

  it('recusa origens não permitidas', async () => {
    const { api } = await start();
    expect((await api('/api/snapshot', { headers: { origin: 'https://site-malicioso.com' } })).status).toBe(403);
    const ok = await api('/api/snapshot', { headers: { origin: ORIGIN } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('entrega snapshot, valida entrada e executa o fluxo pelo HTTP com eventos via WebSocket', async () => {
    const { api, base } = await start();
    const snap = (await (await api('/api/snapshot')).json()) as Snapshot;
    expect(snap.mode).toBe('demo');
    expect(snap.agents.map((a) => a.name)).toEqual(['Ada', 'Lia', 'Téo', 'Davi']);

    expect((await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'x' }) })).status).toBe(400);
    expect((await api('/api/projects', { method: 'POST', body: '{quebrado' })).status).toBe(400);

    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?token=${TOKEN}`);
    const messages: ServerMessage[] = [];
    ws.on('message', (d) => messages.push(JSON.parse(String(d))));
    await waitFor(() => messages.find((m) => m.type === 'hello'), 2000, 'hello');

    const created = await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Portal', description: 'Uma página institucional com formulário' }) });
    expect(created.status).toBe(200);
    const project = (await created.json()) as { id: string };

    const events = () => messages.filter((m): m is { type: 'event'; event: AccEvent } => m.type === 'event').map((m) => m.event);
    const decideAll = async () => {
      const pending = events()
        .filter((e): e is Extract<AccEvent, { type: 'approval.upserted' }> => e.type === 'approval.upserted')
        .map((e) => e.approval)
        .filter((a, _i, all) => a.status === 'pending' && !all.some((b) => b.id === a.id && b.status !== 'pending'));
      for (const a of pending) await api(`/api/approvals/${a.id}`, { method: 'POST', body: JSON.stringify({ decision: 'approve' }) });
    };
    const deadline = Date.now() + 8000;
    while (!events().some((e) => e.type === 'project.upserted' && e.project.status === 'completed')) {
      if (Date.now() > deadline) throw new Error('Tempo esgotado aguardando conclusão via WS');
      await decideAll();
      await new Promise((r) => setTimeout(r, 5));
    }

    // Os números de sequência chegam em ordem e sem lacunas.
    const seqs = events().map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(seqs.at(-1)! - seqs[0]! + 1).toBe(seqs.length);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detail: any = await (await api(`/api/projects/${project.id}`)).json();
    expect(detail.tasks).toHaveLength(3);
    const agent: any = await (await api('/api/agents/ag-programmer')).json();
    expect(agent.history.some((e: AccEvent) => e.type === 'run.activity')).toBe(true);
    const run: any = await (await api(`/api/runs/${detail.tasks[0].runId}`)).json();
    expect(run.events.length).toBeGreaterThan(0);

    // Aprovação repetida é recusada.
    const plan = detail.approvals.find((a: { kind: string }) => a.kind === 'plan');
    expect((await api(`/api/approvals/${plan.id}`, { method: 'POST', body: JSON.stringify({ decision: 'approve' }) })).status).toBe(409);
    ws.close();
  });

  it('recusa WebSocket sem token', async () => {
    const { base } = await start();
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws`);
    const err = await new Promise<Error>((r) => ws.on('error', r));
    expect(err.message).toMatch(/401/);
  });
});
