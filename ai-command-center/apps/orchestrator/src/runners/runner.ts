import type { Activity, Agent, FileChange, Project, RiskCategory, Task, TestResult } from '@acc/shared';

export interface ApprovalRequest {
  category: RiskCategory;
  title: string;
  detail: string;
  payload?: unknown;
}

export interface ApprovalOutcome {
  approved: boolean;
  reason: string | null;
}

export interface RunContext {
  project: Project;
  task: Task;
  agent: Agent;
  /** Resultados das tarefas de que esta depende. */
  dependencies: Task[];
  workspaceDir: string;
  signal: AbortSignal;
  /** Informa um passo observado. Muda o estado visual do agente. */
  report(activity: Omit<Activity, 'detail' | 'tool'> & Partial<Pick<Activity, 'detail' | 'tool'>>): void;
  /** Pede aprovação humana e aguarda a decisão. */
  requestApproval(request: ApprovalRequest): Promise<ApprovalOutcome>;
}

export interface RunResult {
  status: 'succeeded' | 'failed' | 'aborted';
  summary: string | null;
  error: string | null;
  filesChanged: FileChange[];
  tests: TestResult | null;
  costUsd: number | null;
  turns: number | null;
}

/** Executa uma tarefa. DemoRunner (sem IA) ou ClaudeRunner (Agent SDK, Etapa 4). */
export interface Runner {
  readonly kind: 'demo' | 'claude';
  run(ctx: RunContext): Promise<RunResult>;
}
