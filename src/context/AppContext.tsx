import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEPARTMENTS, URAS } from '../data/catalog';
import { buildChangeLog } from '../data/changeLog';
import { seedTests } from '../data/testSeed';
import type { AlertOccurrence, AlertRule, AuditEntry, Department, Goals, TestCase, Ura, UraChange } from '../data/types';
import { DEFAULT_RULES, detectFailureAnomalies, evaluateRules, sevRank, type OccurrenceOverride } from '../lib/alertEngine';
import { addDays, todayISO } from '../lib/dates';
import { previousRange, type Range, type RecordStore } from '../lib/metrics';
import { usePersistentState } from '../lib/storage';
import { useCollection } from '../lib/useCollection';
import { BACKEND, api, enc } from '../services/api';
import { activeProvider, type Availability, type CurrentUser, type Queue } from '../services/dataProvider';

export type PeriodPreset = 'hoje' | 'ontem' | '7d' | '30d' | '90d' | 'mes' | 'custom';

export interface Filters {
  preset: PeriodPreset;
  from: string;
  to: string;
  departmentId: string;
  uraId: string;
}

export const PRESET_LABELS: Record<PeriodPreset, string> = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  mes: 'Mês atual',
  custom: 'Personalizado',
};

export function presetRange(p: PeriodPreset, custom?: Range): Range {
  const t = todayISO();
  switch (p) {
    case 'hoje': return { from: t, to: t };
    case 'ontem': return { from: addDays(t, -1), to: addDays(t, -1) };
    case '7d': return { from: addDays(t, -6), to: t };
    case '30d': return { from: addDays(t, -29), to: t };
    case '90d': return { from: addDays(t, -89), to: t };
    case 'mes': return { from: `${t.slice(0, 8)}01`, to: t };
    case 'custom': return custom ?? { from: addDays(t, -6), to: t };
  }
}

export const DEFAULT_GOALS: Goals = {
  disconnectWarn: 15,
  disconnectCrit: 20,
  selfServiceTarget: 30,
  transferMax: 55,
  authFailureWarn: 16,
  authFailureCrit: 22,
  stepDisconnectWarn: 6,
  stepDisconnectCrit: 12,
};

interface AppState {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  /** Usuário atual (no protótipo: administrador fictício). */
  user: CurrentUser | null;
  can: (permission: string) => boolean;
  departments: Department[];
  queues: Queue[];
  uras: Ura[];
  saveUra: (u: Ura) => Promise<void>;
  removeUra: (id: string) => Promise<void>;
  saveDepartment: (d: Department & { active?: boolean }) => Promise<void>;
  removeDepartment: (id: string) => Promise<void>;
  saveQueue: (q: Queue) => Promise<void>;
  removeQueue: (id: string) => Promise<void>;
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  range: Range;
  prevRange: Range;
  store: RecordStore | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  availability: Availability | null;
  goals: Goals;
  setGoals: (g: Goals) => void;
  rules: AlertRule[];
  saveRule: (r: AlertRule) => void;
  deleteRule: (id: string) => void;
  occurrences: AlertOccurrence[];
  updateOccurrence: (id: string, patch: { status?: AlertOccurrence['status']; owner?: string; note?: string }) => void;
  dataSource: { kind: string; label: string };
  audit: AuditEntry[];
  refreshAudit: () => void;
  logAction: (action: string, entity: string, entityId?: string, details?: string) => void;
  tests: TestCase[];
  saveTest: (t: TestCase) => void;
  deleteTest: (id: string) => void;
  changes: UraChange[];
  saveChange: (c: UraChange) => void;
  /** Mensagem de erro de uma operação (ex.: falha ao salvar no servidor). */
  notice: string | null;
  clearNotice: () => void;
}

/** Nome exibido nos históricos gravados pelo navegador. */
export let CURRENT_USER = 'Você (protótipo)';

const Ctx = createContext<AppState | null>(null);

