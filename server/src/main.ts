/**
 * Ponto de entrada do backend.
 *  1. Lê a configuração (variáveis de ambiente)
 *  2. Aplica as migrações do banco
 *  3. Sobe a API e, se configurado, o agendador da integração Genesys (somente leitura)
 * O front-end (build estático) deve ser servido pelo proxy reverso/autenticação (ver docs/DEPLOY.md).
 */
import { AiService, loadAiConfig } from './ai/summary.js';
import { buildApp } from './api/app.js';
import { loadServerConfig } from './config.js';
import { migrate } from './db/migrate.js';
import { createPool } from './db/pool.js';
import { GenesysIntegration, startScheduler } from './sync/integration.js';

async function main() {
  const cfg = loadServerConfig();
  const db = createPool(cfg.databaseUrl);
  const applied = await migrate(db);
  if (applied.length) console.log(`[db] migrações aplicadas: ${applied.join(', ')}`);

  const integration = cfg.genesys ? new GenesysIntegration(db, cfg.genesys, cfg.timeZone) : null;
  if (!integration) console.log('[genesys] integração NÃO configurada — o sistema funciona, mas sem dados de produção.');
  if (cfg.genesys && (cfg.genesys.apiBaseUrl.startsWith('http://') || !cfg.genesys.apiBaseUrl.includes(cfg.genesys.regionDomain || '§'))) {
    console.warn(`[genesys] ATENÇÃO: usando URL alternativa (${cfg.genesys.apiBaseUrl}) — apenas para testes.`);
  }

  const ai = new AiService(loadAiConfig(process.env));
  console.log(ai.cfg.enabled ? `[ia] redação por IA ATIVADA (modelo ${ai.cfg.model}) — apenas agregados são enviados.` : '[ia] redação por IA desativada.');
  const app = await buildApp({ db, cfg, integration, ai });
  let stopScheduler: (() => void) | null = null;
  if (integration && cfg.scheduler.enabled) {
    stopScheduler = startScheduler(integration, { ...cfg.scheduler, timeZone: cfg.timeZone }, (m) => app.log.warn(m));
    app.log.info('[agendador] ativo');
  }
  await app.listen({ port: cfg.port, host: cfg.host });

  const shutdown = async () => {
    stopScheduler?.();
    await app.close();
    await db.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
