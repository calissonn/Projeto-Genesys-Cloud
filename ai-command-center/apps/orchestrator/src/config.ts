import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { MODES, type Mode } from '@acc/shared';

export interface Config {
  mode: Mode;
  host: string;
  port: number;
  token: string;
  tokenGenerated: boolean;
  allowedOrigin: string;
  dataDir: string;
  workspacesDir: string;
  maxConcurrency: number;
  demoSpeed: number;
  model: string;
  taskBudgetUsd: number;
  projectBudgetUsd: number;
}

const ROOT = path.resolve(import.meta.dirname, '../../..');

function num(value: string | undefined, fallback: number, name: string, min = 0): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= min) throw new Error(`${name} inválido: "${value}"`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = (env.ACC_MODE ?? 'demo') as Mode;
  if (!MODES.includes(mode)) throw new Error(`ACC_MODE deve ser "demo" ou "real" (recebido "${env.ACC_MODE}")`);

  const tokenFromEnv = env.ACC_TOKEN && env.ACC_TOKEN !== 'troque-por-um-valor-aleatorio' ? env.ACC_TOKEN : null;
  if (tokenFromEnv && tokenFromEnv.length < 16) throw new Error('ACC_TOKEN deve ter pelo menos 16 caracteres');

  return {
    mode,
    // Segurança: o orquestrador só aceita conexões da própria máquina.
    host: '127.0.0.1',
    port: num(env.ACC_PORT, 4317, 'ACC_PORT', -1),
    token: tokenFromEnv ?? randomBytes(24).toString('hex'),
    tokenGenerated: !tokenFromEnv,
    allowedOrigin: env.ACC_ALLOWED_ORIGIN ?? 'http://localhost:3000',
    dataDir: path.resolve(ROOT, env.ACC_DATA_DIR ?? 'data'),
    workspacesDir: path.resolve(ROOT, env.ACC_WORKSPACES_DIR ?? 'workspaces'),
    maxConcurrency: Math.floor(num(env.ACC_MAX_CONCURRENCY, mode === 'real' ? 1 : 2, 'ACC_MAX_CONCURRENCY')),
    demoSpeed: num(env.ACC_DEMO_SPEED, 1, 'ACC_DEMO_SPEED'),
    model: env.ACC_MODEL ?? 'sonnet',
    taskBudgetUsd: num(env.ACC_TASK_BUDGET_USD, 0.5, 'ACC_TASK_BUDGET_USD'),
    projectBudgetUsd: num(env.ACC_PROJECT_BUDGET_USD, 2, 'ACC_PROJECT_BUDGET_USD'),
  };
}
