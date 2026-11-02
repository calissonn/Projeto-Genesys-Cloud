/**
 * Sincronização dos dicionários da Genesys (somente leitura):
 * fluxos de entrada de voz, versões dos fluxos vinculados, milestones, outcomes e filas.
 */
import type { Db } from '../db/pool.js';
import type { GenesysClient } from '../genesys/client.js';

interface FlowEntity {
  id: string;
  name: string;
  type: string;
  active?: boolean;
  division?: { name?: string };
  publishedVersion?: { id?: string; datePublished?: string };
}
interface VersionEntity { id: string; datePublished?: string }
interface NamedEntity { id: string; name: string; description?: string }

export async function syncDictionaries(client: GenesysClient, db: Db) {
  let flows = 0;
  for await (const f of client.paginate<FlowEntity>('/api/v2/flows', { type: 'INBOUNDCALL' })) {
    await db.query(
      `INSERT INTO genesys_flow (flow_id, name, type, division_name, published_version, date_published, active, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       ON CONFLICT (flow_id) DO UPDATE SET name=EXCLUDED.name, type=EXCLUDED.type, division_name=EXCLUDED.division_name,
         published_version=EXCLUDED.published_version, date_published=EXCLUDED.date_published, active=EXCLUDED.active, synced_at=now()`,
      [f.id, f.name, f.type, f.division?.name ?? null, f.publishedVersion?.id ?? null, f.publishedVersion?.datePublished ?? null, f.active ?? null],
    );
    flows++;
  }

  // Versões apenas dos fluxos vinculados a URAs (limita o número de requisições).
  const linked = await db.query<{ flow_id: string; ura_id: string }>(
    `SELECT u.genesys_flow_id::text AS flow_id, u.id AS ura_id FROM ura u JOIN genesys_flow g ON g.flow_id = u.genesys_flow_id`,
  );
  let versions = 0;
  for (const { flow_id, ura_id } of linked.rows) versions += await syncFlowVersions(client, db, flow_id, ura_id);

  let milestones = 0;
  for await (const m of client.paginate<NamedEntity>('/api/v2/flows/milestones')) {
    await db.query(`INSERT INTO genesys_milestone (id, name, description) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, synced_at=now()`, [m.id, m.name, m.description ?? null]);
    milestones++;
  }
  let outcomes = 0;
  for await (const o of client.paginate<NamedEntity>('/api/v2/flows/outcomes')) {
    await db.query(`INSERT INTO genesys_outcome (id, name, description) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, synced_at=now()`, [o.id, o.name, o.description ?? null]);
    outcomes++;
  }
  let queues = 0;
  for await (const q of client.paginate<NamedEntity>('/api/v2/routing/queues')) {
    await db.query(`INSERT INTO queue (id, name, source, updated_at) VALUES ($1,$2,'genesys', now()) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, source='genesys', updated_at=now()`, [q.id, q.name]);
    queues++;
  }
  return { flows, versions, milestones, outcomes, queues };
}

/** Importa as versões publicadas de um fluxo e cria os registros correspondentes no histórico de alterações. */
export async function syncFlowVersions(client: GenesysClient, db: Db, flowId: string, uraId: string) {
  let n = 0;
  for await (const v of client.paginate<VersionEntity>(`/api/v2/flows/${flowId}/versions`)) {
    await db.query(
      `INSERT INTO genesys_flow_version (flow_id, version, date_published) VALUES ($1,$2,$3)
       ON CONFLICT (flow_id, version) DO UPDATE SET date_published = EXCLUDED.date_published, synced_at = now()`,
      [flowId, v.id, v.datePublished ?? null],
    );
    // Cria o registro no histórico de alterações (a descrição é preenchida pela equipe CX).
    if (v.datePublished) {
      const id = `genesys-${flowId}-${v.id}`;
      const data = { id, uraId, version: v.id, date: v.datePublished.slice(0, 10), author: 'Genesys Cloud', description: 'Versão publicada (descrever a alteração)', type: 'roteamento', source: 'genesys' };
      await db.query(`INSERT INTO ura_change (id, ura_id, data, updated_by) VALUES ($1,$2,$3,'sincronização') ON CONFLICT (id) DO NOTHING`, [id, uraId, data]);
    }
    n++;
  }
  return n;
}
