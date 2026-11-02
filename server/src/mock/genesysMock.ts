/**
 * Servidor Genesys Cloud SIMULADO — somente para desenvolvimento e testes.
 *
 * Implementa o subconjunto de endpoints usado pelos adaptadores, com os formatos
 * dos schemas oficiais (FlowEntityListing, FlowAggregateQueryResponse, AsyncQueryStatus...).
 * Os números são fictícios e determinísticos. Também permite simular limite de
 * requisições (HTTP 429) e falhas para exercitar retry e retomada.
 */
import Fastify, { type FastifyInstance } from 'fastify';

export const MOCK = {
  clientId: 'mock-client-id',
  clientSecret: 'mock-client-secret',
  flows: [
    { id: '7c1d6a10-0000-4000-8000-000000000001', name: 'Gazin - URA Consorcio', type: 'INBOUNDCALL' },
    { id: '7c1d6a10-0000-4000-8000-000000000002', name: 'Gazin - URA GazinBank Conta', type: 'INBOUNDCALL' },
    { id: '7c1d6a10-0000-4000-8000-000000000003', name: 'Gazin - URA SAC', type: 'INBOUNDCALL' },
    { id: '7c1d6a10-0000-4000-8000-000000000009', name: 'Fila - Mensagens de espera', type: 'INQUEUECALL' },
  ],
  milestones: [
    { id: 'a1000000-0000-4000-8000-000000000001', name: 'CPF_Tentativa' },
    { id: 'a1000000-0000-4000-8000-000000000002', name: 'CPF_Falha' },
    { id: 'a1000000-0000-4000-8000-000000000003', name: 'CPF_Excedido' },
    { id: 'a1000000-0000-4000-8000-000000000004', name: 'Menu_Principal' },
    { id: 'a1000000-0000-4000-8000-000000000005', name: 'Opcao_Invalida' },
    { id: 'a1000000-0000-4000-8000-000000000006', name: 'API_Consulta_Falha' },
  ],
  outcomes: [
    { id: 'b2000000-0000-4000-8000-000000000001', name: 'Autosservico_Segunda_Via' },
    { id: 'b2000000-0000-4000-8000-000000000002', name: 'Identificacao_CPF' },
  ],
  queues: [
    { id: 'c3000000-0000-4000-8000-000000000001', name: 'Consórcio Cotas' },
    { id: 'c3000000-0000-4000-8000-000000000002', name: 'Conta Digital' },
    { id: 'c3000000-0000-4000-8000-000000000003', name: 'Assistência Técnica' },
  ],
};

const FLOW_METRICS = new Set(['nFlow', 'nFlowMilestone', 'nFlowOutcome', 'nFlowOutcomeFailed', 'oFlowMilestone', 'tFlow', 'tFlowDisconnect', 'tFlowExit', 'tFlowOutcome']);

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

export interface MockOptions {
  /** A cada N consultas de agregados, responde 429 (Retry-After: 1). 0 = nunca. */
  rateLimitEvery?: number;
  /** Intervalos (início ISO) cuja consulta assíncrona deve falhar — para testar retomada do backfill. */
  failJobsStartingAt?: Set<string>;
}

export interface MockState {
  calls: { method: string; path: string }[];
  aggregateQueries: number;
}

