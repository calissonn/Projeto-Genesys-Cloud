import clsx from 'clsx';
import { CheckCircle2, CircleDashed, Loader2, Pencil, Plus, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GoalsModal } from '../components/GoalsModal';
import { Card, CardHeader, EmptyState, Field, Modal, PageHeader, Segmented } from '../components/ui';
import { useApp } from '../context/AppContext';
import type { Department, Ura } from '../data/types';
import { fmtInt } from '../lib/format';
import { BACKEND, api, enc } from '../services/api';
import type { Queue } from '../services/dataProvider';

type Tab = 'departamentos' | 'uras' | 'filas' | 'usuarios' | 'metas' | 'instrumentacao' | 'integracao';

const PROFILES = [
  { id: 'admin', label: 'Administrador', desc: 'Acesso completo, inclusive usuários e integração.' },
  { id: 'analista_cx', label: 'Analista CX', desc: 'Indicadores, análises, relatórios, cadastros, metas, regras e testes.' },
  { id: 'supervisor', label: 'Supervisor', desc: 'Indicadores e relatórios dos seus departamentos; trata ocorrências e testes.' },
  { id: 'gestor', label: 'Gestor', desc: 'Visão executiva consolidada (somente leitura) e auditoria.' },
] as const;

const MATRIX: [string, string, boolean[]][] = [
  ['Ver indicadores, mapas e relatórios', 'metrics:read', [true, true, true, true]],
  ['Cadastros (departamentos, URAs, filas)', 'catalog:write', [true, true, false, false]],
  ['Metas e regras de alerta', 'rules:write', [true, true, false, false]],
  ['Tratar ocorrências', 'occurrences:write', [true, true, true, false]],
  ['Registrar testes', 'tests:write', [true, true, true, false]],
  ['Histórico de alterações', 'changes:write', [true, true, false, false]],
  ['Auditoria', 'audit:read', [true, true, false, true]],
  ['Ver integração', 'integration:read', [true, true, false, false]],
  ['Gerenciar integração e instrumentação', 'integration:manage', [true, false, false, false]],
  ['Gerenciar usuários e perfis', 'users:manage', [true, false, false, false]],
];

const ROLES: { id: string; label: string }[] = [
  { id: 'etapa', label: 'Etapa da jornada' },
  { id: 'cpf_tentativa', label: 'Tentativa de identificação (CPF)' },
  { id: 'cpf_falha', label: 'Falha de identificação (CPF)' },
  { id: 'cpf_excedido', label: 'Tentativas excedidas' },
  { id: 'autosservico', label: 'Autosserviço (outcome)' },
  { id: 'erro_integracao', label: 'Erro de integração' },
  { id: 'erro_api', label: 'Falha de consulta de API' },
  { id: 'erro_fluxo', label: 'Erro de fluxo' },
  { id: 'opcao_invalida', label: 'Opção inválida' },
  { id: 'transferencia_falha', label: 'Transferência malsucedida' },
];

export function Admin() {
  const { can } = useApp();
  const tabs: { value: Tab; label: string; show: boolean }[] = [
    { value: 'departamentos', label: 'Departamentos', show: true },
    { value: 'uras', label: 'URAs e fluxos', show: true },
    { value: 'filas', label: 'Filas', show: true },
    { value: 'usuarios', label: 'Usuários e perfis', show: true },
    { value: 'metas', label: 'Metas', show: true },
    { value: 'instrumentacao', label: 'Instrumentação', show: can('integration:read') },
    { value: 'integracao', label: 'Integração', show: can('integration:read') },
  ];
  const [tab, setTab] = useState<Tab>('departamentos');
  return (
    <div>
      <PageHeader title="Administração"
        description="Cadastros, usuários e perfis de acesso, metas, mapeamento da instrumentação do Architect e situação da integração com a Genesys Cloud."
        actions={<Link to="/historico" className="btn-secondary">Histórico e auditoria</Link>} />
      {!BACKEND && (
        <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <b>Modo protótipo:</b> os cadastros vêm dos dados simulados e ficam neste navegador. Para administrar dados reais (usuários, perfis, cadastros, integração),
          execute com o backend (<code>VITE_DATA_SOURCE=backend</code>) — ver <code>docs/DEPLOY.md</code>.
        </div>
      )}
      <div className="mb-5 overflow-x-auto"><Segmented value={tab} onChange={setTab} options={tabs.filter((t) => t.show)} /></div>
      {tab === 'departamentos' && <Departments />}
      {tab === 'uras' && <UrasTab />}
      {tab === 'filas' && <Queues />}
      {tab === 'usuarios' && <Users />}
      {tab === 'metas' && <GoalsTab />}
      {tab === 'instrumentacao' && <Instrumentation />}
      {tab === 'integracao' && <IntegrationLive />}
    </div>
  );
}

