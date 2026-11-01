/**
 * Catálogo das APIs da Genesys Cloud usadas pelo Gazin URA Intelligence (SOMENTE LEITURA).
 *
 * Fonte: especificação OpenAPI oficial da Genesys Cloud Platform API (swagger.json
 * publicado no repositório oficial MyPureCloud/platform-client-sdk-javascript,
 * SDK v265.0.0), conferida em 01/11/2026. Métodos, caminhos, permissões, escopos,
 * métricas e dimensões abaixo foram extraídos dessa especificação — não inventados.
 * Limites numéricos (rate limits, tamanho de intervalo) NÃO constam da especificação
 * e devem ser confirmados em developer.genesys.cloud antes da implementação.
 * Detalhes completos: docs/GENESYS_API.md
 */

export interface GenesysEndpoint {
  id: string;
  method: 'GET' | 'POST';
  path: string;
  purpose: string;
  indicators: number[]; // itens 1–10 da lista de indicadores
  permissions: string[];
  permissionMode: 'ANY' | 'ALL';
  scopes: string[];
  keyParams: string;
  limitations: string;
  /** POST que apenas consulta (não altera configuração). */
  readOnlyPost?: boolean;
}

export const INDICATORS = [
  'Entradas nas URAs',
  'Desligamentos dentro dos fluxos',
  'Tempo médio de permanência',
  'Fluxos existentes no Architect',
  'Destinos e transferências',
  'Flow Outcomes',
  'Flow Milestones',
  'Falhas de identificação / tentativas de CPF',
  'Histórico de desempenho',
  'Indicadores para mapas de jornada',
];

export const FLOW_METRICS = ['nFlow', 'nFlowMilestone', 'nFlowOutcome', 'nFlowOutcomeFailed', 'oFlowMilestone', 'tFlow', 'tFlowDisconnect', 'tFlowExit', 'tFlowOutcome'];

