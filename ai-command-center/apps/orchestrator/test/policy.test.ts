import { describe, expect, it } from 'vitest';
import { classifyAction } from '../src/policy/riskClassifier.ts';
import { ROLE_PROFILES } from '../src/policy/roles.ts';
import { stateForTool } from '../src/policy/toolStates.ts';

const prog = ROLE_PROFILES.programmer;
const designer = ROLE_PROFILES.designer;
const bash = (command: string) => ({ command });

describe('classificação de risco', () => {
  it.each([
    ['npm install zod', 'install'],
    ['pnpm add react', 'install'],
    ['rm -rf src', 'delete'],
    ['git push origin main', 'git_push'],
    ['vercel --prod', 'deploy'],
    ['npm publish', 'deploy'],
    ['curl https://exemplo.com', 'network'],
    ['git reset --hard HEAD~1', 'delete'],
  ])('"%s" exige aprovação (%s)', (cmd, category) => {
    const v = classifyAction(prog, 'Bash', bash(cmd));
    expect(v.requiresApproval).toBe(true);
    expect(v.category).toBe(category);
  });

  it('libera comandos da lista do cargo', () => {
    expect(classifyAction(prog, 'Bash', bash('npm test')).requiresApproval).toBe(false);
    expect(classifyAction(prog, 'Bash', bash('npx tsc --noEmit')).requiresApproval).toBe(false);
  });

  it('não libera prefixos parecidos nem comandos encadeados', () => {
    expect(classifyAction(prog, 'Bash', bash('npm testx')).requiresApproval).toBe(true);
    expect(classifyAction(prog, 'Bash', bash('npm test && echo oi')).requiresApproval).toBe(true);
    expect(classifyAction(prog, 'Bash', bash('ls $(whoami)')).requiresApproval).toBe(true);
  });

  it('designer não pode rodar testes sem aprovação', () => {
    expect(classifyAction(designer, 'Bash', bash('npm test')).requiresApproval).toBe(true);
  });

  it('acesso à internet sempre exige aprovação', () => {
    expect(classifyAction(prog, 'WebFetch', { url: 'https://x' })).toMatchObject({ requiresApproval: true, category: 'network' });
  });

  it('bloqueia escrita fora do workspace', () => {
    const ws = '/tmp/ws/prj_1';
    expect(classifyAction(prog, 'Write', { file_path: '/tmp/ws/prj_1/src/a.ts' }, ws).requiresApproval).toBe(false);
    expect(classifyAction(prog, 'Write', { file_path: 'src/a.ts' }, ws).requiresApproval).toBe(false);
    expect(classifyAction(prog, 'Write', { file_path: '/etc/passwd' }, ws).requiresApproval).toBe(true);
    expect(classifyAction(prog, 'Edit', { file_path: '../outro/a.ts' }, ws).requiresApproval).toBe(true);
  });
});

describe('ferramenta → estado visual', () => {
  it('mapeia as ferramentas do Claude Code', () => {
    expect(stateForTool('Read', {})).toBe('analyzing');
    expect(stateForTool('Grep', {})).toBe('analyzing');
    expect(stateForTool('Edit', {})).toBe('typing');
    expect(stateForTool('Write', {})).toBe('typing');
    expect(stateForTool('Bash', { command: 'npm test' })).toBe('testing');
    expect(stateForTool('Bash', { command: 'npx vitest run' })).toBe('testing');
    expect(stateForTool('Bash', { command: 'ls -la' })).toBe('analyzing');
  });
});
