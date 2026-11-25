import type { LotInfo, Project } from './types';
import type { Sim } from './life';
import { randomSim, LAST_NAMES } from './life';
import { genHouse, genVenue, rng, type Structure, type VenueKind, type StaffSpot } from './gen';
import { computeCost } from './project';

export type HoodTheme = 'centro' | 'popular' | 'medio' | 'nobre' | 'condominio';
export type LotOwner = 'jogador' | 'npc' | 'venda' | 'vazio' | 'publico';

export interface Neighborhood {
  id: string;
  name: string;
  theme: HoodTheme;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CityLot {
  id: string;
  hood: string;
  kind: 'residencial' | VenueKind;
  title: string;
  address: string;
  w: number;
  d: number;
  /** Preço do terreno (sem construção). */
  price: number;
  x: number;
  y: number;
  owner: LotOwner;
  seed: number;
  residents?: string[];
  staff?: string[];
  careers?: string[];
  /** Construção salva (terrenos do jogador). */
  structure?: string;
  /** Custo da construção salva (cache). */
  cost?: number;
  /** Valor de construção já pago na compra (casas compradas prontas). */
  base?: number;
}

export interface CityState {
  version: number;
  name: string;
  seed: number;
  hoods: Neighborhood[];
  lots: CityLot[];
  townies: Sim[];
  homeLotId: string;
  currentLotId: string;
  expansions: number;
}

export interface VenueDef {
  kind: VenueKind;
  name: string;
  icon: string;
  w: number;
  d: number;
  desc: string;
  careers?: string[];
  staff: number;
  patrons: [number, number];
}

export const VENUES: Record<VenueKind, VenueDef> = {
  mercado: { kind: 'mercado', name: 'Supermercado', icon: '🛒', w: 30, d: 32, desc: 'Compras do mês: abastece a despensa (refeições em casa sem custo extra).', staff: 2, patrons: [2, 4] },
  restaurante: { kind: 'restaurante', name: 'Restaurante', icon: '🍝', w: 22, d: 26, desc: 'Refeições completas, diversão e vida social.', careers: ['gastronomia'], staff: 2, patrons: [3, 6] },
  cinema: { kind: 'cinema', name: 'Cinema', icon: '🎬', w: 26, d: 34, desc: 'Sessões de filme: muita diversão.', staff: 1, patrons: [3, 7] },
  loja: { kind: 'loja', name: 'Loja de roupas', icon: '🛍', w: 20, d: 22, desc: 'Renove o guarda-roupa (roupa nova melhora o humor).', staff: 1, patrons: [1, 3] },
  escritorio: { kind: 'escritorio', name: 'Centro empresarial', icon: '🏢', w: 26, d: 30, desc: 'Local de trabalho: faça horas extras na sua área.', careers: ['tecnologia', 'arquitetura'], staff: 1, patrons: [3, 5] },
  galeria: { kind: 'galeria', name: 'Galeria de arte', icon: '🖼', w: 22, d: 26, desc: 'Exposições para admirar e conhecer pessoas.', careers: ['artes'], staff: 1, patrons: [2, 4] },
  academia: { kind: 'academia', name: 'Academia', icon: '🏋', w: 26, d: 26, desc: 'Esteiras, bicicletas e musculação.', careers: ['esporte'], staff: 1, patrons: [2, 5] },
  escola: { kind: 'escola', name: 'Escola', icon: '🏫', w: 34, d: 36, desc: 'Aulas de reforço para crianças e cursos noturnos para adultos.', careers: ['educacao'], staff: 2, patrons: [2, 4] },
  hospital: { kind: 'hospital', name: 'Hospital', icon: '🏥', w: 32, d: 36, desc: 'Check-ups e cuidados com a saúde.', careers: ['saude'], staff: 2, patrons: [1, 3] },
  parque: { kind: 'parque', name: 'Parque', icon: '🌳', w: 50, d: 44, desc: 'Piquenique, exercícios ao ar livre e brinquedos.', staff: 0, patrons: [3, 6] },
  praca: { kind: 'praca', name: 'Praça', icon: '⛲', w: 26, d: 26, desc: 'Ponto de encontro do bairro.', staff: 0, patrons: [2, 4] },
};

const VENUE_NAMES: Record<VenueKind, string[]> = {
  mercado: ['Mercado Bom Preço', 'Supermercado Cesta Cheia', 'Mercado Família'],
  restaurante: ['Cantina Sabor da Terra', 'Bistrô do Largo', 'Restaurante Panela de Barro'],
  cinema: ['Cine Aurora', 'Cine Estrela', 'Cinemas do Lago'],
  loja: ['Boutique Estilo', 'Moda & Cia', 'Ateliê Avenida'],
  escritorio: ['TecnoPolo Escritórios', 'Torre Horizonte', 'Centro Empresarial Ipê'],
  galeria: ['Galeria Cores', 'Espaço Cultural Mosaico'],
  academia: ['Academia Movimento', 'Studio Fôlego'],
  escola: ['Escola Municipal Saber', 'Colégio Novo Rumo'],
  hospital: ['Hospital Vida', 'Hospital São Lucas da Serra'],
  parque: ['Parque das Águas', 'Parque Ipês Amarelos', 'Parque do Lago'],
  praca: ['Praça da Matriz', 'Praça das Flores', 'Largo do Coreto'],
};

const STREETS = ['Rua das Acácias', 'Rua dos Ipês', 'Rua Jacarandá', 'Av. das Palmeiras', 'Rua do Sol', 'Rua Aroeira', 'Rua das Orquídeas', 'Rua Bem-te-vi', 'Rua Sabiá', 'Av. Central', 'Rua Quaresmeira', 'Rua do Lago', 'Rua Manacá', 'Rua das Hortênsias', 'Alameda Jequitibá', 'Rua Tangará'];

export const HOOD_SEEDS: { name: string; theme: HoodTheme; color: string; venues: VenueKind[]; sizes: [number, number][] }[] = [
  { name: 'Centro', theme: 'centro', color: '#e8d5b5', venues: ['mercado', 'restaurante', 'cinema', 'loja', 'escritorio', 'galeria', 'praca'], sizes: [] },
  { name: 'Vila Aurora', theme: 'popular', color: '#c8dbc0', venues: ['escola', 'praca'], sizes: [[15, 20], [15, 20], [20, 30], [15, 20]] },
  { name: 'Jardim das Palmeiras', theme: 'medio', color: '#bcd3ea', venues: ['academia', 'parque'], sizes: [[20, 30], [20, 30], [30, 40], [20, 30]] },
  { name: 'Recanto do Lago', theme: 'condominio', color: '#9fc6c5', venues: ['hospital'], sizes: [[30, 40], [20, 30], [30, 40]] },
  { name: 'Alto da Serra', theme: 'nobre', color: '#e9c3b5', venues: ['restaurante'], sizes: [[50, 50], [30, 40], [50, 50]] },
  { name: 'Colinas Douradas', theme: 'nobre', color: '#f2d98a', venues: ['parque'], sizes: [[64, 64], [50, 50], [64, 64]] },
];

const EXTRA_HOODS = ['Parque das Flores', 'Vale Verde', 'Morada do Sol', 'Bela Vista', 'Porto Novo', 'Jardim Primavera', 'Lagoa Serena', 'Bosque dos Pinhais'];
const EXTRA_COLORS = ['#d4d9c4', '#e1c7e8', '#c9e4d6', '#f0d0b4', '#cfd8ef', '#e8e0b8'];

const PRICE_M2: Record<HoodTheme, number> = { centro: 300, popular: 95, medio: 135, condominio: 185, nobre: 260 };

let lotCounter = 0;
const lid = () => `lot${Date.now().toString(36)}${(++lotCounter).toString(36)}`;

function venueLot(kind: VenueKind, hood: Neighborhood, r: () => number): CityLot {
  const v = VENUES[kind];
  const names = VENUE_NAMES[kind];
  return {
    id: lid(), hood: hood.id, kind, title: names[Math.floor(r() * names.length)], address: '', w: v.w, d: v.d,
    price: Math.round(v.w * v.d * PRICE_M2.centro), x: 0, y: 0, owner: 'publico', seed: Math.floor(r() * 1e9), careers: v.careers,
  };
}

/** Distribui os lotes de um bairro em quadras e calcula o retângulo do bairro no mapa. */
function layoutHood(hood: Neighborhood, lots: CityLot[], ox: number, oy: number) {
  const W = 240;
  let x = 0, y = 0, rowH = 0, street = 0;
  const streetName = () => STREETS[(hood.id.length * 7 + street * 3) % STREETS.length];
  let num = 10;
  for (const l of lots) {
    if (x + l.w > W && x > 0) { x = 0; y += rowH + 14; rowH = 0; street++; num = 10; }
    l.x = ox + x + l.w / 2;
    l.y = oy + y + l.d / 2;
    l.address = `${streetName()}, ${num}`;
    num += 10 + Math.floor(l.w / 5) * 2;
    x += l.w + 4;
    rowH = Math.max(rowH, l.d);
  }
  hood.x = ox - 8;
  hood.y = oy - 8;
  hood.w = W + 16;
  hood.h = y + rowH + 16;
}

function makeHood(c: CityState, idx: number, def: (typeof HOOD_SEEDS)[number], r: () => number) {
  const hood: Neighborhood = { id: `bairro${idx}`, name: def.name, theme: def.theme, color: def.color, x: 0, y: 0, w: 0, h: 0 };
  const lots: CityLot[] = [];
  for (const v of def.venues) lots.push(venueLot(v, hood, r));
  for (const [w, d] of def.sizes) {
    const roll = r();
    const owner: LotOwner = roll < 0.5 ? 'npc' : roll < 0.75 ? 'venda' : 'vazio';
    lots.push({
      id: lid(), hood: hood.id, kind: 'residencial', title: owner === 'vazio' ? 'Terreno à venda' : owner === 'venda' ? 'Casa à venda' : 'Residência',
      address: '', w, d, price: Math.round(w * d * PRICE_M2[def.theme]), x: 0, y: 0, owner, seed: Math.floor(r() * 1e9),
    });
  }
  // Grade de bairros: 3 colunas.
  const col = idx % 3, row = Math.floor(idx / 3);
  const rowY = c.hoods.filter((h) => Math.floor(Number(h.id.replace('bairro', '')) / 3) < row)
    .reduce((acc, h) => Math.max(acc, h.y + h.h), 0);
  layoutHood(hood, lots, col * 290 + 20, row === 0 ? 20 : rowY + 30);
  c.hoods.push(hood);
  c.lots.push(...lots);
  // Moradores das casas ocupadas e funcionários dos estabelecimentos.
  for (const l of lots) {
    if (l.owner === 'npc') {
      const last = LAST_NAMES[Math.floor(r() * LAST_NAMES.length)];
      const n = 1 + Math.floor(r() * 3);
      l.residents = [];
      for (let i = 0; i < n; i++) {
        const s = randomSim({ lastName: last, age: i < 2 ? (r() < 0.5 ? 'adulto' : 'jovem') : r() < 0.5 ? 'crianca' : 'adolescente' });
        s.townie = true;
        c.townies.push(s);
        l.residents.push(s.id);
      }
      l.title = `Família ${last}`;
    } else if (l.kind !== 'residencial') {
      l.staff = [];
      for (let i = 0; i < VENUES[l.kind].staff; i++) {
        const s = randomSim({ age: r() < 0.5 ? 'jovem' : 'adulto' });
        s.townie = true;
        c.townies.push(s);
        l.staff.push(s.id);
      }
    }
  }
  // Frequentadores avulsos.
  for (let i = 0; i < 4; i++) { const s = randomSim(); s.townie = true; c.townies.push(s); }
  return hood;
}

/** Cria a cidade e insere o terreno atual do jogador como sua casa. */
export function createCity(p: Project): CityState {
  const seed = Math.floor(Math.random() * 1e9);
  const r = rng(seed);
  const c: CityState = { version: 1, name: 'Nova Aurora', seed, hoods: [], lots: [], townies: [], homeLotId: '', currentLotId: '', expansions: 0 };
  HOOD_SEEDS.forEach((h, i) => makeHood(c, i, h, r));
  // Bairro do jogador: procura pelo nome; senão, o primeiro residencial.
  let hood = c.hoods.find((h) => h.name === p.lot.neighborhood);
  if (!hood) {
    hood = makeHood(c, c.hoods.length, { name: p.lot.neighborhood || 'Novo Horizonte', theme: 'medio', color: '#d4d9c4', venues: ['praca'], sizes: [] }, r);
  }
  const hoodLots = c.lots.filter((l) => l.hood === hood!.id);
  const home: CityLot = {
    id: lid(), hood: hood.id, kind: 'residencial', title: 'Sua casa', address: '', w: p.lot.w, d: p.lot.d, price: p.lot.price,
    x: 0, y: 0, owner: 'jogador', seed: 1, base: 0,
  };
  // Reorganiza o bairro com a casa do jogador incluída.
  const all = [home, ...hoodLots];
  c.lots = c.lots.filter((l) => l.hood !== hood!.id).concat(all);
  const ox = hood.x + 8, oy = hood.y + 8;
  layoutHood(hood, all, ox, oy);
  relayoutRows(c);
  c.homeLotId = home.id;
  c.currentLotId = home.id;
  return c;
}

/** Recalcula as posições verticais das linhas de bairros (após mudanças de altura). */
function relayoutRows(c: CityState) {
  const rows = new Map<number, Neighborhood[]>();
  for (const h of c.hoods) {
    const row = Math.floor(Number(h.id.replace('bairro', '')) / 3);
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row)!.push(h);
  }
  let y = 12;
  for (const row of [...rows.keys()].sort((a, b) => a - b)) {
    const hs = rows.get(row)!;
    for (const h of hs) {
      const dy = y - h.y;
      h.y += dy;
      for (const l of c.lots) if (l.hood === h.id) l.y += dy;
    }
    y = Math.max(...hs.map((h) => h.y + h.h)) + 30;
  }
}

