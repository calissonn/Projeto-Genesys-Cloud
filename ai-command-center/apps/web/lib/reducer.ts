import type { AccEvent, Agent, Approval, Mode, Project, Run, Snapshot, Task } from '@acc/shared';

export interface AccState {
  synced: boolean;
  connected: boolean;
  mode: Mode | null;
  seq: number;
  agents: Record<string, Agent>;
  projects: Record<string, Project>;
  tasks: Record<string, Task>;
  approvals: Record<string, Approval>;
  runs: Record<string, Run>;
  /** Últimas atividades e logs, para o feed. */
  feed: AccEvent[];
}

export const FEED_LIMIT = 300;

export const emptyState: AccState = {
  synced: false,
  connected: false,
  mode: null,
  seq: 0,
  agents: {},
  projects: {},
  tasks: {},
  approvals: {},
  runs: {},
  feed: [],
};

const byId = <T extends { id: string }>(items: T[]) => Object.fromEntries(items.map((i) => [i.id, i]));

export function applySnapshot(state: AccState, snap: Snapshot, feed: AccEvent[] = []): AccState {
  return {
    ...state,
    synced: true,
    mode: snap.mode,
    seq: snap.seq,
    agents: byId(snap.agents),
    projects: byId(snap.projects),
    tasks: byId(snap.tasks),
    approvals: byId(snap.approvals),
    runs: byId(snap.runs),
    feed: feed.filter(isFeedEvent).slice(-FEED_LIMIT),
  };
}

export function isFeedEvent(e: AccEvent): boolean {
  return e.type === 'run.activity' || e.type === 'log' || e.type === 'run.started' || e.type === 'run.finished';
}

/** Aplica um evento. Eventos antigos (seq já aplicado) são ignorados. */
export function applyEvent(state: AccState, e: AccEvent): AccState {
  if (e.seq <= state.seq) return state;
  const next: AccState = { ...state, seq: e.seq };
  switch (e.type) {
    case 'agent.upserted':
      next.agents = { ...state.agents, [e.agent.id]: e.agent };
      break;
    case 'project.upserted':
      next.projects = { ...state.projects, [e.project.id]: e.project };
      break;
    case 'task.upserted':
      next.tasks = { ...state.tasks, [e.task.id]: e.task };
      break;
    case 'approval.upserted':
      next.approvals = { ...state.approvals, [e.approval.id]: e.approval };
      break;
    case 'run.started':
    case 'run.finished':
      next.runs = { ...state.runs, [e.run.id]: e.run };
      break;
  }
  if (isFeedEvent(e)) next.feed = [...state.feed, e].slice(-FEED_LIMIT);
  return next;
}
