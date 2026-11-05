import type { RiskCategory } from '@acc/shared';
import path from 'node:path';
import { ROLE_PROFILES, type RoleProfile } from './roles.ts';

export interface RiskVerdict {
  requiresApproval: boolean;
  category: RiskCategory | null;
  reason: string;
}

const RULES: { category: RiskCategory; pattern: RegExp; reason: string }[] = [
  { category: 'deploy', pattern: /\b(vercel|netlify|fly (deploy|launch)|firebase deploy|gh-pages|heroku|kubectl|terraform apply|docker push|npm publish|wrangler (deploy|publish))\b/, reason: 'publica a aplicação' },
  { category: 'production', pattern: /\b(prod|production)\b.*\b(migrate|deploy|apply|restart)\b|\b(migrate|deploy|apply)\b.*\b(prod|production)\b/i, reason: 'altera produção' },
  { category: 'git_push', pattern: /\bgit\s+push\b/, reason: 'envia código para repositório remoto' },
  { category: 'delete', pattern: /(^|[\s;&|])(rm|rmdir|shred|unlink)\s|\bgit\s+(clean|reset\s+--hard)\b|\bDROP\s+(TABLE|DATABASE)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i, reason: 'exclui arquivos ou dados' },
  { category: 'install', pattern: /\b(npm|pnpm|yarn|bun)\s+(i|install|add)\b|\bnpx\s+(-y|--yes)\b|\bpip3?\s+install\b|\b(apt|apt-get|brew)\s+install\b/, reason: 'instala dependências' },
  { category: 'financial', pattern: /\b(stripe|paypal|pagseguro|mercadopago|pix)\b.*\b(charge|payment|transfer|payout|cobran)/i, reason: 'operação financeira' },
  { category: 'external_communication', pattern: /\b(sendmail|mail\s|smtp|twilio|slack|discord|telegram|whatsapp)\b/i, reason: 'envia comunicação externa' },
  { category: 'network', pattern: /\b(curl|wget|ssh|scp|rsync|nc|ftp)\b/, reason: 'acessa a rede' },
];

const NETWORK_TOOLS = new Set(['WebFetch', 'WebSearch']);

function isInside(root: string, file: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(root, file));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function commandOf(input: unknown): string {
  return typeof input === 'object' && input && 'command' in input ? String((input as { command: unknown }).command) : '';
}

/**
 * Decide se uma ação pedida por um agente pode seguir direto ou precisa de aprovação humana.
 * Regra geral: tudo que não está explicitamente permitido para o cargo exige aprovação.
 */
export function classifyAction(profile: RoleProfile, tool: string, input: unknown, workspaceRoot?: string): RiskVerdict {
  const filePath = typeof input === 'object' && input && 'file_path' in input ? String((input as { file_path: unknown }).file_path) : null;
  if (filePath && workspaceRoot && !isInside(workspaceRoot, filePath)) {
    return { requiresApproval: true, category: 'other', reason: `arquivo fora do workspace do projeto: ${filePath}` };
  }
  if (NETWORK_TOOLS.has(tool)) return { requiresApproval: true, category: 'network', reason: 'acessa a internet' };

  if (tool === 'Bash') {
    const cmd = commandOf(input).trim();
    for (const rule of RULES) {
      if (rule.pattern.test(cmd)) return { requiresApproval: true, category: rule.category, reason: rule.reason };
    }
    // Comandos encadeados ou com redirecionamentos/substituições não são liberados automaticamente.
    const chained = /[;&|`]|\$\(|>\s*\/|<\(/.test(cmd);
    const allowed =
      !chained &&
      profile.allowedBash.some((prefix) => {
        const p = prefix.trim();
        return cmd === p || cmd.startsWith(p + ' ');
      });
    return allowed
      ? { requiresApproval: false, category: null, reason: 'comando permitido para o cargo' }
      : { requiresApproval: true, category: 'other', reason: `comando fora da lista permitida: ${cmd.slice(0, 120)}` };
  }

  if (profile.allowedTools.includes(tool)) return { requiresApproval: false, category: null, reason: 'ferramenta permitida para o cargo' };
  return { requiresApproval: true, category: 'other', reason: `ferramenta ${tool} não liberada para ${profile.title}` };
}

export { ROLE_PROFILES };
