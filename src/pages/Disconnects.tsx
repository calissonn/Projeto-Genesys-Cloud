import { GitBranch, Lightbulb, Settings2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from '../components/ChartTooltip';
import { FilterBar } from '../components/FilterBar';
import { GoalsModal } from '../components/GoalsModal';
import { Card, CardHeader, Delta, EmptyState, HealthBadge, KpiCard, Legend, PageHeader, Segmented } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useChartColors } from '../lib/chartColors';
import { addDays, diffDays, fmtDate, fromISO, weekday } from '../lib/dates';
import { fmtCompact, fmtInt, fmtPct, variation } from '../lib/format';
import { groupBy, rates, scopeUraIds, sumTotals, totalsByDay } from '../lib/metrics';
import { computeUraFlows, disconnectsByOption, disconnectsByStep } from '../lib/stepAnalytics';
import { healthFor } from './Dashboard';

const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function weekStart(iso: string) {
  const d = fromISO(iso).getDay();
  return addDays(iso, -((d + 6) % 7));
}

export function Disconnects() {
  const { store, uras, departments, filters, range, prevRange, goals, availability } = useApp();
  const c = useChartColors();
  const [grain, setGrain] = useState<'dia' | 'semana'>('dia');
  const [evoMetric, setEvoMetric] = useState<'taxa' | 'volume'>('taxa');
  const [goalsOpen, setGoalsOpen] = useState(false);

  const scope = useMemo(() => scopeUraIds(uras, filters), [uras, filters]);
  const d = useMemo(() => {
    if (!store) return null;
    const cur = store.query(range, scope);
    const prev = store.query(prevRange, scope);
    const flows = computeUraFlows(store, uras, range, scope);
    return { cur, t: sumTotals(cur), p: sumTotals(prev), prevRecs: prev, flows, steps: disconnectsByStep(flows), options: disconnectsByOption(flows) };
  }, [store, range, prevRange, scope, uras]);
  if (!store || !d) return null;
  const { cur, t, p, steps, options } = d;
  const r = rates(t);
  const pr = rates(p);
  const days = diffDays(range.from, range.to) + 1;

  if (!t.entries) {
    return (
      <div>
        <PageHeader title="Análise de desligamentos" />
        <FilterBar />
        <Card><EmptyState title="Sem dados para os filtros selecionados" /></Card>
      </div>
    );
  }

  // Evolução diária / semanal
  const daily = totalsByDay(cur, range);
  const evo = grain === 'dia'
    ? daily.map((x) => ({ label: x.date, disc: x.disconnects, rate: x.entries ? (x.disconnects / x.entries) * 100 : null, queue: x.queueAbandons }))
    : Array.from(groupBy(cur, (x) => weekStart(x.date)).entries()).sort(([a], [b]) => (a < b ? -1 : 1)).map(([w, recs]) => {
      const tt = sumTotals(recs);
      return { label: w, disc: tt.disconnects, rate: tt.entries ? (tt.disconnects / tt.entries) * 100 : null, queue: tt.queueAbandons };
    });

  // Mapa de calor dia da semana × hora (taxa)
  const heat: { e: number; d: number }[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ e: 0, d: 0 })));
  for (const x of cur) {
    const cell = heat[weekday(x.date)][x.hour];
    cell.e += x.entries;
    cell.d += x.disconnects;
  }
  const minHeatVol = Math.max(20, (t.entries / (7 * 24)) * 0.15);
  const heatRates = heat.flat().filter((h) => h.e >= minHeatVol).map((h) => (h.d / h.e) * 100);
  const hMin = Math.min(...heatRates);
  const hMax = Math.max(...heatRates);

  // Por departamento
  const byDept = Array.from(groupBy(cur, (x) => uras.find((u) => u.id === x.uraId)?.departmentId ?? '?').entries()).map(([id, recs]) => {
    const tt = sumTotals(recs);
    return { name: departments.find((dd) => dd.id === id)?.short ?? id, rate: (tt.disconnects / tt.entries) * 100, disc: tt.disconnects };
  }).sort((a, b) => b.rate - a.rate);

  // Comparação entre URAs
  const prevByUra = groupBy(d.prevRecs, (x) => x.uraId);
  const byUra = Array.from(groupBy(cur, (x) => x.uraId).entries()).map(([id, recs]) => {
    const tt = sumTotals(recs);
    const pt = sumTotals(prevByUra.get(id) ?? []);
    const rate = (tt.disconnects / tt.entries) * 100;
    const prate = pt.entries ? (pt.disconnects / pt.entries) * 100 : null;
    return { ura: uras.find((u) => u.id === id)!, entries: tt.entries, disc: tt.disconnects, rate, delta: prate == null ? null : rate - prate, queueRate: tt.transfers ? (tt.queueAbandons / tt.transfers) * 100 : 0 };
  }).filter((x) => x.ura).sort((a, b) => b.rate - a.rate);

  // Padrões observados
  const hourAgg = Array.from({ length: 24 }, (_, h) => heat.reduce((acc, row) => ({ e: acc.e + row[h].e, d: acc.d + row[h].d }), { e: 0, d: 0 }));
  const busyHours = hourAgg.map((h, i) => ({ h: i, ...h })).filter((h) => h.e >= t.entries * 0.02);
  const worstHour = busyHours.sort((a, b) => b.d / b.e - a.d / a.e)[0];
  const wdAgg = heat.map((row, i) => ({ wd: i, e: row.reduce((s, x) => s + x.e, 0), d: row.reduce((s, x) => s + x.d, 0) })).filter((x) => x.e >= t.entries * 0.03);
  const worstWd = [...wdAgg].sort((a, b) => b.d / b.e - a.d / a.e)[0];
  const bestWd = [...wdAgg].sort((a, b) => a.d / a.e - b.d / b.e)[0];
  const topStep = steps.find((s) => !s.expected);
  const topRise = [...byUra].filter((x) => x.delta != null).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))[0];
  const critCount = byUra.filter((x) => healthFor(x.rate, goals.disconnectWarn, goals.disconnectCrit) === 'crit').length;

  const axis = { stroke: c.axis, tick: { fill: c.text, fontSize: 11 }, tickLine: false, axisLine: { stroke: c.grid } };
  const maxStepDisc = Math.max(...steps.map((s) => s.disconnects), 1);
  const singleUra = filters.uraId !== 'all' ? filters.uraId : null;

  return (
    <div>
      <PageHeader title="Análise de desligamentos"
        description="Onde, quando e em quais URAs os clientes desligam dentro do fluxo — separado do abandono que ocorre na fila após a transferência."
        actions={<button className="btn-secondary" onClick={() => setGoalsOpen(true)}><Settings2 className="h-4 w-4" /> Metas e classificação</button>} />
      <FilterBar />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Desligamentos na URA" value={fmtInt(t.disconnects)} delta={variation(t.disconnects, p.disconnects)} higherIsBad
          info="Cliente encerrou a ligação enquanto estava dentro do fluxo da URA. Em produção: tFlowDisconnect (count)." />
        <KpiCard label="Taxa de desligamento" value={fmtPct(r.disconnectRate)} delta={p.entries > 0 ? r.disconnectRate - pr.disconnectRate : null} deltaUnit=" p.p." higherIsBad
          accent={healthFor(r.disconnectRate, goals.disconnectWarn, goals.disconnectCrit)} sub={`Atenção ≥ ${goals.disconnectWarn}% · Crítico ≥ ${goals.disconnectCrit}%`}
          info="Desligamentos na URA ÷ entradas. Classificação conforme metas configuráveis (botão Metas e classificação)." />
        <KpiCard label="Abandono na fila (após URA)" value={availability && !availability.queueAbandons ? '—' : fmtInt(t.queueAbandons)} delta={variation(t.queueAbandons, p.queueAbandons)} higherIsBad
          sub={`${fmtPct(r.queueAbandonRate)} das transferências`}
          info="Cliente foi transferido e desligou enquanto aguardava na fila humana. NÃO é desligamento na URA. Em produção: métricas de fila (Conversation Aggregates)." />
        <KpiCard label="Principal ponto de saída" value={topStep?.category ?? '—'} info="Etapa da URA com maior número absoluto de desligamentos no período (depende de Milestones em produção)."
          sub={topStep ? `${fmtInt(topStep.disconnects)} desligamentos (${fmtPct(topStep.rate)} de quem chegou)` : undefined} />
        <KpiCard label="URAs em situação crítica" value={String(critCount)} info={`URAs com taxa de desligamento ≥ ${goals.disconnectCrit}% no período.`}
          accent={critCount ? 'crit' : 'ok'} sub={`de ${byUra.length} URAs com dados`} />
        <KpiCard label="Tempo médio até desligar" value="—" info="Disponível em produção via tFlowDisconnect (sum ÷ count). Não simulado neste protótipo para evitar números sem base." sub="Requer integração" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Evolução dos desligamentos" subtitle={grain === 'dia' ? 'Por dia' : 'Por semana (início na segunda-feira)'}
            actions={<>
              <Segmented value={evoMetric} onChange={setEvoMetric} options={[{ value: 'taxa', label: 'Taxa (%)' }, { value: 'volume', label: 'Volume' }]} />
              <Segmented value={grain} onChange={setGrain} options={[{ value: 'dia', label: 'Diário' }, { value: 'semana', label: 'Semanal' }]} />
            </>} />
          <div className="h-64 p-3">
            {evo.length < 2 ? <EmptyState title="Selecione um período maior" text="A evolução precisa de pelo menos 2 pontos." /> : (
              <ResponsiveContainer>
                {evoMetric === 'taxa' ? (
                  <LineChart data={evo}>
                    <CartesianGrid vertical={false} stroke={c.grid} />
                    <XAxis dataKey="label" {...axis} tickFormatter={(x) => fmtDate(x)} minTickGap={20} />
                    <YAxis {...axis} width={44} tickFormatter={(v) => `${v}%`} />
                    <ReferenceLine y={goals.disconnectWarn} stroke={c.warning} strokeDasharray="4 4" label={{ value: `Atenção ${goals.disconnectWarn}%`, fill: c.text, fontSize: 10, position: 'insideTopLeft' }} />
                    <ReferenceLine y={goals.disconnectCrit} stroke={c.critical} strokeDasharray="4 4" label={{ value: `Crítico ${goals.disconnectCrit}%`, fill: c.text, fontSize: 10, position: 'insideTopLeft' }} />
                    <Tooltip content={<ChartTooltip labelFormatter={(l) => (grain === 'dia' ? fmtDate(String(l), true) : `Semana de ${fmtDate(String(l))}`)} valueFormatter={(v) => fmtPct(v)} />} />
                    <Line dataKey="rate" name="Taxa de desligamento" stroke={c.disconnect} strokeWidth={2} dot={grain === 'semana'} activeDot={{ r: 4 }} />
                  </LineChart>
                ) : (
                  <BarChart data={evo} barCategoryGap={days > 40 ? 1 : 3}>
                    <CartesianGrid vertical={false} stroke={c.grid} />
                    <XAxis dataKey="label" {...axis} tickFormatter={(x) => fmtDate(x)} minTickGap={20} />
                    <YAxis {...axis} width={48} tickFormatter={(v) => fmtCompact(v)} />
                    <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} content={<ChartTooltip labelFormatter={(l) => (grain === 'dia' ? fmtDate(String(l), true) : `Semana de ${fmtDate(String(l))}`)} valueFormatter={(v) => fmtInt(v)} />} />
                    <Bar dataKey="disc" name="Desligamento na URA" fill={c.disconnect} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="queue" name="Abandono na fila" fill={c.s4} radius={[3, 3, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            )}
          </div>
          {evoMetric === 'volume' && <div className="px-4 pb-3"><Legend items={[{ label: 'Desligamento na URA', color: c.disconnect }, { label: 'Abandono na fila (após transferência)', color: c.s4 }]} /></div>}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Padrões observados" info="Padrões calculados automaticamente a partir dos dados. São indícios para investigação — não diagnósticos." />
          <ul className="space-y-3 px-4 py-3 text-sm">
            {worstHour && <Insight text={<>Maior taxa por horário: <b>{String(worstHour.h).padStart(2, '0')}h</b> ({fmtPct((worstHour.d / worstHour.e) * 100)}), considerando horários com volume relevante.</>} />}
            {worstWd && bestWd && worstWd.wd !== bestWd.wd && <Insight text={<>Pior dia da semana: <b>{WD[worstWd.wd]}</b> ({fmtPct((worstWd.d / worstWd.e) * 100)}) — melhor: {WD[bestWd.wd]} ({fmtPct((bestWd.d / bestWd.e) * 100)}).</>} />}
            {topStep && <Insight text={<>Etapa com mais saídas: <b>{topStep.category}</b>, {fmtInt(topStep.disconnects)} desligamentos ({fmtPct((topStep.disconnects / t.disconnects) * 100)} do total).</>} />}
            {topRise && (topRise.delta ?? 0) > 0.5 && <Insight text={<>Maior aumento vs. período anterior: <b>{topRise.ura.name}</b> (+{(topRise.delta ?? 0).toFixed(1)} p.p.). Última alteração: {fmtDate(topRise.ura.lastChange)} — “{topRise.ura.lastChangeNote}”.</>} />}
            <li className="text-xs text-slate-500">Hipóteses devem ser validadas com testes funcionais e, em produção, com dados de Milestones.</li>
          </ul>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Desligamentos por dia da semana e horário" subtitle="Taxa de desligamento (%) — cor mais escura = taxa maior"
          info={`Células com menos de ${fmtInt(minHeatVol)} entradas ficam em branco para evitar conclusões com pouco volume.`} />
        <div className="overflow-x-auto p-4">
          <table className="border-separate border-spacing-0.5 text-[10px]">
            <thead><tr><th />{Array.from({ length: 24 }, (_, h) => <th key={h} className="w-8 font-normal text-slate-500">{String(h).padStart(2, '0')}</th>)}</tr></thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                <tr key={wd}>
                  <td className="pr-2 text-right text-xs text-slate-500">{WD[wd]}</td>
                  {heat[wd].map((cell, h) => {
                    const ok = cell.e >= minHeatVol;
                    const rate = ok ? (cell.d / cell.e) * 100 : 0;
                    const k = ok && hMax > hMin ? (rate - hMin) / (hMax - hMin) : 0;
                    return (
                      <td key={h} title={ok ? `${WD[wd]} ${String(h).padStart(2, '0')}h — ${fmtPct(rate)} (${fmtInt(cell.d)} de ${fmtInt(cell.e)})` : `${WD[wd]} ${String(h).padStart(2, '0')}h — volume insuficiente`}
                        className="h-7 w-8 rounded-sm text-center tabular-nums"
                        style={{ background: ok ? heatColor(k) : 'transparent', color: k > 0.55 ? '#fff' : c.text, border: ok ? 'none' : `1px dashed ${c.grid}` }}>
                        {ok ? Math.round(rate) : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
            <span>{fmtPct(hMin)}</span>
            <span className="h-2 w-40 rounded" style={{ background: `linear-gradient(90deg, ${heatColor(0)}, ${heatColor(0.5)}, ${heatColor(1)})` }} />
            <span>{fmtPct(hMax)}</span>
          </div>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Desligamentos por etapa" subtitle="Consolidado das URAs no filtro"
            info="Etapas equivalentes de URAs diferentes são somadas. Em produção, cada etapa depende de um Flow Milestone." />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="th">Etapa</th><th className="th text-right">Chegaram</th><th className="th">Desligamentos</th><th className="th text-right">Taxa</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {steps.filter((s) => s.disconnects >= 0.5).map((s) => {
                  const node = s.byUra.find((b) => b.uraId === singleUra);
                  return (
                    <tr key={s.category}>
                      <td className="td">
                        {singleUra && node ? <Link className="hover:text-brand-600 hover:underline" to={`/mapa?ura=${singleUra}&etapa=${node.nodeId}`}>{s.category}</Link> : s.category}
                      </td>
                      <td className="td text-right tabular-nums">{fmtInt(s.visits)}</td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-28 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-1.5 rounded-full" style={{ width: `${(s.disconnects / maxStepDisc) * 100}%`, background: c.disconnect }} /></div>
                          <span className="tabular-nums">{fmtInt(s.disconnects)}</span>
                        </div>
                      </td>
                      <td className="td text-right">{s.expected
                        ? <span title="Desligamento esperado após a mensagem de encerramento — não é classificado como problema."><HealthBadge h="none" label={`${fmtPct(s.rate)} · esperado`} /></span>
                        : <HealthBadge h={healthFor(s.rate, goals.stepDisconnectWarn, goals.stepDisconnectCrit)} label={fmtPct(s.rate)} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!singleUra && <p className="px-4 py-2 text-xs text-slate-500">Selecione uma URA no filtro para abrir cada etapa diretamente no mapa.</p>}
        </Card>

        <Card>
          <CardHeader title="Desligamentos por opção do menu" subtitle="Após o cliente escolher a opção" info="Opções de autosserviço: desligamentos durante o serviço. Opções de transferência: desligamentos na etapa de transferência (antes de entrar na fila)." />
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800"><tr><th className="th">Opção</th><th className="th text-right">Escolhas</th><th className="th text-right">Desligamentos</th><th className="th text-right">Taxa</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {options.slice(0, 20).map((o) => (
                  <tr key={`${o.uraId}-${o.key}`}>
                    <td className="td"><div className="font-medium">{o.key} · {o.label}</div><div className="text-xs text-slate-500">{o.uraName} · {o.kind === 'self' ? 'Autosserviço' : 'Transferência'}</div></td>
                    <td className="td text-right tabular-nums">{fmtInt(o.chosen)}</td>
                    <td className="td text-right tabular-nums">{fmtInt(o.disconnects)}</td>
                    <td className="td text-right tabular-nums">{fmtPct(o.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader title="Taxa por departamento" />
          <div className="p-3" style={{ height: Math.max(200, byDept.length * 36 + 40) }}>
            <ResponsiveContainer>
              <BarChart data={byDept} layout="vertical" barCategoryGap={8}>
                <CartesianGrid horizontal={false} stroke={c.grid} />
                <XAxis type="number" {...axis} tickFormatter={(v) => `${Math.round(v)}%`} />
                <YAxis type="category" dataKey="name" {...axis} width={90} />
                <ReferenceLine x={goals.disconnectCrit} stroke={c.critical} strokeDasharray="4 4" />
                <ReferenceLine x={goals.disconnectWarn} stroke={c.warning} strokeDasharray="4 4" />
                <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} content={<ChartTooltip valueFormatter={(v) => fmtPct(v)} />} />
                <Bar dataKey="rate" name="Taxa de desligamento" fill={c.disconnect} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="px-4 pb-3"><Legend items={[{ label: `Atenção ${goals.disconnectWarn}%`, color: c.warning, dashed: true }, { label: `Crítico ${goals.disconnectCrit}%`, color: c.critical, dashed: true }]} /></div>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader title="Comparação entre URAs" subtitle={`Variação vs. ${fmtDate(prevRange.from)}–${fmtDate(prevRange.to)}`} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="th">URA</th><th className="th text-right">Entradas</th><th className="th text-right">Deslig. URA</th><th className="th">Classificação</th><th className="th text-right">Variação</th><th className="th text-right">Abandono fila</th><th className="th" /></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {byUra.map((x) => (
                  <tr key={x.ura.id}>
                    <td className="td font-medium">{x.ura.name}</td>
                    <td className="td text-right tabular-nums">{fmtInt(x.entries)}</td>
                    <td className="td text-right tabular-nums">{fmtInt(x.disc)}</td>
                    <td className="td"><HealthBadge h={healthFor(x.rate, goals.disconnectWarn, goals.disconnectCrit)} label={fmtPct(x.rate)} /></td>
                    <td className="td text-right"><Delta value={x.delta} higherIsBad unit=" p.p." suffix="" /></td>
                    <td className="td text-right tabular-nums text-slate-500">{fmtPct(x.queueRate)}</td>
                    <td className="td"><Link to={`/mapa?ura=${x.ura.id}`} className="btn-ghost p-1.5" title="Abrir mapa"><GitBranch className="h-4 w-4" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      {goalsOpen && <GoalsModal onClose={() => setGoalsOpen(false)} />}
    </div>
  );
}

function Insight({ text }: { text: React.ReactNode }) {
  return <li className="flex gap-2"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /><span>{text}</span></li>;
}

/** Rampa sequencial de um único tom (azul), do claro ao escuro. */
const RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
function heatColor(k: number) {
  const i = Math.max(0, Math.min(RAMP.length - 1, Math.round(k * (RAMP.length - 1))));
  return RAMP[i];
}
