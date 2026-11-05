'use client';
import { useAcc } from '@/lib/store';

export function Header() {
  const mode = useAcc((s) => s.mode);
  const connected = useAcc((s) => s.connected);
  const synced = useAcc((s) => s.synced);
  return (
    <>
      {mode === 'demo' && (
        <div role="status" className="bg-amber-400 px-4 py-1.5 text-center text-sm font-bold text-amber-950" data-testid="demo-banner">
          MODO DEMONSTRAÇÃO — nada aqui é execução real: nenhuma IA é chamada, nenhum arquivo é criado e nenhum custo é gerado
        </div>
      )}
      {mode === 'real' && (
        <div role="status" className="bg-rose-600 px-4 py-1.5 text-center text-sm font-bold text-white">
          MODO REAL — os agentes executam o Claude Code de verdade e geram custos
        </div>
      )}
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-teal-500/20 font-mono text-lg font-bold text-teal-300 ring-1 ring-teal-400/40">AI</div>
          <div>
            <h1 className="text-lg font-bold leading-tight">AI Command Center</h1>
            <p className="text-xs text-slate-400">Empresa virtual de agentes de IA com supervisão humana</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs" data-testid="connection">
          <span className={`h-2.5 w-2.5 rounded-full ${connected && synced ? 'bg-emerald-400' : connected ? 'bg-amber-400' : 'bg-rose-500'}`} />
          {connected && synced ? 'Conectado ao orquestrador' : connected ? 'Sincronizando…' : 'Sem conexão com o orquestrador'}
        </div>
      </header>
    </>
  );
}
