import * as THREE from 'three';
import type { P, Wall, Opening } from '../model/types';
import { wallPath, pathLength, pointAt, dist, sub, norm, leftNormal, add, mul } from '../model/geometry';

interface Hole {
  s0: number;
  s1: number;
  y0: number;
  y1: number;
}

class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, n: THREE.Vector3 | THREE.Vector3[], uvs: number[][]) {
    // a-b-c-d em sentido anti-horário visto pela face.
    const ns = Array.isArray(n) ? n : [n, n, n, n];
    const tri = [0, 1, 2, 0, 2, 3];
    const vs = [a, b, c, d];
    for (const i of tri) {
      this.pos.push(vs[i].x, vs[i].y, vs[i].z);
      this.nor.push(ns[i].x, ns[i].y, ns[i].z);
      this.uv.push(uvs[i][0], uvs[i][1]);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Gera a geometria de uma parede (reta ou curva) com vãos de portas e janelas.
 * A parede é amostrada como poligonal e cada trecho é extrudado com a espessura.
 * `extendA/B` prolongam as pontas para fechar cantos com paredes conectadas.
 */
export function buildWallGeometry(
  wall: Wall,
  openings: Opening[],
  base: number,
  heightOverride: number | null,
  extendA: number,
  extendB: number,
): THREE.BufferGeometry {
  const H = heightOverride ?? wall.height;
  const T = wall.thickness;
  let pts = wallPath(wall);
  const L = pathLength(pts);
  const straight = pts.length === 2;

  // Prolonga extremidades (apenas paredes retas, para não deformar arcos).
  let offset = 0;
  if (straight && (extendA > 0 || extendB > 0)) {
    const dir = norm(sub(pts[1], pts[0]));
    pts = [add(pts[0], mul(dir, -extendA)), add(pts[1], mul(dir, extendB))];
    offset = extendA;
  }
  const totalL = L + (straight ? extendA + extendB : 0);

  const holes: Hole[] = openings
    .map((o) => ({
      s0: Math.max(0, o.t - o.width / 2) + offset,
      s1: Math.min(L, o.t + o.width / 2) + offset,
      y0: Math.min(H, o.sill),
      y1: Math.min(H, o.sill + o.height),
    }))
    .filter((h) => h.s1 > h.s0 && h.y1 > h.y0)
    .sort((a, b) => a.s0 - b.s0);

  // Distâncias acumuladas dos vértices + inserção dos limites dos vãos.
  const cuts = new Set<number>();
  let acc = 0;
  cuts.add(0);
  for (let i = 1; i < pts.length; i++) { acc += dist(pts[i - 1], pts[i]); cuts.add(acc); }
  for (const h of holes) { cuts.add(h.s0); cuts.add(h.s1); }
  const ss = [...cuts].filter((s) => s >= -1e-6 && s <= totalL + 1e-6).sort((a, b) => a - b);
  const stations = ss.filter((s, i) => i === 0 || s - ss[i - 1] > 1e-4);

  // Normal suavizada em cada estação.
  const frames = stations.map((s) => {
    const { p } = pointAt(pts, s);
    const e = 0.01;
    const p0 = pointAt(pts, Math.max(0, s - e)).p;
    const p1 = pointAt(pts, Math.min(totalL, s + e)).p;
    const tan = norm(sub(p1, p0));
    const n = leftNormal(tan);
    return { s, p, n, tan };
  });

  const g = new GeoBuilder();
  const v = (p: P, n: P, side: number, y: number) => new THREE.Vector3(p.x + n.x * side * T / 2, base + y, p.y + n.y * side * T / 2);
  const V3 = (n: P, k = 1) => new THREE.Vector3(n.x * k, 0, n.y * k);
  const UP = new THREE.Vector3(0, 1, 0);
  const DOWN = new THREE.Vector3(0, -1, 0);

  const rangesAt = (sm: number): [number, number][] => {
    const h = holes.find((hh) => sm > hh.s0 && sm < hh.s1);
    if (!h) return [[0, H]];
    const r: [number, number][] = [];
    if (h.y0 > 0.001) r.push([0, h.y0]);
    if (h.y1 < H - 0.001) r.push([h.y1, H]);
    return r;
  };

  for (let i = 0; i < frames.length - 1; i++) {
    const f0 = frames[i], f1 = frames[i + 1];
    const sm = (f0.s + f1.s) / 2;
    for (const [y0, y1] of rangesAt(sm)) {
      // Face esquerda (+n) e direita (-n).
      for (const side of [1, -1]) {
        const a = v(f0.p, f0.n, side, y0), b = v(f1.p, f1.n, side, y0);
        const c = v(f1.p, f1.n, side, y1), d = v(f0.p, f0.n, side, y1);
        const ns = [V3(f0.n, side), V3(f1.n, side), V3(f1.n, side), V3(f0.n, side)];
        const uvs = [[f0.s, y0], [f1.s, y0], [f1.s, y1], [f0.s, y1]];
        if (side === 1) g.quad(a, b, c, d, ns, uvs);
        else g.quad(b, a, d, c, [ns[1], ns[0], ns[3], ns[2]], [uvs[1], uvs[0], uvs[3], uvs[2]]);
      }
      // Topo da faixa.
      {
        const a = v(f0.p, f0.n, 1, y1), b = v(f1.p, f1.n, 1, y1), c = v(f1.p, f1.n, -1, y1), d = v(f0.p, f0.n, -1, y1);
        g.quad(a, b, c, d, UP, [[f0.s, 0], [f1.s, 0], [f1.s, T], [f0.s, T]]);
      }
      // Base da faixa (visível sob vergas).
      if (y0 > 0.001) {
        const a = v(f0.p, f0.n, -1, y0), b = v(f1.p, f1.n, -1, y0), c = v(f1.p, f1.n, 1, y0), d = v(f0.p, f0.n, 1, y0);
        g.quad(a, b, c, d, DOWN, [[f0.s, 0], [f1.s, 0], [f1.s, T], [f0.s, T]]);
      }
    }
  }

  // Tampas: extremidades e laterais dos vãos (onde o conjunto de faixas muda).
  const cap = (f: (typeof frames)[number], y0: number, y1: number, dirSign: number) => {
    const a = v(f.p, f.n, -1, y0), b = v(f.p, f.n, 1, y0), c = v(f.p, f.n, 1, y1), d = v(f.p, f.n, -1, y1);
    const n = V3(f.tan, dirSign);
    if (dirSign < 0) g.quad(a, b, c, d, n, [[0, y0], [T, y0], [T, y1], [0, y1]]);
    else g.quad(b, a, d, c, n, [[T, y0], [0, y0], [0, y1], [T, y1]]);
  };
  cap(frames[0], 0, H, -1);
  cap(frames[frames.length - 1], 0, H, 1);
  for (const h of holes) {
    const fa = frames.find((f) => Math.abs(f.s - h.s0) < 1e-3);
    const fb = frames.find((f) => Math.abs(f.s - h.s1) < 1e-3);
    if (fa && h.s0 > 1e-3) cap(fa, h.y0, h.y1, 1);
    if (fb && h.s1 < totalL - 1e-3) cap(fb, h.y0, h.y1, -1);
  }

  return g.build();
}
