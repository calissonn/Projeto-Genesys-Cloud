/**
 * Motor de avaliação de regras de alerta.
 *
 * Avaliação DIÁRIA por URA (a granularidade pode ser reduzida para janelas
 * horárias quando houver dados em tempo quase real da Genesys Cloud).
 * Mecanismos contra falsos positivos:
 *  - volume mínimo de entradas no dia;
 *  - filtro de horário de funcionamento (08h–20h);
 *  - linha de base com N dias anteriores (condições de variação);
 *  - no dia corrente, a linha de base considera apenas as mesmas horas já decorridas.
 */
import type { AlertOccurrence, AlertRule, OccurrenceEvent, OccurrenceStatus, Totals, Ura } from '../data/types';
import { addDays } from './dates';
import { RecordStore, emptyTotals, metricValue, sumTotals } from './metrics';

export interface OccurrenceOverride {
  status: OccurrenceStatus;
  owner?: string;
  history: OccurrenceEvent[];
}

function addInto(a: Totals, b: Totals) {
  (Object.keys(a) as (keyof Totals)[]).forEach((k) => (a[k] += b[k]));
}

export function evaluateRules(
  rules: AlertRule[],
  store: RecordStore,
  uras: Ura[],
  opts: { days?: number; endDate?: string; nowHour?: number; overrides?: Record<string, OccurrenceOverride> } = {},
): AlertOccurrence[] {
  const days = opts.days ?? 14;
  const end = opts.endDate ?? store.maxDate;
  const nowHour = opts.nowHour ?? new Date().getHours();
  const cache = new Map<string, Totals>();
  const dayTotals = (uraId: string, date: string, bh: boolean, maxHour?: number) => {
    const k = `${uraId}|${date}|${bh}|${maxHour ?? ''}`;
    let t = cache.get(k);
    if (!t) {
      t = sumTotals(store.query({ from: date, to: date }, new Set([uraId]), { businessHoursOnly: bh, maxHour }));
      cache.set(k, t);
    }
    return t;
  };

  const out: AlertOccurrence[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const scoped = uras.filter(
      (u) => !u.userCreated && (rule.uraId === 'all' ? rule.departmentId === 'all' || u.departmentId === rule.departmentId : u.id === rule.uraId),
    );
    for (const ura of scoped) {
      for (let i = days - 1; i >= 0; i--) {
        const date = addDays(end, -i);
        const isPartial = date === end;
        const maxHour = isPartial ? nowHour : undefined;
        const cur = dayTotals(ura.id, date, rule.businessHoursOnly, maxHour);
        if (cur.entries < rule.minVolume) continue;
        const value = metricValue(cur, rule.metric);
        let baseline: number | null = null;
        let fired = false;
        if (rule.condition === 'acima_de') fired = value > rule.threshold;
        else if (rule.condition === 'abaixo_de') fired = value < rule.threshold;
        else {
          const agg = emptyTotals();
          let n = 0;
          for (let b = 1; b <= rule.baselineDays; b++) {
            const t = dayTotals(ura.id, addDays(date, -b), rule.businessHoursOnly, maxHour);
            if (t.entries === 0) continue;
            addInto(agg, t);
            n++;
          }
          if (n === 0) continue;
          const isCount = rule.metric === 'integrationErrors' || rule.metric === 'failures' || rule.metric === 'entries';
          baseline = isCount ? metricValue(agg, rule.metric) / n : metricValue(agg, rule.metric);
          if (baseline <= 0) continue;
          const change = ((value - baseline) / baseline) * 100;
          fired = rule.condition === 'aumento_pct' ? change >= rule.threshold : -change >= rule.threshold;
        }
        if (!fired) continue;
        const id = `${rule.id}|${ura.id}|${date}`;
        const ov = opts.overrides?.[id];
        out.push({
          id,
          ruleId: rule.id,
          ruleName: rule.name,
          uraId: ura.id,
          departmentId: ura.departmentId,
          date,
          metric: rule.metric,
          value,
          baseline,
          threshold: rule.threshold,
          condition: rule.condition,
          severity: rule.severity,
          volume: cur.entries,
          status: ov?.status ?? (i > 6 ? 'resolvida' : 'aberta'),
          owner: ov?.owner ?? rule.owner,
          history: [
            { at: `${date}T${isPartial ? String(nowHour).padStart(2, '0') : '23'}:59`, by: 'Motor de alertas', text: 'Ocorrência gerada automaticamente pela regra.' },
            ...(i > 6 && !ov ? [{ at: `${addDays(date, 1)}T09:00`, by: 'Sistema (simulado)', text: 'Encerrada automaticamente: indicador voltou à normalidade.' }] : []),
            ...(ov?.history ?? []),
          ],
        });
      }
    }
  }
  return out.sort((a, b) => (a.date === b.date ? sevRank(b.severity) - sevRank(a.severity) : a.date < b.date ? 1 : -1));
}

export const sevRank = (s: string) => ({ baixa: 0, media: 1, alta: 2, critica: 3 })[s] ?? 0;

export const DEFAULT_RULES: AlertRule[] = [
  {
    id: 'r-desl-aumento', name: 'Aumento de desligamentos', metric: 'disconnectRate', condition: 'aumento_pct', threshold: 25,
    departmentId: 'all', uraId: 'all', severity: 'alta', owner: 'Equipe CX', enabled: true, minVolume: 200,
    businessHoursOnly: true, baselineDays: 7, createdAt: '2026-09-01',
  },
  {
    id: 'r-cpf-falhas', name: 'Crescimento das falhas de identificação por CPF', metric: 'authFailureRate', condition: 'aumento_pct', threshold: 40,
    departmentId: 'all', uraId: 'all', severity: 'critica', owner: 'Equipe CX', enabled: true, minVolume: 150,
    businessHoursOnly: true, baselineDays: 7, createdAt: '2026-09-01',
  },
  {
    id: 'r-ss-queda', name: 'Queda na conclusão de autosserviços', metric: 'selfServiceRate', condition: 'queda_pct', threshold: 12,
    departmentId: 'all', uraId: 'all', severity: 'media', owner: 'Equipe CX', enabled: true, minVolume: 200,
    businessHoursOnly: true, baselineDays: 7, createdAt: '2026-09-01',
  },
  {
    id: 'r-transf-aumento', name: 'Crescimento de transferências para atendimento humano', metric: 'transferRate', condition: 'aumento_pct', threshold: 15,
    departmentId: 'all', uraId: 'all', severity: 'media', owner: 'Supervisão', enabled: true, minVolume: 200,
    businessHoursOnly: true, baselineDays: 7, createdAt: '2026-09-01',
  },
  {
    id: 'r-integracao', name: 'Falha de integração — GazinBank', metric: 'integrationErrors', condition: 'acima_de', threshold: 40,
    departmentId: 'gazinbank', uraId: 'all', severity: 'critica', owner: 'Equipe GazinBank', enabled: true, minVolume: 100,
    businessHoursOnly: false, baselineDays: 7, createdAt: '2026-09-15',
  },
  {
    id: 'r-desl-meta', name: 'Desligamento acima da meta crítica', metric: 'disconnectRate', condition: 'acima_de', threshold: 20,
    departmentId: 'all', uraId: 'all', severity: 'alta', owner: 'Equipe CX', enabled: false, minVolume: 300,
    businessHoursOnly: true, baselineDays: 7, createdAt: '2026-10-01',
  },
];
