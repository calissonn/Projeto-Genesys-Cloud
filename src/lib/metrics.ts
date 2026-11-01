import type { HourRecord, MetricKey, Totals, Ura } from '../data/types';
import { addDays, diffDays, eachDay } from './dates';

export interface Range {
  from: string;
  to: string;
}

export interface Scope {
  departmentId: string; // 'all'
  uraId: string; // 'all'
}

/** Índice por data para consultas rápidas. */
export class RecordStore {
  private byDate = new Map<string, HourRecord[]>();
  readonly minDate: string;
  readonly maxDate: string;

  constructor(records: HourRecord[]) {
    let min = '9999-99-99';
    let max = '0000-00-00';
    for (const r of records) {
      let arr = this.byDate.get(r.date);
      if (!arr) this.byDate.set(r.date, (arr = []));
      arr.push(r);
      if (r.date < min) min = r.date;
      if (r.date > max) max = r.date;
    }
    this.minDate = min;
    this.maxDate = max;
  }

  query(range: Range, uraIds: Set<string> | null, opts?: { businessHoursOnly?: boolean; maxHour?: number }): HourRecord[] {
    const out: HourRecord[] = [];
    for (const d of eachDay(range.from, range.to)) {
      const arr = this.byDate.get(d);
      if (!arr) continue;
      for (const r of arr) {
        if (uraIds && !uraIds.has(r.uraId)) continue;
        if (opts?.businessHoursOnly && (r.hour < 8 || r.hour >= 20)) continue;
        if (opts?.maxHour != null && r.hour > opts.maxHour) continue;
        out.push(r);
      }
    }
    return out;
  }
}

/** Conjunto de URAs no escopo do filtro (null = todas). */
export function scopeUraIds(uras: Ura[], scope: Scope): Set<string> | null {
  if (scope.uraId !== 'all') return new Set([scope.uraId]);
  if (scope.departmentId !== 'all') return new Set(uras.filter((u) => u.departmentId === scope.departmentId).map((u) => u.id));
  return null;
}

export function emptyTotals(): Totals {
  return {
    entries: 0, unique: 0, uniqueDistinct: 0, disconnects: 0, transfers: 0, selfService: 0, otherExits: 0,
    durationSec: 0, authFailures: 0, authAttempts: 0, integrationErrors: 0, transferFailures: 0, queueAbandons: 0, failures: 0,
  };
}

/**
 * Soma registros. Observação sobre contagem:
 *  - `entries` soma entradas em fluxo (pode contar a mesma conversa mais de uma vez);
 *  - `unique` soma conversas distintas POR URA;
 *  - `uniqueDistinct` desconta conversas que já tinham passado por outra URA,
 *    evitando dupla contagem no consolidado de várias URAs.
 */
export function sumTotals(records: HourRecord[]): Totals {
  const t = emptyTotals();
  for (const r of records) {
    t.entries += r.entries;
    t.unique += r.unique;
    t.uniqueDistinct += r.unique - r.inherited;
    t.disconnects += r.disconnects;
    t.transfers += r.transfers;
    t.selfService += r.selfService;
    t.otherExits += r.otherExits;
    t.durationSec += r.durationSec;
    t.authFailures += r.authFailures;
    t.authAttempts += r.authAttempts;
    t.integrationErrors += r.integrationErrors;
    t.transferFailures += r.transferFailures;
    t.queueAbandons += r.queueAbandons;
  }
  t.failures = t.authFailures + t.integrationErrors + t.transferFailures;
  return t;
}

export interface Rates {
  disconnectRate: number;
  transferRate: number;
  selfServiceRate: number;
  otherRate: number;
  authFailureRate: number;
  avgDuration: number;
  queueAbandonRate: number;
}

export function rates(t: Totals): Rates {
  const e = t.entries || 0;
  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
  return {
    disconnectRate: pct(t.disconnects, e),
    transferRate: pct(t.transfers, e),
    selfServiceRate: pct(t.selfService, e),
    otherRate: pct(t.otherExits, e),
    authFailureRate: pct(t.authFailures, t.authAttempts),
    avgDuration: e ? t.durationSec / e : 0,
    queueAbandonRate: pct(t.queueAbandons, t.transfers),
  };
}

export function metricValue(t: Totals, m: MetricKey): number {
  const r = rates(t);
  switch (m) {
    case 'disconnectRate': return r.disconnectRate;
    case 'transferRate': return r.transferRate;
    case 'selfServiceRate': return r.selfServiceRate;
    case 'authFailureRate': return r.authFailureRate;
    case 'integrationErrors': return t.integrationErrors;
    case 'failures': return t.failures;
    case 'entries': return t.entries;
    case 'avgDuration': return r.avgDuration;
  }
}

export function groupBy<K extends string | number>(records: HourRecord[], key: (r: HourRecord) => K): Map<K, HourRecord[]> {
  const m = new Map<K, HourRecord[]>();
  for (const r of records) {
    const k = key(r);
    let arr = m.get(k);
    if (!arr) m.set(k, (arr = []));
    arr.push(r);
  }
  return m;
}

export function totalsByDay(records: HourRecord[], range: Range) {
  const g = groupBy(records, (r) => r.date);
  return eachDay(range.from, range.to).map((d) => ({ date: d, ...sumTotals(g.get(d) ?? []) }));
}

export function totalsByHour(records: HourRecord[]) {
  const g = groupBy(records, (r) => r.hour);
  return Array.from({ length: 24 }, (_, h) => ({ hour: h, ...sumTotals(g.get(h) ?? []) }));
}

export function previousRange(r: Range): Range {
  const len = diffDays(r.from, r.to) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1) };
}

export const METRIC_META: Record<MetricKey, { label: string; unit: '%' | 'n' | 's'; higherIsBad: boolean }> = {
  disconnectRate: { label: 'Taxa de desligamento', unit: '%', higherIsBad: true },
  transferRate: { label: 'Taxa de transferência', unit: '%', higherIsBad: true },
  selfServiceRate: { label: 'Taxa de autosserviço concluído', unit: '%', higherIsBad: false },
  authFailureRate: { label: 'Taxa de falha na identificação (CPF)', unit: '%', higherIsBad: true },
  integrationErrors: { label: 'Erros de integração', unit: 'n', higherIsBad: true },
  failures: { label: 'Falhas registradas (total)', unit: 'n', higherIsBad: true },
  entries: { label: 'Entradas na URA', unit: 'n', higherIsBad: false },
  avgDuration: { label: 'Tempo médio na URA', unit: 's', higherIsBad: true },
};
