import pg from 'pg';
import type { DimensionCountRow, FlowHourRow } from '../collectors/mapFlowAggregates.js';

export class Repo {
  constructor(private readonly pool: pg.Pool) {}

  static connect(url: string) {
    return new Repo(new pg.Pool({ connectionString: url, max: 5 }));
  }

  /** Upsert idempotente: reprocessar um intervalo substitui os valores (dados tardios da Genesys). */
  async upsertFlowHours(rows: FlowHourRow[]) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of rows) {
        await client.query(
          `INSERT INTO flow_hour (flow_id, flow_version, interval_start, entries, duration_ms_sum, duration_count, disconnects, exits)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (flow_id, flow_version, interval_start) DO UPDATE SET
             entries = EXCLUDED.entries, duration_ms_sum = EXCLUDED.duration_ms_sum, duration_count = EXCLUDED.duration_count,
             disconnects = EXCLUDED.disconnects, exits = EXCLUDED.exits, collected_at = now()`,
          [r.flowId, r.flowVersion ?? '', r.intervalStart, r.entries, r.durationMsSum, r.durationCount, r.disconnects, r.exits],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async upsertDimensionHours(rows: DimensionCountRow[]) {
    for (const r of rows) {
      await this.pool.query(
        `INSERT INTO flow_dimension_hour (flow_id, interval_start, dimension, dim_key, metric, count, sum_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (flow_id, interval_start, dimension, dim_key, metric) DO UPDATE SET count = EXCLUDED.count, sum_ms = EXCLUDED.sum_ms`,
        [r.flowId, r.intervalStart, r.dimension, r.key, r.metric, r.count, r.sum],
      );
    }
  }

  async startRun(collector: string, from: Date, to: Date) {
    const r = await this.pool.query<{ id: string }>(`INSERT INTO sync_run (collector, interval_from, interval_to, status) VALUES ($1,$2,$3,'running') RETURNING id`, [collector, from, to]);
    return r.rows[0].id;
  }

  async finishRun(id: string, status: 'ok' | 'erro', rows: number, error?: string) {
    await this.pool.query(`UPDATE sync_run SET finished_at = now(), status = $2, rows = $3, error = $4 WHERE id = $1`, [id, status, rows, error ?? null]);
  }

  async linkedFlowIds(): Promise<string[]> {
    const r = await this.pool.query<{ genesys_flow_id: string }>(`SELECT genesys_flow_id FROM ura WHERE genesys_flow_id IS NOT NULL AND status <> 'inativa'`);
    return r.rows.map((x) => x.genesys_flow_id);
  }
}
