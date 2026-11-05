import { DemoPlanner } from '../src/coordinator/demoPlanner.ts';
import { EventBus } from '../src/events/bus.ts';
import type { Planner } from '../src/coordinator/planner.ts';
import { DemoRunner } from '../src/runners/demoRunner.ts';
import type { Runner } from '../src/runners/runner.ts';
import { Engine } from '../src/scheduler/engine.ts';
import type { Repository } from '../src/store/repository.ts';
import { openSqlite } from '../src/store/sqlite.ts';
import { systemClock, uuidIds } from '../src/util/runtime.ts';
import { Workspaces } from '../src/workspace/workspace.ts';

export function makeEngine(opts: { repo?: Repository; speed?: number; maxConcurrency?: number; planner?: Planner; runner?: Runner } = {}) {
  const repo = opts.repo ?? openSqlite(':memory:');
  const bus = new EventBus(repo, 'demo', systemClock);
  const speed = opts.speed ?? 500;
  const engine = new Engine({
    mode: 'demo',
    repo,
    bus,
    planner: opts.planner ?? new DemoPlanner(speed),
    runner: opts.runner ?? new DemoRunner(speed),
    workspaces: new Workspaces('/tmp/acc-test-workspaces'),
    clock: systemClock,
    ids: uuidIds,
    maxConcurrency: opts.maxConcurrency ?? 2,
    projectBudgetUsd: 2,
  });
  engine.init();
  return { repo, bus, engine };
}

export async function waitFor<T>(fn: () => T | null | undefined | false, timeoutMs = 5000, label = 'condição'): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`Tempo esgotado aguardando ${label}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Aprova automaticamente tudo que aparecer como pendente. */
export function autoApprove(engine: Engine, repo: Repository, decision: 'approve' | 'reject' = 'approve', kinds: ('plan' | 'action')[] = ['plan', 'action']) {
  const timer = setInterval(() => {
    for (const ap of repo.listApprovals({ status: 'pending' })) {
      if (kinds.includes(ap.kind)) engine.decide(ap.id, decision);
    }
  }, 3);
  return () => clearInterval(timer);
}
