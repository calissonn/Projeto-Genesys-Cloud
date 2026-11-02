/**
 * Converte os fatos coletados da Genesys (flow_hour + flow_dimension_hour) no formato
 * HourRecord usado pelo front-end, por URA, data e hora LOCAL.
 *
 * Regras de conversão (validar com dados reais):
 *  - entries          = nFlow
 *  - disconnects      = tFlowDisconnect.count
 *  - durationSec      = tFlow.sum / 1000
 *  - transfers        = tFlowExit.count das saídas com transferType em GENESYS_HUMAN_TRANSFER_TYPES
 *  - selfService      = nFlowOutcome com valor SUCCESS dos outcomes mapeados como 'autosservico'
 *  - authAttempts/authFailures/cpfExceeded/apiErrors/integrationErrors/flowErrors/
 *    invalidOptions/transferFailures = nFlowMilestone das milestones mapeadas para cada papel
 *  - otherExits       = entries − disconnects − transfers − selfService (mínimo 0)
 *  - unique/inherited/queueAbandons: NÃO disponíveis nos agregados de fluxo → availability=false
 */
import type { Db } from '../db/pool.js';

export interface HourRecord {
  uraId: string; date: string; hour: number;
  entries: number; unique: number; inherited: number; disconnects: number; transfers: number; selfService: number; otherExits: number;
  durationSec: number; authFailures: number; authAttempts: number; integrationErrors: number; transferFailures: number; queueAbandons: number;
  cpfExceeded: number; apiErrors: number; flowErrors: number; invalidOptions: number;
}

export interface Availability {
  unique: boolean;
  queueAbandons: boolean;
  selfService: boolean;
  authentication: boolean;
  integrationErrors: boolean;
  apiErrors: boolean;
  flowErrors: boolean;
  invalidOptions: boolean;
  transferFailures: boolean;
  transfers: boolean;
}

const ROLE_FIELD: Record<string, keyof HourRecord> = {
  cpf_tentativa: 'authAttempts', cpf_falha: 'authFailures', cpf_excedido: 'cpfExceeded', erro_integracao: 'integrationErrors',
  erro_api: 'apiErrors', erro_fluxo: 'flowErrors', opcao_invalida: 'invalidOptions', transferencia_falha: 'transferFailures',
};

