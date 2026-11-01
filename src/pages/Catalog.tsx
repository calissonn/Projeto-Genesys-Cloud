import { ArrowDownUp, GitBranch, LayoutDashboard, Link2Off, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Drawer, EmptyState, Field, HealthBadge, InfoTip, Modal, PageHeader } from '../components/ui';
import { useApp } from '../context/AppContext';
import type { Ura, UraStatus } from '../data/types';
import { fmtDateLong } from '../lib/dates';
import { fmtDuration, fmtInt, fmtPct } from '../lib/format';
import { groupBy, rates, sumTotals } from '../lib/metrics';
import { healthFor } from './Dashboard';

const STATUS_LABEL: Record<UraStatus, string> = { ativa: 'Ativa', 'em-teste': 'Em teste', inativa: 'Inativa' };
type SortKey = 'name' | 'department' | 'entries' | 'disconnectRate' | 'selfServiceRate' | 'lastChange';

export function Catalog() {
  const { uras, departments, store, range, goals, saveUra, removeUra, setFilters } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'entries', dir: -1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Ura | null>(null);

  const stats = useMemo(() => {
    if (!store) return new Map();
    const g = groupBy(store.query(range, null), (r) => r.uraId);
    return new Map(Array.from(g.entries()).map(([k, v]) => { const t = sumTotals(v); return [k, { t, r: rates(t) }]; }));
  }, [store, range]);

  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? id;
  const rows = uras
    .filter((u) => (dept === 'all' || u.departmentId === dept) && (status === 'all' || u.status === status))
    .filter((u) => !q || `${u.name} ${u.description} ${u.queues.join(' ')} ${u.genesysFlowId ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .map((u) => ({ u, s: stats.get(u.id) as { t: ReturnType<typeof sumTotals>; r: ReturnType<typeof rates> } | undefined }))
    .sort((a, b) => {
      const v = (x: typeof a): string | number => {
        switch (sort.k) {
          case 'name': return x.u.name;
          case 'department': return deptName(x.u.departmentId);
          case 'entries': return x.s?.t.entries ?? -1;
          case 'disconnectRate': return x.s?.r.disconnectRate ?? -1;
          case 'selfServiceRate': return x.s?.r.selfServiceRate ?? -1;
          case 'lastChange': return x.u.lastChange;
        }
      };
      const va = v(a), vb = v(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });

  const sel = uras.find((u) => u.id === selected) ?? null;
  const selStats = sel ? stats.get(sel.id) : undefined;
  const Th = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={`th ${right ? 'text-right' : ''}`}>
      <button className="inline-flex items-center gap-1 uppercase hover:text-slate-800 dark:hover:text-slate-200" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }))}>
        {children} <ArrowDownUp className={`h-3 w-3 ${sort.k === k ? 'text-brand-600' : 'opacity-40'}`} />
      </button>
    </th>
  );

  return (
    <div>
      <PageHeader
        title="Catálogo de URAs"
        description="Todas as URAs monitoradas, por departamento, com indicadores do período selecionado no filtro global. Clique em uma linha para ver os detalhes."
        actions={<button className="btn-primary" onClick={() => setEditing(newUra(departments[0].id))}><Plus className="h-4 w-4" /> Nova URA</button>}
      />
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-3 dark:border-slate-800">
          <label className="relative min-w-[240px] flex-1">
            <span className="label">Pesquisar</span>
            <Search className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Nome, fila, descrição ou ID do fluxo…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="min-w-[180px]">
            <span className="label">Departamento</span>
            <select className="input" value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="all">Todos</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="min-w-[140px]">
            <span className="label">Situação</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Todas</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <div className="ml-auto self-center text-xs text-slate-500">{rows.length} de {uras.length} URAs · período {fmtDateLong(range.from)} – {fmtDateLong(range.to)}</div>
        </div>
        {rows.length === 0 ? <EmptyState title="Nenhuma URA encontrada" text="Revise a pesquisa ou os filtros." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <Th k="name">URA</Th>
                  <Th k="department">Departamento</Th>
                  <th className="th">Fluxo Genesys</th>
                  <Th k="entries" right>Entradas</Th>
                  <Th k="disconnectRate" right>Desligamento</Th>
                  <Th k="selfServiceRate" right>Autosserviço</Th>
                  <th className="th">Situação</th>
                  <Th k="lastChange">Última alteração</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map(({ u, s }) => (
                  <tr key={u.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => setSelected(u.id)}>
                    <td className="td">
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-slate-500">{u.version} · {u.queues.join(', ')}</div>
                    </td>
                    <td className="td text-slate-600 dark:text-slate-300">{deptName(u.departmentId)}</td>
                    <td className="td">
                      {u.genesysFlowId ? <code className="text-xs">{u.genesysFlowId.slice(0, 8)}…</code> : (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Link2Off className="h-3 w-3" /> Não vinculado</span>
                      )}
                    </td>
                    <td className="td text-right tabular-nums">{s ? fmtInt(s.t.entries) : '—'}</td>
                    <td className="td text-right">
                      {s ? <HealthBadge h={healthFor(s.r.disconnectRate, goals.disconnectWarn, goals.disconnectCrit)} label={fmtPct(s.r.disconnectRate)} /> : <HealthBadge h="none" />}
                    </td>
                    <td className="td text-right tabular-nums">{s ? fmtPct(s.r.selfServiceRate) : '—'}</td>
                    <td className="td"><StatusPill s={u.status} /></td>
                    <td className="td text-xs text-slate-500">{fmtDateLong(u.lastChange)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Drawer open={!!sel} onClose={() => setSelected(null)} title={sel?.name} subtitle={sel && `${deptName(sel.departmentId)} · ${sel.version}`}>
        {sel && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => nav(`/mapa?ura=${sel.id}`)}><GitBranch className="h-4 w-4" /> Abrir mapa</button>
              <button className="btn-secondary" onClick={() => { setFilters({ departmentId: sel.departmentId, uraId: sel.id }); nav('/'); }}><LayoutDashboard className="h-4 w-4" /> Ver no dashboard</button>
              <button className="btn-secondary" onClick={() => setEditing(sel)}><Pencil className="h-4 w-4" /> Editar cadastro</button>
              {sel.userCreated && <button className="btn-danger" onClick={() => { if (confirm(`Remover "${sel.name}" do catálogo?`)) { removeUra(sel.id); setSelected(null); } }}><Trash2 className="h-4 w-4" /> Remover</button>}
            </div>
            {selStats ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Mini label="Entradas" v={fmtInt(selStats.t.entries)} />
                <Mini label="Desligamento" v={fmtPct(selStats.r.disconnectRate)} />
                <Mini label="Transferência" v={fmtPct(selStats.r.transferRate)} />
                <Mini label="Autosserviço" v={fmtPct(selStats.r.selfServiceRate)} />
                <Mini label="Tempo médio" v={fmtDuration(selStats.r.avgDuration)} />
                <Mini label="Falha de CPF" v={sel.requiresCpf ? fmtPct(selStats.r.authFailureRate) : 'N/A'} />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
                Sem dados para esta URA. URAs cadastradas manualmente passam a ter indicadores quando o fluxo for vinculado e a integração com a Genesys Cloud estiver ativa.
              </div>
            )}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Def k="Descrição" v={sel.description} />
              <Def k="Situação" v={<StatusPill s={sel.status} />} />
              <Def k="Horário" v={sel.businessHours} />
              <Def k="Responsável" v={sel.owner} />
              <Def k="Filas de destino" v={sel.queues.join(', ')} />
              <Def k="Identificação por CPF" v={sel.requiresCpf ? 'Sim' : 'Não'} />
              <Def k="ID do fluxo (Architect)" v={sel.genesysFlowId ? <code className="text-xs">{sel.genesysFlowId}</code> : 'Não vinculado'} />
              <Def k="Última alteração" v={`${fmtDateLong(sel.lastChange)} — ${sel.lastChangeNote}`} />
            </dl>
            <div>
              <h4 className="mb-2 text-sm font-semibold">Menu principal</h4>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Tecla</th><th>Opção</th><th>Tipo</th><th>Destino</th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sel.menu.map((m) => (
                    <tr key={m.key}><td className="py-1.5 font-mono">{m.key}</td><td>{m.label}</td><td>{m.kind === 'self' ? 'Autosserviço' : 'Transferência'}</td><td className="text-slate-500">{m.queue}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Drawer>

      {editing && <UraForm ura={editing} onClose={() => setEditing(null)} onSave={(u) => { saveUra(u); setEditing(null); }} />}
    </div>
  );
}

function StatusPill({ s }: { s: UraStatus }) {
  const cls = s === 'ativa' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : s === 'em-teste' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>{STATUS_LABEL[s]}</span>;
}
const Mini = ({ label, v }: { label: string; v: string }) => (
  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60"><div className="text-xs text-slate-500">{label}</div><div className="text-lg font-semibold">{v}</div></div>
);
const Def = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div><dt className="text-xs text-slate-500">{k}</dt><dd className="mt-0.5">{v}</dd></div>
);

function newUra(departmentId: string): Ura {
  return {
    id: `ura-user-${Date.now().toString(36)}`, name: '', departmentId, genesysFlowId: null, version: 'v1.0', status: 'em-teste',
    description: '', businessHours: 'Seg–Sex 08h–18h', queues: [], lastChange: new Date().toISOString().slice(0, 10),
    lastChangeNote: 'Cadastro inicial', owner: '', requiresCpf: true, menu: [], userCreated: true, baseVolume: 0,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function UraForm({ ura, onClose, onSave }: { ura: Ura; onClose: () => void; onSave: (u: Ura) => void }) {
  const { departments } = useApp();
  const [f, setF] = useState<Ura>(ura);
  const [queues, setQueues] = useState(ura.queues.join(', '));
  const [err, setErr] = useState<string | null>(null);
  const isNew = !!ura.userCreated && !ura.name;
  const set = <K extends keyof Ura>(k: K, v: Ura[K]) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => {
    if (!f.name.trim()) return setErr('Informe o nome da URA.');
    if (f.genesysFlowId && !UUID_RE.test(f.genesysFlowId.trim())) return setErr('O ID do fluxo deve estar no formato UUID (ex.: 1a2b3c4d-....). Copie-o do Architect.');
    onSave({ ...f, name: f.name.trim(), genesysFlowId: f.genesysFlowId?.trim() || null, queues: queues.split(',').map((x) => x.trim()).filter(Boolean) });
  };
  return (
    <Modal open onClose={onClose} title={isNew ? 'Cadastrar nova URA' : `Editar: ${ura.name}`}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={submit}>Salvar</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Nome *"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="URA Consórcio — Vendas" /></Field></div>
        <Field label="Departamento">
          <select className="input" value={f.departmentId} disabled={!ura.userCreated} onChange={(e) => set('departmentId', e.target.value)}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Situação">
          <select className="input" value={f.status} onChange={(e) => set('status', e.target.value as UraStatus)}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="ID do fluxo no Architect (opcional)" hint="Somente referência cadastral. O vínculo só terá efeito quando a integração somente leitura estiver configurada.">
            <input className="input font-mono" value={f.genesysFlowId ?? ''} onChange={(e) => set('genesysFlowId', e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
          </Field>
        </div>
        <Field label="Versão"><input className="input" value={f.version} onChange={(e) => set('version', e.target.value)} /></Field>
        <Field label="Responsável"><input className="input" value={f.owner} onChange={(e) => set('owner', e.target.value)} /></Field>
        <Field label="Horário de funcionamento"><input className="input" value={f.businessHours} onChange={(e) => set('businessHours', e.target.value)} /></Field>
        {ura.userCreated && (
          <Field label="Filas de destino" hint="Separe por vírgula"><input className="input" value={queues} onChange={(e) => setQueues(e.target.value)} /></Field>
        )}
        <div className="sm:col-span-2"><Field label="Descrição"><textarea className="input" rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field></div>
        {ura.userCreated && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={f.requiresCpf} onChange={(e) => set('requiresCpf', e.target.checked)} /> Possui identificação por CPF
            <InfoTip text="Define se a URA terá indicadores de falha de identificação (dependem de Milestones no Architect)." />
          </label>
        )}
      </div>
      {!ura.userCreated && <p className="mt-3 text-xs text-slate-500">URAs do catálogo simulado: departamento, filas e menu são fixos neste protótipo.</p>}
      {err && <p className="mt-3 text-sm text-red-600" role="alert">{err}</p>}
    </Modal>
  );
}
