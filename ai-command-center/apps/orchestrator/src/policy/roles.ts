import type { Agent, AgentRole } from '@acc/shared';

export interface RoleProfile {
  role: AgentRole;
  title: string;
  department: string;
  floor: number;
  specialty: string;
  /** Ferramentas do Claude Code liberadas sem aprovação (usadas no modo real). */
  allowedTools: string[];
  /** Prefixos de comandos Bash liberados sem aprovação. */
  allowedBash: string[];
}

const READ_TOOLS = ['Read', 'Glob', 'Grep', 'LS'];
const WRITE_TOOLS = ['Edit', 'Write', 'MultiEdit'];

export const ROLE_PROFILES: Record<AgentRole, RoleProfile> = {
  coordinator: {
    role: 'coordinator',
    title: 'Coordenadora de Projetos',
    department: 'Diretoria',
    floor: 5,
    specialty: 'Análise de requisitos, planejamento e distribuição de tarefas',
    allowedTools: [],
    allowedBash: [],
  },
  programmer: {
    role: 'programmer',
    title: 'Programador',
    department: 'Desenvolvimento',
    floor: 4,
    specialty: 'TypeScript, APIs e lógica de aplicação',
    allowedTools: [...READ_TOOLS, ...WRITE_TOOLS],
    allowedBash: ['ls', 'cat', 'pwd', 'node ', 'npx tsc', 'npm run build', 'npm test', 'npm run test', 'git status', 'git diff', 'git add', 'git commit'],
  },
  designer: {
    role: 'designer',
    title: 'Designer de Interface',
    department: 'Design',
    floor: 3,
    specialty: 'Layouts, protótipos, HTML/CSS e acessibilidade',
    allowedTools: [...READ_TOOLS, ...WRITE_TOOLS],
    allowedBash: ['ls', 'cat', 'pwd'],
  },
  tester: {
    role: 'tester',
    title: 'Analista de Testes',
    department: 'Qualidade',
    floor: 2,
    specialty: 'Testes automatizados, validação e revisão de segurança',
    allowedTools: [...READ_TOOLS, ...WRITE_TOOLS],
    allowedBash: ['ls', 'cat', 'pwd', 'npm test', 'npm run test', 'npx vitest', 'node --test', 'npx tsc'],
  },
};

export function defaultAgents(now: string): Agent[] {
  const people: { id: string; name: string; role: AgentRole }[] = [
    { id: 'ag-coordinator', name: 'Ada', role: 'coordinator' },
    { id: 'ag-programmer', name: 'Téo', role: 'programmer' },
    { id: 'ag-designer', name: 'Lia', role: 'designer' },
    { id: 'ag-tester', name: 'Davi', role: 'tester' },
  ];
  return people.map(({ id, name, role }) => {
    const p = ROLE_PROFILES[role];
    return {
      id,
      name,
      role,
      title: p.title,
      department: p.department,
      floor: p.floor,
      specialty: p.specialty,
      state: 'idle',
      stateDetail: null,
      stateSince: now,
      currentProjectId: null,
      currentTaskId: null,
      withAgentId: null,
    };
  });
}
