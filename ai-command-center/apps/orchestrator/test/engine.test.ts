import { describe, expect, it } from 'vitest';
import { isEngagedState, type AccEvent } from '@acc/shared';
import { DemoPlanner } from '../src/coordinator/demoPlanner.ts';
import type { Runner } from '../src/runners/runner.ts';
import { openSqlite } from '../src/store/sqlite.ts';
import { sleep } from '../src/util/runtime.ts';
import { autoApprove, makeEngine, waitFor } from './helpers.ts';

const DESC = 'Uma página institucional com formulário de contato';

/**
 * Reproduz o histórico e verifica a regra principal: um agente só aparece trabalhando
 * enquanto existe uma execução ativa dele (ou, para o coordenador, planejamento/aprovação pendente).
 */
function assertNoFakeWork(events: AccEvent[]) {
  const activeRun = new Map<string, string>();
  let planning = 0;
  const pendingPlans = new Set<string>();
  for (const e of events) {
    if (e.type === 'run.started') activeRun.set(e.run.agentId, e.run.id);
    if (e.type === 'run.finished') activeRun.delete(e.run.agentId);
    if (e.type === 'approval.upserted' && e.approval.kind === 'plan') {
      if (e.approval.status === 'pending') pendingPlans.add(e.approval.id);
      else pendingPlans.delete(e.approval.id);
    }
    if (e.type === 'project.upserted') planning = 0; // planejamento é verificado pelo estado "meeting" abaixo
    if (e.type !== 'agent.upserted' || !isEngagedState(e.agent.state)) continue;
    const a = e.agent;
    if (a.role === 'coordinator') {
      if (a.state === 'awaiting_approval') expect(pendingPlans.size, `coordenador aguardando sem plano pendente (seq ${e.seq})`).toBeGreaterThan(0);
      else expect(a.state).toBe('meeting');
      continue;
    }
    expect(activeRun.has(a.id), `${a.name} em "${a.state}" sem execução ativa (seq ${e.seq})`).toBe(true);
  }
  void planning;
}

