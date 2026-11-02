/**
 * API REST do Gazin URA Intelligence.
 * - Toda rota /api (exceto /api/health) exige usuário identificado (ver auth/identity.ts).
 * - Permissões por perfil (auth/rbac.ts); supervisores só acessam seus departamentos.
 * - Toda alteração gera registro de auditoria no servidor (tabela somente inclusão).
 * - A integração com a Genesys é SOMENTE LEITURA (ver genesys/allowlist.ts).
 */
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { ServerConfig } from '../config.js';
import { AuthError, identify } from '../auth/identity.js';
import { can, isScoped, PROFILE_LABEL, permissionsOf, type AppUser, type Permission } from '../auth/rbac.js';
import { tx, type Db } from '../db/pool.js';
import type { GenesysIntegration } from '../sync/integration.js';
import { hourlyRecords } from './metricsService.js';
import { AI_PAYLOAD_SCHEMA, AiService, findPii, loadAiConfig, type AiPayload } from '../ai/summary.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: AppUser;
  }
}

export interface AppDeps {
  db: Db;
  cfg: ServerConfig;
  integration: GenesysIntegration | null;
  ai?: AiService;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[\w.:|@-]{1,200}$/;

export async function buildApp({ db, cfg, integration, ai = new AiService(loadAiConfig({})) }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: cfg.nodeEnv !== 'test' ? { level: 'info', redact: ['req.headers["x-proxy-secret"]', 'req.headers.authorization', 'req.headers.cookie'] } : false, bodyLimit: 3 * 1024 * 1024,
    // Campos fora do esquema são RECUSADOS (não removidos silenciosamente).
    ajv: { customOptions: { removeAdditional: false } } });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    if (req.url.startsWith('/api')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.setErrorHandler((err: Error & { statusCode?: number; validation?: unknown }, req, reply) => {
    if (err instanceof AuthError) return reply.status(err.status).send({ erro: err.message });
    if (err instanceof HttpError) return reply.status(err.status).send({ erro: err.message });
    if (err.validation) return reply.status(400).send({ erro: `Dados inválidos: ${err.message}` });
    if (err.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ erro: err.message });
    req.log.error(err);
    return reply.status(500).send({ erro: 'Erro interno. A ocorrência foi registrada no log do servidor.' });
  });

  app.addHook('preHandler', async (req) => {
    if (!req.url.startsWith('/api') || req.url === '/api/health') return;
    req.user = await identify(req, db, cfg);
  });

  const need = (req: FastifyRequest, p: Permission) => {
    if (!can(req.user, p)) throw new HttpError(403, `Seu perfil (${PROFILE_LABEL[req.user.profile]}) não tem permissão para esta ação.`);
  };
  const audit = (req: FastifyRequest, action: string, entity: string, entityId?: string, details?: string) =>
    db.query(`INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, details) VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.user.id, `${req.user.name} <${req.user.email}>`, action, entity, entityId ?? null, details?.slice(0, 2000) ?? null]);

  /** URAs que o usuário pode ver (null = todas). */
  const allowedUras = async (u: AppUser): Promise<Set<string> | null> => {
    if (!isScoped(u)) return null;
    const r = await db.query<{ id: string }>(`SELECT id FROM ura WHERE department_id = ANY($1)`, [u.departments]);
    return new Set(r.rows.map((x) => x.id));
  };
  const assertUra = async (req: FastifyRequest, uraId: string | null | undefined) => {
    const allowed = await allowedUras(req.user);
    if (allowed && (!uraId || !allowed.has(uraId))) throw new HttpError(403, 'Fora dos departamentos atribuídos ao seu usuário.');
  };

  // ───────────── Básico ─────────────
  app.get('/api/health', async () => {
    await db.query('SELECT 1');
    return { ok: true };
  });

  app.get('/api/me', async (req) => ({
    ...req.user, profileLabel: PROFILE_LABEL[req.user.profile], permissions: permissionsOf(req.user.profile),
    dataSource: 'genesys', genesysConfigured: !!integration,
  }));

  // ───────────── Catálogo ─────────────
  app.get('/api/catalog', async (req) => {
    const allowed = await allowedUras(req.user);
    const deps = await db.query(`SELECT id, name, short_name AS short, active FROM department ORDER BY name`);
    const uras = await db.query(`SELECT id, department_id AS "departmentId", name, genesys_flow_id AS "genesysFlowId", version, status, requires_cpf AS "requiresCpf",
      business_hours AS "businessHours", owner, description, queues, to_char(updated_at, 'YYYY-MM-DD') AS "lastChange" FROM ura ORDER BY name`);
    const queues = await db.query(`SELECT id, name, department_id AS "departmentId", source FROM queue ORDER BY name`);
    const scopedDeps = isScoped(req.user) ? deps.rows.filter((d) => req.user.departments.includes(d.id)) : deps.rows;
    return {
      departments: scopedDeps,
      uras: uras.rows.filter((u) => !allowed || allowed.has(u.id)),
      queues: queues.rows.filter((q) => !isScoped(req.user) || !q.departmentId || req.user.departments.includes(q.departmentId)),
    };
  });

  app.put<{ Params: { id: string }; Body: { name: string; short?: string; active?: boolean } }>('/api/departments/:id', {
    schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 120 }, short: { type: 'string', maxLength: 60 }, active: { type: 'boolean' } } } },
  }, async (req) => {
    need(req, 'catalog:write');
    if (!/^[a-z0-9-]{2,60}$/.test(req.params.id)) throw new HttpError(400, 'Identificador inválido (use letras minúsculas, números e hífen).');
    const { name, short, active } = req.body;
    await db.query(`INSERT INTO department (id, name, short_name, active) VALUES ($1,$2,$3,$4)
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, short_name=EXCLUDED.short_name, active=EXCLUDED.active, updated_at=now()`,
    [req.params.id, name, short || name, active ?? true]);
    await audit(req, 'Departamento salvo', 'Departamento', req.params.id, name);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/departments/:id', async (req) => {
    need(req, 'catalog:write');
    const used = await db.query(`SELECT 1 FROM ura WHERE department_id = $1 LIMIT 1`, [req.params.id]);
    if (used.rowCount) throw new HttpError(409, 'Há URAs vinculadas a este departamento. Inative-o em vez de excluir.');
    await db.query(`DELETE FROM department WHERE id = $1`, [req.params.id]);
    await audit(req, 'Departamento excluído', 'Departamento', req.params.id);
    return { ok: true };
  });

  const UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  app.put<{ Params: { id: string }; Body: { departmentId: string; name: string; genesysFlowId?: string | null; version?: string; status: string; requiresCpf?: boolean; businessHours?: string; owner?: string; description?: string; queues?: string[] } }>('/api/uras/:id', {
    schema: { body: { type: 'object', required: ['departmentId', 'name', 'status'], properties: {
      departmentId: { type: 'string' }, name: { type: 'string', minLength: 1, maxLength: 160 }, genesysFlowId: { anyOf: [{ type: 'string', pattern: UUID }, { type: 'null' }] },
      version: { type: 'string', maxLength: 40 }, status: { type: 'string', enum: ['ativa', 'em-teste', 'inativa'] }, requiresCpf: { type: 'boolean' },
      businessHours: { type: 'string', maxLength: 120 }, owner: { type: 'string', maxLength: 120 }, description: { type: 'string', maxLength: 1000 },
      queues: { type: 'array', items: { type: 'string', maxLength: 120 }, maxItems: 50 } } } },
  }, async (req) => {
    need(req, 'catalog:write');
    if (!ID.test(req.params.id)) throw new HttpError(400, 'Identificador inválido.');
    const b = req.body;
    try {
      await db.query(`INSERT INTO ura (id, department_id, name, genesys_flow_id, version, status, requires_cpf, business_hours, owner, description, queues)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (id) DO UPDATE SET department_id=EXCLUDED.department_id, name=EXCLUDED.name, genesys_flow_id=EXCLUDED.genesys_flow_id, version=EXCLUDED.version,
          status=EXCLUDED.status, requires_cpf=EXCLUDED.requires_cpf, business_hours=EXCLUDED.business_hours, owner=EXCLUDED.owner,
          description=EXCLUDED.description, queues=EXCLUDED.queues, updated_at=now()`,
      [req.params.id, b.departmentId, b.name, b.genesysFlowId || null, b.version ?? '', b.status, b.requiresCpf ?? false, b.businessHours ?? '', b.owner ?? '', b.description ?? '', b.queues ?? []]);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === '23505') throw new HttpError(409, 'Este fluxo da Genesys já está vinculado a outra URA.');
      if (code === '23503') throw new HttpError(400, 'Departamento inexistente.');
      throw e;
    }
    await audit(req, 'URA salva', 'URA', req.params.id, `${b.name}${b.genesysFlowId ? ` · fluxo ${b.genesysFlowId}` : ''} · ${b.status}`);
    if (integration && b.genesysFlowId) {
      integration.importVersionsFor(b.genesysFlowId, req.params.id).catch((e) => req.log.warn(`importação de versões falhou: ${(e as Error).message}`));
    }
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/uras/:id', async (req) => {
    need(req, 'catalog:write');
    await db.query(`DELETE FROM ura WHERE id = $1`, [req.params.id]);
    await audit(req, 'URA excluída', 'URA', req.params.id);
    return { ok: true };
  });

  app.put<{ Params: { id: string }; Body: { name: string; departmentId?: string | null } }>('/api/queues/:id', {
    schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 160 }, departmentId: { type: ['string', 'null'] } } } },
  }, async (req) => {
    need(req, 'catalog:write');
    if (!ID.test(req.params.id)) throw new HttpError(400, 'Identificador inválido.');
    const cur = await db.query<{ source: string }>(`SELECT source FROM queue WHERE id = $1`, [req.params.id]);
    // Filas sincronizadas da Genesys: só o departamento pode ser ajustado aqui.
    if (cur.rows[0]?.source === 'genesys') await db.query(`UPDATE queue SET department_id = $2, updated_at = now() WHERE id = $1`, [req.params.id, req.body.departmentId ?? null]);
    else await db.query(`INSERT INTO queue (id, name, department_id) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, department_id=EXCLUDED.department_id, updated_at=now()`, [req.params.id, req.body.name, req.body.departmentId ?? null]);
    await audit(req, 'Fila salva', 'Fila', req.params.id, req.body.name);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/queues/:id', async (req) => {
    need(req, 'catalog:write');
    const r = await db.query(`DELETE FROM queue WHERE id = $1 AND source = 'manual'`, [req.params.id]);
    if (!r.rowCount) throw new HttpError(409, 'Somente filas cadastradas manualmente podem ser excluídas.');
    await audit(req, 'Fila excluída', 'Fila', req.params.id);
    return { ok: true };
  });

  // ───────────── Métricas ─────────────
  app.get<{ Querystring: { from?: string; to?: string } }>('/api/metrics/hourly', async (req) => {
    need(req, 'metrics:read');
    const { from, to } = req.query;
    if (!from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) throw new HttpError(400, 'Informe from e to no formato AAAA-MM-DD.');
    if ((Date.parse(to) - Date.parse(from)) / 86400000 > 400) throw new HttpError(400, 'Intervalo máximo de 400 dias.');
    return hourlyRecords(db, { from, to, timeZone: cfg.timeZone, humanTransferTypes: cfg.genesys?.humanTransferTypes ?? ['ACD'], uraIds: await allowedUras(req.user) });
  });

  // ───────────── Coleções do aplicativo (regras, tratamento de ocorrências, testes, alterações) ─────────────
  const COLLECTIONS: Record<string, { table: string; perm: Permission; label: string; ura: (id: string, data: Record<string, unknown>) => string | null; hasUraCol: boolean; global?: boolean }> = {
    rules: { table: 'alert_rule', perm: 'rules:write', label: 'Regra de alerta', ura: (_i, d) => (d.uraId && d.uraId !== 'all' ? String(d.uraId) : null), hasUraCol: false },
    'occurrence-states': { table: 'occurrence_state', perm: 'occurrences:write', label: 'Ocorrência', ura: (id) => id.split('|').at(-2) ?? null, hasUraCol: false },
    tests: { table: 'test_case', perm: 'tests:write', label: 'Teste', ura: (_i, d) => String(d.uraId ?? ''), hasUraCol: true },
    changes: { table: 'ura_change', perm: 'changes:write', label: 'Alteração de URA', ura: (_i, d) => String(d.uraId ?? ''), hasUraCol: true },
    // Tratamento das análises da Inteligência CX (não vinculado a uma única URA).
    'insight-states': { table: 'insight_state', perm: 'occurrences:write', label: 'Análise da Inteligência CX', ura: () => null, hasUraCol: false, global: true },
  };
  const coll = (name: string) => {
    const c = COLLECTIONS[name];
    if (!c) throw new HttpError(404, 'Coleção inexistente.');
    return c;
  };

  app.get<{ Params: { name: string } }>('/api/collections/:name', async (req) => {
    const c = coll(req.params.name);
    const rows = await db.query<{ id: string; data: Record<string, unknown> }>(`SELECT id, data FROM ${c.table} ORDER BY updated_at DESC LIMIT 5000`);
    const allowed = await allowedUras(req.user);
    return rows.rows.filter((r) => {
      if (!allowed || c.global) return true;
      const u = c.ura(r.id, r.data);
      return req.params.name === 'rules' ? !u || allowed.has(u) : !!u && allowed.has(u);
    }).map((r) => ({ ...r.data, id: r.id }));
  });

  app.put<{ Params: { name: string; id: string }; Body: Record<string, unknown> }>('/api/collections/:name/:id', {
    schema: { body: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (req) => {
    const c = coll(req.params.name);
    need(req, c.perm);
    if (!ID.test(req.params.id) || req.body.id !== req.params.id) throw new HttpError(400, 'Identificador inválido ou divergente.');
    const uraId = c.ura(req.params.id, req.body);
    if (c.hasUraCol && !uraId) throw new HttpError(400, 'uraId é obrigatório.');
    if (isScoped(req.user) && !c.global) await assertUra(req, uraId);
    if (c.hasUraCol) {
      await db.query(`INSERT INTO ${c.table} (id, ura_id, data, updated_by) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET ura_id=EXCLUDED.ura_id, data=EXCLUDED.data, updated_at=now(), updated_by=EXCLUDED.updated_by`,
        [req.params.id, uraId, req.body, req.user.email]);
    } else {
      await db.query(`INSERT INTO ${c.table} (id, data, updated_by) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, updated_at=now(), updated_by=EXCLUDED.updated_by`,
        [req.params.id, req.body, req.user.email]);
    }
    const summary = String(req.body.name ?? req.body.title ?? req.body.description ?? req.body.status ?? '');
    await audit(req, `${c.label} salva`, c.label, req.params.id, summary);
    return { ok: true };
  });

  app.delete<{ Params: { name: string; id: string } }>('/api/collections/:name/:id', async (req) => {
    const c = coll(req.params.name);
    need(req, c.perm);
    const cur = await db.query<{ data: Record<string, unknown> }>(`SELECT data FROM ${c.table} WHERE id = $1`, [req.params.id]);
    if (!cur.rowCount) return { ok: true };
    if (isScoped(req.user) && !c.global) await assertUra(req, c.ura(req.params.id, cur.rows[0].data));
    await db.query(`DELETE FROM ${c.table} WHERE id = $1`, [req.params.id]);
    await audit(req, `${c.label} excluída`, c.label, req.params.id);
    return { ok: true };
  });

  // ───────────── Metas ─────────────
  app.get('/api/settings/goals', async () => (await db.query(`SELECT value FROM app_setting WHERE key = 'goals'`)).rows[0]?.value ?? null);
  app.put<{ Body: Record<string, number> }>('/api/settings/goals', {
    schema: { body: { type: 'object', additionalProperties: { type: 'number', minimum: 0, maximum: 100 } } },
  }, async (req) => {
    need(req, 'goals:write');
    await db.query(`INSERT INTO app_setting (key, value, updated_by) VALUES ('goals',$1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now(), updated_by=EXCLUDED.updated_by`, [req.body, req.user.email]);
    await audit(req, 'Metas alteradas', 'Metas', undefined, Object.entries(req.body).map(([k, v]) => `${k}=${v}`).join(', '));
    return { ok: true };
  });

  // ───────────── Auditoria ─────────────
  app.get<{ Querystring: { limit?: string; entity?: string; q?: string } }>('/api/audit', async (req) => {
    need(req, 'audit:read');
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit ?? 500)));
    const r = await db.query(`SELECT id::text, at, user_name AS "user", action, entity, entity_id AS "entityId", details FROM audit_log
      WHERE ($1::text IS NULL OR entity = $1) AND ($2::text IS NULL OR action ILIKE '%'||$2||'%' OR details ILIKE '%'||$2||'%')
      ORDER BY at DESC LIMIT $3`, [req.query.entity || null, req.query.q || null, limit]);
    return r.rows;
  });

  /** Eventos de auditoria originados no navegador (ações que não passam por outra rota, ex.: exportação). */
  const CLIENT_EVENTS = new Set(['Relatório exportado', 'Auditoria exportada']);
  app.post<{ Body: { action: string; entity: string; entityId?: string; details?: string } }>('/api/audit/events', {
    schema: { body: { type: 'object', required: ['action', 'entity'], properties: { action: { type: 'string' }, entity: { type: 'string', maxLength: 60 }, entityId: { type: 'string', maxLength: 200 }, details: { type: 'string', maxLength: 1000 } } } },
  }, async (req) => {
    if (!CLIENT_EVENTS.has(req.body.action)) throw new HttpError(400, 'Ação de auditoria não permitida.');
    await audit(req, req.body.action, req.body.entity, req.body.entityId, req.body.details);
    return { ok: true };
  });

  // ───────────── Inteligência CX: redação opcional por IA ─────────────
  app.get('/api/ai/status', async () => ai.status());

  app.post<{ Body: AiPayload }>('/api/ai/summary', { schema: { body: AI_PAYLOAD_SCHEMA }, bodyLimit: 200 * 1024 }, async (req, reply) => {
    need(req, 'metrics:read');
    if (!ai.cfg.enabled) throw new HttpError(409, 'Redação por IA desativada no servidor.');
    const pii = findPii(req.body);
    if (pii) {
      await audit(req, 'Envio à IA bloqueado', 'Inteligência CX', undefined, `Possível dado pessoal detectado (${pii}).`);
      throw new HttpError(400, `Envio bloqueado: o conteúdo parece conter dado pessoal (${pii}). Somente agregados podem ser enviados à IA.`);
    }
    if (!ai.allow(req.user.id)) return reply.status(429).send({ erro: 'Limite de uso da IA atingido. Tente novamente mais tarde.' });
    try {
      const r = await ai.summarize(req.body);
      await audit(req, 'Resumo gerado por IA', 'Inteligência CX', undefined, `modelo ${r.model} · ${r.inputTokens} tokens de entrada · ${r.outputTokens} de saída · ${req.body.analises.length} análises`);
      return { text: r.text, model: r.model };
    } catch (e) {
      req.log.warn(`IA: ${(e as Error).message}`);
      throw new HttpError(502, `Não foi possível gerar o resumo por IA: ${(e as Error).message}`);
    }
  });

  // ───────────── Usuários e perfis ─────────────
  app.get('/api/users', async (req) => {
    need(req, 'users:manage');
    const r = await db.query(`SELECT u.id, u.email, u.name, u.profile, u.active, u.last_login AS "lastLogin",
      coalesce(array_agg(d.department_id) FILTER (WHERE d.department_id IS NOT NULL), '{}') AS departments
      FROM app_user u LEFT JOIN user_department d ON d.user_id = u.id GROUP BY u.id ORDER BY u.name`);
    return r.rows;
  });

  app.put<{ Params: { id: string }; Body: { email: string; name: string; profile: string; active: boolean; departments: string[] } }>('/api/users/:id', {
    schema: { body: { type: 'object', required: ['email', 'name', 'profile', 'active', 'departments'], properties: {
      email: { type: 'string', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', maxLength: 200 }, name: { type: 'string', minLength: 1, maxLength: 160 },
      profile: { type: 'string', enum: ['admin', 'analista_cx', 'supervisor', 'gestor'] }, active: { type: 'boolean' },
      departments: { type: 'array', items: { type: 'string' }, maxItems: 50 } } } },
  }, async (req) => {
    need(req, 'users:manage');
    if (!ID.test(req.params.id)) throw new HttpError(400, 'Identificador inválido.');
    const b = req.body;
    if (req.params.id === req.user.id && (b.profile !== 'admin' || !b.active)) throw new HttpError(409, 'Você não pode remover o seu próprio acesso de administrador.');
    if (b.profile === 'supervisor' && !b.departments.length) throw new HttpError(400, 'Supervisores precisam de ao menos um departamento.');
    try {
      await tx(db, async (c) => {
        await c.query(`INSERT INTO app_user (id, email, name, profile, active) VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, name=EXCLUDED.name, profile=EXCLUDED.profile, active=EXCLUDED.active`,
        [req.params.id, b.email.toLowerCase(), b.name, b.profile, b.active]);
        await c.query(`DELETE FROM user_department WHERE user_id = $1`, [req.params.id]);
        if (b.departments.length) await c.query(`INSERT INTO user_department (user_id, department_id) SELECT $1, unnest($2::text[])`, [req.params.id, b.departments]);
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === '23505') throw new HttpError(409, 'Já existe um usuário com este e-mail.');
      if (code === '23503') throw new HttpError(400, 'Departamento inexistente.');
      throw e;
    }
    await audit(req, 'Usuário salvo', 'Usuário', req.params.id, `${b.email} · ${b.profile} · ${b.active ? 'ativo' : 'inativo'}${b.departments.length ? ` · ${b.departments.join(', ')}` : ''}`);
    return { ok: true };
  });

  // ───────────── Integração Genesys (leitura + disparo de coletas somente leitura) ─────────────
  app.get('/api/integration/status', async (req) => {
    need(req, 'integration:read');
    const counts = await db.query(`SELECT
      (SELECT count(*) FROM genesys_flow)::int AS flows, (SELECT count(*) FROM genesys_milestone)::int AS milestones,
      (SELECT count(*) FROM genesys_outcome)::int AS outcomes, (SELECT count(*) FROM queue WHERE source='genesys')::int AS queues,
      (SELECT count(*) FROM ura WHERE genesys_flow_id IS NOT NULL)::int AS "linkedUras", (SELECT count(*) FROM flow_hour)::int AS "factRows",
      (SELECT min(interval_start) FROM flow_hour) AS "dataFrom", (SELECT max(interval_start) FROM flow_hour) AS "dataTo",
      (SELECT count(*) FROM backfill_window WHERE status <> 'ok')::int AS "backfillPending"`);
    const last = await db.query(`SELECT DISTINCT ON (collector) collector, status, started_at AS "startedAt", finished_at AS "finishedAt", rows, error
      FROM sync_run ORDER BY collector, started_at DESC`);
    return {
      configured: !!integration,
      mode: 'somente_leitura',
      region: cfg.genesys?.regionDomain || null,
      scheduler: cfg.scheduler,
      clientStats: integration?.client.stats ?? null,
      ...counts.rows[0],
      lastRuns: last.rows,
    };
  });

  app.get('/api/integration/runs', async (req) => {
    need(req, 'integration:read');
    return (await db.query(`SELECT id::text, collector, interval_from AS "from", interval_to AS "to", started_at AS "startedAt", finished_at AS "finishedAt", status, rows, error, triggered_by AS "triggeredBy"
      FROM sync_run ORDER BY started_at DESC LIMIT 100`)).rows;
  });

  app.post<{ Body: { kind: 'dicionarios' | 'incremental' | 'backfill'; days?: number } }>('/api/integration/sync', {
    schema: { body: { type: 'object', required: ['kind'], properties: { kind: { type: 'string', enum: ['dicionarios', 'incremental', 'backfill'] }, days: { type: 'integer', minimum: 1, maximum: 400 } } } },
  }, async (req, reply: FastifyReply) => {
    need(req, 'integration:manage');
    if (!integration) throw new HttpError(409, 'Integração com a Genesys Cloud não configurada no servidor.');
    const by = req.user.email;
    await audit(req, 'Coleta solicitada', 'Integração', req.body.kind, req.body.days ? `${req.body.days} dias` : undefined);
    const p = req.body.kind === 'dicionarios' ? integration.syncDictionaries(by)
      : req.body.kind === 'incremental' ? integration.collectIncremental(3, by)
        : integration.runBackfill(req.body.days ?? 30, by);
    // Coletas longas continuam em segundo plano; o status fica em /api/integration/runs.
    const result = await Promise.race([p.then((r) => ({ done: true as const, r })), new Promise<{ done: false }>((res) => setTimeout(() => res({ done: false }), 15_000))]);
    p.catch((e) => req.log.warn(`coleta ${req.body.kind} falhou: ${(e as Error).message}`));
    if (!result.done) return reply.status(202).send({ status: 'em_andamento' });
    if (result.r === null) return reply.status(409).send({ erro: 'Já existe uma coleta deste tipo em execução.' });
    return { status: 'concluida', resultado: result.r };
  });

  app.get('/api/genesys/flows', async (req) => {
    need(req, 'integration:read');
    return (await db.query(`SELECT g.flow_id AS id, g.name, g.type, g.division_name AS division, g.published_version AS "publishedVersion", g.date_published AS "datePublished",
      u.id AS "linkedUraId" FROM genesys_flow g LEFT JOIN ura u ON u.genesys_flow_id = g.flow_id ORDER BY g.name`)).rows;
  });
  app.get('/api/genesys/milestones', async (req) => {
    need(req, 'integration:read');
    return (await db.query(`SELECT m.id, m.name, m.description, i.role, i.step_label AS "stepLabel", i.ura_id AS "uraId" FROM genesys_milestone m
      LEFT JOIN instrumentation_map i ON i.genesys_id = m.id AND i.kind = 'milestone' ORDER BY m.name`)).rows;
  });
  app.get('/api/genesys/outcomes', async (req) => {
    need(req, 'integration:read');
    return (await db.query(`SELECT o.id, o.name, o.description, i.role, i.step_label AS "stepLabel", i.ura_id AS "uraId" FROM genesys_outcome o
      LEFT JOIN instrumentation_map i ON i.genesys_id = o.id AND i.kind = 'outcome' ORDER BY o.name`)).rows;
  });

  app.put<{ Params: { kind: string; id: string }; Body: { role: string | null; stepLabel?: string | null; uraId?: string | null } }>('/api/instrumentation/:kind/:id', {
    schema: { body: { type: 'object', required: ['role'], properties: { role: { type: ['string', 'null'] }, stepLabel: { type: ['string', 'null'], maxLength: 120 }, uraId: { type: ['string', 'null'] } } } },
  }, async (req) => {
    need(req, 'integration:manage');
    const { kind, id } = req.params;
    if (kind !== 'milestone' && kind !== 'outcome') throw new HttpError(400, 'Tipo inválido.');
    if (!new RegExp(UUID).test(id)) throw new HttpError(400, 'Identificador inválido.');
    if (!req.body.role) await db.query(`DELETE FROM instrumentation_map WHERE genesys_id = $1 AND kind = $2`, [id, kind]);
    else {
      try {
        await db.query(`INSERT INTO instrumentation_map (genesys_id, kind, role, step_label, ura_id) VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (genesys_id, kind) DO UPDATE SET role=EXCLUDED.role, step_label=EXCLUDED.step_label, ura_id=EXCLUDED.ura_id`,
        [id, kind, req.body.role, req.body.stepLabel ?? null, req.body.uraId ?? null]);
      } catch (e) {
        if ((e as { code?: string }).code === '23514') throw new HttpError(400, 'Papel de instrumentação inválido.');
        throw e;
      }
    }
    await audit(req, 'Instrumentação mapeada', 'Instrumentação', `${kind}:${id}`, req.body.role ?? 'removido');
    return { ok: true };
  });

  return app;
}
