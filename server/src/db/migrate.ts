import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tx, type Db } from './pool.js';

/** Pasta das migrações SQL (o build copia os .sql para dist). */
export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Aplica as migrações pendentes em ordem, cada uma numa transação.
 * Usa advisory lock para que duas instâncias não migrem ao mesmo tempo.
 */
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const applied: string[] = [];
  const c = await db.connect();
  try {
    await c.query('SELECT pg_advisory_lock(84212001)');
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const done = new Set((await c.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = await readFile(join(dir, f), 'utf8');
      await tx(db, async (t) => {
        await t.query(sql);
        await t.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      });
      applied.push(f);
    }
  } finally {
    await c.query('SELECT pg_advisory_unlock(84212001)').catch(() => undefined);
    c.release();
  }
  return applied;
}
