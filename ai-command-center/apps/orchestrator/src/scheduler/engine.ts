import {
  CreateProjectInput,
  RISK_LABELS,
  isEngagedState,
  type Activity,
  type Agent,
  type AgentState,
  type Approval,
  type Mode,
  type Project,
  type Run,
  type Snapshot,
  type Task,
} from '@acc/shared';
import type { EventBus } from '../events/bus.ts';
import { defaultAgents } from '../policy/roles.ts';
import type { Planner } from '../coordinator/planner.ts';
import { validatePlan } from '../coordinator/planner.ts';
import type { ApprovalOutcome, ApprovalRequest, RunResult, Runner } from '../runners/runner.ts';
import type { Repository } from '../store/repository.ts';
import type { Clock, IdGen } from '../util/runtime.ts';
import type { Workspaces } from '../workspace/workspace.ts';

export interface EngineOptions {
  mode: Mode;
  repo: Repository;
  bus: EventBus;
  planner: Planner;
  runner: Runner;
  workspaces: Workspaces;
  clock: Clock;
  ids: IdGen;
  maxConcurrency: number;
  projectBudgetUsd: number;
}

export class EngineError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

interface ActiveWork {
  kind: 'plan' | 'run';
  id: string;
  projectId: string;
  abort: AbortController;
}

const TERMINAL_TASK = new Set<Task['status']>(['done', 'failed', 'blocked', 'cancelled']);

/**
 * Coração do orquestrador: planejamento, agendamento por dependências, execuções,
 * aprovações, pausa/retomada e custos. Toda mudança passa por aqui e vira evento.
 */
