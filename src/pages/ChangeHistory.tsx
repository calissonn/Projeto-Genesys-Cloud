import { Download, GitCompare, History, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, Delta, EmptyState, Field, Modal, PageHeader, Segmented } from '../components/ui';
import { CURRENT_USER, useApp } from '../context/AppContext';
import { CHANGE_TYPE_LABEL } from '../data/changeLog';
import type { UraChange } from '../data/types';
import { addDays, fmtDateLong, todayISO } from '../lib/dates';
import { fmtPct } from '../lib/format';
import { rates, sumTotals } from '../lib/metrics';
import { downloadCsv } from '../lib/exporters';
import { BACKEND } from '../services/api';

export function ChangeHistory() {
  const [tab, setTab] = useState<'alteracoes' | 'auditoria'>('alteracoes');
  return (
    <div>
      <PageHeader title="Histórico de alterações"
        description="Versões publicadas das URAs com o impacto observado, e a trilha de auditoria das ações realizadas neste sistema."
        actions={<Segmented value={tab} onChange={setTab} options={[{ value: 'alteracoes', label: 'Alterações nas URAs' }, { value: 'auditoria', label: 'Auditoria de ações' }]} />} />
      {tab === 'alteracoes' ? <Changes /> : <Audit />}
    </div>
  );
}

