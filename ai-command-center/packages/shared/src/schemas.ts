import { z } from 'zod';
import { WORKER_ROLES } from './domain.ts';

export const CreateProjectInput = z.object({
  name: z.string().trim().min(3, 'Nome muito curto').max(80),
  description: z.string().trim().min(10, 'Descreva o sistema com mais detalhes').max(4000),
  budgetUsd: z.number().positive().max(100).optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export const DecisionInput = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(500).optional(),
});
export type DecisionInput = z.infer<typeof DecisionInput>;

/** Plano produzido pelo coordenador (validado antes de virar tarefas). */
export const PlanTask = z.object({
  key: z.string().regex(/^[a-z0-9-]{1,40}$/, 'chave inválida'),
  title: z.string().min(3).max(120),
  description: z.string().min(3).max(2000),
  role: z.enum(WORKER_ROLES),
  dependsOn: z.array(z.string()).max(10).default([]),
  acceptanceCriteria: z.array(z.string().max(300)).max(10).default([]),
});
export const Plan = z.object({
  summary: z.string().min(3).max(2000),
  tasks: z.array(PlanTask).min(1).max(12),
});
export type Plan = z.infer<typeof Plan>;
export type PlanTask = z.infer<typeof PlanTask>;
