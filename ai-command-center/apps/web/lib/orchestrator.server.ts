import 'server-only';

/** Endereço e token do orquestrador. Só é lido no servidor: o token nunca chega ao navegador. */
export function orchestrator() {
  const port = process.env.ACC_PORT ?? '4317';
  const token = process.env.ACC_TOKEN;
  if (!token || token === 'troque-por-um-valor-aleatorio') {
    throw new Error('Defina ACC_TOKEN no arquivo .env da raiz do projeto (o mesmo usado pelo orquestrador).');
  }
  return { http: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}/ws`, token };
}

/** Protege as ações (POST) contra requisições vindas de outros sites. */
export function isSameOrigin(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin';
  const origin = req.headers.get('origin');
  return !!origin && origin === new URL(req.url).origin;
}
