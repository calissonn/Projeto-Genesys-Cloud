'use client';
import { useMemo } from 'react';
import { PROJECT_STATUS_LABEL, ROLE_LABEL, TASK_STATUS_LABEL, toneForStatus } from '@/lib/format';
import { selectAgent, useAcc } from '@/lib/store';
import { Badge, Card, Empty } from './ui';

/** Lista resumida de projetos e tarefas. A Central de Comando completa vem na Etapa 3. */
export function Projects() {
  const projects = useAcc((s) => s.projects);
  const tasks = useAcc((s) => s.tasks);
  const agents = useAcc((s) => s.agents);
  const list = useMemo(() => Object.values(projects).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6), [projects]);

  return (
    <Card title="Projetos e tarefas">
      {list.length === 0 ? (
        <Empty>Nenhum projeto ainda.</Empty>
      ) : (
        <ul className="space-y-4" data-testid="projects">
          {list.map((p) => {
            const pt = Object.values(tasks)
              .filter((t) => t.projectId === p.id)
              .sort((a, b) => a.order - b.order);
            const done = pt.filter((t) => t.status === 'done').length;
            return (
              <li key={p.id}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{p.name}</p>
                  <Badge tone={toneForStatus(p.status)}>{PROJECT_STATUS_LABEL[p.status]}</Badge>
                </div>
                {pt.length > 0 && (
                  <>
                    <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-700">
                      <div className="h-full bg-teal-400 transition-all" style={{ width: `${(done / pt.length) * 100}%` }} />
                    </div>
                    <ul className="mt-2 space-y-1">
                      {pt.map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                          <button className="min-w-0 truncate text-left text-slate-200 hover:underline" onClick={() => t.agentId && selectAgent(t.agentId)} title={t.title}>
                            <span className="mr-1 text-xs text-slate-500">{ROLE_LABEL[t.role]}</span>
                            {t.title}
                            {t.agentId && <span className="ml-1 text-xs text-slate-400">· {agents[t.agentId]?.name}</span>}
                          </button>
                          <Badge tone={toneForStatus(t.status)}>{TASK_STATUS_LABEL[t.status]}</Badge>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {p.statusReason && <p className="mt-1 text-xs text-slate-400">{p.statusReason}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
