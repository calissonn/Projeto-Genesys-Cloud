import path from 'node:path';
import { DemoPlanner } from './coordinator/demoPlanner.ts';
import type { Config } from './config.ts';
import { EventBus } from './events/bus.ts';
import { DemoRunner } from './runners/demoRunner.ts';
import { Engine } from './scheduler/engine.ts';
import { openSqlite } from './store/sqlite.ts';
import { systemClock, uuidIds } from './util/runtime.ts';
import { Workspaces } from './workspace/workspace.ts';

/** Monta o orquestrador. Demo e real usam bancos diferentes e nunca compartilham executores. */
export function buildApp(config: Config, dbFile?: string) {
  if (config.mode === 'real') {
    throw new Error(
      'O modo real (Claude Code via Agent SDK) será habilitado na Etapa 4. Use ACC_MODE=demo por enquanto.',
    );
  }
  const repo = openSqlite(dbFile ?? path.join(config.dataDir, `${config.mode}.sqlite`));
  const bus = new EventBus(repo, config.mode, systemClock);
  const engine = new Engine({
    mode: config.mode,
    repo,
    bus,
    planner: new DemoPlanner(config.demoSpeed),
    runner: new DemoRunner(config.demoSpeed),
    workspaces: new Workspaces(config.workspacesDir),
    clock: systemClock,
    ids: uuidIds,
    maxConcurrency: config.maxConcurrency,
    projectBudgetUsd: config.projectBudgetUsd,
  });
  engine.init();
  return { repo, bus, engine };
}
