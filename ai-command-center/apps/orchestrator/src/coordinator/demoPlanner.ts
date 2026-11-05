import type { Plan, PlanTask } from '@acc/shared';
import { sleep } from '../util/runtime.ts';
import type { PlanRequest, Planner } from './planner.ts';

/**
 * Planejador do MODO DEMONSTRAÇÃO: monta um plano com regras fixas, sem IA.
 * O resultado é claramente identificado como demonstração.
 */
export class DemoPlanner implements Planner {
  constructor(private readonly speed = 1) {}

  async plan(req: PlanRequest, signal: AbortSignal): Promise<Plan> {
    await sleep(3500 / this.speed, signal);
    const text = req.description.toLowerCase();
    const needsBackend = /\b(api|backend|servidor|banco|dados|login|cadastro)\b/.test(text);

    const tasks: PlanTask[] = [
      {
        key: 'layout',
        title: `Protótipo de interface de "${req.name}"`,
        description: 'Definir fluxo de telas, componentes e estilos a partir da descrição.',
        role: 'designer',
        dependsOn: [],
        acceptanceCriteria: ['Telas principais definidas', 'Paleta e tipografia documentadas'],
      },
    ];
    if (needsBackend) {
      tasks.push({
        key: 'backend',
        title: 'API e modelo de dados',
        description: 'Criar rotas, validação de entrada e persistência.',
        role: 'programmer',
        dependsOn: [],
        acceptanceCriteria: ['Rotas principais respondem', 'Entradas validadas'],
      });
    }
    tasks.push(
      {
        key: 'frontend',
        title: 'Implementar telas e funcionalidades',
        description: 'Transformar o protótipo em componentes funcionais.',
        role: 'programmer',
        dependsOn: needsBackend ? ['layout', 'backend'] : ['layout'],
        acceptanceCriteria: ['Fluxo principal funcionando'],
      },
      {
        key: 'tests',
        title: 'Testes automatizados e validação',
        description: 'Escrever e executar testes do fluxo principal.',
        role: 'tester',
        dependsOn: ['frontend'],
        acceptanceCriteria: ['Testes do fluxo principal passando'],
      },
    );
    return {
      summary: `[DEMONSTRAÇÃO] Plano gerado por regras locais, sem IA: ${tasks.length} tarefas para "${req.name}".`,
      tasks,
    };
  }
}
