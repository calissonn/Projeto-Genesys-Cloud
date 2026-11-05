/**
 * Modelo de domínio do AI Command Center.
 * Compartilhado entre o orquestrador e a aplicação web.
 */

export const MODES = ['demo', 'real'] as const;
export type Mode = (typeof MODES)[number];

export const AGENT_ROLES = ['coordinator', 'programmer', 'designer', 'tester'] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

/** Papéis que executam tarefas (o coordenador apenas planeja). */
export const WORKER_ROLES = ['programmer', 'designer', 'tester'] as const satisfies readonly AgentRole[];
export type WorkerRole = (typeof WORKER_ROLES)[number];

/**
 * Estados reais de um agente. "walking" NÃO é um estado de domínio: é a transição
 * visual que o prédio faz quando o agente muda para um estado que acontece em outro local.
 */
export const AGENT_STATES = [
  'idle',
  'meeting',
  'analyzing',
  'typing',
  'testing',
  'talking',
  'awaiting_approval',
  'done',
  'error',
  'paused',
] as const;
export type AgentState = (typeof AGENT_STATES)[number];

/** Estados que só podem existir enquanto há uma execução (ou planejamento) ativa. */
export const ENGAGED_STATES: readonly AgentState[] = [
  'meeting',
  'analyzing',
  'typing',
  'testing',
  'talking',
  'awaiting_approval',
];

export function isEngagedState(state: AgentState): boolean {
  return ENGAGED_STATES.includes(state);
}

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  title: string;
  department: string;
  floor: number;
  specialty: string;
  state: AgentState;
  /** Descrição curta do que está acontecendo agora (ex.: "Editando src/app.ts"). */
  stateDetail: string | null;
  stateSince: string;
  currentProjectId: string | null;
  currentTaskId: string | null;
  /** Com quem está conversando (estado "talking"). */
  withAgentId: string | null;
}

export const PROJECT_STATUSES = [
  'planning',
  'awaiting_plan_approval',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  mode: Mode;
  createdAt: string;
  updatedAt: string;
  budgetUsd: number;
  /** Custo medido (informado pelo SDK). null no modo demo. */
  costUsd: number | null;
  /** Custo estimado antes da execução. null no modo demo. */
  estimatedCostUsd: number | null;
  planSummary: string | null;
  statusReason: string | null;
}

export const TASK_STATUSES = [
  'pending',
  'running',
  'awaiting_approval',
  'done',
  'failed',
  'blocked',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface FileChange {
  path: string;
  change: 'created' | 'modified' | 'deleted';
}

export interface TestResult {
  command: string | null;
  total: number;
  passed: number;
  failed: number;
  output: string | null;
}

export interface Task {
  id: string;
  projectId: string;
  order: number;
  title: string;
  description: string;
  role: WorkerRole;
  dependsOn: string[];
  acceptanceCriteria: string[];
  status: TaskStatus;
  agentId: string | null;
  runId: string | null;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  costUsd: number | null;
  estimatedCostUsd: number | null;
  filesChanged: FileChange[];
  tests: TestResult | null;
  summary: string | null;
  error: string | null;
}

export const RISK_CATEGORIES = [
  'plan',
  'deploy',
  'delete',
  'production',
  'install',
  'financial',
  'external_communication',
  'network',
  'git_push',
  'other',
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const RISK_LABELS: Record<RiskCategory, string> = {
  plan: 'Aprovação do plano',
  deploy: 'Publicação de aplicação',
  delete: 'Exclusão de arquivos ou dados',
  production: 'Alteração de ambiente de produção',
  install: 'Instalação de dependência',
  financial: 'Operação financeira',
  external_communication: 'Comunicação externa',
  network: 'Acesso à rede',
  git_push: 'Envio para repositório remoto',
  other: 'Ação fora da lista permitida',
};

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface Approval {
  id: string;
  projectId: string;
  taskId: string | null;
  agentId: string;
  kind: 'plan' | 'action';
  category: RiskCategory;
  title: string;
  detail: string;
  /** Dados técnicos (ex.: nome da ferramenta e parâmetros). */
  payload: unknown;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt: string | null;
  reason: string | null;
}

export type RunStatus = 'running' | 'succeeded' | 'failed' | 'aborted';

export interface Run {
  id: string;
  projectId: string;
  taskId: string;
  agentId: string;
  mode: Mode;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  costUsd: number | null;
  turns: number | null;
  error: string | null;
}

/** Um passo observado durante a execução (vindo de uma mensagem real do SDK ou do roteiro demo). */
export interface Activity {
  kind: 'tool' | 'message' | 'handoff' | 'approval' | 'result';
  /** Estado do agente que este passo representa. */
  state: AgentState;
  summary: string;
  tool: string | null;
  detail: unknown;
}
