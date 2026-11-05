import type { AgentState, FileChange, TestResult, WorkerRole } from '@acc/shared';
import { AbortedError, sleep } from '../util/runtime.ts';
import type { RunContext, RunResult, Runner } from './runner.ts';

interface Step {
  state: AgentState;
  tool: string | null;
  summary: string;
  ms: number;
  file?: FileChange;
}

const SCRIPTS: Record<WorkerRole, Step[]> = {
  designer: [
    { state: 'analyzing', tool: 'Read', summary: 'Lendo a descrição do projeto', ms: 2500 },
    { state: 'analyzing', tool: 'Glob', summary: 'Procurando componentes existentes', ms: 1500 },
    { state: 'typing', tool: 'Write', summary: 'Criando design/wireframes.md', ms: 3500, file: { path: 'design/wireframes.md', change: 'created' } },
    { state: 'typing', tool: 'Write', summary: 'Criando design/tokens.css', ms: 3000, file: { path: 'design/tokens.css', change: 'created' } },
    { state: 'analyzing', tool: 'Read', summary: 'Revisando contraste e acessibilidade', ms: 2000 },
  ],
  programmer: [
    { state: 'analyzing', tool: 'Read', summary: 'Lendo protótipo e requisitos', ms: 2000 },
    { state: 'typing', tool: 'Write', summary: 'Criando src/app.ts', ms: 4000, file: { path: 'src/app.ts', change: 'created' } },
    { state: 'typing', tool: 'Edit', summary: 'Editando src/routes.ts', ms: 3500, file: { path: 'src/routes.ts', change: 'modified' } },
    { state: 'analyzing', tool: 'Bash', summary: 'Compilando: npx tsc --noEmit', ms: 2500 },
  ],
  tester: [
    { state: 'analyzing', tool: 'Grep', summary: 'Mapeando fluxos a testar', ms: 2000 },
    { state: 'typing', tool: 'Write', summary: 'Criando tests/app.test.ts', ms: 3500, file: { path: 'tests/app.test.ts', change: 'created' } },
    { state: 'testing', tool: 'Bash', summary: 'Executando: npm test', ms: 5000 },
  ],
};

/**
 * Executor do MODO DEMONSTRAÇÃO. Segue um roteiro fixo, não chama IA, não grava arquivos
 * e não executa comandos. Gera os mesmos tipos de evento do modo real para testar a interface.
 *
 * Para ver estados de erro, inclua "#erro" na descrição do projeto.
 */
export class DemoRunner implements Runner {
  readonly kind = 'demo' as const;
  constructor(private readonly speed = 1) {}

  async run(ctx: RunContext): Promise<RunResult> {
    const files: FileChange[] = [];
    const forceError = ctx.project.description.includes('#erro');
    try {
      for (const [i, step] of SCRIPTS[ctx.task.role].entries()) {
        ctx.report({ kind: 'tool', state: step.state, tool: step.tool, summary: step.summary, detail: { demo: true } });
        await sleep(step.ms / this.speed, ctx.signal);
        if (step.file) files.push(step.file);

        // O programador pede para instalar uma dependência: passa pela fila de aprovação.
        if (ctx.task.role === 'programmer' && i === 1) {
          const outcome = await ctx.requestApproval({
            category: 'install',
            title: 'Instalar dependência "zod"',
            detail: '[DEMONSTRAÇÃO] O agente quer executar: npm install zod',
            payload: { tool: 'Bash', input: { command: 'npm install zod' }, demo: true },
          });
          ctx.report({
            kind: 'approval',
            state: 'analyzing',
            summary: outcome.approved ? 'Dependência aprovada (demo: nada foi instalado)' : 'Dependência recusada: seguindo sem ela',
          });
          if (outcome.approved) files.push({ path: 'package.json', change: 'modified' });
        }
      }

      let tests: TestResult | null = null;
      if (ctx.task.role === 'tester') {
        tests = forceError
          ? { command: 'npm test', total: 12, passed: 10, failed: 2, output: '[DEMONSTRAÇÃO] 2 testes falharam em tests/app.test.ts' }
          : { command: 'npm test', total: 12, passed: 12, failed: 0, output: '[DEMONSTRAÇÃO] 12 testes passaram' };
      }
      if (tests && tests.failed > 0) {
        return { status: 'failed', summary: null, error: `${tests.failed} de ${tests.total} testes falharam (demonstração)`, filesChanged: files, tests, costUsd: null, turns: null };
      }
      return {
        status: 'succeeded',
        summary: `[DEMONSTRAÇÃO] ${ctx.task.title}: roteiro concluído. Nenhum arquivo real foi criado.`,
        error: null,
        filesChanged: files,
        tests,
        costUsd: null,
        turns: null,
      };
    } catch (err) {
      if (err instanceof AbortedError || ctx.signal.aborted) {
        return { status: 'aborted', summary: null, error: 'Interrompido pelo administrador', filesChanged: files, tests: null, costUsd: null, turns: null };
      }
      throw err;
    }
  }
}
