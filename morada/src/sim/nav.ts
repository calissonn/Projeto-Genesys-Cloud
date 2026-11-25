import type { P, Project, Stair } from '../model/types';
import {
  wallPath, projectOnPath, pointInPolygon, stairSize, stairSteps, stairFootprint, rotate, add, dist, bbox,
} from '../model/geometry';
import { CATALOG_BY_ID } from '../model/catalog';

/** Ligação entre andares (escada ou elevador). */
export interface NavLink {
  id: string;
  kind: 'escada' | 'elevador';
  lower: number;
  /** Ponto de acesso no andar de baixo e no de cima. */
  bottom: P;
  top: P;
  /** Trajeto em planta com altura relativa à base do andar de baixo. */
  path: { p: P; h: number }[];
}

export type RouteStep =
  | { type: 'walk'; level: number; pts: P[] }
  | { type: 'link'; link: NavLink; up: boolean };

const CELL = 0.25;
const AGENT = 0.17;
const DOOR_KINDS = new Set(['porta', 'porta_dupla', 'porta_correr']);

/** Calcula as ligações de uma escada (em coordenadas de planta). */
export function stairLink(s: Stair, H: number): NavLink {
  const N = stairSteps(H);
  const rise = H / N;
  const W = s.width;
  const { w, d } = stairSize(s, H);
  let local: { x: number; y: number; h: number }[] = [];
  let approach: P, exitDir: P;
  switch (s.kind) {
    case 'reta':
      local = [{ x: 0, y: d / 2, h: 0 }, { x: 0, y: -d / 2, h: H }];
      approach = { x: 0, y: d / 2 + 0.45 }; exitDir = { x: 0, y: -1 };
      break;
    case 'L': {
      const n1 = Math.floor(N / 2), x1 = -w / 2 + W / 2, lz = -d / 2 + W / 2, lt = (n1 + 1) * rise;
      local = [{ x: x1, y: d / 2, h: 0 }, { x: x1, y: lz, h: lt }, { x: w / 2, y: lz, h: H }];
      approach = { x: x1, y: d / 2 + 0.45 }; exitDir = { x: 1, y: 0 };
      break;
    }
    case 'U': {
      const n1 = Math.floor((N - 1) / 2), xl = -w / 2 + W / 2, xr = w / 2 - W / 2, lz = -d / 2 + W / 2, lt = (n1 + 1) * rise;
      local = [{ x: xl, y: d / 2, h: 0 }, { x: xl, y: lz, h: lt }, { x: xr, y: lz, h: lt }, { x: xr, y: d / 2, h: H }];
      approach = { x: xl, y: d / 2 + 0.45 }; exitDir = { x: 0, y: 1 };
      break;
    }
    case 'espiral': {
      const R = w / 2 - 0.1, r = R * 0.6, total = Math.PI * 2 * 0.88;
      for (let i = 0; i <= 16; i++) { const a = (total * i) / 16; local.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, h: (H * i) / 16 }); }
      approach = { x: r, y: -0.62 }; exitDir = { x: -Math.sin(total), y: Math.cos(total) };
      break;
    }
    case 'curva': {
      const Ro = w / 2, r = Ro - W / 2;
      for (let i = 0; i <= 16; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 16; local.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, h: (H * i) / 16 }); }
      approach = { x: -0.5, y: -r }; exitDir = { x: -1, y: 0 };
      break;
    }
  }
  // Saída: avança na direção final até sair da projeção da escada (vão da laje).
  const end = local[local.length - 1];
  let ex = { x: end.x, y: end.y };
  for (let k = 0; k < 60 && Math.abs(ex.x) <= w / 2 + 0.01 && Math.abs(ex.y) <= d / 2 + 0.01; k++) ex = add(ex, { x: exitDir.x * 0.1, y: exitDir.y * 0.1 });
  ex = add(ex, { x: exitDir.x * 0.35, y: exitDir.y * 0.35 });
  const toPlan = (q: P) => add(s.pos, rotate(q, s.rot));
  const path = [{ p: toPlan(approach), h: 0 }, ...local.map((q) => ({ p: toPlan(q), h: q.h })), { p: toPlan(ex), h: H }];
  return { id: s.id, kind: 'escada', lower: s.level, bottom: path[0].p, top: path[path.length - 1].p, path };
}