export async function hourlyRecords(db: Db, opts: { from: string; to: string; timeZone: string; humanTransferTypes: string[]; uraIds: Set<string> | null }) {
  const params = [opts.from, opts.to, opts.timeZone];
  const range = `interval_start >= ($1::date)::timestamp AT TIME ZONE $3 AND interval_start < ($2::date + 1)::timestamp AT TIME ZONE $3`;
  const local = `to_char(interval_start AT TIME ZONE $3, 'YYYY-MM-DD') AS d, extract(hour FROM interval_start AT TIME ZONE $3)::int AS h`;

  const uras = await db.query<{ id: string; flow: string }>(`SELECT id, genesys_flow_id::text AS flow FROM ura WHERE genesys_flow_id IS NOT NULL`);
  const flowToUra = new Map(uras.rows.filter((u) => !opts.uraIds || opts.uraIds.has(u.id)).map((u) => [u.flow, u.id]));
  const recs = new Map<string, HourRecord>();
  const get = (flow: string, d: string, h: number) => {
    const uraId = flowToUra.get(flow);
    if (!uraId) return null;
    const k = `${uraId}|${d}|${h}`;
    let r = recs.get(k);
    if (!r) {
      recs.set(k, (r = { uraId, date: d, hour: h, entries: 0, unique: 0, inherited: 0, disconnects: 0, transfers: 0, selfService: 0, otherExits: 0, durationSec: 0,
        authFailures: 0, authAttempts: 0, integrationErrors: 0, transferFailures: 0, queueAbandons: 0, cpfExceeded: 0, apiErrors: 0, flowErrors: 0, invalidOptions: 0 }));
    }
    return r;
  };

  const vol = await db.query<{ flow: string; d: string; h: number; entries: string; dur: string; disc: string }>(
    `SELECT flow_id::text AS flow, ${local}, sum(entries) AS entries, sum(duration_ms_sum) AS dur, sum(disconnects) AS disc
     FROM flow_hour WHERE ${range} GROUP BY 1,2,3`, params);
  for (const v of vol.rows) {
    const r = get(v.flow, v.d, v.h);
    if (!r) continue;
    r.entries += Number(v.entries);
    r.unique += Number(v.entries); // sem dado de conversa distinta: igual a entradas (availability.unique = false)
    r.durationSec += Number(v.dur) / 1000;
    r.disconnects += Number(v.disc);
  }

  const dims = await db.query<{ flow: string; d: string; h: number; dimension: string; dim_key: string; metric: string; count: string; role: string | null }>(
    `SELECT f.flow_id::text AS flow, ${local.replace(/interval_start/g, 'f.interval_start')}, f.dimension, f.dim_key, f.metric, sum(f.count) AS count, m.role
     FROM flow_dimension_hour f
     LEFT JOIN instrumentation_map m ON (
       (f.dimension = 'milestone' AND m.kind = 'milestone' AND m.genesys_id::text = f.dim_key) OR
       (f.dimension = 'outcome' AND m.kind = 'outcome' AND m.genesys_id::text = split_part(f.dim_key, '|', 1)))
     WHERE ${range.replace(/interval_start/g, 'f.interval_start')} GROUP BY 1,2,3,4,5,6,8`, params);
  const human = new Set(opts.humanTransferTypes.map((t) => t.toUpperCase()));
  for (const x of dims.rows) {
    const r = get(x.flow, x.d, x.h);
    if (!r) continue;
    const n = Number(x.count);
    if (x.dimension === 'destination' && x.metric === 'tFlowExit' && human.has(x.dim_key.split('|')[0].toUpperCase())) r.transfers += n;
    else if (x.dimension === 'outcome' && x.role === 'autosservico' && x.metric === 'nFlowOutcome' && x.dim_key.split('|')[1]?.toUpperCase() === 'SUCCESS') r.selfService += n;
    else if (x.dimension === 'milestone' && x.metric === 'nFlowMilestone' && x.role && ROLE_FIELD[x.role]) (r[ROLE_FIELD[x.role]] as number) += n;
  }
  for (const r of recs.values()) r.otherExits = Math.max(0, r.entries - r.disconnects - r.transfers - r.selfService);

  const roles = new Set((await db.query<{ role: string }>(`SELECT DISTINCT role FROM instrumentation_map`)).rows.map((x) => x.role));
  const hasDest = (await db.query(`SELECT 1 FROM flow_dimension_hour WHERE dimension='destination' LIMIT 1`)).rowCount! > 0;
  const availability: Availability = {
    unique: false, queueAbandons: false, transfers: hasDest,
    selfService: roles.has('autosservico'), authentication: roles.has('cpf_tentativa') && roles.has('cpf_falha'),
    integrationErrors: roles.has('erro_integracao'), apiErrors: roles.has('erro_api'), flowErrors: roles.has('erro_fluxo'),
    invalidOptions: roles.has('opcao_invalida'), transferFailures: roles.has('transferencia_falha'),
  };
  const range2 = await db.query<{ min: string | null; max: string | null }>(
    `SELECT to_char(min(interval_start AT TIME ZONE $1), 'YYYY-MM-DD') AS min, to_char(max(interval_start AT TIME ZONE $1), 'YYYY-MM-DD') AS max FROM flow_hour`, [opts.timeZone]);
  return {
    records: Array.from(recs.values()).map((r) => ({ ...r, durationSec: Math.round(r.durationSec) })),
    availability,
    dataRange: range2.rows[0],
    unlinkedFlowsWithData: (await db.query<{ n: string }>(`SELECT count(DISTINCT flow_id) AS n FROM flow_hour WHERE flow_id NOT IN (SELECT genesys_flow_id FROM ura WHERE genesys_flow_id IS NOT NULL)`)).rows[0].n,
  };
}