function Departments() {
  const { departments, uras, can, saveDepartment, removeDepartment } = useApp();
  const [editing, setEditing] = useState<(Department & { active?: boolean }) | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const editable = BACKEND && can('catalog:write');
  return (
    <Card>
      <CardHeader title="Departamentos" subtitle={`${departments.length} cadastrado(s)`}
        actions={editable && <button className="btn-primary" onClick={() => { setIsNew(true); setEditing({ id: '', name: '', short: '', active: true }); }}><Plus className="h-4 w-4" /> Novo departamento</button>} />
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="th">Departamento</th><th className="th">Nome curto</th><th className="th">Identificador</th><th className="th text-right">URAs</th><th className="th">Situação</th>{editable && <th className="th" />}</tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {departments.map((d) => {
            const n = uras.filter((u) => u.departmentId === d.id).length;
            const active = (d as Department & { active?: boolean }).active !== false;
            return (
              <tr key={d.id}>
                <td className="td font-medium">{d.name}</td><td className="td">{d.short}</td><td className="td"><code className="text-xs">{d.id}</code></td>
                <td className="td text-right tabular-nums">{n}</td><td className="td">{active ? 'Ativo' : 'Inativo'}</td>
                {editable && <td className="td"><div className="flex justify-end gap-1">
                  <button className="btn-ghost p-1.5" title="Editar" onClick={() => { setIsNew(false); setEditing({ ...d, active }); }}><Pencil className="h-4 w-4" /></button>
                  <button className="btn-ghost p-1.5" title={n ? 'Há URAs vinculadas' : 'Excluir'} disabled={n > 0} onClick={() => confirm(`Excluir "${d.name}"?`) && removeDepartment(d.id)}><Trash2 className="h-4 w-4 text-red-500" /></button>
                </div></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={isNew ? 'Novo departamento' : `Editar: ${editing.name}`}
          footer={<><button className="btn-secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="btn-primary" onClick={async () => {
            if (!/^[a-z0-9-]{2,60}$/.test(editing.id)) return setErr('Identificador: letras minúsculas, números e hífen (ex.: cartoes).');
            if (!editing.name.trim()) return setErr('Informe o nome.');
            try { await saveDepartment({ ...editing, short: editing.short || editing.name }); setEditing(null); } catch (e) { setErr((e as Error).message); }
          }}>Salvar</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Identificador"><input className="input" disabled={!isNew} value={editing.id} onChange={(e) => setEditing({ ...editing, id: e.target.value.toLowerCase() })} placeholder="ex.: cartoes" /></Field>
            <Field label="Nome"><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Nome curto"><input className="input" value={editing.short} onChange={(e) => setEditing({ ...editing, short: e.target.value })} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={editing.active !== false} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Ativo</label>
          </div>
          {err && <p className="mt-3 text-sm text-red-600" role="alert">{err}</p>}
        </Modal>
      )}
    </Card>
  );
}

interface GenesysFlow { id: string; name: string; type: string; publishedVersion: string | null; linkedUraId: string | null }

function UrasTab() {
  const { uras, departments, can, saveUra } = useApp();
  const [flows, setFlows] = useState<GenesysFlow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => {
    if (BACKEND && can('integration:read')) api<GenesysFlow[]>('GET', '/api/genesys/flows').then(setFlows).catch((e) => setErr(e.message));
  }, [can]);
  const editable = can('catalog:write');
  const link = async (u: Ura, flowId: string | null) => {
    setSaving(u.id);
    setErr(null);
    try {
      await saveUra({ ...u, genesysFlowId: flowId });
      if (BACKEND) setFlows((f) => f?.map((x) => ({ ...x, linkedUraId: x.id === flowId ? u.id : x.linkedUraId === u.id ? null : x.linkedUraId })) ?? null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(null);
    }
  };
  return (
    <Card>
      <CardHeader title="URAs e vínculo com fluxos do Architect"
        subtitle={BACKEND ? 'Escolha o fluxo de entrada (INBOUNDCALL) sincronizado da Genesys para cada URA. Os dados só são coletados para fluxos vinculados.' : 'No protótipo, o ID do fluxo é apenas cadastral.'}
        actions={<Link to="/uras" className="btn-secondary">Catálogo completo</Link>} />
      {err && <p className="px-4 pt-3 text-sm text-red-600" role="alert">{err}</p>}
      {uras.length === 0 ? <EmptyState title="Nenhuma URA cadastrada" text="Cadastre URAs no Catálogo de URAs." action={<Link to="/uras" className="btn-primary">Abrir catálogo</Link>} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="th">URA</th><th className="th">Departamento</th><th className="th">Fluxo vinculado</th><th className="th">Situação</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {uras.map((u) => (
                <tr key={u.id}>
                  <td className="td font-medium">{u.name}</td>
                  <td className="td">{departments.find((d) => d.id === u.departmentId)?.name ?? u.departmentId}</td>
                  <td className="td">
                    {BACKEND && flows && editable ? (
                      <div className="flex items-center gap-2">
                        <select className="input max-w-sm" value={u.genesysFlowId ?? ''} disabled={saving === u.id} onChange={(e) => link(u, e.target.value || null)}>
                          <option value="">— não vinculado —</option>
                          {flows.map((f) => <option key={f.id} value={f.id} disabled={!!f.linkedUraId && f.linkedUraId !== u.id}>{f.name}{f.publishedVersion ? ` (v${f.publishedVersion})` : ''}{f.linkedUraId && f.linkedUraId !== u.id ? ' — em uso' : ''}</option>)}
                        </select>
                        {saving === u.id && <Loader2 className="h-4 w-4 animate-spin" />}
                      </div>
                    ) : u.genesysFlowId ? <code className="text-xs">{u.genesysFlowId}</code> : <span className="text-slate-400">Não vinculado</span>}
                  </td>
                  <td className="td">{u.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {BACKEND && flows?.length === 0 && <p className="px-4 py-3 text-sm text-slate-500">Nenhum fluxo sincronizado. Execute a sincronização de dicionários na aba Integração.</p>}
        </div>
      )}
    </Card>
  );
}

function Queues() {
  const { queues, departments, can, saveQueue, removeQueue } = useApp();
  const [editing, setEditing] = useState<Queue | null>(null);
  const editable = BACKEND && can('catalog:write');
  return (
    <Card>
      <CardHeader title="Filas" subtitle="Filas de destino das transferências. Filas sincronizadas da Genesys podem ser associadas a um departamento."
        actions={editable && <button className="btn-primary" onClick={() => setEditing({ id: `fila-${Date.now().toString(36)}`, name: '', departmentId: null, source: 'manual' })}><Plus className="h-4 w-4" /> Nova fila</button>} />
      {queues.length === 0 ? <EmptyState title="Nenhuma fila" /> : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="th">Fila</th><th className="th">Departamento</th><th className="th">Origem</th>{editable && <th className="th" />}</tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {queues.map((q) => (
              <tr key={q.id}>
                <td className="td font-medium">{q.name}</td>
                <td className="td">{departments.find((d) => d.id === q.departmentId)?.name ?? '—'}</td>
                <td className="td text-xs">{q.source === 'genesys' ? 'Genesys Cloud' : 'Cadastro manual'}</td>
                {editable && <td className="td"><div className="flex justify-end gap-1">
                  <button className="btn-ghost p-1.5" title="Editar" onClick={() => setEditing(q)}><Pencil className="h-4 w-4" /></button>
                  {q.source === 'manual' && <button className="btn-ghost p-1.5" title="Excluir" onClick={() => confirm(`Excluir a fila "${q.name}"?`) && removeQueue(q.id)}><Trash2 className="h-4 w-4 text-red-500" /></button>}
                </div></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.name ? `Editar: ${editing.name}` : 'Nova fila'}
          footer={<><button className="btn-secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="btn-primary" disabled={!editing.name.trim()} onClick={async () => { try { await saveQueue(editing); setEditing(null); } catch { /* exibido no aviso */ } }}>Salvar</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome"><input className="input" value={editing.name} disabled={editing.source === 'genesys'} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Departamento"><select className="input" value={editing.departmentId ?? ''} onChange={(e) => setEditing({ ...editing, departmentId: e.target.value || null })}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          </div>
        </Modal>
      )}
    </Card>
  );
}

interface UserRow { id: string; email: string; name: string; profile: string; active: boolean; departments: string[]; lastLogin: string | null }

function Users() {
  const { can, departments, user } = useApp();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const manage = BACKEND && can('users:manage');
  const load = useCallback(() => { if (manage) api<UserRow[]>('GET', '/api/users').then(setUsers).catch((e) => setErr(e.message)); }, [manage]);
  useEffect(load, [load]);
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Perfis de acesso" subtitle="Permissões aplicadas pelo servidor em cada requisição." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="th">Permissão</th>{PROFILES.map((p) => <th key={p.id} className="th text-center" title={p.desc}>{p.label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {MATRIX.map(([label, , flags]) => (
                <tr key={label}><td className="td">{label}</td>{flags.map((f, i) => <td key={i} className="td text-center">{f ? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" aria-label="sim" /> : <span className="text-slate-300" aria-label="não">—</span>}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="grid gap-2 p-4 text-xs text-slate-600 sm:grid-cols-2 dark:text-slate-300">
          {PROFILES.map((p) => <li key={p.id}><b>{p.label}:</b> {p.desc}</li>)}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Usuários" subtitle={manage ? 'O acesso é feito pelo login corporativo (SSO); aqui se define o perfil de cada pessoa.' : 'Gestão de usuários disponível para administradores com o backend ativo.'}
          actions={manage && <button className="btn-primary" onClick={() => setEditing({ id: `u-${Date.now().toString(36)}`, email: '', name: '', profile: 'analista_cx', active: true, departments: [], lastLogin: null })}><Plus className="h-4 w-4" /> Novo usuário</button>} />
        {err && <p className="px-4 pt-3 text-sm text-red-600" role="alert">{err}</p>}
        {!manage ? <EmptyState title="Indisponível neste modo" text={BACKEND ? 'Seu perfil não gerencia usuários.' : 'No protótipo existe apenas o usuário fictício (administrador).'} /> : !users ? <div className="p-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="th">Nome</th><th className="th">E-mail</th><th className="th">Perfil</th><th className="th">Departamentos</th><th className="th">Último acesso</th><th className="th">Situação</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((u) => (
                <tr key={u.id} className={u.active ? '' : 'opacity-60'}>
                  <td className="td font-medium">{u.name}{u.id === user?.id && <span className="ml-1 text-xs text-slate-500">(você)</span>}</td><td className="td">{u.email}</td>
                  <td className="td">{PROFILES.find((p) => p.id === u.profile)?.label}</td>
                  <td className="td text-xs">{u.profile === 'supervisor' ? u.departments.map((d) => departments.find((x) => x.id === d)?.short ?? d).join(', ') : 'Todos'}</td>
                  <td className="td text-xs text-slate-500">{u.lastLogin ? new Date(u.lastLogin).toLocaleString('pt-BR') : 'Nunca'}</td>
                  <td className="td">{u.active ? 'Ativo' : 'Inativo'}</td>
                  <td className="td"><button className="btn-ghost p-1.5" title="Editar" onClick={() => setEditing(u)}><Pencil className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {editing && <UserForm u={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function UserForm({ u, onClose, onSaved }: { u: UserRow; onClose: () => void; onSaved: () => void }) {
  const { departments } = useApp();
  const [f, setF] = useState(u);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr(null);
    if (!f.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return setErr('Informe nome e e-mail corporativo válidos.');
    if (f.profile === 'supervisor' && !f.departments.length) return setErr('Selecione ao menos um departamento para o supervisor.');
    setBusy(true);
    try {
      await api('PUT', `/api/users/${enc(f.id)}`, { email: f.email.trim(), name: f.name.trim(), profile: f.profile, active: f.active, departments: f.profile === 'supervisor' ? f.departments : [] });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={u.email ? `Editar: ${u.name}` : 'Novo usuário'}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Salvar</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="E-mail corporativo (login SSO)"><input className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Perfil"><select className="input" value={f.profile} onChange={(e) => setF({ ...f, profile: e.target.value })}>{PROFILES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Ativo</label>
        {f.profile === 'supervisor' && (
          <div className="sm:col-span-2">
            <span className="label">Departamentos do supervisor</span>
            <div className="grid gap-1 sm:grid-cols-2">
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.departments.includes(d.id)} onChange={(e) => setF({ ...f, departments: e.target.checked ? [...f.departments, d.id] : f.departments.filter((x) => x !== d.id) })} /> {d.name}</label>
              ))}
            </div>
          </div>
        )}
      </div>
      {err && <p className="mt-3 text-sm text-red-600" role="alert">{err}</p>}
    </Modal>
  );
}

function GoalsTab() {
  const { goals, can } = useApp();
  const [open, setOpen] = useState(false);
  const rows: [string, string][] = [
    ['Desligamento — atenção / crítico', `${goals.disconnectWarn}% / ${goals.disconnectCrit}%`],
    ['Desligamento por etapa — atenção / crítico', `${goals.stepDisconnectWarn}% / ${goals.stepDisconnectCrit}%`],
    ['Meta de autosserviço', `≥ ${goals.selfServiceTarget}%`],
    ['Transferência máxima', `≤ ${goals.transferMax}%`],
    ['Falha de CPF — atenção / crítico', `${goals.authFailureWarn}% / ${goals.authFailureCrit}%`],
  ];
  return (
    <Card>
      <CardHeader title="Metas e classificação" subtitle="Usadas em todo o sistema para classificar situações de atenção e críticas."
        actions={can('goals:write') && <button className="btn-primary" onClick={() => setOpen(true)}><Pencil className="h-4 w-4" /> Editar metas</button>} />
      <table className="w-full text-sm"><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map(([k, v]) => <tr key={k}><td className="td">{k}</td><td className="td text-right font-semibold tabular-nums">{v}</td></tr>)}
      </tbody></table>
      {open && <GoalsModal onClose={() => setOpen(false)} />}
    </Card>
  );
}

interface Instr { id: string; name: string; description: string | null; role: string | null; uraId: string | null }

function Instrumentation() {
  const { can, uras } = useApp();
  const [items, setItems] = useState<{ milestone: Instr[]; outcome: Instr[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const manage = can('integration:manage');
  useEffect(() => {
    if (!BACKEND) return;
    Promise.all([api<Instr[]>('GET', '/api/genesys/milestones'), api<Instr[]>('GET', '/api/genesys/outcomes')])
      .then(([milestone, outcome]) => setItems({ milestone, outcome })).catch((e) => setErr(e.message));
  }, []);
  const set = async (kind: 'milestone' | 'outcome', it: Instr, role: string | null, uraId: string | null) => {
    setErr(null);
    try {
      await api('PUT', `/api/instrumentation/${kind}/${enc(it.id)}`, { role, uraId });
      setItems((p) => p && { ...p, [kind]: p[kind].map((x) => (x.id === it.id ? { ...x, role, uraId } : x)) });
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const intro = (
    <p className="px-4 pt-3 text-sm text-slate-600 dark:text-slate-300">
      Cada Milestone/Outcome criado no Architect precisa ter um <b>papel</b> para virar indicador: por exemplo, a milestone “CPF_Falha” → <i>Falha de identificação (CPF)</i>;
      o outcome “Segunda via” → <i>Autosserviço</i>. Sem esse mapeamento, o indicador aparece como “sem instrumentação”.
    </p>
  );
  if (!BACKEND) return <Card><CardHeader title="Instrumentação do Architect" />{intro}<EmptyState title="Disponível com o backend" text="As Milestones e os Outcomes são sincronizados da Genesys (somente leitura) pelo backend." /></Card>;
  return (
    <Card>
      <CardHeader title="Instrumentação do Architect" subtitle="Milestones e Outcomes sincronizados da Genesys (somente leitura) e o significado de cada um no sistema." />
      {intro}
      {err && <p className="px-4 pt-2 text-sm text-red-600" role="alert">{err}</p>}
      {!items ? <div className="p-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : (['milestone', 'outcome'] as const).map((kind) => (
        <div key={kind} className="mt-3">
          <h4 className="px-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{kind === 'milestone' ? `Milestones (${items.milestone.length})` : `Outcomes (${items.outcome.length})`}</h4>
          {items[kind].length === 0 ? <p className="px-4 py-2 text-sm text-slate-500">Nenhum item sincronizado.</p> : (
            <table className="mt-1 w-full text-sm">
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items[kind].map((it) => (
                  <tr key={it.id}>
                    <td className="td"><div className="font-medium">{it.name}</div>{it.description && <div className="text-xs text-slate-500">{it.description}</div>}</td>
                    <td className="td w-72">
                      <select className="input" disabled={!manage} value={it.role ?? ''} onChange={(e) => set(kind, it, e.target.value || null, it.uraId)}>
                        <option value="">— sem papel —</option>
                        {ROLES.filter((r) => (kind === 'outcome' ? true : r.id !== 'autosservico')).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </td>
                    <td className="td w-64">
                      <select className="input" disabled={!manage || !it.role} value={it.uraId ?? ''} onChange={(e) => set(kind, it, it.role, e.target.value || null)}>
                        <option value="">Todas as URAs</option>{uras.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      <div className="h-3" />
    </Card>
  );
}

interface Status {
  configured: boolean; region: string | null; flows: number; milestones: number; outcomes: number; queues: number; linkedUras: number; factRows: number;
  dataFrom: string | null; dataTo: string | null; backfillPending: number; scheduler: { enabled: boolean; incrementalMinutes: number };
  clientStats: { requests: number; retries: number; rateLimited: number; errors: number } | null;
}
interface Run { id: string; collector: string; from: string | null; to: string | null; startedAt: string; finishedAt: string | null; status: string; rows: number | null; error: string | null; triggeredBy: string }

/** Situação ao vivo da integração (somente no modo backend). */
export function IntegrationLive() {
  const { can, reload } = useApp();
  const [st, setSt] = useState<Status | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const load = useCallback(() => {
    if (!BACKEND) return;
    api<Status>('GET', '/api/integration/status').then(setSt).catch((e) => setErr(e.message));
    api<Run[]>('GET', '/api/integration/runs').then(setRuns).catch(() => undefined);
  }, []);
  useEffect(load, [load]);
  if (!BACKEND) return <Card><EmptyState title="Integração não configurada" text="No modo protótipo não há chamadas à Genesys. Veja os requisitos na tela Integração Genesys." action={<Link to="/integracao" className="btn-secondary">Abrir Integração Genesys</Link>} /></Card>;
  const run = async (kind: string) => {
    setBusy(kind);
    setErr(null);
    try {
      const r = await api<{ status: string }>('POST', '/api/integration/sync', { kind, days: kind === 'backfill' ? days : undefined });
      if (r.status === 'concluida') reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
      load();
    }
  };
  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          {st?.configured ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <XCircle className="h-6 w-6 text-red-500" />}
          <div className="flex-1">
            <div className="font-semibold">{st ? (st.configured ? 'Integração configurada (somente leitura)' : 'Integração não configurada no servidor') : 'Carregando…'}</div>
            <div className="text-xs text-slate-500">{st?.region ? `Região: ${st.region}` : 'Credenciais OAuth ficam apenas no servidor.'}{st && ` · Agendador ${st.scheduler.enabled ? `ativo (a cada ${st.scheduler.incrementalMinutes} min)` : 'desativado'}`}</div>
          </div>
          <button className="btn-ghost" onClick={load}><RefreshCw className="h-4 w-4" /> Atualizar</button>
        </div>
        {err && <p className="mt-3 text-sm text-red-600" role="alert">{err}</p>}
        {st && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {([['Fluxos', st.flows], ['URAs vinculadas', st.linkedUras], ['Milestones', st.milestones], ['Outcomes', st.outcomes], ['Filas', st.queues], ['Linhas de fatos', st.factRows], ['Janelas pendentes', st.backfillPending], ['HTTP 429 tratados', st.clientStats?.rateLimited ?? 0]] as [string, number][]).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60"><div className="text-xs text-slate-500">{k}</div><div className="text-lg font-semibold tabular-nums">{fmtInt(v)}</div></div>
            ))}
          </div>
        )}
        {st?.dataFrom && <p className="mt-3 text-xs text-slate-500">Dados coletados de {new Date(st.dataFrom).toLocaleString('pt-BR')} até {new Date(st.dataTo!).toLocaleString('pt-BR')}.</p>}
      </Card>
      {can('integration:manage') && st?.configured && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold">Executar coleta (consultas somente leitura à Genesys)</h3>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <button className="btn-secondary" disabled={!!busy} onClick={() => run('dicionarios')}>{busy === 'dicionarios' && <Loader2 className="h-4 w-4 animate-spin" />} Sincronizar dicionários</button>
            <button className="btn-secondary" disabled={!!busy} onClick={() => run('incremental')}>{busy === 'incremental' && <Loader2 className="h-4 w-4 animate-spin" />} Coletar últimas horas</button>
            <Field label="Histórico (dias)"><input type="number" min={1} max={400} className="input w-28" value={days} onChange={(e) => setDays(Number(e.target.value))} /></Field>
            <button className="btn-secondary" disabled={!!busy} onClick={() => run('backfill')}>{busy === 'backfill' && <Loader2 className="h-4 w-4 animate-spin" />} Carregar histórico</button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Cargas longas continuam em segundo plano; acompanhe abaixo. Janelas com falha são retomadas automaticamente na próxima execução.</p>
        </Card>
      )}
      <Card>
        <CardHeader title="Execuções recentes" />
        {runs.length === 0 ? <EmptyState title="Nenhuma execução registrada" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="th">Início</th><th className="th">Coleta</th><th className="th">Status</th><th className="th text-right">Linhas</th><th className="th">Origem</th><th className="th">Erro</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="td whitespace-nowrap text-xs">{new Date(r.startedAt).toLocaleString('pt-BR')}</td>
                    <td className="td">{r.collector}</td>
                    <td className="td"><span className={clsx('inline-flex items-center gap-1 text-xs font-medium', r.status === 'ok' ? 'text-emerald-700' : r.status === 'erro' ? 'text-red-600' : 'text-slate-500')}>
                      {r.status === 'running' ? <CircleDashed className="h-3.5 w-3.5 animate-spin" /> : r.status === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}{r.status === 'running' ? 'em execução' : r.status}</span></td>
                    <td className="td text-right tabular-nums">{r.rows ?? '—'}</td>
                    <td className="td text-xs">{r.triggeredBy}</td>
                    <td className="td max-w-xs truncate text-xs text-red-600" title={r.error ?? ''}>{r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
