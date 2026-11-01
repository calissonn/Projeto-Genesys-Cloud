import {
  Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import clsx from 'clsx';
import {
  AlertTriangle, ArrowRightLeft, Clock, Flag, GitFork, Headphones, ListOrdered, LogIn, MessageSquare, PhoneOff, Repeat, ShieldCheck, Sparkles, Target, XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from '../components/ChartTooltip';
import { FilterBar } from '../components/FilterBar';
import { Card, CardHeader, Delta, Drawer, EmptyState, InfoTip, Legend, PageHeader, Segmented, type Health } from '../components/ui';
import { useApp } from '../context/AppContext';
import { buildFlowModel, calibrate, propagate, type FlowResult, type NodeStats } from '../data/flowModel';
import type { FlowModel, FlowNodeDef, FlowNodeKind, NodeDataSource, Ura } from '../data/types';
import { useChartColors } from '../lib/chartColors';
import { fmtDate } from '../lib/dates';
import { fmtDuration, fmtInt, fmtPct, variation } from '../lib/format';
import { rates, sumTotals, totalsByDay, type Range } from '../lib/metrics';
import type { RecordStore } from '../lib/metrics';

export const SOURCE_INFO: Record<NodeDataSource, { label: string; cls: string; text: string }> = {
  nativo: { label: 'Nativo', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', text: 'Disponível nas métricas nativas de fluxo (Analytics: nFlow, tFlow, tFlowDisconnect, tFlowExit). Não exige configuração adicional.' },
  milestone: { label: 'Milestone', cls: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300', text: 'Exige um Flow Milestone criado e acionado nesta etapa do fluxo no Architect (métricas nFlowMilestone / dimensão flowMilestoneId).' },
  outcome: { label: 'Outcome', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300', text: 'Exige um Flow Outcome iniciado e finalizado (sucesso/falha) no Architect (métricas nFlowOutcome, nFlowOutcomeFailed, tFlowOutcome).' },
  destination: { label: 'Destino', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300', text: 'Destino de transferência: dimensões transferType / transferTargetName nas métricas de fluxo, e métricas da fila para o que ocorre após a transferência.' },
  journey: { label: 'Journey', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300', text: 'Caminho completo: depende de Journey Flows (consulta de flow paths) — e esta, por sua vez, de Milestones/Outcomes no fluxo.' },
};

const KIND_ICON: Record<FlowNodeKind, typeof LogIn> = {
  start: LogIn, message: MessageSquare, decision: GitFork, input: ShieldCheck, menu: ListOrdered,
  selfservice: Sparkles, transfer: Headphones, end: Flag, error: XCircle,
};

interface NodeData extends Record<string, unknown> {
  def: FlowNodeDef;
  stats: NodeStats;
  prev?: NodeStats;
  health: Health;
  selected: boolean;
  compare: boolean;
}

function stepHealth(st: NodeStats, warn: number, crit: number): Health {
  if (st.visits < 1) return 'none';
  return st.disconnectRate >= crit ? 'crit' : st.disconnectRate >= warn ? 'warn' : 'ok';
}

function FlowStepNode({ data }: NodeProps<Node<NodeData>>) {
  const { def, stats, prev, health, selected, compare } = data;
  const Icon = KIND_ICON[def.kind];
  const src = SOURCE_INFO[def.source];
  return (
    <div
      className={clsx(
        'w-[210px] rounded-xl border-2 bg-white px-3 py-2.5 text-left shadow-sm transition dark:bg-slate-900',
        health === 'crit' ? 'border-red-500' : health === 'warn' ? 'border-amber-400' : 'border-slate-200 dark:border-slate-700',
        selected && 'ring-4 ring-brand-500/30',
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-slate-400" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-slate-400" />
      <Handle type="target" id="loop-in" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-violet-400" />
      <Handle type="source" id="loop-out" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-violet-400" />
      <div className="flex items-start gap-2">
        <span className={clsx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
          def.kind === 'error' ? 'bg-red-50 text-red-600 dark:bg-red-950' : def.kind === 'selfservice' || def.id === 'ss_concluido' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950' : def.kind === 'transfer' ? 'bg-blue-50 text-blue-600 dark:bg-blue-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight text-slate-800 dark:text-slate-100" title={def.label}>{def.label}</div>
          <span className={clsx('mt-0.5 inline-block rounded px-1 text-[9px] font-semibold uppercase tracking-wide', src.cls)}>{src.label}</span>
        </div>
        {health === 'crit' && <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" aria-label="Ponto crítico" />}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
        <span className="text-slate-500">Entradas</span>
        <span className="text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">{fmtInt(stats.visits)}</span>
        <span className="text-slate-500">% das chamadas</span>
        <span className="text-right tabular-nums text-slate-700 dark:text-slate-300">{fmtPct(stats.pctOfEntries)}</span>
        {stats.terminal ? (
          <>
            <span className="text-slate-500">{stats.terminal === 'transfer' ? 'Transferidas' : stats.terminal === 'selfService' ? 'Concluídas' : 'Encerradas'}</span>
            <span className="text-right tabular-nums text-slate-700 dark:text-slate-300">{fmtInt(stats.terminalCount)}</span>
          </>
        ) : (
          <>
            <span className="text-slate-500">Saídas</span>
            <span className="text-right tabular-nums text-slate-700 dark:text-slate-300">{fmtInt(stats.exits)}</span>
          </>
        )}
        <span className="text-slate-500">Desligaram</span>
        <span className={clsx('text-right font-semibold tabular-nums', health === 'crit' ? 'text-red-600' : health === 'warn' ? 'text-amber-600' : 'text-slate-700 dark:text-slate-300')}>
          {fmtInt(stats.disconnects)} ({fmtPct(stats.disconnectRate)})
        </span>
        {stats.errors > 0.5 && (
          <>
            <span className="text-slate-500">Erros</span>
            <span className="text-right tabular-nums text-red-600">{fmtInt(stats.errors)}</span>
          </>
        )}
        {stats.repeats > 0.5 && (
          <>
            <span className="text-slate-500">Repetições</span>
            <span className="text-right tabular-nums text-violet-600 dark:text-violet-400">{fmtInt(stats.repeats)}</span>
          </>
        )}
        {def.avgSec != null && (
          <>
            <span className="text-slate-500">Tempo médio</span>
            <span className="text-right tabular-nums text-slate-700 dark:text-slate-300">{fmtDuration(def.avgSec)}</span>
          </>
        )}
      </div>
      {compare && prev && (
        <div className="mt-1.5 border-t border-slate-100 pt-1 text-[10px] dark:border-slate-800">
          <Delta value={stats.disconnectRate - prev.disconnectRate} higherIsBad unit=" p.p." suffix="deslig. vs anterior" />
        </div>
      )}
    </div>
  );
}

const nodeTypes = { step: FlowStepNode };

/** Layout em camadas (caminho mais longo, ignorando arestas de retorno). */
function layout(model: FlowModel): Record<string, { x: number; y: number }> {
  const layer: Record<string, number> = { entrada: 0 };
  for (let it = 0; it < model.nodes.length; it++) {
    for (const n of model.nodes) {
      if (layer[n.id] == null) continue;
      for (const e of n.edges) if (!e.loop) layer[e.to] = Math.max(layer[e.to] ?? 0, layer[n.id] + 1);
    }
  }
  // Destinos finais (filas e autosserviço concluído) ficam alinhados na última coluna.
  const isFinal = (n: FlowNodeDef) => n.kind === 'transfer' || n.id === 'ss_concluido';
  const lastCol = Math.max(...model.nodes.filter((n) => !isFinal(n)).map((n) => layer[n.id] ?? 0)) + 1;
  for (const n of model.nodes) if (isFinal(n)) layer[n.id] = lastCol;
  const cols = new Map<number, string[]>();
  for (const n of model.nodes) {
    const l = layer[n.id] ?? 0;
    if (!cols.has(l)) cols.set(l, []);
    cols.get(l)!.push(n.id);
  }
  const pos: Record<string, { x: number; y: number }> = {};
  const ROW = 205;
  for (const [l, ids] of cols) {
    const kindOrder = (id: string) => {
      const k = model.nodes.find((n) => n.id === id)!.kind;
      return k === 'error' ? 2 : k === 'end' ? 1 : 0;
    };
    ids.sort((a, b) => kindOrder(a) - kindOrder(b));
    ids.forEach((id, i) => {
      pos[id] = { x: l * 270, y: (i - (ids.length - 1) / 2) * ROW };
    });
  }
  return pos;
}

function computeForRange(store: RecordStore, ura: Ura, model: FlowModel, range: Range): { result: FlowResult; entries: number } | null {
  const t = sumTotals(store.query(range, new Set([ura.id])));
  if (!t.entries) return null;
  const r = rates(t);
  const adj = calibrate(model, r);
  return { result: propagate(model, t.entries, adj), entries: t.entries };
}

export function FlowMap() {
  const { store, uras, filters, setFilters, range, prevRange, goals } = useApp();
  const c = useChartColors();
  const [params, setParams] = useSearchParams();
  const [compare, setCompare] = useState<'off' | 'prev'>('off');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  useEffect(() => {
    const q = params.get('ura');
    const u = q && uras.find((x) => x.id === q);
    if (u && filters.uraId !== u.id) setFilters({ departmentId: u.departmentId, uraId: u.id });
    if (q) setParams({}, { replace: true });
  }, [params, uras, filters.uraId, setFilters, setParams]);

  const ura = uras.find((u) => u.id === filters.uraId) ?? null;
  const model = useMemo(() => (ura && ura.menu.length ? buildFlowModel(ura) : null), [ura]);
  const cur = useMemo(() => (store && ura && model ? computeForRange(store, ura, model, range) : null), [store, ura, model, range]);
  const prev = useMemo(() => (store && ura && model ? computeForRange(store, ura, model, prevRange) : null), [store, ura, model, prevRange]);

  const { nodes, edges } = useMemo(() => {
    if (!model || !cur) return { nodes: [] as Node<NodeData>[], edges: [] as Edge[] };
    const pos = layout(model);
    const maxFlow = Math.max(...Object.values(cur.result.nodes).flatMap((n) => n.edgeFlows.map((e) => e.value)), 1);
    const ns: Node<NodeData>[] = model.nodes.map((def) => {
      const st = cur.result.nodes[def.id];
      return {
        id: def.id, type: 'step', position: pos[def.id],
        data: { def, stats: st, prev: prev?.result.nodes[def.id], health: stepHealth(st, goals.stepDisconnectWarn, goals.stepDisconnectCrit), selected: selectedNode === def.id, compare: compare === 'prev' },
      };
    });
    const sw = (v: number) => 1.2 + (v / maxFlow) * 6;
    const es: Edge[] = [];
    for (const def of model.nodes) {
      for (const e of cur.result.nodes[def.id].edgeFlows) {
        const share = cur.result.nodes[def.id].visits ? (e.value / cur.result.nodes[def.id].visits) * 100 : 0;
        es.push({
          id: `${def.id}->${e.to}`, source: def.id, target: e.to,
          sourceHandle: e.loop ? 'loop-out' : undefined, targetHandle: e.loop ? 'loop-in' : undefined,
          type: e.loop ? 'smoothstep' : 'default',
          animated: !!e.loop,
          label: share >= 2 || e.loop ? `${e.label ? e.label + ' · ' : ''}${fmtInt(e.value)} (${fmtPct(share, 0)})` : undefined,
          labelStyle: { fontSize: 10, fill: c.text },
          labelBgStyle: { fill: c.surface, fillOpacity: 0.9 },
          labelBgPadding: [4, 2],
          style: { stroke: e.loop ? c.s7 : c.axis, strokeWidth: sw(e.value), strokeDasharray: e.loop ? '6 4' : undefined, opacity: 0.85 },
          // Marcadores escalam com a espessura da linha: compensamos para manter a seta legível.
          markerEnd: { type: MarkerType.ArrowClosed, color: e.loop ? c.s7 : c.axis, width: 16 / sw(e.value), height: 16 / sw(e.value) },
        });
      }
    }
    return { nodes: ns, edges: es };
  }, [model, cur, prev, goals, selectedNode, compare, c]);

  const usedSources = model ? Array.from(new Set(model.nodes.map((n) => n.source))) : [];
  const criticalSteps = cur && model
    ? model.nodes.map((d) => ({ d, s: cur.result.nodes[d.id] })).filter((x) => x.s.visits > 0).sort((a, b) => b.s.disconnects - a.s.disconnects).slice(0, 4)
    : [];

  return (
    <div>
      <PageHeader
        title="Mapa inteligente da URA"
        description="Caminhos percorridos pelos clientes dentro da URA, com volume, desligamentos, erros e tempo em cada etapa. Clique em uma etapa para ver o detalhamento."
      />
      <FilterBar
        extra={
          <label>
            <span className="label">Comparação</span>
            <Segmented value={compare} onChange={setCompare} options={[{ value: 'off', label: 'Desligada' }, { value: 'prev', label: 'Período anterior' }]} />
          </label>
        }
      />

      {!ura ? (
        <UraPicker onPick={(u) => setFilters({ departmentId: u.departmentId, uraId: u.id })} />
      ) : !model ? (
        <Card><EmptyState title="Mapa indisponível para esta URA" text="URAs cadastradas manualmente não possuem estrutura de fluxo. Em produção, as etapas serão obtidas do fluxo publicado no Architect (somente leitura) e das Milestones configuradas." /></Card>
      ) : !cur ? (
        <Card><EmptyState title="Sem dados para o período selecionado" text="Ajuste o período no filtro." /></Card>
      ) : (
        <>
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <b>Transparência dos dados:</b> neste protótipo o caminho é um <b>modelo simulado</b> calibrado pelas taxas do período.
              Em produção, a jornada por etapa <b>não pode ser deduzida só de métricas agregadas</b>: cada etapa mostra a etiqueta
              de instrumentação necessária (Nativo, Milestone, Outcome, Destino). Sem Milestones/Outcomes no Architect, apenas entrada,
              saída, desligamento total e destino da transferência estarão disponíveis.
            </span>
          </div>
          <div className="grid gap-5 2xl:grid-cols-4">
            <Card className="overflow-hidden 2xl:col-span-3">
              <CardHeader
                title={ura.name}
                subtitle={`${fmtInt(cur.entries)} entradas · ${fmtDate(range.from)} a ${fmtDate(range.to)}${compare === 'prev' && prev ? ` · comparando com ${fmtDate(prevRange.from)} a ${fmtDate(prevRange.to)}` : ''}`}
                actions={<Legend items={[{ label: 'Caminho (espessura = volume)', color: c.axis }, { label: 'Retorno / loop', color: c.s7, dashed: true }, { label: 'Borda vermelha = etapa crítica', color: c.critical }]} />}
              />
              <div className="h-[640px] bg-slate-50/60 dark:bg-slate-950/40">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.15 }}
                  minZoom={0.2}
                  nodesConnectable={false}
                  nodesDraggable
                  onNodeClick={(_, n) => setSelectedNode(n.id)}
                  colorMode={c.surface === '#ffffff' ? 'light' : 'dark'}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background gap={20} color={c.grid} />
                  <Controls showInteractive={false} />
                  <MiniMap pannable zoomable nodeStrokeWidth={3} nodeColor={(n) => ((n.data as NodeData).health === 'crit' ? c.critical : (n.data as NodeData).health === 'warn' ? c.warning : c.other)} />
                </ReactFlow>
              </div>
            </Card>
            <div className="space-y-5">
              <Card>
                <CardHeader title="Pontos de saída mais relevantes" info="Etapas com maior número absoluto de desligamentos no período." />
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {criticalSteps.map(({ d, s }) => (
                    <li key={d.id}>
                      <button className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => setSelectedNode(d.id)}>
                        <PhoneOff className="h-4 w-4 shrink-0 text-orange-500" />
                        <span className="min-w-0 flex-1 truncate text-sm">{d.label}</span>
                        <span className="text-right text-xs tabular-nums"><b>{fmtInt(s.disconnects)}</b><br /><span className="text-slate-500">{fmtPct(s.disconnectRate)}</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Resultado da URA" />
                <div className="space-y-2 px-4 py-3 text-sm">
                  {([
                    ['Autosserviço concluído', cur.result.outcome.selfService, c.selfService],
                    ['Transferência p/ humano', cur.result.outcome.transfers, c.transfer],
                    ['Desligamento na URA', cur.result.outcome.disconnects, c.disconnect],
                    ['Outras saídas', cur.result.outcome.otherExits, c.other],
                  ] as const).map(([l, v, col]) => (
                    <div key={l}>
                      <div className="flex justify-between"><span>{l}</span><span className="tabular-nums font-medium">{fmtPct((v / cur.entries) * 100)}</span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-1.5 rounded-full" style={{ width: `${(v / cur.entries) * 100}%`, background: col }} /></div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader title="Instrumentação necessária" info="O que precisa existir na Genesys Cloud para que cada tipo de etapa tenha dados reais." />
                <ul className="space-y-2.5 px-4 py-3 text-xs">
                  {usedSources.map((s) => (
                    <li key={s}>
                      <span className={clsx('mr-1.5 rounded px-1 py-0.5 text-[10px] font-semibold uppercase', SOURCE_INFO[s].cls)}>{SOURCE_INFO[s].label}</span>
                      <span className="text-slate-600 dark:text-slate-300">{SOURCE_INFO[s].text}</span>
                    </li>
                  ))}
                  <li><Link to="/integracao" className="font-medium text-brand-600 hover:underline">Ver requisitos de integração →</Link></li>
                </ul>
              </Card>
            </div>
          </div>
          <StepDrawer
            nodeId={selectedNode} onClose={() => setSelectedNode(null)}
            model={model} ura={ura} cur={cur.result} prev={prev?.result ?? null} store={store!} range={range} prevRange={prevRange}
          />
        </>
      )}
    </div>
  );
}

function UraPicker({ onPick }: { onPick: (u: Ura) => void }) {
  const { uras, departments } = useApp();
  return (
    <Card>
      <CardHeader title="Selecione uma URA para visualizar o mapa" subtitle="Ou use o filtro de URA acima." />
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {uras.filter((u) => u.menu.length).map((u) => (
          <button key={u.id} onClick={() => onPick(u)} className="rounded-lg border border-slate-200 p-3 text-left transition hover:border-brand-400 hover:bg-brand-50/50 dark:border-slate-700 dark:hover:bg-brand-950/40">
            <div className="text-sm font-medium">{u.name}</div>
            <div className="mt-0.5 text-xs text-slate-500">{departments.find((d) => d.id === u.departmentId)?.name} · {u.menu.length} opções no menu</div>
          </button>
        ))}
      </div>
    </Card>
  );
}

function StepDrawer({
  nodeId, onClose, model, ura, cur, prev, store, range, prevRange,
}: { nodeId: string | null; onClose: () => void; model: FlowModel; ura: Ura; cur: FlowResult; prev: FlowResult | null; store: RecordStore; range: Range; prevRange: Range }) {
  const c = useChartColors();
  const [metric, setMetric] = useState<'visits' | 'disc'>('disc');
  const def = model.nodes.find((n) => n.id === nodeId);
  const history = useMemo(() => {
    if (!def) return [];
    const recs = store.query(range, new Set([ura.id]));
    return totalsByDay(recs, range).map((d) => {
      if (!d.entries) return { date: d.date, visits: null, disc: null };
      const st = propagate(model, d.entries, calibrate(model, rates(d))).nodes[def.id];
      return { date: d.date, visits: st.visits, disc: st.disconnectRate };
    });
  }, [def, store, range, ura, model]);
  if (!def) return null;
  const s = cur.nodes[def.id];
  const p = prev?.nodes[def.id];
  const nameOf = (id: string) => model.nodes.find((n) => n.id === id)?.label ?? id;
  const inbound = model.nodes.flatMap((n) => cur.nodes[n.id].edgeFlows.filter((e) => e.to === def.id).map((e) => ({ from: n.label, ...e })));
  const src = SOURCE_INFO[def.source];
  return (
    <Drawer open={!!nodeId} onClose={onClose} title={def.label} subtitle={<span className="inline-flex items-center gap-2">{ura.name} <span className={clsx('rounded px-1 text-[10px] font-semibold uppercase', src.cls)}>{src.label}</span></span>}>
      <div className="space-y-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Indicador</th><th className="text-right">Período atual</th><th className="text-right">Período anterior</th><th className="text-right">Variação</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <Row label="Entradas na etapa" a={fmtInt(s.visits)} b={p ? fmtInt(p.visits) : '—'} d={<Delta value={p ? variation(s.visits, p.visits) : null} higherIsBad={false} suffix="" />} />
              <Row label="% das chamadas da URA" a={fmtPct(s.pctOfEntries)} b={p ? fmtPct(p.pctOfEntries) : '—'} d={<Delta value={p ? s.pctOfEntries - p.pctOfEntries : null} higherIsBad={false} unit=" p.p." suffix="" />} />
              <Row label="Desligamentos" a={fmtInt(s.disconnects)} b={p ? fmtInt(p.disconnects) : '—'} d={<Delta value={p ? variation(s.disconnects, p.disconnects) : null} higherIsBad suffix="" />} />
              <Row label="Taxa de desligamento" a={fmtPct(s.disconnectRate)} b={p ? fmtPct(p.disconnectRate) : '—'} d={<Delta value={p ? s.disconnectRate - p.disconnectRate : null} higherIsBad unit=" p.p." suffix="" />} />
              <Row label="Erros registrados" a={fmtInt(s.errors)} b={p ? fmtInt(p.errors) : '—'} d={<Delta value={p ? variation(s.errors, p.errors) : null} higherIsBad suffix="" />} />
              <Row label="Repetições (loops)" a={fmtInt(s.repeats)} b={p ? fmtInt(p.repeats) : '—'} d={<Delta value={p ? variation(s.repeats, p.repeats) : null} higherIsBad suffix="" />} />
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-slate-400">Anterior: {fmtDate(prevRange.from)} a {fmtDate(prevRange.to)} (mesma duração).</p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold">Histórico diário</h4>
            <Segmented value={metric} onChange={setMetric} options={[{ value: 'disc', label: 'Taxa de desligamento' }, { value: 'visits', label: 'Entradas' }]} />
          </div>
          {history.length < 2 ? <p className="text-sm text-slate-500">Selecione um período de 2 dias ou mais para ver o histórico.</p> : (
            <div className="h-48">
              <ResponsiveContainer>
                <LineChart data={history}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="date" tickFormatter={(d) => fmtDate(d)} tick={{ fill: c.text, fontSize: 11 }} tickLine={false} axisLine={{ stroke: c.grid }} minTickGap={24} />
                  <YAxis tick={{ fill: c.text, fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (metric === 'disc' ? `${v}%` : fmtInt(v))} />
                  <Tooltip content={<ChartTooltip labelFormatter={(l) => fmtDate(String(l), true)} valueFormatter={(v) => (metric === 'disc' ? fmtPct(v) : fmtInt(v))} />} />
                  <Line dataKey={metric} name={metric === 'disc' ? 'Taxa de desligamento' : 'Entradas'} stroke={metric === 'disc' ? c.disconnect : c.transfer} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><ArrowRightLeft className="h-4 w-4" /> Origem</h4>
            {inbound.length === 0 ? <p className="text-sm text-slate-500">Início do fluxo.</p> : (
              <ul className="space-y-1 text-sm">{inbound.map((e) => <li key={e.from} className="flex justify-between gap-2"><span className="truncate">{e.loop && <Repeat className="mr-1 inline h-3 w-3 text-violet-500" />}{e.from}</span><span className="tabular-nums text-slate-500">{fmtInt(e.value)}</span></li>)}</ul>
            )}
          </div>
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Target className="h-4 w-4" /> Destinos</h4>
            {s.edgeFlows.length === 0 ? (
              <p className="text-sm text-slate-500">{s.terminal === 'transfer' ? `Transferência para a fila ${def.queue}. Abandonos na fila são medidos pelas métricas da fila.` : 'Etapa final do fluxo.'}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {s.edgeFlows.map((e) => <li key={e.to} className="flex justify-between gap-2"><span className="truncate">{e.loop && <Repeat className="mr-1 inline h-3 w-3 text-violet-500" />}{nameOf(e.to)}</span><span className="tabular-nums text-slate-500">{fmtInt(e.value)} ({fmtPct(s.visits ? (e.value / s.visits) * 100 : 0, 0)})</span></li>)}
                <li className="flex justify-between gap-2 text-orange-600"><span>Desligou nesta etapa</span><span className="tabular-nums">{fmtInt(s.disconnects)}</span></li>
              </ul>
            )}
          </div>
        </div>

        {def.avgSec != null && <p className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300"><Clock className="h-4 w-4" /> Tempo médio na etapa: <b>{fmtDuration(def.avgSec)}</b> <InfoTip text="Tempo por etapa só é mensurável em produção com Milestones no início/fim da etapa (diferença de timestamps) ou via dados de execução de fluxo, quando habilitados." /></p>}
        {def.note && <p className="text-sm text-slate-600 dark:text-slate-300">{def.note}</p>}
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <b>Como obter este dado em produção:</b> {src.text}
        </div>
      </div>
    </Drawer>
  );
}

const Row = ({ label, a, b, d }: { label: string; a: string; b: string; d: React.ReactNode }) => (
  <tr><td className="py-1.5">{label}</td><td className="text-right font-medium tabular-nums">{a}</td><td className="text-right tabular-nums text-slate-500">{b}</td><td className="text-right">{d}</td></tr>
);
