import { Plan, type PlanTask } from '@acc/shared';

export interface PlanRequest {
  name: string;
  description: string;
}

/** Elabora o plano de um projeto. Demo: regras locais. Real (Etapa 4): Claude via Agent SDK. */
export interface Planner {
  plan(request: PlanRequest, signal: AbortSignal): Promise<Plan>;
}

export class PlanValidationError extends Error {}

/**
 * Valida o plano: formato, chaves únicas, dependências existentes e ausência de ciclos.
 * Devolve as tarefas em ordem topológica.
 */
export function validatePlan(raw: unknown): Plan {
  const parsed = Plan.safeParse(raw);
  if (!parsed.success) {
    throw new PlanValidationError('Plano inválido: ' + parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  const plan = parsed.data;
  const byKey = new Map<string, PlanTask>();
  for (const t of plan.tasks) {
    if (byKey.has(t.key)) throw new PlanValidationError(`Chave de tarefa repetida: ${t.key}`);
    byKey.set(t.key, t);
  }
  for (const t of plan.tasks) {
    for (const d of t.dependsOn) {
      if (!byKey.has(d)) throw new PlanValidationError(`Tarefa "${t.key}" depende de "${d}", que não existe`);
      if (d === t.key) throw new PlanValidationError(`Tarefa "${t.key}" depende de si mesma`);
    }
  }
  // Ordenação topológica (Kahn) para detectar ciclos.
  const indeg = new Map(plan.tasks.map((t) => [t.key, t.dependsOn.length]));
  const queue = plan.tasks.filter((t) => t.dependsOn.length === 0).map((t) => t.key);
  const ordered: PlanTask[] = [];
  while (queue.length) {
    const key = queue.shift()!;
    ordered.push(byKey.get(key)!);
    for (const t of plan.tasks) {
      if (t.dependsOn.includes(key)) {
        const n = indeg.get(t.key)! - 1;
        indeg.set(t.key, n);
        if (n === 0) queue.push(t.key);
      }
    }
  }
  if (ordered.length !== plan.tasks.length) throw new PlanValidationError('O plano contém dependências circulares');
  return { ...plan, tasks: ordered };
}
