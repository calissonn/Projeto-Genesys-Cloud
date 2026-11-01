import type { FlowModel, FlowNodeDef, Ura } from './types';

/**
 * Modelo de navegação SIMULADO de cada URA.
 *
 * Em produção este grafo NÃO pode ser inferido de métricas agregadas.
 * Cada etapa indica (campo `source`) a instrumentação necessária:
 *  - nativo:      disponível em métricas de fluxo (entrada, desconexão, saída)
 *  - milestone:   exige Flow Milestones configurados no Architect
 *  - outcome:     exige Flow Outcomes configurados no Architect
 *  - destination: destino de transferência (dados de fila / Flow Destinations)
 *  - journey:     caminho completo só via Journey Flows / Flow Insights (se licenciado)
 */
export function buildFlowModel(ura: Ura): FlowModel {
  const nodes: FlowNodeDef[] = [];
  const firstQueue = ura.queues[0] ?? 'Atendimento';
  const queueNodeId = (q: string) => `q_${q.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

  nodes.push({
    id: 'entrada', label: 'Entrada da chamada', kind: 'start', source: 'nativo',
    disconnectRate: 0.004, errorRate: 0, avgSec: 2, edges: [{ to: 'saudacao', p: 1 }],
    note: 'Entradas no fluxo — métrica nativa de Analytics de fluxos.',
  });
  nodes.push({
    id: 'saudacao', label: 'Saudação / aviso LGPD', kind: 'message', source: 'milestone',
    disconnectRate: 0.018, errorRate: 0, avgSec: 14, edges: [{ to: 'horario', p: 1 }],
  });
  nodes.push({
    id: 'horario', label: 'Verificação de horário', kind: 'decision', source: 'milestone',
    disconnectRate: 0, errorRate: 0, avgSec: 1,
    edges: [
      { to: 'fora_horario', p: 0.06, label: 'Fora do horário' },
      { to: ura.requiresCpf ? 'identificacao' : 'menu', p: 0.94, label: 'Em horário' },
    ],
  });
  nodes.push({
    id: 'fora_horario', label: 'Mensagem fora do horário', kind: 'end', source: 'outcome',
    disconnectRate: 0.3, errorRate: 0, avgSec: 20, edges: [],
    note: 'Encerramento pelo fluxo após mensagem informativa.',
  });

  if (ura.requiresCpf) {
    nodes.push({
      id: 'identificacao', label: 'Identificação por CPF', kind: 'input', source: 'milestone',
      disconnectRate: 0.03, errorRate: 0, avgSec: 26,
      edges: [
        { to: 'menu', p: 0.86, label: 'CPF validado' },
        { to: 'falha_id', p: 0.14, label: 'Não validado' },
      ],
    });
    nodes.push({
      id: 'falha_id', label: 'Falha na identificação', kind: 'error', source: 'milestone',
      disconnectRate: 0.14, errorRate: 1, avgSec: 8,
      edges: [
        { to: 'identificacao', p: 0.62, label: 'Nova tentativa', loop: true },
        { to: 'tentativas_excedidas', p: 0.38, label: 'Limite atingido' },
      ],
      note: 'CPF inválido, ausência de digitação ou falha na consulta de autenticação.',
    });
    nodes.push({
      id: 'tentativas_excedidas', label: 'Tentativas excedidas', kind: 'error', source: 'milestone',
      disconnectRate: 0.1, errorRate: 1, avgSec: 6,
      edges: [{ to: queueNodeId(firstQueue), p: 1, label: 'Transferência de contingência' }],
    });
  }

  const menuEdges = ura.menu.map((o) => ({
    to: o.kind === 'self' ? `ss_${o.key}` : queueNodeId(o.queue ?? firstQueue),
    p: o.share * 0.9,
    label: `Opção ${o.key}`,
  }));
  menuEdges.push({ to: 'opcao_invalida', p: 0.1, label: 'Inválida / sem digitação' });
  nodes.push({
    id: 'menu', label: 'Menu principal', kind: 'menu', source: 'milestone',
    disconnectRate: 0.035, errorRate: 0, avgSec: 19, edges: menuEdges,
  });
  nodes.push({
    id: 'opcao_invalida', label: 'Opção inválida', kind: 'error', source: 'milestone',
    disconnectRate: 0.12, errorRate: 1, avgSec: 6,
    edges: [{ to: 'menu', p: 1, label: 'Retorno ao menu', loop: true }],
  });

  for (const o of ura.menu.filter((m) => m.kind === 'self')) {
    nodes.push({
      id: `ss_${o.key}`, label: o.label, kind: 'selfservice', source: 'outcome',
      disconnectRate: 0.05, errorRate: 0.035, avgSec: 48,
      edges: [
        { to: 'ss_concluido', p: o.successRate ?? 0.6, label: 'Concluído' },
        { to: queueNodeId(o.queue ?? firstQueue), p: 1 - (o.successRate ?? 0.6), label: 'Não resolvido' },
      ],
      note: 'Taxa de conclusão depende de Flow Outcome com sucesso/falha marcado no Architect.',
    });
  }
  nodes.push({
    id: 'ss_concluido', label: 'Autosserviço concluído', kind: 'end', source: 'outcome',
    disconnectRate: 0, errorRate: 0, avgSec: 4, edges: [],
  });

  const usedQueues = new Set<string>();
  for (const n of nodes) for (const e of n.edges) if (e.to.startsWith('q_')) usedQueues.add(e.to);
  for (const q of ura.queues) {
    const id = queueNodeId(q);
    if (!usedQueues.has(id)) continue;
    nodes.push({
      id, label: `Fila: ${q}`, kind: 'transfer', source: 'destination', queue: q,
      disconnectRate: 0.015, errorRate: 0.01, avgSec: 4, edges: [],
      note: 'Transferência para atendimento humano. Abandonos na fila são medidos separadamente (métricas de fila).',
    });
  }
  return { uraId: ura.id, nodes };
}

export interface FlowAdjust {
  /** Multiplicador das taxas de desligamento de todas as etapas. */
  disc: number;
  /** Multiplicador da taxa de falha de identificação. */
  auth: number;
  /** Multiplicador da conclusão de autosserviço. */
  ss: number;
}

export interface NodeStats {
  id: string;
  visits: number; // entradas na etapa (inclui repetições por loop)
  repeats: number; // entradas originadas de loops / retornos
  disconnects: number;
  exits: number; // saídas para outras etapas ou encerramento
  errors: number;
  pctOfEntries: number;
  disconnectRate: number;
  edgeFlows: { to: string; value: number; label?: string; loop?: boolean }[];
  terminal: 'transfer' | 'selfService' | 'other' | null;
  terminalCount: number;
}

export interface FlowResult {
  entries: number;
  nodes: Record<string, NodeStats>;
  outcome: { disconnects: number; transfers: number; selfService: number; otherExits: number };
  authFailures: number;
  authAttempts: number;
  avgDurationSec: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(0.98, x));

/**
 * Propaga um volume de entradas pelo grafo (iteração de ponto fixo, suporta loops).
 * Retorna estatísticas por etapa coerentes entre si (entradas = desligamentos + saídas).
 */
export function propagate(model: FlowModel, entries: number, adj: FlowAdjust = { disc: 1, auth: 1, ss: 1 }): FlowResult {
  const disc = (n: FlowNodeDef) => clamp01(n.disconnectRate * adj.disc);
  const edgeP = (n: FlowNodeDef) => {
    const ps = n.edges.map((e) => {
      let p = e.p;
      if (n.id === 'identificacao') p = e.to === 'falha_id' ? clamp01(e.p * adj.auth) : 1 - clamp01(0.14 * adj.auth);
      if (n.kind === 'selfservice') p = e.to === 'ss_concluido' ? clamp01(e.p * adj.ss) : 1 - clamp01((n.edges[0].p) * adj.ss);
      return p;
    });
    const sum = ps.reduce((a, b) => a + b, 0) || 1;
    return ps.map((p) => p / sum);
  };
  const probs = new Map(model.nodes.map((n) => [n.id, edgeP(n)]));

  let visits = new Map<string, number>(model.nodes.map((n) => [n.id, 0]));
  let loopIn = new Map<string, number>();
  for (let it = 0; it < 200; it++) {
    const next = new Map<string, number>(model.nodes.map((n) => [n.id, 0]));
    const nextLoop = new Map<string, number>();
    next.set('entrada', entries);
    for (const n of model.nodes) {
      const v = visits.get(n.id)!;
      const out = v * (1 - disc(n));
      const p = probs.get(n.id)!;
      n.edges.forEach((e, i) => {
        next.set(e.to, (next.get(e.to) ?? 0) + out * p[i]);
        if (e.loop) nextLoop.set(e.to, (nextLoop.get(e.to) ?? 0) + out * p[i]);
      });
    }
    let delta = 0;
    for (const [k, v] of next) delta += Math.abs(v - (visits.get(k) ?? 0));
    visits = next;
    loopIn = nextLoop;
    if (delta < 1e-6) break;
  }

  const result: FlowResult = {
    entries,
    nodes: {},
    outcome: { disconnects: 0, transfers: 0, selfService: 0, otherExits: 0 },
    authFailures: 0,
    authAttempts: 0,
    avgDurationSec: 0,
  };
  let durationSum = 0;
  for (const n of model.nodes) {
    const v = visits.get(n.id)!;
    const d = v * disc(n);
    const out = v - d;
    const p = probs.get(n.id)!;
    const terminal: NodeStats['terminal'] = n.edges.length
      ? null
      : n.kind === 'transfer' ? 'transfer' : n.id === 'ss_concluido' ? 'selfService' : 'other';
    result.nodes[n.id] = {
      id: n.id,
      visits: v,
      repeats: loopIn.get(n.id) ?? 0,
      disconnects: d,
      exits: out,
      errors: v * n.errorRate,
      pctOfEntries: entries ? (v / entries) * 100 : 0,
      disconnectRate: v ? (d / v) * 100 : 0,
      edgeFlows: n.edges.map((e, i) => ({ to: e.to, value: out * p[i], label: e.label, loop: e.loop })),
      terminal,
      terminalCount: terminal ? out : 0,
    };
    result.outcome.disconnects += d;
    if (terminal === 'transfer') result.outcome.transfers += out;
    if (terminal === 'selfService') result.outcome.selfService += out;
    if (terminal === 'other') result.outcome.otherExits += out;
    durationSum += v * (n.avgSec ?? 0);
    if (n.id === 'falha_id') result.authFailures = v;
    if (n.id === 'identificacao') result.authAttempts = v;
  }
  result.avgDurationSec = entries ? durationSum / entries : 0;
  return result;
}

/**
 * Ajusta os parâmetros do modelo para que os totais propagados reproduzam
 * as taxas observadas no período (desligamento, falha de CPF, autosserviço).
 */
export function calibrate(
  model: FlowModel,
  target: { disconnectRate: number; authFailureRate: number; selfServiceRate: number },
): FlowAdjust {
  const adj: FlowAdjust = { disc: 1, auth: 1, ss: 1 };
  for (let i = 0; i < 4; i++) {
    const r = propagate(model, 1, adj);
    if (r.outcome.disconnects > 0 && target.disconnectRate > 0) adj.disc *= target.disconnectRate / 100 / r.outcome.disconnects;
    const ar = r.authAttempts > 0 ? r.authFailures / r.authAttempts : 0;
    if (ar > 0 && target.authFailureRate > 0) adj.auth *= target.authFailureRate / 100 / ar;
    if (r.outcome.selfService > 0 && target.selfServiceRate > 0) adj.ss *= target.selfServiceRate / 100 / r.outcome.selfService;
  }
  return adj;
}
