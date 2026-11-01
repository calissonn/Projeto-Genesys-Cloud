import { ArrowRight, Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ChartTooltip } from '../components/ChartTooltip';
import { FilterBar } from '../components/FilterBar';
import { Card, CardHeader, EmptyState, KpiCard, Legend, OccStatusBadge, PageHeader, Segmented, SeverityBadge, type Health } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useChartColors } from '../lib/chartColors';
import { diffDays, fmtDate } from '../lib/dates';
import { fmtCompact, fmtDuration, fmtInt, fmtPct, variation } from '../lib/format';
import { METRIC_META, groupBy, rates, scopeUraIds, sumTotals, totalsByDay, totalsByHour } from '../lib/metrics';

export function healthFor(rate: number, warn: number, crit: number, higherIsBad = true): Health {
  if (!isFinite(rate)) return 'none';
  if (higherIsBad) return rate >= crit ? 'crit' : rate >= warn ? 'warn' : 'ok';
  return rate <= crit ? 'crit' : rate <= warn ? 'warn' : 'ok';
}

export function Dashboard() {
  const { store, uras, departments, filters, range, prevRange, goals, occurrences } = useApp();
  const c = useChartColors();
  const [trendMode, setTrendMode] = useState<'taxas' | 'volume'>('taxas');
  const [cmpMode, setCmpMode] = useState<'volume' | 'pct'>('pct');

  const scope = useMemo(() => scopeUraIds(uras, filters), [uras, filters]);
  const data = useMemo(() => {
    if (!store) return null;
    const cur = store.query(range, scope);
    const prev = store.query(prevRange, scope);
    return { cur, prev, t: sumTotals(cur), p: sumTotals(prev) };
  }, [store, range, prevRange, scope]);

  if (!store || !data) return null;
  const { t, p, cur } = data;
  const r = rates(t);
  const pr = rates(p);
  const days = diffDays(range.from, range.to) + 1;
  const hasData = t.entries > 0;

  // Gráfico por horário (média diária quando o período tem mais de um dia).
  const hourly = totalsByHour(cur).map((h) => ({
    hour: `${String(h.hour).padStart(2, '0')}h`,
    selfService: h.selfService / days,
    transfers: h.transfers / days,
    disconnects: h.disconnects / days,
    other: h.otherExits / days,
  }));

  const daily = totalsByDay(cur, range).map((d) => {
    const rr = rates(d);
    return {
      date: d.date,
      entries: d.entries,
      disconnectRate: d.entries ? rr.disconnectRate : null,
      transferRate: d.entries ? rr.transferRate : null,
      selfServiceRate: d.entries ? rr.selfServiceRate : null,
      selfService: d.selfService, transfers: d.transfers, disconnects: d.disconnects, other: d.otherExits,
    };
  });

  // Comparativo: por departamento, ou por URA quando um departamento está selecionado.
  const byDept = filters.departmentId === 'all' && filters.uraId === 'all';
  const cmpGroups = byDept
    ? groupBy(cur, (x) => uras.find((u) => u.id === x.uraId)?.departmentId ?? '?')
    : groupBy(cur, (x) => x.uraId);
  const cmp = Array.from(cmpGroups.entries()).map(([k, recs]) => {
    const tt = sumTotals(recs);
    const name = byDept ? departments.find((d) => d.id === k)?.short ?? k : uras.find((u) => u.id === k)?.name.replace(/^URA /, '') ?? k;
    const div = cmpMode === 'pct' ? tt.entries / 100 : 1;
    return { name, entries: tt.entries, selfService: tt.selfService / div, transfers: tt.transfers / div, disconnects: tt.disconnects / div, other: tt.otherExits / div };
  }).sort((a, b) => b.entries - a.entries);

  // Rankings por URA (volume mínimo para evitar distorções).
  const minVol = Math.max(50, Math.round(t.entries * 0.005));
  const perUra = Array.from(groupBy(cur, (x) => x.uraId).entries())
    .map(([id, recs]) => ({ ura: uras.find((u) => u.id === id)!, t: sumTotals(recs) }))
    .filter((x) => x.ura && x.t.entries >= minVol)
    .map((x) => ({ ...x, r: rates(x.t) }));
  const worstDisc = [...perUra].sort((a, b) => b.r.disconnectRate - a.r.disconnectRate).slice(0, 5);
  const bestSs = [...perUra].sort((a, b) => b.r.selfServiceRate - a.r.selfServiceRate).slice(0, 5);

  const recentOcc = occurrences
    .filter((o) => (filters.uraId === 'all' || o.uraId === filters.uraId) && (filters.departmentId === 'all' || o.departmentId === filters.departmentId))
    .slice(0, 6);

  const outcomeLegend = [
    { label: 'Autosserviço concluído', color: c.selfService },
    { label: 'Transferência p/ humano', color: c.transfer },
    { label: 'Desligamento na URA', color: c.disconnect },
    { label: 'Outras saídas', color: c.other },
  ];
  const axisProps = { stroke: c.axis, tick: { fill: c.text, fontSize: 11 }, tickLine: false, axisLine: { stroke: c.grid } };
  const atendidas = t.transfers - t.queueAbandons;

  return (
    <div>
      <PageHeader
        title="Dashboard executivo"
        description="Visão consolidada das URAs da Gazin: volume, desligamentos, transferências, autosserviço e falhas, com comparação ao período anterior equivalente."
      />
      <FilterBar />

      {!hasData ? (
        <Card><EmptyState title="Sem dados para os filtros selecionados" text="Ajuste o período ou o escopo. URAs cadastradas manualmente só terão dados após a integração com a Genesys Cloud." /></Card>
      ) : (
        <>
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-900 dark:border-brand-900 dark:bg-brand-950/60 dark:text-brand-100">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <b>Como contamos:</b> <i>entradas</i> somam cada passagem por um fluxo (uma ligação que volta ao fluxo conta de novo);
              <i> conversas únicas</i> descontam reentradas e ligações já contadas em outra URA; <i>atendidas por humano</i> vêm das filas,
              após a transferência. Essas medidas <b>não devem ser somadas entre si</b>.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Entradas nas URAs" value={fmtInt(t.entries)} delta={variation(t.entries, p.entries)}
              info="Total de entradas em fluxos de URA no período. Uma mesma ligação pode gerar mais de uma entrada (ex.: retorno ao fluxo). Em produção: métrica nFlow de Analytics de fluxos." />
            <KpiCard label="Conversas únicas" value={fmtInt(t.uniqueDistinct)} delta={variation(t.uniqueDistinct, p.uniqueDistinct)}
              info="Ligações distintas que passaram por pelo menos uma URA do escopo, descontando reentradas e ligações encaminhadas de outra URA. Em produção: contagem distinta de conversationId (Conversation Details)." />
            <KpiCard label="Desligamentos na URA" value={fmtInt(t.disconnects)} delta={variation(t.disconnects, p.disconnects)} higherIsBad
              info="Ligações encerradas pelo cliente enquanto estava dentro do fluxo (antes de chegar a uma fila). Não inclui abandono na fila humana." />
            <KpiCard label="Taxa de desligamento" value={fmtPct(r.disconnectRate)} delta={r.disconnectRate - pr.disconnectRate} deltaUnit=" p.p." higherIsBad
              accent={healthFor(r.disconnectRate, goals.disconnectWarn, goals.disconnectCrit)}
              info={`Desligamentos ÷ entradas. Meta: atenção a partir de ${goals.disconnectWarn}%, crítico a partir de ${goals.disconnectCrit}% (configurável).`}
              sub={`Meta: < ${goals.disconnectWarn}%`} />
            <KpiCard label="Tempo médio na URA" value={fmtDuration(r.avgDuration)} delta={variation(r.avgDuration, pr.avgDuration)} higherIsBad
              info="Tempo médio de permanência por entrada no fluxo, do início até a saída (transferência, desligamento ou encerramento). Em produção: tFlow." />
            <KpiCard label="Falhas registradas" value={fmtInt(t.failures)} delta={variation(t.failures, p.failures)} higherIsBad
              info="Soma de falhas de identificação por CPF, erros de integração/consulta e transferências malsucedidas. Depende de instrumentação (Milestones/Outcomes) no Architect."
              sub={`${fmtInt(t.authFailures)} CPF · ${fmtInt(t.integrationErrors)} integração · ${fmtInt(t.transferFailures)} transf.`} />
            <KpiCard label="Transferências p/ humano" value={fmtInt(t.transfers)} delta={variation(t.transfers, p.transfers)} higherIsBad
              info="Saídas do fluxo com transferência para fila de atendimento humano (ACD)." />
            <KpiCard label="Taxa de transferência" value={fmtPct(r.transferRate)} delta={r.transferRate - pr.transferRate} deltaUnit=" p.p." higherIsBad
              accent={r.transferRate > goals.transferMax ? 'warn' : undefined}
              info={`Transferências ÷ entradas. Meta máxima configurada: ${goals.transferMax}%.`} sub={`Meta: ≤ ${goals.transferMax}%`} />
            <KpiCard label="Autosserviços concluídos" value={fmtInt(t.selfService)} delta={variation(t.selfService, p.selfService)}
              info="Atendimentos resolvidos na própria URA (ex.: 2ª via, saldo, rastreio). Em produção depende de Flow Outcomes marcados como sucesso." />
            <KpiCard label="Taxa de autosserviço" value={fmtPct(r.selfServiceRate)} delta={r.selfServiceRate - pr.selfServiceRate} deltaUnit=" p.p."
              accent={r.selfServiceRate < goals.selfServiceTarget * 0.8 ? 'warn' : undefined}
              info={`Autosserviços concluídos ÷ entradas. Meta: ${goals.selfServiceTarget}%.`} sub={`Meta: ≥ ${goals.selfServiceTarget}%`} />
            <KpiCard label="Atendidas por humano" value={fmtInt(atendidas)} delta={variation(atendidas, p.transfers - p.queueAbandons)}
              info="Transferências que não foram abandonadas na fila. Fonte em produção: métricas de fila (Conversation Aggregates), não de fluxo — por isso é exibida separadamente."
              sub={`${fmtPct(r.queueAbandonRate)} abandonaram na fila`} />
            <KpiCard label="Taxa de falha de CPF" value={fmtPct(r.authFailureRate)} delta={r.authFailureRate - pr.authFailureRate} deltaUnit=" p.p." higherIsBad
              accent={healthFor(r.authFailureRate, goals.authFailureWarn, goals.authFailureCrit)}
              info="Tentativas de identificação não validadas ÷ tentativas. Só existe para URAs com identificação por CPF e exige Milestones de tentativa/falha no Architect." />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader title="Ligações por horário" subtitle={days > 1 ? `Média diária por hora · ${days} dias` : 'Total por hora'}
                info="Distribuição das entradas por hora, separadas pelo resultado da passagem na URA. Útil para dimensionamento e para identificar horários críticos."
                actions={<Legend items={outcomeLegend} />} />
              <div className="h-72 p-3">
                <ResponsiveContainer>
                  <BarChart data={hourly} barCategoryGap={2}>
                    <CartesianGrid vertical={false} stroke={c.grid} />
                    <XAxis dataKey="hour" {...axisProps} interval={1} />
                    <YAxis {...axisProps} width={48} tickFormatter={(v) => fmtCompact(v)} />
                    <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} content={<ChartTooltip valueFormatter={(v) => fmtInt(v)} />} />
                    <Bar dataKey="selfService" name="Autosserviço" stackId="a" fill={c.selfService} stroke={c.surface} strokeWidth={1} />
                    <Bar dataKey="transfers" name="Transferência" stackId="a" fill={c.transfer} stroke={c.surface} strokeWidth={1} />
                    <Bar dataKey="disconnects" name="Desligamento" stackId="a" fill={c.disconnect} stroke={c.surface} strokeWidth={1} />
                    <Bar dataKey="other" name="Outras saídas" stackId="a" fill={c.other} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader title="Alertas e ocorrências recentes" subtitle="Gerados pelas regras da Central de alertas"
                actions={<Link to="/alertas" className="btn-ghost px-2 py-1 text-xs">Ver todos <ArrowRight className="h-3.5 w-3.5" /></Link>} />
              {recentOcc.length === 0 ? (
                <EmptyState title="Nenhuma ocorrência no escopo" text="As regras ativas não dispararam nos últimos 14 dias." />
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentOcc.map((o) => (
                    <li key={o.id}>
                      <Link to={`/alertas?occ=${encodeURIComponent(o.id)}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <SeverityBadge s={o.severity} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{o.ruleName}</div>
                          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {uras.find((u) => u.id === o.uraId)?.name} · {fmtDate(o.date, true)} · {METRIC_META[o.metric].label}: {METRIC_META[o.metric].unit === '%' ? fmtPct(o.value) : fmtInt(o.value)}
                          </div>
                        </div>
                        <OccStatusBadge s={o.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="mt-5">
            <CardHeader title="Evolução dos indicadores" subtitle={`${fmtDate(range.from)} a ${fmtDate(range.to)}`}
              info="Evolução diária. No modo Taxas, todas as séries estão em % das entradas do dia (mesma escala)."
              actions={
                <>
                  <Legend items={trendMode === 'taxas'
                    ? [{ label: 'Desligamento', color: c.disconnect }, { label: 'Transferência', color: c.transfer }, { label: 'Autosserviço', color: c.selfService }]
                    : outcomeLegend} />
                  <Segmented value={trendMode} onChange={setTrendMode} options={[{ value: 'taxas', label: 'Taxas (%)' }, { value: 'volume', label: 'Volume' }]} />
                </>
              } />
            <div className="h-72 p-3">
              {days < 2 ? (
                <EmptyState title="Selecione um período de 2 dias ou mais" text="A evolução diária precisa de mais de um dia. Para hoje, use o gráfico por horário acima." />
              ) : (
                <ResponsiveContainer>
                  {trendMode === 'taxas' ? (
                    <LineChart data={daily}>
                      <CartesianGrid vertical={false} stroke={c.grid} />
                      <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => fmtDate(d)} minTickGap={24} />
                      <YAxis {...axisProps} width={44} tickFormatter={(v) => `${v}%`} />
                      <Tooltip content={<ChartTooltip labelFormatter={(l) => fmtDate(String(l), true)} valueFormatter={(v) => fmtPct(v)} />} />
                      <Line dataKey="disconnectRate" name="Desligamento" stroke={c.disconnect} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                      <Line dataKey="transferRate" name="Transferência" stroke={c.transfer} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                      <Line dataKey="selfServiceRate" name="Autosserviço" stroke={c.selfService} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  ) : (
                    <BarChart data={daily} barCategoryGap={days > 40 ? 1 : 3}>
                      <CartesianGrid vertical={false} stroke={c.grid} />
                      <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => fmtDate(d)} minTickGap={24} />
                      <YAxis {...axisProps} width={48} tickFormatter={(v) => fmtCompact(v)} />
                      <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} content={<ChartTooltip labelFormatter={(l) => fmtDate(String(l), true)} valueFormatter={(v) => fmtInt(v)} />} />
                      <Bar dataKey="selfService" name="Autosserviço" stackId="a" fill={c.selfService} />
                      <Bar dataKey="transfers" name="Transferência" stackId="a" fill={c.transfer} />
                      <Bar dataKey="disconnects" name="Desligamento" stackId="a" fill={c.disconnect} />
                      <Bar dataKey="other" name="Outras saídas" stackId="a" fill={c.other} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <div className="mt-5 grid gap-5 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader title={byDept ? 'Comparativo por departamento' : 'Comparativo por URA'}
                subtitle={cmpMode === 'pct' ? 'Composição das saídas (% das entradas)' : 'Volume de entradas por resultado'}
                actions={<><Legend items={outcomeLegend} /><Segmented value={cmpMode} onChange={setCmpMode} options={[{ value: 'pct', label: '%' }, { value: 'volume', label: 'Volume' }]} /></>} />
              <div className="p-3" style={{ height: Math.max(220, cmp.length * 40 + 40) }}>
                <ResponsiveContainer>
                  <BarChart data={cmp} layout="vertical" barCategoryGap={8}>
                    <CartesianGrid horizontal={false} stroke={c.grid} />
                    <XAxis type="number" {...axisProps} domain={cmpMode === 'pct' ? [0, 100] : [0, 'auto']} ticks={cmpMode === 'pct' ? [0, 25, 50, 75, 100] : undefined} allowDataOverflow tickFormatter={(v) => (cmpMode === 'pct' ? `${Math.round(v)}%` : fmtCompact(v))} />
                    <YAxis type="category" dataKey="name" {...axisProps} width={150} />
                    <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} content={<ChartTooltip valueFormatter={(v) => (cmpMode === 'pct' ? fmtPct(v) : fmtInt(v))} />} />
                    <Bar dataKey="selfService" name="Autosserviço" stackId="a" fill={c.selfService} />
                    <Bar dataKey="transfers" name="Transferência" stackId="a" fill={c.transfer} />
                    <Bar dataKey="disconnects" name="Desligamento" stackId="a" fill={c.disconnect} />
                    <Bar dataKey="other" name="Outras saídas" stackId="a" fill={c.other} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid gap-5 xl:col-span-2">
              <RankingCard title="URAs com mais desligamentos" info={`Taxa de desligamento por URA. Considera apenas URAs com pelo menos ${fmtInt(minVol)} entradas no período.`}
                rows={worstDisc.map((x) => ({ id: x.ura.id, name: x.ura.name, value: x.r.disconnectRate, sub: `${fmtInt(x.t.disconnects)} de ${fmtInt(x.t.entries)}`, health: healthFor(x.r.disconnectRate, goals.disconnectWarn, goals.disconnectCrit) }))}
                color={c.disconnect} max={Math.max(goals.disconnectCrit * 1.3, ...worstDisc.map((x) => x.r.disconnectRate))} />
              <RankingCard title="Melhores resultados de autosserviço" info="Taxa de autosserviço concluído por URA (maior é melhor)."
                rows={bestSs.map((x) => ({ id: x.ura.id, name: x.ura.name, value: x.r.selfServiceRate, sub: `${fmtInt(x.t.selfService)} de ${fmtInt(x.t.entries)}`, health: healthFor(x.r.selfServiceRate, goals.selfServiceTarget, goals.selfServiceTarget * 0.6, false) }))}
                color={c.selfService} max={100} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RankingCard({ title, info, rows, color, max }: { title: string; info: string; rows: { id: string; name: string; value: number; sub: string; health: Health }[]; color: string; max: number }) {
  return (
    <Card>
      <CardHeader title={title} info={info} />
      {rows.length === 0 ? <EmptyState title="Sem URAs com volume suficiente" /> : (
        <ol className="space-y-2.5 px-4 py-3">
          {rows.map((r, i) => (
            <li key={r.id}>
              <Link to={`/mapa?ura=${r.id}`} className="group block" title="Abrir no mapa da URA">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate"><span className="mr-1.5 text-xs text-slate-400">{i + 1}.</span><span className="group-hover:text-brand-600 group-hover:underline">{r.name}</span></span>
                  <span className="shrink-0 font-semibold tabular-nums">{fmtPct(r.value)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (r.value / max) * 100)}%`, background: color }} />
                  </div>
                  <span className="w-28 shrink-0 text-right text-[11px] text-slate-400">{r.sub}</span>
                  <span className={r.health === 'crit' ? 'text-[11px] font-semibold text-red-600' : r.health === 'warn' ? 'text-[11px] font-semibold text-amber-600' : 'text-[11px] text-emerald-600'}>
                    {r.health === 'crit' ? '● Crítico' : r.health === 'warn' ? '▲ Atenção' : '✓ Meta'}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