function Changes() {
  const { changes, uras, departments, store, saveChange, can } = useApp();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('all');
  const [type, setType] = useState('all');
  const [adding, setAdding] = useState(false);

  /** Impacto rápido: 7 dias antes × 7 dias depois (excluindo o dia da publicação). */
  const impact = useMemo(() => {
    const m = new Map<string, { before: number; after: number; ssBefore: number; ssAfter: number; afterDays: number } | null>();
    if (!store) return m;
    for (const ch of changes) {
      const ids = new Set([ch.uraId]);
      const to = addDays(ch.date, 7) > todayISO() ? todayISO() : addDays(ch.date, 7);
      const b = sumTotals(store.query({ from: addDays(ch.date, -7), to: addDays(ch.date, -1) }, ids));
      const a = to >= addDays(ch.date, 1) ? sumTotals(store.query({ from: addDays(ch.date, 1), to }, ids)) : null;
      if (!b.entries || !a || !a.entries) { m.set(ch.id, null); continue; }
      m.set(ch.id, { before: rates(b).disconnectRate, after: rates(a).disconnectRate, ssBefore: rates(b).selfServiceRate, ssAfter: rates(a).selfServiceRate, afterDays: Math.round((new Date(to).getTime() - new Date(ch.date).getTime()) / 86400000) });
    }
    return m;
  }, [changes, store]);

  const list = changes.filter((ch) => {
    const u = uras.find((x) => x.id === ch.uraId);
    return (dept === 'all' || u?.departmentId === dept) && (type === 'all' || ch.type === type)
      && (!q || `${u?.name} ${ch.version} ${ch.description} ${ch.author}`.toLowerCase().includes(q.toLowerCase()));
  });

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-3 dark:border-slate-800">
          <label className="relative min-w-[220px] flex-1">
            <span className="label">Pesquisar</span>
            <Search className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-slate-400" />
            <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="URA, versão, descrição ou autor…" />
          </label>
          <label><span className="label">Departamento</span>
            <select className="input" value={dept} onChange={(e) => setDept(e.target.value)}><option value="all">Todos</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </label>
          <label><span className="label">Tipo</span>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}><option value="all">Todos</option>{Object.entries(CHANGE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          {can('changes:write') && <button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Registrar alteração</button>}
        </div>
        {list.length === 0 ? <EmptyState title="Nenhuma alteração encontrada" /> : (
          <ol className="divide-y divide-slate-100 dark:divide-slate-800">
            {list.map((ch) => {
              const u = uras.find((x) => x.id === ch.uraId);
              const im = impact.get(ch.id);
              return (
                <li key={ch.id} className="flex flex-wrap items-start gap-4 px-4 py-3">
                  <div className="w-28 shrink-0 text-sm">
                    <div className="font-medium">{fmtDateLong(ch.date)}</div>
                    <div className="text-xs text-slate-500">{ch.version}</div>
                  </div>
                  <div className="min-w-[240px] flex-1">
                    <div className="text-sm font-medium">{ch.description}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {u?.name ?? ch.uraId} · <span className="rounded bg-slate-100 px-1 dark:bg-slate-800">{CHANGE_TYPE_LABEL[ch.type]}</span> · {ch.author}
                      {ch.source === 'usuario' && <span className="ml-1 rounded bg-brand-50 px-1 text-brand-700 dark:bg-brand-950 dark:text-brand-300">registrado manualmente</span>}
                    </div>
                  </div>
                  <div className="w-64 shrink-0 text-xs">
                    {im ? (
                      <div className="space-y-0.5">
                        <div className="flex justify-between gap-2"><span className="text-slate-500">Desligamento</span><span className="tabular-nums">{fmtPct(im.before)} → <b>{fmtPct(im.after)}</b> <Delta value={im.after - im.before} higherIsBad unit=" p.p." suffix="" /></span></div>
                        <div className="flex justify-between gap-2"><span className="text-slate-500">Autosserviço</span><span className="tabular-nums">{fmtPct(im.ssBefore)} → <b>{fmtPct(im.ssAfter)}</b> <Delta value={im.ssAfter - im.ssBefore} higherIsBad={false} unit=" p.p." suffix="" /></span></div>
                        <div className="text-[10px] text-slate-400">7 dias antes × {im.afterDays < 7 ? `${im.afterDays} dia(s)` : '7 dias'} depois</div>
                      </div>
                    ) : <span className="text-slate-400">Sem dados suficientes antes/depois</span>}
                  </div>
                  <Link to={`/comparacao?change=${encodeURIComponent(ch.id)}`} className="btn-secondary shrink-0 py-1.5 text-xs"><GitCompare className="h-3.5 w-3.5" /> Antes × depois</Link>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
      <p className="mt-3 text-xs text-slate-500">
        Histórico simulado. Em produção, versões e datas de publicação virão de <code>GET /api/v2/flows/{'{flowId}'}/versions</code> (somente leitura); a descrição da mudança é registrada pela equipe neste sistema.
      </p>
      {adding && <ChangeForm onClose={() => setAdding(false)} onSave={(c) => { saveChange(c); setAdding(false); }} />}
    </>
  );
}

function ChangeForm({ onClose, onSave }: { onClose: () => void; onSave: (c: UraChange) => void }) {
  const { uras } = useApp();
  const [f, setF] = useState<UraChange>({ id: `chg-${Date.now().toString(36)}`, uraId: uras[0]?.id ?? '', version: '', date: todayISO(), author: '', description: '', type: 'menu', source: 'usuario' });
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    if (!f.version.trim() || !f.description.trim() || !f.author.trim()) return setErr('Preencha versão, descrição e responsável.');
    if (f.date > todayISO()) return setErr('A data de publicação não pode estar no futuro.');
    onSave({ ...f, version: f.version.trim(), description: f.description.trim(), author: f.author.trim() });
  };
  return (
    <Modal open onClose={onClose} title="Registrar alteração de URA"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={submit}>Registrar</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="URA"><select className="input" value={f.uraId} onChange={(e) => setF({ ...f, uraId: e.target.value })}>{uras.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field></div>
        <Field label="Versão publicada *"><input className="input" value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} placeholder="v2.7" /></Field>
        <Field label="Data de publicação"><input type="date" className="input" value={f.date} max={todayISO()} onChange={(e) => e.target.value && setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Tipo"><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as UraChange['type'] })}>{Object.entries(CHANGE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Responsável *"><input className="input" value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="Descrição da alteração *"><textarea className="input" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field></div>
      </div>
      <p className="mt-3 text-xs text-slate-500">O registro é apenas documental: o sistema não publica nem altera fluxos na Genesys Cloud.</p>
      {err && <p className="mt-2 text-sm text-red-600" role="alert">{err}</p>}
    </Modal>
  );
}

function Audit() {
  const { can } = useApp();
  if (!can('audit:read')) return <Card><EmptyState title="Sem permissão" text="Seu perfil não acessa a auditoria." /></Card>;
  return <AuditView />;
}

function AuditView() {
  const { audit, refreshAudit, logAction } = useApp();
  useEffect(() => { refreshAudit(); }, [refreshAudit]);
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('all');
  const entities = Array.from(new Set(audit.map((a) => a.entity))).sort();
  const list = audit.filter((a) => (entity === 'all' || a.entity === entity) && (!q || `${a.action} ${a.details ?? ''} ${a.entityId ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <Card>
      <CardHeader title="Auditoria de ações" subtitle={BACKEND ? 'Registrada pelo servidor em cada alteração — somente inclusão, não pode ser editada.' : `Ações realizadas neste navegador · usuário: ${CURRENT_USER}`}
        info="No protótipo a trilha fica no navegador. Na Etapa 3 será gravada no PostgreSQL (tabela audit_log), com o usuário autenticado via SSO, e não poderá ser editada."
        actions={<button className="btn-secondary" disabled={!list.length} onClick={() => { logAction('Auditoria exportada', 'Auditoria', undefined, `${list.length} registros`); downloadCsv('auditoria.csv', [['Data/hora', 'Usuário', 'Ação', 'Entidade', 'ID', 'Detalhes'], ...list.map((a) => [a.at, a.user, a.action, a.entity, a.entityId ?? '', a.details ?? ''])]); }}><Download className="h-4 w-4" /> Exportar CSV</button>} />
      <div className="flex flex-wrap gap-3 border-b border-slate-100 p-3 dark:border-slate-800">
        <input className="input max-w-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar ação ou detalhe…" />
        <select className="input w-auto" value={entity} onChange={(e) => setEntity(e.target.value)}><option value="all">Todas as entidades</option>{entities.map((e) => <option key={e}>{e}</option>)}</select>
      </div>
      {list.length === 0 ? <EmptyState title="Nenhuma ação registrada ainda" text="Ações como salvar regras, tratar ocorrências, cadastrar testes, alterar metas e exportar relatórios aparecem aqui." /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="th">Data/hora</th><th className="th">Usuário</th><th className="th">Ação</th><th className="th">Entidade</th><th className="th">Detalhes</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.map((a) => (
                <tr key={a.id}>
                  <td className="td whitespace-nowrap text-slate-500">{new Date(a.at).toLocaleString('pt-BR')}</td>
                  <td className="td">{a.user}</td>
                  <td className="td font-medium"><History className="mr-1 inline h-3.5 w-3.5 text-slate-400" />{a.action}</td>
                  <td className="td">{a.entity}{a.entityId && <div className="max-w-[200px] truncate text-xs text-slate-500">{a.entityId}</div>}</td>
                  <td className="td text-slate-600 dark:text-slate-300">{a.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
