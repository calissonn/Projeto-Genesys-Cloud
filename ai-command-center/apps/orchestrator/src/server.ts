import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { DecisionInput, type ServerMessage } from '@acc/shared';
import type { EventBus } from './events/bus.ts';
import { Engine, EngineError } from './scheduler/engine.ts';
import type { Repository } from './store/repository.ts';

export interface ServerOptions {
  engine: Engine;
  repo: Repository;
  bus: EventBus;
  mode: 'demo' | 'real';
  token: string;
  allowedOrigin: string;
}

const MAX_BODY = 64 * 1024;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function tokenFrom(req: IncomingMessage, url: URL): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  const header = req.headers['x-acc-token'];
  if (typeof header === 'string') return header;
  return url.searchParams.get('token');
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new EngineError('Corpo da requisição muito grande', 413);
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new EngineError('JSON inválido');
  }
}

type Handler = (ctx: { req: IncomingMessage; url: URL; params: string[] }) => unknown | Promise<unknown>;

export function createAccServer(o: ServerOptions): { server: Server; close: () => Promise<void> } {
  const { engine, repo } = o;

  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/api\/health$/, () => ({ ok: true, mode: o.mode })],
    ['GET', /^\/api\/snapshot$/, () => engine.snapshot()],
    [
      'GET',
      /^\/api\/events$/,
      ({ url }) =>
        repo.listEvents({
          after: Number(url.searchParams.get('after') ?? 0) || 0,
          projectId: url.searchParams.get('projectId') ?? undefined,
          agentId: url.searchParams.get('agentId') ?? undefined,
          taskId: url.searchParams.get('taskId') ?? undefined,
          runId: url.searchParams.get('runId') ?? undefined,
          limit: Number(url.searchParams.get('limit') ?? 1000) || 1000,
        }),
    ],
    ['POST', /^\/api\/projects$/, async ({ req }) => engine.createProject(await readJson(req))],
    [
      'GET',
      /^\/api\/projects\/([\w-]+)$/,
      ({ params }) => {
        const project = repo.getProject(params[0]!);
        if (!project) throw new EngineError('Projeto não encontrado', 404);
        return { project, tasks: repo.listTasks(project.id), approvals: repo.listApprovals({ projectId: project.id }) };
      },
    ],
    ['POST', /^\/api\/projects\/([\w-]+)\/pause$/, ({ params }) => engine.pauseProject(params[0]!)],
    ['POST', /^\/api\/projects\/([\w-]+)\/resume$/, ({ params }) => engine.resumeProject(params[0]!)],
    ['POST', /^\/api\/projects\/([\w-]+)\/cancel$/, ({ params }) => engine.cancelProject(params[0]!)],
    [
      'POST',
      /^\/api\/approvals\/([\w-]+)$/,
      async ({ req, params }) => {
        const parsed = DecisionInput.safeParse(await readJson(req));
        if (!parsed.success) throw new EngineError('Decisão inválida: use "approve" ou "reject"');
        return engine.decide(params[0]!, parsed.data.decision, parsed.data.reason);
      },
    ],
    [
      'GET',
      /^\/api\/agents\/([\w-]+)$/,
      ({ params }) => {
        const agent = repo.getAgent(params[0]!);
        if (!agent) throw new EngineError('Agente não encontrado', 404);
        const history = repo.listEvents({ agentId: agent.id, limit: 5000 }).filter((e) => e.type !== 'agent.upserted').slice(-300);
        return { agent, history };
      },
    ],
    [
      'GET',
      /^\/api\/runs\/([\w-]+)$/,
      ({ params }) => {
        const run = repo.getRun(params[0]!);
        if (!run) throw new EngineError('Execução não encontrada', 404);
        return { run, events: repo.listEvents({ runId: run.id, limit: 5000 }) };
      },
    ],
  ];

  function send(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && origin === o.allowedOrigin) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'origin');
      res.setHeader('access-control-allow-headers', 'authorization, content-type, x-acc-token');
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();

    const url = new URL(req.url ?? '/', 'http://localhost');
    if (origin && origin !== o.allowedOrigin) return send(res, 403, { error: 'Origem não permitida' });
    const token = tokenFrom(req, url);
    if (!token || !safeEqual(token, o.token)) return send(res, 401, { error: 'Token inválido' });

    for (const [method, pattern, handler] of routes) {
      const m = pattern.exec(url.pathname);
      if (!m || method !== req.method) continue;
      try {
        return send(res, 200, await handler({ req, url, params: m.slice(1) }));
      } catch (err) {
        if (err instanceof EngineError) return send(res, err.status, { error: err.message });
        console.error('[server]', err);
        return send(res, 500, { error: 'Erro interno' });
      }
    }
    send(res, 404, { error: 'Rota não encontrada' });
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
  const clients = new Set<WebSocket>();

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const origin = req.headers.origin;
    const token = tokenFrom(req, url);
    if (url.pathname !== '/ws' || (origin && origin !== o.allowedOrigin) || !token || !safeEqual(token, o.token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws);
      const hello: ServerMessage = { type: 'hello', mode: o.mode, seq: repo.lastSeq() };
      ws.send(JSON.stringify(hello));
      ws.on('close', () => clients.delete(ws));
      ws.on('error', () => clients.delete(ws));
    });
  });

  const unsubscribe = o.bus.subscribe((event) => {
    const data = JSON.stringify({ type: 'event', event } satisfies ServerMessage);
    for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(data);
  });

  return {
    server,
    close: () =>
      new Promise<void>((resolve) => {
        unsubscribe();
        for (const ws of clients) ws.terminate();
        wss.close();
        server.close(() => resolve());
      }),
  };
}