type OccState = OccurrenceOverride & { id: string };

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = usePersistentState<'light' | 'dark'>('gui-theme',
    () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const [notice, setNotice] = useState<string | null>(null);
  const report = useCallback((m: string) => setNotice(m), []);

  // ───── Carga principal (dados, catálogo, usuário) ─────
  const [store, setStore] = useState<RecordStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [baseDepartments, setDepartments] = useState<Department[]>(DEPARTMENTS);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [baseUras, setBaseUras] = useState<Ura[]>(BACKEND ? [] : URAS);
  const [availability, setAvailability] = useState<Availability | null>(null);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    activeProvider
      .load()
      .then((r) => {
        if (!alive) return;
        setStore(r.store);
        setUser(r.user);
        CURRENT_USER = BACKEND ? r.user.name : 'Você (protótipo)';
        setDepartments(r.departments);
        setQueues(r.queues);
        setBaseUras(r.uras);
        setAvailability(r.availability);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        // Na primeira carga a tela de erro já é exibida; nas seguintes, um aviso mantém a tela atual.
        setStore((cur) => {
          if (cur) setNotice(`atualização dos dados falhou — ${msg}`);
          return cur;
        });
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [reloadKey]);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const can = useCallback((p: string) => !!user?.permissions.includes(p), [user]);

  // ───── Auditoria ─────
  const [localAudit, setLocalAudit] = usePersistentState<AuditEntry[]>('gui-audit', []);
  const [remoteAudit, setRemoteAudit] = useState<AuditEntry[]>([]);
  const refreshAudit = useCallback(() => {
    if (BACKEND) api<AuditEntry[]>('GET', '/api/audit').then(setRemoteAudit).catch((e) => report(e.message));
  }, [report]);
  const logAction = useCallback((action: string, entity: string, entityId?: string, details?: string) => {
    if (BACKEND) {
      // O servidor audita as alterações. Do navegador só seguem eventos sem rota própria (ex.: exportações).
      if (action === 'Relatório exportado' || action === 'Auditoria exportada') api('POST', '/api/audit/events', { action, entity, entityId, details }).catch(() => undefined);
      return;
    }
    setLocalAudit((prev) => [{ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), user: CURRENT_USER, action, entity, entityId, details }, ...prev].slice(0, 1000));
  }, [setLocalAudit]);
  const audit = BACKEND ? remoteAudit : localAudit;

  // ───── Catálogo (URAs, departamentos, filas) ─────
  const [customUras, setCustomUras] = usePersistentState<Ura[]>('gui-custom-uras', []);
  const [uraEdits, setUraEdits] = usePersistentState<Record<string, Partial<Ura>>>('gui-ura-edits', {});
  const uras = useMemo(
    () => (BACKEND ? baseUras : [...baseUras.map((u) => ({ ...u, ...(uraEdits[u.id] ?? {}) })), ...customUras]),
    [baseUras, customUras, uraEdits],
  );
  const saveUra = useCallback(async (u: Ura) => {
    if (BACKEND) {
      try {
        await api('PUT', `/api/uras/${enc(u.id)}`, {
          departmentId: u.departmentId, name: u.name, genesysFlowId: u.genesysFlowId || null, version: u.version, status: u.status,
          requiresCpf: u.requiresCpf, businessHours: u.businessHours, owner: u.owner, description: u.description, queues: u.queues,
        });
        setBaseUras((p) => (p.some((x) => x.id === u.id) ? p.map((x) => (x.id === u.id ? { ...u, userCreated: false } : x)) : [...p, { ...u, userCreated: false }]));
      } catch (e) {
        report((e as Error).message);
        throw e;
      }
      return;
    }
    if (u.userCreated) {
      setCustomUras((prev) => (prev.some((x) => x.id === u.id) ? prev.map((x) => (x.id === u.id ? u : x)) : [...prev, u]));
    } else {
      // Para URAs do catálogo simulado, só campos cadastrais podem ser editados.
      const { name, genesysFlowId, status, owner, description, businessHours, version } = u;
      setUraEdits((prev) => ({ ...prev, [u.id]: { name, genesysFlowId, status, owner, description, businessHours, version } }));
    }
    logAction('URA salva', 'URA', u.id, u.name);
  }, [setCustomUras, setUraEdits, logAction, report]);
  const removeUra = useCallback(async (id: string) => {
    if (BACKEND) {
      try {
        await api('DELETE', `/api/uras/${enc(id)}`);
        setBaseUras((p) => p.filter((u) => u.id !== id));
      } catch (e) {
        report((e as Error).message);
      }
      return;
    }
    setCustomUras((prev) => prev.filter((u) => u.id !== id));
    logAction('URA removida', 'URA', id);
  }, [setCustomUras, logAction, report]);

  const departments = baseDepartments;
  const saveDepartment = useCallback(async (d: Department & { active?: boolean }) => {
    if (!BACKEND) return;
    try {
      await api('PUT', `/api/departments/${enc(d.id)}`, { name: d.name, short: d.short, active: d.active ?? true });
      setDepartments((p) => (p.some((x) => x.id === d.id) ? p.map((x) => (x.id === d.id ? d : x)) : [...p, d]));
    } catch (e) {
      report((e as Error).message);
      throw e;
    }
  }, [report]);
  const removeDepartment = useCallback(async (id: string) => {
    if (!BACKEND) return;
    try {
      await api('DELETE', `/api/departments/${enc(id)}`);
      setDepartments((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      report((e as Error).message);
    }
  }, [report]);
  const saveQueue = useCallback(async (q: Queue) => {
    if (!BACKEND) return;
    try {
      await api('PUT', `/api/queues/${enc(q.id)}`, { name: q.name, departmentId: q.departmentId });
      setQueues((p) => (p.some((x) => x.id === q.id) ? p.map((x) => (x.id === q.id ? q : x)) : [...p, q]));
    } catch (e) {
      report((e as Error).message);
      throw e;
    }
  }, [report]);
  const removeQueue = useCallback(async (id: string) => {
    if (!BACKEND) return;
    try {
      await api('DELETE', `/api/queues/${enc(id)}`);
      setQueues((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      report((e as Error).message);
    }
  }, [report]);

  // ───── Filtros ─────
  const [filters, setFiltersState] = usePersistentState<Filters>('gui-filters', () => ({
    preset: '7d', ...presetRange('7d'), departmentId: 'all', uraId: 'all',
  }));
  const setFilters = useCallback((f: Partial<Filters>) => {
    setFiltersState((prev) => {
      const next = { ...prev, ...f };
      if (f.preset && f.preset !== 'custom') Object.assign(next, presetRange(f.preset));
      if (f.departmentId && f.departmentId !== prev.departmentId && !('uraId' in f)) next.uraId = 'all';
      return next;
    });
  }, [setFiltersState]);
  // Presets relativos são recalculados a cada carregamento (ex.: "Hoje" muda de data).
  const range = useMemo<Range>(
    () => (filters.preset === 'custom' ? { from: filters.from, to: filters.to } : presetRange(filters.preset)),
    [filters.preset, filters.from, filters.to],
  );
  const prevRange = useMemo(() => previousRange(range), [range]);

  // ───── Metas ─────
  const [localGoals, setLocalGoals] = usePersistentState<Goals>('gui-goals', DEFAULT_GOALS);
  const [remoteGoals, setRemoteGoals] = useState<Goals | null>(null);
  useEffect(() => {
    if (BACKEND) api<Goals | null>('GET', '/api/settings/goals').then((g) => g && setRemoteGoals(g)).catch(() => undefined);
  }, [reloadKey]);
  const setGoals = useCallback((g: Goals) => {
    if (BACKEND) {
      const prev = remoteGoals;
      setRemoteGoals(g);
      api('PUT', '/api/settings/goals', g).catch((e) => { setRemoteGoals(prev); report(e.message); });
      return;
    }
    setLocalGoals(g);
    logAction('Metas alteradas', 'Metas', undefined, Object.entries(g).map(([k, v]) => `${k}=${v}`).join(', '));
  }, [setLocalGoals, logAction, remoteGoals, report]);
  const goals = useMemo(() => ({ ...DEFAULT_GOALS, ...(BACKEND ? remoteGoals ?? {} : localGoals) }), [localGoals, remoteGoals]);

  // ───── Regras e ocorrências ─────
  const rulesC = useCollection<AlertRule>('rules', 'gui-alert-rules', DEFAULT_RULES, report);
  const rules = rulesC.items;
  const saveRule = useCallback((r: AlertRule) => {
    rulesC.save(r);
    logAction('Regra de alerta salva', 'Regra', r.id, `${r.name} (${r.enabled ? 'ativa' : 'pausada'})`);
  }, [rulesC, logAction]);
  const deleteRule = useCallback((id: string) => {
    rulesC.remove(id);
    logAction('Regra de alerta excluída', 'Regra', id);
  }, [rulesC, logAction]);

  const occC = useCollection<OccState>('occurrence-states', 'gui-occ-states', () => {
    // Migra o formato da Etapa 2 (objeto por id) para lista.
    try {
      const old = JSON.parse(localStorage.getItem('gui-occ-overrides') ?? '{}') as Record<string, OccurrenceOverride>;
      return Object.entries(old).map(([id, v]) => ({ id, ...v }));
    } catch {
      return [];
    }
  }, report);
  const overrides = useMemo(() => Object.fromEntries(occC.items.map((o) => [o.id, o])), [occC.items]);
  const occurrences = useMemo(
    () => (store
      ? [...evaluateRules(rules, store, uras, { overrides }), ...detectFailureAnomalies(store, uras, { overrides })]
        .sort((a, b) => (a.date === b.date ? sevRank(b.severity) - sevRank(a.severity) : a.date < b.date ? 1 : -1))
      : []),
    [store, rules, uras, overrides],
  );
  const updateOccurrence = useCallback<AppState['updateOccurrence']>((id, patch) => {
    const cur = occurrences.find((o) => o.id === id);
    const base: OccurrenceOverride = overrides[id] ?? { status: cur?.status ?? 'aberta', owner: cur?.owner, history: [] };
    const events = [...base.history];
    const at = new Date().toISOString().slice(0, 16);
    if (patch.status && patch.status !== base.status) events.push({ at, by: CURRENT_USER, text: `Status alterado para "${STATUS_TEXT[patch.status]}".` });
    if (patch.owner && patch.owner !== base.owner) events.push({ at, by: CURRENT_USER, text: `Responsável definido: ${patch.owner}.` });
    if (patch.note) events.push({ at, by: CURRENT_USER, text: patch.note });
    occC.save({ id, status: patch.status ?? base.status, owner: patch.owner ?? base.owner, history: events });
    logAction('Ocorrência atualizada', 'Ocorrência', id, [patch.status && `status: ${STATUS_TEXT[patch.status]}`, patch.owner && `responsável: ${patch.owner}`, patch.note && `comentário: ${patch.note}`].filter(Boolean).join('; '));
  }, [occurrences, overrides, occC, logAction]);

  // ───── Testes e histórico de alterações ─────
  const testsC = useCollection<TestCase>('tests', 'gui-tests', seedTests, report);
  const saveTest = useCallback((t: TestCase) => {
    testsC.save(t);
    logAction('Teste salvo', 'Teste', t.id, `${t.title} — ${t.status}`);
  }, [testsC, logAction]);
  const deleteTest = useCallback((id: string) => {
    testsC.remove(id);
    logAction('Teste excluído', 'Teste', id);
  }, [testsC, logAction]);

  const changesC = useCollection<UraChange>('changes', 'gui-ura-changes', [], report);
  const changes = useMemo(
    () => [...changesC.items, ...(BACKEND ? [] : buildChangeLog(URAS))].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [changesC.items],
  );
  const saveChange = useCallback((c: UraChange) => {
    changesC.save(c);
    logAction('Alteração de URA registrada', 'Histórico', c.uraId, `${c.version}: ${c.description}`);
  }, [changesC, logAction]);

  const value: AppState = {
    theme,
    toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    user,
    can,
    departments,
    queues,
    uras,
    saveUra,
    removeUra,
    saveDepartment,
    removeDepartment,
    saveQueue,
    removeQueue,
    filters,
    setFilters,
    range,
    prevRange,
    store,
    loading,
    error,
    reload,
    availability,
    goals,
    setGoals,
    rules,
    saveRule,
    deleteRule,
    occurrences,
    updateOccurrence,
    dataSource: { kind: activeProvider.kind, label: activeProvider.label },
    audit,
    refreshAudit,
    logAction,
    tests: testsC.items,
    saveTest,
    deleteTest,
    changes,
    saveChange,
    notice,
    clearNotice: () => setNotice(null),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const STATUS_TEXT: Record<AlertOccurrence['status'], string> = {
  aberta: 'Aberta',
  em_analise: 'Em análise',
  resolvida: 'Resolvida',
  descartada: 'Descartada (falso positivo)',
};

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp deve ser usado dentro de AppProvider');
  return c;
}
