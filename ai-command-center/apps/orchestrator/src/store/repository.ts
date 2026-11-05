import type { AccEvent, UnsequencedEvent, Agent, Approval, Project, Run, Task } from '@acc/shared';

export interface EventQuery {
  after?: number;
  projectId?: string;
  agentId?: string;
  taskId?: string;
  runId?: string;
  limit?: number;
}

/**
 * Acesso a dados. A implementação do MVP é SQLite local; uma implementação Supabase/Postgres
 * pode ser adicionada depois sem alterar o restante do orquestrador.
 */
export interface Repository {
  listAgents(): Agent[];
  getAgent(id: string): Agent | null;
  upsertAgent(agent: Agent): void;

  listProjects(): Project[];
  getProject(id: string): Project | null;
  upsertProject(project: Project): void;

  listTasks(projectId?: string): Task[];
  getTask(id: string): Task | null;
  upsertTask(task: Task): void;

  listApprovals(filter?: { status?: Approval['status']; projectId?: string }): Approval[];
  getApproval(id: string): Approval | null;
  upsertApproval(approval: Approval): void;

  listRuns(filter?: { taskId?: string; status?: Run['status'] }): Run[];
  getRun(id: string): Run | null;
  upsertRun(run: Run): void;

  appendEvent(event: UnsequencedEvent): AccEvent;
  listEvents(query?: EventQuery): AccEvent[];
  lastSeq(): number;

  transaction<T>(fn: () => T): T;
  close(): void;
}
