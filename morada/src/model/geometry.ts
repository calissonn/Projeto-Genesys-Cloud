import type { P, Wall, Stair, Roof } from './types';

export const EPS = 1e-6;

export const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: P, s: number): P => ({ x: a.x * s, y: a.y * s });
export const len = (a: P): number => Math.hypot(a.x, a.y);
export const dist = (a: P, b: P): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const norm = (a: P): P => {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
/** Normal à esquerda (no sentido anti-horário da planta). */
export const leftNormal = (d: P): P => ({ x: -d.y, y: d.x });
export const rotate = (p: P, ang: number): P => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

export interface ArcInfo {
  center: P;
  radius: number;
  start: number;
  sweep: number;
}

/** Calcula o círculo que passa por a, b e pela flecha (bulge). */
export function arcOf(a: P, b: P, bulge: number): ArcInfo | null {
  const c = dist(a, b);
  if (Math.abs(bulge) < 1e-3 || c < EPS) return null;
  const s = Math.abs(bulge);
  const r = (c * c) / (8 * s) + s / 2;
  const mid = lerp(a, b, 0.5);
  const n = leftNormal(norm(sub(b, a)));
  const sign = Math.sign(bulge);
  // O centro fica do lado oposto à flecha, a uma distância (r - s) do ponto médio.
  const center = add(mid, mul(n, -sign * (r - s)));
  const start = Math.atan2(a.y - center.y, a.x - center.x);
  let end = Math.atan2(b.y - center.y, b.x - center.x);
  // Determina o sentido: o ponto da flecha precisa estar no arco.
  const apex = add(mid, mul(n, bulge));
  const apexAng = Math.atan2(apex.y - center.y, apex.x - center.x);
  const norm2pi = (v: number) => ((v % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  let sweepCCW = norm2pi(end - start);
  const apexCCW = norm2pi(apexAng - start);
  let sweep = apexCCW <= sweepCCW ? sweepCCW : sweepCCW - Math.PI * 2;
  if (Math.abs(sweep) < EPS) sweep = Math.PI * 2;
  end = start + sweep;
  return { center, radius: r, start, sweep };
}

/** Pontos do eixo da parede. Paredes retas retornam 2 pontos; curvas, uma poligonal. */
export function wallPath(w: Pick<Wall, 'a' | 'b' | 'bulge'>, segLen = 0.25): P[] {
  const arc = arcOf(w.a, w.b, w.bulge);
  if (!arc) return [w.a, w.b];
  const arcLen = Math.abs(arc.sweep) * arc.radius;
  const n = Math.max(6, Math.min(96, Math.ceil(arcLen / segLen)));
  const pts: P[] = [];
  for (let i = 0; i <= n; i++) {
    const ang = arc.start + (arc.sweep * i) / n;
    pts.push({ x: arc.center.x + Math.cos(ang) * arc.radius, y: arc.center.y + Math.sin(ang) * arc.radius });
  }
  pts[0] = { ...w.a };
  pts[n] = { ...w.b };
  return pts;
}

export function pathLength(pts: P[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

export function wallLength(w: Pick<Wall, 'a' | 'b' | 'bulge'>): number {
  const arc = arcOf(w.a, w.b, w.bulge);
  if (!arc) return dist(w.a, w.b);
  return Math.abs(arc.sweep) * arc.radius;
}

/** Ponto e tangente a uma distância s ao longo da poligonal. */
export function pointAt(pts: P[], s: number): { p: P; tan: P } {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = dist(pts[i - 1], pts[i]);
    if (acc + l >= s || i === pts.length - 1) {
      const t = l < EPS ? 0 : Math.max(0, Math.min(1, (s - acc) / l));
      return { p: lerp(pts[i - 1], pts[i], t), tan: norm(sub(pts[i], pts[i - 1])) };
    }
    acc += l;
  }
  return { p: pts[0], tan: { x: 1, y: 0 } };
}

/** Projeção de p sobre a poligonal: distância ao longo (s) e distância perpendicular. */
export function projectOnPath(pts: P[], p: P): { s: number; d: number; point: P } {
  let best = { s: 0, d: Infinity, point: pts[0] };
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const ab = sub(b, a);
    const l2 = ab.x * ab.x + ab.y * ab.y;
    const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2));
    const q = lerp(a, b, t);
    const d = dist(p, q);
    if (d < best.d) best = { s: acc + Math.sqrt(l2) * t, d, point: q };
    acc += Math.sqrt(l2);
  }
  return best;
}

export function polygonArea(pts: P[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function pointInPolygon(p: P, poly: P[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + 1e-12) + a.x) inside = !inside;
  }
  return inside;
}

/** Distância de p ao contorno do polígono. */
export function distToPolygonEdge(p: P, poly: P[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    best = Math.min(best, projectOnPath([poly[i], poly[(i + 1) % poly.length]], p).d);
  }
  return best;
}

export function centroid(pts: P[]): P {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}

export function bbox(pts: P[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

export function rectPoints(center: P, w: number, d: number, rot: number): P[] {
  const hw = w / 2, hd = d / 2;
  return [
    { x: -hw, y: -hd }, { x: hw, y: -hd }, { x: hw, y: hd }, { x: -hw, y: hd },
  ].map((p) => add(center, rotate(p, rot)));
}

/** Dimensões (local) da projeção em planta de cada tipo de escada. */
export function stairSize(s: Pick<Stair, 'kind' | 'width'>, levelHeight: number): { w: number; d: number } {
  const steps = stairSteps(levelHeight);
  const run = 0.28;
  const W = s.width;
  switch (s.kind) {
    case 'reta': return { w: W, d: steps * run };
    case 'L': return { w: W + Math.ceil(steps / 2) * run, d: W + Math.floor(steps / 2) * run };
    case 'U': return { w: W * 2 + 0.1, d: Math.ceil(steps / 2) * run + W };
    case 'espiral': return { w: W * 2 + 0.3, d: W * 2 + 0.3 };
    case 'curva': return { w: W + 2.6, d: W + 2.6 };
  }
}

export function stairSteps(levelHeight: number): number {
  return Math.max(8, Math.round(levelHeight / 0.18));
}

export function stairFootprint(s: Stair, levelHeight: number): P[] {
  const { w, d } = stairSize(s, levelHeight);
  return rectPoints(s.pos, w, d, s.rot);
}

export function roofFootprint(r: Roof): P[] {
  return rectPoints(r.center, r.w + r.overhang * 2, r.d + r.overhang * 2, r.rot);
}

export function snap(v: number, step: number): number {
  return Math.round(v / step) * step;
}

export function snapAngle(a: P, b: P, stepDeg: number): P {
  const d = sub(b, a);
  const l = len(d);
  if (l < EPS) return b;
  const step = (stepDeg * Math.PI) / 180;
  const ang = Math.round(Math.atan2(d.y, d.x) / step) * step;
  return { x: a.x + Math.cos(ang) * l, y: a.y + Math.sin(ang) * l };
}

export function fmtM(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m';
}

export function fmtM2(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' m²';
}
