import type { Wall, Opening, Floor, Stair, Roof, Item, P, OpeningKind } from './types';
import { wallLength } from './geometry';
import { CATALOG_BY_ID } from './catalog';

/** Conteúdo construído de um terreno (sem metadados do projeto). */
export interface Structure {
  levels: number;
  walls: Wall[];
  openings: Opening[];
  floors: Floor[];
  stairs: Stair[];
  roofs: Roof[];
  items: Item[];
}

export type VenueKind =
  | 'mercado' | 'restaurante' | 'cinema' | 'loja' | 'escritorio' | 'galeria' | 'academia' | 'escola' | 'hospital' | 'parque' | 'praca';

export interface StaffSpot {
  x: number;
  y: number;
  rot: number;
  anim: 'idle' | 'cook' | 'type' | 'talk';
}

/** Gerador pseudoaleatório determinístico. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let n = 0;
const gid = (p: string) => `${p}g${(++n).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

class B {
  s: Structure = { levels: 1, walls: [], openings: [], floors: [], stairs: [], roofs: [], items: [] };
  wall(a: P, b: P, color = '#f1ece3', material = 'pintura', height = 3): Wall {
    const w: Wall = { id: gid('w'), level: 0, a, b, bulge: 0, height, thickness: 0.15, kind: 'parede', material, color };
    this.s.walls.push(w);
    return w;
  }
  open(w: Wall, kind: OpeningKind, t: number, width: number, height: number, sill: number, color = '#f6f6f4') {
    const L = wallLength(w);
    const tt = Math.max(width / 2 + 0.1, Math.min(L - width / 2 - 0.1, t));
    if (this.s.openings.some((o) => o.wallId === w.id && Math.abs(o.t - tt) < (o.width + width) / 2 + 0.1)) return;
    this.s.openings.push({ id: gid('o'), wallId: w.id, kind, t: tt, width, height, sill, flip: false, color });
  }
  floor(pts: P[], material: string, color: string, elevation = 0.05, thickness = 0.15) {
    this.s.floors.push({ id: gid('f'), level: 0, points: pts, material, color, elevation, thickness });
  }
  item(catalogId: string, x: number, y: number, rot = 0, elev = 0.05, color?: string) {
    const def = CATALOG_BY_ID.get(catalogId)!;
    this.s.items.push({ id: gid('i'), catalogId, level: 0, pos: { x, y }, elev, rot, scale: 1, color: color ?? def.color, material: def.material });
  }
  roof(x0: number, y0: number, x1: number, y1: number, kind: Roof['kind'], material: string, pitch = 0.42) {
    const w = x1 - x0, d = y1 - y0;
    const swap = kind === 'duas_aguas' && d > w;
    this.s.roofs.push({
      id: gid('r'), level: 0, kind, center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, w: swap ? d : w, d: swap ? w : d, rot: swap ? Math.PI / 2 : 0,
      pitch: kind === 'plano' ? 0 : pitch, overhang: kind === 'plano' ? 0.1 : 0.5, material, color: '#a4532f',
    });
  }
  /** Caixa de paredes externas: retorna [fundo, direita, frente, esquerda]. */
  box(x0: number, y0: number, x1: number, y1: number, color: string, material: string, h = 3): Wall[] {
    return [
      this.wall({ x: x0, y: y0 }, { x: x1, y: y0 }, color, material, h),
      this.wall({ x: x1, y: y0 }, { x: x1, y: y1 }, color, material, h),
      this.wall({ x: x0, y: y1 }, { x: x1, y: y1 }, color, material, h),
      this.wall({ x: x0, y: y0 }, { x: x0, y: y1 }, color, material, h),
    ];
  }
  garden(w: number, d: number, r: () => number, frontY: number, avoidX: number) {
    for (let k = 0; k < 2 + Math.floor(r() * 3); k++) {
      const side = r() < 0.5 ? -1 : 1;
      const x = side * (w / 2 - 1.8 - r() * 1.5);
      const y = frontY + 1.5 + r() * Math.max(0.5, d / 2 - frontY - 3.5);
      if (Math.abs(x - avoidX) < 2) continue;
      this.item(r() < 0.7 ? 'arvore' : 'palmeira', x, Math.min(d / 2 - 1.5, y), 0, 0);
    }
    for (let k = 0; k < 3; k++) {
      const x = (r() - 0.5) * (w - 4);
      if (Math.abs(x - avoidX) < 1.2) continue;
      this.item('arbusto', x, Math.min(d / 2 - 0.8, frontY + 0.9), 0, 0);
    }
    for (let y = frontY + 0.6; y < d / 2 - 0.3; y += 0.9) this.item('caminho', avoidX, y, 0, 0);
  }
}

