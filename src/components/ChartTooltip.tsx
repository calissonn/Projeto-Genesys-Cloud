import type { ReactNode } from 'react';

interface Item { name?: ReactNode; value?: unknown; color?: string; dataKey?: unknown; payload?: Record<string, unknown> }

/** Tooltip padrão dos gráficos: valores em tinta de texto, cor apenas no marcador. */
export function ChartTooltip({
  active, payload, label, labelFormatter, valueFormatter,
}: {
  active?: boolean;
  payload?: Item[];
  label?: ReactNode;
  labelFormatter?: (l: ReactNode, p?: Item[]) => ReactNode;
  valueFormatter?: (v: number, name: string, item: Item) => ReactNode;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[180px] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900/95">
      <div className="mb-1.5 font-semibold text-slate-700 dark:text-slate-200">{labelFormatter ? labelFormatter(label, payload) : label}</div>
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
              {valueFormatter ? valueFormatter(Number(p.value), String(p.name), p) : String(p.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
