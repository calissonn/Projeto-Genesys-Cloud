/**
 * Lista de chamadas PERMITIDAS. Tudo o que não estiver aqui é bloqueado antes
 * de sair do servidor — garante que o sistema nunca altere fluxos da Genesys.
 * Os POST listados são apenas consultas (query/jobs de analytics e journey).
 * Fonte: especificação OpenAPI oficial (ver docs/GENESYS_API.md).
 */
const RULES: { method: 'GET' | 'POST'; pattern: RegExp }[] = [
  // Analytics — fluxos
  { method: 'POST', pattern: /^\/api\/v2\/analytics\/flows\/aggregates\/query$/ },
  { method: 'POST', pattern: /^\/api\/v2\/analytics\/flows\/aggregates\/jobs$/ },
  { method: 'GET', pattern: /^\/api\/v2\/analytics\/flows\/aggregates\/jobs\/[\w-]+(\/results)?$/ },
  { method: 'POST', pattern: /^\/api\/v2\/analytics\/flows\/observations\/query$/ },
  { method: 'POST', pattern: /^\/api\/v2\/analytics\/flows\/activity\/query$/ },
  // Analytics — conversas
  { method: 'POST', pattern: /^\/api\/v2\/analytics\/conversations\/aggregates\/query$/ },
  { method: 'POST', pattern: /^\/api\/v2\/analytics\/conversations\/details\/query$/ },
  { method: 'POST', pattern: /^\/api\/v2\/analytics\/conversations\/details\/jobs$/ },
  { method: 'GET', pattern: /^\/api\/v2\/analytics\/conversations\/details\/jobs\/availability$/ },
  { method: 'GET', pattern: /^\/api\/v2\/analytics\/conversations\/details\/jobs\/[\w-]+(\/results)?$/ },
  { method: 'POST', pattern: /^\/api\/v2\/analytics\/ratelimits\/aggregates\/query$/ },
  // Architect — somente leitura
  { method: 'GET', pattern: /^\/api\/v2\/flows$/ },
  { method: 'GET', pattern: /^\/api\/v2\/flows\/lookup$/ },
  { method: 'GET', pattern: /^\/api\/v2\/flows\/divisionviews$/ },
  { method: 'GET', pattern: /^\/api\/v2\/flows\/[\w-]+$/ },
  { method: 'GET', pattern: /^\/api\/v2\/flows\/[\w-]+\/latestconfiguration$/ },
  { method: 'GET', pattern: /^\/api\/v2\/flows\/[\w-]+\/versions$/ },
  { method: 'GET', pattern: /^\/api\/v2\/flows\/[\w-]+\/versions\/[\w.-]+(\/configuration)?$/ },
  { method: 'GET', pattern: /^\/api\/v2\/flows\/milestones(\/[\w-]+)?$/ },
  { method: 'GET', pattern: /^\/api\/v2\/flows\/outcomes(\/[\w-]+)?$/ },
  { method: 'GET', pattern: /^\/api\/v2\/flows\/instances\/querycapabilities$/ },
  { method: 'GET', pattern: /^\/api\/v2\/flows\/instances\/settings\/executiondata$/ },
  { method: 'GET', pattern: /^\/api\/v2\/architect\/ivrs$/ },
  // Roteamento e Journey
  { method: 'GET', pattern: /^\/api\/v2\/routing\/queues$/ },
  { method: 'POST', pattern: /^\/api\/v2\/journey\/flows\/paths\/query$/ },
];

/** Caminhos do tipo /flows/{id} que são AÇÕES e nunca podem ser chamados, mesmo que casem com padrões genéricos. */
const DENY = /^\/api\/v2\/flows\/(actions|executions|jobs|export|validate|datatables|instances\/jobs)(\/|$)/;

export function isAllowed(method: string, path: string): boolean {
  const m = method.toUpperCase();
  if (DENY.test(path)) return false;
  return RULES.some((r) => r.method === m && r.pattern.test(path));
}
