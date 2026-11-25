import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Floor, Opening, Roof, Stair, P } from '../model/types';
import { stairSize, stairSteps } from '../model/geometry';
import { getMaterial, plain, GLASS } from './textures';

/* ---------------------------------------------------------------- Pisos */

export function buildFloorMesh(f: Floor, base: number, holes: P[][]): THREE.Mesh {
  const shape = new THREE.Shape(f.points.map((p) => new THREE.Vector2(p.x, -p.y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x, -p.y))));
  const th = Math.max(0.03, f.thickness);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, getMaterial(f.material, f.color));
  mesh.position.y = base + f.elevation - th;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

/* ---------------------------------------------------------------- Aberturas */

const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

/**
 * Esquadria de porta/janela em coordenadas locais: x ao longo da parede, z = normal, y a partir do chão.
 */
export function buildOpeningGroup(o: Opening, wallThickness: number): THREE.Group {
  const g = new THREE.Group();
  const W = o.width, H = o.height, T = wallThickness + 0.02;
  const frameMat = plain(o.color, 0.45, 0.05);
  const fw = 0.06;
  const isDoor = o.kind.startsWith('porta');
  const y0 = o.sill;
  // Batentes e verga.
  g.add(box(fw, H, T, frameMat, -W / 2 + fw / 2, y0 + H / 2, 0));
  g.add(box(fw, H, T, frameMat, W / 2 - fw / 2, y0 + H / 2, 0));
  g.add(box(W, fw, T, frameMat, 0, y0 + H - fw / 2, 0));
  if (!isDoor) g.add(box(W + 0.08, 0.04, T + 0.08, plain('#e8e4dc', 0.4), 0, y0 + 0.02, 0));
  const iw = W - fw * 2, ih = H - fw * (isDoor ? 1 : 2);
  const glass = GLASS();

  switch (o.kind) {
    case 'porta': {
      const leaf = new THREE.Group();
      const panel = box(iw, ih, 0.04, plain(o.color, 0.55), iw / 2, ih / 2, 0);
      leaf.add(panel);
      const handle = box(0.12, 0.025, 0.05, plain('#c9c9c9', 0.2, 0.9), iw - 0.12, 1.0, 0.04);
      const handle2 = handle.clone(); handle2.position.z = -0.04;
      leaf.add(handle, handle2);
      // Detalhe de almofadas.
      leaf.add(box(iw * 0.7, ih * 0.35, 0.05, plain(o.color, 0.4), iw / 2, ih * 0.72, 0));
      leaf.add(box(iw * 0.7, ih * 0.35, 0.05, plain(o.color, 0.4), iw / 2, ih * 0.28, 0));
      leaf.userData.leaf = true;
      leaf.position.set(o.flip ? iw / 2 : -iw / 2, y0, 0);
      if (o.flip) leaf.scale.x = -1;
      g.add(leaf);
      break;
    }
    case 'porta_dupla': {
      for (const side of [-1, 1]) {
        const lw = iw / 2;
        g.add(box(lw - 0.01, ih, 0.045, plain(o.color, 0.5), side * lw / 2, y0 + ih / 2, 0));
        g.add(box(lw * 0.6, ih * 0.6, 0.012, glass, side * lw / 2, y0 + ih * 0.6, 0));
        g.add(box(0.03, 0.35, 0.06, plain('#c9c9c9', 0.2, 0.9), side * 0.06, y0 + 1.05, 0));
      }
      break;
    }
    case 'porta_correr': {
      const pm = plain('#2c2d30', 0.4, 0.6);
      for (const [i, z] of [[0, -0.03], [1, 0.03]] as const) {
        const px = (i === 0 ? -1 : 1) * iw / 4;
        g.add(box(iw / 2 + 0.03, ih, 0.012, glass, px, y0 + ih / 2, z));
        g.add(box(0.04, ih, 0.04, pm, px - iw / 4, y0 + ih / 2, z));
        g.add(box(0.04, ih, 0.04, pm, px + iw / 4, y0 + ih / 2, z));
        g.add(box(iw / 2, 0.04, 0.04, pm, px, y0 + 0.02, z));
      }
      break;
    }
    case 'fachada_vidro': {
      const pm = plain(o.color, 0.4, 0.5);
      g.add(box(iw, ih, 0.015, glass, 0, y0 + fw + ih / 2, 0));
      const cols = Math.max(1, Math.round(W / 1.0));
      for (let i = 1; i < cols; i++) g.add(box(0.04, ih, 0.06, pm, -iw / 2 + (iw * i) / cols, y0 + fw + ih / 2, 0));
      g.add(box(iw, 0.04, 0.06, pm, 0, y0 + fw + ih * 0.33, 0));
      g.add(box(iw, fw, T, frameMat, 0, y0 + fw / 2, 0));
      break;
    }
    default: {
      // Janelas: vidro + montantes.
      g.add(box(iw, ih, 0.012, glass, 0, y0 + fw + ih / 2, 0));
      g.add(box(W, fw, T, frameMat, 0, y0 + fw / 2, 0));
      const mull = o.kind === 'janela_grande' ? 2 : o.kind === 'janela' ? 1 : 0;
      for (let i = 1; i <= mull; i++) g.add(box(0.035, ih, 0.05, frameMat, -iw / 2 + (iw * i) / (mull + 1), y0 + fw + ih / 2, 0));
      if (o.kind === 'janela_grande') g.add(box(iw, 0.035, 0.05, frameMat, 0, y0 + fw + ih * 0.7, 0));
    }
  }
  return g;
}

