import type { GameMode, LotInfo, OpeningKind, Project, Wall, Opening, Floor, Stair, Roof, Item, P } from './types';
import { wallLength, polygonArea, wallPath, pointAt } from './geometry';
import { MATERIAL_BY_ID } from './materials';
import { CATALOG_BY_ID } from './catalog';
import { newLife, fullNeeds, blankSkills, type LifeState } from './life';

export const PROJECT_VERSION = 1;
export const MAX_LEVELS = 5;
export const START_FUNDS = 650000;

let counter = 0;
export function uid(prefix = 'e'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}${counter.toString(36)}`;
}

export const LOT_PRESETS: LotInfo[] = [
  { id: 'pequeno', name: 'Pequeno', w: 15, d: 20, price: 38000, neighborhood: 'Vila Aurora' },
  { id: 'medio', name: 'Médio', w: 20, d: 30, price: 72000, neighborhood: 'Jardim das Palmeiras' },
  { id: 'grande', name: 'Grande', w: 30, d: 40, price: 135000, neighborhood: 'Recanto do Lago' },
  { id: 'extragrande', name: 'Extragrande', w: 50, d: 50, price: 255000, neighborhood: 'Alto da Serra' },
  { id: 'mansao', name: 'Mansão', w: 64, d: 64, price: 420000, neighborhood: 'Colinas Douradas' },
];

export const PRICE_PER_M2_LAND = 130;

export function customLot(w: number, d: number): LotInfo {
  const W = Math.max(8, Math.min(80, Math.round(w)));
  const D = Math.max(8, Math.min(80, Math.round(d)));
  return { id: 'personalizado', name: 'Personalizado', w: W, d: D, price: Math.round(W * D * PRICE_PER_M2_LAND), neighborhood: 'Loteamento Novo Horizonte' };
}

export function createProject(name: string, mode: GameMode, lot: LotInfo): Project {
  const now = Date.now();
  return {
    version: PROJECT_VERSION,
    id: uid('p'),
    name,
    mode,
    funds: mode === 'criativo' ? Infinity : START_FUNDS - lot.price,
    lot,
    levelHeight: 3,
    levels: 1,
    walls: [],
    openings: [],
    floors: [],
    stairs: [],
    roofs: [],
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

export interface OpeningPreset {
  kind: OpeningKind;
  name: string;
  width: number;
  height: number;
  sill: number;
  price: number;
  door: boolean;
}

export const OPENING_PRESETS: OpeningPreset[] = [
  { kind: 'porta', name: 'Porta simples', width: 0.9, height: 2.1, sill: 0, price: 950, door: true },
  { kind: 'porta_dupla', name: 'Porta dupla', width: 1.6, height: 2.2, sill: 0, price: 2100, door: true },
  { kind: 'porta_correr', name: 'Porta de correr de vidro', width: 2.4, height: 2.3, sill: 0, price: 3600, door: true },
  { kind: 'janela', name: 'Janela', width: 1.2, height: 1.2, sill: 1.0, price: 780, door: false },
  { kind: 'janela_alta', name: 'Janela basculante', width: 0.8, height: 0.5, sill: 1.7, price: 380, door: false },
  { kind: 'janela_grande', name: 'Janela panorâmica', width: 2.4, height: 1.6, sill: 0.6, price: 2400, door: false },
  { kind: 'fachada_vidro', name: 'Fachada de vidro', width: 3.0, height: 2.8, sill: 0.05, price: 5200, door: false },
];

export const PRESET_BY_KIND = new Map(OPENING_PRESETS.map((p) => [p.kind, p]));

export const PRICES = {
  wallPerM2: 95,
  floorPerM2: 55,
  slabPerM3: 650,
  roofPerM2: 120,
  stair: { reta: 4200, L: 5600, U: 6400, espiral: 7800, curva: 8200 } as Record<string, number>,
};

export interface CostBreakdown {
  walls: number;
  floors: number;
  openings: number;
  stairs: number;
  roofs: number;
  items: number;
  total: number;
}

const factor = (mat: string) => MATERIAL_BY_ID.get(mat)?.factor ?? 1;

export function wallCost(w: Wall): number {
  return wallLength(w) * w.height * PRICES.wallPerM2 * factor(w.material) * (w.thickness / 0.15) ** 0.5;
}
export function floorCost(f: Floor): number {
  const area = Math.abs(polygonArea(f.points));
  return area * PRICES.floorPerM2 * factor(f.material) + area * Math.max(0, f.elevation) * PRICES.slabPerM3 * 0.4;
}
export function openingCost(o: Opening): number {
  const p = PRESET_BY_KIND.get(o.kind);
  if (!p) return 0;
  return p.price * ((o.width * o.height) / (p.width * p.height)) ** 0.7;
}
export function stairCost(s: Stair): number {
  return (PRICES.stair[s.kind] ?? 5000) * (s.width / 1) * factor(s.material) ** 0.5;
}
export function roofCost(r: Roof): number {
  const area = (r.w + r.overhang * 2) * (r.d + r.overhang * 2) * Math.sqrt(1 + r.pitch * r.pitch);
  return area * PRICES.roofPerM2 * factor(r.material);
}
export function itemCost(i: Item): number {
  const def = CATALOG_BY_ID.get(i.catalogId);
  return def ? def.price * i.scale ** 2 : 0;
}

export function computeCost(p: Project): CostBreakdown {
  const sum = <T>(arr: T[], f: (x: T) => number) => arr.reduce((acc, x) => acc + f(x), 0);
  const c = {
    walls: sum(p.walls, wallCost),
    floors: sum(p.floors, floorCost),
    openings: sum(p.openings, openingCost),
    stairs: sum(p.stairs, stairCost),
    roofs: sum(p.roofs, roofCost),
    items: sum(p.items, itemCost),
    total: 0,
  };
  c.total = Math.round(c.walls + c.floors + c.openings + c.stairs + c.roofs + c.items);
  return c;
}

export function balance(p: Project): number {
  return p.mode === 'criativo' ? Infinity : p.funds + (p.life?.cash ?? 0) - computeCost(p).total;
}

export function fmtMoney(v: number): string {
  if (!Number.isFinite(v)) return '∞';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function levelName(l: number): string {
  if (l === 0) return 'Térreo';
  return `${l}º andar`;
}

/** Verifica se uma abertura cabe na parede sem sobrepor outras. */
export function openingFits(p: Project, wall: Wall, o: Pick<Opening, 'id' | 't' | 'width' | 'height' | 'sill'>): boolean {
  const L = wallLength(wall);
  if (o.t - o.width / 2 < 0.05 || o.t + o.width / 2 > L - 0.05) return false;
  if (o.sill + o.height > wall.height - 0.02) return false;
  for (const other of p.openings) {
    if (other.wallId !== wall.id || other.id === o.id) continue;
    if (Math.abs(other.t - o.t) < (other.width + o.width) / 2 + 0.05) return false;
  }
  return true;
}

/** Posição de planta no centro de uma abertura. */
export function openingPoint(wall: Wall, o: Opening): { p: P; tan: P } {
  return pointAt(wallPath(wall), o.t);
}

export function insideLot(p: Project, pt: P, margin = 0): boolean {
  return Math.abs(pt.x) <= p.lot.w / 2 - margin + 1e-6 && Math.abs(pt.y) <= p.lot.d / 2 - margin + 1e-6;
}

export function clampToLot(p: Project, pt: P): P {
  return {
    x: Math.max(-p.lot.w / 2, Math.min(p.lot.w / 2, pt.x)),
    y: Math.max(-p.lot.d / 2, Math.min(p.lot.d / 2, pt.y)),
  };
}

/** Garante campos e coerência ao carregar dados antigos ou importados. */
export function sanitizeProject(raw: any): Project {
  if (!raw || typeof raw !== 'object') throw new Error('Arquivo de projeto inválido');
  if (!raw.lot || !Array.isArray(raw.walls)) throw new Error('Arquivo não é um projeto Morada');
  const p: Project = {
    version: PROJECT_VERSION,
    id: String(raw.id ?? uid('p')),
    name: String(raw.name ?? 'Projeto'),
    mode: raw.mode === 'simulacao' ? 'simulacao' : 'criativo',
    funds: raw.mode === 'simulacao' ? Number(raw.funds ?? START_FUNDS) : Infinity,
    lot: raw.lot,
    levelHeight: Number(raw.levelHeight ?? 3),
    levels: Math.max(1, Math.min(MAX_LEVELS, Number(raw.levels ?? 1))),
    walls: raw.walls ?? [],
    openings: raw.openings ?? [],
    floors: raw.floors ?? [],
    stairs: raw.stairs ?? [],
    roofs: raw.roofs ?? [],
    items: raw.items ?? [],
    life: raw.life ? sanitizeLife(raw.life) : undefined,
    createdAt: Number(raw.createdAt ?? Date.now()),
    updatedAt: Number(raw.updatedAt ?? Date.now()),
  };
  const wallIds = new Set(p.walls.map((w) => w.id));
  p.openings = p.openings.filter((o) => wallIds.has(o.wallId));
  p.items = p.items.filter((i) => CATALOG_BY_ID.has(i.catalogId));
  return p;
}

function sanitizeLife(l: any): LifeState {
  const base = newLife(String(l.householdName ?? 'Família'));
  const out: LifeState = { ...base, ...l };
  out.sims = (l.sims ?? []).map((s: any) => ({ ...s, needs: { ...fullNeeds(), ...(s.needs ?? {}) }, skills: { ...blankSkills(), ...(s.skills ?? {}) }, moodlets: s.moodlets ?? [], away: null }));
  out.pets = l.pets ?? [];
  out.relationships = l.relationships ?? [];
  out.log = (l.log ?? []).slice(-60);
  out.clock = { minutes: Number(l.clock?.minutes ?? 8 * 60) };
  return out;
}

/** JSON-safe (Infinity não é serializável). */
export function serializeProject(p: Project): string {
  return JSON.stringify({ ...p, funds: Number.isFinite(p.funds) ? p.funds : null });
}

export function deserializeProject(s: string): Project {
  return sanitizeProject(JSON.parse(s));
}