/** Grade de navegação por andar com busca A* entre andares. */
export class NavGrid {
  minX: number;
  minY: number;
  nx: number;
  ny: number;
  levels: Uint8Array[] = [];
  links: NavLink[] = [];
  private N: number;

  constructor(private p: Project) {
    const hw = p.lot.w / 2, hd = p.lot.d / 2;
    this.minX = -hw - 1.5;
    this.minY = -hd - 1.5;
    this.nx = Math.ceil((p.lot.w + 3) / CELL);
    this.ny = Math.ceil((p.lot.d + 1.5 + 4.5) / CELL); // inclui a calçada na frente
    this.N = this.nx * this.ny;
    const H = p.levelHeight;
    const L = Math.max(1, p.levels);
    for (let l = 0; l < L; l++) this.levels.push(this.rasterLevel(l));
    for (const s of p.stairs) if (s.level + 1 < L) this.links.push(stairLink(s, H));
    for (const it of p.items) {
      if (it.catalogId !== 'elevador' || it.level + 1 >= L) continue;
      const def = CATALOG_BY_ID.get(it.catalogId)!;
      const dir = { x: Math.sin(it.rot), y: Math.cos(it.rot) };
      const front = add(it.pos, { x: dir.x * (def.d * it.scale / 2 + 0.45), y: dir.y * (def.d * it.scale / 2 + 0.45) });
      this.links.push({
        id: it.id, kind: 'elevador', lower: it.level, bottom: front, top: front,
        path: [{ p: front, h: 0 }, { p: it.pos, h: 0 }, { p: it.pos, h: H }, { p: front, h: H }],
      });
    }
    // Garante acesso às pontas das ligações.
    for (const lk of this.links) {
      this.open(lk.lower, lk.bottom);
      this.open(lk.lower + 1, lk.top);
    }
  }

  private open(level: number, p: P) {
    const g = this.levels[level];
    if (!g) return;
    const i = this.idx(p);
    if (i >= 0 && !g[i]) {
      // Só libera se houver chão ali (evita caminhar no ar).
      if (level === 0 || this.p.floors.some((f) => f.level === level && pointInPolygon(p, f.points))) g[i] = 1;
    }
  }

  idx(p: P): number {
    const cx = Math.floor((p.x - this.minX) / CELL), cy = Math.floor((p.y - this.minY) / CELL);
    if (cx < 0 || cy < 0 || cx >= this.nx || cy >= this.ny) return -1;
    return cy * this.nx + cx;
  }

  center(i: number): P {
    return { x: this.minX + ((i % this.nx) + 0.5) * CELL, y: this.minY + (Math.floor(i / this.nx) + 0.5) * CELL };
  }

