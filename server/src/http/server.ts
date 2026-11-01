import { createServer } from 'node:http';
import { integrationConfigured } from '../config.js';

/**
 * API do backend consumida pelo front-end. Nesta etapa expõe apenas o status;
 * os endpoints de métricas serão ligados ao PostgreSQL quando a integração for configurada.
 * TODO (Etapa 3): autenticação corporativa (SSO/OIDC) e controle de acesso por perfil antes de qualquer rota de dados.
 */
const port = Number(process.env.PORT ?? 8080);

createServer((req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'GET') return send(405, { erro: 'Método não permitido.' });
  if (req.url === '/api/health') return send(200, { ok: true });
  if (req.url === '/api/integration/status') {
    return send(200, { genesys: integrationConfigured() ? 'credenciais presentes' : 'nao_configurada', modo: 'somente_leitura' });
  }
  if (req.url?.startsWith('/api/metrics/')) {
    return send(503, { erro: 'Integração com a Genesys Cloud não configurada. Os dados ainda não estão disponíveis.' });
  }
  return send(404, { erro: 'Rota não encontrada.' });
}).listen(port, () => console.log(`Gazin URA Intelligence API em http://localhost:${port}`));
