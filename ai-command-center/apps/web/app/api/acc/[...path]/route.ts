import { isSameOrigin, orchestrator } from '@/lib/orchestrator.server';

export const dynamic = 'force-dynamic';

// Somente as rotas conhecidas do orquestrador são repassadas.
const ALLOWED_GET = /^(health|snapshot|events|projects\/[\w-]+|agents\/[\w-]+|runs\/[\w-]+)$/;
const ALLOWED_POST = /^(projects|projects\/[\w-]+\/(pause|resume|cancel)|approvals\/[\w-]+)$/;

type Ctx = { params: Promise<{ path: string[] }> };

async function forward(req: Request, ctx: Ctx, method: 'GET' | 'POST') {
  const path = (await ctx.params).path.join('/');
  if (!(method === 'GET' ? ALLOWED_GET : ALLOWED_POST).test(path)) {
    return Response.json({ error: 'Rota não encontrada' }, { status: 404 });
  }
  if (method === 'POST') {
    if (!isSameOrigin(req)) return Response.json({ error: 'Origem não permitida' }, { status: 403 });
    if (!req.headers.get('content-type')?.includes('application/json')) {
      return Response.json({ error: 'Use application/json' }, { status: 415 });
    }
  }
  let orch;
  try {
    orch = orchestrator();
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
  const search = new URL(req.url).search;
  try {
    const res = await fetch(`${orch.http}/api/${path}${search}`, {
      method,
      headers: { authorization: `Bearer ${orch.token}`, 'content-type': 'application/json' },
      body: method === 'POST' ? await req.text() : undefined,
      cache: 'no-store',
    });
    return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json; charset=utf-8' } });
  } catch {
    return Response.json({ error: 'Orquestrador indisponível. Ele está rodando? (npm run dev)' }, { status: 502 });
  }
}

export const GET = (req: Request, ctx: Ctx) => forward(req, ctx, 'GET');
export const POST = (req: Request, ctx: Ctx) => forward(req, ctx, 'POST');