describe('motor de orquestração (modo demo)', () => {
  it('planeja, aguarda aprovação do plano e executa respeitando dependências', async () => {
    const { engine, repo } = makeEngine();
    const project = engine.createProject({ name: 'Cadastro', description: DESC });
    expect(project.status).toBe('planning');

    const planApproval = await waitFor(() => repo.listApprovals({ status: 'pending' }).find((a) => a.kind === 'plan'), 3000, 'plano');
    expect(repo.getProject(project.id)!.status).toBe('awaiting_plan_approval');
    expect(repo.getAgent('ag-coordinator')!.state).toBe('awaiting_approval');
    // Nada executa antes da aprovação.
    expect(repo.listRuns()).toHaveLength(0);

    engine.decide(planApproval.id, 'approve');
    const stop = autoApprove(engine, repo, 'approve', ['action']);
    await waitFor(() => repo.getProject(project.id)!.status === 'completed', 5000, 'conclusão');
    stop();
    await engine.idle();

    const tasks = repo.listTasks(project.id);
    expect(tasks.every((t) => t.status === 'done')).toBe(true);
    const byKeyOrder = new Map(tasks.map((t) => [t.id, t]));
    for (const t of tasks) {
      for (const d of t.dependsOn) expect(byKeyOrder.get(d)!.finishedAt! <= t.startedAt!).toBe(true);
    }
    const tester = tasks.find((t) => t.role === 'tester')!;
    expect(tester.tests).toMatchObject({ passed: 12, failed: 0 });
    expect(tasks.find((t) => t.role === 'programmer')!.filesChanged.map((f) => f.path)).toContain('package.json');

    const events = repo.listEvents({ limit: 5000 });
    expect(events.every((e) => e.source === 'demo')).toBe(true);
    assertNoFakeWork(events);
    // Repasse entre agentes aparece como conversa.
    expect(events.some((e) => e.type === 'run.activity' && e.activity.kind === 'handoff')).toBe(true);
    // Ao fim ninguém está "trabalhando".
    expect(repo.listAgents().every((a) => !isEngagedState(a.state))).toBe(true);
  });

  it('impede marcar agente como trabalhando sem execução ativa', () => {
    const { engine } = makeEngine();
    expect(() => engine.setAgentState('ag-programmer', 'typing')).toThrow(/exige uma execução ativa/);
    expect(engine.setAgentState('ag-programmer', 'idle').state).toBe('idle');
  });

  it('rejeitar o plano cancela o projeto sem executar nada', async () => {
    const { engine, repo } = makeEngine();
    const project = engine.createProject({ name: 'Rejeitado', description: DESC });
    const ap = await waitFor(() => repo.listApprovals({ status: 'pending' })[0], 3000);
    engine.decide(ap.id, 'reject', 'escopo errado');
    await engine.idle();
    expect(repo.getProject(project.id)).toMatchObject({ status: 'cancelled', statusReason: 'Plano rejeitado: escopo errado' });
    expect(repo.listRuns()).toHaveLength(0);
    expect(repo.listTasks(project.id).every((t) => t.status === 'cancelled')).toBe(true);
    expect(repo.getAgent('ag-coordinator')!.state).toBe('done');
  });

  it('erro nos testes marca tarefa e agente com erro e o projeto como falho', async () => {
    const { engine, repo } = makeEngine();
    const project = engine.createProject({ name: 'Com erro', description: `${DESC} #erro` });
    const stop = autoApprove(engine, repo);
    await waitFor(() => repo.getProject(project.id)!.status === 'failed', 5000, 'falha');
    stop();
    await engine.idle();
    const tester = repo.listTasks(project.id).find((t) => t.role === 'tester')!;
    expect(tester.status).toBe('failed');
    expect(tester.error).toMatch(/2 de 12 testes falharam/);
    expect(repo.getAgent('ag-tester')!.state).toBe('error');
  });

  it('dependência com falha bloqueia as tarefas seguintes', async () => {
    const failing: Runner = {
      kind: 'demo',
      async run(ctx) {
        await sleep(5);
        return ctx.task.role === 'designer'
          ? { status: 'failed', summary: null, error: 'quebrou', filesChanged: [], tests: null, costUsd: null, turns: null }
          : { status: 'succeeded', summary: 'ok', error: null, filesChanged: [], tests: null, costUsd: null, turns: null };
      },
    };
    const { engine, repo } = makeEngine({ runner: failing });
    const project = engine.createProject({ name: 'Bloqueio', description: DESC });
    const stop = autoApprove(engine, repo);
    await waitFor(() => repo.getProject(project.id)!.status === 'failed', 3000);
    stop();
    const statuses = repo.listTasks(project.id).map((t) => [t.role, t.status]);
    expect(statuses).toEqual([['designer', 'failed'], ['programmer', 'blocked'], ['tester', 'blocked']]);
  });

  it('recusar uma ação mantém a execução sem a ação recusada', async () => {
    const { engine, repo } = makeEngine();
    const project = engine.createProject({ name: 'Sem dependência', description: DESC });
    const stopPlan = autoApprove(engine, repo, 'approve', ['plan']);
    const stopAct = autoApprove(engine, repo, 'reject', ['action']);
    await waitFor(() => repo.getProject(project.id)!.status === 'completed', 5000);
    stopPlan();
    stopAct();
    const prog = repo.listTasks(project.id).find((t) => t.role === 'programmer')!;
    expect(prog.filesChanged.map((f) => f.path)).not.toContain('package.json');
    expect(repo.listApprovals({ status: 'rejected' })).toHaveLength(1);
  });

  it('pausar interrompe a execução e retomar conclui o projeto', async () => {
    const { engine, repo } = makeEngine({ speed: 50 });
    const project = engine.createProject({ name: 'Pausa', description: DESC });
    const stop = autoApprove(engine, repo);
    await waitFor(() => repo.listRuns({ status: 'running' })[0], 3000, 'execução');
    engine.pauseProject(project.id);
    await waitFor(() => repo.listRuns({ status: 'running' }).length === 0, 3000, 'interrupção');
    expect(repo.getProject(project.id)!.status).toBe('paused');
    expect(repo.listRuns({ status: 'aborted' })).toHaveLength(1);
    expect(repo.listTasks(project.id).find((t) => t.role === 'designer')!.status).toBe('pending');
    expect(repo.getAgent('ag-designer')!.state).toBe('paused');
    // Enquanto pausado, nada novo começa.
    await sleep(50);
    expect(repo.listRuns({ status: 'running' })).toHaveLength(0);

    engine.resumeProject(project.id);
    await waitFor(() => repo.getProject(project.id)!.status === 'completed', 8000, 'conclusão');
    stop();
    expect(repo.listTasks(project.id).find((t) => t.role === 'designer')!.attempts).toBe(2);
    assertNoFakeWork(repo.listEvents({ limit: 5000 }));
  });

  it('cancelar durante a execução encerra tudo', async () => {
    const { engine, repo } = makeEngine({ speed: 50 });
    const project = engine.createProject({ name: 'Cancelar', description: DESC });
    const stop = autoApprove(engine, repo);
    await waitFor(() => repo.listRuns({ status: 'running' })[0], 3000);
    engine.cancelProject(project.id);
    await engine.idle();
    stop();
    expect(repo.getProject(project.id)!.status).toBe('cancelled');
    expect(repo.listTasks(project.id).every((t) => t.status === 'cancelled')).toBe(true);
    expect(repo.listAgents().every((a) => !isEngagedState(a.state))).toBe(true);
  });

  it('respeita o limite de execuções simultâneas', async () => {
    let concurrent = 0;
    let max = 0;
    const counting: Runner = {
      kind: 'demo',
      async run() {
        concurrent++;
        max = Math.max(max, concurrent);
        await sleep(20);
        concurrent--;
        return { status: 'succeeded', summary: 'ok', error: null, filesChanged: [], tests: null, costUsd: null, turns: null };
      },
    };
    // "API" faz o plano ter duas tarefas independentes (layout e backend).
    const { engine, repo } = makeEngine({ runner: counting, maxConcurrency: 1 });
    const project = engine.createProject({ name: 'Concorrência', description: 'Sistema com API e banco de dados' });
    const stop = autoApprove(engine, repo);
    await waitFor(() => repo.getProject(project.id)!.status === 'completed', 3000);
    stop();
    expect(repo.listTasks(project.id)).toHaveLength(4);
    expect(max).toBe(1);
  });

  it('pausa o projeto ao atingir o orçamento', async () => {
    const costly: Runner = {
      kind: 'demo',
      async run() {
        await sleep(5);
        return { status: 'succeeded', summary: 'ok', error: null, filesChanged: [], tests: null, costUsd: 0.6, turns: 3 };
      },
    };
    const { engine, repo } = makeEngine({ runner: costly });
    const project = engine.createProject({ name: 'Orçamento', description: DESC, budgetUsd: 1 });
    const stop = autoApprove(engine, repo);
    await waitFor(() => repo.getProject(project.id)!.status === 'paused', 3000);
    stop();
    const p = repo.getProject(project.id)!;
    expect(p.costUsd).toBeCloseTo(1.2);
    expect(p.statusReason).toMatch(/Orçamento/);
    expect(() => engine.resumeProject(project.id)).toThrow(/Orçamento/);
  });

  it('após reinício, execuções interrompidas são registradas e o projeto fica pausado', async () => {
    const file = `/tmp/acc-restart-${Date.now()}.sqlite`;
    const first = makeEngine({ repo: openSqlite(file), speed: 20 });
    const project = first.engine.createProject({ name: 'Reinício', description: DESC });
    const stop = autoApprove(first.engine, first.repo);
    await waitFor(() => first.repo.listRuns({ status: 'running' })[0], 3000);
    stop();
    // Simula queda do processo: abre o mesmo banco num novo motor.
    const second = makeEngine({ repo: openSqlite(file), planner: new DemoPlanner(1000) });
    expect(second.repo.getProject(project.id)!.status).toBe('paused');
    expect(second.repo.listRuns({ status: 'running' })).toHaveLength(0);
    expect(second.repo.listTasks(project.id).every((t) => t.status === 'pending' || t.status === 'done')).toBe(true);
    expect(second.repo.listAgents().every((a) => !isEngagedState(a.state))).toBe(true);
    first.engine.cancelProject(project.id);
    await first.engine.idle();
  });

  it('valida a entrada de criação de projeto', () => {
    const { engine } = makeEngine();
    expect(() => engine.createProject({ name: 'x', description: 'curta' })).toThrow();
  });
});
