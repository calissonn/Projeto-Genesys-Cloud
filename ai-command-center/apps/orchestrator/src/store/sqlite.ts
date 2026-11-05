import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AccEvent, UnsequencedEvent, Agent, Approval, Project, Run, Task } from '@acc/shared';
import type { EventQuery, Repository } from './repository.ts';

const ENTITY_TABLES = ['agents', 'projects', 'tasks', 'approvals', 'runs'] as const;
type EntityTable = (typeof ENTITY_TABLES)[number];

const MIGRATIONS: string[] = [
  `
  CREATE TABLE agents    (id TEXT PRIMARY KEY, project_id TEXT, status TEXT, created_at TEXT, data TEXT NOT NULL);
  CREATE TABLE projects  (id TEXT PRIMARY KEY, project_id TEXT, status TEXT, created_at TEXT, data TEXT NOT NULL);
  CREATE TABLE tasks     (id TEXT PRIMARY KEY, project_id TEXT, status TEXT, created_at TEXT, data TEXT NOT NULL);
  CREATE TABLE approvals (id TEXT PRIMARY KEY, project_id TEXT, status TEXT, created_at TEXT, data TEXT NOT NULL);
  CREATE TABLE runs      (id TEXT PRIMARY KEY, project_id TEXT, status TEXT, created_at TEXT, data TEXT NOT NULL);
  CREATE INDEX tasks_project ON tasks(project_id);
  CREATE INDEX approvals_status ON approvals(status);
  CREATE TABLE events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    type TEXT NOT NULL,
    project_id TEXT, agent_id TEXT, task_id TEXT, run_id TEXT,
    data TEXT NOT NULL
  );
  CREATE INDEX events_project ON events(project_id, seq);
  CREATE INDEX events_agent ON events(agent_id, seq);
  CREATE INDEX events_task ON events(task_id, seq);
  `,
];

/** Abre (ou cria) o banco SQLite. Use ":memory:" nos testes. */
export function openSqlite(file: string): Repository {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null };
  for (let v = row.v ?? 0; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    db.exec(MIGRATIONS[v]!);
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(v + 1);
    db.exec('COMMIT');
  }

  const upsert = (table: EntityTable) =>
    db.prepare(
      `INSERT INTO ${table} (id, project_id, status, created_at, data) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, status = excluded.status, data = excluded.data`,
    );
  const upserts = Object.fromEntries(ENTITY_TABLES.map((t) => [t, upsert(t)])) as Record<EntityTable, ReturnType<typeof upsert>>;
  const getters = Object.fromEntries(
    ENTITY_TABLES.map((t) => [t, db.prepare(`SELECT data FROM ${t} WHERE id = ?`)]),
  ) as Record<EntityTable, ReturnType<DatabaseSync['prepare']>>;

  function save(table: EntityTable, id: string, projectId: string | null, status: string | null, createdAt: string | null, data: unknown) {
    upserts[table].run(id, projectId, status, createdAt, JSON.stringify(data));
  }
  function get<T>(table: EntityTable, id: string): T | null {
    const r = getters[table].get(id) as { data: string } | undefined;
    return r ? (JSON.parse(r.data) as T) : null;
  }
  function list<T>(table: EntityTable, where: Record<string, string | undefined> = {}): T[] {
    const clauses: string[] = [];
    const params: string[] = [];
    for (const [col, val] of Object.entries(where)) {
      if (val === undefined) continue;
      clauses.push(`${col} = ?`);
      params.push(val);
    }
    const sql = `SELECT data FROM ${table}${clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''} ORDER BY created_at, rowid`;
    return (db.prepare(sql).all(...params) as { data: string }[]).map((r) => JSON.parse(r.data) as T);
  }

  const insertEvent = db.prepare(
    'INSERT INTO events (ts, type, project_id, agent_id, task_id, run_id, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  let depth = 0;

  const repo: Repository = {
    listAgents: () => list<Agent>('agents'),
    getAgent: (id) => get<Agent>('agents', id),
    upsertAgent: (a) => save('agents', a.id, null, a.state, a.id, a),

    listProjects: () => list<Project>('projects'),
    getProject: (id) => get<Project>('projects', id),
    upsertProject: (p) => save('projects', p.id, p.id, p.status, p.createdAt, p),

    listTasks: (projectId) => list<Task>('tasks', { project_id: projectId }).sort((a, b) => a.order - b.order),
    getTask: (id) => get<Task>('tasks', id),
    upsertTask: (t) => save('tasks', t.id, t.projectId, t.status, String(t.order).padStart(4, '0'), t),

    listApprovals: (f = {}) => list<Approval>('approvals', { status: f.status, project_id: f.projectId }),
    getApproval: (id) => get<Approval>('approvals', id),
    upsertApproval: (a) => save('approvals', a.id, a.projectId, a.status, a.createdAt, a),

    listRuns: (f = {}) => list<Run>('runs', { status: f.status }).filter((r) => !f.taskId || r.taskId === f.taskId),
    getRun: (id) => get<Run>('runs', id),
    upsertRun: (r) => save('runs', r.id, r.projectId, r.status, r.startedAt, r),

    appendEvent(event) {
      const { ts, type, projectId, agentId, taskId, runId } = event;
      const res = insertEvent.run(ts, type, projectId, agentId, taskId, runId, JSON.stringify(event));
      return { ...event, seq: Number(res.lastInsertRowid) } as AccEvent;
    },
    listEvents(q: EventQuery = {}) {
      const clauses = ['seq > ?'];
      const params: (string | number)[] = [q.after ?? 0];
      const cols: [keyof EventQuery, string][] = [
        ['projectId', 'project_id'],
        ['agentId', 'agent_id'],
        ['taskId', 'task_id'],
        ['runId', 'run_id'],
      ];
      for (const [key, col] of cols) {
        const v = q[key];
        if (v !== undefined) {
          clauses.push(`${col} = ?`);
          params.push(v as string);
        }
      }
      const limit = Math.min(Math.max(q.limit ?? 1000, 1), 5000);
      const rows = db
        .prepare(`SELECT seq, data FROM events WHERE ${clauses.join(' AND ')} ORDER BY seq LIMIT ${limit}`)
        .all(...params) as { seq: number; data: string }[];
      return rows.map((r) => ({ ...(JSON.parse(r.data) as UnsequencedEvent), seq: r.seq }) as AccEvent);
    },
    lastSeq() {
      const r = db.prepare('SELECT MAX(seq) AS s FROM events').get() as { s: number | null };
      return r.s ?? 0;
    },
    transaction(fn) {
      if (depth > 0) return fn();
      depth++;
      db.exec('BEGIN');
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
    close: () => db.close(),
  };
  return repo;
}
