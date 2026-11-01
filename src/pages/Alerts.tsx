import { BellPlus, FlaskConical, GitBranch, Pencil, Power, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardHeader, Drawer, EmptyState, Field, InfoTip, Modal, OccStatusBadge, PageHeader, Segmented, SeverityBadge } from '../components/ui';
import { STATUS_TEXT, useApp } from '../context/AppContext';
import type { AlertCondition, AlertOccurrence, AlertRule, MetricKey, OccurrenceStatus, Severity } from '../data/types';
import { evaluateRules, sevRank } from '../lib/alertEngine';
import { fmtDate, fmtDateLong } from '../lib/dates';
import { fmtDuration, fmtInt, fmtPct } from '../lib/format';
import { METRIC_META } from '../lib/metrics';

const COND_LABEL: Record<AlertCondition, string> = {
  acima_de: 'Acima de',
  abaixo_de: 'Abaixo de',
  aumento_pct: 'Aumento (%) vs linha de base',
  queda_pct: 'Queda (%) vs linha de base',
};

export function fmtMetric(m: MetricKey, v: number) {
  const u = METRIC_META[m].unit;
  return u === '%' ? fmtPct(v) : u === 's' ? fmtDuration(v) : fmtInt(v);
}

export function Alerts() {
  const [tab, setTab] = useState<'ocorrencias' | 'regras'>('ocorrencias');
  const { occurrences, rules } = useApp();
  const open = occurrences.filter((o) => o.status === 'aberta').length;
  return (
    <div>
      <PageHeader
        title="Central de alertas inteligentes"
        description="Regras configuráveis que monitoram os indicadores das URAs. Volume mínimo, horário de funcionamento e linha de base reduzem alertas falsos."
        actions={<Segmented value={tab} onChange={setTab} options={[{ value: 'ocorrencias', label: `Ocorrências (${open} abertas)` }, { value: 'regras', label: `Regras (${rules.length})` }]} />}
      />
      {tab === 'ocorrencias' ? <Occurrences /> : <Rules />}
    </div>
  );
}

