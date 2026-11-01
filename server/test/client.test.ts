import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAllowed } from '../src/genesys/allowlist.js';
import { GenesysAuth } from '../src/genesys/auth.js';
import { GenesysClient } from '../src/genesys/client.js';
import { mapFlowVolume } from '../src/collectors/mapFlowAggregates.js';

test('allowlist permite consultas e bloqueia escrita', () => {
  assert.equal(isAllowed('POST', '/api/v2/analytics/flows/aggregates/query'), true);
  assert.equal(isAllowed('GET', '/api/v2/flows'), true);
  assert.equal(isAllowed('GET', '/api/v2/flows/milestones'), true);
  assert.equal(isAllowed('GET', '/api/v2/flows/8f6c0000-0000-0000-0000-000000000000/versions'), true);
  assert.equal(isAllowed('POST', '/api/v2/flows'), false);
  assert.equal(isAllowed('POST', '/api/v2/flows/actions/publish'), false);
  assert.equal(isAllowed('GET', '/api/v2/flows/actions'), false);
  assert.equal(isAllowed('PUT', '/api/v2/flows/abc'), false);
  assert.equal(isAllowed('DELETE', '/api/v2/flows/abc'), false);
  assert.equal(isAllowed('POST', '/api/v2/flows/milestones'), false);
  assert.equal(isAllowed('PATCH', '/api/v2/flows/instances/settings/executiondata'), false);
});

function fakeFetch(responses: { status: number; body?: unknown; headers?: Record<string, string> }[]) {
  const calls: string[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    calls.push(`${init?.method} ${String(url)}`);
    if (String(url).includes('/oauth/token')) {
      return new Response(JSON.stringify({ access_token: 'tok', token_type: 'bearer', expires_in: 86400 }), { status: 200 });
    }
    const r = responses.shift()!;
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: r.headers });
  }) as typeof fetch;
  return { f, calls };
}

test('cliente repete após 429 respeitando Retry-After e autentica uma vez', async () => {
  const { f, calls } = fakeFetch([{ status: 429, headers: { 'retry-after': '2' } }, { status: 200, body: { results: [] } }]);
  const sleeps: number[] = [];
  const client = new GenesysClient(new GenesysAuth('sae1.pure.cloud', 'id', 'secret', f), {
    regionDomain: 'sae1.pure.cloud', maxRequestsPerMinute: 100, fetchImpl: f, sleep: async (ms) => { sleeps.push(ms); },
  });
  const res = await client.query<{ results: unknown[] }>('/api/v2/analytics/flows/aggregates/query', { interval: 'x', metrics: ['nFlow'] });
  assert.deepEqual(res, { results: [] });
  assert.deepEqual(sleeps, [2000]);
  assert.equal(calls.filter((c) => c.includes('oauth')).length, 1);
  assert.ok(calls.every((c) => !c.includes('oauth') || c.startsWith('POST https://login.sae1.pure.cloud/')));
});

test('cliente recusa chamada fora da allowlist sem tocar a rede', async () => {
  const { f, calls } = fakeFetch([]);
  const client = new GenesysClient(new GenesysAuth('sae1.pure.cloud', 'id', 'secret', f), { regionDomain: 'sae1.pure.cloud', maxRequestsPerMinute: 10, fetchImpl: f });
  await assert.rejects(client.query('/api/v2/flows/actions/publish', {}), /somente leitura/);
  assert.equal(calls.length, 0);
});

test('mapeia resposta de agregados em linhas horárias', () => {
  const rows = mapFlowVolume([{ group: { flowId: 'f1', flowVersion: '3.0' }, data: [{ interval: '2026-10-31T12:00:00.000Z/2026-10-31T13:00:00.000Z', metrics: [
    { metric: 'nFlow', stats: { count: 10 } }, { metric: 'tFlow', stats: { count: 10, sum: 600000 } }, { metric: 'tFlowDisconnect', stats: { count: 2, sum: 1 } },
  ] }] }]);
  assert.deepEqual(rows[0], { flowId: 'f1', flowVersion: '3.0', intervalStart: '2026-10-31T12:00:00.000Z', entries: 10, durationMsSum: 600000, durationCount: 10, disconnects: 2, exits: 0 });
});
