/**
 * Montagem dos relatórios gerenciais a partir dos dados do período/escopo.
 * Conclusões e recomendações são geradas por REGRAS explícitas (não por IA) e
 * redigidas como hipóteses quando apontam causas.
 */
import type { AlertOccurrence, Department, Goals, Totals, Ura, UraChange } from '../data/types';
import { FAILURE_METRICS } from './alertEngine';
import { addDays, diffDays, fmtDate, fmtDateLong, todayISO } from './dates';
import type { ReportDoc, ReportSection } from './exporters';
import { fmtDuration, fmtInt, fmtPct } from './format';
import { METRIC_META, groupBy, metricValue, rates, sumTotals, type Range, type RecordStore } from './metrics';
import { computeUraFlows, disconnectsByOption, disconnectsByStep, twoProportionPValue } from './stepAnalytics';

export type ReportId =
  | 'desempenho' | 'desl-departamento' | 'desl-etapa' | 'transferencias' | 'autosservico'
  | 'falhas' | 'alteracoes' | 'comparativo' | 'alertas' | 'executivo';

export const REPORTS: { id: ReportId; title: string; description: string }[] = [
  { id: 'executivo', title: 'Relatório executivo', description: 'Visão consolidada com destaques, análise automática e recomendações.' },
  { id: 'desempenho', title: 'Desempenho geral das URAs', description: 'Indicadores principais de cada URA no período.' },
  { id: 'desl-departamento', title: 'Desligamentos por departamento', description: 'Taxas e volumes por departamento, com classificação por meta.' },
  { id: 'desl-etapa', title: 'Desligamentos por etapa', description: 'Pontos de saída da jornada dentro das URAs.' },
  { id: 'transferencias', title: 'Transferências por destino', description: 'Volume transferido por fila de destino e abandono após a transferência.' },
  { id: 'autosservico', title: 'Conclusão de autosserviços', description: 'Serviços automáticos iniciados, concluídos e taxa de conclusão.' },
  { id: 'falhas', title: 'Falhas operacionais', description: 'Falhas por tipo e por URA, com ocorrências.' },
  { id: 'alteracoes', title: 'Análise de alterações nos fluxos', description: 'Alterações publicadas e impacto observado antes × depois.' },
  { id: 'comparativo', title: 'Comparativo entre períodos', description: 'Período selecionado × período anterior equivalente, com significância.' },
  { id: 'alertas', title: 'Histórico de alertas', description: 'Ocorrências geradas por regras e pela detecção automática.' },
];

export interface ReportCtx {
  store: RecordStore;
  uras: Ura[];
  departments: Department[];
  range: Range;
  prevRange: Range;
  scope: Set<string> | null;
  scopeLabel: string;
  goals: Goals;
  occurrences: AlertOccurrence[];
  changes: UraChange[];
  simulated: boolean;
}

const pct = (v: number) => fmtPct(v);
const classify = (rate: number, warn: number, crit: number) => (rate >= crit ? 'Crítico' : rate >= warn ? 'Atenção' : 'Dentro da meta');

function base(ctx: ReportCtx, title: string): ReportDoc {
  return {
    title, scope: ctx.scopeLabel,
    period: ctx.range.from === ctx.range.to ? fmtDateLong(ctx.range.from) : `${fmtDateLong(ctx.range.from)} a ${fmtDateLong(ctx.range.to)}`,
    generatedAt: new Date().toLocaleString('pt-BR'), simulated: ctx.simulated, kpis: [], sections: [], conclusions: [], recommendations: [],
  };
}

