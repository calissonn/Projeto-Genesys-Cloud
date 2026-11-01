import clsx from 'clsx';
import { CheckCircle2, Clock, Copy, FileUp, ListChecks, Paperclip, Pencil, Plus, Search, Trash2, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Card, CardHeader, Drawer, EmptyState, Field, Modal, PageHeader } from '../components/ui';
import { CURRENT_USER, useApp } from '../context/AppContext';
import { TEST_SCENARIOS } from '../data/testSeed';
import type { TestCase, TestEvidence, TestStatus } from '../data/types';
import { fmtDateLong, todayISO } from '../lib/dates';

const STATUS: Record<TestStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  aprovado: { label: 'Aprovado', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900', Icon: CheckCircle2 },
  reprovado: { label: 'Reprovado', cls: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900', Icon: XCircle },
  pendente: { label: 'Pendente', cls: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900', Icon: Clock },
};
const MAX_FILE = 300 * 1024;

function StatusBadge({ s }: { s: TestStatus }) {
  const { label, cls, Icon } = STATUS[s];
  return <span className={clsx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', cls)}><Icon className="h-3 w-3" />{label}</span>;
}

const newId = () => `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

export function Tests() {
  const { tests, uras, saveTest, deleteTest } = useApp();
  const [q, setQ] = useState('');
  const [ura, setUra] = useState('all');
  const [status, setStatus] = useState<'all' | TestStatus>('all');
  const [editing, setEditing] = useState<TestCase | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const uraName = (id: string) => uras.find((u) => u.id === id)?.name ?? id;

  const filtered = tests.filter((t) => (ura === 'all' || t.uraId === ura) && (status === 'all' || t.status === status)
    && (!q || `${t.title} ${t.scenario} ${t.owner} ${t.version} ${uraName(t.uraId)}`.toLowerCase().includes(q.toLowerCase())));

  // Agrupamento por URA + versão
  const groups = useMemo(() => {
    const m = new Map<string, TestCase[]>();
    for (const t of filtered) {
      const k = `${t.uraId}|${t.version}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return Array.from(m.entries()).sort((a, b) => {
      const da = a[1].reduce((x, t) => (t.date > x ? t.date : x), '');
      const db = b[1].reduce((x, t) => (t.date > x ? t.date : x), '');
      return da < db ? 1 : -1;
    });
  }, [filtered]); // eslint-disable-line react-hooks/exhaustive-deps

  const viewTest = tests.find((t) => t.id === viewing) ?? null;
  const total = { aprovado: 0, reprovado: 0, pendente: 0 } as Record<TestStatus, number>;
  tests.forEach((t) => total[t.status]++);

  const blank = (): TestCase => ({
    id: newId(), uraId: ura !== 'all' ? ura : uras[0].id, version: '', scenario: TEST_SCENARIOS[0], title: '', steps: '', expected: '', obtained: '',
    status: 'pendente', owner: '', date: todayISO(), evidences: [], history: [],
  });

  return (
    <div>
      <PageHeader title="Gestão de testes das URAs"
        description="Registre os testes funcionais antes de publicar alterações. Os testes ficam organizados por URA e versão, com evidências e histórico."
        actions={<>
          <button className="btn-secondary" onClick={() => setPlanOpen(true)}><ListChecks className="h-4 w-4" /> Gerar roteiro padrão</button>
          <button className="btn-primary" onClick={() => setEditing(blank())}><Plus className="h-4 w-4" /> Novo teste</button>
        </>} />

      <div className="mb-5 grid grid-cols-3 gap-3">
        {(Object.keys(STATUS) as TestStatus[]).map((s) => (
          <button key={s} onClick={() => setStatus(status === s ? 'all' : s)} className={clsx('card p-3 text-left', status === s && 'ring-2 ring-brand-500')}>
            <div className="text-xs text-slate-500">{STATUS[s].label}</div>
            <div className="text-2xl font-semibold">{total[s]}</div>
          </button>
        ))}
      </div>

      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3 p-3">
          <label className="relative min-w-[220px] flex-1">
            <span className="label">Pesquisar</span>
            <Search className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-slate-400" />
            <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título, cenário, responsável, versão…" />
          </label>
          <label className="min-w-[220px]"><span className="label">URA</span>
            <select className="input" value={ura} onChange={(e) => setUra(e.target.value)}><option value="all">Todas</option>{uras.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </label>
          <label><span className="label">Status</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="all">Todos</option><option value="aprovado">Aprovado</option><option value="reprovado">Reprovado</option><option value="pendente">Pendente</option></select>
          </label>
        </div>
      </Card>

      {groups.length === 0 ? <Card><EmptyState title="Nenhum teste encontrado" text="Cadastre um teste ou gere o roteiro padrão para uma versão." /></Card> : (
        <div className="space-y-5">
          {groups.map(([key, list]) => {
            const [uraId, version] = key.split('|');
            const c = { aprovado: 0, reprovado: 0, pendente: 0 } as Record<TestStatus, number>;
            list.forEach((t) => c[t.status]++);
            const ready = c.reprovado === 0 && c.pendente === 0;
            return (
              <Card key={key}>
                <CardHeader title={<>{uraName(uraId)} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium dark:bg-slate-800">{version}</span></>}
                  subtitle={`${list.length} teste(s) · ${c.aprovado} aprovado(s) · ${c.reprovado} reprovado(s) · ${c.pendente} pendente(s)`}
                  actions={<span className={clsx('rounded-full px-2.5 py-1 text-xs font-semibold', ready ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300')}>
                    {ready ? '✓ Todos os testes aprovados' : c.reprovado ? `✕ ${c.reprovado} reprovado(s) — não recomendado publicar` : '… testes pendentes'}
                  </span>} />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="th">Cenário</th><th className="th">Teste</th><th className="th">Status</th><th className="th">Responsável</th><th className="th">Data</th><th className="th">Evid.</th><th className="th text-right">Ações</th></tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {list.map((t) => (
                        <tr key={t.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => setViewing(t.id)}>
                          <td className="td text-xs text-slate-500">{t.scenario}</td>
                          <td className="td font-medium">{t.title}</td>
                          <td className="td"><StatusBadge s={t.status} /></td>
                          <td className="td">{t.owner}</td>
                          <td className="td whitespace-nowrap text-slate-500">{fmtDateLong(t.date)}</td>
                          <td className="td">{t.evidences.length ? <span className="inline-flex items-center gap-1 text-xs"><Paperclip className="h-3 w-3" />{t.evidences.length}</span> : <span className="text-xs text-slate-400">—</span>}</td>
                          <td className="td" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              <button className="btn-ghost p-1.5" title="Editar" onClick={() => setEditing(t)}><Pencil className="h-4 w-4" /></button>
                              <button className="btn-ghost p-1.5" title="Reexecutar em nova versão" onClick={() => setEditing({ ...t, id: newId(), version: '', status: 'pendente', obtained: '', evidences: [], history: [], date: todayISO() })}><Copy className="h-4 w-4" /></button>
                              <button className="btn-ghost p-1.5" title="Excluir" onClick={() => confirm(`Excluir o teste "${t.title}"?`) && deleteTest(t.id)}><Trash2 className="h-4 w-4 text-red-500" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && <TestForm test={editing} existing={tests.some((t) => t.id === editing.id)} onClose={() => setEditing(null)} onSave={(t) => { saveTest(t); setEditing(null); }} />}
      {viewTest && <TestDrawer t={viewTest} uraName={uraName(viewTest.uraId)} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewTest); setViewing(null); }} />}
      {planOpen && <PlanModal onClose={() => setPlanOpen(false)} />}
    </div>
  );
}

function TestForm({ test, existing, onClose, onSave }: { test: TestCase; existing: boolean; onClose: () => void; onSave: (t: TestCase) => void }) {
  const { uras } = useApp();
  const [f, setF] = useState<TestCase>(test);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof TestCase>(k: K, v: TestCase[K]) => setF((p) => ({ ...p, [k]: v }));
  const ura = uras.find((u) => u.id === f.uraId);

  const addFile = (file: File) => {
    if (file.size > MAX_FILE) return setErr(`"${file.name}" tem ${(file.size / 1024).toFixed(0)} KB. No protótipo o limite é 300 KB por arquivo (na Etapa 3 as evidências irão para armazenamento de arquivos).`);
    const reader = new FileReader();
    reader.onload = () => setF((p) => ({ ...p, evidences: [...p.evidences, { id: newId(), name: file.name, kind: file.type.startsWith('image/') ? 'imagem' : 'arquivo', content: String(reader.result), addedAt: new Date().toISOString() }] }));
    reader.onerror = () => setErr('Não foi possível ler o arquivo.');
    reader.readAsDataURL(file);
  };
  const submit = () => {
    if (!f.title.trim() || !f.version.trim() || !f.expected.trim() || !f.owner.trim()) return setErr('Preencha título, versão, comportamento esperado e responsável.');
    if (f.status !== 'pendente' && !f.obtained.trim()) return setErr('Informe o resultado obtido para marcar como aprovado ou reprovado.');
    const at = new Date().toISOString().slice(0, 16);
    const history = [...f.history];
    if (!existing) history.push({ at, by: CURRENT_USER, text: `Teste registrado com status "${STATUS[f.status].label}".` });
    else if (test.status !== f.status) history.push({ at, by: CURRENT_USER, text: `Status alterado de "${STATUS[test.status].label}" para "${STATUS[f.status].label}".` });
    else history.push({ at, by: CURRENT_USER, text: 'Teste atualizado.' });
    if (f.evidences.length > test.evidences.length) history.push({ at, by: CURRENT_USER, text: `${f.evidences.length - test.evidences.length} evidência(s) adicionada(s).` });
    onSave({ ...f, title: f.title.trim(), version: f.version.trim(), owner: f.owner.trim(), history });
  };
  return (
    <Modal open wide onClose={onClose} title={existing ? `Editar teste: ${test.title}` : 'Novo teste'}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={submit}>Salvar teste</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="URA"><select className="input" value={f.uraId} onChange={(e) => set('uraId', e.target.value)}>{uras.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        <Field label="Versão testada *" hint={ura ? `Versão atual cadastrada: ${ura.version}` : undefined}><input className="input" value={f.version} onChange={(e) => set('version', e.target.value)} placeholder={ura?.version} /></Field>
        <Field label="Cenário"><select className="input" value={f.scenario} onChange={(e) => set('scenario', e.target.value)}>{TEST_SCENARIOS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Título *"><input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="Passos do teste"><textarea className="input" rows={3} value={f.steps} onChange={(e) => set('steps', e.target.value)} placeholder={'1. Ligar para…\n2. Digitar…'} /></Field></div>
        <Field label="Comportamento esperado *"><textarea className="input" rows={3} value={f.expected} onChange={(e) => set('expected', e.target.value)} /></Field>
        <Field label="Resultado obtido"><textarea className="input" rows={3} value={f.obtained} onChange={(e) => set('obtained', e.target.value)} /></Field>
        <Field label="Status">
          <div className="flex gap-2">
            {(Object.keys(STATUS) as TestStatus[]).map((s) => (
              <button key={s} type="button" onClick={() => set('status', s)} className={clsx('flex-1 rounded-lg border px-2 py-2 text-xs font-medium', f.status === s ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200' : 'border-slate-200 dark:border-slate-700')}>{STATUS[s].label}</button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Responsável *"><input className="input" value={f.owner} onChange={(e) => set('owner', e.target.value)} /></Field>
          <Field label="Data"><input type="date" className="input" value={f.date} max={todayISO()} onChange={(e) => e.target.value && set('date', e.target.value)} /></Field>
        </div>
        <div className="sm:col-span-2">
          <span className="label">Evidências</span>
          <div className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
            {f.evidences.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-sm">
                <Paperclip className="h-4 w-4 text-slate-400" />
                <span className="flex-1 truncate">{e.kind === 'texto' ? e.content : e.name}</span>
                <button type="button" className="btn-ghost p-1" onClick={() => set('evidences', f.evidences.filter((x) => x.id !== e.id))} aria-label="Remover evidência"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <input className="input flex-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Evidência em texto (ex.: ID da conversa de teste, horário, observação)" />
              <button type="button" className="btn-secondary" disabled={!note.trim()} onClick={() => { set('evidences', [...f.evidences, { id: newId(), name: 'Nota', kind: 'texto', content: note.trim(), addedAt: new Date().toISOString() } as TestEvidence]); setNote(''); }}>Adicionar nota</button>
              <label className="btn-secondary cursor-pointer"><FileUp className="h-4 w-4" /> Anexar arquivo
                <input type="file" className="hidden" accept="image/*,.pdf,.txt,.log" onChange={(e) => { const file = e.target.files?.[0]; if (file) addFile(file); e.target.value = ''; }} />
              </label>
            </div>
            <p className="text-[11px] text-slate-500">Não anexe gravações nem dados pessoais reais de clientes. Use massa de teste. Limite de 300 KB por arquivo no protótipo.</p>
          </div>
        </div>
      </div>
      {err && <p className="mt-3 text-sm text-red-600" role="alert">{err}</p>}
    </Modal>
  );
}

function TestDrawer({ t, uraName, onClose, onEdit }: { t: TestCase; uraName: string; onClose: () => void; onEdit: () => void }) {
  return (
    <Drawer open onClose={onClose} title={t.title} subtitle={`${uraName} · ${t.version} · ${t.scenario}`}>
      <div className="space-y-5 text-sm">
        <div className="flex items-center gap-2"><StatusBadge s={t.status} /><span className="text-slate-500">{t.owner} · {fmtDateLong(t.date)}</span><button className="btn-secondary ml-auto py-1.5 text-xs" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /> Editar</button></div>
        {t.steps && <Block title="Passos"><pre className="whitespace-pre-wrap font-sans">{t.steps}</pre></Block>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Block title="Comportamento esperado">{t.expected}</Block>
          <Block title="Resultado obtido">{t.obtained || <span className="text-slate-400">Ainda não executado</span>}</Block>
        </div>
        <Block title={`Evidências (${t.evidences.length})`}>
          {t.evidences.length === 0 ? <span className="text-slate-400">Nenhuma evidência.</span> : (
            <ul className="space-y-2">
              {t.evidences.map((e) => (
                <li key={e.id}>
                  {e.kind === 'texto' ? <span>📝 {e.content}</span>
                    : e.kind === 'imagem' ? <figure><img src={e.content} alt={e.name} className="max-h-60 rounded border border-slate-200 dark:border-slate-700" /><figcaption className="text-xs text-slate-500">{e.name}</figcaption></figure>
                      : <a href={e.content} download={e.name} className="text-brand-600 hover:underline">{e.name}</a>}
                </li>
              ))}
            </ul>
          )}
        </Block>
        <Block title="Histórico">
          <ol className="space-y-2 border-l-2 border-slate-200 pl-4 dark:border-slate-700">
            {t.history.map((h, i) => <li key={i}><div className="text-xs text-slate-500">{h.at.replace('T', ' ')} · {h.by}</div>{h.text}</li>)}
          </ol>
        </Block>
      </div>
    </Drawer>
  );
}

const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4><div>{children}</div></div>
);

/** Gera testes pendentes para os cenários padrão de uma URA/versão (sem duplicar). */
function PlanModal({ onClose }: { onClose: () => void }) {
  const { uras, tests, saveTest } = useApp();
  const [uraId, setUraId] = useState(uras[0].id);
  const ura = uras.find((u) => u.id === uraId)!;
  const [version, setVersion] = useState(ura.version);
  const [owner, setOwner] = useState('');
  const scenarios = TEST_SCENARIOS.filter((s) => s !== 'Outro' && (ura.requiresCpf || !/CPF|tentativas/i.test(s)));
  const exists = (s: string) => tests.some((t) => t.uraId === uraId && t.version === version && t.scenario === s);
  const todo = scenarios.filter((s) => !exists(s));
  const create = () => {
    todo.forEach((s, i) => saveTest({
      id: `${newId()}-${i}`, uraId, version, scenario: s, title: s, steps: '', expected: '', obtained: '', status: 'pendente',
      owner: owner.trim() || ura.owner, date: todayISO(), evidences: [], history: [{ at: new Date().toISOString().slice(0, 16), by: CURRENT_USER, text: 'Criado pelo roteiro padrão.' }],
    }));
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Gerar roteiro padrão de testes"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={!todo.length || !version.trim()} onClick={create}>Criar {todo.length} teste(s) pendente(s)</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="URA"><select className="input" value={uraId} onChange={(e) => { setUraId(e.target.value); setVersion(uras.find((u) => u.id === e.target.value)!.version); }}>{uras.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        <Field label="Versão"><input className="input" value={version} onChange={(e) => setVersion(e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="Responsável"><input className="input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder={ura.owner} /></Field></div>
      </div>
      <ul className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
        {scenarios.map((s) => <li key={s} className={exists(s) ? 'text-slate-400 line-through' : ''}>{exists(s) ? '✓' : '○'} {s}</li>)}
      </ul>
      <p className="mt-3 text-xs text-slate-500">Cenários já existentes para esta versão não são duplicados. Preencha o comportamento esperado de cada teste antes de executá-lo.</p>
    </Modal>
  );
}
