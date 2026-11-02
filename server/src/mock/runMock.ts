/** Sobe o servidor Genesys simulado para desenvolvimento local (npm run mock:genesys). */
import { MOCK, startGenesysMock } from './genesysMock.js';

const port = Number(process.env.MOCK_PORT ?? 9090);
startGenesysMock({ rateLimitEvery: Number(process.env.MOCK_RATE_LIMIT_EVERY ?? 0) }, port).then(({ url }) => {
  console.log(`Genesys SIMULADO em ${url}`);
  console.log('Configure o backend com:');
  console.log(`  GENESYS_API_BASE_URL=${url}\n  GENESYS_LOGIN_BASE_URL=${url}\n  GENESYS_CLIENT_ID=${MOCK.clientId}\n  GENESYS_CLIENT_SECRET=${MOCK.clientSecret}`);
});
