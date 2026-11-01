/**
 * Análise por etapa e por opção de menu.
 *
 * Usa o modelo de fluxo calibrado pelas taxas observadas de cada URA (ver data/flowModel.ts).
 * Em produção, estes números virão de Flow Milestones (etapas) e da dimensão
 * flowMilestoneId nas métricas de fluxo — sem instrumentação, apenas o total por fluxo existe.
 */
import { buildFlowModel, calibrate, propagate, type FlowResult } from '../data/flowModel';
import type { FlowModel, Ura } from '../data/types';
import { rates, sumTotals, type Range, type RecordStore } from './metrics';

export interface UraFlow {
  ura: Ura;
  model: FlowModel;
  result: FlowResult;
  entries: number;
}

export function computeUraFlows(store: RecordStore, uras: Ura[], range: Range, scope: Set<string> | null): UraFlow[] {
  const out: UraFlow[] = [];
  for (const ura of uras) {
    if (!ura.menu.length || (scope && !scope.has(ura.id))) continue;
    const t = sumTotals(store.query(range, new Set([ura.id])));
    if (!t.entries) continue;
    const model = buildFlowModel(ura);
    out.push({ ura, model, result: propagate(model, t.entries, calibrate(model, rates(t))), entries: t.entries });
  }
  return out;
}

/** Categoria genérica da etapa — permite consolidar várias URAs. */
export function stepCategory(nodeId: string): string {
  if (nodeId.startsWith('ss_') && nodeId !== 'ss_concluido') return 'Autosserviço (em andamento)';
  if (nodeId.startsWith('q_')) return 'Transferência para fila';
  return ({
    entrada: 'Entrada da chamada',
    saudacao: 'Saudação / aviso LGPD',
    horario: 'Verificação de horário',
    fora_horario: 'Mensagem fora do horário',
    identificacao: 'Identificação por CPF',
    falha_id: 'Falha na identificação',
    tentativas_excedidas: 'Tentativas excedidas',
    menu: 'Menu principal',
    opcao_invalida: 'Opção inválida',
    ss_concluido: 'Autosserviço concluído',
  } as Record<string, string>)[nodeId] ?? nodeId;
}

export interface StepRow {
  category: string;
  visits: number;
  disconnects: number;
  rate: number;
  /** Desligamento esperado (ex.: após a mensagem de fora do horário) — não é classificado como problema. */
  expected: boolean;
  byUra: { uraId: string; nodeId: string; visits: number; disconnects: number }[];
}

export const EXPECTED_DISCONNECT_STEPS = new Set(['Mensagem fora do horário']);

export function disconnectsByStep(flows: UraFlow[]): StepRow[] {
  const m = new Map<string, StepRow>();
  for (const f of flows) {
    for (const [id, st] of Object.entries(f.result.nodes)) {
      const cat = stepCategory(id);
      let row = m.get(cat);
      if (!row) m.set(cat, (row = { category: cat, visits: 0, disconnects: 0, rate: 0, expected: EXPECTED_DISCONNECT_STEPS.has(cat), byUra: [] }));
      row.visits += st.visits;
      row.disconnects += st.disconnects;
      row.byUra.push({ uraId: f.ura.id, nodeId: id, visits: st.visits, disconnects: st.disconnects });
    }
  }
  return Array.from(m.values())
    .map((r) => ({ ...r, rate: r.visits ? (r.disconnects / r.visits) * 100 : 0 }))
    .filter((r) => r.visits > 0)
    .sort((a, b) => b.disconnects - a.disconnects);
}

export interface OptionRow {
  uraId: string;
  uraName: string;
  key: string;
  label: string;
  kind: 'self' | 'transfer';
  chosen: number;
  disconnects: number;
  rate: number;
}

/** Desligamentos atribuídos a cada opção do menu (após a escolha). */
export function disconnectsByOption(flows: UraFlow[]): OptionRow[] {
  const rows: OptionRow[] = [];
  for (const f of flows) {
    const menu = f.result.nodes.menu;
    if (!menu) continue;
    for (const o of f.ura.menu) {
      const target = o.kind === 'self' ? `ss_${o.key}` : f.model.nodes.find((n) => n.queue === o.queue)?.id;
      const edge = menu.edgeFlows.find((e) => e.label === `Opção ${o.key}`);
      if (!edge || !target) continue;
      const tn = f.result.nodes[target];
      // Autosserviço: desligamentos na própria etapa. Transferência: proporção da etapa de fila.
      const disc = o.kind === 'self' ? tn.disconnects : edge.value * (tn.disconnectRate / 100);
      rows.push({
        uraId: f.ura.id, uraName: f.ura.name, key: o.key, label: o.label, kind: o.kind,
        chosen: edge.value, disconnects: disc, rate: edge.value ? (disc / edge.value) * 100 : 0,
      });
    }
  }
  return rows.sort((a, b) => b.disconnects - a.disconnects);
}

/**
 * Teste de duas proporções (aproximação normal). Retorna o valor-p bicaudal.
 * Usado para indicar se a diferença entre dois períodos é estatisticamente relevante.
 */
export function twoProportionPValue(x1: number, n1: number, x2: number, n2: number): number | null {
  if (n1 < 30 || n2 < 30) return null;
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return null;
  const z = Math.abs(p1 - p2) / se;
  return 2 * (1 - normalCdf(z));
}

function normalCdf(z: number): number {
  // Aproximação de Abramowitz-Stegun 26.2.17
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return 1 - p;
}
