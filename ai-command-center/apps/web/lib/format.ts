import type { AccEvent, ProjectStatus, RunStatus, TaskStatus } from '@acc/shared';

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (m) return `${m}min ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatUsd(v: number | null): string {
  return v === null ? '—' : `US$ ${v.toFixed(2)}`;
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'Planejando',
  awaiting_plan_approval: 'Aguardando aprovação do plano',
  running: 'Em execução',
  paused: 'Pausado',
  completed: 'Concluído',
  failed: 'Com falhas',
  cancelled: 'Cancelado',
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Na fila',
  running: 'Executando',
  awaiting_approval: 'Aguardando aprovação',
  done: 'Concluída',
  failed: 'Falhou',
  blocked: 'Bloqueada',
  cancelled: 'Cancelada',
};

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  running: 'Em execução',
  succeeded: 'Concluída',
  failed: 'Falhou',
  aborted: 'Interrompida',
};

export const ROLE_LABEL: Record<string, string> = {
  coordinator: 'Coordenação',
  programmer: 'Programação',
  designer: 'Design',
  tester: 'Testes',
};

export type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'bad';
export function toneForStatus(status: string): Tone {
  if (['done', 'completed', 'succeeded', 'approved'].includes(status)) return 'ok';
  if (['failed', 'error', 'rejected', 'blocked'].includes(status)) return 'bad';
  if (['awaiting_approval', 'awaiting_plan_approval', 'paused', 'pending_approval'].includes(status)) return 'warn';
  if (['running', 'planning'].includes(status)) return 'info';
  return 'neutral';
}

/** Descrição curta de um evento para históricos. null = não exibir. */
export function describeEvent(e: AccEvent): { text: string; tone: Tone } | null {
  switch (e.type) {
    case 'run.started':
      return { text: 'Iniciou a execução da tarefa', tone: 'info' };
    case 'run.activity':
      return { text: e.activity.tool ? `${e.activity.summary}  ·  ${e.activity.tool}` : e.activity.summary, tone: e.activity.kind === 'approval' ? 'warn' : 'neutral' };
    case 'run.finished':
      return {
        text: `Execução ${RUN_STATUS_LABEL[e.run.status].toLowerCase()}${e.run.error ? `: ${e.run.error}` : ''}`,
        tone: toneForStatus(e.run.status === 'aborted' ? 'paused' : e.run.status),
      };
    case 'approval.upserted':
      if (e.approval.status === 'pending') return { text: `Pediu aprovação: ${e.approval.title}`, tone: 'warn' };
      return { text: `Aprovação ${e.approval.status === 'approved' ? 'concedida' : e.approval.status === 'rejected' ? 'recusada' : 'expirada'}: ${e.approval.title}`, tone: toneForStatus(e.approval.status) };
    case 'log':
      return { text: e.message, tone: e.level === 'error' ? 'bad' : e.level === 'warn' ? 'warn' : 'neutral' };
    default:
      return null;
  }
}
