import { CheckCircle2, CircleMinus, GitBranch } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from '../components/ChartTooltip';
import { FilterBar } from '../components/FilterBar';
import { Card, CardHeader, Delta, EmptyState, Field, InfoTip, Legend, PageHeader, Segmented } from '../components/ui';
import { useApp } from '../context/AppContext';
import { CHANGE_TYPE_LABEL } from '../data/changeLog';
import type { Totals } from '../data/types';
import { useChartColors } from '../lib/chartColors';
import { addDays, diffDays, fmtDate, fmtDateLong, todayISO } from '../lib/dates';
import { fmtDuration, fmtInt, fmtPct } from '../lib/format';
import { rates, scopeUraIds, sumTotals, totalsByDay, type Range } from '../lib/metrics';
import { computeUraFlows, disconnectsByStep, twoProportionPValue } from '../lib/stepAnalytics';

type Mode = 'periodos' | 'alteracao';
type BPreset = 'anterior' | 'semana' | '4semanas' | 'custom';

interface Row {
  label: string;
  a: number;
  b: number;
  fmt: (v: number) => string;
  kind: 'rate' | 'count' | 'time';
  higherIsBad: boolean;
  p?: number | null;
  info?: string;
}

function buildRows(A: Totals, B: Totals, daysA: number, daysB: number): Row[] {
  const ra = rates(A);
  const rb = rates(B);
  const pv = (xa: number, na: number, xb: number, nb: number) => twoProportionPValue(xa, na, xb, nb);
  return [
    { label: 'Entradas por dia (média)', a: A.entries / daysA, b: B.entries / daysB, fmt: fmtInt, kind: 'count', higherIsBad: false, info: 'Média diária — permite comparar períodos de tamanhos diferentes.' },
    { label: 'Taxa de desligamento', a: ra.disconnectRate, b: rb.disconnectRate, fmt: (v) => fmtPct(v), kind: 'rate', higherIsBad: true, p: pv(A.disconnects, A.entries, B.disconnects, B.entries) },
    { label: 'Taxa de transferência', a: ra.transferRate, b: rb.transferRate, fmt: (v) => fmtPct(v), kind: 'rate', higherIsBad: true, p: pv(A.transfers, A.entries, B.transfers, B.entries) },
    { label: 'Taxa de autosserviço', a: ra.selfServiceRate, b: rb.selfServiceRate, fmt: (v) => fmtPct(v), kind: 'rate', higherIsBad: false, p: pv(A.selfService, A.entries, B.selfService, B.entries) },
    { label: 'Falha de identificação (CPF)', a: ra.authFailureRate, b: rb.authFailureRate, fmt: (v) => fmtPct(v), kind: 'rate', higherIsBad: true, p: A.authAttempts && B.authAttempts ? pv(A.authFailures, A.authAttempts, B.authFailures, B.authAttempts) : null },
    { label: 'Opção inválida', a: A.entries ? (A.invalidOptions / A.entries) * 100 : 0, b: B.entries ? (B.invalidOptions / B.entries) * 100 : 0, fmt: (v) => fmtPct(v), kind: 'rate', higherIsBad: true, p: pv(A.invalidOptions, A.entries, B.invalidOptions, B.entries) },
    { label: 'Abandono na fila', a: ra.queueAbandonRate, b: rb.queueAbandonRate, fmt: (v) => fmtPct(v), kind: 'rate', higherIsBad: true, p: pv(A.queueAbandons, A.transfers, B.queueAbandons, B.transfers) },
    { label: 'Tempo médio na URA', a: ra.avgDuration, b: rb.avgDuration, fmt: fmtDuration, kind: 'time', higherIsBad: true },
    { label: 'Erros de integração por dia', a: A.integrationErrors / daysA, b: B.integrationErrors / daysB, fmt: (v) => v.toFixed(1).replace('.', ','), kind: 'count', higherIsBad: true },
    { label: 'Falhas de API por dia', a: A.apiErrors / daysA, b: B.apiErrors / daysB, fmt: (v) => v.toFixed(1).replace('.', ','), kind: 'count', higherIsBad: true },
  ];
}