export async function startGenesysMock(opts: MockOptions = {}, port = 0): Promise<{ app: FastifyInstance; url: string; state: MockState }> {
  const app = Fastify({ logger: false });
  const state: MockState = { calls: [], aggregateQueries: 0 };
  const jobs = new Map<string, { polls: number; results: unknown[]; fail: boolean }>();
  const TOKEN = 'mock-access-token';

  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_r, body, done) => done(null, body));
  app.addHook('onRequest', async (req, reply) => {
    state.calls.push({ method: req.method, path: req.url.split('?')[0] });
    if (req.url.startsWith('/oauth/')) return;
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return reply.status(401).send({ message: 'Unauthorized' });
  });

  app.post('/oauth/token', async (req, reply) => {
    const expected = 'Basic ' + Buffer.from(`${MOCK.clientId}:${MOCK.clientSecret}`).toString('base64');
    if (req.headers.authorization !== expected || req.body !== 'grant_type=client_credentials') return reply.status(401).send({ error: 'invalid_client' });
    return { access_token: TOKEN, token_type: 'bearer', expires_in: 86399 };
  });

  const page = <T>(items: T[], q: Record<string, string>) => {
    const pageSize = Math.max(1, Number(q.pageSize ?? 25));
    const pageNumber = Math.max(1, Number(q.pageNumber ?? 1));
    return { entities: items.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), pageSize, pageNumber, total: items.length, pageCount: Math.ceil(items.length / pageSize) };
  };

  app.get<{ Querystring: Record<string, string> }>('/api/v2/flows', async (req) => {
    const flows = MOCK.flows.filter((f) => !req.query.type || f.type === req.query.type).map((f, i) => ({
      ...f, active: true, division: { name: 'Home' }, publishedVersion: { id: `${3 + i}.0`, datePublished: new Date(Date.now() - (5 + i) * 86400_000).toISOString() },
    }));
    return page(flows, req.query);
  });
  app.get<{ Params: { id: string }; Querystring: Record<string, string> }>('/api/v2/flows/:id/versions', async (req, reply) => {
    const i = MOCK.flows.findIndex((f) => f.id === req.params.id);
    if (i < 0) return reply.status(404).send({ message: 'Not found' });
    const versions = [0, 1, 2].map((k) => ({ id: `${3 + i - k}.0`, datePublished: new Date(Date.now() - (5 + i + k * 20) * 86400_000).toISOString() }));
    return page(versions, req.query);
  });
  app.get<{ Querystring: Record<string, string> }>('/api/v2/flows/milestones', async (req) => page(MOCK.milestones, req.query));
  app.get<{ Querystring: Record<string, string> }>('/api/v2/flows/outcomes', async (req) => page(MOCK.outcomes, req.query));
  app.get<{ Querystring: Record<string, string> }>('/api/v2/routing/queues', async (req) => page(MOCK.queues, req.query));

  type Query = { interval?: string; granularity?: string; groupBy?: string[]; metrics?: string[]; filter?: { predicates?: { dimension: string; value?: string }[] } };

  const aggregate = (q: Query) => {
    const [a, b] = q.interval!.split('/').map((x) => Date.parse(x));
    const flowIds = (q.filter?.predicates ?? []).filter((p) => p.dimension === 'flowId').map((p) => p.value!);
    const flows = (flowIds.length ? MOCK.flows.filter((f) => flowIds.includes(f.id)) : MOCK.flows.filter((f) => f.type === 'INBOUNDCALL'));
    const g = q.groupBy ?? [];
    const results: { group: Record<string, string>; data: { interval: string; metrics: { metric: string; stats: Record<string, number> }[] }[] }[] = [];
    const add = (group: Record<string, string>, interval: string, metrics: { metric: string; stats: Record<string, number> }[]) => {
      const key = JSON.stringify(group);
      let r = results.find((x) => JSON.stringify(x.group) === key);
      if (!r) results.push((r = { group, data: [] }));
      r.data.push({ interval, metrics: metrics.filter((m) => q.metrics!.includes(m.metric)) });
    };
    for (let t = a; t < b; t += 3600_000) {
      const hourOfDay = new Date(t).getUTCHours() - 3; // aproxima horário de Brasília
      const h = (hourOfDay + 24) % 24;
      const volumeShape = h >= 8 && h < 20 ? 1 : h >= 6 && h < 22 ? 0.35 : 0.05;
      const interval = `${new Date(t).toISOString()}/${new Date(t + 3600_000).toISOString()}`;
      for (const f of flows) {
        const r = hash(`${f.id}|${t}`);
        const n = Math.round((60 + 40 * r) * volumeShape);
        if (!n) continue;
        const disc = Math.round(n * (0.12 + 0.06 * r));
        const exits = n - disc;
        const transfers = Math.round(exits * 0.6);
        const version = `${3 + MOCK.flows.indexOf(f)}.0`;
        if (g.includes('flowMilestoneId')) {
          const att = Math.round(n * 0.95);
          const counts = [att, Math.round(att * 0.15), Math.round(att * 0.04), Math.round(n * 0.85), Math.round(n * 0.08), Math.round(n * 0.01 * (1 + r))];
          MOCK.milestones.forEach((m, i) => counts[i] && add({ flowId: f.id, flowMilestoneId: m.id }, interval, [{ metric: 'nFlowMilestone', stats: { count: counts[i] } }]));
        } else if (g.includes('flowOutcomeId')) {
          const ss = Math.round(n * 0.35);
          add({ flowId: f.id, flowOutcomeId: MOCK.outcomes[0].id, flowOutcomeValue: 'SUCCESS' }, interval, [{ metric: 'nFlowOutcome', stats: { count: Math.round(ss * 0.7) } }, { metric: 'tFlowOutcome', stats: { count: Math.round(ss * 0.7), sum: Math.round(ss * 0.7) * 45000 } }]);
          add({ flowId: f.id, flowOutcomeId: MOCK.outcomes[0].id, flowOutcomeValue: 'FAILURE' }, interval, [{ metric: 'nFlowOutcome', stats: { count: Math.round(ss * 0.3) } }, { metric: 'nFlowOutcomeFailed', stats: { count: Math.round(ss * 0.3) } }]);
        } else if (g.includes('transferType')) {
          const q1 = MOCK.queues[MOCK.flows.indexOf(f) % MOCK.queues.length];
          add({ flowId: f.id, transferType: 'ACD', transferTargetName: q1.name }, interval, [{ metric: 'tFlowExit', stats: { count: transfers, sum: transfers * 80000 } }]);
          // Saídas sem transferência não têm transferType.
          add({ flowId: f.id }, interval, [{ metric: 'tFlowExit', stats: { count: exits - transfers, sum: (exits - transfers) * 60000 } }]);
        } else {
          const group: Record<string, string> = { flowId: f.id };
          if (g.includes('flowVersion')) group.flowVersion = version;
          add(group, interval, [
            { metric: 'nFlow', stats: { count: n } },
            { metric: 'tFlow', stats: { count: n, sum: n * Math.round(70000 + 30000 * r), max: 300000, min: 1500 } },
            { metric: 'tFlowDisconnect', stats: { count: disc, sum: disc * 40000 } },
            { metric: 'tFlowExit', stats: { count: exits, sum: exits * 80000 } },
          ]);
        }
      }
    }
    return results;
  };

  const validate = (q: Query) => {
    if (!q.interval || !/^.+\/.+$/.test(q.interval)) return 'interval é obrigatório';
    if (!q.metrics?.length) return 'metrics é obrigatório';
    const bad = q.metrics.find((m) => !FLOW_METRICS.has(m));
    if (bad) return `métrica inválida: ${bad}`;
    if (q.granularity && q.granularity !== 'PT1H') return 'o simulador suporta apenas granularity PT1H';
    return null;
  };

  app.post<{ Body: Query }>('/api/v2/analytics/flows/aggregates/query', async (req, reply) => {
    state.aggregateQueries++;
    if (opts.rateLimitEvery && state.aggregateQueries % opts.rateLimitEvery === 0) {
      return reply.status(429).header('Retry-After', '1').send({ message: 'Rate limit exceeded the maximum.' });
    }
    const err = validate(req.body);
    if (err) return reply.status(400).send({ message: err });
    return { results: aggregate(req.body) };
  });

  app.post<{ Body: Query & { pageSize?: number } }>('/api/v2/analytics/flows/aggregates/jobs', async (req, reply) => {
    const err = validate(req.body);
    if (err) return reply.status(400).send({ message: err });
    const id = `job-${jobs.size + 1}-${Math.round(hash(req.body.interval!) * 1e6)}`;
    const start = new Date(Date.parse(req.body.interval!.split('/')[0])).toISOString();
    jobs.set(id, { polls: 0, results: aggregate(req.body), fail: !!opts.failJobsStartingAt?.has(start) });
    return reply.status(202).send({ jobId: id });
  });
  app.get<{ Params: { id: string } }>('/api/v2/analytics/flows/aggregates/jobs/:id', async (req, reply) => {
    const j = jobs.get(req.params.id);
    if (!j) return reply.status(404).send({ message: 'Not found' });
    j.polls++;
    if (j.fail) return { state: 'FAILED', errorMessage: 'Falha simulada no job.' };
    return { state: j.polls < 2 ? 'PENDING' : 'FULFILLED', submissionDate: new Date().toISOString() };
  });
  app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>('/api/v2/analytics/flows/aggregates/jobs/:id/results', async (req, reply) => {
    const j = jobs.get(req.params.id);
    if (!j) return reply.status(404).send({ message: 'Not found' });
    const half = Math.ceil(j.results.length / 2);
    return req.query.cursor === 'p2' ? { results: j.results.slice(half) } : { results: j.results.slice(0, half), cursor: j.results.length > half ? 'p2' : undefined };
  });

  app.setNotFoundHandler((req, reply) => reply.status(404).send({ message: `Endpoint não simulado: ${req.method} ${req.url}` }));
  const url = await app.listen({ port, host: '127.0.0.1' });
  return { app, url, state };
}
