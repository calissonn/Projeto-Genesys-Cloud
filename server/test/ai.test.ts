/**
 * Redação opcional por IA: desativada por padrão, payload validado, bloqueio de dados pessoais,
 * limite de uso, auditoria e formato da chamada à API (servidor Anthropic FALSO).
 * Requer TEST_DATABASE_URL (banco dedicado — será LIMPO).
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { AiService, findPii, loadAiConfig } from '../src/ai/summary.js';
import { buildApp } from '../src/api/app.js';
import { loadServerConfig } from '../src/config.js';
import { migrate } from '../src/db/migrate.js';
import { startAnthropicMock } from '../src/mock/anthropicMock.js';

const URL = process.env.TEST_DATABASE_URL;

test('detecção de dados pessoais', () => {
  assert.equal(findPii({ a: 'CPF 123.456.789-09 do cliente' }), 'CPF');
  assert.equal(findPii({ a: 'ligar para (44) 99876-5432' }), 'telefone');
  assert.equal(findPii({ a: 'contato: fulano@gazin.com.br' }), 'e-mail');
  assert.equal(findPii({ a: 'Taxa de desligamento 17,5% → 26,1% (+8,7 p.p.; p < 0,001)', b: '10.659 entradas antes · 9.375 depois', c: '2026-10-19 a 2026-11-01' }), null);
});

test('IA desativada por padrão', () => {
  const ai = new AiService(loadAiConfig({}));
  assert.equal(ai.status().enabled, false);
  assert.equal(new AiService(loadAiConfig({ AI_ENABLED: 'true' })).status().enabled, false, 'sem chave continua desativada');
});

describe('rota /api/ai/summary', { skip: !URL ? 'TEST_DATABASE_URL não definida' : false }, () => {
  let db: pg.Pool;
  let mock: Awaited<ReturnType<typeof startAnthropicMock>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let appOff: Awaited<ReturnType<typeof buildApp>>;
  const ADMIN = 'admin@gazin.com.br';
  const payload = {
    janela: '2026-10-05 a 2026-11-01',
    resumoPorRegras: ['Nos últimos 28 dias, 25,5% resolvidas por autosserviço.'],
    analises: [{ titulo: 'URA Consórcio: piora após alteração', problema: 'Falha de CPF de 14,0% para 32,4%.', evidencias: ['p < 0,001'], confianca: 'alta' }],
    resultadosPositivos: [],
  };

  before(async () => {
    db = new pg.Pool({ connectionString: URL });
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(db);
    mock = await startAnthropicMock();
    const cfg = loadServerConfig({ NODE_ENV: 'test', DATABASE_URL: URL, AUTH_MODE: 'dev', BOOTSTRAP_ADMIN_EMAIL: ADMIN });
    app = await buildApp({ db, cfg, integration: null, ai: new AiService(loadAiConfig({ AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-teste', ANTHROPIC_BASE_URL: mock.url, AI_MAX_PER_USER_PER_HOUR: '2' })) });
    appOff = await buildApp({ db, cfg, integration: null });
  });
  after(async () => {
    await app?.close();
    await appOff?.close();
    await mock?.app.close();
    await db?.end();
  });

  const post = (a: typeof app, body: unknown) => a.inject({ method: 'POST', url: '/api/ai/summary', payload: body as object, headers: { 'x-dev-user': ADMIN } });

  test('desativada no servidor → 409, sem chamar a API', async () => {
    assert.equal((await post(appOff, payload)).statusCode, 409);
    assert.equal(mock.requests.length, 0);
  });

  test('gera o resumo e chama a API com modelo, fallback e apenas o payload', async () => {
    const r = await post(app, payload);
    assert.equal(r.statusCode, 200, r.body);
    assert.match(r.json().text, /RESUMO SIMULADO/);
    const req = mock.requests[0];
    assert.equal(req.body.model, 'claude-opus-5-5');
    assert.equal(req.body.fallbacks, 'default');
    assert.match(String(req.headers['anthropic-beta']), /server-side-fallback-2026-07-01/);
    assert.match(String(req.headers['x-api-key'] ?? req.headers.authorization), /sk-teste/, 'chave enviada pelo SDK');
    const content = JSON.stringify(req.body.messages);
    assert.ok(content.includes('URA Consórcio') && content.includes('32,4%'));
    const auditRows = (await db.query(`SELECT action, details FROM audit_log WHERE action = 'Resumo gerado por IA'`)).rows;
    assert.equal(auditRows.length, 1);
  });

  test('campos extras e dados pessoais são recusados antes de sair do servidor', async () => {
    const before = mock.requests.length;
    assert.equal((await post(app, { ...payload, telefoneCliente: 'x' })).statusCode, 400, 'campo fora do esquema');
    const r = await post(app, { ...payload, analises: [{ titulo: 'Cliente 123.456.789-09', problema: 'x' }] });
    assert.equal(r.statusCode, 400);
    assert.match(r.json().erro, /dado pessoal/);
    assert.equal(mock.requests.length, before, 'nada foi enviado à API');
    assert.equal((await db.query(`SELECT 1 FROM audit_log WHERE action = 'Envio à IA bloqueado'`)).rowCount, 1);
  });

  test('limite de uso por usuário', async () => {
    assert.equal((await post(app, payload)).statusCode, 200);
    assert.equal((await post(app, payload)).statusCode, 429);
  });

  test('estado das análises: coleção global gravada e auditada', async () => {
    await app.inject({ method: 'PUT', url: '/api/users/u-sup', headers: { 'x-dev-user': ADMIN }, payload: { email: 'sup@gazin.com.br', name: 'Sup', profile: 'supervisor', active: true, departments: ['consorcio'] } });
    const put = await app.inject({ method: 'PUT', url: '/api/collections/insight-states/chg%7Cura-consorcio-v2.6', headers: { 'x-dev-user': 'sup@gazin.com.br' }, payload: { id: 'chg|ura-consorcio-v2.6', status: 'em_investigacao' } });
    assert.equal(put.statusCode, 200, put.body);
    const list = (await app.inject({ method: 'GET', url: '/api/collections/insight-states', headers: { 'x-dev-user': 'sup@gazin.com.br' } })).json();
    assert.equal(list[0].status, 'em_investigacao');
  });
});
