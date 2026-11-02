/**
 * Orquestra a integração somente leitura com a Genesys Cloud:
 * dicionários, coleta incremental, fechamento diário e backfill histórico retomável.
 * Cada execução é registrada em sync_run; advisory locks evitam execuções concorrentes
 * (inclusive entre várias instâncias do servidor).
 */
import type { GenesysConfig } from '../config.js';
import type { Db } from '../db/pool.js';
import { GenesysAuth } from '../genesys/auth.js';
import { GenesysClient } from '../genesys/client.js';
import { collectWindow, floorHour } from './collect.js';
import { syncDictionaries, syncFlowVersions } from './dictionaries.js';
import { finishRun, startRun } from './factsRepo.js';

const LOCKS = { dicionarios: 84212101, incremental: 84212102, fechamento: 84212103, backfill: 84212104 } as const;
export type JobKind = keyof typeof LOCKS;

export class GenesysIntegration {
  readonly client: GenesysClient;

  constructor(private readonly db: Db, readonly cfg: GenesysConfig, private readonly timeZone: string, fetchImpl?: typeof fetch) {
    this.client = new GenesysClient(new GenesysAuth(cfg.loginBaseUrl, cfg.clientId, cfg.clientSecret, fetchImpl), {
      apiBaseUrl: cfg.apiBaseUrl, maxRequestsPerMinute: cfg.maxRequestsPerMinute, fetchImpl,
    });
  }

  /** Executa um job com lock e registro; retorna null se outro processo já estiver executando. */
  private async locked<T>(kind: JobKind, from: Date | null, to: Date | null, by: string, fn: () => Promise<{ rows: number; result: T }>) {
    const c = await this.db.connect();
    try {
      const got = (await c.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [LOCKS[kind]])).rows[0].ok;
      if (!got) return null;
      const runId = await startRun(this.db, kind, from, to, by);
      try {
        const { rows, result } = await fn();
        await finishRun(this.db, runId, 'ok', rows);
        return result;
      } catch (e) {
        await finishRun(this.db, runId, 'erro', 0, (e as Error).message);
        throw e;
      } finally {
        await c.query('SELECT pg_advisory_unlock($1)', [LOCKS[kind]]);
      }
    } finally {
      c.release();
    }
  }

  syncDictionaries(by = 'agendador') {
    return this.locked('dicionarios', null, null, by, async () => {
      const r = await syncDictionaries(this.client, this.db);
      return { rows: r.flows + r.versions + r.milestones + r.outcomes + r.queues, result: r };
    });
  }

  /** Importa as versões de um fluxo recém-vinculado (somente se o fluxo já foi sincronizado). */
  async importVersionsFor(flowId: string, uraId: string) {
    const known = await this.db.query(`SELECT 1 FROM genesys_flow WHERE flow_id = $1`, [flowId]);
    if (!known.rowCount) return 0;
    return syncFlowVersions(this.client, this.db, flowId, uraId);
  }

  /** Últimas `hours` horas completas + hora corrente (reprocessa para capturar dados tardios). */
  collectIncremental(hours = 3, by = 'agendador', now = new Date()) {
    const to = new Date(floorHour(now).getTime() + 3600_000);
    const from = new Date(to.getTime() - (hours + 1) * 3600_000);
    return this.locked('incremental', from, to, by, async () => {
      const rows = await collectWindow(this.client, this.db, from, to, { timeZone: this.timeZone });
      return { rows, result: { from, to, rows } };
    });
  }

  /** Fechamento: recoleta as últimas 24 h completas via job assíncrono. */
  collectDailyClose(by = 'agendador', now = new Date()) {
    const to = floorHour(now);
    const from = new Date(to.getTime() - 24 * 3600_000);
    return this.locked('fechamento', from, to, by, async () => {
      const rows = await collectWindow(this.client, this.db, from, to, { timeZone: this.timeZone, async: true });
      return { rows, result: { from, to, rows } };
    });
  }

  /**
   * Backfill histórico em janelas de `windowDays`. As janelas ficam em backfill_window,
   * então uma execução interrompida continua de onde parou (janelas "ok" são puladas).
   */
  runBackfill(days: number, by = 'agendador', opts: { windowDays?: number; now?: Date; maxAttempts?: number } = {}) {
    const windowDays = opts.windowDays ?? 7;
    const end = floorHour(opts.now ?? new Date());
    end.setUTCHours(0);
    const start = new Date(end.getTime() - days * 86400_000);
    return this.locked('backfill', start, end, by, async () => {
      for (let w = start.getTime(); w < end.getTime(); w += windowDays * 86400_000) {
        const ws = new Date(w);
        const we = new Date(Math.min(end.getTime(), w + windowDays * 86400_000));
        await this.db.query(`INSERT INTO backfill_window (window_start, window_end, status) VALUES ($1,$2,'pendente') ON CONFLICT (window_start) DO NOTHING`, [ws, we]);
      }
      const pending = await this.db.query<{ window_start: Date; window_end: Date; attempts: number }>(
        `SELECT window_start, window_end, attempts FROM backfill_window
         WHERE status <> 'ok' AND window_start >= $1 AND window_start < $2 AND attempts < $3 ORDER BY window_start`,
        [start, end, opts.maxAttempts ?? 5],
      );
      let rows = 0;
      let failed = 0;
      for (const w of pending.rows) {
        try {
          rows += await collectWindow(this.client, this.db, w.window_start, w.window_end, { timeZone: this.timeZone, async: true });
          await this.db.query(`UPDATE backfill_window SET status='ok', attempts=attempts+1, last_error=NULL, updated_at=now() WHERE window_start=$1`, [w.window_start]);
        } catch (e) {
          failed++;
          await this.db.query(`UPDATE backfill_window SET status='erro', attempts=attempts+1, last_error=$2, updated_at=now() WHERE window_start=$1`, [w.window_start, (e as Error).message.slice(0, 1000)]);
        }
      }
      if (failed) throw new Error(`${failed} janela(s) do backfill falharam; serão retomadas na próxima execução.`);
      return { rows, result: { windows: pending.rows.length, rows } };
    });
  }
}

/** Agendador simples em processo (os locks garantem uma execução por vez entre instâncias). */
export function startScheduler(integration: GenesysIntegration, opts: { incrementalMinutes: number; dailyCloseHour: number; timeZone: string }, log: (m: string) => void) {
  const safe = (name: string, p: () => Promise<unknown>) => p().catch((e) => log(`[agendador] ${name} falhou: ${(e as Error).message}`));
  safe('dicionários', () => integration.syncDictionaries());
  const timers = [
    setInterval(() => safe('incremental', () => integration.collectIncremental()), opts.incrementalMinutes * 60_000),
    setInterval(() => safe('dicionários', () => integration.syncDictionaries()), 24 * 3600_000),
    setInterval(() => {
      const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: opts.timeZone }).format(new Date()));
      if (hour === opts.dailyCloseHour) safe('fechamento', () => integration.collectDailyClose());
    }, 60 * 60_000),
  ];
  return () => timers.forEach(clearInterval);
}
