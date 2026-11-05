import { describe, expect, it } from 'vitest';
import { DemoPlanner } from '../src/coordinator/demoPlanner.ts';
import { PlanValidationError, validatePlan } from '../src/coordinator/planner.ts';

const t = (key: string, dependsOn: string[] = []) => ({ key, title: `Tarefa ${key}`, description: 'descrição', role: 'programmer' as const, dependsOn, acceptanceCriteria: [] });

describe('validação do plano', () => {
  it('ordena por dependências', () => {
    const plan = validatePlan({ summary: 'plano ok', tasks: [t('c', ['b']), t('a'), t('b', ['a'])] });
    expect(plan.tasks.map((x) => x.key)).toEqual(['a', 'b', 'c']);
  });
  it('rejeita ciclos', () => {
    expect(() => validatePlan({ summary: 'plano', tasks: [t('a', ['b']), t('b', ['a'])] })).toThrow(/circulares/);
  });
  it('rejeita dependência inexistente', () => {
    expect(() => validatePlan({ summary: 'plano', tasks: [t('a', ['z'])] })).toThrow(PlanValidationError);
  });
  it('rejeita chave repetida', () => {
    expect(() => validatePlan({ summary: 'plano', tasks: [t('a'), t('a')] })).toThrow(/repetida/);
  });
  it('rejeita formato inválido (ex.: cargo desconhecido)', () => {
    expect(() => validatePlan({ summary: 'plano', tasks: [{ ...t('a'), role: 'hacker' }] })).toThrow(/Plano inválido/);
  });
});

describe('planejador demo', () => {
  const signal = new AbortController().signal;
  it('gera plano válido e identificado como demonstração', async () => {
    const plan = validatePlan(await new DemoPlanner(1000).plan({ name: 'Site', description: 'Uma página institucional simples' }, signal));
    expect(plan.summary).toContain('DEMONSTRAÇÃO');
    expect(plan.tasks.map((x) => x.role)).toEqual(['designer', 'programmer', 'tester']);
  });
  it('inclui backend quando a descrição pede', async () => {
    const plan = validatePlan(await new DemoPlanner(1000).plan({ name: 'Loja', description: 'Loja com login e API de pedidos' }, signal));
    expect(plan.tasks.find((x) => x.key === 'backend')?.role).toBe('programmer');
    expect(plan.tasks.find((x) => x.key === 'frontend')?.dependsOn).toEqual(['layout', 'backend']);
  });
});
