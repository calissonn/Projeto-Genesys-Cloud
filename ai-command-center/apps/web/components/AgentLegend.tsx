'use client';
import { useMemo } from 'react';
import { STATE_LABELS } from '@/game/agents/behavior';
import { selectAgent, useAcc } from '@/lib/store';

/** Atalho acessível para selecionar agentes sem clicar no canvas. */
export function AgentLegend() {
  const agents = useAcc((s) => s.agents);
  const selected = useAcc((s) => s.selectedAgentId);
  const list = useMemo(() => Object.values(agents).sort((a, b) => b.floor - a.floor), [agents]);
  return (
    <div className="flex flex-wrap gap-2" data-testid="agent-legend">
      {list.map((a) => (
        <button
          key={a.id}
          onClick={() => selectAgent(a.id)}
          className={`rounded-lg border px-3 py-1.5 text-left text-xs transition ${selected === a.id ? 'border-amber-300 bg-amber-300/10' : 'border-line bg-panel hover:border-slate-500'}`}
        >
          <span className="font-semibold">{a.name}</span> <span className="text-slate-400">· {a.title}</span>
          <span className="block text-slate-300">{STATE_LABELS[a.state]}</span>
        </button>
      ))}
    </div>
  );
}
