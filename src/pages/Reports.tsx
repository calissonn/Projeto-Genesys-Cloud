import clsx from 'clsx';
import { FileSpreadsheet, FileText, Loader2, Table2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Card, CardHeader, EmptyState, PageHeader, SimulatedTag } from '../components/ui';
import { useApp } from '../context/AppContext';
import { downloadCsv, exportExcel, exportPdf, slug } from '../lib/exporters';
import { useChartColors } from '../lib/chartColors';
import { scopeUraIds } from '../lib/metrics';
import { REPORTS, buildReport, type ReportId } from '../lib/reports';

export function Reports() {
  const app = useApp();
  const { store, uras, departments, filters, range, prevRange, goals, occurrences, changes, dataSource, logAction } = app;
  const c = useChartColors();
  const [id, setId] = useState<ReportId>('executivo');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const doc = useMemo(() => {
    if (!store) return null;
    const scope = scopeUraIds(uras, filters);
    const scopeLabel = filters.uraId !== 'all' ? uras.find((u) => u.id === filters.uraId)?.name ?? filters.uraId
      : filters.departmentId !== 'all' ? departments.find((d) => d.id === filters.departmentId)?.name ?? '' : 'Todas as URAs';
    return buildReport(id, { store, uras, departments, range, prevRange, scope, scopeLabel, goals, occurrences, changes, simulated: dataSource.kind === 'simulado' });
  }, [id, store, uras, departments, filters, range, prevRange, goals, occurrences, changes, dataSource.kind]);
  if (!doc) return null;

  const run = async (kind: 'xlsx' | 'pdf' | 'csv') => {
    setErr(null);
    setBusy(kind);
    try {
      if (kind === 'xlsx') await exportExcel(doc);
      else if (kind === 'pdf') await exportPdf(doc);
      else {
        const rows: (string | number)[][] = [[doc.title], [`Escopo: ${doc.scope}`], [`Período: ${doc.period}`], [], ['Indicador', 'Valor', 'Observação'], ...doc.kpis.map((k) => [k.label, k.value, k.note ?? ''])];
        doc.sections.forEach((s) => { if (s.table) rows.push([], [s.title], s.table.columns, ...s.table.rows); });
        downloadCsv(`${slug(doc.title)}.csv`, rows);
      }
      logAction('Relatório exportado', 'Relatório', id, `${doc.title} (${kind.toUpperCase()}) — ${doc.scope}, ${doc.period}`);
    } catch (e) {
      setErr(`Não foi possível gerar o arquivo: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader title="Relatórios gerenciais" description="Escolha o relatório, ajuste os filtros e exporte em Excel, PDF ou CSV. A pré-visualização mostra exatamente o conteúdo exportado." />
      <FilterBar />
      <div className="grid gap-5 lg:grid-cols-4">
        <Card className="h-fit lg:col-span-1">
          <CardHeader title="Relatórios" />
          <ul className="p-2">
            {REPORTS.map((r) => (
              <li key={r.id}>
                <button onClick={() => setId(r.id)} className={clsx('w-full rounded-lg px-3 py-2 text-left transition', id === r.id ? 'bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50')}>
                  <div className="text-sm font-medium">{r.title}</div>
                  <div className="text-xs text-slate-500">{r.description}</div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-5 lg:col-span-3">
          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{doc.title}</h2>
                <div className="text-sm text-slate-500">{doc.scope} · {doc.period}</div>
                {doc.simulated && <SimulatedTag className="mt-2" />}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" disabled={!!busy} onClick={() => run('xlsx')}>{busy === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel</button>
                <button className="btn-primary" disabled={!!busy} onClick={() => run('pdf')}>{busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} PDF</button>
                <button className="btn-secondary" disabled={!!busy} onClick={() => run('csv')}><Table2 className="h-4 w-4" /> CSV</button>
              </div>
            </div>
            {err && <p className="mt-3 text-sm text-red-600" role="alert">{err}</p>}
          </Card>

          {doc.kpis.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {doc.kpis.map((k) => (
                <div key={k.label} className="card p-3">
                  <div className="text-xs text-slate-500">{k.label}</div>
                  <div className="text-lg font-semibold">{k.value}</div>
                  {k.note && <div className="text-[11px] text-slate-500">{k.note}</div>}
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardHeader title="Conclusões" />
              {doc.conclusions.length ? <ul className="list-disc space-y-1.5 py-3 pl-8 pr-4 text-sm">{doc.conclusions.map((t) => <li key={t}>{t}</li>)}</ul> : <EmptyState title="Sem conclusões" />}
            </Card>
            <Card>
              <CardHeader title="Recomendações" info="Geradas por regras. Hipóteses de causa precisam ser validadas." />
              {doc.recommendations.length ? <ul className="list-disc space-y-1.5 py-3 pl-8 pr-4 text-sm">{doc.recommendations.map((t) => <li key={t}>{t}</li>)}</ul> : <EmptyState title="Nenhuma recomendação" text="Nenhum indicador fora das metas neste relatório." />}
            </Card>
          </div>

          {doc.sections.map((s) => (
            <Card key={s.title}>
              <CardHeader title={s.title} />
              {s.text?.map((t) => <p key={t} className="px-4 pt-3 text-xs text-slate-500">{t}</p>)}
              {s.chart && s.chart.values.length > 0 && (
                <div className="space-y-1.5 px-4 py-3">
                  {s.chart.labels.slice(0, 12).map((l, i) => {
                    const max = Math.max(...s.chart!.values.slice(0, 12), 1);
                    const v = s.chart!.values[i];
                    return (
                      <div key={l + i} className="flex items-center gap-3 text-xs">
                        <span className="w-48 shrink-0 truncate text-slate-600 dark:text-slate-300" title={l}>{l}</span>
                        <div className="h-3 flex-1 rounded bg-slate-100 dark:bg-slate-800"><div className="h-3 rounded" style={{ width: `${(v / max) * 100}%`, background: c.transfer }} /></div>
                        <span className="w-16 shrink-0 text-right tabular-nums">{s.chart!.unit === '%' ? `${v.toFixed(1).replace('.', ',')}%` : Math.round(v).toLocaleString('pt-BR')}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {s.table && (s.table.rows.length === 0 ? <EmptyState title="Sem linhas para exibir" /> : (
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800"><tr>{s.table.columns.map((col, i) => <th key={col} className={clsx('th', s.table!.numeric?.includes(i) && 'text-right')}>{col}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {s.table.rows.map((row, ri) => <tr key={ri}>{row.map((v, i) => <td key={i} className={clsx('td', s.table!.numeric?.includes(i) && 'text-right tabular-nums')}>{v}</td>)}</tr>)}
                    </tbody>
                  </table>
                </div>
              ))}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