const WALL_COLORS = ['#f1ece3', '#e8d5b5', '#c8dbc0', '#bcd3ea', '#e9c3b5', '#d9d4cc', '#e0b84f', '#9fc6c5'];
const pick = <T>(a: T[], r: () => number) => a[Math.floor(r() * a.length)];

/** Casa térrea com sala, cozinha, banheiro e quartos, mobiliada. */
export function genHouse(w: number, d: number, seed: number, theme: 'popular' | 'medio' | 'nobre' | 'condominio' = 'medio', furnished = true): Structure {
  const r = rng(seed);
  const b = new B();
  const big = theme === 'nobre';
  const bw = Math.round(Math.min(big ? 22 : 14, Math.max(8, (w - 5) * (0.7 + r() * 0.2))) * 2) / 2;
  const bd = Math.round(Math.min(big ? 16 : 11, Math.max(7.5, (d - 12) * (0.75 + r() * 0.2))) * 2) / 2;
  const x0 = -bw / 2, x1 = bw / 2;
  const y1 = d / 2 - (big ? 8 : 5.5);
  const y0 = y1 - bd;
  const color = pick(WALL_COLORS, r);
  const [back, right, front, left] = b.box(x0, y0, x1, y1, color, r() < 0.3 ? 'tijolo' : 'reboco');
  const ym = y0 + bd * 0.5;
  const part = b.wall({ x: x0, y: ym }, { x: x1, y: ym });
  // Quartos no fundo: banheiro (2,2 m) + quartos.
  const nBed = big ? 3 : bw >= 11 ? 2 : 1;
  const bathW = 2.3;
  const roomW = (bw - bathW) / nBed;
  const xs = [x0, x0 + bathW];
  for (let i = 1; i < nBed; i++) xs.push(x0 + bathW + roomW * i);
  xs.push(x1);
  for (let i = 1; i < xs.length - 1; i++) b.wall({ x: xs[i], y: y0 }, { x: xs[i], y: ym });
  // Portas internas no centro de cada cômodo dos fundos.
  for (let i = 0; i < xs.length - 1; i++) b.open(part, 'porta', (xs[i] + xs[i + 1]) / 2 - x0, 0.85, 2.1, 0, '#8a5a3a');
  // Porta de entrada e janelas
  const doorX = x0 + Math.max(3.4, bw * 0.36);
  b.open(front, 'porta', doorX - x0, 0.95, 2.1, 0, '#6b4329');
  b.open(front, big ? 'janela_grande' : 'janela', bw * 0.72, big ? 2.4 : 1.4, 1.3, 0.9);
  b.open(back, 'janela_alta', bathW / 2, 0.7, 0.5, 1.7);
  for (let i = 1; i < xs.length - 1; i++) b.open(back, 'janela', (xs[i] + xs[i + 1]) / 2 - x0, 1.2, 1.1, 1.0);
  b.open(left, 'janela', bd * 0.75, 1.2, 1.1, 1.0);
  b.open(right, 'janela', bd * 0.75, 1.2, 1.1, 1.0);
  b.floor([{ x: x0 - 0.075, y: y0 - 0.075 }, { x: x1 + 0.075, y: y0 - 0.075 }, { x: x1 + 0.075, y: y1 + 0.075 }, { x: x0 - 0.075, y: y1 + 0.075 }], big ? 'marmore' : r() < 0.5 ? 'porcelanato' : 'madeira', '#d9d4cc');
  b.roof(x0 - 0.075, y0 - 0.075, x1 + 0.075, y1 + 0.075, r() < 0.5 ? 'quatro_aguas' : 'duas_aguas', r() < 0.6 ? 'telha_ceramica' : 'telha_ardosia');
  if (furnished) {
    const t = 0.075;
    // Cozinha encostada na parede esquerda (frente da casa).
    b.item('geladeira', x0 + t + 0.4, ym + t + 0.45, Math.PI / 2);
    b.item('fogao', x0 + t + 0.36, ym + t + 1.3, Math.PI / 2);
    if (y1 - ym > 3.6) b.item('pia_cozinha', x0 + t + 0.33, ym + t + 2.35, Math.PI / 2);
    // Mesa de jantar
    const tx = x0 + 1.9, ty = y1 - 1.5;
    b.item('mesa_redonda', tx, ty, 0);
    b.item('cadeira', tx, ty - 0.85, 0);
    b.item('cadeira', tx, ty + 0.85, Math.PI);
    // Sala
    const lx = (doorX + 0.8 + x1) / 2;
    b.item('tapete', lx, (ym + y1) / 2 + 0.2, 0);
    b.item('sofa3', lx, y1 - t - 0.6, Math.PI, 0.05, pick(['#8a9bab', '#b8b2a7', '#7d4e75', '#4f7a4a', '#b07d4f'], r));
    b.item('mesa_centro', lx, y1 - 1.8, 0);
    b.item('rack_tv', lx, ym + t + 0.3, 0);
    b.item('tv', lx, ym + t + 0.3, 0, 0.55);
    b.item('planta_grande', x1 - t - 0.45, y1 - t - 0.45);
    // Banheiro
    b.item('vaso', x0 + t + 0.45, y0 + t + 0.42, 0);
    b.item('chuveiro', x0 + bathW - 0.6, y0 + t + 0.58, 0);
    b.item('pia_banheiro', x0 + t + 0.3, ym - 1.0, Math.PI / 2);
    // Quartos
    for (let i = 1; i < xs.length - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const kids = !big && i > 1;
      b.item(kids ? 'cama_solteiro' : 'cama_casal', cx - (kids ? 0.4 : 0.2), y0 + t + (kids ? 1.05 : 1.1), 0);
      b.item('criado', cx - (kids ? 0.4 : 0.2) + (kids ? 0.75 : 1.08), y0 + t + 0.25, 0);
      if (xs[i + 1] - xs[i] >= 3.4) b.item('guarda_roupa', xs[i + 1] - t - 0.33, (y0 + ym) / 2 + 0.2, -Math.PI / 2);
    }
  }
  b.garden(w, d, r, y1, doorX);
  if (big && y0 - 5 > -d / 2 + 1) {
    b.floor([{ x: -6, y: y0 - 7.5 }, { x: 6, y: y0 - 7.5 }, { x: 6, y: y0 - 0.2 }, { x: -6, y: y0 - 0.2 }], 'deck', '#9b6a42', 0.1, 0.15);
    b.item('piscina_ret', 0, y0 - 3.8, 0, 0.1);
    b.item('espreguicadeira', 4.6, y0 - 3.5, 0, 0.1);
  }
  if (theme !== 'popular' && r() < 0.6) b.item('carro', w / 2 - 2.2, y1 + 3.2, 0, 0, pick(['#3e6a9a', '#b5523b', '#f1ece3', '#1f1f22', '#4f7a4a'], r));
  return b.s;
}

