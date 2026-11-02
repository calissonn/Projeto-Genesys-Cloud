/**
 * Testes de integração: PostgreSQL real + API + Genesys SIMULADO.
 * Requer TEST_DATABASE_URL (banco dedicado — será LIMPO). Sem a variável, os testes são pulados.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { buildApp } from '../src/api/app.js';
import { loadServerConfig } from '../src/config.js';
import { migrate } from '../src/db/migrate.js';
import { isAllowed } from '../src/genesys/allowlist.js';
import { MOCK, startGenesysMock } from '../src/mock/genesysMock.js';
import { GenesysIntegration } from '../src/sync/integration.js';

const URL = process.env.TEST_DATABASE_URL;
const skip = !URL ? 'TEST_DATABASE_URL não definida' : false;

describe('backend + PostgreSQL + Genesys simulado', { skip }, () => {
  let db: pg.Pool;
  let mock: Awaited<ReturnType<typeof startGenesysMock>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let integration: GenesysIntegration;
  const ADMIN = 'admin@gazin.com.br';
  const call = (email: string | null, method: string, url: string, body?: unknown) =>
    app.inject({ method: method as 'GET', url, payload: body as object, headers: email ? { 'x-dev-user': email } : {} });

  before(async () => {
    db = new pg.Pool({ connectionString: URL });
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const applied = await migrate(db);
    assert.ok(applied.includes('001_init.sql'));
    assert.deepEqual(await migrate(db), [], 'migração deve ser idempotente');

    mock = await startGenesysMock({ rateLimitEvery: 4, failJobsStartingAt: new Set() });
    const cfg = loadServerConfig({
      NODE_ENV: 'test', DATABASE_URL: URL, AUTH_MODE: 'dev', BOOTSTRAP_ADMIN_EMAIL: ADMIN,
      GENESYS_CLIENT_ID: MOCK.clientId, GENESYS_CLIENT_SECRET: MOCK.clientSecret, GENESYS_API_BASE_URL: mock.url, GENESYS_LOGIN_BASE_URL: mock.url,
    });
    integration = new GenesysIntegration(db, cfg.genesys!, cfg.timeZone);
    app = await buildApp({ db, cfg, integration });
  });

  after(async () => {
    await app?.close();
    await mock?.app.close();
    await db?.end();
  });

  test('autenticação: sem usuário → 401; desconhecido → 403; admin inicial é criado', async () => {
    assert.equal((await call(null, 'GET', '/api/me')).statusCode, 401);
    assert.equal((await call('nao.cadastrado@gazin.com.br', 'GET', '/api/me')).statusCode, 403);
    const me = await call(ADMIN, 'GET', '/api/me');
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().profile, 'admin');
    assert.equal((await call(null, 'GET', '/api/health')).statusCode, 200);
  });

  test('cadastros e perfis: admin cria URAs e usuários; supervisor vê só seu departamento', async () => {
    const ura = (id: string, dep: string, flow: string | null) => call(ADMIN, 'PUT', `/api/uras/${id}`, { departmentId: dep, name: `URA ${id}`, status: 'ativa', genesysFlowId: flow, requiresCpf: true });
    assert.equal((await ura('ura-consorcio', 'consorcio', MOCK.flows[0].id)).statusCode, 200);
    assert.equal((await ura('ura-bank', 'gazinbank', MOCK.flows[1].id)).statusCode, 200);
    assert.equal((await ura('ura-dup', 'sac', MOCK.flows[0].id)).statusCode, 409, 'fluxo não pode ser vinculado a duas URAs');
    assert.equal((await call(ADMIN, 'PUT', '/api/uras/x', { departmentId: 'sac', name: 'x', status: 'ativa', genesysFlowId: 'nao-uuid' })).statusCode, 400);

    assert.equal((await call(ADMIN, 'PUT', '/api/users/u-sup', { email: 'sup@gazin.com.br', name: 'Supervisora', profile: 'supervisor', active: true, departments: ['consorcio'] })).statusCode, 200);
    assert.equal((await call(ADMIN, 'PUT', '/api/users/u-ana', { email: 'ana@gazin.com.br', name: 'Analista', profile: 'analista_cx', active: true, departments: [] })).statusCode, 200);
    assert.equal((await call(ADMIN, 'PUT', '/api/users/u-x', { email: 'x@gazin.com.br', name: 'X', profile: 'supervisor', active: true, departments: [] })).statusCode, 400, 'supervisor sem departamento');

    const cat = (await call('sup@gazin.com.br', 'GET', '/api/catalog')).json();
    assert.deepEqual(cat.uras.map((u: { id: string }) => u.id), ['ura-consorcio']);
    assert.equal((await call('ana@gazin.com.br', 'GET', '/api/users')).statusCode, 403, 'analista não gerencia usuários');
    assert.equal((await call('sup@gazin.com.br', 'PUT', '/api/uras/ura-consorcio', { departmentId: 'consorcio', name: 'x', status: 'ativa' })).statusCode, 403);

    // Supervisor só grava testes das URAs do seu departamento.
    const test1 = { id: 't1', uraId: 'ura-consorcio', version: 'v1', title: 'CPF válido', status: 'pendente' };
    assert.equal((await call('sup@gazin.com.br', 'PUT', '/api/collections/tests/t1', test1)).statusCode, 200);
    assert.equal((await call('sup@gazin.com.br', 'PUT', '/api/collections/tests/t2', { ...test1, id: 't2', uraId: 'ura-bank' })).statusCode, 403);
    assert.equal((await call(ADMIN, 'PUT', '/api/collections/tests/t3', { ...test1, id: 't3', uraId: 'ura-bank' })).statusCode, 200);
    assert.deepEqual((await call('sup@gazin.com.br', 'GET', '/api/collections/tests')).json().map((t: { id: string }) => t.id), ['t1']);
    assert.equal((await call(ADMIN, 'PUT', '/api/collections/tests/t9', { ...test1, id: 'outro' })).statusCode, 400, 'id divergente');
  });

  test('auditoria: alterações registradas e trilha imutável', async () => {
    const before = (await call(ADMIN, 'GET', '/api/audit')).json();
    assert.ok(before.some((a: { action: string }) => a.action === 'URA salva'));
    assert.ok(before.some((a: { action: string }) => a.action === 'Usuário salvo'));
    await db.query(`UPDATE audit_log SET action = 'adulterado'`);
    await db.query(`DELETE FROM audit_log`);
    const afterRows = (await call(ADMIN, 'GET', '/api/audit')).json();
    assert.equal(afterRows.length, before.length);
    assert.ok(!afterRows.some((a: { action: string }) => a.action === 'adulterado'));
    assert.equal((await call('sup@gazin.com.br', 'GET', '/api/audit')).statusCode, 403);
  });

  test('integração: sincroniza dicionários, mapeia instrumentação e coleta agregados (com 429)', async () => {
    const r = await call(ADMIN, 'POST', '/api/integration/sync', { kind: 'dicionarios' });
    assert.equal(r.statusCode, 200, r.body);
    const res = r.json().resultado;
    assert.equal(res.flows, 3, 'apenas fluxos INBOUNDCALL');
    assert.equal(res.milestones, 6);
    assert.equal(res.queues, 3);
    const flows = (await call(ADMIN, 'GET', '/api/genesys/flows')).json();
    assert.equal(flows.find((f: { id: string }) => f.id === MOCK.flows[0].id).linkedUraId, 'ura-consorcio');
    const changes = (await call(ADMIN, 'GET', '/api/collections/changes')).json();
    assert.ok(changes.length >= 3, 'versões viram registros no histórico');

    const map = async (kind: string, id: string, role: string) => assert.equal((await call(ADMIN, 'PUT', `/api/instrumentation/${kind}/${id}`, { role })).statusCode, 200);
    await map('milestone', MOCK.milestones[0].id, 'cpf_tentativa');
    await map('milestone', MOCK.milestones[1].id, 'cpf_falha');
    await map('milestone', MOCK.milestones[2].id, 'cpf_excedido');
    await map('milestone', MOCK.milestones[4].id, 'opcao_invalida');
    await map('milestone', MOCK.milestones[5].id, 'erro_api');
    await map('outcome', MOCK.outcomes[0].id, 'autosservico');
    assert.equal((await call(ADMIN, 'PUT', `/api/instrumentation/milestone/${MOCK.milestones[3].id}`, { role: 'invalido' })).statusCode, 400);

    const now = new Date('2026-10-30T15:20:00Z');
    const out = await integration.collectIncremental(5, 'teste', now);
    assert.ok(out && out.rows > 0);
    assert.ok(integration.client.stats.rateLimited >= 1, 'deve ter recebido e tratado HTTP 429');

    const m = (await call(ADMIN, 'GET', '/api/metrics/hourly?from=2026-10-30&to=2026-10-30')).json();
    const recs = m.records.filter((x: { uraId: string }) => x.uraId === 'ura-consorcio');
    assert.ok(recs.length >= 5);
    const sum = (k: string) => recs.reduce((a: number, x: Record<string, number>) => a + x[k], 0);
    assert.ok(sum('entries') > 0 && sum('disconnects') > 0 && sum('transfers') > 0 && sum('selfService') > 0 && sum('authFailures') > 0);
    assert.ok(sum('disconnects') + sum('transfers') + sum('selfService') + sum('otherExits') >= sum('entries'));
    assert.equal(m.availability.selfService, true);
    assert.equal(m.availability.unique, false);
    // URA SAC não vinculada: dados do fluxo não aparecem.
    assert.ok(!m.records.some((x: { uraId: string }) => x.uraId === 'ura-sac'));
    // Supervisor só recebe métricas do seu departamento.
    const sup = (await call('sup@gazin.com.br', 'GET', '/api/metrics/hourly?from=2026-10-30&to=2026-10-30')).json();
    assert.ok(sup.records.length > 0 && sup.records.every((x: { uraId: string }) => x.uraId === 'ura-consorcio'));
    // Reprocessar a mesma janela não duplica (upsert idempotente).
    await integration.collectIncremental(5, 'teste', now);
    const m2 = (await call(ADMIN, 'GET', '/api/metrics/hourly?from=2026-10-30&to=2026-10-30')).json();
    assert.equal(JSON.stringify(m2.records), JSON.stringify(m.records));
  });

  test('backfill histórico: jobs assíncronos com retomada após falha', async () => {
    const now = new Date('2026-10-20T10:00:00Z');
    const failing = new Date('2026-10-13T00:00:00Z').toISOString();
    // Primeira execução: uma janela falha.
    const failSet = new Set([failing]);
    const mock2 = await startGenesysMock({ failJobsStartingAt: failSet });
    const cfg = loadServerConfig({ NODE_ENV: 'test', DATABASE_URL: URL, AUTH_MODE: 'dev', GENESYS_CLIENT_ID: MOCK.clientId, GENESYS_CLIENT_SECRET: MOCK.clientSecret, GENESYS_API_BASE_URL: mock2.url, GENESYS_LOGIN_BASE_URL: mock2.url });
    const integ2 = new GenesysIntegration(db, cfg.genesys!, cfg.timeZone);
    await assert.rejects(integ2.runBackfill(14, 'teste', { now, windowDays: 7 }), /falharam/);
    let w = (await db.query(`SELECT status FROM backfill_window ORDER BY window_start`)).rows.map((x) => x.status);
    assert.deepEqual(w, ['ok', 'erro']);
    // Segunda execução: falha resolvida; só a janela pendente é reprocessada.
    failSet.clear();
    mock2.state.calls.length = 0;
    const r = await integ2.runBackfill(14, 'teste', { now, windowDays: 7 });
    assert.equal(r?.windows, 1);
    w = (await db.query(`SELECT status FROM backfill_window ORDER BY window_start`)).rows.map((x) => x.status);
    assert.deepEqual(w, ['ok', 'ok']);
    const runs = (await call(ADMIN, 'GET', '/api/integration/runs')).json();
    assert.ok(runs.some((x: { collector: string; status: string }) => x.collector === 'backfill' && x.status === 'erro'));
    // Todas as chamadas feitas à "Genesys" são permitidas pela política somente leitura.
    for (const c of [...mock.state.calls, ...mock2.state.calls].filter((x) => x.path.startsWith('/api/'))) {
      assert.ok(isAllowed(c.method, c.path), `chamada não permitida: ${c.method} ${c.path}`);
    }
    await mock2.app.close();
  });

  test('status da integração e validações de entrada', async () => {
    const st = (await call(ADMIN, 'GET', '/api/integration/status')).json();
    assert.equal(st.configured, true);
    assert.equal(st.mode, 'somente_leitura');
    assert.ok(st.factRows > 0);
    assert.equal((await call(ADMIN, 'GET', '/api/metrics/hourly?from=2026-13-01&to=x')).statusCode, 400);
    assert.equal((await call(ADMIN, 'PUT', '/api/settings/goals', { disconnectWarn: 150 })).statusCode, 400);
    assert.equal((await call(ADMIN, 'PUT', '/api/settings/goals', { disconnectWarn: 14, disconnectCrit: 19 })).statusCode, 200);
    assert.equal((await call('sup@gazin.com.br', 'POST', '/api/integration/sync', { kind: 'incremental' })).statusCode, 403);
    const res = await call(ADMIN, 'GET', '/api/me');
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.equal(res.headers['cache-control'], 'no-store');
  });
});
