/**
 * Motor de Inteligência CX — análises por ESTATÍSTICA e REGRAS EXPLÍCITAS (sem IA generativa).
 *
 * Cada análise traz: problema, dados utilizados, evidências, possíveis causas (sempre como
 * HIPÓTESES), grau de confiança (com justificativa), recomendação, impacto esperado e forma de
 * validar. A IA generativa (opcional, no backend) apenas REDIGE o resumo a partir destes
 * resultados agregados — ela não calcula nem inventa números.
 */
import type { AlertOccurrence, Department, Goals, MetricKey, TestCase, Totals, Ura, UraChange } from '../data/types';
import { FAILURE_METRICS } from './alertEngine';
import { addDays, diffDays, fmtDate } from './dates';
import { fmtInt, fmtPct } from './format';
import { METRIC_META, rates, sumTotals, totalsByDay, type Range, type RecordStore } from './metrics';
import { computeUraFlows, disconnectsByOption, disconnectsByStep, twoProportionPValue } from './stepAnalytics';

export type InsightKind = 'alteracao' | 'tendencia' | 'anomalia' | 'etapa' | 'oportunidade' | 'meta' | 'melhoria';
export type Severity = 'critica' | 'alta' | 'media' | 'baixa';
export type Confidence = 'alta' | 'media' | 'baixa';

export interface Insight {
  id: string;
  kind: InsightKind;
  title: string;
  uraIds: string[];
  departmentIds: string[];
  severity: Severity;
  confidence: Confidence;
  confidenceReason: string;
  /** Ligações por semana afetadas (estimativa) — base da priorização. */
  affectedPerWeek: number;
  priority: number;
  problem: string;
  dataUsed: string[];
  evidence: { label: string; value: string }[];
  causes: string[];
  recommendation: string[];
  expectedImpact: string;
  validation: string[];
  /** Série diária para o mini gráfico (opcional). */
  series?: { date: string; value: number | null }[];
  seriesLabel?: string;
  seriesUnit?: '%' | 'n';
  markerDate?: string;
  links: { label: string; to: string }[];
  /** Observação sobre a origem dos dados (ex.: modelo simulado por etapa). */
  dataNote?: string;
}

export interface InsightResult {
  generatedAt: string;
  window: Range;
  insights: Insight[];
  positives: Insight[];
  summary: { headline: string; paragraphs: string[] };
}

export interface InsightContext {
  store: RecordStore;
  uras: Ura[];
  departments: Department[];
  scope: Set<string> | null;
  goals: Goals;
  changes: UraChange[];
  occurrences: AlertOccurrence[];
  tests: TestCase[];
  windowDays: number;
  endDate: string;
  /** true quando os dados são simulados (o texto deixa isso explícito). */
  simulated: boolean;
}

const SEV_W: Record<Severity, number> = { critica: 4, alta: 3, media: 2, baixa: 1 };
const CONF_W: Record<Confidence, number> = { alta: 1, media: 0.7, baixa: 0.4 };
/** Primeira letra minúscula, preservando siglas (CPF, API). */
const lc = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const pp = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')} p.p.`;
const pval = (p: number | null) => (p == null ? 'n/d' : p < 0.001 ? '< 0,001' : p.toFixed(3).replace('.', ','));

/** Indicadores analisados em taxa: [chave, numerador, denominador, maior é pior]. */
const RATE_METRICS: { key: MetricKey; label: string; num: (t: Totals) => number; den: (t: Totals) => number; higherIsBad: boolean; cpfOnly?: boolean }[] = [
  { key: 'disconnectRate', label: 'Taxa de desligamento', num: (t) => t.disconnects, den: (t) => t.entries, higherIsBad: true },
  { key: 'selfServiceRate', label: 'Taxa de autosserviço', num: (t) => t.selfService, den: (t) => t.entries, higherIsBad: false },
  { key: 'transferRate', label: 'Taxa de transferência', num: (t) => t.transfers, den: (t) => t.entries, higherIsBad: true },
  { key: 'authFailureRate', label: 'Falha de identificação (CPF)', num: (t) => t.authFailures, den: (t) => t.authAttempts, higherIsBad: true, cpfOnly: true },
  { key: 'integrationErrors', label: 'Erros de integração (por mil entradas)', num: (t) => t.integrationErrors, den: (t) => t.entries, higherIsBad: true },
  { key: 'apiErrors', label: 'Falhas de API (por mil entradas)', num: (t) => t.apiErrors, den: (t) => t.entries, higherIsBad: true },
];
const isPerMille = (k: MetricKey) => k === 'integrationErrors' || k === 'apiErrors';
const rateOf = (m: (typeof RATE_METRICS)[number], t: Totals) => (m.den(t) ? (m.num(t) / m.den(t)) * (isPerMille(m.key) ? 1000 : 100) : 0);
const fmtRate = (k: MetricKey, v: number) => (isPerMille(k) ? `${v.toFixed(1).replace('.', ',')}‰` : fmtPct(v));
const fmtDelta = (k: MetricKey, v: number) => (isPerMille(k) ? `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}‰` : pp(v));