/** Estabelecimento comercial ou de serviço (ou parque). Retorna a estrutura e os postos dos funcionários. */
export function genVenue(kind: VenueKind, w: number, d: number, seed: number): { s: Structure; staff: StaffSpot[] } {
  const r = rng(seed);
  const b = new B();
  const staff: StaffSpot[] = [];
  if (kind === 'parque' || kind === 'praca') {
    const big = kind === 'parque';
    // Caminhos em cruz
    for (let y = -d / 2 + 1; y < d / 2 - 0.5; y += 1.0) b.item('caminho', 0, y, 0, 0);
    for (let x = -w / 2 + 1; x < w / 2 - 0.5; x += 1.0) if (Math.abs(x) > 0.6) b.item('caminho', x, 0, 0, 0);
    b.item('fonte', 0, 0, 0, 0);
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      b.item('banco_jardim', sx * 2.6, sy * 1.6, sy > 0 ? Math.PI : 0, 0);
      b.item('poste_jardim', sx * 1.4, sy * 3.2, 0, 0);
      b.item('canteiro', sx * 4.5, sy * 1.0, 0, 0);
    }
    const nTrees = big ? 18 : 7;
    for (let i = 0; i < nTrees; i++) {
      const x = (r() - 0.5) * (w - 4), y = (r() - 0.5) * (d - 4);
      if (Math.abs(x) < 3 || Math.abs(y) < 3) continue;
      b.item(r() < 0.75 ? 'arvore' : 'palmeira', x, y, 0, 0);
    }
    if (big) {
      b.item('escorregador', -w / 4, -d / 4 + 1, 0, 0);
      b.item('escorregador', -w / 4 + 2, -d / 4 + 1, 0, 0);
      b.item('barra_exercicio', w / 4, -d / 4, 0, 0);
      b.item('barra_exercicio', w / 4, -d / 4 + 2.5, 0, 0);
      for (let i = 0; i < 4; i++) b.item('toalha_piquenique', -w / 4 + (i % 2) * 4, d / 4 + Math.floor(i / 2) * 3.5, 0, 0);
      b.item('banco_jardim', w / 4, d / 4, 0, 0);
      b.item('banco_jardim', w / 4 + 2, d / 4, 0, 0);
    } else {
      b.item('toalha_piquenique', -4, -5, 0, 0);
      b.item('arbusto', 4, 5, 0, 0);
    }
    return { s: b.s, staff };
  }
  const bw = Math.min(w - 3, Math.max(10, w * 0.82));
  const bd = Math.min(d - 7, Math.max(9, d * 0.62));
  const x0 = -bw / 2, x1 = bw / 2;
  const y1 = d / 2 - 4.5;
  const y0 = y1 - bd;
  const t = 0.075;
  const style: Record<string, { c: string; m: string; f: string }> = {
    mercado: { c: '#e0b84f', m: 'pintura', f: 'porcelanato' }, restaurante: { c: '#b5523b', m: 'tijolo', f: 'madeira' },
    cinema: { c: '#3d3c3a', m: 'concreto', f: 'carpete' }, loja: { c: '#f1ece3', m: 'pintura', f: 'marmore' },
    escritorio: { c: '#9a9a96', m: 'concreto', f: 'porcelanato' }, galeria: { c: '#ffffff', m: 'pintura', f: 'concreto' },
    academia: { c: '#3e6a9a', m: 'pintura', f: 'carpete' }, escola: { c: '#e9c3b5', m: 'reboco', f: 'porcelanato' },
    hospital: { c: '#e9f0f2', m: 'pintura', f: 'porcelanato' },
  };
  const st = style[kind];
  const h = kind === 'cinema' ? 4.2 : 3.4;
  const [back, right, front, left] = b.box(x0, y0, x1, y1, st.c, st.m, h);
  b.open(front, 'porta_dupla', bw / 2, 1.6, 2.2, 0, '#2c2d30');
  if (kind !== 'cinema') {
    b.open(front, 'fachada_vidro', bw * 0.2, Math.min(4, bw * 0.28), 2.8, 0.05, '#2c2d30');
    b.open(front, 'fachada_vidro', bw * 0.8, Math.min(4, bw * 0.28), 2.8, 0.05, '#2c2d30');
    b.open(left, 'janela_grande', bd * 0.5, 2.4, 1.6, 0.8, '#2c2d30');
    b.open(right, 'janela_grande', bd * 0.5, 2.4, 1.6, 0.8, '#2c2d30');
  }
  void back;
  b.floor([{ x: x0 - t, y: y0 - t }, { x: x1 + t, y: y0 - t }, { x: x1 + t, y: y1 + t }, { x: x0 - t, y: y1 + t }], st.f, kind === 'cinema' ? '#3d3c3a' : '#d9d4cc');
  b.roof(x0 - t, y0 - t, x1 + t, y1 + t, 'plano', 'concreto');
  // Calçada e jardim frontal
  for (let x = -bw / 2 + 1; x <= bw / 2 - 1; x += 3) b.item('arbusto', x, y1 + 1.2, 0, 0);
  for (let y = y1 + 0.6; y < d / 2 - 0.3; y += 0.9) b.item('caminho', 0, y, 0, 0);
  const ix0 = x0 + t + 0.6, ix1 = x1 - t - 0.6, iy0 = y0 + t + 0.6, iy1 = y1 - t - 2.2; // área interna útil
  const cashier = (x: number, y: number) => { b.item('caixa', x, y, Math.PI); staff.push({ x, y: y + 0.72, rot: Math.PI, anim: 'type' }); };
  switch (kind) {
    case 'mercado': {
      for (let y = iy0 + 1.2; y < iy1 - 1.2; y += 2.4) for (let x = ix0 + 1.8; x < ix1 - 1.2; x += 3.2) b.item('prateleira_mercado', x, y, 0);
      for (let x = ix0 + 1.2; x < ix1 - 1; x += 2.3) b.item('refrigerador_mercado', x, y0 + t + 0.45, 0);
      cashier(x1 - 3, y1 - 1.3);
      cashier(x1 - 5.5, y1 - 1.3);
      break;
    }
    case 'restaurante': {
      b.item('balcao', ix0 + 1, iy0 + 0.1, 0);
      b.item('fogao', ix0 + 2.1, iy0 + 0.1, 0);
      b.item('geladeira', ix0 + 3.1, iy0 + 0.1, 0);
      staff.push({ x: ix0 + 2.1, y: iy0 + 0.9, rot: Math.PI, anim: 'cook' });
      for (let y = iy0 + 2.6; y < iy1; y += 2.4) for (let x = ix0 + 1.2; x < ix1 - 0.6; x += 2.6) {
        b.item('mesa_restaurante', x, y, 0);
        b.item('cadeira', x, y - 0.75, 0);
        b.item('cadeira', x, y + 0.75, Math.PI);
        b.item('pendente', x, y, 0, h - 0.9);
      }
      cashier(x1 - 2, y1 - 1.3);
      b.item('planta_grande', ix1, iy0, 0);
      break;
    }
    case 'cinema': {
      b.item('tela_cinema', 0, y0 + t + 0.25, 0, 0.05);
      for (let row = 0, y = y0 + 4.5; y < y1 - 3; y += 1.3, row++) for (let x = ix0 + 0.4; x < ix1 - 0.2; x += 0.8) {
        if (Math.abs(x) < 0.6) continue;
        b.item('poltrona_cinema', x, y, Math.PI);
      }
      cashier(x0 + 2.5, y1 - 1.3);
      b.item('frigobar', x0 + 4, y1 - 0.5, Math.PI);
      break;
    }
    case 'loja': {
      for (let y = iy0 + 0.8; y < iy1; y += 2.2) for (let x = ix0 + 1; x < ix1 - 0.6; x += 2.6) b.item('arara_roupas', x, y, 0);
      b.item('espelho', ix0 - 0.5, (y0 + y1) / 2, Math.PI / 2, 0.6);
      cashier(x1 - 2.2, y1 - 1.3);
      break;
    }
    case 'escritorio': {
      for (let y = iy0 + 0.8; y < iy1; y += 2.4) for (let x = ix0 + 0.9; x < ix1 - 0.6; x += 2.2) {
        b.item('estacao_trabalho', x, y, 0);
        b.item('cadeira_escritorio', x, y + 0.75, Math.PI);
      }
      b.item('cafeteira', x1 - 1, y1 - 1.0, Math.PI, 0.95);
      b.item('balcao', x1 - 1, y1 - 1.0, Math.PI);
      b.item('sofa3', x0 + 2, y1 - 0.8, Math.PI);
      cashier(0, y1 - 1.8);
      break;
    }
    case 'galeria': {
      for (let x = ix0 + 0.8; x < ix1; x += 2.2) {
        b.item('quadro', x, y0 + t + 0.03, 0, 1.3, pick(['#d98b73', '#3e6a9a', '#e0b84f', '#4f7a4a', '#7d4e75'], r));
      }
      b.item('fonte', 0, (y0 + y1) / 2 - 1, 0);
      b.item('banco_jardim', -2.5, (y0 + y1) / 2 + 1, Math.PI);
      b.item('banco_jardim', 2.5, (y0 + y1) / 2 + 1, Math.PI);
      for (const sx of [-1, 1]) b.item('planta_grande', sx * (bw / 2 - 1), y1 - 1.2);
      cashier(x1 - 2.2, y1 - 1.3);
      break;
    }
    case 'academia': {
      for (let x = ix0 + 0.6; x < ix1 - 0.2; x += 1.3) b.item('esteira', x, y0 + t + 1.0, 0);
      for (let x = ix0 + 0.8; x < ix1 - 1; x += 2.2) b.item('aparelho_musculacao', x, (y0 + y1) / 2 + 0.5, 0);
      for (let x = ix0 + 0.6; x < ix0 + 4; x += 1.2) b.item('bicicleta', x, iy1 - 0.3, 0);
      b.item('espelho', ix1 + 0.5, (y0 + y1) / 2, -Math.PI / 2, 0.6);
      cashier(x1 - 2.2, y1 - 1.3);
      break;
    }
    case 'escola': {
      b.item('lousa', 0, y0 + t + 0.04, 0, 0.9);
      staff.push({ x: 0, y: y0 + 1.2, rot: 0, anim: 'talk' });
      for (let y = y0 + 2.6; y < (y0 + y1) / 2 + 2; y += 1.4) for (let x = -3.6; x <= 3.6; x += 1.8) {
        b.item('carteira', x, y, Math.PI);
        b.item('cadeira', x, y + 0.5, Math.PI);
      }
      b.item('estante', x0 + t + 0.2, y1 - 3, Math.PI / 2);
      b.item('estante', x0 + t + 0.2, y1 - 4.4, Math.PI / 2);
      b.item('escorregador', w / 2 - 2.5, y1 + 2.5, 0, 0);
      b.item('bau_brinquedos', x1 - 1.2, y1 - 1.0, Math.PI);
      cashier(x1 - 3, y1 - 1.3);
      break;
    }
    case 'hospital': {
      for (let x = ix0 + 0.8; x < ix1 - 0.4; x += 1.6) b.item('maca', x, iy0 + 1.0, 0);
      for (let x = ix0 + 0.6; x < ix0 + 5; x += 0.7) b.item('cadeira', x, iy1 - 0.3, Math.PI);
      b.item('planta_grande', ix1, iy1, 0);
      cashier(x1 - 2.5, y1 - 1.3);
      staff.push({ x: ix0 + 2.4, y: iy0 + 2.6, rot: Math.PI, anim: 'talk' });
      break;
    }
  }
  return { s: b.s, staff };
}
