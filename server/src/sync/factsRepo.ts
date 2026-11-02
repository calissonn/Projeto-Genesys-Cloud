import type { DimensionCountRow, FlowHourRow } from '../collectors/mapFlowAggregates.js';
import type { Db } from '../db/pool.js';

/** Persistência dos fatos coletados. Upserts idempotentes: reprocessar uma janela corrige dados tardios. */
export async function upsertFlowHours(db: Db, rows: FlowHourRow[]) {
  if (!rows.length) return;
  await db.query(
    `INSERT INTO flow_hour (flow_id, flow_version, interval_start, entries, duration_ms_sum, duration_count, disconnects, exits)
     SELECT * FROM unnest($1::uuid[], $2::text[], $3::timestamptz[], $4::int[], $5::bigint[], $6::int[], $7::int[], $8::int[])
     ON CONFLICT (flow_id, flow_version, interval_start) DO UPDATE SET
       entries = EXCLUDED.entries, duration_ms_sum = EXCLUDED.duration_ms_sum, duration_count = EXCLUDED.duration_count,
       disconnects = EXCLUDED.disconnects, exits = EXCLUDED.exits, collected_at = now()`,
    [rows.map((r) => r.flowId), rows.map((r) => r.flowVersion ?? ''), rows.map((r) => r.intervalStart), rows.map((r) => r.entries),
      rows.map((r) => Math.round(r.durationMsSum)), rows.map((r) => r.durationCount), rows.map((r) => r.disconnects), rows.map((r) => r.exits)],
  );
}

export async function upsertDimensionHours(db: Db, rows: DimensionCountRow[]) {
  if (!rows.length) return;
  await db.query(
    `INSERT INTO flow_dimension_hour (flow_id, interval_start, dimension, dim_key, metric, count, sum_ms)
     SELECT * FROM unnest($1::uuid[], $2::timestamptz[], $3::text[], $4::text[], $5::text[], $6::int[], $7::bigint[])
     ON CONFLICT (flow_id, interval_start, dimension, dim_key, metric) DO UPDATE SET
       count = EXCLUDED.count, sum_ms = EXCLUDED.sum_ms, collected_at = now()`,
    [rows.map((r) => r.flowId), rows.map((r) => r.intervalStart), rows.map((r) => r.dimension), rows.map((r) => r.key),
      rows.map((r) => r.metric), rows.map((r) => r.count), rows.map((r) => Math.round(r.sum))],
  );
}

export async function startRun(db: Db, collector: string, from: Date | null, to: Date | null, triggeredBy: string) {
  const r = await db.query<{ id: string }>(
    `INSERT INTO sync_run (collector, interval_from, interval_to, status, triggered_by) VALUES ($1,$2,$3,'running',$4) RETURNING id`,
    [collector, from, to, triggeredBy],
  );
  return r.rows[0].id;
}

export async function finishRun(db: Db, id: string, status: 'ok' | 'erro', rows: number, error?: string) {
  await db.query(`UPDATE sync_run SET finished_at = now(), status = $2, rows = $3, error = $4 WHERE id = $1`, [id, status, rows, error?.slice(0, 2000) ?? null]);
}

/** Fluxos vinculados a URAs ativas ou em teste. */
export async function linkedFlowIds(db: Db): Promise<string[]> {
  const r = await db.query<{ id: string }>(`SELECT genesys_flow_id::text AS id FROM ura WHERE genesys_flow_id IS NOT NULL AND status <> 'inativa'`);
  return r.rows.map((x) => x.id);
}
