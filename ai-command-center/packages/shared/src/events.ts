import type { Activity, Agent, Approval, Mode, Project, Run, Task } from './domain.ts';

/**
 * Eventos de domínio. Todo evento é gravado antes de ser transmitido;
 * o histórico gravado é a fonte da verdade e a interface é apenas um espelho.
 */
export type AccEventBody =
  | { type: 'project.upserted'; project: Project }
  | { type: 'task.upserted'; task: Task }
  | { type: 'agent.upserted'; agent: Agent }
  | { type: 'approval.upserted'; approval: Approval }
  | { type: 'run.started'; run: Run }
  | { type: 'run.activity'; activity: Activity }
  | { type: 'run.finished'; run: Run }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };

export interface AccEventMeta {
  seq: number;
  ts: string;
  /** Modo que gerou o evento. Eventos demo e real nunca convivem no mesmo banco. */
  source: Mode;
  projectId: string | null;
  agentId: string | null;
  taskId: string | null;
  runId: string | null;
}

export type AccEvent = AccEventMeta & AccEventBody;
export type AccEventType = AccEvent['type'];
/** Evento ainda sem número de sequência (Omit que preserva a união). */
export type UnsequencedEvent = AccEvent extends infer E ? (E extends AccEvent ? Omit<E, 'seq'> : never) : never;
export type NewAccEvent = Partial<Omit<AccEventMeta, 'seq' | 'ts' | 'source'>> & AccEventBody;

export interface Snapshot {
  mode: Mode;
  seq: number;
  agents: Agent[];
  projects: Project[];
  tasks: Task[];
  approvals: Approval[];
  runs: Run[];
}

/** Mensagens enviadas pelo WebSocket. */
export type ServerMessage =
  | { type: 'hello'; mode: Mode; seq: number }
  | { type: 'event'; event: AccEvent };
