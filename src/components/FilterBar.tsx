import { CalendarDays, Filter, RotateCcw } from 'lucide-react';
import { PRESET_LABELS, useApp, type PeriodPreset } from '../context/AppContext';
import { fmtDateLong } from '../lib/dates';

/** Barra de filtros globais: período, departamento e URA. Compartilhada entre as telas. */
export function FilterBar({ showUra = true, extra }: { showUra?: boolean; extra?: React.ReactNode }) {
  const { filters, setFilters, departments, uras, range, store } = useApp();
  const urasInDept = uras.filter((u) => filters.departmentId === 'all' || u.departmentId === filters.departmentId);
  const isDefault = filters.preset === '7d' && filters.departmentId === 'all' && filters.uraId === 'all';
  return (
    <div className="card mb-5 flex flex-wrap items-end gap-3 p-3">
      <div className="flex items-center gap-1.5 self-center pr-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Filter className="h-3.5 w-3.5" /> Filtros
      </div>
      <label className="min-w-[150px]">
        <span className="label">Período</span>
        <select className="input" value={filters.preset} onChange={(e) => setFilters({ preset: e.target.value as PeriodPreset })}>
          {(Object.keys(PRESET_LABELS) as PeriodPreset[]).map((p) => <option key={p} value={p}>{PRESET_LABELS[p]}</option>)}
        </select>
      </label>
      {filters.preset === 'custom' && (
        <>
          <label>
            <span className="label">De</span>
            <input type="date" className="input" value={filters.from} min={store?.minDate} max={filters.to}
              onChange={(e) => e.target.value && setFilters({ from: e.target.value })} />
          </label>
          <label>
            <span className="label">Até</span>
            <input type="date" className="input" value={filters.to} min={filters.from} max={store?.maxDate}
              onChange={(e) => e.target.value && setFilters({ to: e.target.value })} />
          </label>
        </>
      )}
      <label className="min-w-[180px]">
        <span className="label">Departamento</span>
        <select className="input" value={filters.departmentId} onChange={(e) => setFilters({ departmentId: e.target.value })}>
          <option value="all">Todos os departamentos</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      {showUra && (
        <label className="min-w-[220px]">
          <span className="label">URA</span>
          <select className="input" value={filters.uraId} onChange={(e) => setFilters({ uraId: e.target.value })}>
            <option value="all">Todas as URAs{filters.departmentId !== 'all' ? ' do departamento' : ''}</option>
            {urasInDept.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
      )}
      {extra}
      <div className="ml-auto flex items-center gap-3 self-center">
        <span className="hidden items-center gap-1 text-xs text-slate-500 md:inline-flex dark:text-slate-400">
          <CalendarDays className="h-3.5 w-3.5" />
          {range.from === range.to ? fmtDateLong(range.from) : `${fmtDateLong(range.from)} – ${fmtDateLong(range.to)}`}
        </span>
        {!isDefault && (
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setFilters({ preset: '7d', departmentId: 'all', uraId: 'all' })}>
            <RotateCcw className="h-3.5 w-3.5" /> Limpar
          </button>
        )}
      </div>
    </div>
  );
}
