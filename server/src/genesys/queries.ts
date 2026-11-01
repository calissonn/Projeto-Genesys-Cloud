/**
 * Construtores de consultas — usam somente métricas e dimensões presentes
 * na especificação oficial (FlowAggregationQuery).
 */
export type FlowMetric = 'nFlow' | 'nFlowMilestone' | 'nFlowOutcome' | 'nFlowOutcomeFailed' | 'oFlowMilestone' | 'tFlow' | 'tFlowDisconnect' | 'tFlowExit' | 'tFlowOutcome';

export interface FlowAggregationQuery {
  interval: string;
  granularity?: string;
  timeZone?: string;
  groupBy?: string[];
  filter?: { type: 'and' | 'or'; predicates?: { type: 'dimension'; dimension: string; operator: 'matches' | 'exists' | 'notExists'; value?: string }[] };
  metrics: FlowMetric[];
}

const flowFilter = (flowIds: string[]): FlowAggregationQuery['filter'] =>
  flowIds.length
    ? { type: 'or', predicates: flowIds.map((id) => ({ type: 'dimension' as const, dimension: 'flowId', operator: 'matches' as const, value: id })) }
    : { type: 'and', predicates: [{ type: 'dimension', dimension: 'flowType', operator: 'matches', value: 'INBOUNDCALL' }] };

/** Indicadores 1, 2, 3 e 5 (volume, desligamento, tempo e saídas) por fluxo e versão, por hora. */
export function hourlyFlowVolume(interval: string, flowIds: string[], timeZone: string): FlowAggregationQuery {
  return { interval, granularity: 'PT1H', timeZone, groupBy: ['flowId', 'flowVersion'], filter: flowFilter(flowIds), metrics: ['nFlow', 'tFlow', 'tFlowDisconnect', 'tFlowExit'] };
}

/** Indicador 5: destinos de transferência. */
export function transferDestinations(interval: string, flowIds: string[], timeZone: string): FlowAggregationQuery {
  return { interval, granularity: 'PT1H', timeZone, groupBy: ['flowId', 'transferType', 'transferTargetName'], filter: flowFilter(flowIds), metrics: ['tFlowExit'] };
}

/** Indicadores 6 e 8: outcomes (autosserviço, identificação). */
export function outcomes(interval: string, flowIds: string[], timeZone: string): FlowAggregationQuery {
  return { interval, granularity: 'PT1H', timeZone, groupBy: ['flowId', 'flowOutcomeId', 'flowOutcomeValue'], filter: flowFilter(flowIds), metrics: ['nFlowOutcome', 'nFlowOutcomeFailed', 'tFlowOutcome'] };
}

/** Indicadores 7, 8 e 10: milestones (etapas, tentativas e falhas de CPF). */
export function milestones(interval: string, flowIds: string[], timeZone: string): FlowAggregationQuery {
  return { interval, granularity: 'PT1H', timeZone, groupBy: ['flowId', 'flowMilestoneId'], filter: flowFilter(flowIds), metrics: ['nFlowMilestone'] };
}

/** Intervalo ISO-8601 "início/fim". */
export const isoInterval = (from: Date, to: Date) => `${from.toISOString()}/${to.toISOString()}`;