/** Causas e recomendações por tipo de alteração × indicador (base de conhecimento explícita). */
function changePlaybook(type: UraChange['type'], metric: MetricKey): { causes: string[]; recs: string[] } {
  if (metric === 'authFailureRate' || type === 'identificacao') {
    return {
      causes: [
        'Tempo de coleta de dígitos (timeout entre dígitos ou total) curto demais para os 11 dígitos do CPF.',
        'Mudança na mensagem ou nas regras de entrada (ex.: aceitar/recusar tecla # ao final).',
        'Lentidão ou erro na consulta de autenticação, tratada como CPF inválido.',
      ],
      recs: [
        'Verificar o tempo de coleta dos dígitos e as configurações de entrada do bloco de identificação no Architect.',
        'Conferir o resultado das consultas de autenticação (Data Action) no período: erros e tempo de resposta.',
        'Repetir os cenários de teste "CPF válido", "CPF inválido", "Ausência de digitação" e "Três tentativas incorretas" na versão publicada.',
      ],
    };
  }
  if (type === 'integracao' || metric === 'integrationErrors' || metric === 'apiErrors') {
    return {
      causes: [
        'Erro, indisponibilidade ou lentidão do serviço integrado após a troca.',
        'Caminho de falha/timeout da Data Action sem tratamento adequado (cliente cai ou é desconectado).',
        'Mapeamento de campos da nova API diferente do esperado pelo fluxo.',
      ],
      recs: [
        'Analisar os erros da Data Action no período e o tempo de resposta do novo serviço.',
        'Garantir que o caminho de falha informe a indisponibilidade e ofereça atendimento, em vez de encerrar a ligação.',
        'Executar o cenário de teste "Falha de integração" e a consulta com dados válidos na versão publicada.',
      ],
    };
  }
  if (type === 'menu') {
    return {
      causes: ['Reordenação ou renomeação de opções confunde clientes habituais.', 'Menu mais longo ou mensagem introdutória maior antes das opções.'],
      recs: ['Comparar a escolha de cada opção antes × depois (mapa da URA).', 'Avaliar reduzir o número de opções ou reposicionar as mais usadas.'],
    };
  }
  if (type === 'mensagem') {
    return {
      causes: ['Mensagens mais longas aumentam o tempo até o cliente agir.', 'Texto ambíguo sobre o que digitar.'],
      recs: ['Medir o tempo da saudação e das mensagens alteradas e encurtar.', 'Validar o novo texto com testes de usabilidade.'],
    };
  }
  return {
    causes: ['A alteração publicada pode ter modificado o comportamento da etapa afetada.'],
    recs: ['Revisar a alteração no Architect e repetir os testes funcionais da versão.'],
  };
}

function stepPlaybook(category: string): { causes: string[]; recs: string[] } {
  switch (category) {
    case 'Falha na identificação':
    case 'Tentativas excedidas':
      return {
        causes: ['Mensagem de erro pouco clara sobre como digitar o CPF.', 'Cliente sem o CPF em mãos ou ligando por terceiros.', 'Número de tentativas ou tempo de digitação inadequados.'],
        recs: ['Revisar a mensagem de erro (exemplo de digitação, aviso para usar apenas números).', 'Oferecer alternativa de identificação ou transferência assistida após a 2ª falha.'],
      };
    case 'Opção inválida':
      return {
        causes: ['Opção que o cliente procura não existe no menu.', 'Menu longo; o cliente esquece as teclas.'],
        recs: ['Analisar as transferências de "Falar com atendente" para descobrir motivos ausentes no menu.', 'Repetir as opções mais usadas primeiro e encurtar o menu.'],
      };
    case 'Menu principal':
      return {
        causes: ['Mensagem de introdução longa antes das opções.', 'Muitas opções no mesmo nível.'],
        recs: ['Medir o tempo até a primeira opção ser anunciada e reduzir.', 'Avaliar menu em dois níveis ou reconhecimento de fala.'],
      };
    case 'Saudação / aviso LGPD':
      return {
        causes: ['Saudação/aviso longos; o cliente desliga antes do menu.'],
        recs: ['Encurtar a saudação mantendo o aviso legal obrigatório (validar com o jurídico).'],
      };
    case 'Autosserviço (em andamento)':
      return {
        causes: ['Resposta do autosserviço demorada ou difícil de entender.', 'Cliente não encontra a informação esperada.'],
        recs: ['Revisar o roteiro do serviço e o tempo de consulta.', 'Oferecer envio por SMS/WhatsApp da informação.'],
      };
    default:
      return { causes: ['Etapa com perda recorrente de clientes.'], recs: ['Revisar a etapa no Architect e testar com clientes reais.'] };
  }
}

