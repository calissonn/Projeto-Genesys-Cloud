import { mapDimensionCounts, mapFlowVolume, type FlowAggregateDataContainer } from '../collectors/mapFlowAggregates.js';
import type { Db } from '../db/pool.js';
import type { GenesysClient } from '../genesys/client.js';
import { hourlyFlowVolume, isoInterval, milestones, outcomes, transferDestinations, type FlowAggregationQuery } from '../genesys/queries.js';
import { linkedFlowIds, upsertDimensionHours, upsertFlowHours } from './factsRepo.js';

export const AGG_QUERY = '/api/v2/analytics/flows/aggregates/query';
export const AGG_JOBS = '/api/v2/analytics/flows/aggregates/jobs';

/**
 * Coleta os agregados horários de uma janela (volume, milestones, outcomes, destinos)
 * para os fluxos vinculados a URAs. `async` usa jobs assíncronos (histórico).
 */
export async function collectWindow(client: GenesysClient, db: Db, from: Date, to: Date, opts: { timeZone: string; async?: boolean }): Promise<number> {
  const flowIds = await linkedFlowIds(db);
  if (!flowIds.length) return 0;
  const interval = isoInterval(from, to);
  const exec = async (q: FlowAggregationQuery) =>
    opts.async
      ? client.runAsyncJob<FlowAggregateDataContainer>(AGG_JOBS, q)
      : (await client.query<{ results?: FlowAggregateDataContainer[] }>(AGG_QUERY, q)).results ?? [];

  let total = 0;
  const volume = mapFlowVolume(await exec(hourlyFlowVolume(interval, flowIds, opts.timeZone)));
  await upsertFlowHours(db, volume);
  total += volume.length;
  const dims: [FlowAggregationQuery, string[], string][] = [
    [milestones(interval, flowIds, opts.timeZone), ['flowMilestoneId'], 'milestone'],
    [outcomes(interval, flowIds, opts.timeZone), ['flowOutcomeId', 'flowOutcomeValue'], 'outcome'],
    [transferDestinations(interval, flowIds, opts.timeZone), ['transferType', 'transferTargetName'], 'destination'],
  ];
  for (const [q, keys, name] of dims) {
    const rows = mapDimensionCounts(await exec(q), keys, name).filter((r) => r.key.replace(/\|/g, '') !== '');
    await upsertDimensionHours(db, rows);
    total += rows.length;
  }
  return total;
}

/** Alinha a data ao início da hora (UTC). */
export function floorHour(d: Date) {
  const x = new Date(d);
  x.setUTCMinutes(0, 0, 0);
  return x;
}
