'use client';
import { useMemo } from 'react';
import { describeEvent, formatTime } from '@/lib/format';
import { useAcc } from '@/lib/store';
import { Card, Empty } from './ui';

export function Feed() {
  const feed = useAcc((s) => s.feed);
  const agents = useAcc((s) => s.agents);
  const items = useMemo(() => [...feed].reverse().slice(0, 40), [feed]);
  return (
    <Card title="Atividades recentes">
      {items.length === 0 ? (
        <Empty>Sem atividades.</Empty>
      ) : (
        <ol className="max-h-72 space-y-1 overflow-y-auto pr-1 text-sm scrollbar-thin" data-testid="feed">
          {items.map((e) => {
            const d = describeEvent(e);
            if (!d) return null;
            return (
              <li key={e.seq} className="flex gap-2">
                <span className="shrink-0 font-mono text-xs text-slate-500">{formatTime(e.ts)}</span>
                <span className={d.tone === 'bad' ? 'text-rose-300' : d.tone === 'warn' ? 'text-amber-200' : 'text-slate-200'}>
                  {e.agentId && agents[e.agentId] && <strong className="mr-1 text-slate-100">{agents[e.agentId]!.name}:</strong>}
                  {d.text}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