  private rasterLevel(level: number): Uint8Array {
    const p = this.p;
    const g = new Uint8Array(this.N);
    const floors = p.floors.filter((f) => f.level === level);
    for (let i = 0; i < this.N; i++) {
      const c = this.center(i);
      if (level === 0) g[i] = 1;
      else g[i] = floors.some((f) => pointInPolygon(c, f.points)) ? 1 : 0;
    }
    const block = (b: { minX: number; minY: number; maxX: number; maxY: number }, test: (c: P) => boolean) => {
      const x0 = Math.max(0, Math.floor((b.minX - this.minX) / CELL)), x1 = Math.min(this.nx - 1, Math.floor((b.maxX - this.minX) / CELL));
      const y0 = Math.max(0, Math.floor((b.minY - this.minY) / CELL)), y1 = Math.min(this.ny - 1, Math.floor((b.maxY - this.minY) / CELL));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * this.nx + x;
        if (g[i] && test(this.center(i))) g[i] = 0;
      }
    };
    // Paredes, com passagem pelas portas.
    for (const w of p.walls) {
      if (w.level !== level) continue;
      const path = wallPath(w, 0.2);
      const doors = p.openings.filter((o) => o.wallId === w.id && DOOR_KINDS.has(o.kind) && o.sill < 0.05);
      const r = w.thickness / 2 + AGENT;
      const b = bbox(path);
      block({ minX: b.minX - r, minY: b.minY - r, maxX: b.maxX + r, maxY: b.maxY + r }, (c) => {
        const pr = projectOnPath(path, c);
        if (pr.d > r) return false;
        return !doors.some((o) => pr.s > o.t - o.width / 2 + 0.12 && pr.s < o.t + o.width / 2 - 0.12);
      });
    }
    // Móveis.
    for (const it of p.items) {
      if (it.level !== level) continue;
      const def = CATALOG_BY_ID.get(it.catalogId);
      if (!def || def.mount !== 'piso' || def.h * it.scale < 0.08 || it.elev > 1.6) continue;
      const hw = (def.w * it.scale) / 2 + 0.08, hd = (def.d * it.scale) / 2 + 0.08;
      const R = Math.hypot(hw, hd);
      block({ minX: it.pos.x - R, minY: it.pos.y - R, maxX: it.pos.x + R, maxY: it.pos.y + R }, (c) => {
        const l = rotate({ x: c.x - it.pos.x, y: c.y - it.pos.y }, it.rot);
        return Math.abs(l.x) < hw && Math.abs(l.y) < hd;
      });
    }
    // Escadas deste andar: faixa ocupada até 2 m de altura.
    for (const s of p.stairs) {
      if (s.level !== level) continue;
      const lk = stairLink(s, p.levelHeight);
      const pts = lk.path.slice(1, -1);
      const hw = s.width / 2 + 0.05;
      const fp = stairFootprint(s, p.levelHeight);
      block(bbox(fp), (c) => {
        for (let k = 1; k < pts.length; k++) {
          const a = pts[k - 1], bb = pts[k];
          if (Math.min(a.h, bb.h) > 2.0) continue;
          if (projectOnPath([a.p, bb.p], c).d < hw) return true;
        }
        return s.kind === 'espiral' && dist(c, s.pos) < 0.25;
      });
    }
    // Vão das escadas do andar de baixo.
    for (const s of p.stairs) {
      if (s.level !== level - 1) continue;
      const fp = stairFootprint(s, p.levelHeight);
      block(bbox(fp), (c) => pointInPolygon(c, fp));
    }
    return g;
  }

  walkable(level: number, p: P): boolean {
    const g = this.levels[level];
    const i = this.idx(p);
    return !!g && i >= 0 && g[i] === 1;
  }

  nearestWalkable(level: number, p: P, maxR = 3): P | null {
    if (this.walkable(level, p)) return p;
    for (let r = CELL; r <= maxR; r += CELL) {
      const n = Math.ceil((2 * Math.PI * r) / CELL);
      for (let k = 0; k < n; k++) {
        const q = { x: p.x + Math.cos((k / n) * Math.PI * 2) * r, y: p.y + Math.sin((k / n) * Math.PI * 2) * r };
        if (this.walkable(level, q)) return q;
      }
    }
    return null;
  }

  private los(level: number, a: P, b: P): boolean {
    const d = dist(a, b);
    const n = Math.ceil(d / (CELL * 0.5));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (!this.walkable(level, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
    }
    return true;
  }

  private smooth(level: number, pts: P[]): P[] {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.los(level, pts[i], pts[j])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  /** Rota entre dois pontos, possivelmente em andares diferentes. */
  findPath(fromLevel: number, from: P, toLevel: number, to: P): RouteStep[] | null {
    const s0 = this.nearestWalkable(fromLevel, from, 2);
    const t0 = this.nearestWalkable(toLevel, to, 1.5);
    if (!s0 || !t0) return null;
    const N = this.N;
    const L = this.levels.length;
    const start = fromLevel * N + this.idx(s0);
    const goal = toLevel * N + this.idx(t0);
    const total = N * L;
    const gScore = new Float32Array(total).fill(Infinity);
    const came = new Int32Array(total).fill(-1);
    const viaLink = new Int16Array(total).fill(-1);
    const closed = new Uint8Array(total);
    // Ligações indexadas pela célula de origem.
    const linkFrom = new Map<number, { to: number; li: number; cost: number }[]>();
    this.links.forEach((lk, li) => {
      const a = lk.lower * N + this.idx(lk.bottom);
      const b = (lk.lower + 1) * N + this.idx(lk.top);
      if (a < 0 || b < 0) return;
      let len = 0;
      for (let k = 1; k < lk.path.length; k++) len += dist(lk.path[k - 1].p, lk.path[k].p) + Math.abs(lk.path[k].h - lk.path[k - 1].h);
      for (const [x, y] of [[a, b], [b, a]]) {
        if (!linkFrom.has(x)) linkFrom.set(x, []);
        linkFrom.get(x)!.push({ to: y, li, cost: len });
      }
    });
    const goalP = this.center(goal % N);
    const h = (id: number) => {
      const c = this.center(id % N);
      return dist(c, goalP) + Math.abs(Math.floor(id / N) - toLevel) * 3;
    };
    // Heap binário (id, f).
    const heap: number[] = [];
    const fs: number[] = [];
    const push = (id: number, f: number) => {
      heap.push(id); fs.push(f);
      let i = heap.length - 1;
      while (i > 0) {
        const pa = (i - 1) >> 1;
        if (fs[pa] <= fs[i]) break;
        [heap[pa], heap[i]] = [heap[i], heap[pa]]; [fs[pa], fs[i]] = [fs[i], fs[pa]];
        i = pa;
      }
    };
    const pop = () => {
      const top = heap[0];
      const lastId = heap.pop()!, lastF = fs.pop()!;
      if (heap.length) {
        heap[0] = lastId; fs[0] = lastF;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && fs[l] < fs[m]) m = l;
          if (r < heap.length && fs[r] < fs[m]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; [fs[m], fs[i]] = [fs[i], fs[m]];
          i = m;
        }
      }
      return top;
    };
    gScore[start] = 0;
    push(start, h(start));
    const nx = this.nx;
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let found = false;
    let guard = 0;
    while (heap.length && guard++ < 400000) {
      const cur = pop();
      if (closed[cur]) continue;
      if (cur === goal) { found = true; break; }
      closed[cur] = 1;
      const lvl = Math.floor(cur / N), i = cur % N;
      const g = this.levels[lvl];
      const cx = i % nx, cy = Math.floor(i / nx);
      for (const [dx, dy, c] of dirs) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= nx || y >= this.ny) continue;
        const j = y * nx + x;
        if (!g[j]) continue;
        if (dx && dy && (!g[cy * nx + x] || !g[y * nx + cx])) continue;
        const nid = lvl * N + j;
        const ng = gScore[cur] + c * CELL;
        if (ng < gScore[nid]) { gScore[nid] = ng; came[nid] = cur; viaLink[nid] = -1; push(nid, ng + h(nid)); }
      }
      for (const e of linkFrom.get(cur) ?? []) {
        const ng = gScore[cur] + e.cost;
        if (ng < gScore[e.to]) { gScore[e.to] = ng; came[e.to] = cur; viaLink[e.to] = e.li; push(e.to, ng + h(e.to)); }
      }
    }
    if (!found) return null;
    // Reconstrói e separa em trechos de caminhada e ligações.
    const chain: number[] = [];
    for (let c = goal; c !== -1; c = came[c]) chain.push(c);
    chain.reverse();
    const steps: RouteStep[] = [];
    let cur: P[] = [from];
    let curLevel = fromLevel;
    for (let k = 1; k < chain.length; k++) {
      const id = chain[k];
      const li = viaLink[id];
      if (li >= 0) {
        const lk = this.links[li];
        const up = Math.floor(id / N) > curLevel;
        cur.push(up ? lk.bottom : lk.top);
        steps.push({ type: 'walk', level: curLevel, pts: this.smooth(curLevel, cur) });
        steps.push({ type: 'link', link: lk, up });
        curLevel = Math.floor(id / N);
        cur = [up ? lk.top : lk.bottom];
      } else cur.push(this.center(id % N));
    }
    cur.push(to);
    steps.push({ type: 'walk', level: curLevel, pts: this.smooth(curLevel, cur) });
    return steps.filter((s) => s.type === 'link' || s.pts.length > 1);
  }
}
