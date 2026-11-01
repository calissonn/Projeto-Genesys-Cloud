import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEPARTMENTS, URAS } from '../data/catalog';
import { buildChangeLog } from '../data/changeLog';
import { seedTests } from '../data/testSeed';
import type { AlertOccurrence, AlertRule, AuditEntry, Goals, TestCase, Ura, UraChange } from '../data/types';
import { DEFAULT_RULES, detectFailureAnomalies, evaluateRules, sevRank, type OccurrenceOverride } from '../lib/alertEngine';
import { addDays, todayISO } from '../lib/dates';
import { previousRange, type Range, type RecordStore } from '../lib/metrics';
import { usePersistentState } from '../lib/storage';
import { activeProvider } from '../services/dataProvider';

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
  departments: typeof DEPARTMENTS;
  uras: Ura[];
  saveUra: (u: Ura) => void;
  removeUra: (id: string) => void;
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  range: Range;
  prevRange: Range;
  store: RecordStore | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  goals: Goals;
  setGoals: (g: Goals) => void;
  rules: AlertRule[];
  saveRule: (r: AlertRule) => void;
  deleteRule: (id: string) => void;
  occurrences: AlertOccurrence[];
  updateOccurrence: (id: string, patch: { status?: AlertOccurrence['status']; owner?: string; note?: string }) => void;
  dataSource: { kind: string; label: string };
  audit: AuditEntry[];
  logAction: (action: string, entity: string, entityId?: string, details?: string) => void;
  tests: TestCase[];
  saveTest: (t: TestCase) => void;
  deleteTest: (id: string) => void;
  changes: UraChange[];
  saveChange: (c: UraChange) => void;
}

