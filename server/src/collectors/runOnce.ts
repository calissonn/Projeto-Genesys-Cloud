import { loadConfig } from '../config.js';
import { Repo } from '../db/repo.js';
import { GenesysAuth } from '../genesys/auth.js';
import { GenesysClient } from '../genesys/client.js';
import { collectFlowHours } from './collectFlowHours.js';

/** Execução manual: coleta as últimas 2 horas. Uso: npm run collect:once */
async function main() {
  const cfg = loadConfig();
  if (!cfg.databaseUrl) throw new Error('DATABASE_URL não configurada.');
  const client = new GenesysClient(new GenesysAuth(cfg.regionDomain, cfg.clientId, cfg.clientSecret), {
    regionDomain: cfg.regionDomain, maxRequestsPerMinute: cfg.maxRequestsPerMinute,
  });
  const to = new Date();
  to.setMinutes(0, 0, 0);
  to.setHours(to.getHours() + 1);
  const from = new Date(to.getTime() - 2 * 3600_000);
  const n = await collectFlowHours(client, Repo.connect(cfg.databaseUrl), from, to, { timeZone: cfg.timeZone });
  console.log(`Coleta concluída: ${n} linhas.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