export function Compare() {
  const { store, uras, filters, range, changes } = useApp();
  const c = useChartColors();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get('change') ? 'alteracao' : 'periodos');
  const [bPreset, setBPreset] = useState<BPreset>('anterior');
  const [custom, setCustom] = useState<Range>(() => ({ from: addDays(range.from, -28), to: addDays(range.to, -28) }));
  const [changeId, setChangeId] = useState<string>(params.get('change') ?? '');
  const [win, setWin] = useState(7);
  const [chartMetric, setChartMetric] = useState<'disconnectRate' | 'selfServiceRate' | 'transferRate' | 'authFailureRate'>('disconnectRate');

  const scopedChanges = changes.filter((ch) => (filters.uraId === 'all' || ch.uraId === filters.uraId)
    && (filters.departmentId === 'all' || uras.find((u) => u.id === ch.uraId)?.departmentId === filters.departmentId)
    && (!store || ch.date >= addDays(store.minDate, 7)));
  const change = changes.find((ch) => ch.id === changeId) ?? null;

  // Períodos A e B
  const today = todayISO();
  let A: Range;
  let B: Range;
  let scopeIds = scopeUraIds(uras, filters);
  let labelA = 'Período A';
  let labelB = 'Período B';
  let partial = false;
  if (mode === 'alteracao' && change) {
    scopeIds = new Set([change.uraId]);
    B = { from: addDays(change.date, -win), to: addDays(change.date, -1) };
    A = { from: addDays(change.date, 1), to: addDays(change.date, win) };
    if (A.to > today) { A = { ...A, to: today }; partial = true; }
    labelA = 'Depois da alteração';
    labelB = 'Antes da alteração';
  } else {
    A = range;
    const len = diffDays(range.from, range.to) + 1;
    B = bPreset === 'anterior' ? { from: addDays(range.from, -len), to: addDays(range.from, -1) }
      : bPreset === 'semana' ? { from: addDays(range.from, -7), to: addDays(range.to, -7) }
        : bPreset === '4semanas' ? { from: addDays(range.from, -28), to: addDays(range.to, -28) }
          : custom;
    labelA = 'Período A (filtro)';
    labelB = 'Período B';
  }
  const validA = A.from <= A.to;
  const daysA = Math.max(1, diffDays(A.from, A.to) + 1);
  const daysB = Math.max(1, diffDays(B.from, B.to) + 1);

  const scopeKey = scopeIds ? Array.from(scopeIds).sort().join(',') : 'all';
  const res = useMemo(() => {
    if (!store || !validA) return null;
    const ra = store.query(A, scopeIds);
    const rb = store.query(B, scopeIds);
    const tA = sumTotals(ra);
    const tB = sumTotals(rb);
    const dA = totalsByDay(ra, A);
    const dB = totalsByDay(rb, B);
    const n = Math.max(dA.length, dB.length);
    const pick = (d: Totals | undefined) => (d && d.entries ? ({
      disconnectRate: rates(d).disconnectRate, selfServiceRate: rates(d).selfServiceRate, transferRate: rates(d).transferRate, authFailureRate: rates(d).authFailureRate,
    }) : null);
    const overlay = Array.from({ length: n }, (_, i) => ({ day: i + 1, a: pick(dA[i])?.[chartMetric] ?? null, b: pick(dB[i])?.[chartMetric] ?? null, dateA: dA[i]?.date, dateB: dB[i]?.date }));
    const single = scopeIds && scopeIds.size === 1 ? Array.from(scopeIds)[0] : null;
    const steps = single ? (() => {
      const fa = disconnectsByStep(computeUraFlows(store, uras, A, scopeIds));
      const fb = disconnectsByStep(computeUraFlows(store, uras, B, scopeIds));
      return fa.map((s) => ({ ...s, prev: fb.find((x) => x.category === s.category) }));
    })() : null;
    return { tA, tB, overlay, steps };
  }, [store, A.from, A.to, B.from, B.to, scopeKey, chartMetric, uras, validA]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = res ? buildRows(res.tA, res.tB, daysA, daysB) : [];
  const significant = rows.filter((r) => r.kind === 'rate' && r.p != null && r.p < 0.05 && Math.abs(r.a - r.b) >= 0.5);
  const metricLabel = { disconnectRate: 'Taxa de desligamento', selfServiceRate: 'Taxa de autosserviço', transferRate: 'Taxa de transferência', authFailureRate: 'Falha de CPF' }[chartMetric];

  return (
    <div>
      <PageHeader title="Comparação entre períodos"
        description="Compare indicadores entre dois períodos ou antes e depois de uma alteração na URA. Taxas recebem teste estatístico para separar mudanças reais de variação natural."
        actions={<Segmented value={mode} onChange={setMode} options={[{ value: 'periodos', label: 'Dois períodos' }, { value: 'alteracao', label: 'Antes × depois de alteração' }]} />} />
      <FilterBar showUra />

      <Card className="mb-5 p-4">
        {mode === 'periodos' ? (
          <div className="flex flex-wrap items-end gap-4">
            <div className="text-sm"><span className="label">Período A (filtro global)</span><b>{fmtDateLong(A.from)} – {fmtDateLong(A.to)}</b> <span className="text-slate-500">({daysA} dias)</span></div>
            <Field label="Comparar com (Período B)">
              <select className="input" value={bPreset} onChange={(e) => setBPreset(e.target.value as BPreset)}>
                <option value="anterior">Período imediatamente anterior</option>
                <option value="semana">Mesmo período da semana anterior</option>
                <option value="4semanas">Mesmo período, 4 semanas antes</option>
                <option value="custom">Personalizado</option>
              </select>
            </Field>
            {bPreset === 'custom' ? (
              <>
                <Field label="De"><input type="date" className="input" value={custom.from} min={store?.minDate} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} /></Field>
                <Field label="Até"><input type="date" className="input" value={custom.to} min={custom.from} max={store?.maxDate} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} /></Field>
              </>
            ) : <div className="text-sm"><span className="label">Período B</span><b>{fmtDateLong(B.from)} – {fmtDateLong(B.to)}</b></div>}
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Alteração na URA">
              <select className="input min-w-[360px]" value={changeId} onChange={(e) => setChangeId(e.target.value)}>
                <option value="">Selecione uma alteração…</option>
                {scopedChanges.map((ch) => <option key={ch.id} value={ch.id}>{fmtDate(ch.date)} · {uras.find((u) => u.id === ch.uraId)?.name} · {ch.version} — {ch.description}</option>)}
              </select>
            </Field>
            <Field label="Janela (dias antes/depois)">
              <select className="input" value={win} onChange={(e) => setWin(Number(e.target.value))}><option value={3}>3 dias</option><option value={7}>7 dias</option><option value={14}>14 dias</option></select>
            </Field>
            {change && (
              <div className="text-xs text-slate-500">
                Tipo: {CHANGE_TYPE_LABEL[change.type]} · O dia da publicação ({fmtDate(change.date)}) é excluído das duas janelas.
                {partial && <span className="ml-1 font-medium text-amber-600">Janela “depois” incompleta ({daysA} de {win} dias) — conclusões preliminares.</span>}
              </div>
            )}
          </div>
        )}
      </Card>

      {mode === 'alteracao' && !change ? (
        <Card><EmptyState title="Selecione uma alteração" text="As alterações vêm do Histórico de alterações. Filtre por URA para reduzir a lista." action={<Link to="/historico" className="btn-secondary">Abrir histórico</Link>} /></Card>
      ) : !res || !validA ? (
        <Card><EmptyState title="Período inválido" text="A alteração ainda não tem dias completos depois da publicação." /></Card>
      ) : res.tA.entries === 0 || res.tB.entries === 0 ? (
        <Card><EmptyState title="Sem dados em um dos períodos" text="Escolha períodos dentro do histórico disponível." /></Card>
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader title="Indicadores" subtitle={`${labelB}: ${fmtDate(B.from)}–${fmtDate(B.to)} · ${labelA}: ${fmtDate(A.from)}–${fmtDate(A.to)}`}
                info="Significância: teste de duas proporções (p < 0,05). Indica se a diferença dificilmente é fruto do acaso — não prova a causa." />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="th">Indicador</th><th className="th text-right">{labelB}</th><th className="th text-right">{labelA}</th><th className="th text-right">Variação</th><th className="th">Significativo?</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((r) => (
                      <tr key={r.label}>
                        <td className="td">{r.label}{r.info && <InfoTip className="ml-1" text={r.info} />}</td>
                        <td className="td text-right tabular-nums text-slate-500">{r.fmt(r.b)}</td>
                        <td className="td text-right font-semibold tabular-nums">{r.fmt(r.a)}</td>
                        <td className="td text-right"><Delta value={r.kind === 'rate' ? r.a - r.b : r.b ? ((r.a - r.b) / r.b) * 100 : null} higherIsBad={r.higherIsBad} unit={r.kind === 'rate' ? ' p.p.' : '%'} suffix="" /></td>
                        <td className="td text-xs">
                          {r.kind !== 'rate' ? <span className="text-slate-400">—</span> : r.p == null ? <span className="text-slate-400">Volume insuficiente</span>
                            : r.p < 0.05 ? <span className="inline-flex items-center gap-1 font-medium text-slate-800 dark:text-slate-100"><CheckCircle2 className="h-3.5 w-3.5 text-brand-600" /> Sim (p {r.p < 0.001 ? '< 0,001' : `= ${r.p.toFixed(3).replace('.', ',')}`})</span>
                              : <span className="inline-flex items-center gap-1 text-slate-500"><CircleMinus className="h-3.5 w-3.5" /> Não (p = {r.p.toFixed(2).replace('.', ',')})</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader title="Conclusão" info="Texto gerado por regras a partir da tabela. Mudanças significativas indicam onde investigar; a causa deve ser confirmada." />
              <div className="space-y-2 px-4 py-3 text-sm">
                {significant.length === 0 ? (
                  <p>Nenhuma diferença estatisticamente significativa nas taxas entre <b>{labelB.toLowerCase()}</b> e <b>{labelA.toLowerCase()}</b>. As variações observadas são compatíveis com oscilação natural.</p>
                ) : (
                  <>
                    <p>{significant.length} indicador(es) mudaram de forma estatisticamente significativa:</p>
                    <ul className="list-disc space-y-1 pl-5">
                      {significant.map((r) => {
                        const worse = (r.a > r.b) === r.higherIsBad;
                        return <li key={r.label}><b>{r.label}</b>: {r.fmt(r.b)} → {r.fmt(r.a)} ({r.a > r.b ? '+' : ''}{(r.a - r.b).toFixed(1).replace('.', ',')} p.p.) — <span className={worse ? 'font-medium text-red-600' : 'font-medium text-emerald-700 dark:text-emerald-400'}>{worse ? 'piora' : 'melhora'}</span>.</li>;
                      })}
                    </ul>
                  </>
                )}
                {mode === 'alteracao' && change && significant.length > 0 && (
                  <p className="text-slate-600 dark:text-slate-300">As mudanças coincidem com a publicação de <b>{change.version}</b> ({change.description}). Coincidência temporal é uma hipótese de causa — valide com testes funcionais e com dados por etapa.</p>
                )}
                {partial && <p className="text-xs text-amber-700 dark:text-amber-400">Atenção: janela posterior incompleta.</p>}
              </div>
            </Card>
          </div>

          <Card className="mt-5">
            <CardHeader title={`${metricLabel} — dia a dia`} subtitle="Dias alinhados pela posição no período (Dia 1, Dia 2…)"
              actions={<>
                <Legend items={[{ label: labelB, color: c.other }, { label: labelA, color: c.transfer }]} />
                <select className="input w-auto" value={chartMetric} onChange={(e) => setChartMetric(e.target.value as typeof chartMetric)}>
                  <option value="disconnectRate">Taxa de desligamento</option><option value="selfServiceRate">Taxa de autosserviço</option><option value="transferRate">Taxa de transferência</option><option value="authFailureRate">Falha de CPF</option>
                </select>
              </>} />
            <div className="h-64 p-3">
              <ResponsiveContainer>
                <LineChart data={res.overlay}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="day" tick={{ fill: c.text, fontSize: 11 }} tickLine={false} axisLine={{ stroke: c.grid }} tickFormatter={(d) => `Dia ${d}`} minTickGap={20} />
                  <YAxis tick={{ fill: c.text, fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<ChartTooltip labelFormatter={(l, p) => { const x = p?.[0]?.payload as { dateA?: string; dateB?: string } | undefined; return `Dia ${l}${x ? ` · B ${x.dateB ? fmtDate(x.dateB) : '—'} · A ${x.dateA ? fmtDate(x.dateA) : '—'}` : ''}`; }} valueFormatter={(v) => fmtPct(v)} />} />
                  <Line dataKey="b" name={labelB} stroke={c.other} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} connectNulls />
                  <Line dataKey="a" name={labelA} stroke={c.transfer} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="mt-5">
            <CardHeader title="Detalhamento por etapa" subtitle={res.steps ? 'Taxa de desligamento em cada etapa da URA' : 'Selecione uma única URA no filtro (ou compare uma alteração) para ver as etapas.'} />
            {res.steps ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="th">Etapa</th><th className="th text-right">{labelB}</th><th className="th text-right">{labelA}</th><th className="th text-right">Variação</th><th className="th">Significativo?</th><th className="th" /></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {res.steps.filter((s) => s.disconnects >= 0.5).map((s) => {
                      const pval = s.prev ? twoProportionPValue(s.disconnects, s.visits, s.prev.disconnects, s.prev.visits) : null;
                      const uraId = Array.from(scopeIds!)[0];
                      return (
                        <tr key={s.category}>
                          <td className="td">{s.category}</td>
                          <td className="td text-right tabular-nums text-slate-500">{s.prev ? fmtPct(s.prev.rate) : '—'}</td>
                          <td className="td text-right font-semibold tabular-nums">{fmtPct(s.rate)}</td>
                          <td className="td text-right"><Delta value={s.prev ? s.rate - s.prev.rate : null} higherIsBad unit=" p.p." suffix="" /></td>
                          <td className="td text-xs">{pval == null ? '—' : pval < 0.05 ? <b>Sim</b> : <span className="text-slate-500">Não</span>}</td>
                          <td className="td"><Link className="btn-ghost p-1.5" title="Abrir etapa no mapa" to={`/mapa?ura=${uraId}&etapa=${s.byUra[0]?.nodeId}`}><GitBranch className="h-4 w-4" /></Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="px-4 py-2 text-xs text-slate-500">Valores por etapa vêm do modelo simulado. Em produção dependem de Flow Milestones.</p>
              </div>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );
}