/** Abre um novo bairro (expansão da cidade). */
export function expandCity(c: CityState): Neighborhood {
  const r = rng(c.seed + 991 * (c.expansions + 1));
  const name = EXTRA_HOODS[c.expansions % EXTRA_HOODS.length] + (c.expansions >= EXTRA_HOODS.length ? ` ${Math.floor(c.expansions / EXTRA_HOODS.length) + 1}` : '');
  const themes: HoodTheme[] = ['popular', 'medio', 'condominio', 'nobre'];
  const theme = themes[Math.floor(r() * themes.length)];
  const sizes: [number, number][] = theme === 'nobre' ? [[50, 50], [30, 40], [64, 64], [50, 50]] : theme === 'popular' ? [[15, 20], [15, 20], [20, 30], [15, 20], [20, 30]] : [[20, 30], [30, 40], [20, 30], [30, 40]];
  const venuePool: VenueKind[] = ['mercado', 'restaurante', 'academia', 'praca', 'parque', 'escola', 'loja'];
  const venues = [venuePool[Math.floor(r() * venuePool.length)], venuePool[Math.floor(r() * venuePool.length)]].filter((v, i, a) => a.indexOf(v) === i);
  const hood = makeHood(c, c.hoods.length, { name, theme, color: EXTRA_COLORS[c.expansions % EXTRA_COLORS.length], venues, sizes }, r);
  c.expansions++;
  relayoutRows(c);
  return hood;
}