function linearTrend(values: number[]) {
  const n = values.length;
  const xs = values.map((_, i) => i);
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (values[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (values[i] - my) ** 2;
  }
  const slope = sxx ? sxy / sxx : 0;
  const r2 = sxx && syy ? (sxy * sxy) / (sxx * syy) : 0;
  return { slope, r2 };
}

export function runInsights(ctx: InsightContext): InsightResult {
  const { store, uras, goals, windowDays, endDate } = ctx;
  const win: Range = { from: addDays(endDate, -(windowDays - 1)), to: endDate };
  const inScope = uras.filter((u) => !u.userCreated && (!ctx.scope || ctx.scope.has(u.id)));
  const uraName = (id: string) => uras.find((u) => u.id === id)?.name ?? id;
  const depOf = (id: string) => uras.find((u) => u.id === id)?.departmentId ?? '';
  const totalsFor = (id: string, r: Range) => sumTotals(store.query(r, new Set([id])));
  const weekly = (id: string) => (totalsFor(id, win).entries / windowDays) * 7;
  const covered = new Set<string>(); // ura|métrica já explicada por uma análise mais específica
  const out: Insight[] = [];
  const positives: Insight[] = [];
  const simNote = ctx.simulated ? ' (dados simulados)' : '';

  // ───── A. Antes × depois de alterações publicadas ─────
  for (const ch of ctx.changes) {
    const ura = inScope.find((u) => u.id === ch.uraId);
    if (!ura || ch.date < win.from || ch.date > endDate) continue;
    const before: Range = { from: addDays(ch.date, -7), to: addDays(ch.date, -1) };
    const afterTo = addDays(ch.date, 7) > endDate ? endDate : addDays(ch.date, 7);
    const daysAfter = diffDays(ch.date, afterTo);
    if (daysAfter < 2) continue;
    const after: Range = { from: addDays(ch.date, 1), to: afterTo };
    const tb = totalsFor(ura.id, before);
    const ta = totalsFor(ura.id, after);
    if (tb.entries < 300 || ta.entries < 300) continue;
    const worse: { m: (typeof RATE_METRICS)[number]; b: number; a: number; p: number | null }[] = [];
    const better: typeof worse = [];
    for (const m of RATE_METRICS) {
      if (m.cpfOnly && !ura.requiresCpf) continue;
      const b = rateOf(m, tb);
      const a = rateOf(m, ta);
      const p = twoProportionPValue(m.num(ta), m.den(ta), m.num(tb), m.den(tb));
      const minDelta = isPerMille(m.key) ? 2 : 1.5;
      if (p == null || p >= 0.01 || Math.abs(a - b) < minDelta) continue;
      ((a > b) === m.higherIsBad ? worse : better).push({ m, b, a, p });
    }
    const series = totalsByDay(store.query({ from: addDays(ch.date, -7), to: afterTo }, new Set([ura.id])), { from: addDays(ch.date, -7), to: afterTo });
    if (worse.length) {
      const main = worse.find((w) => w.m.key === 'authFailureRate') ?? worse.find((w) => isPerMille(w.m.key)) ?? worse[0];
      const pb = changePlaybook(ch.type, main.m.key);
      const wk = weekly(ura.id);
      const affected = worse.reduce((acc, w) => (w.m.key === 'disconnectRate' || w.m.key === 'selfServiceRate' ? Math.max(acc, (Math.abs(w.a - w.b) / 100) * wk) : acc), Math.abs(main.a - main.b) / (isPerMille(main.m.key) ? 1000 : 100) * wk);
      const strong = worse.every((w) => (w.p ?? 1) < 0.001) && ta.entries >= 1500 && daysAfter >= 5;
      const conf: Confidence = strong ? 'alta' : daysAfter >= 3 ? 'media' : 'baixa';
      const failedTests = ctx.tests.filter((t) => t.uraId === ura.id && t.version === ch.version && t.status === 'reprovado');
      const delta = Math.abs(main.a - main.b);
      const sev: Severity = delta >= 8 || affected >= 400 ? 'critica' : delta >= 4 || affected >= 150 ? 'alta' : 'media';
      worse.forEach((w) => covered.add(`${ura.id}|${w.m.key}`));
      // Indicadores relacionados ao mesmo problema não geram análise separada.
      if (worse.some((w) => w.m.key === 'authFailureRate')) covered.add(`${ura.id}|cpfExceeded`);
      if (worse.some((w) => isPerMille(w.m.key))) ['integrationErrors', 'apiErrors', 'flowErrors'].forEach((k) => covered.add(`${ura.id}|${k}`));
      out.push({
        id: `chg|${ch.id}`, kind: 'alteracao',
        title: `${ura.name}: piora após a alteração de ${fmtDate(ch.date)} (${ch.version})`,
        uraIds: [ura.id], departmentIds: [ura.departmentId], severity: sev, confidence: conf,
        confidenceReason: `${strong ? 'Diferença estatisticamente significativa (p < 0,001), volume alto e ' : 'Diferença significativa (p < 0,01) com '}${daysAfter} dia(s) após a publicação. A existência da mudança é bem sustentada; a CAUSA é hipótese.`,
        affectedPerWeek: affected, priority: 0,
        problem: `Após a publicação de ${ch.version} ("${ch.description}"), ${worse.map((w) => `${lc(w.m.label)} foi de ${fmtRate(w.m.key, w.b)} para ${fmtRate(w.m.key, w.a)}`).join('; ')}.`,
        dataUsed: [`Agregados horários da ${ura.name}${simNote}`, `7 dias antes × ${daysAfter} dia(s) depois de ${fmtDate(ch.date)} (dia da publicação excluído)`, 'Histórico de alterações e testes registrados'],
        evidence: [
          ...worse.map((w) => ({ label: w.m.label, value: `${fmtRate(w.m.key, w.b)} → ${fmtRate(w.m.key, w.a)} (${fmtDelta(w.m.key, w.a - w.b)}; p ${pval(w.p)})` })),
          { label: 'Volume avaliado', value: `${fmtInt(tb.entries)} entradas antes · ${fmtInt(ta.entries)} depois` },
          ...failedTests.map((t) => ({ label: 'Teste reprovado nesta versão', value: `"${t.title}" — ${t.obtained || 'sem resultado registrado'}` })),
        ],
        causes: pb.causes, recommendation: pb.recs,
        expectedImpact: `Se a piora for revertida, cerca de ${fmtInt(affected)} ligação(ões) por semana deixam de ser afetadas na ${ura.name} (estimativa a partir do volume atual).`,
        validation: [`Após a correção, comparar 7 dias antes × depois na tela Comparação (meta: ${lc(main.m.label)} de volta a ~${fmtRate(main.m.key, main.b)}).`, 'Registrar e executar os testes funcionais da nova versão antes de publicar.'],
        series: series.map((d) => ({ date: d.date, value: d.entries ? rateOf(main.m, d) : null })), seriesLabel: main.m.label, seriesUnit: isPerMille(main.m.key) ? 'n' : '%', markerDate: ch.date,
        links: [{ label: 'Comparar antes × depois', to: `/comparacao?change=${encodeURIComponent(ch.id)}` }, { label: 'Abrir mapa da URA', to: `/mapa?ura=${ura.id}` }, { label: 'Testes da URA', to: '/testes' }],
      });
    }
    if (better.length && !worse.length) {
      positives.push({
        id: `pos|${ch.id}`, kind: 'melhoria', title: `${ura.name}: melhora após a alteração de ${fmtDate(ch.date)} (${ch.version})`,
        uraIds: [ura.id], departmentIds: [ura.departmentId], severity: 'baixa', confidence: daysAfter >= 5 ? 'alta' : 'media',
        confidenceReason: `Diferença significativa (p < 0,01) com ${daysAfter} dia(s) após a publicação.`, affectedPerWeek: 0, priority: 0,
        problem: `Após "${ch.description}", ${better.map((w) => `${lc(w.m.label)} foi de ${fmtRate(w.m.key, w.b)} para ${fmtRate(w.m.key, w.a)}`).join('; ')}.`,
        dataUsed: [`Agregados horários da ${ura.name}${simNote}`, '7 dias antes × depois da publicação'],
        evidence: better.map((w) => ({ label: w.m.label, value: `${fmtRate(w.m.key, w.b)} → ${fmtRate(w.m.key, w.a)} (p ${pval(w.p)})` })),
        causes: ['A alteração publicada é a explicação mais provável (coincidência temporal).'],
        recommendation: ['Documentar a alteração como boa prática e avaliar replicar em URAs semelhantes.'],
        expectedImpact: 'Ganho já observado; acompanhar se se mantém nas próximas semanas.',
        validation: ['Confirmar a manutenção do resultado em 2 a 4 semanas.'],
        series: series.map((d) => ({ date: d.date, value: d.entries ? rateOf(better[0].m, d) : null })), seriesLabel: better[0].m.label, seriesUnit: '%', markerDate: ch.date,
        links: [{ label: 'Comparar antes × depois', to: `/comparacao?change=${encodeURIComponent(ch.id)}` }],
      });
    }
  }

  // ───── B. Tendências na janela ─────
  for (const ura of inScope) {
    const days = totalsByDay(store.query(win, new Set([ura.id])), win);
    for (const m of RATE_METRICS.slice(0, 4)) {
      if (m.cpfOnly && !ura.requiresCpf) continue;
      if (covered.has(`${ura.id}|${m.key}`)) continue;
      const pts = days.filter((d) => m.den(d) >= 50).map((d) => ({ date: d.date, v: rateOf(m, d) }));
      if (pts.length < Math.min(14, windowDays * 0.6)) continue;
      const { slope, r2 } = linearTrend(pts.map((p) => p.v));
      const change = slope * (pts.length - 1);
      if (r2 < 0.45 || Math.abs(change) < 2 || (change > 0) !== m.higherIsBad) continue;
      const half = Math.floor(pts.length / 2);
      const first = days.slice(0, half);
      const last = days.slice(half);
      const tf = first.reduce((a, d) => ({ n: a.n + m.num(d), d: a.d + m.den(d) }), { n: 0, d: 0 });
      const tl = last.reduce((a, d) => ({ n: a.n + m.num(d), d: a.d + m.den(d) }), { n: 0, d: 0 });
      const p = twoProportionPValue(tl.n, tl.d, tf.n, tf.d);
      if (p == null || p >= 0.01) continue;
      const affected = (Math.abs(change) / 100) * weekly(ura.id);
      covered.add(`${ura.id}|${m.key}`);
      out.push({
        id: `trend|${ura.id}|${m.key}`, kind: 'tendencia', title: `${ura.name}: tendência de ${m.higherIsBad ? 'alta' : 'queda'} — ${lc(m.label)}`,
        uraIds: [ura.id], departmentIds: [ura.departmentId], severity: Math.abs(change) >= 5 ? 'alta' : 'media',
        confidence: r2 >= 0.7 && (p ?? 1) < 0.001 ? 'alta' : 'media',
        confidenceReason: `Tendência linear consistente (R² ${r2.toFixed(2).replace('.', ',')}) e diferença significativa entre a 1ª e a 2ª metade da janela (p ${pval(p)}). Não há alteração registrada que explique.`,
        affectedPerWeek: affected, priority: 0,
        problem: `${m.label} variou ${pp(change)} em ${pts.length} dias, de forma gradual (não pontual).`,
        dataUsed: [`Série diária da ${ura.name} nos últimos ${windowDays} dias${simNote}`, 'Regressão linear e teste de duas proporções'],
        evidence: [{ label: 'Variação estimada na janela', value: pp(change) }, { label: 'Ajuste da tendência (R²)', value: r2.toFixed(2).replace('.', ',') }, { label: '1ª metade × 2ª metade', value: `${fmtPct(tf.d ? (tf.n / tf.d) * 100 : 0)} → ${fmtPct(tl.d ? (tl.n / tl.d) * 100 : 0)}` }],
        causes: ['Mudança gradual no perfil das ligações (sazonalidade, campanhas, cobrança).', 'Degradação lenta de uma integração ou de um serviço consultado.', 'Alteração não registrada no Histórico de alterações.'],
        recommendation: ['Verificar no Histórico se houve alterações não registradas no período.', 'Cruzar com o volume por horário e com campanhas/comunicações recentes.', 'Abrir a análise por etapa para localizar onde a variação acontece.'],
        expectedImpact: `Interromper a tendência evita cerca de ${fmtInt(affected)} ligação(ões) afetadas por semana (estimativa).`,
        validation: ['Acompanhar a série nas próximas 2 semanas; a tendência deve estabilizar após a ação.', 'Criar regra de alerta de variação para o indicador.'],
        series: pts.map((x) => ({ date: x.date, value: x.v })), seriesLabel: m.label, seriesUnit: '%',
        links: [{ label: 'Análise de desligamentos', to: '/desligamentos' }, { label: 'Abrir mapa da URA', to: `/mapa?ura=${ura.id}` }],
      });
    }
  }

  // ───── C. Mudanças anormais ainda abertas (ocorrências) ─────
  const recent = ctx.occurrences.filter((o) => (o.status === 'aberta' || o.status === 'em_analise') && o.date >= addDays(endDate, -6) && inScope.some((u) => u.id === o.uraId));
  const groups = new Map<string, AlertOccurrence[]>();
  for (const o of recent) {
    const k = `${o.uraId}|${o.metric}`;
    if (covered.has(k)) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(o);
  }
  for (const [k, occ] of groups) {
    const [uraId, metric] = k.split('|') as [string, MetricKey];
    const worst = occ.reduce((a, b) => (SEV_W[b.severity] > SEV_W[a.severity] ? b : a));
    const label = FAILURE_METRICS.find((f) => f.metric === metric)?.label ?? METRIC_META[metric].label;
    const pb = changePlaybook('roteamento', metric);
    const isPctM = METRIC_META[metric].unit === '%';
    const wk = weekly(uraId);
    const affected = isPctM && worst.baseline != null ? (Math.max(0, worst.value - worst.baseline) / 100) * wk : Math.max(0, worst.value - (worst.baseline ?? 0)) * 7;
    covered.add(k);
    out.push({
      id: `anom|${k}`, kind: 'anomalia', title: `${uraName(uraId)}: ${lc(label)} fora do padrão`,
      uraIds: [uraId], departmentIds: [depOf(uraId)], severity: worst.severity, confidence: occ.length >= 3 ? 'alta' : occ.length === 2 ? 'media' : 'baixa',
      confidenceReason: `${occ.length} dia(s) com ocorrência nos últimos 7 dias${occ.length === 1 ? ' — pode ser um pico isolado' : ''}.`,
      affectedPerWeek: affected, priority: 0,
      problem: `${label} ficou acima do comportamento normal em ${occ.length} dia(s) recente(s): pior valor ${METRIC_META[metric].unit === '%' ? fmtPct(worst.value) : fmtInt(worst.value)}${worst.baseline != null ? ` (referência ${METRIC_META[metric].unit === '%' ? fmtPct(worst.baseline) : worst.baseline.toFixed(1)})` : ''}.`,
      dataUsed: ['Ocorrências da Central de alertas e da detecção automática', `Agregados diários da URA${simNote}`],
      evidence: occ.slice(0, 5).map((o) => ({ label: `${fmtDate(o.date, true)} · ${o.ruleId.startsWith('auto:') ? 'detecção automática' : o.ruleName}`, value: METRIC_META[metric].unit === '%' ? fmtPct(o.value) : fmtInt(o.value) })),
      causes: metric === 'disconnectRate' ? ['Problema pontual de telefonia ou de integração no dia.', 'Pico de volume (campanha, cobrança, instabilidade de outro canal).'] : pb.causes,
      recommendation: [...(metric === 'disconnectRate' ? ['Verificar o horário do pico e eventos operacionais do dia.'] : pb.recs.slice(0, 2)), 'Registrar a investigação na ocorrência (Central de alertas) para manter o histórico.'],
      expectedImpact: affected ? `Cerca de ${fmtInt(affected)} ligação(ões) por semana afetadas enquanto o problema persistir (estimativa).` : 'Impacto depende da duração do problema.',
      validation: ['A ocorrência deve deixar de disparar nos dias seguintes à correção.', 'Marcar a ocorrência como resolvida ou descartada (falso positivo).'],
      links: [{ label: 'Ver ocorrências', to: '/falhas' }, { label: 'Abrir mapa da URA', to: `/mapa?ura=${uraId}` }],
    });
  }

  // ───── D. Etapas com dificuldade recorrente (4 semanas) ─────
  const weeks = [0, 1, 2, 3].map((w) => ({ from: addDays(endDate, -(7 * (w + 1) - 1)), to: addDays(endDate, -7 * w) }));
  const weekSteps = weeks.map((r) => disconnectsByStep(computeUraFlows(store, inScope, r, ctx.scope)));
  type StepAgg = { uras: Map<string, number>; rates: number[]; disc: number; visits: number };
  const stepAgg = new Map<string, StepAgg>();
  for (const ura of inScope) {
    const perWeek = weekSteps.map((ws) => ws.map((s) => ({ s, b: s.byUra.find((x) => x.uraId === ura.id) })).filter((x) => x.b && x.b.visits >= 30));
    const cats = new Set(perWeek.flat().map((x) => x.s.category));
    for (const cat of cats) {
      const wks = perWeek.map((w) => w.find((x) => x.s.category === cat)).filter(Boolean) as { s: { expected: boolean }; b: { visits: number; disconnects: number } }[];
      if (!wks.length || wks[0].s.expected || cat === 'Entrada da chamada' || cat === 'Transferência para fila') continue;
      const rs = wks.map((x) => (x.b.disconnects / x.b.visits) * 100);
      const hits = rs.filter((r) => r >= goals.stepDisconnectCrit).length;
      if (hits < 3) continue;
      const e: StepAgg = stepAgg.get(cat) ?? { uras: new Map<string, number>(), rates: [], disc: 0, visits: 0 };
      e.uras.set(ura.id, rs.reduce((a, b) => a + b, 0) / rs.length);
      e.rates.push(...rs);
      wks.forEach((x) => { e.disc += x.b.disconnects; e.visits += x.b.visits; });
      stepAgg.set(cat, e);
    }
  }
  for (const [cat, e] of stepAgg) {
    const pb = stepPlaybook(cat);
    const perWeek = e.disc / 4;
    const avg = (e.disc / e.visits) * 100;
    out.push({
      id: `step|${cat}`, kind: 'etapa', title: `Etapa com perda recorrente: ${cat}`,
      uraIds: Array.from(e.uras.keys()), departmentIds: Array.from(new Set(Array.from(e.uras.keys()).map(depOf))),
      severity: avg >= goals.stepDisconnectCrit * 1.5 ? 'alta' : 'media', confidence: 'media',
      confidenceReason: `Acima da meta crítica por etapa (${goals.stepDisconnectCrit}%) em pelo menos 3 das últimas 4 semanas. Confiança limitada: valores por etapa vêm ${ctx.simulated ? 'do modelo simulado' : 'das Milestones mapeadas'}.`,
      affectedPerWeek: perWeek * 0.3, priority: 0,
      problem: `Na etapa "${cat}", ${fmtPct(avg)} dos clientes que chegam desligam, de forma recorrente, em ${e.uras.size} URA(s).`,
      dataUsed: ['Desligamentos por etapa nas últimas 4 semanas, semana a semana', ctx.simulated ? 'Modelo de fluxo calibrado pelas taxas reais (simulado)' : 'Flow Milestones mapeadas na Administração'],
      evidence: Array.from(e.uras.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, r]) => ({ label: uraName(id), value: `${fmtPct(r)} em média` })).concat([{ label: 'Desligamentos na etapa (média semanal)', value: fmtInt(perWeek) }]),
      causes: pb.causes, recommendation: pb.recs,
      expectedImpact: `Reduzir em 30% a perda nesta etapa evitaria cerca de ${fmtInt(perWeek * 0.3)} desligamentos por semana (hipótese de meta).`,
      validation: ['Aplicar a mudança em uma URA piloto e comparar 2 semanas antes × depois.', 'Acompanhar a taxa da etapa no mapa e na análise de desligamentos.'],
      dataNote: ctx.simulated ? 'Valores por etapa simulados; em produção dependem de Flow Milestones.' : undefined,
      links: Array.from(e.uras.keys()).slice(0, 2).map((id) => ({ label: `Mapa: ${uraName(id).replace(/^URA /, '')}`, to: `/mapa?ura=${id}` })),
    });
  }

  // ───── E. Oportunidades de autosserviço ─────
  const flows = computeUraFlows(store, inScope, win, ctx.scope);
  const options = disconnectsByOption(flows);
  const wf = 7 / windowDays;
  const transferOpts = options.filter((o) => o.kind === 'transfer' && !/atendente|consultor/i.test(o.label)).sort((a, b) => b.chosen - a.chosen).slice(0, 3);
  for (const o of transferOpts) {
    const perWeek = o.chosen * wf;
    if (perWeek < 100) continue;
    out.push({
      id: `opp|${o.uraId}|${o.key}`, kind: 'oportunidade', title: `Oportunidade de autosserviço: "${o.label}" (${o.uraName.replace(/^URA /, '')})`,
      uraIds: [o.uraId], departmentIds: [depOf(o.uraId)], severity: 'media', confidence: 'baixa',
      confidenceReason: 'O volume é medido; o percentual automatizável é uma HIPÓTESE a confirmar com os motivos reais de contato.',
      affectedPerWeek: perWeek * 0.2, priority: 0,
      problem: `A opção "${o.label}" transfere cerca de ${fmtInt(perWeek)} ligações por semana para atendimento humano.`,
      dataUsed: [`Escolhas do menu da ${o.uraName} nos últimos ${windowDays} dias${simNote}`],
      evidence: [{ label: 'Transferências por semana', value: fmtInt(perWeek) }, { label: 'Desligam antes da fila', value: fmtPct(o.rate) }],
      causes: ['Parte das solicitações pode ser repetitiva (consulta de status, prazo, valores) e resolvível sem atendente.'],
      recommendation: ['Levantar os 5 motivos mais frequentes desta opção (tabulação dos atendentes por 2 semanas).', 'Prototipar autosserviço para os motivos de consulta simples (com envio por SMS/WhatsApp).'],
      expectedImpact: `Se 20% a 30% forem resolvidas no autosserviço: ${fmtInt(perWeek * 0.2)} a ${fmtInt(perWeek * 0.3)} transferências a menos por semana (hipótese).`,
      validation: ['Piloto em parte do tráfego e comparação da taxa de transferência e do retorno de ligações.'],
      links: [{ label: 'Abrir mapa da URA', to: `/mapa?ura=${o.uraId}` }],
    });
  }
  const lowCompletion: Insight[] = [];
  for (const f of flows) {
    for (const o of f.ura.menu.filter((m) => m.kind === 'self')) {
      const node = f.result.nodes[`ss_${o.key}`];
      if (!node || node.visits * wf < 100) continue;
      const done = node.edgeFlows.find((e) => e.to === 'ss_concluido')?.value ?? 0;
      const rate = (done / node.visits) * 100;
      if (rate >= 65) continue;
      lowCompletion.push({
        id: `ssfix|${f.ura.id}|${o.key}`, kind: 'oportunidade', title: `Autosserviço com baixa conclusão: "${o.label}" (${f.ura.name.replace(/^URA /, '')})`,
        uraIds: [f.ura.id], departmentIds: [f.ura.departmentId], severity: 'media', confidence: ctx.simulated ? 'media' : 'alta',
        confidenceReason: `Conclusão medida ${ctx.simulated ? 'no modelo simulado' : 'pelo Flow Outcome do serviço'}.`,
        affectedPerWeek: ((node.visits - done) * wf) * 0.3, priority: 0,
        problem: `Só ${fmtPct(rate)} de quem inicia "${o.label}" conclui o serviço; o restante é transferido ou desliga.`,
        dataUsed: [`Etapas do serviço na ${f.ura.name}${simNote}`],
        evidence: [{ label: 'Iniciaram por semana', value: fmtInt(node.visits * wf) }, { label: 'Concluíram', value: fmtPct(rate) }, { label: 'Desligaram durante', value: fmtPct(node.disconnectRate) }],
        causes: ['Informação devolvida não resolve a necessidade (ex.: cliente quer negociar, não só consultar).', 'Falhas ou lentidão na consulta.', 'Instruções confusas no meio do serviço.'],
        recommendation: ['Revisar o roteiro do serviço e as mensagens de resultado.', 'Verificar falhas de consulta (tela Monitoramento de falhas).', 'Oferecer próximo passo direto (2ª via por SMS, falar com atendente da área certa).'],
        expectedImpact: `Elevar a conclusão para ~75% resolveria cerca de ${fmtInt(node.visits * wf * Math.max(0, 0.75 - rate / 100))} ligações a mais por semana sem atendente (estimativa).`,
        validation: ['Comparar a taxa de conclusão do serviço antes × depois da mudança (2 semanas).'],
        links: [{ label: 'Abrir mapa da URA', to: `/mapa?ura=${f.ura.id}` }],
      });
    }
  }

  // Apenas os 3 serviços com mais ligações não resolvidas, para não diluir as prioridades.
  out.push(...lowCompletion.sort((a, b) => b.affectedPerWeek - a.affectedPerWeek).slice(0, 3));

  // ───── F. Indicadores acima da meta (sem outra explicação) ─────
  for (const ura of inScope) {
    const t = totalsFor(ura.id, win);
    if (t.entries < 500) continue;
    const r = rates(t);
    const checks: [MetricKey, number, boolean, number][] = [
      ['disconnectRate', r.disconnectRate, r.disconnectRate >= goals.disconnectCrit, goals.disconnectCrit],
      ['transferRate', r.transferRate, r.transferRate > goals.transferMax + 5, goals.transferMax],
    ];
    for (const [k, v, breach, goal] of checks) {
      if (!breach || covered.has(`${ura.id}|${k}`)) continue;
      const affected = ((v - goal) / 100) * weekly(ura.id);
      out.push({
        id: `goal|${ura.id}|${k}`, kind: 'meta', title: `${ura.name}: ${lc(METRIC_META[k].label)} acima da meta`,
        uraIds: [ura.id], departmentIds: [ura.departmentId], severity: 'media', confidence: 'alta',
        confidenceReason: `Medição direta em ${fmtInt(t.entries)} entradas na janela.`, affectedPerWeek: affected, priority: 0,
        problem: `${METRIC_META[k].label} de ${fmtPct(v)} nos últimos ${windowDays} dias, acima da meta de ${fmtPct(goal)}.`,
        dataUsed: [`Agregados da ${ura.name}${simNote}`, 'Metas configuradas na Administração'],
        evidence: [{ label: 'Valor na janela', value: fmtPct(v) }, { label: 'Meta', value: fmtPct(goal) }],
        causes: k === 'transferRate' ? ['Poucas opções de autosserviço para os motivos mais frequentes.', 'Autosserviços que não concluem e acabam transferindo.'] : ['Perdas concentradas em etapas específicas (ver análise por etapa).'],
        recommendation: k === 'transferRate' ? ['Ver as oportunidades de autosserviço desta URA.'] : ['Abrir o mapa e priorizar a etapa com mais desligamentos.'],
        expectedImpact: `Chegar à meta representa cerca de ${fmtInt(affected)} ligação(ões) por semana.`,
        validation: ['Acompanhar o indicador semanalmente até atingir a meta.'],
        links: [{ label: 'Abrir mapa da URA', to: `/mapa?ura=${ura.id}` }],
      });
    }
  }

  // ───── Priorização ─────
  for (const i of out) i.priority = Math.round(Math.max(1, i.affectedPerWeek) * SEV_W[i.severity] * CONF_W[i.confidence]);
  out.sort((a, b) => b.priority - a.priority);

  // ───── Resumo executivo (texto gerado por regras) ─────
  const tW = sumTotals(store.query(win, ctx.scope));
  const tP = sumTotals(store.query({ from: addDays(win.from, -windowDays), to: addDays(win.from, -1) }, ctx.scope));
  const rW = rates(tW);
  const rP = rates(tP);
  const sevCount = (s: Severity) => out.filter((i) => i.severity === s).length;
  const paragraphs: string[] = [];
  if (tW.entries) {
    paragraphs.push(`Nos últimos ${windowDays} dias${simNote}, as URAs no escopo receberam ${fmtInt(tW.entries)} entradas: ${fmtPct(rW.selfServiceRate)} resolvidas por autosserviço, ${fmtPct(rW.transferRate)} transferidas e ${fmtPct(rW.disconnectRate)} desligaram dentro da URA${tP.entries ? ` (${pp(rW.disconnectRate - rP.disconnectRate)} em relação aos ${windowDays} dias anteriores)` : ''}.`);
  }
  if (out.length) {
    paragraphs.push(`Foram identificados ${out.length} ponto(s) de atenção: ${sevCount('critica')} crítico(s), ${sevCount('alta')} de alta e ${sevCount('media')} de média criticidade. Prioridades, pela estimativa de ligações afetadas por semana:`);
    out.slice(0, 3).forEach((i, n) => paragraphs.push(`${n + 1}. ${i.title} — ${i.problem} Recomendação inicial: ${i.recommendation[0]} (confiança ${i.confidence}).`));
  } else {
    paragraphs.push('Nenhum ponto de atenção relevante foi identificado na janela analisada.');
  }
  if (positives.length) paragraphs.push(`Resultados positivos: ${positives.map((p) => p.title).join('; ')}.`);
  paragraphs.push('As causas apresentadas são hipóteses baseadas em padrões e coincidência temporal; confirme com testes funcionais e dados por etapa antes de agir.');
  const top = out[0];
  return {
    generatedAt: new Date().toISOString(),
    window: win,
    insights: out,
    positives,
    summary: { headline: top ? `Prioridade nº 1: ${top.title}` : 'Sem pontos críticos na janela analisada', paragraphs },
  };
}

/**
 * Dados enviados à IA generativa (opcional): SOMENTE agregados e textos das análises.
 * Não inclui identificadores de conversa, telefones, CPF, nomes de clientes, gravações ou transcrições.
 */
export function aiPayload(r: InsightResult) {
  return {
    janela: `${r.window.from} a ${r.window.to}`,
    resumoPorRegras: r.summary.paragraphs,
    analises: r.insights.slice(0, 12).map((i) => ({
      titulo: i.title, tipo: i.kind, criticidade: i.severity, confianca: i.confidence, justificativaConfianca: i.confidenceReason,
      problema: i.problem, evidencias: i.evidence.map((e) => `${e.label}: ${e.value}`), causasPossiveis: i.causes,
      recomendacoes: i.recommendation, impactoEsperado: i.expectedImpact, validacao: i.validation,
    })),
    resultadosPositivos: r.positives.map((p) => `${p.title}: ${p.problem}`),
  };
}