function kpis(t: Totals, p: Totals) {
  const r = rates(t);
  const pr = rates(p);
  const dpp = (a: number, b: number) => `${a - b >= 0 ? '+' : ''}${(a - b).toFixed(1).replace('.', ',')} p.p. vs. anterior`;
  const dpc = (a: number, b: number) => (b ? `${a >= b ? '+' : ''}${(((a - b) / b) * 100).toFixed(1).replace('.', ',')}% vs. anterior` : '');
  return [
    { label: 'Entradas nas URAs', value: fmtInt(t.entries), note: dpc(t.entries, p.entries) },
    { label: 'Conversas únicas', value: fmtInt(t.uniqueDistinct), note: dpc(t.uniqueDistinct, p.uniqueDistinct) },
    { label: 'Desligamentos na URA', value: fmtInt(t.disconnects), note: dpc(t.disconnects, p.disconnects) },
    { label: 'Taxa de desligamento', value: pct(r.disconnectRate), note: dpp(r.disconnectRate, pr.disconnectRate) },
    { label: 'Transferências para humano', value: fmtInt(t.transfers), note: dpc(t.transfers, p.transfers) },
    { label: 'Taxa de transferência', value: pct(r.transferRate), note: dpp(r.transferRate, pr.transferRate) },
    { label: 'Autosserviços concluídos', value: fmtInt(t.selfService), note: dpc(t.selfService, p.selfService) },
    { label: 'Taxa de autosserviço', value: pct(r.selfServiceRate), note: dpp(r.selfServiceRate, pr.selfServiceRate) },
    { label: 'Tempo médio na URA', value: fmtDuration(r.avgDuration), note: '' },
    { label: 'Falhas registradas', value: fmtInt(t.failures), note: dpc(t.failures, p.failures) },
    { label: 'Abandono na fila (após URA)', value: pct(r.queueAbandonRate), note: 'das transferências' },
  ];
}

function perUra(ctx: ReportCtx, range: Range) {
  const g = groupBy(ctx.store.query(range, ctx.scope), (x) => x.uraId);
  return Array.from(g.entries()).map(([id, recs]) => ({ ura: ctx.uras.find((u) => u.id === id)!, t: sumTotals(recs) })).filter((x) => x.ura);
}