export function lotInfo(c: CityState, l: CityLot): LotInfo {
  const hood = c.hoods.find((h) => h.id === l.hood);
  return { id: l.id, name: l.kind === 'residencial' ? l.title : VENUES[l.kind].name, w: l.w, d: l.d, price: l.price, neighborhood: hood?.name ?? '' };
}

/** Estrutura de um lote: salva (do jogador) ou gerada de forma determinística. */
export function lotStructure(c: CityState, l: CityLot): { s: Structure; staff: StaffSpot[] } {
  if (l.structure) return { s: JSON.parse(l.structure), staff: [] };
  if (l.kind === 'residencial') {
    if (l.owner === 'vazio' || l.owner === 'jogador') return { s: { levels: 1, walls: [], openings: [], floors: [], stairs: [], roofs: [], items: [] }, staff: [] };
    const hood = c.hoods.find((h) => h.id === l.hood);
    const theme = (hood?.theme === 'centro' ? 'medio' : hood?.theme) ?? 'medio';
    return { s: genHouse(l.w, l.d, l.seed, theme, l.owner === 'npc'), staff: [] };
  }
  return genVenue(l.kind, l.w, l.d, l.seed);
}

/** Valor estimado da construção de um lote (cache em l.cost para lotes não ativos). */
export function lotBuildValue(c: CityState, l: CityLot): number {
  if (l.cost !== undefined) return l.cost;
  const { s } = lotStructure(c, l);
  const v = computeCost({ ...emptyProject(), ...s } as Project).total;
  l.cost = v;
  return v;
}

function emptyProject() {
  return { walls: [], openings: [], floors: [], stairs: [], roofs: [], items: [] };
}

export function structureOf(p: Project): Structure {
  return { levels: p.levels, walls: p.walls, openings: p.openings, floors: p.floors, stairs: p.stairs, roofs: p.roofs, items: p.items };
}

export function lotIcon(l: CityLot): string {
  if (l.kind !== 'residencial') return VENUES[l.kind].icon;
  return l.owner === 'jogador' ? '⭐' : l.owner === 'vazio' ? '🏷' : l.owner === 'venda' ? '🏡' : '🏠';
}