function Occurrences() {
  const { occurrences, uras, departments, rules, updateOccurrence } = useApp();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | OccurrenceStatus>('all');
  const [sev, setSev] = useState<'all' | Severity>('all');
  const [rule, setRule] = useState('all');
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    const occ = params.get('occ');
    if (occ) { setSel(occ); setParams({}, { replace: true }); }
  }, [params, setParams]);

  const uraName = (id: string) => uras.find((u) => u.id === id)?.name ?? id;
  const rows = occurrences.filter((o) =>
    (status === 'all' || o.status === status) && (sev === 'all' || o.severity === sev) && (rule === 'all' || o.ruleId === rule) &&
    (!q || `${o.ruleName} ${uraName(o.uraId)} ${o.owner}`.toLowerCase().includes(q.toLowerCase())));
  const counts = { aberta: 0, em_analise: 0, resolvida: 0, descartada: 0 } as Record<OccurrenceStatus, number>;
  occurrences.forEach((o) => counts[o.status]++);
  const critOpen = occurrences.filter((o) => o.status !== 'resolvida' && o.status !== 'descartada' && sevRank(o.severity) >= 2).length;
  const selOcc = occurrences.find((o) => o.id === sel) ?? null;

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {(Object.keys(counts) as OccurrenceStatus[]).map((k) => (
          <button key={k} onClick={() => setStatus(status === k ? 'all' : k)} className={`card p-3 text-left transition hover:border-brand-300 ${status === k ? 'ring-2 ring-brand-500' : ''}`}>
            <div className="text-xs text-slate-500">{STATUS_TEXT[k]}</div>
            <div className="text-2xl font-semibold">{counts[k]}</div>
          </button>
        ))}
        <div className="card p-3">
          <div className="flex items-center gap-1 text-xs text-slate-500">Alta/crítica em aberto <InfoTip text="Ocorrências de criticidade alta ou crítica com status Aberta ou Em análise." /></div>
          <div className={`text-2xl font-semibold ${critOpen ? 'text-red-600' : ''}`}>{critOpen}</div>
        </div>
      </div>
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-3 dark:border-slate-800">
          <label className="relative min-w-[220px] flex-1">
            <span className="label">Pesquisar</span>
            <Search className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-slate-400" />
            <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Regra, URA ou responsável…" />
          </label>
          <label><span className="label">Status</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="all">Todos</option>{Object.entries(STATUS_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label><span className="label">Criticidade</span>
            <select className="input" value={sev} onChange={(e) => setSev(e.target.value as typeof sev)}>
              <option value="all">Todas</option><option value="critica">Crítica</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
            </select>
          </label>
          <label className="min-w-[200px]"><span className="label">Regra</span>
            <select className="input" value={rule} onChange={(e) => setRule(e.target.value)}>
              <option value="all">Todas</option>{rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <div className="ml-auto self-center text-xs text-slate-500">Avaliação diária · últimos 14 dias</div>
        </div>
        {rows.length === 0 ? <EmptyState title="Nenhuma ocorrência encontrada" text="Nenhuma regra ativa disparou para os filtros escolhidos." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr><th className="th">Data</th><th className="th">Ocorrência</th><th className="th">URA / Departamento</th><th className="th text-right">Valor</th><th className="th text-right">Referência</th><th className="th">Criticidade</th><th className="th">Status</th><th className="th">Responsável</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((o) => (
                  <tr key={o.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => setSel(o.id)}>
                    <td className="td whitespace-nowrap text-slate-600 dark:text-slate-300">{fmtDate(o.date, true)}</td>
                    <td className="td"><div className="font-medium">{o.ruleName}</div><div className="text-xs text-slate-500">{METRIC_META[o.metric].label}</div></td>
                    <td className="td"><div>{uraName(o.uraId)}</div><div className="text-xs text-slate-500">{departments.find((d) => d.id === o.departmentId)?.name}</div></td>
                    <td className="td text-right font-semibold tabular-nums">{fmtMetric(o.metric, o.value)}</td>
                    <td className="td text-right text-xs text-slate-500">{refText(o)}</td>
                    <td className="td"><SeverityBadge s={o.severity} /></td>
                    <td className="td"><OccStatusBadge s={o.status} /></td>
                    <td className="td text-sm text-slate-600 dark:text-slate-300">{o.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {selOcc && <OccurrenceDrawer o={selOcc} onClose={() => setSel(null)} onUpdate={(p) => updateOccurrence(selOcc.id, p)} />}
    </>
  );
}

function refText(o: AlertOccurrence) {
  if (o.baseline == null) return `${COND_LABEL[o.condition].toLowerCase()} ${fmtMetric(o.metric, o.threshold)}`;
  const ch = ((o.value - o.baseline) / o.baseline) * 100;
  return `base ${fmtMetric(o.metric, o.baseline)} (${ch > 0 ? '+' : ''}${ch.toFixed(0)}%)`;
}

function OccurrenceDrawer({ o, onClose, onUpdate }: { o: AlertOccurrence; onClose: () => void; onUpdate: (p: { status?: OccurrenceStatus; owner?: string; note?: string }) => void }) {
  const { uras, departments, rules } = useApp();
  const [note, setNote] = useState('');
  const [owner, setOwner] = useState(o.owner);
  const rule = rules.find((r) => r.id === o.ruleId);
  const ura = uras.find((u) => u.id === o.uraId);
  return (
    <Drawer open onClose={onClose} title={o.ruleName} subtitle={`${ura?.name} · ${fmtDateLong(o.date)}`}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2"><SeverityBadge s={o.severity} /><OccStatusBadge s={o.status} /></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat k="Valor observado" v={fmtMetric(o.metric, o.value)} />
          <Stat k="Linha de base" v={o.baseline != null ? fmtMetric(o.metric, o.baseline) : '—'} />
          <Stat k="Condição" v={`${COND_LABEL[o.condition].split(' ')[0]} ${o.condition.endsWith('pct') ? `${o.threshold}%` : fmtMetric(o.metric, o.threshold)}`} />
          <Stat k="Volume avaliado" v={`${fmtInt(o.volume)} entradas`} />
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-slate-500">Departamento</dt><dd>{departments.find((d) => d.id === o.departmentId)?.name}</dd></div>
          <div><dt className="text-xs text-slate-500">Indicador</dt><dd>{METRIC_META[o.metric].label}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Descrição</dt>
            <dd>{describe(o)} {rule && `Regra avaliada ${rule.businessHoursOnly ? 'no horário de funcionamento (08h–20h)' : 'nas 24 horas'}, com volume mínimo de ${fmtInt(rule.minVolume)} entradas${o.baseline != null ? ` e linha de base dos ${rule.baselineDays} dias anteriores` : ''}.`}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Link to={`/mapa?ura=${o.uraId}`} className="btn-secondary"><GitBranch className="h-4 w-4" /> Investigar no mapa</Link>
          {ura && ura.lastChange >= addDaysStr(o.date, -7) && ura.lastChange <= o.date && (
            <span className="inline-flex items-center rounded-lg bg-amber-50 px-3 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Alteração recente na URA em {fmtDate(ura.lastChange)}: “{ura.lastChangeNote}”. Possível relação — hipótese a confirmar.
            </span>
          )}
        </div>
        <div className="card space-y-3 p-4">
          <h4 className="text-sm font-semibold">Tratamento</h4>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STATUS_TEXT) as OccurrenceStatus[]).map((s) => (
              <button key={s} className={o.status === s ? 'btn-primary py-1.5 text-xs' : 'btn-secondary py-1.5 text-xs'} onClick={() => onUpdate({ status: s })}>{STATUS_TEXT[s]}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Responsável" />
            <button className="btn-secondary shrink-0" disabled={!owner.trim() || owner === o.owner} onClick={() => onUpdate({ owner: owner.trim() })}>Atribuir</button>
          </div>
          <div className="flex gap-2">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Adicionar comentário ao histórico…" onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) { onUpdate({ note: note.trim() }); setNote(''); } }} />
            <button className="btn-secondary shrink-0" disabled={!note.trim()} onClick={() => { onUpdate({ note: note.trim() }); setNote(''); }}>Registrar</button>
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Histórico</h4>
          <ol className="space-y-3 border-l-2 border-slate-200 pl-4 dark:border-slate-700">
            {o.history.map((h, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500" />
                <div className="text-xs text-slate-500">{h.at.replace('T', ' ')} · {h.by}</div>
                <div className="text-sm">{h.text}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Drawer>
  );
}

function addDaysStr(iso: string, n: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function describe(o: AlertOccurrence) {
  const m = METRIC_META[o.metric].label.toLowerCase();
  if (o.baseline != null) {
    const ch = ((o.value - o.baseline) / o.baseline) * 100;
    return `A ${m} foi de ${fmtMetric(o.metric, o.value)}, ${ch > 0 ? 'acima' : 'abaixo'} da linha de base de ${fmtMetric(o.metric, o.baseline)} (${ch > 0 ? '+' : ''}${ch.toFixed(1)}%).`;
  }
  return `O indicador ${m} registrou ${fmtMetric(o.metric, o.value)}, ${o.condition === 'acima_de' ? 'acima' : 'abaixo'} do limite de ${fmtMetric(o.metric, o.threshold)}.`;
}

const Stat = ({ k, v }: { k: string; v: string }) => (
  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60"><div className="text-xs text-slate-500">{k}</div><div className="font-semibold">{v}</div></div>
);

function Rules() {
  const { rules, saveRule, deleteRule, uras, departments, occurrences } = useApp();
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const scopeText = (r: AlertRule) => r.uraId !== 'all' ? uras.find((u) => u.id === r.uraId)?.name ?? r.uraId : r.departmentId !== 'all' ? `Todas — ${departments.find((d) => d.id === r.departmentId)?.name}` : 'Todas as URAs';
  return (
    <>
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={() => setEditing(blankRule())}><BellPlus className="h-4 w-4" /> Nova regra</button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr><th className="th">Regra</th><th className="th">Condição de disparo</th><th className="th">Escopo</th><th className="th">Proteções</th><th className="th">Criticidade</th><th className="th">Responsável</th><th className="th text-right">Ocorr. 14d</th><th className="th text-right">Ações</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rules.map((r) => (
                <tr key={r.id} className={r.enabled ? '' : 'opacity-60'}>
                  <td className="td"><div className="font-medium">{r.name}</div><div className="text-xs text-slate-500">{r.enabled ? 'Ativa' : 'Pausada'}</div></td>
                  <td className="td text-sm">{METRIC_META[r.metric].label}<div className="text-xs text-slate-500">{COND_LABEL[r.condition]} {r.condition.endsWith('pct') ? `${r.threshold}%` : fmtMetric(r.metric, r.threshold)}</div></td>
                  <td className="td text-sm">{scopeText(r)}</td>
                  <td className="td text-xs text-slate-500">mín. {fmtInt(r.minVolume)} entradas/dia<br />{r.businessHoursOnly ? 'Horário comercial' : '24h'}{r.condition.endsWith('pct') ? ` · base ${r.baselineDays}d` : ''}</td>
                  <td className="td"><SeverityBadge s={r.severity} /></td>
                  <td className="td text-sm">{r.owner}</td>
                  <td className="td text-right tabular-nums">{occurrences.filter((o) => o.ruleId === r.id).length}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost p-1.5" title={r.enabled ? 'Pausar' : 'Ativar'} onClick={() => saveRule({ ...r, enabled: !r.enabled })}><Power className={`h-4 w-4 ${r.enabled ? 'text-emerald-600' : ''}`} /></button>
                      <button className="btn-ghost p-1.5" title="Editar" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></button>
                      <button className="btn-ghost p-1.5" title="Excluir" onClick={() => confirm(`Excluir a regra "${r.name}"?`) && deleteRule(r.id)}><Trash2 className="h-4 w-4 text-red-500" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rules.length === 0 && <EmptyState title="Nenhuma regra cadastrada" text="Crie uma regra para começar a monitorar." />}
        </div>
      </Card>
      <Card className="mt-5">
        <CardHeader title="Como as regras evitam alertas falsos" />
        <ul className="grid gap-3 p-4 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4 dark:text-slate-300">
          <li><b>Volume mínimo:</b> dias/URAs com poucas entradas não são avaliados — taxas sobre amostras pequenas oscilam muito.</li>
          <li><b>Horário de funcionamento:</b> madrugadas e fora do expediente têm perfil diferente e podem ser excluídos.</li>
          <li><b>Linha de base:</b> variações são comparadas à média dos N dias anteriores, não a um único dia.</li>
          <li><b>Dia corrente:</b> hoje é comparado apenas com as mesmas horas dos dias anteriores.</li>
        </ul>
      </Card>
      {editing && <RuleForm rule={editing} onClose={() => setEditing(null)} onSave={(r) => { saveRule(r); setEditing(null); }} />}
    </>
  );
}

function blankRule(): AlertRule {
  return {
    id: `r-${Date.now().toString(36)}`, name: '', metric: 'disconnectRate', condition: 'aumento_pct', threshold: 20, departmentId: 'all', uraId: 'all',
    severity: 'media', owner: '', enabled: true, minVolume: 200, businessHoursOnly: true, baselineDays: 7, createdAt: new Date().toISOString().slice(0, 10),
  };
}

function RuleForm({ rule, onClose, onSave }: { rule: AlertRule; onClose: () => void; onSave: (r: AlertRule) => void }) {
  const { uras, departments, store } = useApp();
  const [f, setF] = useState(rule);
  const [err, setErr] = useState<string | null>(null);
  const [test, setTest] = useState<AlertOccurrence[] | null>(null);
  const set = <K extends keyof AlertRule>(k: K, v: AlertRule[K]) => { setF((p) => ({ ...p, [k]: v })); setTest(null); };
  const urasInDept = uras.filter((u) => f.departmentId === 'all' || u.departmentId === f.departmentId);
  const isPct = f.condition.endsWith('pct');
  const unit = METRIC_META[f.metric].unit;
  const validate = () => {
    if (!f.name.trim()) return 'Informe o nome da regra.';
    if (!(f.threshold >= 0)) return 'O limite deve ser um número maior ou igual a zero.';
    if (!f.owner.trim()) return 'Informe o responsável.';
    if (f.minVolume < 0) return 'Volume mínimo inválido.';
    if (isPct && (f.baselineDays < 1 || f.baselineDays > 28)) return 'A linha de base deve ter entre 1 e 28 dias.';
    return null;
  };
  const runTest = () => store && setTest(evaluateRules([{ ...f, enabled: true }], store, uras, { days: 30 }));
  const testByUra = useMemo(() => {
    const m = new Map<string, number>();
    test?.forEach((o) => m.set(o.uraId, (m.get(o.uraId) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [test]);
  return (
    <Modal open wide onClose={onClose} title={rule.name ? `Editar regra: ${rule.name}` : 'Nova regra de alerta'}
      footer={<>
        <button className="btn-secondary mr-auto" onClick={runTest}><FlaskConical className="h-4 w-4" /> Testar nos últimos 30 dias</button>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={() => { const e = validate(); if (e) setErr(e); else onSave({ ...f, name: f.name.trim(), owner: f.owner.trim() }); }}>Salvar regra</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Nome *"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Aumento de desligamentos no menu" /></Field></div>
        <Field label="Indicador monitorado">
          <select className="input" value={f.metric} onChange={(e) => set('metric', e.target.value as MetricKey)}>
            {(Object.keys(METRIC_META) as MetricKey[]).map((m) => <option key={m} value={m}>{METRIC_META[m].label}</option>)}
          </select>
        </Field>
        <Field label="Condição de disparo">
          <select className="input" value={f.condition} onChange={(e) => set('condition', e.target.value as AlertCondition)}>
            {(Object.keys(COND_LABEL) as AlertCondition[]).map((k) => <option key={k} value={k}>{COND_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label={`Limite (${isPct ? '% de variação' : unit === '%' ? '%' : unit === 's' ? 'segundos' : 'quantidade'})`}>
          <input type="number" min={0} step="any" className="input" value={f.threshold} onChange={(e) => set('threshold', Number(e.target.value))} />
        </Field>
        <Field label="Criticidade">
          <select className="input" value={f.severity} onChange={(e) => set('severity', e.target.value as Severity)}>
            <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option>
          </select>
        </Field>
        <Field label="Departamento">
          <select className="input" value={f.departmentId} onChange={(e) => { set('departmentId', e.target.value); set('uraId', 'all'); }}>
            <option value="all">Todos</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="URA">
          <select className="input" value={f.uraId} onChange={(e) => set('uraId', e.target.value)}>
            <option value="all">Todas do escopo</option>{urasInDept.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Responsável *"><input className="input" value={f.owner} onChange={(e) => set('owner', e.target.value)} /></Field>
        <Field label="Volume mínimo de entradas no dia" hint="Abaixo disso a regra não é avaliada.">
          <input type="number" min={0} className="input" value={f.minVolume} onChange={(e) => set('minVolume', Number(e.target.value))} />
        </Field>
        {isPct && (
          <Field label="Linha de base (dias anteriores)">
            <input type="number" min={1} max={28} className="input" value={f.baselineDays} onChange={(e) => set('baselineDays', Number(e.target.value))} />
          </Field>
        )}
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={f.businessHoursOnly} onChange={(e) => set('businessHoursOnly', e.target.checked)} /> Avaliar só no horário de funcionamento (08h–20h)
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={f.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Regra ativa
        </label>
      </div>
      {err && <p className="mt-3 text-sm text-red-600" role="alert">{err}</p>}
      {test && (
        <div className="mt-4 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
          <div className="font-medium">Simulação: {test.length} ocorrência(s) nos últimos 30 dias</div>
          {test.length === 0 ? <p className="text-slate-500">A regra não teria disparado. Se a intenção é detectar desvios menores, reduza o limite.</p> : (
            <ul className="mt-1 text-slate-600 dark:text-slate-300">
              {testByUra.slice(0, 6).map(([id, n]) => <li key={id}>{uras.find((u) => u.id === id)?.name}: {n} dia(s)</li>)}
              {test.length > 20 && <li className="mt-1 text-amber-700 dark:text-amber-400">Volume alto de disparos — risco de “fadiga de alertas”. Considere aumentar o limite ou o volume mínimo.</li>}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
