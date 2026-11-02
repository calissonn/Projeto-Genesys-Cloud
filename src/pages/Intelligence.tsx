import clsx from 'clsx';
import { Bot, ChevronDown, ChevronRight, ClipboardCopy, FileText, Lightbulb, Loader2, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from '../components/ChartTooltip';
import { Card, CardHeader, EmptyState, InfoTip, Modal, PageHeader, Segmented, SeverityBadge } from '../components/ui';
import { CURRENT_USER, useApp } from '../context/AppContext';
import { useChartColors } from '../lib/chartColors';
import { fmtDate, fmtDateLong, todayISO } from '../lib/dates';
import { exportPdf, type ReportDoc } from '../lib/exporters';
import { fmtInt } from '../lib/format';
import { aiPayload, runInsights, type Confidence, type Insight, type InsightKind } from '../lib/insights';
import { scopeUraIds } from '../lib/metrics';
import { useCollection } from '../lib/useCollection';
import { BACKEND, api } from '../services/api';

type Tab = 'prioridades' | 'alteracoes' | 'oportunidades' | 'metodologia';
type InsightStatus = 'nova' | 'em_investigacao' | 'acao_definida' | 'resolvida' | 'descartada';
interface InsightState { id: string; status: InsightStatus; note?: string; by?: string; at?: string }

const KIND_LABEL: Record<InsightKind, string> = {
  alteracao: 'Antes × depois', tendencia: 'Tendência', anomalia: 'Mudança anormal', etapa: 'Etapa recorrente',
  oportunidade: 'Oportunidade', meta: 'Fora da meta', melhoria: 'Resultado positivo',
};
const STATUS_LABEL: Record<InsightStatus, string> = {
  nova: 'Nova', em_investigacao: 'Em investigação', acao_definida: 'Ação definida', resolvida: 'Resolvida', descartada: 'Descartada',
};
const CONF: Record<Confidence, { label: string; cls: string }> = {
  alta: { label: 'Confiança alta', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900' },
  media: { label: 'Confiança média', cls: 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900' },
  baixa: { label: 'Confiança baixa', cls: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700' },
};

interface AiStatus { enabled: boolean; model: string | null; reason?: string }

export function Intelligence() {
  const { store, uras, departments, filters, setFilters, goals, changes, occurrences, tests, dataSource, can, logAction } = useApp();
  const [windowDays, setWindowDays] = useState<14 | 28 | 56>(28);
  const [tab, setTab] = useState<Tab>('prioridades');
  const [open, setOpen] = useState<string | null>(null);
  const [stateErr, setStateErr] = useState<string | null>(null);
  const states = useCollection<InsightState>('insight-states', 'gui-insight-states', [], setStateErr);
  const scope = useMemo(() => scopeUraIds(uras, filters), [uras, filters]);

  const result = useMemo(() => (store ? runInsights({
    store, uras, departments, scope, goals, changes, occurrences, tests, windowDays,
    endDate: store.maxDate < todayISO() ? store.maxDate : todayISO(), simulated: dataSource.kind === 'simulado',
  }) : null), [store, uras, departments, scope, goals, changes, occurrences, tests, windowDays, dataSource.kind]);

  const stateOf = (id: string): InsightStatus => states.items.find((s) => s.id === id)?.status ?? 'nova';
  const setStatus = (id: string, status: InsightStatus) => {
    states.save({ id, status, by: CURRENT_USER, at: new Date().toISOString() });
    logAction('Análise de IA CX tratada', 'Inteligência CX', id, STATUS_LABEL[status]);
  };

  if (!store || !result) return null;
  const active = result.insights.filter((i) => stateOf(i.id) !== 'descartada' && stateOf(i.id) !== 'resolvida');
  const list = tab === 'prioridades' ? result.insights : tab === 'alteracoes' ? [...result.insights.filter((i) => i.kind === 'alteracao'), ...result.positives] : result.insights.filter((i) => i.kind === 'oportunidade');
  const urasInDept = uras.filter((u) => filters.departmentId === 'all' || u.departmentId === filters.departmentId);

  const exportSummary = async () => {
    const doc: ReportDoc = {
      title: 'Inteligência CX — análise executiva', scope: filters.uraId !== 'all' ? uras.find((u) => u.id === filters.uraId)?.name ?? '' : filters.departmentId !== 'all' ? departments.find((d) => d.id === filters.departmentId)?.name ?? '' : 'Todas as URAs',
      period: `${fmtDateLong(result.window.from)} a ${fmtDateLong(result.window.to)}`, generatedAt: new Date().toLocaleString('pt-BR'), simulated: dataSource.kind === 'simulado',
      kpis: [{ label: 'Pontos de atenção', value: String(result.insights.length) }, { label: 'Em aberto (não descartados/resolvidos)', value: String(active.length) }, { label: 'Resultados positivos', value: String(result.positives.length) }],
      conclusions: result.summary.paragraphs, recommendations: [],
      sections: result.insights.slice(0, 10).map((i, n) => ({
        title: `${n + 1}. ${i.title}`,
        text: [`Problema: ${i.problem}`, `Criticidade: ${i.severity} · Confiança: ${i.confidence} — ${i.confidenceReason}`, `Possíveis causas (hipóteses): ${i.causes.join(' ')}`, `Recomendação: ${i.recommendation.join(' ')}`, `Impacto esperado: ${i.expectedImpact}`, `Como validar: ${i.validation.join(' ')}`],
        table: { columns: ['Evidência', 'Valor'], rows: i.evidence.map((e) => [e.label, e.value]) },
      })),
    };
    await exportPdf(doc);
    logAction('Relatório exportado', 'Relatório', 'inteligencia-cx', `Análise executiva (PDF) — ${doc.scope}`);
  };

  return (
    <div>
      <PageHeader title="Inteligência CX"
        description="Análises automáticas das URAs: tendências, mudanças anormais, efeito de alterações, etapas com dificuldade recorrente e oportunidades de autosserviço — com evidências, grau de confiança e forma de validar."
        actions={<span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Análise estatística local — nenhum dado sai do sistema</span>} />

      <Card className="mb-5 flex flex-wrap items-end gap-3 p-3">
        <label className="min-w-[180px]"><span className="label">Departamento</span>
          <select className="input" value={filters.departmentId} onChange={(e) => setFilters({ departmentId: e.target.value })}><option value="all">Todos</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </label>
        <label className="min-w-[220px]"><span className="label">URA</span>
          <select className="input" value={filters.uraId} onChange={(e) => setFilters({ uraId: e.target.value })}><option value="all">Todas</option>{urasInDept.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        </label>
        <label><span className="label">Janela de análise</span>
          <Segmented value={String(windowDays) as '14' | '28' | '56'} onChange={(v) => setWindowDays(Number(v) as 14 | 28 | 56)} options={[{ value: '14', label: '14 dias' }, { value: '28', label: '28 dias' }, { value: '56', label: '56 dias' }]} />
        </label>
        <div className="ml-auto self-center text-xs text-slate-500">{fmtDateLong(result.window.from)} – {fmtDateLong(result.window.to)}</div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={<><Lightbulb className="h-4 w-4 text-amber-500" /> Análise executiva</>}
            subtitle="Gerada por regras e estatística a partir dos dados do período"
            actions={<>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => navigator.clipboard?.writeText(result.summary.paragraphs.join('\n\n'))}><ClipboardCopy className="h-3.5 w-3.5" /> Copiar</button>
              <button className="btn-secondary py-1.5 text-xs" onClick={exportSummary}><FileText className="h-3.5 w-3.5" /> PDF</button>
            </>} />
          <div className="space-y-2.5 px-4 py-3 text-sm leading-relaxed">
            <p className="font-semibold">{result.summary.headline}</p>
            {result.summary.paragraphs.map((p, i) => <p key={i} className={i === result.summary.paragraphs.length - 1 ? 'text-xs text-slate-500' : ''}>{p}</p>)}
          </div>
        </Card>
        <AiPanel payload={aiPayload(result)} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {(['critica', 'alta', 'media'] as const).map((s) => (
          <div key={s} className="card p-3"><div className="text-xs text-slate-500">{s === 'critica' ? 'Críticas' : s === 'alta' ? 'Alta criticidade' : 'Média criticidade'}</div><div className="text-2xl font-semibold">{result.insights.filter((i) => i.severity === s).length}</div></div>
        ))}
        <div className="card p-3"><div className="text-xs text-slate-500">Em aberto</div><div className="text-2xl font-semibold">{active.length}</div></div>
        <div className="card p-3"><div className="text-xs text-slate-500">Resultados positivos</div><div className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">{result.positives.length}</div></div>
      </div>

      <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-3">
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'prioridades', label: `O que investigar primeiro (${result.insights.length})` },
          { value: 'alteracoes', label: `Antes × depois (${result.insights.filter((i) => i.kind === 'alteracao').length + result.positives.length})` },
          { value: 'oportunidades', label: `Oportunidades de autosserviço (${result.insights.filter((i) => i.kind === 'oportunidade').length})` },
          { value: 'metodologia', label: 'Metodologia e privacidade' },
        ]} />
        {stateErr && <span className="text-xs text-red-600">{stateErr}</span>}
      </div>

      {tab === 'metodologia' ? <Methodology /> : list.length === 0 ? <Card><EmptyState title="Nenhuma análise nesta categoria" text="Ajuste o escopo ou a janela de análise." /></Card> : (
        <div className="space-y-3">
          {list.map((i) => (
            <InsightCard key={i.id} i={i} rank={result.insights.indexOf(i) + 1} expanded={open === i.id} onToggle={() => setOpen(open === i.id ? null : i.id)}
              status={stateOf(i.id)} canEdit={can('occurrences:write')} onStatus={(s) => setStatus(i.id, s)} />
          ))}
        </div>
      )}
    </div>
  );
}

function InsightCard({ i, rank, expanded, onToggle, status, canEdit, onStatus }: { i: Insight; rank: number; expanded: boolean; onToggle: () => void; status: InsightStatus; canEdit: boolean; onStatus: (s: InsightStatus) => void }) {
  const c = useChartColors();
  const dim = status === 'descartada' || status === 'resolvida';
  return (
    <Card className={clsx('overflow-hidden', dim && 'opacity-60')}>
      <div className="flex flex-wrap items-start gap-3 px-4 py-3">
        <button onClick={onToggle} className="mt-0.5 text-slate-400 hover:text-slate-700" aria-label={expanded ? 'Recolher' : 'Expandir'}>{expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}</button>
        {i.kind !== 'melhoria' && <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{rank}</span>}
        <button onClick={onToggle} className="min-w-[240px] flex-1 text-left">
          <div className="text-sm font-semibold">{i.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {i.kind === 'melhoria' ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><TrendingUp className="h-3 w-3" /> Resultado positivo</span> : <SeverityBadge s={i.severity} />}
            <span className={clsx('rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', CONF[i.confidence].cls)}>{CONF[i.confidence].label}</span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{KIND_LABEL[i.kind]}</span>
            {i.affectedPerWeek >= 1 && <span className="text-xs text-slate-500">≈ {fmtInt(i.affectedPerWeek)} ligações/semana</span>}
          </div>
        </button>
        {i.kind !== 'melhoria' && (
          <select className="input w-auto text-xs" value={status} disabled={!canEdit} onChange={(e) => onStatus(e.target.value as InsightStatus)} aria-label="Tratamento da análise">
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
      </div>
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 dark:border-slate-800">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-4 text-sm">
              <Section title="Problema identificado"><p>{i.problem}</p></Section>
              <Section title="Evidências">
                <table className="w-full text-sm"><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {i.evidence.map((e, n) => <tr key={n}><td className="py-1 pr-3 text-slate-500">{e.label}</td><td className="py-1 font-medium">{e.value}</td></tr>)}
                </tbody></table>
              </Section>
              <Section title="Dados utilizados"><ul className="list-disc pl-5 text-slate-600 dark:text-slate-300">{i.dataUsed.map((d) => <li key={d}>{d}</li>)}</ul></Section>
              <Section title="Grau de confiança"><p><b>{CONF[i.confidence].label.replace('Confiança ', '')}</b> — {i.confidenceReason}</p></Section>
            </div>
            <div className="space-y-4 text-sm">
              {i.series && i.series.length > 1 && (
                <div className="h-40">
                  <ResponsiveContainer>
                    <LineChart data={i.series}>
                      <CartesianGrid vertical={false} stroke={c.grid} />
                      <XAxis dataKey="date" tick={{ fill: c.text, fontSize: 10 }} tickLine={false} axisLine={{ stroke: c.grid }} tickFormatter={(d) => fmtDate(d)} minTickGap={20} />
                      <YAxis tick={{ fill: c.text, fontSize: 10 }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => (i.seriesUnit === '%' ? `${Math.round(v)}%` : String(Math.round(v)))} />
                      {i.markerDate && <ReferenceLine x={i.markerDate} stroke={c.s7} strokeDasharray="4 3" label={{ value: 'alteração', fill: c.text, fontSize: 10, position: 'insideTopLeft' }} />}
                      <Tooltip content={<ChartTooltip labelFormatter={(l) => fmtDate(String(l), true)} valueFormatter={(v) => (i.seriesUnit === '%' ? `${v.toFixed(1).replace('.', ',')}%` : v.toFixed(1).replace('.', ','))} />} />
                      <Line dataKey="value" name={i.seriesLabel ?? 'Valor'} stroke={i.kind === 'melhoria' ? c.selfService : c.critical} strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <Section title="Possíveis causas (hipóteses — não são diagnósticos)"><ul className="list-disc pl-5">{i.causes.map((x) => <li key={x}>{x}</li>)}</ul></Section>
              <Section title="Recomendação"><ol className="list-decimal pl-5">{i.recommendation.map((x) => <li key={x}>{x}</li>)}</ol></Section>
              <Section title="Impacto esperado"><p>{i.expectedImpact}</p></Section>
              <Section title="Como validar a melhoria"><ul className="list-disc pl-5">{i.validation.map((x) => <li key={x}>{x}</li>)}</ul></Section>
            </div>
          </div>
          {i.dataNote && <p className="mt-3 text-xs text-violet-700 dark:text-violet-300">{i.dataNote}</p>}
          <div className="mt-4 flex flex-wrap gap-2">{i.links.map((l) => <Link key={l.to + l.label} to={l.to} className="btn-secondary py-1.5 text-xs">{l.label}</Link>)}</div>
        </div>
      )}
    </Card>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>{children}</div>
);

/** Redação opcional por IA generativa no backend (somente agregados; desligada por padrão). */
function AiPanel({ payload }: { payload: ReturnType<typeof aiPayload> }) {
  const [status, setStatus] = useState<AiStatus | null>(BACKEND ? null : { enabled: false, model: null, reason: 'Disponível apenas com o backend.' });
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    if (BACKEND) api<AiStatus>('GET', '/api/ai/status').then(setStatus).catch((e) => setStatus({ enabled: false, model: null, reason: e.message }));
  }, []);
  const run = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ text: string; model: string }>('POST', '/api/ai/summary', payload);
      setText(r.text);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [payload]);
  return (
    <Card>
      <CardHeader title={<><Bot className="h-4 w-4 text-brand-600" /> Redação por IA</>} info="Opcional. A IA apenas redige o texto a partir das análises já calculadas; não recebe dados de clientes. Só funciona se a Gazin autorizar e o administrador configurar a chave no servidor." />
      <div className="space-y-3 px-4 py-3 text-sm">
        {!status ? <Loader2 className="h-4 w-4 animate-spin" /> : !status.enabled ? (
          <p className="text-slate-600 dark:text-slate-300"><b>Desativada.</b> {status.reason ?? 'Requer autorização e configuração no servidor.'} A análise ao lado não depende de IA.</p>
        ) : (
          <>
            <p className="text-slate-600 dark:text-slate-300">Modelo configurado: <code>{status.model}</code>. Envia apenas os agregados e textos das análises.</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={busy} onClick={run}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Redigir resumo executivo</button>
            </div>
          </>
        )}
        <button className="text-xs text-brand-600 hover:underline" onClick={() => setPreview(true)}>Ver exatamente o que seria enviado</button>
        {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
        {text && (
          <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-900 dark:bg-brand-950/40">
            <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300"><Sparkles className="h-3 w-3" /> Texto gerado por IA — revise antes de compartilhar <InfoTip text="Os números vêm da análise estatística; a IA só redige. Confira sempre com as evidências." /></div>
            <div className="whitespace-pre-wrap text-sm">{text}</div>
          </div>
        )}
      </div>
      {preview && (
        <Modal open wide onClose={() => setPreview(false)} title="Dados enviados à IA (quando ativada)">
          <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">Somente indicadores agregados e os textos das análises. Sem telefones, CPF, nomes de clientes, identificadores de conversa, gravações ou transcrições.</p>
          <pre className="max-h-[50vh] overflow-auto rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800">{JSON.stringify(payload, null, 2)}</pre>
        </Modal>
      )}
    </Card>
  );
}

function Methodology() {
  const rows: [string, string][] = [
    ['Antes × depois de alterações', 'Compara 7 dias antes com até 7 dias depois de cada publicação registrada (dia da publicação excluído), com teste de duas proporções (p < 0,01) e diferença mínima. Testes reprovados da mesma versão entram como evidência.'],
    ['Tendências', 'Regressão linear da série diária na janela (R² ≥ 0,45, variação ≥ 2 p.p.) confirmada por teste entre a 1ª e a 2ª metade da janela. Ignora o que já foi explicado por uma alteração.'],
    ['Mudanças anormais', 'Ocorrências abertas nos últimos 7 dias, das regras e da detecção automática (média e desvio-padrão de 14 dias).'],
    ['Etapas recorrentes', 'Etapas acima da meta crítica por etapa em 3 das últimas 4 semanas. Depende de Flow Milestones em produção.'],
    ['Oportunidades de autosserviço', 'Opções do menu que mais transferem para humanos e serviços automáticos com baixa conclusão. O percentual automatizável é hipótese.'],
    ['Priorização', 'Ligações afetadas por semana (estimativa) × peso da criticidade × peso da confiança.'],
    ['Grau de confiança', 'Considera significância estatística, volume, tempo de observação e origem dos dados. A confiança é sobre a existência do problema; causas são sempre hipóteses.'],
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Como as análises são feitas" />
        <table className="w-full text-sm"><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map(([k, v]) => <tr key={k} className="align-top"><td className="td w-56 font-medium">{k}</td><td className="td text-slate-600 dark:text-slate-300">{v}</td></tr>)}
        </tbody></table>
      </Card>
      <Card>
        <CardHeader title={<><ShieldCheck className="h-4 w-4 text-emerald-600" /> Privacidade (LGPD)</>} />
        <ul className="list-disc space-y-2 py-3 pl-8 pr-4 text-sm text-slate-600 dark:text-slate-300">
          <li>Todas as análises rodam neste sistema, sobre indicadores agregados.</li>
          <li>A IA generativa é opcional, fica desligada por padrão e só é ativada no servidor, com autorização formal da Gazin.</li>
          <li>Quando ativada, recebe apenas os agregados e textos mostrados em “Ver exatamente o que seria enviado”.</li>
          <li>Gravações, transcrições, CPF, telefones e nomes de clientes nunca são enviados.</li>
          <li>Cada uso da IA é registrado na auditoria.</li>
        </ul>
      </Card>
    </div>
  );
}
