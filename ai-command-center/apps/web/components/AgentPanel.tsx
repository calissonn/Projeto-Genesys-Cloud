'use client';
import { useEffect, useMemo, useState } from 'react';
import type { AccEvent, Agent, Task } from '@acc/shared';
import { STATE_LABELS } from '@/game/agents/behavior';
import { TASK_STATUS_LABEL, describeEvent, formatDuration, formatTime, toneForStatus } from '@/lib/format';
import { api, selectAgent, useAcc } from '@/lib/store';
import { Badge, Button, Empty } from './ui';
import { RunDetails } from './RunDetails';

const HISTORY_TYPES = new Set<AccEvent['type']>(['run.started', 'run.activity', 'run.finished', 'approval.upserted']);

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const STATE_TONE: Record<Agent['state'], Parameters<typeof Badge>[0]['tone']> = {
  idle: 'neutral',
  meeting: 'info',
  analyzing: 'info',
  typing: 'info',
  testing: 'info',
  talking: 'info',
  awaiting_approval: 'warn',
  done: 'ok',
  error: 'bad',
  paused: 'warn',
};

export function AgentPanel() {
  const id = useAcc((s) => s.selectedAgentId);
  const agent = useAcc((s) => (id ? s.agents[id] : undefined));
  const tasks = useAcc((s) => s.tasks);
  const projects = useAcc((s) => s.projects);
  const feed = useAcc((s) => s.feed);
  const mode = useAcc((s) => s.mode);
  const [history, setHistory] = useState<AccEvent[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const now = useNow();

  useEffect(() => {
    if (!id) return;
    setHistory([]);
    setHistoryError(null);
    api<{ history: AccEvent[] }>(`agents/${id}`)
      .then((r) => setHistory(r.history))
      .catch((e: Error) => setHistoryError(e.message));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && selectAgent(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  const merged = useMemo(() => {
    const last = history.at(-1)?.seq ?? 0;
    const live = feed.filter((e) => e.agentId === id && e.seq > last);
    return [...history, ...live].filter((e) => HISTORY_TYPES.has(e.type)).reverse().slice(0, 120);
  }, [history, feed, id]);

  if (!id || !agent) return null;

  const agentTasks = Object.values(tasks)
    .filter((t) => t.agentId === agent.id)
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  const current: Task | undefined = (agent.currentTaskId && tasks[agent.currentTaskId]) || agentTasks[0];
  const project = current ? projects[current.projectId] : agent.currentProjectId ? projects[agent.currentProjectId] : undefined;
  const files = current?.filesChanged ?? [];
  const errors = agentTasks.filter((t) => t.error && t.status !== 'done');
  const elapsedTask = current?.startedAt ? (current.finishedAt ? Date.parse(current.finishedAt) : now) - Date.parse(current.startedAt) : null;

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => selectAgent(null)} />
      <aside
        role="dialog"
        aria-label={`Detalhes de ${agent.name}`}
        data-testid="agent-panel"
        className="fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-line bg-panel shadow-2xl scrollbar-thin lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[420px] lg:rounded-none lg:border-y-0 lg:border-r-0"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-panel px-5 py-4">
          <div>
            <h2 className="text-xl font-bold">{agent.name}</h2>
            <p className="text-sm text-slate-300">
              {agent.title} · {agent.department} · {agent.floor}º andar
            </p>
            <p className="mt-1 text-xs text-slate-400">{agent.specialty}</p>
          </div>
          <Button variant="ghost" aria-label="Fechar painel" onClick={() => selectAgent(null)}>
            ✕
          </Button>
        </header>

        <div className="space-y-5 px-5 py-4">
          <section>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATE_TONE[agent.state]}>{STATE_LABELS[agent.state]}</Badge>
              <span className="text-xs text-slate-400">há {formatDuration(now - Date.parse(agent.stateSince))}</span>
            </div>
            {agent.stateDetail && <p className="mt-2 text-sm text-slate-200">{agent.stateDetail}</p>}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{agent.currentTaskId ? 'Tarefa atual' : 'Última tarefa'}</h3>
            {current ? (
              <div className="rounded-lg border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{current.title}</p>
                  <Badge tone={toneForStatus(current.status)}>{TASK_STATUS_LABEL[current.status]}</Badge>
                </div>
                {project && <p className="mt-1 text-xs text-slate-400">Projeto: {project.name}</p>}
                <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-slate-400">Tempo decorrido</dt>
                    <dd>{elapsedTask === null ? '—' : formatDuration(elapsedTask)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Tentativas</dt>
                    <dd>{current.attempts}</dd>
                  </div>
                </dl>
                {current.summary && <p className="mt-2 text-sm text-slate-300">{current.summary}</p>}
                {current.runId && (
                  <Button variant="ghost" className="mt-3 w-full" onClick={() => setRunId(current.runId)} data-testid="run-details-button">
                    Ver detalhes da execução
                  </Button>
                )}
              </div>
            ) : (
              <Empty>Nenhuma tarefa atribuída ainda.</Empty>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Arquivos criados ou modificados {mode === 'demo' && <span className="normal-case text-amber-300">(demonstração: nenhum arquivo real)</span>}
            </h3>
            {files.length ? (
              <ul className="space-y-1 font-mono text-xs">
                {files.map((f) => (
                  <li key={f.path + f.change} className="flex items-center gap-2">
                    <Badge tone={f.change === 'created' ? 'ok' : f.change === 'deleted' ? 'bad' : 'info'}>{f.change === 'created' ? 'novo' : f.change === 'deleted' ? 'removido' : 'alterado'}</Badge>
                    {f.path}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nenhum arquivo registrado.</Empty>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Resultados dos testes</h3>
            {current?.tests ? (
              <div className="rounded-lg border border-line p-3 text-sm">
                <div className="flex gap-3">
                  <Badge tone="ok">{current.tests.passed} passaram</Badge>
                  <Badge tone={current.tests.failed ? 'bad' : 'neutral'}>{current.tests.failed} falharam</Badge>
                  <span className="text-xs text-slate-400">de {current.tests.total}</span>
                </div>
                {current.tests.command && <p className="mt-2 font-mono text-xs text-slate-400">$ {current.tests.command}</p>}
                {current.tests.output && <p className="mt-1 text-xs text-slate-300">{current.tests.output}</p>}
              </div>
            ) : (
              <Empty>Sem testes nesta tarefa.</Empty>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Erros identificados</h3>
            {errors.length ? (
              <ul className="space-y-2">
                {errors.map((t) => (
                  <li key={t.id} className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-sm">
                    <p className="font-medium text-rose-200">{t.title}</p>
                    <p className="text-xs text-rose-300">{t.error}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nenhum erro.</Empty>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Histórico de ações</h3>
            {historyError && <p className="text-sm text-rose-300">{historyError}</p>}
            {merged.length ? (
              <ol className="space-y-1.5 text-sm" data-testid="agent-history">
                {merged.map((e) => {
                  const d = describeEvent(e);
                  if (!d) return null;
                  return (
                    <li key={e.seq} className="flex gap-2">
                      <span className="shrink-0 font-mono text-xs text-slate-500">{formatTime(e.ts)}</span>
                      <span className={d.tone === 'bad' ? 'text-rose-300' : d.tone === 'warn' ? 'text-amber-200' : d.tone === 'ok' ? 'text-emerald-300' : 'text-slate-200'}>{d.text}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              !historyError && <Empty>Nenhuma ação registrada.</Empty>
            )}
          </section>
        </div>
      </aside>
      {runId && <RunDetails runId={runId} onClose={() => setRunId(null)} />}
    </>
  );
}
