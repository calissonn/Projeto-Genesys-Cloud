'use client';
import { useEffect, useMemo, useState } from 'react';
import type { AccEvent, Run } from '@acc/shared';
import { RUN_STATUS_LABEL, describeEvent, formatDuration, formatTime, formatUsd, toneForStatus } from '@/lib/format';
import { api, useAcc } from '@/lib/store';
import { Badge, Button } from './ui';

/** Transcrição completa de uma execução, como foi gravada pelo orquestrador. */
export function RunDetails({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [data, setData] = useState<{ run: Run; events: AccEvent[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const feed = useAcc((s) => s.feed);
  const live = useMemo(() => feed.filter((e) => e.runId === runId), [feed, runId]);

  useEffect(() => {
    api<{ run: Run; events: AccEvent[] }>(`runs/${runId}`).then(setData, (e: Error) => setError(e.message));
  }, [runId]);

  const last = data?.events.at(-1)?.seq ?? 0;
  const events = [...(data?.events ?? []), ...live.filter((e) => e.seq > last)];
  const finished = live.findLast((e): e is Extract<AccEvent, { type: 'run.finished' }> => e.type === 'run.finished');
  const run = finished?.run ?? data?.run;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div role="dialog" aria-label="Detalhes da execução" className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-line bg-panel scrollbar-thin" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 flex items-center justify-between border-b border-line bg-panel px-5 py-3">
          <h2 className="font-semibold">Detalhes da execução</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Fechar">
            ✕
          </Button>
        </header>
        <div className="space-y-4 p-5">
          {error && <p className="text-rose-300">{error}</p>}
          {run && (
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-slate-400">Situação</dt>
                <dd>
                  <Badge tone={toneForStatus(run.status === 'aborted' ? 'paused' : run.status)}>{RUN_STATUS_LABEL[run.status]}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Modo</dt>
                <dd>{run.mode === 'demo' ? 'Demonstração' : 'Real'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Duração</dt>
                <dd>{formatDuration((run.finishedAt ? Date.parse(run.finishedAt) : Date.now()) - Date.parse(run.startedAt))}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Custo medido</dt>
                <dd>{formatUsd(run.costUsd)}</dd>
              </div>
            </dl>
          )}
          <ol className="space-y-1 border-l border-line pl-4 text-sm">
            {events.map((e) => {
              const d = describeEvent(e);
              if (!d) return null;
              return (
                <li key={e.seq}>
                  <span className="mr-2 font-mono text-xs text-slate-500">
                    #{e.seq} {formatTime(e.ts)}
                  </span>
                  {d.text}
                  {e.type === 'run.activity' && e.activity.detail != null && (
                    <details className="ml-1 inline">
                      <summary className="inline cursor-pointer text-xs text-slate-500">dados</summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-black/40 p-2 text-xs text-slate-300">{JSON.stringify(e.activity.detail, null, 2)}</pre>
                    </details>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
