/** Configuração lida exclusivamente de variáveis de ambiente (nunca do front-end). */
export interface Config {
  regionDomain: string;
  clientId: string;
  clientSecret: string;
  maxRequestsPerMinute: number;
  databaseUrl: string | null;
  port: number;
  timeZone: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing = ['GENESYS_REGION_DOMAIN', 'GENESYS_CLIENT_ID', 'GENESYS_CLIENT_SECRET'].filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Integração Genesys não configurada. Variáveis ausentes: ${missing.join(', ')}`);
  }
  return {
    regionDomain: env.GENESYS_REGION_DOMAIN!,
    clientId: env.GENESYS_CLIENT_ID!,
    clientSecret: env.GENESYS_CLIENT_SECRET!,
    maxRequestsPerMinute: Number(env.GENESYS_MAX_REQUESTS_PER_MINUTE ?? 120),
    databaseUrl: env.DATABASE_URL ?? null,
    port: Number(env.PORT ?? 8080),
    timeZone: env.TIME_ZONE ?? 'America/Sao_Paulo',
  };
}

/** Versão que não lança erro — usada para informar o status da integração. */
export function integrationConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.GENESYS_REGION_DOMAIN && env.GENESYS_CLIENT_ID && env.GENESYS_CLIENT_SECRET);
}
