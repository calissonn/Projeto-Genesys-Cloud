/**
 * Configuração do servidor — lida exclusivamente de variáveis de ambiente.
 * Credenciais nunca vão para o front-end nem para os logs.
 */
export type AuthMode = 'proxy' | 'dev';

export interface GenesysConfig {
  regionDomain: string;
  clientId: string;
  clientSecret: string;
  maxRequestsPerMinute: number;
  /** Somente para testes/homologação com o servidor Genesys simulado. */
  apiBaseUrl: string;
  loginBaseUrl: string;
  /** Valores de transferType considerados "transferência para atendimento humano" (validar com dados reais). */
  humanTransferTypes: string[];
}

export interface ServerConfig {
  nodeEnv: string;
  port: number;
  host: string;
  databaseUrl: string;
  timeZone: string;
  auth: {
    mode: AuthMode;
    emailHeader: string;
    nameHeader: string;
    /** Segredo compartilhado com o proxy de autenticação (impede cabeçalhos forjados). */
    proxySecret: string | null;
    devDefaultUser: string | null;
  };
  bootstrapAdminEmail: string | null;
  genesys: GenesysConfig | null;
  scheduler: { enabled: boolean; incrementalMinutes: number; dailyCloseHour: number };
}

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
  const mode = (env.AUTH_MODE ?? 'proxy') as AuthMode;
  if (mode !== 'proxy' && mode !== 'dev') throw new Error('AUTH_MODE deve ser "proxy" ou "dev".');
  if (mode === 'dev' && nodeEnv === 'production') throw new Error('AUTH_MODE=dev não é permitido em produção.');
  if (mode === 'proxy' && nodeEnv === 'production' && !env.AUTH_PROXY_SECRET) {
    throw new Error('Em produção, AUTH_PROXY_SECRET é obrigatório no modo proxy.');
  }

  let genesys: GenesysConfig | null = null;
  if (env.GENESYS_CLIENT_ID && env.GENESYS_CLIENT_SECRET && (env.GENESYS_REGION_DOMAIN || env.GENESYS_API_BASE_URL)) {
    const d = env.GENESYS_REGION_DOMAIN ?? '';
    if ((env.GENESYS_API_BASE_URL || env.GENESYS_LOGIN_BASE_URL) && nodeEnv === 'production') {
      throw new Error('GENESYS_API_BASE_URL/GENESYS_LOGIN_BASE_URL são apenas para testes e não podem ser usados em produção.');
    }
    genesys = {
      regionDomain: d,
      clientId: env.GENESYS_CLIENT_ID,
      clientSecret: env.GENESYS_CLIENT_SECRET,
      maxRequestsPerMinute: num(env.GENESYS_MAX_REQUESTS_PER_MINUTE, 120),
      apiBaseUrl: env.GENESYS_API_BASE_URL ?? `https://api.${d}`,
      loginBaseUrl: env.GENESYS_LOGIN_BASE_URL ?? `https://login.${d}`,
      humanTransferTypes: (env.GENESYS_HUMAN_TRANSFER_TYPES ?? 'ACD').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
    };
  }

  return {
    nodeEnv,
    port: num(env.PORT, 8080),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl: env.DATABASE_URL,
    timeZone: env.TIME_ZONE ?? 'America/Sao_Paulo',
    auth: {
      mode,
      emailHeader: (env.AUTH_EMAIL_HEADER ?? 'x-forwarded-email').toLowerCase(),
      nameHeader: (env.AUTH_NAME_HEADER ?? 'x-forwarded-preferred-username').toLowerCase(),
      proxySecret: env.AUTH_PROXY_SECRET ?? null,
      devDefaultUser: env.DEV_DEFAULT_USER ?? null,
    },
    bootstrapAdminEmail: env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase() ?? null,
    genesys,
    scheduler: {
      enabled: env.SCHEDULER_ENABLED === 'true',
      incrementalMinutes: num(env.SCHEDULER_INCREMENTAL_MINUTES, 15),
      dailyCloseHour: num(env.SCHEDULER_DAILY_CLOSE_HOUR, 4),
    },
  };
}

/** Compatibilidade com o coletor de linha de comando da etapa anterior. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const c = loadServerConfig(env);
  if (!c.genesys) throw new Error('Integração Genesys não configurada (GENESYS_CLIENT_ID, GENESYS_CLIENT_SECRET, GENESYS_REGION_DOMAIN).');
  return c;
}
