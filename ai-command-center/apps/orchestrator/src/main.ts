import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createAccServer } from './server.ts';

const config = loadConfig();
const { repo, bus, engine } = buildApp(config);
const { server, close } = createAccServer({ engine, repo, bus, mode: config.mode, token: config.token, allowedOrigin: config.allowedOrigin });

server.listen(config.port, config.host, () => {
  const banner = config.mode === 'demo' ? 'MODO DEMONSTRAÇÃO — nenhuma IA é chamada, nada é executado de verdade' : 'MODO REAL';
  console.log(`\n  AI Command Center — orquestrador`);
  console.log(`  ${banner}`);
  console.log(`  API:       http://${config.host}:${config.port}/api`);
  console.log(`  WebSocket: ws://${config.host}:${config.port}/ws`);
  if (config.tokenGenerated) {
    console.log(`\n  ACC_TOKEN não definido; token temporário desta sessão:\n  ${config.token}\n  Defina ACC_TOKEN no arquivo .env para mantê-lo fixo.`);
  }
});

async function shutdown() {
  console.log('\nEncerrando…');
  await close();
  repo.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