export const GENESYS_ENDPOINTS: GenesysEndpoint[] = [
  {
    id: 'flows-agg', method: 'POST', path: '/api/v2/analytics/flows/aggregates/query', readOnlyPost: true,
    purpose: 'Métricas agregadas de fluxos: entradas, desligamentos, saídas, tempo, outcomes e milestones, agrupáveis por fluxo, versão, destino, motivo de saída etc.',
    indicators: [1, 2, 3, 5, 6, 7, 8, 9],
    permissions: ['analytics:flowAggregate:view'], permissionMode: 'ANY', scopes: ['analytics', 'analytics:readonly'],
    keyParams: 'Body FlowAggregationQuery — obrigatórios: interval, metrics. Opcionais: granularity, timeZone, groupBy, filter, views, flattenMultivaluedDimensions, alternateTimeDimension.',
    limitations: 'Consulta síncrona: indicada para janelas curtas. Para históricos longos use a versão assíncrona (jobs). Limite de intervalo e de requisições: confirmar na documentação.',
  },
  {
    id: 'flows-agg-jobs', method: 'POST', path: '/api/v2/analytics/flows/aggregates/jobs', readOnlyPost: true,
    purpose: 'Mesma consulta de agregados, executada de forma assíncrona (para sincronização histórica). Retorna jobId.',
    indicators: [9], permissions: ['analytics:flowAggregate:view'], permissionMode: 'ANY', scopes: ['analytics', 'analytics:readonly'],
    keyParams: 'Body FlowAsyncAggregationQuery — interval, metrics (obrigatórios) + pageSize.',
    limitations: 'Exige polling do status (QUEUED, PENDING, FAILED, CANCELLED, FULFILLED, EXPIRED) e paginação por cursor. Resultados expiram (expirationDate).',
  },
  {
    id: 'flows-agg-job-status', method: 'GET', path: '/api/v2/analytics/flows/aggregates/jobs/{jobId}',
    purpose: 'Status do job assíncrono de agregados de fluxo.', indicators: [9],
    permissions: ['analytics:flowAggregate:view'], permissionMode: 'ANY', scopes: ['analytics', 'analytics:readonly'],
    keyParams: 'path jobId', limitations: 'Fazer polling com intervalo e backoff para não consumir limite de requisições.',
  },
  {
    id: 'flows-agg-job-results', method: 'GET', path: '/api/v2/analytics/flows/aggregates/jobs/{jobId}/results',
    purpose: 'Página de resultados do job assíncrono.', indicators: [9],
    permissions: ['analytics:flowAggregate:view'], permissionMode: 'ANY', scopes: ['analytics', 'analytics:readonly'],
    keyParams: 'path jobId; query cursor (próxima página)', limitations: 'Paginação por cursor até não haver cursor na resposta.',
  },
  {
    id: 'flows-obs', method: 'POST', path: '/api/v2/analytics/flows/observations/query', readOnlyPost: true,
    purpose: 'Observação em tempo (quase) real: conversas atualmente dentro dos fluxos (métrica oFlow).',
    indicators: [1], permissions: ['analytics:flowObservation:view'], permissionMode: 'ANY', scopes: ['analytics', 'analytics:readonly'],
    keyParams: 'Body FlowObservationQuery — obrigatórios: filter, metrics (oFlow).', limitations: 'Fotografia do momento; não serve para histórico.',
  },
  {
    id: 'flows-activity', method: 'POST', path: '/api/v2/analytics/flows/activity/query', readOnlyPost: true,
    purpose: 'Detalhe da atividade atual em fluxos (quem está em qual fluxo agora), agrupável por flowId, conversationId etc.',
    indicators: [1], permissions: ['analytics:flowObservation:view'], permissionMode: 'ANY', scopes: ['analytics', 'analytics:readonly'],
    keyParams: 'Body FlowActivityQuery — metrics (oFlow) e groupBy obrigatórios; query pageSize, pageNumber.',
    limitations: 'Pode expor ANI (telefone) — dado pessoal: não persistir sem base legal (LGPD).',
  },
  {
    id: 'conv-details', method: 'POST', path: '/api/v2/analytics/conversations/details/query', readOnlyPost: true,
    purpose: 'Detalhe por conversa: sessões, segmentos (inclusive segmentType "ivr"), flow (exitReason, transferType, transferTargetName, recognitionFailureReason, outcomes). Base para conversas únicas e jornadas.',
    indicators: [1, 2, 5, 6, 8, 10],
    permissions: ['analytics:conversationDetail:view', 'analytics:agentConversationDetail:view', 'externalContacts:conversation:viewAll'], permissionMode: 'ANY', scopes: ['analytics', 'analytics:readonly'],
    keyParams: 'Body ConversationQuery — obrigatório: interval. Opcionais: conversationFilters, segmentFilters, order, orderBy, paging (pageSize padrão 25), aggregations.',
    limitations: 'Contém dados pessoais (ANI, nomes). Volume alto exige o modo assíncrono. Milestones não aparecem como campo no objeto de fluxo do detalhe — use agregados com flowMilestoneId ou Journey Flows.',
  },
  {
    id: 'conv-details-jobs', method: 'POST', path: '/api/v2/analytics/conversations/details/jobs', readOnlyPost: true,
    purpose: 'Versão assíncrona do detalhe de conversas para extrações históricas em lote.',
    indicators: [9, 10], permissions: ['analytics:conversationDetail:view', 'analytics:agentConversationDetail:view', 'externalContacts:conversation:viewAll'], permissionMode: 'ANY', scopes: ['analytics', 'analytics:readonly'],
    keyParams: 'Body AsyncConversationQuery — interval obrigatório. Depois: GET .../jobs/{jobId} e .../jobs/{jobId}/results (cursor, pageSize).',
    limitations: 'Depende da disponibilidade do data lake: consultar GET /api/v2/analytics/conversations/details/jobs/availability antes.',
  },
  {
    id: 'conv-details-avail', method: 'GET', path: '/api/v2/analytics/conversations/details/jobs/availability',
    purpose: 'Data/hora até a qual o data lake está disponível para jobs de detalhe.', indicators: [9],
    permissions: ['analytics:conversationDetail:view'], permissionMode: 'ANY', scopes: ['analytics', 'analytics:readonly'],
    keyParams: '—', limitations: 'Jobs com intervalo além dessa data retornam dados incompletos.',
  },
  {
    id: 'conv-agg', method: 'POST', path: '/api/v2/analytics/conversations/aggregates/query', readOnlyPost: true,
    purpose: 'Métricas de fila após a transferência (ofertadas, atendidas, abandonadas), para separar desligamento na URA de abandono na fila.',
    indicators: [5, 9], permissions: ['analytics:conversationAggregate:view'], permissionMode: 'ANY', scopes: ['analytics', 'analytics:readonly'],
    keyParams: 'Body ConversationAggregationQuery — interval, metrics; groupBy queueId.', limitations: 'Métricas de fila — não confundir com métricas de fluxo.',
  },
  {
    id: 'flows-list', method: 'GET', path: '/api/v2/flows',
    purpose: 'Lista paginada de fluxos do Architect (filtrável por type=INBOUNDCALL, nome, divisão, publicação).',
    indicators: [4], permissions: ['architect:flow:view'], permissionMode: 'ANY', scopes: ['architect', 'architect:readonly'],
    keyParams: 'query type, pageNumber, pageSize, sortBy, sortOrder, name, nameOrDescription, publishedAfter/Before, divisionId, deleted, includeSchemas.',
    limitations: 'Paginação por pageNumber/pageSize. Parâmetro id está depreciado — use GET /api/v2/flows/lookup.',
  },
  {
    id: 'flow-get', method: 'GET', path: '/api/v2/flows/{flowId}',
    purpose: 'Dados de um fluxo (nome, tipo, publishedVersion, savedVersion, divisão, ativo).', indicators: [4],
    permissions: ['architect:flow:view'], permissionMode: 'ANY', scopes: ['architect', 'architect:readonly'],
    keyParams: 'path flowId; query deleted', limitations: '—',
  },
  {
    id: 'flow-versions', method: 'GET', path: '/api/v2/flows/{flowId}/versions',
    purpose: 'Histórico de versões publicadas — base para comparar indicadores antes/depois de alterações (dimensão flowVersion).',
    indicators: [4, 9], permissions: ['architect:flow:view'], permissionMode: 'ANY', scopes: ['architect', 'architect:readonly'],
    keyParams: 'path flowId; query pageNumber, pageSize, deleted', limitations: '—',
  },
  {
    id: 'flow-version-config', method: 'GET', path: '/api/v2/flows/{flowId}/versions/{versionId}/configuration',
    purpose: 'Configuração (estrutura) de uma versão do fluxo — permite desenhar as etapas do mapa a partir do fluxo real.',
    indicators: [4, 10], permissions: ['architect:flow:view'], permissionMode: 'ANY', scopes: ['architect', 'architect:readonly'],
    keyParams: 'path flowId, versionId', limitations: 'A especificação não define schema de resposta (objeto livre): o parser deve ser tolerante e validado com fluxos reais.',
  },
  {
    id: 'milestones', method: 'GET', path: '/api/v2/flows/milestones',
    purpose: 'Cadastro de Flow Milestones (id, nome, descrição, divisão) — dicionário para traduzir flowMilestoneId.',
    indicators: [7, 8, 10], permissions: ['architect:flowMilestone:view'], permissionMode: 'ALL', scopes: ['architect', 'architect:readonly'],
    keyParams: 'query pageNumber, pageSize, sortBy, sortOrder, id, name, description, nameOrDescription, divisionId', limitations: 'Lista o cadastro; contagens vêm das métricas nFlowMilestone/oFlowMilestone.',
  },
  {
    id: 'outcomes', method: 'GET', path: '/api/v2/flows/outcomes',
    purpose: 'Cadastro de Flow Outcomes — dicionário para traduzir flowOutcomeId.', indicators: [6, 8],
    permissions: ['architect:flowOutcome:view'], permissionMode: 'ALL', scopes: ['architect', 'architect:readonly'],
    keyParams: 'query pageNumber, pageSize, sortBy, sortOrder, id, name, description, nameOrDescription, divisionId', limitations: 'Contagens/taxas vêm de nFlowOutcome, nFlowOutcomeFailed e tFlowOutcome.',
  },
  {
    id: 'queues', method: 'GET', path: '/api/v2/routing/queues',
    purpose: 'Lista de filas — traduz queueId / transferTargetAddress em nome de fila.', indicators: [5],
    permissions: ['routing:queue:view'], permissionMode: 'ANY', scopes: ['routing', 'routing:readonly'],
    keyParams: 'query pageNumber, pageSize, name, id, divisionId', limitations: '—',
  },
  {
    id: 'ivrs', method: 'GET', path: '/api/v2/architect/ivrs',
    purpose: 'Call routes (IVR configs): números (DNIS) e grupos de horário associados a cada fluxo de entrada.', indicators: [4],
    permissions: ['routing:callRoute:view'], permissionMode: 'ALL', scopes: ['architect', 'architect:readonly'],
    keyParams: 'query pageNumber, pageSize, name, dnis, scheduleGroup, expand', limitations: '—',
  },
  {
    id: 'flow-paths', method: 'POST', path: '/api/v2/journey/flows/paths/query', readOnlyPost: true,
    purpose: 'Journey Flows: caminhos agregados (árvore) dentro dos fluxos com contagem por elemento — Milestone, Outcome, Disconnect, TransferToAcd, RecognitionFailure, Error etc.',
    indicators: [2, 5, 6, 7, 8, 10], permissions: ['journey:flowpaths:view'], permissionMode: 'ALL', scopes: ['journey', 'journey:readonly'],
    keyParams: 'Body FlowPathsQuery — obrigatórios: category (All, Abandoned, AgentEscalation, Complete, Disconnect, Error, RecognitionFailure, Transfer) e flows [{ id }].',
    limitations: 'Não há parâmetro de intervalo no corpo: o período é definido pelo serviço (dateStart/dateEnd na resposta). Disponibilidade depende de licenciamento — confirmar. Só mostra elementos instrumentados (Milestones/Outcomes).',
  },
  {
    id: 'flow-instances-caps', method: 'GET', path: '/api/v2/flows/instances/querycapabilities',
    purpose: 'Critérios disponíveis para pesquisar dados de execução de fluxo (Flow execution history).', indicators: [8, 10],
    permissions: ['architect:flowInstance:search'], permissionMode: 'ANY', scopes: ['architect', 'architect:readonly'],
    keyParams: 'query expand (flow, action)', limitations: 'Só funciona se o histórico de execução estiver habilitado (GET /api/v2/flows/instances/settings/executiondata).',
  },
  {
    id: 'flow-instances-query', method: 'POST', path: '/api/v2/flows/instances/query', readOnlyPost: true,
    purpose: 'Pesquisa execuções de fluxo por critérios (diagnóstico de casos específicos de erro).', indicators: [8],
    permissions: ['architect:flowInstance:search'], permissionMode: 'ANY', scopes: ['architect', 'architect:readonly'],
    keyParams: 'Body CriteriaQuery (query obrigatório); query indexOnly, pageSize', limitations: 'Máximo de 200 resultados por consulta (descrição oficial). Uso pontual, não para métricas.',
  },
  {
    id: 'ratelimits', method: 'POST', path: '/api/v2/analytics/ratelimits/aggregates/query', readOnlyPost: true,
    purpose: 'Monitorar a proximidade dos limites de requisição da organização (dados quando o uso chega a 90% do máximo).', indicators: [],
    permissions: ['analytics:rateLimitAggregate:view'], permissionMode: 'ANY', scopes: ['analytics', 'analytics:readonly'],
    keyParams: 'Body RateLimitAggregationQuery', limitations: 'Estimativa "best effort", não é fonte de verdade (descrição oficial).',
  },
];