export class Engine {
  private readonly active = new Map<string, ActiveWork>(); // por agentId
  private readonly waiters = new Map<string, (o: ApprovalOutcome) => void>(); // por approvalId
  private readonly running = new Set<Promise<unknown>>();
  private planChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly o: EngineOptions) {}

  // ---------------------------------------------------------------- inicialização

  init(): void {
    const { repo } = this.o;
    if (repo.listAgents().length === 0) {
      for (const a of defaultAgents(this.now())) this.saveAgent(a);
    }
    this.recoverAfterRestart();
  }

  /** Execuções em memória não sobrevivem a um reinício: o estado é corrigido e registrado. */
  private recoverAfterRestart(): void {
    const { repo } = this.o;
    const note = 'Orquestrador reiniciado durante a execução';
    for (const run of repo.listRuns({ status: 'running' })) {
      this.saveRun({ ...run, status: 'aborted', finishedAt: this.now(), error: note }, 'run.finished');
    }
    for (const ap of repo.listApprovals({ status: 'pending' })) {
      if (ap.kind === 'action') this.saveApproval({ ...ap, status: 'expired', decidedAt: this.now(), reason: note });
    }
    for (const p of repo.listProjects()) {
      if (p.status === 'planning') this.saveProject({ ...p, status: 'failed', statusReason: 'Planejamento interrompido por reinício' });
      if (p.status === 'running') this.saveProject({ ...p, status: 'paused', statusReason: note });
    }
    for (const t of repo.listTasks()) {
      if (t.status === 'running' || t.status === 'awaiting_approval') {
        this.saveTask({ ...t, status: 'pending', agentId: null, runId: null, error: note });
      }
    }
    for (const a of repo.listAgents()) {
      if (isEngagedState(a.state) && !(a.role === 'coordinator' && this.pendingPlanApprovals().length)) {
        this.saveAgent({ ...a, state: 'idle', stateDetail: null, stateSince: this.now(), currentProjectId: null, currentTaskId: null, withAgentId: null });
      }
    }
    this.refreshCoordinator();
  }

  snapshot(): Snapshot {
    const { repo, mode } = this.o;
    return {
      mode,
      seq: repo.lastSeq(),
      agents: repo.listAgents(),
      projects: repo.listProjects(),
      tasks: repo.listTasks(),
      approvals: repo.listApprovals(),
      runs: repo.listRuns(),
    };
  }

  /** Aguarda tudo que estiver em andamento (usado em testes e no desligamento). */
  async idle(): Promise<void> {
    while (this.running.size) await Promise.allSettled([...this.running]);
  }

  // ---------------------------------------------------------------- projetos

  createProject(input: unknown): Project {
    const parsed = CreateProjectInput.safeParse(input);
    if (!parsed.success) throw new EngineError(parsed.error.issues.map((i) => i.message).join('; '));
    const now = this.now();
    const project: Project = {
      id: this.o.ids('prj'),
      name: parsed.data.name,
      description: parsed.data.description,
      status: 'planning',
      mode: this.o.mode,
      createdAt: now,
      updatedAt: now,
      budgetUsd: parsed.data.budgetUsd ?? this.o.projectBudgetUsd,
      costUsd: this.o.mode === 'real' ? 0 : null,
      estimatedCostUsd: null,
      planSummary: null,
      statusReason: null,
    };
    this.saveProject(project);
    this.log('info', `Projeto "${project.name}" criado; coordenador iniciando o planejamento`, project.id);
    // Um único coordenador: os planejamentos entram em fila.
    this.planChain = this.track(
      this.planChain.then(() => this.planProject(project.id)).catch((err) => console.error('[engine] planejamento', err)),
    );
    return project;
  }

  private async planProject(projectId: string): Promise<void> {
    const project = this.requireProject(projectId);
    if (project.status !== 'planning') return;
    const coordinator = this.agentByRole('coordinator');
    const abort = new AbortController();
    const workId = this.o.ids('plan');
    this.active.set(coordinator.id, { kind: 'plan', id: workId, projectId, abort });
    this.setAgentState(coordinator.id, 'meeting', { detail: `Planejando "${project.name}"`, projectId });
    try {
      const plan = validatePlan(await this.o.planner.plan({ name: project.name, description: project.description }, abort.signal));
      const current = this.requireProject(projectId);
      if (current.status !== 'planning') return; // cancelado durante o planejamento

      const keyToId = new Map(plan.tasks.map((t) => [t.key, this.o.ids('tsk')]));
      this.o.repo.transaction(() => {
        plan.tasks.forEach((pt, order) => {
          this.saveTask({
            id: keyToId.get(pt.key)!,
            projectId,
            order,
            title: pt.title,
            description: pt.description,
            role: pt.role,
            dependsOn: pt.dependsOn.map((k) => keyToId.get(k)!),
            acceptanceCriteria: pt.acceptanceCriteria,
            status: 'pending',
            agentId: null,
            runId: null,
            attempts: 0,
            startedAt: null,
            finishedAt: null,
            costUsd: null,
            estimatedCostUsd: null,
            filesChanged: [],
            tests: null,
            summary: null,
            error: null,
          });
        });
        this.saveProject({ ...current, status: 'awaiting_plan_approval', planSummary: plan.summary });
        this.saveApproval({
          id: this.o.ids('apr'),
          projectId,
          taskId: null,
          agentId: coordinator.id,
          kind: 'plan',
          category: 'plan',
          title: `Aprovar plano de "${project.name}"`,
          detail: `${plan.summary}\n\n` + plan.tasks.map((t, i) => `${i + 1}. [${t.role}] ${t.title}`).join('\n'),
          payload: plan,
          status: 'pending',
          createdAt: this.now(),
          decidedAt: null,
          reason: null,
        });
      });
      this.log('info', `Plano com ${plan.tasks.length} tarefas aguardando aprovação`, projectId);
    } catch (err) {
      this.active.delete(coordinator.id);
      if (abort.signal.aborted) {
        this.log('warn', 'Planejamento interrompido', projectId);
        this.setAgentState(coordinator.id, 'idle');
        this.refreshCoordinator();
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      const current = this.requireProject(projectId);
      if (current.status === 'planning') this.saveProject({ ...current, status: 'failed', statusReason: `Falha no planejamento: ${msg}` });
      this.log('error', `Falha no planejamento: ${msg}`, projectId);
      this.setAgentState(coordinator.id, 'error', { detail: `Falha ao planejar "${project.name}"`, projectId });
      return;
    } finally {
      this.active.delete(coordinator.id);
    }
    this.refreshCoordinator();
  }

  pauseProject(projectId: string, reason = 'Pausado pelo administrador'): Project {
    const p = this.requireProject(projectId);
    if (p.status !== 'running') throw new EngineError('Só é possível pausar um projeto em execução', 409);
    const paused = this.saveProject({ ...p, status: 'paused', statusReason: reason });
    this.abortProjectWork(projectId, reason);
    this.log('warn', `Projeto pausado: ${reason}`, projectId);
    return paused;
  }

  resumeProject(projectId: string): Project {
    const p = this.requireProject(projectId);
    if (p.status !== 'paused') throw new EngineError('O projeto não está pausado', 409);
    if (p.costUsd !== null && p.costUsd >= p.budgetUsd) throw new EngineError('Orçamento do projeto esgotado', 409);
    for (const a of this.o.repo.listAgents()) {
      if (a.state === 'paused' && a.currentProjectId === projectId) this.setAgentState(a.id, 'idle');
    }
    const resumed = this.saveProject({ ...p, status: 'running', statusReason: null });
    this.log('info', 'Projeto retomado', projectId);
    this.schedule();
    return resumed;
  }

  cancelProject(projectId: string): Project {
    const p = this.requireProject(projectId);
    if (['completed', 'failed', 'cancelled'].includes(p.status)) throw new EngineError('O projeto já foi finalizado', 409);
    const cancelled = this.saveProject({ ...p, status: 'cancelled', statusReason: 'Cancelado pelo administrador' });
    for (const ap of this.o.repo.listApprovals({ status: 'pending', projectId })) {
      if (ap.kind === 'plan') this.saveApproval({ ...ap, status: 'expired', decidedAt: this.now(), reason: 'Projeto cancelado' });
    }
    this.abortProjectWork(projectId, 'Projeto cancelado');
    for (const t of this.o.repo.listTasks(projectId)) {
      if (!TERMINAL_TASK.has(t.status) && t.status !== 'running' && t.status !== 'awaiting_approval') this.saveTask({ ...t, status: 'cancelled' });
    }
    for (const a of this.o.repo.listAgents()) {
      if (a.state === 'paused' && a.currentProjectId === projectId) this.setAgentState(a.id, 'idle');
    }
    this.refreshCoordinator();
    this.log('warn', 'Projeto cancelado', projectId);
    return cancelled;
  }

  private abortProjectWork(projectId: string, reason: string): void {
    for (const ap of this.o.repo.listApprovals({ status: 'pending', projectId })) {
      if (ap.kind !== 'action') continue;
      this.saveApproval({ ...ap, status: 'expired', decidedAt: this.now(), reason });
      this.waiters.get(ap.id)?.({ approved: false, reason });
      this.waiters.delete(ap.id);
    }
    for (const work of this.active.values()) {
      if (work.projectId === projectId) work.abort.abort();
    }
  }

  // ---------------------------------------------------------------- aprovações

  decide(approvalId: string, decision: 'approve' | 'reject', reason?: string): Approval {
    const ap = this.o.repo.getApproval(approvalId);
    if (!ap) throw new EngineError('Aprovação não encontrada', 404);
    if (ap.status !== 'pending') throw new EngineError('Esta aprovação já foi decidida', 409);
    const approved = decision === 'approve';
    const decided = this.saveApproval({ ...ap, status: approved ? 'approved' : 'rejected', decidedAt: this.now(), reason: reason ?? null });
    this.log(approved ? 'info' : 'warn', `${approved ? 'Aprovado' : 'Rejeitado'}: ${ap.title}`, ap.projectId);

    if (ap.kind === 'plan') {
      const p = this.requireProject(ap.projectId);
      if (approved) {
        this.saveProject({ ...p, status: 'running', statusReason: null });
      } else {
        this.saveProject({ ...p, status: 'cancelled', statusReason: `Plano rejeitado${reason ? ': ' + reason : ''}` });
        for (const t of this.o.repo.listTasks(p.id)) this.saveTask({ ...t, status: 'cancelled' });
      }
      this.refreshCoordinator();
      this.schedule();
    } else {
      this.waiters.get(ap.id)?.({ approved, reason: reason ?? null });
      this.waiters.delete(ap.id);
    }
    return decided;
  }

  private pendingPlanApprovals(): Approval[] {
    return this.o.repo.listApprovals({ status: 'pending' }).filter((a) => a.kind === 'plan');
  }

  /** O coordenador aguarda o administrador enquanto houver plano pendente. */
  private refreshCoordinator(): void {
    const coord = this.agentByRole('coordinator');
    if (this.active.has(coord.id)) return;
    const pending = this.pendingPlanApprovals();
    if (pending.length) {
      this.setAgentState(coord.id, 'awaiting_approval', {
        detail: `${pending.length} plano(s) aguardando sua aprovação`,
        projectId: pending[0]!.projectId,
      });
    } else if (isEngagedState(coord.state)) {
      this.setAgentState(coord.id, 'done', { detail: 'Planos decididos' });
    }
  }

  // ---------------------------------------------------------------- agendamento

  /** Inicia todas as tarefas cujas dependências terminaram e que têm agente livre. */
  schedule(): void {
    const { repo } = this.o;
    for (const project of repo.listProjects()) {
      if (project.status !== 'running') continue;
      const tasks = repo.listTasks(project.id);
      const byId = new Map(tasks.map((t) => [t.id, t]));

      for (const task of tasks) {
        if (task.status !== 'pending') continue;
        const deps = task.dependsOn.map((d) => byId.get(d)!);
        if (deps.some((d) => d.status === 'failed' || d.status === 'blocked' || d.status === 'cancelled')) {
          const blocked = this.saveTask({ ...task, status: 'blocked', error: 'Uma tarefa da qual esta depende não foi concluída' });
          byId.set(blocked.id, blocked);
          continue;
        }
        if (!deps.every((d) => d.status === 'done')) continue;
        if (this.activeRuns() >= this.o.maxConcurrency) continue;
        const agent = repo.listAgents().find((a) => a.role === task.role && !this.active.has(a.id));
        if (!agent) continue;
        this.startRun(project, task, agent, deps);
        byId.set(task.id, repo.getTask(task.id)!);
      }
      this.checkCompletion(project.id);
    }
  }

  private activeRuns(): number {
    let n = 0;
    for (const w of this.active.values()) if (w.kind === 'run') n++;
    return n;
  }

  private checkCompletion(projectId: string): void {
    const project = this.requireProject(projectId);
    if (project.status !== 'running') return;
    const tasks = this.o.repo.listTasks(projectId);
    if (!tasks.every((t) => TERMINAL_TASK.has(t.status))) return;
    const ok = tasks.every((t) => t.status === 'done');
    this.saveProject({
      ...project,
      status: ok ? 'completed' : 'failed',
      statusReason: ok ? 'Todas as tarefas concluídas' : `${tasks.filter((t) => t.status !== 'done').length} tarefa(s) não concluída(s)`,
    });
    this.log(ok ? 'info' : 'error', ok ? 'Projeto concluído' : 'Projeto finalizado com falhas', projectId);
  }

  private startRun(project: Project, task: Task, agent: Agent, deps: Task[]): void {
    const abort = new AbortController();
    const run: Run = {
      id: this.o.ids('run'),
      projectId: project.id,
      taskId: task.id,
      agentId: agent.id,
      mode: this.o.mode,
      status: 'running',
      startedAt: this.now(),
      finishedAt: null,
      costUsd: null,
      turns: null,
      error: null,
    };
    this.active.set(agent.id, { kind: 'run', id: run.id, projectId: project.id, abort });
    this.saveRun(run, 'run.started');
    const started = this.saveTask({ ...task, status: 'running', agentId: agent.id, runId: run.id, attempts: task.attempts + 1, startedAt: run.startedAt, finishedAt: null, error: null });

    // Repasse de contexto: o agente recebe os resultados das tarefas anteriores.
    const handoffFrom = deps.map((d) => d.agentId).find((id) => id && id !== agent.id) ?? null;
    if (handoffFrom) {
      const from = this.o.repo.getAgent(handoffFrom);
      this.activity(run, { kind: 'handoff', state: 'talking', summary: `Recebendo resultados de ${from?.name ?? 'outro agente'}`, tool: null, detail: { fromAgentId: handoffFrom } }, handoffFrom);
    } else {
      this.activity(run, { kind: 'message', state: 'analyzing', summary: `Iniciando: ${task.title}`, tool: null, detail: null });
    }

    const workspaceDir = this.o.mode === 'real' ? this.o.workspaces.ensure(project.id) : this.o.workspaces.pathFor(project.id);
    const promise = this.o.runner
      .run({
        project,
        task: started,
        agent,
        dependencies: deps,
        workspaceDir,
        signal: abort.signal,
        report: (a) => {
          if (this.active.get(agent.id)?.id !== run.id) return; // execução já encerrada
          this.activity(run, { tool: null, detail: null, ...a });
        },
        requestApproval: (req) => this.requestActionApproval(run, req),
      })
      .catch((err): RunResult => ({
        status: abort.signal.aborted ? 'aborted' : 'failed',
        summary: null,
        error: err instanceof Error ? err.message : String(err),
        filesChanged: [],
        tests: null,
        costUsd: null,
        turns: null,
      }))
      .then((result) => this.finishRun(run.id, result))
      .catch((err) => console.error('[engine] falha ao finalizar execução', err));
    this.track(promise);
  }

  private requestActionApproval(run: Run, req: ApprovalRequest): Promise<ApprovalOutcome> {
    const active = this.active.get(run.agentId);
    if (!active || active.id !== run.id || active.abort.signal.aborted) {
      return Promise.resolve({ approved: false, reason: 'Execução encerrada' });
    }
    const approval = this.saveApproval({
      id: this.o.ids('apr'),
      projectId: run.projectId,
      taskId: run.taskId,
      agentId: run.agentId,
      kind: 'action',
      category: req.category,
      title: req.title,
      detail: req.detail,
      payload: req.payload ?? null,
      status: 'pending',
      createdAt: this.now(),
      decidedAt: null,
      reason: null,
    });
    const task = this.o.repo.getTask(run.taskId)!;
    this.saveTask({ ...task, status: 'awaiting_approval' });
    this.activity(run, { kind: 'approval', state: 'awaiting_approval', summary: `Aguardando aprovação: ${RISK_LABELS[req.category]}`, tool: null, detail: { approvalId: approval.id } });

    return new Promise<ApprovalOutcome>((resolve) => {
      this.waiters.set(approval.id, (outcome) => {
        const t = this.o.repo.getTask(run.taskId);
        if (t?.status === 'awaiting_approval') this.saveTask({ ...t, status: 'running' });
        if (this.active.get(run.agentId)?.id === run.id) {
          this.activity(run, {
            kind: 'approval',
            state: 'analyzing',
            summary: outcome.approved ? 'Aprovação recebida' : `Ação recusada${outcome.reason ? ': ' + outcome.reason : ''}`,
            tool: null,
            detail: { approvalId: approval.id, approved: outcome.approved },
          });
        }
        resolve(outcome);
      });
    });
  }

  private finishRun(runId: string, result: RunResult): void {
    const { repo } = this.o;
    const run = repo.getRun(runId)!;
    const task = repo.getTask(run.taskId)!;
    const project = this.requireProject(run.projectId);
    this.active.delete(run.agentId);
    for (const ap of repo.listApprovals({ status: 'pending', projectId: run.projectId })) {
      if (ap.taskId === run.taskId) {
        this.saveApproval({ ...ap, status: 'expired', decidedAt: this.now(), reason: 'Execução encerrada' });
        this.waiters.delete(ap.id);
      }
    }

    const finished = this.saveRun({ ...run, status: result.status, finishedAt: this.now(), costUsd: result.costUsd, turns: result.turns, error: result.error }, 'run.finished');
    const base = { ...task, filesChanged: result.filesChanged, tests: result.tests, costUsd: sumCost(task.costUsd, result.costUsd) };

    if (result.status === 'succeeded') {
      this.saveTask({ ...base, status: 'done', finishedAt: finished.finishedAt, summary: result.summary, error: null });
      this.setAgentState(run.agentId, 'done', { detail: `Concluiu: ${task.title}`, projectId: project.id, taskId: task.id });
    } else if (result.status === 'failed') {
      this.saveTask({ ...base, status: 'failed', finishedAt: finished.finishedAt, error: result.error ?? 'Falha sem detalhes' });
      this.setAgentState(run.agentId, 'error', { detail: `Erro em: ${task.title}`, projectId: project.id, taskId: task.id });
    } else {
      // Interrompida: volta para a fila e roda de novo quando o projeto for retomado.
      const cancelled = project.status === 'cancelled';
      this.saveTask({ ...base, status: cancelled ? 'cancelled' : 'pending', agentId: null, runId: null, error: result.error });
      this.setAgentState(run.agentId, cancelled ? 'idle' : 'paused', { detail: cancelled ? null : `Pausado: ${task.title}`, projectId: cancelled ? null : project.id });
    }

    if (result.costUsd !== null) {
      const p = this.requireProject(project.id);
      const updated = this.saveProject({ ...p, costUsd: sumCost(p.costUsd, result.costUsd) });
      if (updated.status === 'running' && updated.costUsd !== null && updated.costUsd >= updated.budgetUsd) {
        this.pauseProject(updated.id, `Orçamento de US$ ${updated.budgetUsd.toFixed(2)} atingido`);
      }
    }
    this.schedule();
  }

  // ---------------------------------------------------------------- estado dos agentes

  /**
   * Única forma de mudar o estado de um agente. Garante a regra principal da interface:
   * nenhum agente aparece trabalhando sem uma execução ou planejamento ativo.
   */
  setAgentState(agentId: string, state: AgentState, opts: { detail?: string | null; projectId?: string | null; taskId?: string | null; withAgentId?: string | null } = {}): Agent {
    const agent = this.o.repo.getAgent(agentId);
    if (!agent) throw new EngineError('Agente não encontrado', 404);
    if (isEngagedState(state) && !this.isEngaged(agent)) {
      throw new EngineError(`Estado "${state}" exige uma execução ativa para ${agent.name}`, 500);
    }
    const work = this.active.get(agentId);
    const keepContext = state !== 'idle';
    return this.saveAgent({
      ...agent,
      state,
      stateDetail: opts.detail ?? null,
      stateSince: agent.state === state ? agent.stateSince : this.now(),
      currentProjectId: keepContext ? (opts.projectId ?? work?.projectId ?? agent.currentProjectId) : null,
      currentTaskId: keepContext ? (opts.taskId ?? (work?.kind === 'run' ? this.o.repo.getRun(work.id)?.taskId : null) ?? (state === 'done' || state === 'error' ? agent.currentTaskId : null)) : null,
      withAgentId: state === 'talking' ? (opts.withAgentId ?? null) : null,
    });
  }

  private isEngaged(agent: Agent): boolean {
    if (this.active.has(agent.id)) return true;
    return agent.role === 'coordinator' && this.pendingPlanApprovals().length > 0;
  }

  private activity(run: Run, activity: Activity, withAgentId: string | null = null): void {
    this.o.bus.emit({ type: 'run.activity', activity, projectId: run.projectId, agentId: run.agentId, taskId: run.taskId, runId: run.id });
    this.setAgentState(run.agentId, activity.state, { detail: activity.summary, projectId: run.projectId, taskId: run.taskId, withAgentId });
  }

  // ---------------------------------------------------------------- persistência + eventos

  private saveAgent(agent: Agent): Agent {
    this.o.repo.upsertAgent(agent);
    this.o.bus.emit({ type: 'agent.upserted', agent, agentId: agent.id, projectId: agent.currentProjectId, taskId: agent.currentTaskId });
    return agent;
  }
  private saveProject(project: Project): Project {
    const p = { ...project, updatedAt: this.now() };
    this.o.repo.upsertProject(p);
    this.o.bus.emit({ type: 'project.upserted', project: p, projectId: p.id });
    return p;
  }
  private saveTask(task: Task): Task {
    this.o.repo.upsertTask(task);
    this.o.bus.emit({ type: 'task.upserted', task, projectId: task.projectId, taskId: task.id, agentId: task.agentId, runId: task.runId });
    return task;
  }
  private saveApproval(approval: Approval): Approval {
    this.o.repo.upsertApproval(approval);
    this.o.bus.emit({ type: 'approval.upserted', approval, projectId: approval.projectId, agentId: approval.agentId, taskId: approval.taskId });
    return approval;
  }
  private saveRun(run: Run, type: 'run.started' | 'run.finished'): Run {
    this.o.repo.upsertRun(run);
    this.o.bus.emit({ type, run, projectId: run.projectId, agentId: run.agentId, taskId: run.taskId, runId: run.id });
    return run;
  }
  private log(level: 'info' | 'warn' | 'error', message: string, projectId: string | null = null): void {
    this.o.bus.emit({ type: 'log', level, message, projectId });
  }

  // ---------------------------------------------------------------- utilidades

  private track<T>(p: Promise<T>): Promise<T> {
    this.running.add(p);
    void p.finally(() => this.running.delete(p)).catch(() => undefined);
    return p;
  }
  private now(): string {
    return this.o.clock.now();
  }
  private requireProject(id: string): Project {
    const p = this.o.repo.getProject(id);
    if (!p) throw new EngineError('Projeto não encontrado', 404);
    return p;
  }
  private agentByRole(role: Agent['role']): Agent {
    const a = this.o.repo.listAgents().find((x) => x.role === role);
    if (!a) throw new EngineError(`Nenhum agente com o cargo ${role}`, 500);
    return a;
  }
}

function sumCost(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}
