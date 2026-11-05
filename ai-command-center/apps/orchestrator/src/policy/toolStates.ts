import type { AgentState } from '@acc/shared';

const ANALYZE_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'WebFetch', 'WebSearch', 'TodoWrite', 'Task']);
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const TEST_COMMAND = /(^|[\s;&|])(npm (run )?test|npx (vitest|jest|playwright)|vitest|jest|pytest|node --test|go test|cargo test)\b/;

/** Traduz o uso de uma ferramenta do Claude Code no estado visual correspondente. */
export function stateForTool(tool: string, input: unknown): AgentState {
  if (WRITE_TOOLS.has(tool)) return 'typing';
  if (tool === 'Bash') {
    const cmd = typeof input === 'object' && input && 'command' in input ? String((input as { command: unknown }).command) : '';
    return TEST_COMMAND.test(cmd) ? 'testing' : 'analyzing';
  }
  if (ANALYZE_TOOLS.has(tool)) return 'analyzing';
  return 'analyzing';
}

export function isTestCommand(command: string): boolean {
  return TEST_COMMAND.test(command);
}
