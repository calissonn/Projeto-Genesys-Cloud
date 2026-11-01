/**
 * Converte a resposta de flows/aggregates (FlowAggregateQueryResponse) em
 * linhas horárias normalizadas para o PostgreSQL.
 */
export interface StatisticalSummary { count?: number; sum?: number; max?: number; min?: number }
export interface AggregateMetricData { metric: string; qualifier?: string; stats?: StatisticalSummary }
export interface FlowAggregateDataContainer {
  group?: Record<string, string>;
  data?: { interval: string; metrics?: AggregateMetricData[] }[];
}

export interface FlowHourRow {
  flowId: string;
  flowVersion: string | null;
  intervalStart: string; // ISO
  entries: number; // nFlow.count
  durationMsSum: number; // tFlow.sum
  durationCount: number; // tFlow.count
  disconnects: number; // tFlowDisconnect.count
  exits: number; // tFlowExit.count
}

export function mapFlowVolume(results: FlowAggregateDataContainer[]): FlowHourRow[] {
  const rows: FlowHourRow[] = [];
  for (const r of results) {
    const flowId = r.group?.flowId;
    if (!flowId) continue;
    for (const d of r.data ?? []) {
      const m = (name: string) => d.metrics?.find((x) => x.metric === name)?.stats;
      rows.push({
        flowId,
        flowVersion: r.group?.flowVersion ?? null,
        intervalStart: d.interval.split('/')[0],
        entries: m('nFlow')?.count ?? 0,
        durationMsSum: m('tFlow')?.sum ?? 0,
        durationCount: m('tFlow')?.count ?? 0,
        disconnects: m('tFlowDisconnect')?.count ?? 0,
        exits: m('tFlowExit')?.count ?? 0,
      });
    }
  }
  return rows;
}

export interface DimensionCountRow { flowId: string; intervalStart: string; dimension: string; key: string; metric: string; count: number; sum: number }

/** Linhas genéricas por dimensão (milestones, outcomes, destinos). */
export function mapDimensionCounts(results: FlowAggregateDataContainer[], dimensionKeys: string[], dimension: string): DimensionCountRow[] {
  const rows: DimensionCountRow[] = [];
  for (const r of results) {
    const flowId = r.group?.flowId;
    if (!flowId) continue;
    const key = dimensionKeys.map((k) => r.group?.[k] ?? '').join('|');
    for (const d of r.data ?? []) {
      for (const m of d.metrics ?? []) {
        rows.push({ flowId, intervalStart: d.interval.split('/')[0], dimension, key, metric: m.metric, count: m.stats?.count ?? 0, sum: m.stats?.sum ?? 0 });
      }
    }
  }
  return rows;
}