/** Usuário do protótipo — substituído pelo usuário autenticado (SSO) na Etapa 3. */
export const CURRENT_USER = 'Você (protótipo)';

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = usePersistentState<'light' | 'dark'>('gui-theme',
    () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const [audit, setAudit] = usePersistentState<AuditEntry[]>('gui-audit', []);
  const logAction = useCallback((action: string, entity: string, entityId?: string, details?: string) => {
    setAudit((prev) => [{ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), user: CURRENT_USER, action, entity, entityId, details }, ...prev].slice(0, 1000));
  }, [setAudit]);

  const [customUras, setCustomUras] = usePersistentState<Ura[]>('gui-custom-uras', []);
  const [uraEdits, setUraEdits] = usePersistentState<Record<string, Partial<Ura>>>('gui-ura-edits', {});
  const uras = useMemo(
    () => [...URAS.map((u) => ({ ...u, ...(uraEdits[u.id] ?? {}) })), ...customUras],
    [customUras, uraEdits],
  );
  const saveUra = useCallback((u: Ura) => {
    if (u.userCreated) {
      setCustomUras((prev) => (prev.some((x) => x.id === u.id) ? prev.map((x) => (x.id === u.id ? u : x)) : [...prev, u]));
    } else {
      // Para URAs do catálogo simulado, só campos cadastrais podem ser editados.
      const { name, genesysFlowId, status, owner, description, businessHours, version } = u;
      setUraEdits((prev) => ({ ...prev, [u.id]: { name, genesysFlowId, status, owner, description, businessHours, version } }));
    }
    logAction('URA salva', 'URA', u.id, u.name);
  }, [setCustomUras, setUraEdits, logAction]);
  const removeUra = useCallback((id: string) => {
    setCustomUras((prev) => prev.filter((u) => u.id !== id));
    logAction('URA removida', 'URA', id);
  }, [setCustomUras, logAction]);

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

  const [store, setStore] = useState<RecordStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    activeProvider
      .load(URAS)
      .then((s) => alive && setStore(s))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [reloadKey]);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const [storedGoals, setGoalsState] = usePersistentState<Goals>('gui-goals', DEFAULT_GOALS);
  const setGoals = useCallback((g: Goals) => {
    setGoalsState(g);
    logAction('Metas alteradas', 'Metas', undefined, Object.entries(g).map(([k, v]) => `${k}=${v}`).join(', '));
  }, [setGoalsState, logAction]);
  const goals = useMemo(() => ({ ...DEFAULT_GOALS, ...storedGoals }), [storedGoals]);

  const [rules, setRules] = usePersistentState<AlertRule[]>('gui-alert-rules', DEFAULT_RULES);
  const saveRule = useCallback((r: AlertRule) => {
    setRules((prev) => (prev.some((x) => x.id === r.id) ? prev.map((x) => (x.id === r.id ? r : x)) : [r, ...prev]));
    logAction('Regra de alerta salva', 'Regra', r.id, `${r.name} (${r.enabled ? 'ativa' : 'pausada'})`);
  }, [setRules, logAction]);
  const deleteRule = useCallback((id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    logAction('Regra de alerta excluída', 'Regra', id);
  }, [setRules, logAction]);

  const [overrides, setOverrides] = usePersistentState<Record<string, OccurrenceOverride>>('gui-occ-overrides', {});
  const occurrences = useMemo(
    () => (store
      ? [...evaluateRules(rules, store, uras, { overrides }), ...detectFailureAnomalies(store, uras, { overrides })]
        .sort((a, b) => (a.date === b.date ? sevRank(b.severity) - sevRank(a.severity) : a.date < b.date ? 1 : -1))
      : []),
    [store, rules, uras, overrides],
  );
  const updateOccurrence = useCallback<AppState['updateOccurrence']>((id, patch) => {
    setOverrides((prev) => {
      const cur = occurrences.find((o) => o.id === id);
      const base: OccurrenceOverride = prev[id] ?? { status: cur?.status ?? 'aberta', owner: cur?.owner, history: [] };
      const events = [...base.history];
      const at = new Date().toISOString().slice(0, 16);
      if (patch.status && patch.status !== base.status) events.push({ at, by: 'Você', text: `Status alterado para "${STATUS_TEXT[patch.status]}".` });
      if (patch.owner && patch.owner !== base.owner) events.push({ at, by: 'Você', text: `Responsável definido: ${patch.owner}.` });
      if (patch.note) events.push({ at, by: 'Você', text: patch.note });
      return { ...prev, [id]: { status: patch.status ?? base.status, owner: patch.owner ?? base.owner, history: events } };
    });
    logAction('Ocorrência atualizada', 'Ocorrência', id, [patch.status && `status: ${STATUS_TEXT[patch.status]}`, patch.owner && `responsável: ${patch.owner}`, patch.note && `comentário: ${patch.note}`].filter(Boolean).join('; '));
  }, [occurrences, setOverrides, logAction]);

  const [tests, setTests] = usePersistentState<TestCase[]>('gui-tests', seedTests);
  const saveTest = useCallback((t: TestCase) => {
    setTests((prev) => (prev.some((x) => x.id === t.id) ? prev.map((x) => (x.id === t.id ? t : x)) : [t, ...prev]));
    logAction('Teste salvo', 'Teste', t.id, `${t.title} — ${t.status}`);
  }, [setTests, logAction]);
  const deleteTest = useCallback((id: string) => {
    setTests((prev) => prev.filter((t) => t.id !== id));
    logAction('Teste excluído', 'Teste', id);
  }, [setTests, logAction]);

  const [userChanges, setUserChanges] = usePersistentState<UraChange[]>('gui-ura-changes', []);
  const changes = useMemo(
    () => [...userChanges, ...buildChangeLog(URAS)].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [userChanges],
  );
  const saveChange = useCallback((c: UraChange) => {
    setUserChanges((prev) => (prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [c, ...prev]));
    logAction('Alteração de URA registrada', 'Histórico', c.uraId, `${c.version}: ${c.description}`);
  }, [setUserChanges, logAction]);

  const value: AppState = {
    theme,
    toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    departments: DEPARTMENTS,
    uras,
    saveUra,
    removeUra,
    filters,
    setFilters,
    range,
    prevRange,
    store,
    loading,
    error,
    reload,
    goals,
    setGoals,
    rules,
    saveRule,
    deleteRule,
    occurrences,
    updateOccurrence,
    dataSource: { kind: activeProvider.kind, label: activeProvider.label },
    audit,
    logAction,
    tests,
    saveTest,
    deleteTest,
    changes,
    saveChange,
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
