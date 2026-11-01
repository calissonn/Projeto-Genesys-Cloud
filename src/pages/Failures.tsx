import { BellPlus, Pencil, Power, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from '../components/ChartTooltip';
import { FilterBar } from '../components/FilterBar';
import { Card, CardHeader, Delta, EmptyState, InfoTip, OccStatusBadge, PageHeader, SeverityBadge } from '../components/ui';
import { useApp } from '../context/AppContext';
import type { AlertRule, MetricKey, OccurrenceStatus } from '../data/types';
import { FAILURE_METRICS } from '../lib/alertEngine';
import { useChartColors } from '../lib/chartColors';
import { diffDays, fmtDate } from '../lib/dates';
import { fmtInt, fmtPct } from '../lib/format';
import { METRIC_META, metricValue, scopeUraIds, sumTotals, totalsByDay } from '../lib/metrics';
import { COND_LABEL, OccurrenceDrawer, RuleForm, blankRule, fmtMetric } from './Alerts';

const FAILURE_SET = new Set<MetricKey>(FAILURE_METRICS.map((f) => f.metric));

/** Fonte e requisito de cada tipo de falha em produção. */
const SOURCE: Record<string, string> = {
  authFailureRate: 'Milestones de tentativa/falha de CPF no Architect (nFlowMilestone).',
  cpfExceeded: 'Milestone "tentativas excedidas" no Architect.',
  integrationErrors: 'Milestone no caminho Failure/Timeout das Data Actions; dimensão errorCode.',
  apiErrors: 'Milestone no caminho de falha de cada consulta de negócio (saldo, boleto, rastreio).',
  transferFailures: 'Saídas sem conexão à fila (tFlowExit por transferType) e métricas de fila.',
  flowErrors: 'Caminho de erro do fluxo (exitReason/errorCode) e histórico de execução, quando habilitado.',
  invalidOptionRate: 'Milestone "opção inválida / sem digitação" no menu.',
  disconnectRate: 'Nativo: tFlowDisconnect ÷ nFlow.',
};

export function Failures() {
  const { store, uras, departments, filters, range, prevRange, occurrences, updateOccurrence, rules, saveRule } = useApp();
  const c = useChartColors();
  const [sel, setSel] = useState<string | null>(null);
  const [status, setStatus] = useState<'all' | OccurrenceStatus>('all');
  const [type, setType] = useState<'all' | MetricKey>('all');
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const scope = useMemo(() => scopeUraIds(uras, filters), [uras, filters]);

  const data = useMemo(() => {
    if (!store) return null;
    const cur = store.query(range, scope);
    return { cur, t: sumTotals(cur), p: sumTotals(store.query(prevRange, scope)), daily: totalsByDay(cur, range) };
  }, [store, range, prevRange, scope]);
  if (!store || !data) return null;
  const { t, p, daily } = data;
  const days = diffDays(range.from, range.to) + 1;

  const occ = occurrences.filter((o) => FAILURE_SET.has(o.metric)
    && (filters.departmentId === 'all' || o.departmentId === filters.departmentId)
    && (filters.uraId === 'all' || o.uraId === filters.uraId)
    && (status === 'all' || o.status === status)
    && (type === 'all' || o.metric === type));
  const selOcc = occurrences.find((o) => o.id === sel) ?? null;
  const failureRules = rules.filter((r) => FAILURE_SET.has(r.metric));
  const uraName = (id: string) => uras.find((u) => u.id === id)?.name ?? id;

  return (
    <div>
      <PageHeader title="Monitoramento de falhas"
        description="Falhas operacionais das URAs: identificação, integrações, consultas, transferências, erros de fluxo e navegação inesperada — com detecção automática de anomalias e regras personalizadas." />
      <FilterBar />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {FAILURE_METRICS.map((f) => {
          const v = metricValue(t, f.metric);
          const pv = metricValue(p, f.metric);
          const isPct = METRIC_META[f.metric].unit === '%';
          const open = occurrences.filter((o) => o.metric === f.metric && (o.status === 'aberta' || o.status === 'em_analise')
            && (filters.uraId === 'all' || o.uraId === filters.uraId) && (filters.departmentId === 'all' || o.departmentId === filters.departmentId)).length;
          return (
            <button key={f.metric} onClick={() => setType(type === f.metric ? 'all' : f.metric)}
              className={`card p-4 text-left transition hover:border-brand-300 ${type === f.metric ? 'ring-2 ring-brand-500' : ''} ${open ? 'border-l-4 border-l-red-500' : ''}`}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">{f.label} <InfoTip text={`Em produção: ${SOURCE[f.metric]}`} /></div>
              <div className="mt-1 text-2xl font-semibold">{isPct ? fmtPct(v) : fmtInt(v)}</div>
              <Delta value={isPct ? v - pv : pv ? ((v - pv) / pv) * 100 : null} higherIsBad unit={isPct ? ' p.p.' : '%'} />
              <div className="mt-1 text-xs text-slate-500">{open ? <span className="font-medium text-red-600">{open} ocorrência(s) em aberto</span> : 'Sem ocorrências em aberto'}</div>
            </button>
          );
        })}
      </div>

      <Card className="mt-5">
        <CardHeader title="Tendência diária por tipo de falha" subtitle="Cada gráfico tem a própria escala — compare formas, não alturas entre gráficos." />
        {days < 2 ? <EmptyState title="Selecione um período de 2 dias ou mais" /> : (
          <div className="grid gap-x-4 gap-y-2 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {FAILURE_METRICS.map((f) => {
              const series = daily.map((d) => ({ date: d.date, v: d.entries ? metricValue(d, f.metric) : null }));
              const isPct = METRIC_META[f.metric].unit === '%';
              return (
                <div key={f.metric}>
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-300">{f.label}</div>
                  <div className="h-24">
                    <ResponsiveContainer>
                      <LineChart data={series} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
                        <CartesianGrid vertical={false} stroke={c.grid} />
                        <XAxis dataKey="date" hide />
                        <YAxis width={36} tick={{ fill: c.text, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => (isPct ? `${Math.round(v)}%` : String(Math.round(v)))} />
                        <Tooltip content={<ChartTooltip labelFormatter={(l) => fmtDate(String(l), true)} valueFormatter={(v) => (isPct ? fmtPct(v) : fmtInt(v))} />} />
                        <Line dataKey="v" name={f.label} stroke={c.critical} strokeWidth={1.75} dot={false} activeDot={{ r: 3 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title="Ocorrências de falha" subtitle="Detecção automática + regras personalizadas · últimos 14 dias"
          actions={<>
            <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="all">Todos os tipos</option>{FAILURE_METRICS.map((f) => <option key={f.metric} value={f.metric}>{f.label}</option>)}
            </select>
            <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="all">Todos os status</option><option value="aberta">Aberta</option><option value="em_analise">Em análise</option><option value="resolvida">Resolvida</option><option value="descartada">Descartada</option>
            </select>
          </>} />
        {occ.length === 0 ? <EmptyState title="Nenhuma ocorrência de falha" text="Nenhuma anomalia detectada e nenhuma regra de falha disparou para os filtros escolhidos." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="th">Data</th><th className="th">Tipo / descrição</th><th className="th">URA</th><th className="th text-right">Valor</th><th className="th text-right">Referência</th><th className="th">Criticidade</th><th className="th">Status</th><th className="th">Responsável</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {occ.map((o) => (
                  <tr key={o.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => setSel(o.id)}>
                    <td className="td whitespace-nowrap">{fmtDate(o.date, true)}</td>
                    <td className="td"><div className="font-medium">{FAILURE_METRICS.find((f) => f.metric === o.metric)?.label}</div><div className="text-xs text-slate-500">{o.ruleId.startsWith('auto:') ? 'Detecção automática' : `Regra: ${o.ruleName}`}</div></td>
                    <td className="td"><div>{uraName(o.uraId)}</div><div className="text-xs text-slate-500">{departments.find((d) => d.id === o.departmentId)?.name}</div></td>
                    <td className="td text-right font-semibold tabular-nums">{fmtMetric(o.metric, o.value)}</td>
                    <td className="td text-right text-xs text-slate-500">{o.baseline != null ? `média ${fmtMetric(o.metric, o.baseline)}` : `limite ${fmtMetric(o.metric, o.threshold)}`}</td>
                    <td className="td"><SeverityBadge s={o.severity} /></td>
                    <td className="td"><OccStatusBadge s={o.status} /></td>
                    <td className="td text-sm">{o.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title="Regras personalizadas de falha" subtitle="Ex.: “se a falha de identificação por CPF aumentar significativamente, gerar alerta para investigação”"
          actions={<button className="btn-primary" onClick={() => setEditing({ ...blankRule('authFailureRate'), name: '', condition: 'aumento_pct', threshold: 40, severity: 'alta' })}><BellPlus className="h-4 w-4" /> Nova regra de falha</button>} />
        {failureRules.length === 0 ? <EmptyState title="Nenhuma regra de falha" text="A detecção automática continua ativa. Crie regras para limites específicos." /> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {failureRules.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${r.enabled ? '' : 'opacity-60'}`}>
                <ShieldAlert className="h-4 w-4 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{r.name}</div>
                  <div className="text-xs text-slate-500">{METRIC_META[r.metric].label} · {COND_LABEL[r.condition]} {r.condition.endsWith('pct') ? `${r.threshold}%` : fmtMetric(r.metric, r.threshold)} · {r.owner}</div>
                </div>
                <SeverityBadge s={r.severity} />
                <button className="btn-ghost p-1.5" title={r.enabled ? 'Pausar' : 'Ativar'} onClick={() => saveRule({ ...r, enabled: !r.enabled })}><Power className={`h-4 w-4 ${r.enabled ? 'text-emerald-600' : ''}`} /></button>
                <button className="btn-ghost p-1.5" title="Editar" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {selOcc && <OccurrenceDrawer o={selOcc} onClose={() => setSel(null)} onUpdate={(patch) => updateOccurrence(selOcc.id, patch)} />}
      {editing && <RuleForm rule={editing} onClose={() => setEditing(null)} onSave={(r) => { saveRule(r); setEditing(null); }} />}
    </div>
  );
}
