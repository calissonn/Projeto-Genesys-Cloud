import type { GenesysClient } from '../genesys/client.js';
import { hourlyFlowVolume, isoInterval, milestones, outcomes, transferDestinations, type FlowAggregationQuery } from '../genesys/queries.js';
import type { Repo } from '../db/repo.js';
import { mapDimensionCounts, mapFlowVolume, type FlowAggregateDataContainer } from './mapFlowAggregates.js';

const AGG = '/api/v2/analytics/flows/aggregates/query';
const AGG_JOBS = '/api/v2/analytics/flows/aggregates/jobs';

/**
 * Coleta incremental (ex.: a cada 15 min, últimas 2 horas) ou histórica (assíncrona).
 * O upsert é idempotente — reprocessar janelas corrige dados que chegam com atraso.
 */
export async function collectFlowHours(client: GenesysClient, repo: Repo, from: Date, to: Date, opts: { timeZone: string; async?: boolean }) {
  const flowIds = await repo.linkedFlowIds();
  const runId = await repo.startRun(opts.async ? 'flow_hours_historico' : 'flow_hours', from, to);
  let total = 0;
  try {
    const interval = isoInterval(from, to);
    const exec = async (q: FlowAggregationQuery) =>
      opts.async
        ? client.runAsyncJob<FlowAggregateDataContainer>(AGG_JOBS, q)
        : (await client.query<{ results?: FlowAggregateDataContainer[] }>(AGG, q)).results ?? [];

    const volume = mapFlowVolume(await exec(hourlyFlowVolume(interval, flowIds, opts.timeZone)));
    await repo.upsertFlowHours(volume);
    total += volume.length;

    const dims: [FlowAggregationQuery, string[], string][] = [
      [milestones(interval, flowIds, opts.timeZone), ['flowMilestoneId'], 'milestone'],
      [outcomes(interval, flowIds, opts.timeZone), ['flowOutcomeId', 'flowOutcomeValue'], 'outcome'],
      [transferDestinations(interval, flowIds, opts.timeZone), ['transferType', 'transferTargetName'], 'destination'],
    ];
    for (const [q, keys, name] of dims) {
      const rows = mapDimensionCounts(await exec(q), keys, name);
      await repo.upsertDimensionHours(rows);
      total += rows.length;
    }
    await repo.finishRun(runId, 'ok', total);
    return total;
  } catch (e) {
    await repo.finishRun(runId, 'erro', total, (e as Error).message);
    throw e;
  }
}