export function buildReport(id: ReportId, ctx: ReportCtx): ReportDoc {
  const cur = ctx.store.query(ctx.range, ctx.scope);
  const t = sumTotals(cur);
  const p = sumTotals(ctx.store.query(ctx.prevRange, ctx.scope));
  const r = rates(t);
  const pr = rates(p);
  const title = REPORTS.find((x) => x.id === id)!.title;
  const doc = base(ctx, title);
  if (!t.entries) {
    doc.conclusions.push('Não há dados para o período e escopo selecionados.');
    return doc;
  }
  const uraRows = perUra(ctx, ctx.range);
  const prevUra = new Map(perUra(ctx, ctx.prevRange).map((x) => [x.ura.id, x.t]));
  const flows = () => computeUraFlows(ctx.store, ctx.uras, ctx.range, ctx.scope);

  switch (id) {
    case 'desempenho': {
      doc.kpis = kpis(t, p);
      const rows = uraRows.sort((a, b) => b.t.entries - a.t.entries);
      doc.sections.push({
        title: 'Indicadores por URA',
        chart: { labels: rows.map((x) => x.ura.name.replace(/^URA /, '')), values: rows.map((x) => rates(x.t).selfServiceRate), unit: '%', title: 'Taxa de autosserviço' },
        table: {
          columns: ['URA', 'Entradas', 'Desligamento', 'Transferência', 'Autosserviço', 'Tempo médio', 'Falhas', 'Classificação'],
          numeric: [1, 2, 3, 4, 5, 6],
          rows: rows.map((x) => { const rr = rates(x.t); return [x.ura.name, fmtInt(x.t.entries), pct(rr.disconnectRate), pct(rr.transferRate), pct(rr.selfServiceRate), fmtDuration(rr.avgDuration), fmtInt(x.t.failures), classify(rr.disconnectRate, ctx.goals.disconnectWarn, ctx.goals.disconnectCrit)]; }),
        },
      });
      const best = [...rows].sort((a, b) => rates(b.t).selfServiceRate - rates(a.t).selfServiceRate)[0];
      const worst = [...rows].sort((a, b) => rates(b.t).disconnectRate - rates(a.t).disconnectRate)[0];
      doc.conclusions.push(`Taxa de desligamento consolidada de ${pct(r.disconnectRate)} (${r.disconnectRate >= pr.disconnectRate ? 'alta' : 'queda'} de ${Math.abs(r.disconnectRate - pr.disconnectRate).toFixed(1).replace('.', ',')} p.p. em relação ao período anterior).`);
      if (best) doc.conclusions.push(`Melhor autosserviço: ${best.ura.name} (${pct(rates(best.t).selfServiceRate)}).`);
      if (worst) doc.conclusions.push(`Maior desligamento: ${worst.ura.name} (${pct(rates(worst.t).disconnectRate)}) — ${classify(rates(worst.t).disconnectRate, ctx.goals.disconnectWarn, ctx.goals.disconnectCrit).toLowerCase()}.`);
      if (worst && rates(worst.t).disconnectRate >= ctx.goals.disconnectWarn) doc.recommendations.push(`Analisar o mapa da ${worst.ura.name} para localizar a etapa com mais saídas e revisar mensagens/tempos dessa etapa.`);
      break;
    }
    case 'desl-departamento': {
      doc.kpis = kpis(t, p).filter((k) => /Deslig|Entradas|Abandono/.test(k.label));
      const g = groupBy(cur, (x) => ctx.uras.find((u) => u.id === x.uraId)?.departmentId ?? '?');
      const pg = groupBy(ctx.store.query(ctx.prevRange, ctx.scope), (x) => ctx.uras.find((u) => u.id === x.uraId)?.departmentId ?? '?');
      const rows = Array.from(g.entries()).map(([d, recs]) => {
        const tt = sumTotals(recs); const pt = sumTotals(pg.get(d) ?? []);
        return { name: ctx.departments.find((x) => x.id === d)?.name ?? d, tt, rate: rates(tt).disconnectRate, prate: pt.entries ? rates(pt).disconnectRate : null };
      }).sort((a, b) => b.rate - a.rate);
      doc.sections.push({
        title: 'Desligamentos por departamento',
        chart: { labels: rows.map((x) => x.name), values: rows.map((x) => x.rate), unit: '%' },
        table: { columns: ['Departamento', 'Entradas', 'Desligamentos', 'Taxa', 'Variação (p.p.)', 'Abandono na fila', 'Classificação'], numeric: [1, 2, 3, 4, 5],
          rows: rows.map((x) => [x.name, fmtInt(x.tt.entries), fmtInt(x.tt.disconnects), pct(x.rate), x.prate == null ? '—' : (x.rate - x.prate).toFixed(1).replace('.', ','), pct(rates(x.tt).queueAbandonRate), classify(x.rate, ctx.goals.disconnectWarn, ctx.goals.disconnectCrit)]) },
      });
      const crit = rows.filter((x) => x.rate >= ctx.goals.disconnectCrit);
      doc.conclusions.push(crit.length ? `${crit.length} departamento(s) acima da meta crítica (${ctx.goals.disconnectCrit}%): ${crit.map((x) => x.name).join(', ')}.` : `Nenhum departamento acima da meta crítica de ${ctx.goals.disconnectCrit}%.`);
      doc.conclusions.push('Desligamentos na URA e abandonos na fila são apresentados separadamente: o primeiro ocorre dentro do fluxo, o segundo após a transferência.');
      if (crit.length) doc.recommendations.push(`Priorizar a análise por etapa de ${crit[0].name} na tela Análise de desligamentos.`);
      break;
    }
    case 'desl-etapa': {
      const steps = disconnectsByStep(flows()).filter((s) => s.disconnects >= 0.5);
      doc.kpis = [{ label: 'Desligamentos na URA', value: fmtInt(t.disconnects) }, { label: 'Taxa de desligamento', value: pct(r.disconnectRate) }, { label: 'Principal ponto de saída', value: steps.find((s) => !s.expected)?.category ?? '—' }];
      doc.sections.push({
        title: 'Desligamentos por etapa', text: ['Etapas equivalentes de URAs diferentes foram somadas. Em produção, cada etapa depende de um Flow Milestone configurado no Architect.'],
        chart: { labels: steps.map((s) => s.category), values: steps.map((s) => s.disconnects), unit: 'n' },
        table: { columns: ['Etapa', 'Chegaram', 'Desligamentos', '% do total', 'Taxa na etapa', 'Classificação'], numeric: [1, 2, 3, 4],
          rows: steps.map((s) => [s.category, fmtInt(s.visits), fmtInt(s.disconnects), pct((s.disconnects / t.disconnects) * 100), pct(s.rate), s.expected ? 'Esperado (encerramento)' : classify(s.rate, ctx.goals.stepDisconnectWarn, ctx.goals.stepDisconnectCrit)]) },
      });
      const top = steps.slice(0, 3);
      doc.conclusions.push(`As três etapas com mais saídas concentram ${pct((top.reduce((a, s) => a + s.disconnects, 0) / t.disconnects) * 100)} dos desligamentos: ${top.map((s) => s.category).join(', ')}.`);
      const crit = steps.filter((s) => !s.expected && s.rate >= ctx.goals.stepDisconnectCrit);
      if (crit.length) doc.recommendations.push(`Revisar as etapas críticas (${crit.map((s) => s.category).join(', ')}): clareza das mensagens, tempo de espera e número de tentativas.`);
      doc.recommendations.push('Garantir Flow Milestones em todas as etapas para que esta análise use dados reais em produção.');
      break;
    }
    case 'transferencias': {
      const fl = flows();
      const m = new Map<string, { queue: string; ura: Set<string>; n: number }>();
      for (const f of fl) for (const n of f.model.nodes) if (n.kind === 'transfer' && n.queue) {
        const st = f.result.nodes[n.id];
        const e = m.get(n.queue) ?? { queue: n.queue, ura: new Set<string>(), n: 0 };
        e.n += st.terminalCount; e.ura.add(f.ura.name); m.set(n.queue, e);
      }
      const rows = Array.from(m.values()).sort((a, b) => b.n - a.n);
      const total = rows.reduce((a, x) => a + x.n, 0);
      doc.kpis = [
        { label: 'Transferências para humano', value: fmtInt(t.transfers) }, { label: 'Taxa de transferência', value: pct(r.transferRate), note: `meta ≤ ${ctx.goals.transferMax}%` },
        { label: 'Abandono na fila', value: pct(r.queueAbandonRate), note: 'após a transferência' }, { label: 'Transferências malsucedidas', value: fmtInt(t.transferFailures) },
      ];
      doc.sections.push({
        title: 'Transferências por fila de destino', text: ['Em produção: métrica tFlowExit agrupada por transferType e transferTargetName (nativo).'],
        chart: { labels: rows.map((x) => x.queue), values: rows.map((x) => x.n), unit: 'n' },
        table: { columns: ['Fila de destino', 'Transferências', '% do total', 'URAs de origem'], numeric: [1, 2], rows: rows.map((x) => [x.queue, fmtInt(x.n), pct((x.n / total) * 100), Array.from(x.ura).join(', ')]) },
      });
      if (rows[0]) doc.conclusions.push(`${rows[0].queue} recebe ${pct((rows[0].n / total) * 100)} das transferências.`);
      if (r.transferRate > ctx.goals.transferMax) doc.recommendations.push(`A taxa de transferência (${pct(r.transferRate)}) está acima da meta de ${ctx.goals.transferMax}%: avaliar quais motivos das filas mais acionadas podem ser resolvidos por autosserviço.`);
      break;
    }
    case 'autosservico': {
      const opts = disconnectsByOption(flows()).filter((o) => o.kind === 'self');
      const fl = flows();
      const rows = opts.map((o) => {
        const f = fl.find((x) => x.ura.id === o.uraId)!;
        const concl = f.result.nodes[`ss_${o.key}`].edgeFlows.find((e) => e.to === 'ss_concluido')?.value ?? 0;
        return { ...o, concl, rate: o.chosen ? (concl / o.chosen) * 100 : 0 };
      }).sort((a, b) => b.chosen - a.chosen);
      doc.kpis = [{ label: 'Autosserviços concluídos', value: fmtInt(t.selfService) }, { label: 'Taxa de autosserviço', value: pct(r.selfServiceRate), note: `meta ≥ ${ctx.goals.selfServiceTarget}%` }, { label: 'Falhas de consulta (API)', value: fmtInt(t.apiErrors) }];
      doc.sections.push({
        title: 'Conclusão por serviço automático', text: ['Em produção: Flow Outcomes por serviço (nFlowOutcome / nFlowOutcomeFailed).'],
        chart: { labels: rows.map((x) => `${x.label} (${x.uraName.replace(/^URA /, '')})`), values: rows.map((x) => x.rate), unit: '%' },
        table: { columns: ['Serviço', 'URA', 'Iniciados', 'Concluídos', 'Taxa de conclusão', 'Desligaram durante'], numeric: [2, 3, 4, 5], rows: rows.map((x) => [x.label, x.uraName, fmtInt(x.chosen), fmtInt(x.concl), pct(x.rate), fmtInt(x.disconnects)]) },
      });
      const low = rows.filter((x) => x.rate < 60 && x.chosen > 50);
      doc.conclusions.push(`Taxa de autosserviço consolidada: ${pct(r.selfServiceRate)} (${r.selfServiceRate >= ctx.goals.selfServiceTarget ? 'dentro' : 'abaixo'} da meta de ${ctx.goals.selfServiceTarget}%).`);
      if (low.length) doc.recommendations.push(`Serviços com conclusão abaixo de 60%: ${low.slice(0, 4).map((x) => `${x.label} (${x.uraName.replace(/^URA /, '')})`).join('; ')}. Verificar mensagens de resultado, falhas de consulta e casos que exigem atendente.`);
      break;
    }
    case 'falhas': {
      doc.kpis = FAILURE_METRICS.map((f) => ({ label: f.label, value: METRIC_META[f.metric].unit === '%' ? pct(metricValue(t, f.metric)) : fmtInt(metricValue(t, f.metric)), note: METRIC_META[f.metric].unit === '%' ? `anterior ${pct(metricValue(p, f.metric))}` : `anterior ${fmtInt(metricValue(p, f.metric))}` }));
      const rows = uraRows.sort((a, b) => b.t.failures - a.t.failures);
      doc.sections.push({
        title: 'Falhas por URA', chart: { labels: rows.map((x) => x.ura.name.replace(/^URA /, '')), values: rows.map((x) => x.t.failures), unit: 'n' },
        table: { columns: ['URA', 'Falhas CPF', 'Excedidas', 'Integração', 'API', 'Transferência', 'Fluxo', 'Opção inválida'], numeric: [1, 2, 3, 4, 5, 6, 7],
          rows: rows.map((x) => [x.ura.name, fmtInt(x.t.authFailures), fmtInt(x.t.cpfExceeded), fmtInt(x.t.integrationErrors), fmtInt(x.t.apiErrors), fmtInt(x.t.transferFailures), fmtInt(x.t.flowErrors), fmtInt(x.t.invalidOptions)]) },
      });
      const occ = ctx.occurrences.filter((o) => FAILURE_METRICS.some((f) => f.metric === o.metric) && (!ctx.scope || ctx.scope.has(o.uraId)));
      doc.sections.push({ title: 'Ocorrências de falha (últimos 14 dias)', table: { columns: ['Data', 'Tipo', 'URA', 'Valor', 'Criticidade', 'Status', 'Responsável'], rows: occ.map((o) => [fmtDate(o.date), FAILURE_METRICS.find((f) => f.metric === o.metric)!.label, ctx.uras.find((u) => u.id === o.uraId)?.name ?? o.uraId, METRIC_META[o.metric].unit === '%' ? pct(o.value) : fmtInt(o.value), o.severity, o.status, o.owner]) } });
      const open = occ.filter((o) => o.status === 'aberta' || o.status === 'em_analise');
      doc.conclusions.push(`${open.length} ocorrência(s) de falha em aberto ou em análise.`);
      const top = rows[0];
      if (top) doc.conclusions.push(`URA com mais falhas no período: ${top.ura.name} (${fmtInt(top.t.failures)}).`);
      if (open.length) doc.recommendations.push(`Tratar primeiro as ocorrências críticas: ${open.filter((o) => o.severity === 'critica').slice(0, 3).map((o) => `${ctx.uras.find((u) => u.id === o.uraId)?.name} (${fmtDate(o.date)})`).join('; ') || 'nenhuma crítica em aberto'}.`);
      break;
    }
    case 'alteracoes': {
      const list = ctx.changes.filter((c) => c.date >= addDays(ctx.range.from, -7) && c.date <= ctx.range.to && (!ctx.scope || ctx.scope.has(c.uraId)));
      const rows = list.map((c) => {
        const ids = new Set([c.uraId]);
        const to = addDays(c.date, 7) > todayISO() ? todayISO() : addDays(c.date, 7);
        const b = sumTotals(ctx.store.query({ from: addDays(c.date, -7), to: addDays(c.date, -1) }, ids));
        const a = sumTotals(ctx.store.query({ from: addDays(c.date, 1), to }, ids));
        const ok = b.entries > 0 && a.entries > 0 && to > c.date;
        const pD = ok ? twoProportionPValue(a.disconnects, a.entries, b.disconnects, b.entries) : null;
        return { c, ok, b: rates(b), a: rates(a), sig: pD != null && pD < 0.05 };
      });
      doc.kpis = [{ label: 'Alterações no período', value: String(list.length) }, { label: 'Com mudança significativa no desligamento', value: String(rows.filter((x) => x.sig).length) }];
      doc.sections.push({
        title: 'Alterações e impacto (7 dias antes × até 7 dias depois)',
        table: { columns: ['Data', 'URA', 'Versão', 'Descrição', 'Desligamento antes', 'Depois', 'Autosserviço antes', 'Depois', 'Mudança significativa?'], numeric: [4, 5, 6, 7],
          rows: rows.map((x) => [fmtDate(x.c.date), ctx.uras.find((u) => u.id === x.c.uraId)?.name ?? x.c.uraId, x.c.version, x.c.description, x.ok ? pct(x.b.disconnectRate) : '—', x.ok ? pct(x.a.disconnectRate) : '—', x.ok ? pct(x.b.selfServiceRate) : '—', x.ok ? pct(x.a.selfServiceRate) : '—', x.ok ? (x.sig ? 'Sim' : 'Não') : 'Dados insuficientes']) },
      });
      rows.filter((x) => x.sig).forEach((x) => {
        const worse = x.a.disconnectRate > x.b.disconnectRate;
        doc.conclusions.push(`${ctx.uras.find((u) => u.id === x.c.uraId)?.name} ${x.c.version} (${fmtDate(x.c.date)}): desligamento ${pct(x.b.disconnectRate)} → ${pct(x.a.disconnectRate)} (${worse ? 'piora' : 'melhora'} significativa).`);
        if (worse) doc.recommendations.push(`Investigar a alteração "${x.c.description}" — a coincidência temporal é uma hipótese, a confirmar com testes e dados por etapa.`);
      });
      if (!rows.some((x) => x.sig)) doc.conclusions.push('Nenhuma alteração do período apresentou mudança estatisticamente significativa na taxa de desligamento.');
      break;
    }
    case 'comparativo': {
      const daysA = diffDays(ctx.range.from, ctx.range.to) + 1;
      const items: [string, number, number, number, number][] = [
        ['Taxa de desligamento', r.disconnectRate, pr.disconnectRate, t.disconnects, p.disconnects],
        ['Taxa de transferência', r.transferRate, pr.transferRate, t.transfers, p.transfers],
        ['Taxa de autosserviço', r.selfServiceRate, pr.selfServiceRate, t.selfService, p.selfService],
      ];
      doc.kpis = [{ label: 'Período atual', value: doc.period }, { label: 'Período anterior', value: `${fmtDateLong(ctx.prevRange.from)} a ${fmtDateLong(ctx.prevRange.to)}` }, { label: 'Duração', value: `${daysA} dia(s)` }];
      const rows = items.map(([l, a, b, xa, xb]) => { const pv = twoProportionPValue(xa, t.entries, xb, p.entries); return { l, a, b, pv }; });
      doc.sections.push({
        title: 'Indicadores: atual × anterior',
        table: { columns: ['Indicador', 'Anterior', 'Atual', 'Variação', 'Significativo (p<0,05)?'], numeric: [1, 2, 3],
          rows: [
            ['Entradas', fmtInt(p.entries), fmtInt(t.entries), p.entries ? pct(((t.entries - p.entries) / p.entries) * 100) : '—', '—'],
            ...rows.map((x) => [x.l, pct(x.b), pct(x.a), `${(x.a - x.b).toFixed(1).replace('.', ',')} p.p.`, x.pv == null ? '—' : x.pv < 0.05 ? 'Sim' : 'Não']),
            ['Tempo médio', fmtDuration(pr.avgDuration), fmtDuration(r.avgDuration), pr.avgDuration ? pct(((r.avgDuration - pr.avgDuration) / pr.avgDuration) * 100) : '—', '—'],
            ['Falhas', fmtInt(p.failures), fmtInt(t.failures), p.failures ? pct(((t.failures - p.failures) / p.failures) * 100) : '—', '—'],
          ] },
      });
      const sig = rows.filter((x) => x.pv != null && x.pv < 0.05);
      doc.conclusions.push(sig.length ? `Mudanças significativas: ${sig.map((x) => `${x.l} (${pct(x.b)} → ${pct(x.a)})`).join('; ')}.` : 'Nenhuma mudança estatisticamente significativa nas taxas principais.');
      break;
    }
    case 'alertas': {
      const occ = ctx.occurrences.filter((o) => (!ctx.scope || ctx.scope.has(o.uraId)));
      const bySev = (s: string) => occ.filter((o) => o.severity === s).length;
      doc.kpis = [{ label: 'Ocorrências (14 dias)', value: String(occ.length) }, { label: 'Críticas', value: String(bySev('critica')) }, { label: 'Altas', value: String(bySev('alta')) }, { label: 'Em aberto', value: String(occ.filter((o) => o.status === 'aberta').length) }, { label: 'Descartadas (falso positivo)', value: String(occ.filter((o) => o.status === 'descartada').length) }];
      const byRule = new Map<string, number>();
      occ.forEach((o) => byRule.set(o.ruleName, (byRule.get(o.ruleName) ?? 0) + 1));
      const ruleRows = Array.from(byRule.entries()).sort((a, b) => b[1] - a[1]);
      doc.sections.push({ title: 'Ocorrências por regra', chart: { labels: ruleRows.map(([k]) => k), values: ruleRows.map(([, v]) => v), unit: 'n' } });
      doc.sections.push({ title: 'Ocorrências', table: { columns: ['Data', 'Regra / detecção', 'URA', 'Indicador', 'Valor', 'Criticidade', 'Status', 'Responsável'], rows: occ.map((o) => [fmtDate(o.date), o.ruleName, ctx.uras.find((u) => u.id === o.uraId)?.name ?? o.uraId, METRIC_META[o.metric].label, METRIC_META[o.metric].unit === '%' ? pct(o.value) : fmtInt(o.value), o.severity, o.status, o.owner]) } });
      doc.conclusions.push('O histórico de alertas cobre os últimos 14 dias de avaliação (independente do período do filtro).');
      const disc = occ.filter((o) => o.status === 'descartada').length;
      if (occ.length && disc / occ.length > 0.3) doc.recommendations.push('Mais de 30% das ocorrências foram descartadas como falso positivo: revisar limites e volume mínimo das regras.');
      break;
    }
    case 'executivo': {
      doc.kpis = kpis(t, p);
      const rows = uraRows.map((x) => ({ ...x, r: rates(x.t), pt: prevUra.get(x.ura.id) }));
      const rising = rows.filter((x) => x.pt && x.pt.entries).map((x) => ({ ...x, d: x.r.disconnectRate - rates(x.pt!).disconnectRate, pv: twoProportionPValue(x.t.disconnects, x.t.entries, x.pt!.disconnects, x.pt!.entries) })).filter((x) => x.pv != null && x.pv < 0.05 && x.d > 0.5).sort((a, b) => b.d - a.d);
      const steps = disconnectsByStep(flows()).filter((s) => s.disconnects >= 0.5);
      const openCrit = ctx.occurrences.filter((o) => (!ctx.scope || ctx.scope.has(o.uraId)) && (o.status === 'aberta' || o.status === 'em_analise') && (o.severity === 'critica' || o.severity === 'alta'));
      const sections: ReportSection[] = [
        { title: 'Desligamento por URA', chart: { labels: rows.sort((a, b) => b.r.disconnectRate - a.r.disconnectRate).map((x) => x.ura.name.replace(/^URA /, '')), values: rows.map((x) => x.r.disconnectRate), unit: '%' } },
        { title: 'Principais pontos de saída', table: { columns: ['Etapa', 'Desligamentos', 'Taxa na etapa'], numeric: [1, 2], rows: steps.slice(0, 6).map((s) => [s.category, fmtInt(s.disconnects), pct(s.rate)]) } },
        { title: 'Ocorrências de alta criticidade em aberto', table: { columns: ['Data', 'Ocorrência', 'URA', 'Responsável'], rows: openCrit.slice(0, 10).map((o) => [fmtDate(o.date), o.ruleName, ctx.uras.find((u) => u.id === o.uraId)?.name ?? o.uraId, o.owner]) } },
      ];
      doc.sections = sections;
      doc.conclusions.push(`No período, as URAs receberam ${fmtInt(t.entries)} entradas (${fmtInt(t.uniqueDistinct)} conversas únicas). ${pct(r.selfServiceRate)} foram resolvidas por autosserviço, ${pct(r.transferRate)} transferidas e ${pct(r.disconnectRate)} desligaram dentro da URA.`);
      if (rising.length) doc.conclusions.push(`Aumento estatisticamente significativo de desligamentos em: ${rising.slice(0, 3).map((x) => `${x.ura.name} (+${x.d.toFixed(1).replace('.', ',')} p.p.)`).join('; ')}.`);
      const mainExit = steps.find((s) => !s.expected);
      if (mainExit) doc.conclusions.push(`Principal ponto de saída: ${mainExit.category} (${pct((mainExit.disconnects / t.disconnects) * 100)} dos desligamentos).`);
      doc.conclusions.push(`${openCrit.length} ocorrência(s) de criticidade alta/crítica em aberto.`);
      rising.slice(0, 2).forEach((x) => {
        const recent = diffDays(x.ura.lastChange, ctx.range.to) <= 21 && x.ura.lastChange >= addDays(ctx.range.from, -7);
        doc.recommendations.push(`${x.ura.name}: investigar a alta de desligamentos${recent ? `; hipótese a validar — alteração recente (${fmtDate(x.ura.lastChange)}: “${x.ura.lastChangeNote}”)` : ''}. Validação: comparar antes × depois na tela de Comparação e repetir testes funcionais.`);
      });
      if (r.selfServiceRate < ctx.goals.selfServiceTarget) doc.recommendations.push(`Autosserviço abaixo da meta (${pct(r.selfServiceRate)} vs ${ctx.goals.selfServiceTarget}%): revisar serviços com baixa conclusão (relatório de Conclusão de autosserviços).`);
      doc.recommendations.push('Análise gerada por regras automáticas; hipóteses de causa devem ser confirmadas. A análise por IA está prevista para a Etapa 4.');
      break;
    }
  }
  return doc;
}