/* ---------------------------------------------------------------- Escadas */

function sectorGeo(r0: number, r1: number, a0: number, a1: number, height: number, y: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const p = new THREE.Vector2(Math.cos(a) * r1, -Math.sin(a) * r1);
    if (i === 0) s.moveTo(p.x, p.y); else s.lineTo(p.x, p.y);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    s.lineTo(Math.cos(a) * r0, -Math.sin(a) * r0);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

function boxGeo(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function rail(group: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, mat: THREE.Material) {
  const up = 0.9;
  const pa = a.clone().setY(a.y + up), pb = b.clone().setY(b.y + up);
  const len = pa.distanceTo(pb);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 8), mat);
  tube.position.copy(pa).lerp(pb, 0.5);
  tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pb.clone().sub(pa).normalize());
  group.add(tube);
  const posts = Math.max(2, Math.ceil(len / 1.2));
  for (let i = 0; i <= posts; i++) {
    const p = a.clone().lerp(b, i / posts);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, up, 6), mat);
    post.position.set(p.x, p.y + up / 2, p.z);
    group.add(post);
  }
}

/** Escada em coordenadas locais centradas na projeção; sobe de +z para -z (reta). */
export function buildStairGroup(s: Stair, levelHeight: number): THREE.Group {
  const N = stairSteps(levelHeight);
  const rise = levelHeight / N;
  const run = 0.28;
  const W = s.width;
  const { w, d } = stairSize(s, levelHeight);
  const geos: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();
  const railMat = plain('#2c2d30', 0.35, 0.7);

  if (s.kind === 'reta') {
    for (let i = 0; i < N; i++) {
      const top = (i + 1) * rise;
      geos.push(boxGeo(W, top, run, 0, top / 2, d / 2 - run * (i + 0.5)));
    }
    rail(group, new THREE.Vector3(W / 2 - 0.05, rise, d / 2 - run / 2), new THREE.Vector3(W / 2 - 0.05, levelHeight, -d / 2 + run / 2), railMat);
  } else if (s.kind === 'L') {
    const n1 = Math.floor(N / 2);
    const x1 = -w / 2 + W / 2;
    for (let i = 0; i < n1; i++) {
      const top = (i + 1) * rise;
      geos.push(boxGeo(W, top, run, x1, top / 2, d / 2 - run * (i + 0.5)));
    }
    const lt = (n1 + 1) * rise;
    geos.push(boxGeo(W, lt, W, x1, lt / 2, -d / 2 + W / 2));
    const n2 = N - n1 - 1;
    for (let i = 0; i < n2; i++) {
      const top = (n1 + 2 + i) * rise;
      geos.push(boxGeo(run, top, W, -w / 2 + W + run * (i + 0.5), top / 2, -d / 2 + W / 2));
    }
    rail(group, new THREE.Vector3(-w / 2 + W - 0.05, rise, d / 2 - run / 2), new THREE.Vector3(-w / 2 + W - 0.05, lt - rise, -d / 2 + W), railMat);
  } else if (s.kind === 'U') {
    const n1 = Math.floor((N - 1) / 2);
    const n2 = N - 1 - n1;
    const xl = -w / 2 + W / 2, xr = w / 2 - W / 2;
    for (let i = 0; i < n1; i++) {
      const top = (i + 1) * rise;
      geos.push(boxGeo(W, top, run, xl, top / 2, d / 2 - run * (i + 0.5)));
    }
    const lt = (n1 + 1) * rise;
    geos.push(boxGeo(w, lt, W, 0, lt / 2, -d / 2 + W / 2));
    for (let i = 0; i < n2; i++) {
      const top = (n1 + 2 + i) * rise;
      geos.push(boxGeo(W, top, run, xr, top / 2, -d / 2 + W + run * (i + 0.5)));
    }
    // Parede central entre lances.
    geos.push(boxGeo(0.08, lt, d - W, 0, lt / 2, W / 2));
  } else if (s.kind === 'espiral') {
    const R = w / 2 - 0.1;
    const step = (Math.PI * 2 * 0.88) / N;
    for (let i = 0; i < N; i++) {
      const a0 = i * step;
      geos.push(sectorGeo(0.1, R, a0, a0 + step * 1.08, 0.06, (i + 1) * rise - 0.06));
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, levelHeight + 0.9, 16), railMat);
    pole.position.y = (levelHeight + 0.9) / 2;
    group.add(pole);
    // Corrimão helicoidal.
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N * 2; i++) {
      const a = (i / (N * 2)) * N * step;
      pts.push(new THREE.Vector3(Math.cos(a) * R, ((i / (N * 2)) * N) * rise + 0.95, Math.sin(a) * R));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N * 3, 0.025, 6), railMat);
    group.add(tube);
  } else {
    // Curva: meia-volta ampla, degraus maciços.
    const Ro = w / 2, Ri = Ro - W;
    const step = Math.PI / N;
    for (let i = 0; i < N; i++) {
      const a0 = -Math.PI / 2 + i * step;
      const top = (i + 1) * rise;
      geos.push(sectorGeo(Ri, Ro, a0, a0 + step, top, 0));
    }
  }

  if (geos.length) {
    const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged!, getMaterial(s.material, s.color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/* ---------------------------------------------------------------- Telhados */

class TriBuilder {
  pos: number[] = [];
  uv: number[] = [];
  tri(a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[]) {
    this.pos.push(...a, ...b, ...c);
    this.uv.push(...ua, ...ub, ...uc);
  }
  /** Quadrilátero com UV calculado a partir das coordenadas ao longo das bordas. */
  quad(a: number[], b: number[], c: number[], d: number[]) {
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const ad = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
    this.tri(a, b, c, [0, 0], [ab, 0], [ab, ad]);
    this.tri(a, c, d, [0, 0], [ab, ad], [0, ad]);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return g;
  }
}

/** Telhado em coordenadas locais (cumeeira ao longo de x). y=0 é o topo das paredes. */
export function buildRoofGroup(r: Roof): THREE.Group {
  const group = new THREE.Group();
  const swap = r.kind === 'quatro_aguas' && r.d > r.w;
  const w = swap ? r.d : r.w;
  const d = swap ? r.w : r.d;
  const ov = r.overhang;
  const W = w / 2 + ov, D = d / 2 + ov;
  const k = r.pitch;
  const surf = new TriBuilder();
  const gable = new TriBuilder();
  const ye = -k * ov; // altura do beiral

  switch (r.kind) {
    case 'plano': {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w + ov * 2, 0.22, d + ov * 2), getMaterial(r.material, r.color));
      slab.position.y = 0.11;
      slab.castShadow = slab.receiveShadow = true;
      group.add(slab);
      const pm = plain('#e8e1d4', 0.9);
      const ph = 0.5, pt = 0.12;
      for (const [x, z, sw, sd] of [[0, -D + pt / 2, W * 2, pt], [0, D - pt / 2, W * 2, pt], [-W + pt / 2, 0, pt, D * 2], [W - pt / 2, 0, pt, D * 2]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sw, ph, sd), pm);
        m.position.set(x, 0.22 + ph / 2, z);
        m.castShadow = true;
        group.add(m);
      }
      return group;
    }
    case 'uma_agua': {
      const h = k * d; // lado alto em z = -d/2
      const yAt = (z: number) => k * (d / 2 - z);
      surf.quad([-W, yAt(D) - k * 0, D], [W, yAt(D), D], [W, yAt(-D), -D], [-W, yAt(-D), -D]);
      for (const x of [-w / 2, w / 2]) gable.tri([x, 0, d / 2], [x, 0, -d / 2], [x, h, -d / 2], [0, 0], [d, 0], [d, h]);
      gable.quad([-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, h, -d / 2], [-w / 2, h, -d / 2]);
      break;
    }
    case 'duas_aguas': {
      const h = k * d / 2;
      surf.quad([-W, ye, D], [W, ye, D], [W, h, 0], [-W, h, 0]);
      surf.quad([W, ye, -D], [-W, ye, -D], [-W, h, 0], [W, h, 0]);
      for (const x of [-w / 2, w / 2]) gable.tri([x, 0, d / 2], [x, 0, -d / 2], [x, h, 0], [0, 0], [d, 0], [d / 2, h]);
      break;
    }
    case 'quatro_aguas': {
      const h = k * d / 2;
      const rx = Math.max(0, (w - d) / 2);
      surf.quad([-W, ye, D], [W, ye, D], [rx, h, 0], [-rx, h, 0]);
      surf.quad([W, ye, -D], [-W, ye, -D], [-rx, h, 0], [rx, h, 0]);
      surf.tri([W, ye, D], [W, ye, -D], [rx, h, 0], [0, 0], [D * 2, 0], [D, h]);
      surf.tri([-W, ye, -D], [-W, ye, D], [-rx, h, 0], [0, 0], [D * 2, 0], [D, h]);
      break;
    }
    case 'curvo': {
      const s = k * d / 2; // flecha
      const half = d / 2;
      const R = (half * half + s * s) / (2 * s);
      const cy = s - R;
      const yAt = (z: number) => cy + Math.sqrt(Math.max(0, R * R - z * z));
      const n = 18;
      for (let i = 0; i < n; i++) {
        const z0 = -D + (2 * D * i) / n, z1 = -D + (2 * D * (i + 1)) / n;
        surf.quad([-W, yAt(z0), z0], [W, yAt(z0), z0], [W, yAt(z1), z1], [-W, yAt(z1), z1]);
      }
      for (const x of [-w / 2, w / 2]) {
        for (let i = 0; i < n; i++) {
          const z0 = -half + (d * i) / n, z1 = -half + (d * (i + 1)) / n;
          gable.quad([x, 0, z0], [x, 0, z1], [x, yAt(z1), z1], [x, yAt(z0), z0]);
        }
      }
      break;
    }
  }
  const sm = new THREE.Mesh(surf.build(), getMaterial(r.material, r.color));
  sm.castShadow = sm.receiveShadow = true;
  group.add(sm);
  if (gable.pos.length) {
    const gm = new THREE.Mesh(gable.build(), getMaterial('reboco', '#e8e1d4'));
    gm.castShadow = gm.receiveShadow = true;
    group.add(gm);
  }
  if (swap) group.rotation.y = Math.PI / 2;
  return group;
}

/** Altura máxima do telhado acima do topo das paredes. */
export function roofHeight(r: Roof): number {
  if (r.kind === 'plano') return 0.72;
  const d = r.kind === 'quatro_aguas' ? Math.min(r.w, r.d) : r.d;
  return r.kind === 'uma_agua' ? r.pitch * d : (r.pitch * d) / 2;
}
