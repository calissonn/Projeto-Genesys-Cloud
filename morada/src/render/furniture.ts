import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { CatalogDef } from '../model/catalog';
import { CATALOG_BY_ID } from '../model/catalog';
import { getMaterial, plain, GLASS } from './textures';

/**
 * Modelos procedurais de móveis, compostos por várias peças (estrutura, almofadas, pés, puxadores...).
 * Convenção local: origem no centro da base, frente voltada para +z, y para cima.
 */

type M = THREE.Material;
type Ctx = { g: THREE.Group; main: M; color: string; def: CatalogDef };

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}

function add(g: THREE.Group, geo: THREE.BufferGeometry, m: M, x: number, y: number, z: number, shadow = true) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/** Caixa com base em y. */
const B = (g: THREE.Group, w: number, h: number, d: number, m: M, x = 0, y = 0, z = 0) =>
  add(g, cached(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), m, x, y + h / 2, z);
/** Caixa arredondada com base em y. */
const R = (g: THREE.Group, w: number, h: number, d: number, m: M, x = 0, y = 0, z = 0, r = 0.04) =>
  add(g, cached(`r${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.1, h / 2.1, d / 2.1))), m, x, y + h / 2, z);
/** Cilindro com base em y. */
const C = (g: THREE.Group, rt: number, rb: number, h: number, m: M, x = 0, y = 0, z = 0, seg = 20) =>
  add(g, cached(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m, x, y + h / 2, z);
const S = (g: THREE.Group, r: number, m: M, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
  const mesh = add(g, cached(`s${r}`, () => new THREE.SphereGeometry(r, 18, 12)), m, x, y, z);
  mesh.scale.set(sx, sy, sz);
  return mesh;
};

const DARKWOOD = () => getMaterial('madeira_escura');
const METAL = () => plain('#c3c6ca', 0.3, 0.85);
const BLACK = () => plain('#1f1f22', 0.45, 0.4);
const WHITE = () => plain('#f6f6f4', 0.35, 0);
const CERAMIC = () => plain('#fbfbfb', 0.12, 0);
const LEAF = () => plain('#3f7a3a', 0.8);
const LEAF2 = () => plain('#5c9a44', 0.8);
const TRUNK = () => plain('#6b4a30', 0.9);
const SCREEN = () => plain('#0c0f14', 0.15, 0.3, { emissive: new THREE.Color('#0b1a2b'), emissiveIntensity: 0.6 });
const WATER = () => plain('#3fa7c4', 0.05, 0.1, { transparent: true, opacity: 0.78 });
const BULB = () => plain('#fff3d6', 0.4, 0, { emissive: new THREE.Color('#ffe2a8'), emissiveIntensity: 1.2 });

function legs4(g: THREE.Group, w: number, d: number, h: number, m: M, inset = 0.06, r = 0.022) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) C(g, r, r * 0.8, h, m, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), 10);
}

function chair(c: Ctx, w: number, d: number, h: number) {
  const seatH = 0.46;
  legs4(c.g, w, d, seatH - 0.04, c.main, 0.04, 0.018);
  R(c.g, w, 0.05, d, c.main, 0, seatH - 0.05, 0, 0.015);
  R(c.g, w - 0.04, 0.03, d - 0.06, plain(c.color === '#c49a6c' ? '#d9cbb5' : '#d9cbb5', 0.95), 0, seatH, 0.01, 0.012);
  R(c.g, w, h - seatH, 0.04, c.main, 0, seatH, -d / 2 + 0.02, 0.015);
}

function sofaBody(c: Ctx, w: number, d: number, h: number, fabric: M) {
  const g = c.g, base = 0.12, seat = 0.42, arm = 0.18, back = 0.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) C(g, 0.025, 0.018, base, BLACK(), sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08), 8);
  R(g, w, seat - base, d, fabric, 0, base, 0, 0.05);
  R(g, w - arm * 2, h - base, back, fabric, 0, base, -d / 2 + back / 2, 0.06);
  for (const sx of [-1, 1]) R(g, arm, 0.62 - base, d, fabric, sx * (w / 2 - arm / 2), base, 0, 0.06);
  const n = w > 1.6 ? 3 : w > 1.1 ? 2 : 1;
  const cw = (w - arm * 2) / n;
  for (let i = 0; i < n; i++) {
    R(g, cw - 0.02, 0.14, d - back - 0.04, fabric, -w / 2 + arm + cw * (i + 0.5), seat, back / 2 + 0.01, 0.06);
    R(g, cw - 0.06, 0.4, 0.14, fabric, -w / 2 + arm + cw * (i + 0.5), seat + 0.08, -d / 2 + back + 0.06, 0.07).rotation.x = -0.12;
  }
}

function plantFoliage(g: THREE.Group, x: number, y: number, z: number, r: number, count = 7) {
  const l1 = LEAF(), l2 = LEAF2();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const rr = r * (0.45 + ((i * 37) % 10) / 25);
    S(g, r * 0.55, i % 2 ? l1 : l2, x + Math.cos(a) * rr * 0.6, y + ((i * 13) % 7) / 7 * r * 0.6, z + Math.sin(a) * rr * 0.6, 1, 0.8, 1);
  }
  S(g, r * 0.6, l2, x, y + r * 0.5, z);
}

const builders: Record<string, (c: Ctx) => void> = {
  sofa3: (c) => sofaBody(c, c.def.w, c.def.d, c.def.h, c.main),
  sofa_l: (c) => {
    const { w, d, h } = c.def;
    const g = c.g, fabric = c.main;
    const depth = 0.9;
    const sub1 = new THREE.Group();
    sofaBody({ ...c, g: sub1 }, w, depth, h, fabric);
    sub1.position.z = -d / 2 + depth / 2;
    g.add(sub1);
    // Chaise
    R(g, depth, 0.3, d - depth, fabric, w / 2 - depth / 2, 0.12, depth / 2, 0.05);
    R(g, depth - 0.04, 0.14, d - depth, fabric, w / 2 - depth / 2, 0.42, depth / 2, 0.06);
    R(g, 0.18, 0.5, d - depth, fabric, w / 2 - 0.09, 0.12, depth / 2, 0.06);
  },
  poltrona: (c) => {
    const { w, d, h } = c.def;
    sofaBody(c, w, d, h, c.main);
  },
  mesa_centro: (c) => {
    const { w, d, h } = c.def;
    R(c.g, w, 0.05, d, c.main, 0, h - 0.05, 0, 0.02);
    R(c.g, w - 0.1, 0.03, d - 0.1, c.main, 0, 0.12, 0, 0.01);
    legs4(c.g, w, d, h - 0.05, BLACK(), 0.06, 0.018);
  },
  rack_tv: (c) => {
    const { w, d, h } = c.def;
    R(c.g, w, h - 0.08, d, c.main, 0, 0.08, 0, 0.015);
    for (const sx of [-1, 1]) B(c.g, 0.04, 0.08, d - 0.1, BLACK(), sx * (w / 2 - 0.1), 0, 0);
    const n = 3;
    for (let i = 0; i < n; i++) {
      B(c.g, w / n - 0.03, h - 0.16, 0.01, getMaterial('madeira'), -w / 2 + (w / n) * (i + 0.5), 0.12, d / 2);
      B(c.g, 0.12, 0.015, 0.02, METAL(), -w / 2 + (w / n) * (i + 0.5), h - 0.12, d / 2 + 0.01);
    }
  },
  tapete: (c) => {
    const { w, d } = c.def;
    R(c.g, w, 0.015, d, c.main, 0, 0, 0, 0.006);
    R(c.g, w - 0.25, 0.017, d - 0.25, plain('#f1ece3', 1), 0, 0, 0, 0.006);
    R(c.g, w - 0.35, 0.019, d - 0.35, c.main, 0, 0, 0, 0.006);
  },
  estante: (c) => {
    const { w, d, h } = c.def;
    const g = c.g, m = c.main;
    for (const sx of [-1, 1]) B(g, 0.03, h, d, m, sx * (w / 2 - 0.015), 0, 0);
    B(g, w, h, 0.015, m, 0, 0, -d / 2 + 0.008);
    const shelves = 5;
    const colors = ['#b5523b', '#3e6a9a', '#e0b84f', '#4f7a4a', '#7d4e75', '#f1ece3'];
    for (let i = 0; i <= shelves; i++) {
      const y = (i * (h - 0.03)) / shelves;
      B(g, w - 0.06, 0.03, d, m, 0, y, 0);
      if (i < shelves) {
        let x = -w / 2 + 0.06;
        let k = i * 3;
        while (x < w / 2 - 0.2 && (k % 7) !== 6) {
          const bw = 0.03 + ((k * 7) % 4) * 0.01;
          const bh = 0.2 + ((k * 5) % 5) * 0.025;
          B(g, bw, bh, d * 0.7, plain(colors[k % colors.length], 0.8), x + bw / 2, y + 0.03, 0.01);
          x += bw + 0.004;
          k++;
          if (x > w * 0.1 && k % 9 === 0) break;
        }
      }
    }
  },
  mesa_jantar: (c) => {
    const { w, d, h } = c.def;
    R(c.g, w, 0.05, d, c.main, 0, h - 0.05, 0, 0.015);
    legs4(c.g, w, d, h - 0.05, c.main, 0.1, 0.03);
    B(c.g, w - 0.3, 0.08, 0.03, c.main, 0, h - 0.13, d / 2 - 0.1);
    B(c.g, w - 0.3, 0.08, 0.03, c.main, 0, h - 0.13, -d / 2 + 0.1);
  },
  mesa_redonda: (c) => {
    const { w, h } = c.def;
    C(c.g, w / 2, w / 2, 0.04, c.main, 0, h - 0.04, 0, 40);
    C(c.g, 0.05, 0.06, h - 0.04, BLACK(), 0, 0, 0, 12);
    C(c.g, 0.3, 0.32, 0.03, BLACK(), 0, 0, 0, 24);
  },
  cadeira: (c) => chair(c, c.def.w, c.def.d, c.def.h),
  banqueta: (c) => {
    const { h } = c.def;
    C(c.g, 0.19, 0.19, 0.05, getMaterial('couro', '#6e4630'), 0, h - 0.05, 0, 24);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = C(c.g, 0.012, 0.014, h - 0.05, c.main, Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14, 8);
      leg.rotation.set(Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.01, 6, 24), c.main);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; c.g.add(ring);
  },
  buffet: (c) => {
    const { w, d, h } = c.def;
    R(c.g, w, h - 0.15, d, c.main, 0, 0.15, 0, 0.015);
    legs4(c.g, w, d, 0.15, BLACK(), 0.08, 0.015);
    for (let i = 0; i < 4; i++) B(c.g, 0.015, 0.12, 0.02, METAL(), -w / 2 + (w / 4) * (i + 0.5) + 0.12, h - 0.35, d / 2 + 0.01);
  },
  balcao: (c) => {
    const { w, d, h } = c.def;
    B(c.g, w - 0.02, 0.1, d - 0.08, BLACK(), 0, 0, -0.03);
    B(c.g, w, h - 0.14, d - 0.02, plain(c.color, 0.5), 0, 0.1, 0);
    B(c.g, w + 0.02, 0.04, d + 0.02, c.main, 0, h - 0.04, 0);
    B(c.g, 0.008, h - 0.2, 0.02, plain('#bbb', 0.5), 0, 0.12, d / 2);
    for (const sx of [-1, 1]) B(c.g, 0.02, 0.15, 0.02, METAL(), sx * 0.06, h - 0.3, d / 2);
  },
  pia_cozinha: (c) => {
    builders.balcao(c);
    const { h } = c.def;
    B(c.g, 0.55, 0.012, 0.4, METAL(), 0, h - 0.005, 0.02);
    B(c.g, 0.5, 0.01, 0.35, plain('#8f9398', 0.3, 0.9), 0, h - 0.004, 0.02);
    C(c.g, 0.015, 0.015, 0.28, METAL(), 0, h, -0.22, 10);
    const spout = B(c.g, 0.02, 0.02, 0.18, METAL(), 0, h + 0.27, -0.14);
    spout.rotation.x = 0.2;
  },
  ilha: (c) => {
    const { w, d, h } = c.def;
    B(c.g, w - 0.1, h - 0.04, d - 0.3, WHITE(), 0, 0, -0.1);
    B(c.g, w, 0.05, d, c.main, 0, h - 0.05, 0);
    for (let i = 0; i < 3; i++) B(c.g, w / 3 - 0.04, h - 0.12, 0.01, WHITE(), -w / 2 + 0.05 + (w - 0.1) / 3 * (i + 0.5), 0.04, -0.1 - (d - 0.3) / 2);
  },
  armario_alto: (c) => {
    const { w, d, h } = c.def;
    B(c.g, w, h, d, c.main, 0, 0, 0);
    for (const sx of [-1, 1]) {
      B(c.g, w / 2 - 0.015, h - 0.02, 0.012, c.main, sx * w / 4, 0.01, d / 2);
      B(c.g, 0.12, 0.012, 0.02, METAL(), sx * 0.08, 0.06, d / 2 + 0.01);
    }
  },
  cama_casal: (c) => {
    const { w, d, h } = c.def;
    const g = c.g;
    R(g, w + 0.06, 0.32, d, DARKWOOD(), 0, 0.05, 0, 0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, 0.06, 0.05, 0.06, DARKWOOD(), sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05));
    R(g, w, 0.22, d - 0.08, WHITE(), 0, 0.37, 0.02, 0.06);
    R(g, w + 0.06, h, 0.08, getMaterial('tecido', '#7d7a74'), 0, 0.05, -d / 2 + 0.04, 0.03);
    R(g, w + 0.02, 0.06, d * 0.62, c.main, 0, 0.57, d * 0.19, 0.03);
    R(g, w + 0.03, 0.08, 0.3, c.main, 0, 0.57, d * 0.06 - 0.02, 0.03);
    const n = w > 1.2 ? 2 : 1;
    for (let i = 0; i < n; i++) R(g, w / n - 0.12, 0.14, 0.4, WHITE(), -w / 2 + (w / n) * (i + 0.5), 0.6, -d / 2 + 0.3, 0.07);
  },
  cama_solteiro: (c) => builders.cama_casal(c),
  berco: (c) => {
    const { w, d, h } = c.def;
    const g = c.g;
    legs4(g, w, d, h, c.main, 0.03, 0.025);
    R(g, w - 0.04, 0.12, d - 0.04, WHITE(), 0, 0.35, 0, 0.04);
    for (const sz of [-1, 1]) B(g, w, 0.04, 0.04, c.main, 0, h - 0.04, sz * (d / 2 - 0.03));
    for (const sx of [-1, 1]) B(g, 0.04, 0.04, d, c.main, sx * (w / 2 - 0.03), h - 0.04, 0);
    for (let i = 1; i < 12; i++) for (const sx of [-1, 1]) C(g, 0.01, 0.01, h - 0.4, c.main, sx * (w / 2 - 0.03), 0.36, -d / 2 + (d * i) / 12, 6);
    R(g, w * 0.6, 0.06, 0.3, getMaterial('tecido', '#bcd3ea'), 0, 0.47, 0.2, 0.03);
  },
  criado: (c) => {
    const { w, d, h } = c.def;
    legs4(c.g, w, d, 0.12, BLACK(), 0.05, 0.012);
    R(c.g, w, h - 0.12, d, c.main, 0, 0.12, 0, 0.012);
    for (let i = 0; i < 2; i++) B(c.g, 0.1, 0.012, 0.015, METAL(), 0, 0.22 + i * 0.18, d / 2 + 0.005);
  },
  comoda: (c) => {
    const { w, d, h } = c.def;
    legs4(c.g, w, d, 0.1, BLACK(), 0.05, 0.014);
    R(c.g, w, h - 0.1, d, c.main, 0, 0.1, 0, 0.012);
    for (let i = 0; i < 3; i++) {
      B(c.g, w - 0.04, 0.005, 0.01, BLACK(), 0, 0.1 + ((h - 0.1) / 3) * (i + 1) - 0.004, d / 2);
      B(c.g, 0.16, 0.012, 0.015, METAL(), 0, 0.1 + ((h - 0.1) / 3) * (i + 0.5), d / 2 + 0.006);
    }
  },
  guarda_roupa: (c) => {
    const { w, d, h } = c.def;
    B(c.g, w, h, d, c.main, 0, 0, 0);
    const n = 3;
    for (let i = 0; i < n; i++) {
      B(c.g, w / n - 0.012, h - 0.04, 0.015, i === 1 ? getMaterial('vidro') : c.main, -w / 2 + (w / n) * (i + 0.5), 0.02, d / 2);
      B(c.g, 0.015, 0.5, 0.025, METAL(), -w / 2 + (w / n) * (i + 1) - 0.06, h / 2 - 0.25, d / 2 + 0.012);
    }
  },
  vaso: (c) => {
    const g = c.g, m = CERAMIC();
    C(g, 0.13, 0.11, 0.32, m, 0, 0, 0.08, 20);
    const bowl = S(g, 0.2, m, 0, 0.36, 0.1, 0.95, 0.42, 1.15);
    bowl.castShadow = true;
    C(g, 0.19, 0.19, 0.03, plain('#ededed', 0.3), 0, 0.42, 0.1, 24).scale.set(1, 1, 1.15);
    R(g, 0.38, 0.38, 0.17, m, 0, 0.4, -0.25, 0.04);
  },
  pia_banheiro: (c) => {
    const { w, d, h } = c.def;
    R(c.g, w, h - 0.3, d, getMaterial('madeira'), 0, 0.25, 0, 0.012);
    B(c.g, w, 0.04, d, c.main, 0, h - 0.04, 0);
    C(c.g, 0.2, 0.17, 0.12, CERAMIC(), 0, h, 0.03, 28);
    C(c.g, 0.012, 0.012, 0.22, METAL(), 0, h, -0.17, 8);
    B(c.g, 0.02, 0.02, 0.12, METAL(), 0, h + 0.2, -0.12);
  },
  chuveiro: (c) => {
    const { w, d, h } = c.def;
    const g = c.g;
    B(g, w, 0.06, d, CERAMIC(), 0, 0, 0);
    const glass = GLASS();
    B(g, w, h - 0.06, 0.01, glass, 0, 0.06, d / 2 - 0.01);
    B(g, 0.01, h - 0.06, d, glass, w / 2 - 0.01, 0.06, 0);
    B(g, 0.02, 0.02, d, METAL(), w / 2 - 0.01, h - 0.02, 0);
    B(g, w, 0.02, 0.02, METAL(), 0, h - 0.02, d / 2 - 0.01);
    C(g, 0.012, 0.012, 1.1, METAL(), -w / 2 + 0.06, 1.0, -d / 2 + 0.05, 8);
    C(g, 0.12, 0.12, 0.02, METAL(), -w / 2 + 0.2, 2.0, -d / 2 + 0.2, 20);
    B(g, 0.02, 0.02, 0.2, METAL(), -w / 2 + 0.08, 2.06, -d / 2 + 0.12).rotation.y = -Math.PI / 4;
  },
  banheira: (c) => {
    const { w, d, h } = c.def;
    const g = c.g, m = c.main;
    R(g, w, h, d, m, 0, 0, 0, 0.08);
    R(g, w - 0.16, 0.02, d - 0.16, WATER(), 0, h - 0.12, 0, 0.06);
    C(g, 0.015, 0.015, 0.15, METAL(), -w / 2 + 0.1, h, 0, 8);
  },
  espelho: (c) => {
    const { w, d, h } = c.def;
    R(c.g, w, h, d * 0.5, plain('#2c2d30', 0.5, 0.5), 0, 0, 0, 0.01);
    B(c.g, w - 0.04, h - 0.04, 0.005, plain('#e8f1f4', 0.02, 1), 0, 0.02, d * 0.25);
  },
  escrivaninha: (c) => {
    const { w, d, h } = c.def;
    B(c.g, w, 0.035, d, c.main, 0, h - 0.035, 0);
    for (const sx of [-1, 1]) {
      B(c.g, 0.04, h - 0.035, 0.04, BLACK(), sx * (w / 2 - 0.04), 0, d / 2 - 0.05);
      B(c.g, 0.04, h - 0.035, 0.04, BLACK(), sx * (w / 2 - 0.04), 0, -d / 2 + 0.05);
    }
    B(c.g, 0.4, 0.22, d - 0.1, c.main, w / 2 - 0.25, h - 0.26, 0);
  },
  cadeira_escritorio: (c) => {
    const g = c.g, m = c.main;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const arm = B(g, 0.3, 0.03, 0.04, BLACK(), Math.cos(a) * 0.14, 0.05, Math.sin(a) * 0.14);
      arm.rotation.y = -a;
      S(g, 0.03, BLACK(), Math.cos(a) * 0.28, 0.03, Math.sin(a) * 0.28);
    }
    C(g, 0.025, 0.025, 0.35, METAL(), 0, 0.08, 0, 10);
    R(g, 0.52, 0.09, 0.5, m, 0, 0.43, 0, 0.04);
    const back = R(g, 0.48, 0.58, 0.07, m, 0, 0.55, -0.24, 0.04);
    back.rotation.x = -0.1;
    for (const sx of [-1, 1]) B(g, 0.04, 0.22, 0.3, BLACK(), sx * 0.27, 0.48, -0.02);
  },
  arquivo: (c) => {
    const { w, d, h } = c.def;
    R(c.g, w, h - 0.05, d, c.main, 0, 0.05, 0, 0.01);
    for (let i = 0; i < 3; i++) B(c.g, 0.12, 0.015, 0.015, BLACK(), 0, 0.05 + ((h - 0.05) / 3) * (i + 0.6), d / 2 + 0.005);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) S(c.g, 0.025, BLACK(), sx * (w / 2 - 0.05), 0.025, sz * (d / 2 - 0.05));
  },
  lavadora: (c) => {
    const { w, d, h } = c.def;
    R(c.g, w, h, d, WHITE(), 0, 0, 0, 0.02);
    const door = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 10, 28), plain('#b9bcc0', 0.3, 0.8));
    door.position.set(0, h * 0.45, d / 2 + 0.01); c.g.add(door);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.17, 28), plain('#40505c', 0.05, 0.3, { transparent: true, opacity: 0.8 }));
    glass.position.set(0, h * 0.45, d / 2 + 0.012); c.g.add(glass);
    B(c.g, w - 0.04, 0.12, 0.01, plain('#dcdcdc', 0.4), 0, h - 0.15, d / 2);
    C(c.g, 0.03, 0.03, 0.02, BLACK(), w / 2 - 0.1, h - 0.1, d / 2 + 0.01).rotation.x = Math.PI / 2;
  },
  tanque: (c) => {
    const { w, d, h } = c.def;
    for (const sx of [-1, 1]) B(c.g, 0.06, h - 0.25, 0.06, WHITE(), sx * (w / 2 - 0.08), 0, 0);
    R(c.g, w, 0.25, d, c.main, 0, h - 0.25, 0, 0.03);
    B(c.g, w - 0.1, 0.01, d - 0.12, plain('#c9d2d6', 0.3), 0, h - 0.005, 0.02);
    C(c.g, 0.012, 0.012, 0.2, METAL(), 0, h, -d / 2 + 0.05, 8);
  },
  varal: (c) => {
    const { w, d, h } = c.def;
    const m = c.main;
    for (const sx of [-1, 1]) {
      const l1 = C(c.g, 0.01, 0.01, h * 1.05, m, sx * (w / 2 - 0.05), 0, 0, 6); l1.rotation.x = 0.25;
      const l2 = C(c.g, 0.01, 0.01, h * 1.05, m, sx * (w / 2 - 0.05), 0, 0, 6); l2.rotation.x = -0.25;
    }
    for (let i = 0; i < 6; i++) B(c.g, w - 0.08, 0.008, 0.008, m, 0, h, -d / 2 + 0.05 + ((d - 0.1) * i) / 5);
    B(c.g, 0.4, 0.4, 0.004, getMaterial('tecido', '#bcd3ea'), -0.3, h - 0.4, 0);
    B(c.g, 0.35, 0.5, 0.004, getMaterial('tecido', '#e9c3b5'), 0.25, h - 0.5, 0.1);
  },
  carro: (c) => {
    const { w, d } = c.def;
    const g = c.g, body = plain(c.color, 0.25, 0.7);
    R(g, w, 0.55, d, body, 0, 0.3, 0, 0.12);
    R(g, w - 0.12, 0.5, d * 0.5, body, 0, 0.8, -0.15, 0.15);
    const glass = plain('#1d2733', 0.05, 0.6);
    B(g, w - 0.1, 0.38, d * 0.5 - 0.08, glass, 0, 0.84, -0.15);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wheel = C(g, 0.32, 0.32, 0.22, BLACK(), sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.75), 20);
      wheel.rotation.z = Math.PI / 2; wheel.position.y = 0.32;
      const rim = C(g, 0.18, 0.18, 0.23, METAL(), sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.75), 16);
      rim.rotation.z = Math.PI / 2; rim.position.y = 0.32;
    }
    for (const sx of [-1, 1]) {
      B(g, 0.3, 0.08, 0.02, BULB(), sx * (w / 2 - 0.3), 0.6, d / 2 - 0.005);
      B(g, 0.3, 0.08, 0.02, plain('#b11', 0.3, 0, { emissive: new THREE.Color('#600') }), sx * (w / 2 - 0.3), 0.62, -d / 2 + 0.005);
    }
  },
  bancada_ferr: (c) => {
    const { w, d, h } = c.def;
    legs4(c.g, w, d, h - 0.05, BLACK(), 0.05, 0.025);
    B(c.g, w, 0.05, d, c.main, 0, h - 0.05, 0);
    B(c.g, w - 0.1, 0.03, d - 0.1, c.main, 0, 0.2, 0);
    B(c.g, w, 0.8, 0.02, plain('#8a8378', 0.9), 0, h, -d / 2 + 0.01);
    for (let i = 0; i < 5; i++) B(c.g, 0.03, 0.2, 0.02, METAL(), -w / 2 + 0.3 + i * 0.25, h + 0.3, -d / 2 + 0.03);
  },
  bicicleta: (c) => {
    const g = c.g, m = plain(c.color, 0.3, 0.5);
    for (const z of [-0.55, 0.55]) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.025, 8, 28), BLACK());
      t.rotation.y = Math.PI / 2; t.position.set(0, 0.35, z); t.castShadow = true; g.add(t);
    }
    const bar = (len: number, y: number, z: number, rx: number) => { const b = C(g, 0.02, 0.02, len, m, 0, 0, 0, 8); b.position.set(0, y, z); b.rotation.x = rx; };
    bar(0.65, 0.62, 0, Math.PI / 2);
    bar(0.6, 0.5, -0.25, 0.6);
    bar(0.6, 0.5, 0.3, -0.5);
    R(g, 0.1, 0.04, 0.22, BLACK(), 0, 0.82, -0.32, 0.02);
    B(g, 0.5, 0.025, 0.025, BLACK(), 0, 0.9, 0.42);
  },
  churrasqueira: (c) => {
    const { w, d, h } = c.def;
    const g = c.g, m = c.main;
    B(g, w, 0.9, d, m, 0, 0, 0);
    B(g, w + 0.06, 0.05, d + 0.06, getMaterial('granito'), 0, 0.9, 0);
    B(g, w * 0.7, 0.55, 0.02, BLACK(), 0, 0.25, d / 2);
    for (const sx of [-1, 1]) B(g, 0.15, 0.8, d, m, sx * (w / 2 - 0.075), 0.95, 0);
    B(g, w, 0.12, d, m, 0, 1.75, 0);
    const hood = C(g, 0.25, w / 2, 0.45, m, 0, 1.87, 0, 4); hood.rotation.y = Math.PI / 4; hood.scale.z = d / w * 1.4;
    B(g, 0.3, h - 2.32, 0.3, m, 0, 2.32, 0);
    for (let i = 0; i < 7; i++) B(g, w - 0.35, 0.01, 0.01, METAL(), 0, 1.15, -d / 2 + 0.1 + i * (d - 0.2) / 6);
  },
  mesa_externa: (c) => {
    const { w, d, h } = c.def;
    for (let i = 0; i < 8; i++) B(c.g, w, 0.04, d / 8 - 0.01, c.main, 0, h - 0.04, -d / 2 + (d / 8) * (i + 0.5));
    for (const sx of [-1, 1]) {
      B(c.g, 0.06, h - 0.04, d - 0.2, c.main, sx * (w / 2 - 0.2), 0, 0);
    }
  },
  frigobar: (c) => {
    const { w, d, h } = c.def;
    R(c.g, w, h, d, c.main, 0, 0, 0, 0.02);
    B(c.g, w - 0.04, h - 0.06, 0.01, plain('#1d2733', 0.05, 0.5, { transparent: true, opacity: 0.85 }), 0, 0.04, d / 2);
    B(c.g, 0.02, 0.4, 0.03, METAL(), w / 2 - 0.05, h / 2 - 0.2, d / 2 + 0.015);
  },
  geladeira: (c) => {
    const { w, d, h } = c.def;
    R(c.g, w, h, d, c.main, 0, 0, 0, 0.02);
    B(c.g, w - 0.01, 0.008, 0.01, BLACK(), 0, h * 0.68, d / 2 + 0.002);
    for (const y of [h * 0.72, h * 0.15]) B(c.g, 0.025, 0.45, 0.04, METAL(), -w / 2 + 0.06, y, d / 2 + 0.02);
    B(c.g, 0.1, 0.14, 0.005, SCREEN(), w / 4, h * 0.8, d / 2 + 0.003);
  },
  fogao: (c) => {
    const { w, d, h } = c.def;
    R(c.g, w, h - 0.02, d, c.main, 0, 0, 0, 0.015);
    B(c.g, w - 0.02, 0.012, d - 0.02, BLACK(), 0, h - 0.02, 0);
    const pos = [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.13], [0.2, 0.13], [0, 0]];
    for (const [x, z] of pos) {
      C(c.g, 0.07, 0.08, 0.025, plain('#333', 0.5, 0.6), x, h - 0.01, z, 16);
      const grate = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.006, 4, 16), BLACK());
      grate.rotation.x = Math.PI / 2; grate.position.set(x, h + 0.02, z); c.g.add(grate);
    }
    B(c.g, w - 0.1, h * 0.5, 0.01, plain('#1d2733', 0.05, 0.4), 0, 0.12, d / 2);
    B(c.g, w - 0.2, 0.02, 0.03, METAL(), 0, h * 0.68, d / 2 + 0.02);
    for (let i = 0; i < 5; i++) C(c.g, 0.02, 0.02, 0.02, BLACK(), -w / 2 + 0.1 + i * (w - 0.2) / 4, h - 0.1, d / 2 + 0.01, 10).rotation.x = Math.PI / 2;
  },
  microondas: (c) => {
    const { w, d, h } = c.def;
    R(c.g, w, h, d, c.main, 0, 0, 0, 0.015);
    B(c.g, w * 0.65, h - 0.06, 0.008, plain('#1d2733', 0.05, 0.4), -w * 0.12, 0.03, d / 2);
    B(c.g, w * 0.18, h - 0.08, 0.006, BLACK(), w * 0.36, 0.04, d / 2);
  },
  cafeteira: (c) => {
    const { w, d, h } = c.def;
    R(c.g, w, 0.05, d, c.main, 0, 0, 0, 0.01);
    R(c.g, w, h - 0.05, 0.1, c.main, 0, 0.05, -d / 2 + 0.05, 0.02);
    R(c.g, w, 0.06, d, c.main, 0, h - 0.06, 0, 0.02);
    C(c.g, 0.06, 0.05, 0.14, plain('#30363d', 0.05, 0.2, { transparent: true, opacity: 0.8 }), 0, 0.05, 0.04, 16);
  },
  espreguicadeira: (c) => {
    const { w, d } = c.def;
    const m = c.main;
    legs4(c.g, w, d, 0.25, m, 0.05, 0.02);
    B(c.g, w, 0.05, d * 0.65, m, 0, 0.25, d * 0.17);
    const back = B(c.g, w, 0.05, d * 0.38, m, 0, 0, 0);
    back.position.set(0, 0.42, -d * 0.3); back.rotation.x = 0.6;
    R(c.g, w - 0.06, 0.06, d * 0.6, getMaterial('tecido', '#f1ece3'), 0, 0.3, d * 0.17, 0.03);
  },
  ombrelone: (c) => {
    const { w, h } = c.def;
    C(c.g, 0.25, 0.3, 0.08, BLACK(), 0, 0, 0, 20);
    C(c.g, 0.025, 0.025, h - 0.1, plain('#e8e1d4', 0.5), 0, 0.08, 0, 8);
    C(c.g, 0.02, w / 2, 0.5, c.main, 0, h - 0.5, 0, 8);
  },
  pergolado: (c) => {
    const { w, d, h } = c.def;
    const g = c.g, m = c.main;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, 0.14, h, 0.14, m, sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1));
    for (const sz of [-1, 1]) B(g, w, 0.2, 0.08, m, 0, h - 0.2, sz * (d / 2 - 0.1));
    const n = Math.round(w / 0.4);
    for (let i = 0; i <= n; i++) B(g, 0.05, 0.14, d + 0.3, m, -w / 2 + (w * i) / n, h, 0);
  },
  banco_jardim: (c) => {
    const { w, d } = c.def;
    for (const sx of [-1, 1]) {
      B(c.g, 0.06, 0.45, d, BLACK(), sx * (w / 2 - 0.1), 0, 0);
      B(c.g, 0.06, 0.4, 0.05, BLACK(), sx * (w / 2 - 0.1), 0.45, -d / 2 + 0.05);
    }
    for (let i = 0; i < 4; i++) B(c.g, w, 0.03, d / 4 - 0.02, c.main, 0, 0.42, -d / 2 + (d / 4) * (i + 0.5));
    for (let i = 0; i < 3; i++) B(c.g, w, 0.08, 0.025, c.main, 0, 0.55 + i * 0.1, -d / 2 + 0.06);
  },
  arvore: (c) => {
    const { w, h } = c.def;
    C(c.g, 0.12, 0.22, h * 0.5, TRUNK(), 0, 0, 0, 10);
    const l1 = LEAF(), l2 = LEAF2();
    const blobs: [number, number, number, number][] = [[0, 0.62, 0, 0.36], [0.22, 0.55, 0.1, 0.26], [-0.2, 0.56, -0.12, 0.27], [0.05, 0.75, -0.15, 0.24], [-0.1, 0.7, 0.2, 0.24], [0.15, 0.82, 0.12, 0.2]];
    blobs.forEach(([x, y, z, r], i) => S(c.g, w * r, i % 2 ? l1 : l2, x * w, y * h, z * w));
  },
  palmeira: (c) => {
    const { w, h } = c.def;
    const g = c.g;
    const seg = 7;
    for (let i = 0; i < seg; i++) C(g, 0.13 - i * 0.008, 0.15 - i * 0.008, h / seg * 0.95, TRUNK(), Math.sin(i * 0.25) * 0.15, (h / seg) * i, 0, 10);
    const top = new THREE.Vector3(Math.sin(seg * 0.25) * 0.15, h * 0.95, 0);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const leaf = new THREE.Mesh(cached('palmleaf', () => { const gg = new THREE.ConeGeometry(0.22, w / 2, 4, 1); gg.translate(0, w / 4, 0); gg.scale(1, 1, 0.15); return gg; }), i % 2 ? LEAF() : LEAF2());
      leaf.position.copy(top);
      leaf.rotation.set(0, -a, 0);
      leaf.rotateZ(-1.9);
      leaf.castShadow = true;
      g.add(leaf);
    }
  },
  arbusto: (c) => plantFoliage(c.g, 0, c.def.h * 0.4, 0, c.def.w * 0.5, 8),
  canteiro: (c) => {
    const { w, d, h } = c.def;
    B(c.g, w, h - 0.08, d, getMaterial('tijolo'), 0, 0, 0);
    B(c.g, w - 0.08, 0.04, d - 0.08, plain('#4a3524', 1), 0, h - 0.1, 0);
    const colors = [c.color, '#e0b84f', '#f6f6f4', '#c76d8a'];
    for (let i = 0; i < 12; i++) {
      const x = -w / 2 + 0.12 + ((w - 0.24) * (i % 6)) / 5, z = i < 6 ? -d / 6 : d / 6;
      C(c.g, 0.008, 0.008, 0.18, LEAF(), x, h - 0.08, z, 5);
      S(c.g, 0.05, plain(colors[i % colors.length], 0.7), x, h + 0.12, z);
      S(c.g, 0.06, LEAF2(), x + 0.03, h - 0.02, z + 0.02, 1, 0.6, 1);
    }
  },
  fonte: (c) => {
    const { w } = c.def;
    const m = c.main;
    C(c.g, w / 2, w / 2 + 0.05, 0.45, m, 0, 0, 0, 32);
    C(c.g, w / 2 - 0.1, w / 2 - 0.1, 0.02, WATER(), 0, 0.4, 0, 32);
    C(c.g, 0.1, 0.14, 1.0, m, 0, 0.4, 0, 12);
    C(c.g, 0.4, 0.15, 0.15, m, 0, 1.05, 0, 20);
    C(c.g, 0.35, 0.35, 0.02, WATER(), 0, 1.17, 0, 20);
    S(c.g, 0.08, m, 0, 1.3, 0);
  },
  cerca: (c) => {
    const { w, h } = c.def;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w / n) * (i + 0.5);
      B(c.g, 0.09, h - 0.08, 0.025, c.main, x, 0, 0);
      const tip = C(c.g, 0.0, 0.065, 0.08, c.main, x, h - 0.08, 0, 4); tip.rotation.y = Math.PI / 4; tip.scale.z = 0.3;
    }
    for (const y of [0.25, h - 0.3]) B(c.g, w, 0.07, 0.025, c.main, 0, y, -0.025);
  },
  muro: (c) => {
    const { w, d, h } = c.def;
    B(c.g, w, h, d, c.main, 0, 0, 0);
    B(c.g, w + 0.02, 0.05, d + 0.06, plain('#cfc8bb', 0.8), 0, h, 0);
  },
  portao: (c) => {
    const { w, d, h } = c.def;
    const m = c.main;
    B(c.g, w, 0.06, d, m, 0, 0.05, 0);
    B(c.g, w, 0.06, d, m, 0, h - 0.06, 0);
    for (const sx of [-1, 1]) B(c.g, 0.08, h, d + 0.04, m, sx * (w / 2 - 0.04), 0, 0);
    const n = Math.round(w / 0.12);
    for (let i = 1; i < n; i++) B(c.g, 0.02, h - 0.1, 0.02, m, -w / 2 + (w * i) / n, 0.05, 0);
  },
  poste_jardim: (c) => {
    const { h } = c.def;
    C(c.g, 0.06, 0.08, 0.05, c.main, 0, 0, 0, 12);
    C(c.g, 0.025, 0.025, h - 0.2, c.main, 0, 0.05, 0, 8);
    C(c.g, 0.07, 0.07, 0.14, BULB(), 0, h - 0.17, 0, 12);
    C(c.g, 0.1, 0.08, 0.03, c.main, 0, h - 0.03, 0, 12);
  },
  caminho: (c) => {
    const { w, d, h } = c.def;
    R(c.g, w, h, d, c.main, 0, 0, 0, 0.02);
  },
  piscina_ret: (c) => {
    const { w, d, h } = c.def;
    const g = c.g;
    const wall = getMaterial('azulejo', '#e9f0f2');
    const t = 0.15;
    for (const sz of [-1, 1]) B(g, w, h, t, wall, 0, 0, sz * (d / 2 - t / 2));
    for (const sx of [-1, 1]) B(g, t, h, d - t * 2, wall, sx * (w / 2 - t / 2), 0, 0);
    B(g, w - t * 2, 0.02, d - t * 2, getMaterial('azulejo', c.color), 0, 0, 0);
    B(g, w - t * 2, 0.02, d - t * 2, WATER(), 0, h - 0.12, 0);
    B(g, w + 0.1, 0.05, 0.25, getMaterial('pedra'), 0, h, d / 2 - 0.08);
    B(g, w + 0.1, 0.05, 0.25, getMaterial('pedra'), 0, h, -d / 2 + 0.08);
    // Escadinha
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 6, 12, Math.PI), METAL());
      rail.position.set(w / 2 - 0.6 + sx * 0.2, h + 0.05, d / 2 - 0.15); rail.rotation.y = Math.PI / 2; g.add(rail);
    }
  },
  piscina_redonda: (c) => {
    const { w, h } = c.def;
    C(c.g, w / 2, w / 2, h, getMaterial('azulejo', '#e9f0f2'), 0, 0, 0, 40);
    C(c.g, w / 2 - 0.08, w / 2 - 0.08, 0.02, WATER(), 0, h - 0.1, 0, 40);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(w / 2, 0.05, 8, 48), getMaterial('pedra'));
    rim.rotation.x = Math.PI / 2; rim.position.y = h; c.g.add(rim);
  },
  ofuro: (c) => {
    const { w, h } = c.def;
    C(c.g, w / 2, w / 2, h, c.main, 0, 0, 0, 24);
    C(c.g, w / 2 - 0.06, w / 2 - 0.06, 0.02, WATER(), 0, h - 0.12, 0, 24);
    for (const y of [0.15, h - 0.15]) { const r = new THREE.Mesh(new THREE.TorusGeometry(w / 2 + 0.005, 0.015, 6, 32), BLACK()); r.rotation.x = Math.PI / 2; r.position.y = y; c.g.add(r); }
  },
  luminaria_piso: (c) => {
    const { h } = c.def;
    C(c.g, 0.16, 0.17, 0.03, BLACK(), 0, 0, 0, 20);
    C(c.g, 0.012, 0.012, h - 0.3, BLACK(), 0, 0.03, 0, 8);
    C(c.g, 0.13, 0.2, 0.3, plain(c.color, 0.9, 0, { emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0.35, side: THREE.DoubleSide }), 0, h - 0.3, 0, 24);
    S(c.g, 0.05, BULB(), 0, h - 0.18, 0);
  },
  abajur: (c) => {
    const { h } = c.def;
    S(c.g, 0.09, plain('#4f8f95', 0.2), 0, 0.11, 0, 1, 1.2, 1);
    C(c.g, 0.01, 0.01, 0.15, METAL(), 0, 0.2, 0, 6);
    C(c.g, 0.1, 0.15, 0.18, plain(c.color, 0.9, 0, { emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0.35, side: THREE.DoubleSide }), 0, h - 0.18, 0, 24);
  },
  pendente: (c) => {
    const { h } = c.def;
    C(c.g, 0.006, 0.006, h - 0.25, BLACK(), 0, 0.25, 0, 4);
    C(c.g, 0.06, 0.2, 0.25, c.main, 0, 0, 0, 24);
    S(c.g, 0.06, BULB(), 0, 0.04, 0);
    C(c.g, 0.05, 0.05, 0.02, c.main, 0, h - 0.02, 0, 12);
  },
  arandela: (c) => {
    const { w, d, h } = c.def;
    B(c.g, 0.08, 0.14, 0.02, BLACK(), 0, h / 2 - 0.07, -d / 2 + 0.01);
    C(c.g, w / 2.2, w / 3, h * 0.6, plain(c.color, 0.9, 0, { emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0.5, side: THREE.DoubleSide }), 0, h * 0.2, 0.0, 16);
  },
  tv: (c) => {
    const { w, d, h } = c.def;
    B(c.g, 0.35, 0.02, d, BLACK(), 0, 0, 0);
    B(c.g, 0.06, 0.08, 0.04, BLACK(), 0, 0.02, -0.02);
    R(c.g, w, h - 0.08, 0.05, BLACK(), 0, 0.08, 0, 0.008);
    B(c.g, w - 0.03, h - 0.11, 0.005, SCREEN(), 0, 0.095, 0.026);
  },
  tv_parede: (c) => {
    const { w, d, h } = c.def;
    R(c.g, w, h, d, BLACK(), 0, 0, 0, 0.008);
    B(c.g, w - 0.03, h - 0.03, 0.005, SCREEN(), 0, 0.015, d / 2);
  },
  computador: (c) => {
    const { w, h } = c.def;
    B(c.g, 0.22, 0.015, 0.16, BLACK(), 0, 0, -0.04);
    B(c.g, 0.04, 0.12, 0.03, BLACK(), 0, 0.015, -0.06);
    R(c.g, w, h - 0.12, 0.03, BLACK(), 0, 0.12, -0.05, 0.006);
    B(c.g, w - 0.02, h - 0.14, 0.004, SCREEN(), 0, 0.13, -0.034);
    R(c.g, 0.42, 0.015, 0.14, plain('#2c2d30', 0.5), 0, 0, 0.1, 0.005);
  },
  som: (c) => {
    const { w, d, h } = c.def;
    R(c.g, w, h, d, c.main, 0, 0, 0, 0.015);
    for (const [y, r] of [[h * 0.72, 0.08], [h * 0.35, 0.11]]) {
      const ring = C(c.g, r, r, 0.01, plain('#3b3b3f', 0.6), 0, 0, d / 2, 24);
      ring.rotation.x = Math.PI / 2; ring.position.y = y;
    }
  },
  esteira: (c) => {
    const { w, d, h } = c.def;
    R(c.g, w, 0.15, d, c.main, 0, 0, 0, 0.03);
    B(c.g, w - 0.18, 0.01, d - 0.2, plain('#111', 0.9), 0, 0.15, 0.05);
    for (const sx of [-1, 1]) { const p = B(c.g, 0.05, h - 0.15, 0.05, c.main, sx * (w / 2 - 0.05), 0.12, -d / 2 + 0.2); p.rotation.x = -0.15; }
    R(c.g, w, 0.08, 0.25, c.main, 0, h - 0.08, -d / 2 + 0.05, 0.03);
    B(c.g, 0.25, 0.12, 0.01, SCREEN(), 0, h - 0.04, -d / 2 + 0.18).rotation.x = -0.6;
  },
  quadro: (c) => {
    const { w, d, h } = c.def;
    B(c.g, w, h, d, BLACK(), 0, 0, 0);
    B(c.g, w - 0.06, h - 0.06, 0.005, plain('#f6f2ea', 0.9), 0, 0.03, d / 2);
    B(c.g, w * 0.35, h * 0.55, 0.004, plain(c.color, 0.8), -w * 0.15, h * 0.2, d / 2 + 0.004);
    B(c.g, w * 0.3, h * 0.3, 0.004, plain('#3e6a9a', 0.8), w * 0.18, h * 0.45, d / 2 + 0.006);
    C(c.g, h * 0.14, h * 0.14, 0.004, plain('#e0b84f', 0.8), w * 0.22, h * 0.15, d / 2 + 0.004, 20).rotation.x = Math.PI / 2;
  },
  vaso_decor: (c) => {
    const { w, h } = c.def;
    const pts = [[0, 0], [w * 0.35, 0], [w * 0.5, h * 0.35], [w * 0.38, h * 0.75], [w * 0.22, h * 0.9], [w * 0.27, h]].map(([x, y]) => new THREE.Vector2(x, y));
    const m = new THREE.Mesh(cached(`lathe${w},${h}`, () => new THREE.LatheGeometry(pts, 24)), plain(c.color, 0.25));
    m.castShadow = true; c.g.add(m);
    for (let i = 0; i < 3; i++) { const st = C(c.g, 0.004, 0.004, h * 0.8, TRUNK(), 0, h * 0.8, 0, 4); st.rotation.z = (i - 1) * 0.3; }
  },
  livros: (c) => {
    const cols = ['#b5523b', '#3e6a9a', '#e0b84f', '#4f7a4a'];
    for (let i = 0; i < 4; i++) {
      const b = R(c.g, 0.24 - i * 0.015, 0.04, 0.17 - i * 0.01, plain(cols[i], 0.7), 0, i * 0.042, 0, 0.004);
      b.rotation.y = (i % 2 ? 1 : -1) * 0.12;
    }
  },
  relogio: (c) => {
    const { w, d } = c.def;
    const r = w / 2;
    const face = C(c.g, r, r, d, BLACK(), 0, 0, 0, 32); face.rotation.x = Math.PI / 2; face.position.set(0, r, 0);
    const inner = C(c.g, r - 0.02, r - 0.02, 0.005, plain(c.color, 0.6), 0, 0, 0, 32); inner.rotation.x = Math.PI / 2; inner.position.set(0, r, d / 2);
    B(c.g, 0.01, r * 0.6, 0.004, BLACK(), 0, r, d / 2 + 0.005);
    const m2 = B(c.g, 0.01, r * 0.45, 0.004, BLACK(), 0, r, d / 2 + 0.008); m2.rotation.z = -2; m2.position.set(0.06, r - 0.03, d / 2 + 0.008);
  },
  cortina: (c) => {
    const { w, d, h } = c.def;
    C(c.g, 0.015, 0.015, w + 0.2, METAL(), 0, 0, 0, 8).rotation.z = Math.PI / 2;
    c.g.children[c.g.children.length - 1].position.set(0, h - 0.03, 0);
    for (const sx of [-1, 1]) {
      const folds = 6;
      for (let i = 0; i < folds; i++) {
        const cyl = C(c.g, 0.04, 0.05, h - 0.06, c.main, sx * (w / 2 - 0.05 - i * 0.07), 0, ((i % 2) - 0.5) * d * 0.3, 10);
        cyl.scale.z = 0.8;
      }
    }
  },
  planta_grande: (c) => {
    const { w, h } = c.def;
    C(c.g, w * 0.3, w * 0.22, h * 0.32, c.main, 0, 0, 0, 20);
    C(c.g, w * 0.28, w * 0.28, 0.01, plain('#3e2c1f', 1), 0, h * 0.3, 0, 20);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const stem = C(c.g, 0.008, 0.008, h * 0.5, LEAF(), 0, h * 0.3, 0, 4);
      stem.rotation.set(Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6);
      const leaf = S(c.g, w * 0.18, i % 2 ? LEAF() : LEAF2(), -Math.cos(a) * w * 0.3 * 1.2, h * 0.3 + h * 0.42 + (i % 3) * 0.06, Math.sin(a) * w * 0.3 * 1.2, 1, 0.25, 0.7);
      leaf.rotation.y = a;
    }
  },
  planta_pequena: (c) => {
    const { w, h } = c.def;
    C(c.g, w * 0.45, w * 0.35, h * 0.5, c.main, 0, 0, 0, 16);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const l = new THREE.Mesh(cached('succ', () => new THREE.ConeGeometry(0.02, 0.07, 5)), LEAF2());
      l.position.set(Math.cos(a) * 0.025, h * 0.6, Math.sin(a) * 0.025);
      l.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
      c.g.add(l);
    }
  },
  palmeira_vaso: (c) => {
    const { w, h } = c.def;
    C(c.g, w * 0.35, w * 0.28, h * 0.25, c.main, 0, 0, 0, 20);
    for (let i = 0; i < 3; i++) C(c.g, 0.02, 0.025, h * 0.5, TRUNK(), (i - 1) * 0.06, h * 0.24, 0, 6);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const leaf = new THREE.Mesh(cached('pleaf', () => { const gg = new THREE.ConeGeometry(0.08, 0.6, 4); gg.translate(0, 0.3, 0); gg.scale(1, 1, 0.15); return gg; }), i % 2 ? LEAF() : LEAF2());
      leaf.position.set(0, h * 0.72, 0);
      leaf.rotation.set(0, -a, 0);
      leaf.rotateZ(-1.1 - (i % 3) * 0.2);
      leaf.castShadow = true;
      c.g.add(leaf);
    }
  },
  bau_brinquedos: (c) => {
    const { w, d, h } = c.def;
    R(c.g, w, h - 0.06, d, c.main, 0, 0, 0, 0.03);
    R(c.g, w + 0.02, 0.06, d + 0.02, plain('#3e6a9a', 0.6), 0, h - 0.06, 0, 0.02);
    S(c.g, 0.07, plain('#b5523b', 0.4), -0.15, h + 0.03, 0);
  },
  ursinho: (c) => {
    const fur = c.main;
    S(c.g, 0.085, fur, 0, 0.09, 0, 1, 1.1, 0.9);
    S(c.g, 0.065, fur, 0, 0.23, 0.01);
    for (const sx of [-1, 1]) {
      S(c.g, 0.025, fur, sx * 0.05, 0.29, 0.0);
      S(c.g, 0.03, fur, sx * 0.08, 0.12, 0.04, 1, 1.3, 1);
      S(c.g, 0.032, fur, sx * 0.05, 0.03, 0.06);
      S(c.g, 0.008, BLACK(), sx * 0.022, 0.25, 0.065);
    }
    S(c.g, 0.025, plain('#d6b48a', 0.9), 0, 0.215, 0.06);
  },
  escorregador: (c) => {
    const { w, d, h } = c.def;
    const m = c.main, blue = plain('#3e6a9a', 0.5);
    for (const sx of [-1, 1]) for (const z of [-d / 2 + 0.1, -d / 2 + 0.6]) C(c.g, 0.03, 0.03, h, blue, sx * (w / 2 - 0.05), 0, z, 8);
    B(c.g, w, 0.05, 0.6, blue, 0, h - 0.05, -d / 2 + 0.35);
    const slide = B(c.g, w * 0.7, 0.04, d * 0.78, m, 0, 0, 0);
    slide.position.set(0, h / 2, d * 0.12); slide.rotation.x = Math.atan2(h - 0.05, d * 0.72);
    for (let i = 0; i < 5; i++) B(c.g, w - 0.1, 0.03, 0.05, blue, 0, (h * (i + 1)) / 6, -d / 2 + 0.1);
  },
  coluna_redonda: (c) => {
    const { w, h } = c.def;
    C(c.g, w / 2 + 0.04, w / 2 + 0.04, 0.12, c.main, 0, 0, 0, 24);
    C(c.g, w / 2, w / 2, h - 0.24, c.main, 0, 0.12, 0, 28);
    C(c.g, w / 2 + 0.04, w / 2 + 0.04, 0.12, c.main, 0, h - 0.12, 0, 24);
  },
  pilar: (c) => B(c.g, c.def.w, c.def.h, c.def.d, c.main, 0, 0, 0),
  guarda_corpo: (c) => {
    const { w, d, h } = c.def;
    B(c.g, w, h - 0.05, 0.015, GLASS(), 0, 0.02, 0);
    B(c.g, w, 0.05, d, METAL(), 0, h - 0.05, 0);
    B(c.g, w, 0.04, d, METAL(), 0, 0, 0);
  },
  elevador: (c) => {
    const { w, d, h } = c.def;
    const g = c.g;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, 0.06, h, 0.06, METAL(), sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03));
    B(g, w, 0.08, d, METAL(), 0, 0, 0);
    B(g, w, 0.08, d, METAL(), 0, h - 0.08, 0);
    const glass = GLASS();
    B(g, w - 0.06, h - 0.16, 0.01, glass, 0, 0.08, -d / 2 + 0.02);
    for (const sx of [-1, 1]) B(g, 0.01, h - 0.16, d - 0.06, glass, sx * (w / 2 - 0.02), 0.08, 0);
    B(g, 0.12, 0.2, 0.02, BLACK(), w / 2 - 0.12, 1.1, d / 2 - 0.02);
  },
  caixa: (c) => {
    const { w, d, h } = c.def;
    B(c.g, w, h - 0.05, d, c.main, 0, 0, 0);
    B(c.g, w + 0.06, 0.05, d + 0.06, getMaterial('granito'), 0, h - 0.05, 0);
    B(c.g, 0.3, 0.22, 0.2, BLACK(), w / 2 - 0.3, h, -0.1);
    B(c.g, 0.28, 0.18, 0.01, SCREEN(), w / 2 - 0.3, h + 0.02, -0.21).rotation.x = 0.2;
    B(c.g, 0.4, 0.03, 0.3, plain('#2c2d30', 0.3, 0.5), -w / 4, h, 0);
  },
  prateleira_mercado: (c) => {
    const { w, d, h } = c.def;
    const g = c.g, m = c.main;
    B(g, w, 0.1, d, m, 0, 0, 0);
    B(g, w, h, 0.04, m, 0, 0, 0);
    const cols = ['#b5523b', '#e0b84f', '#3e6a9a', '#4f7a4a', '#f1ece3', '#c76d8a', '#7a4b2a'];
    for (let i = 0; i < 4; i++) {
      const y = 0.1 + i * 0.38;
      for (const sz of [-1, 1]) {
        B(g, w, 0.025, d / 2 - 0.04, m, 0, y, sz * d / 4);
        for (let k = 0; k < 9; k++) {
          const bw = w / 9 - 0.03;
          B(g, bw, 0.16 + ((k * 7 + i) % 4) * 0.04, d / 2 - 0.12, plain(cols[(k + i * 3) % cols.length], 0.6), -w / 2 + (w / 9) * (k + 0.5), y + 0.025, sz * d / 4);
        }
      }
    }
  },
  refrigerador_mercado: (c) => {
    const { w, d, h } = c.def;
    B(c.g, w, h, d, c.main, 0, 0, 0);
    B(c.g, w - 0.08, h - 0.3, 0.02, plain('#cfe6ee', 0.05, 0.2, { transparent: true, opacity: 0.45 }), 0, 0.15, d / 2);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) C(c.g, 0.05, 0.05, 0.22, plain(['#3e6a9a', '#e0b84f', '#f1ece3', '#b5523b'][(i + k) % 4], 0.3), -w / 2 + 0.2 + k * (w - 0.4) / 5, 0.2 + i * 0.42, 0.1, 10);
    for (let k = 1; k < 3; k++) B(c.g, 0.03, h - 0.3, 0.04, METAL(), -w / 2 + (w * k) / 3, 0.15, d / 2 + 0.01);
  },
  mesa_restaurante: (c) => {
    const { w, d, h } = c.def;
    B(c.g, w, 0.04, d, c.main, 0, h - 0.04, 0);
    B(c.g, w + 0.02, 0.005, d + 0.02, plain('#f6f2ea', 0.9), 0, h, 0);
    C(c.g, 0.04, 0.05, h - 0.04, BLACK(), 0, 0, 0, 10);
    C(c.g, 0.25, 0.27, 0.02, BLACK(), 0, 0, 0, 20);
    C(c.g, 0.03, 0.04, 0.16, plain('#cfe6ee', 0.05, 0.1, { transparent: true, opacity: 0.6 }), 0, h, 0, 10);
  },
  tela_cinema: (c) => {
    const { w, d, h } = c.def;
    B(c.g, w + 0.3, h + 0.3, d * 0.3, BLACK(), 0, 0.5, 0);
    B(c.g, w, h - 0.2, 0.02, plain('#f6f6f4', 0.9, 0, { emissive: new THREE.Color('#7f8fa6'), emissiveIntensity: 0.35 }), 0, 0.65, d * 0.15 + 0.01);
    B(c.g, w + 0.6, 0.5, 0.25, plain('#8c2f2a', 0.9), 0, 0, 0.1);
  },
  poltrona_cinema: (c) => {
    const { w, d } = c.def;
    const m = c.main;
    R(c.g, w - 0.1, 0.14, d - 0.15, m, 0, 0.4, 0.05, 0.04);
    R(c.g, w - 0.1, 0.62, 0.12, m, 0, 0.42, -d / 2 + 0.08, 0.04).rotation.x = -0.15;
    for (const sx of [-1, 1]) B(c.g, 0.06, 0.65, d - 0.1, BLACK(), sx * (w / 2 - 0.03), 0, 0);
  },
  arara_roupas: (c) => {
    const { w, h } = c.def;
    for (const sx of [-1, 1]) { C(c.g, 0.015, 0.015, h, c.main, sx * (w / 2 - 0.05), 0, 0, 8); B(c.g, 0.04, 0.02, 0.45, c.main, sx * (w / 2 - 0.05), 0, 0); }
    C(c.g, 0.012, 0.012, w, c.main, 0, 0, 0, 8).rotation.z = Math.PI / 2;
    c.g.children[c.g.children.length - 1].position.set(0, h - 0.05, 0);
    const cols = ['#3e6a9a', '#b5523b', '#f1ece3', '#e0b84f', '#2f4f3b', '#c76d8a', '#1f1f22', '#9fc6c5'];
    for (let i = 0; i < 9; i++) {
      const x = -w / 2 + 0.15 + i * (w - 0.3) / 8;
      B(c.g, 0.06, 0.7, 0.42, plain(cols[i % cols.length], 0.85), x, h - 0.8, 0);
    }
  },
  lousa: (c) => {
    const { w, d, h } = c.def;
    B(c.g, w + 0.08, h + 0.08, d * 0.5, getMaterial('madeira'), 0, -0.04, 0);
    B(c.g, w, h, 0.01, plain(c.color, 0.95), 0, 0, d * 0.25 + 0.005);
    B(c.g, w * 0.5, 0.02, 0.005, plain('#f6f6f4', 0.9), -w * 0.15, h * 0.7, d * 0.25 + 0.012);
    B(c.g, w * 0.35, 0.02, 0.005, plain('#f6f6f4', 0.9), -w * 0.22, h * 0.55, d * 0.25 + 0.012);
    B(c.g, w + 0.1, 0.03, 0.08, getMaterial('madeira'), 0, -0.06, 0.04);
  },
  carteira: (c) => {
    const { w, d, h } = c.def;
    B(c.g, w, 0.025, d, c.main, 0, h - 0.025, 0);
    for (const sx of [-1, 1]) B(c.g, 0.03, h - 0.025, 0.03, METAL(), sx * (w / 2 - 0.04), 0, -d / 2 + 0.06);
    for (const sx of [-1, 1]) B(c.g, 0.03, h - 0.025, 0.03, METAL(), sx * (w / 2 - 0.04), 0, d / 2 - 0.06);
    B(c.g, w - 0.1, 0.12, d - 0.1, METAL(), 0, h - 0.17, 0);
  },
  maca: (c) => {
    const { w, d } = c.def;
    legs4(c.g, w, d, 0.55, METAL(), 0.08, 0.02);
    B(c.g, w, 0.06, d, METAL(), 0, 0.55, 0);
    R(c.g, w - 0.06, 0.12, d - 0.1, WHITE(), 0, 0.61, 0, 0.04);
    R(c.g, w * 0.6, 0.08, 0.3, WHITE(), 0, 0.73, -d / 2 + 0.25, 0.04);
    for (const sx of [-1, 1]) B(c.g, 0.02, 0.2, d * 0.5, METAL(), sx * (w / 2), 0.62, 0);
  },
  aparelho_musculacao: (c) => {
    const { w, d, h } = c.def;
    const m = c.main;
    B(c.g, w, 0.08, d, m, 0, 0, 0);
    for (const sx of [-1, 1]) B(c.g, 0.08, h, 0.08, m, sx * (w / 2 - 0.05), 0, -d / 2 + 0.1);
    B(c.g, w, 0.08, 0.08, m, 0, h - 0.08, -d / 2 + 0.1);
    for (let i = 0; i < 8; i++) B(c.g, 0.3, 0.05, 0.15, plain('#555', 0.5, 0.6), 0, 0.1 + i * 0.06, -d / 2 + 0.1);
    R(c.g, 0.4, 0.1, 0.9, getMaterial('couro', '#1f1f22'), 0, 0.45, 0.2, 0.03);
    B(c.g, 0.1, 0.4, 0.1, m, 0, 0.05, 0.2);
    C(c.g, 0.015, 0.015, w * 0.9, METAL(), 0, h * 0.7, -d / 2 + 0.3, 8).rotation.z = Math.PI / 2;
  },
  estacao_trabalho: (c) => {
    const { w, d, h } = c.def;
    B(c.g, w, 0.03, d, c.main, 0, 0.72, 0);
    for (const sx of [-1, 1]) B(c.g, 0.04, 0.72, d - 0.05, METAL(), sx * (w / 2 - 0.03), 0, 0);
    B(c.g, w, h - 0.75, 0.03, plain('#7a8a96', 0.9), 0, 0.75, -d / 2 + 0.015);
    R(c.g, 0.6, 0.36, 0.03, BLACK(), 0, 0.9, -0.15, 0.006);
    B(c.g, 0.57, 0.33, 0.004, SCREEN(), 0, 0.915, -0.133);
    B(c.g, 0.05, 0.15, 0.05, BLACK(), 0, 0.75, -0.17);
    R(c.g, 0.42, 0.015, 0.14, plain('#2c2d30', 0.5), 0, 0.75, 0.12, 0.005);
  },
  toalha_piquenique: (c) => {
    const { w, d } = c.def;
    B(c.g, w, 0.01, d, c.main, 0, 0, 0);
    for (let i = 0; i < 4; i++) B(c.g, w, 0.012, d / 8, plain('#f6f2ea', 0.9), 0, 0, -d / 2 + d / 16 + i * d / 4);
    B(c.g, 0.45, 0.25, 0.3, getMaterial('madeira'), w / 2 - 0.35, 0.01, -d / 2 + 0.3);
    C(c.g, 0.1, 0.1, 0.02, WHITE(), -0.2, 0.01, 0.1, 16);
    S(c.g, 0.05, plain('#b5523b', 0.4), -0.2, 0.06, 0.1);
  },
  barra_exercicio: (c) => {
    const { w, d, h } = c.def;
    for (const x of [-w / 2 + 0.05, 0, w / 2 - 0.05]) C(c.g, 0.04, 0.04, x === 0 ? h * 0.7 : h, c.main, x, 0, 0, 10);
    C(c.g, 0.02, 0.02, w / 2, METAL(), -w / 4, 0, 0, 8).rotation.z = Math.PI / 2;
    c.g.children[c.g.children.length - 1].position.set(-w / 4, h - 0.05, 0);
    C(c.g, 0.02, 0.02, w / 2, METAL(), w / 4, 0, 0, 8).rotation.z = Math.PI / 2;
    c.g.children[c.g.children.length - 1].position.set(w / 4, h * 0.7 - 0.05, 0);
    B(c.g, w, 0.05, d, plain('#4f7a4a', 1), 0, 0, 0);
  },
};

/** Cria o modelo 3D do objeto do catálogo. */
export function buildItemModel(catalogId: string, color: string, material: string): THREE.Group {
  const def = CATALOG_BY_ID.get(catalogId);
  const g = new THREE.Group();
  if (!def) return g;
  const main = getMaterial(material, color);
  const b = builders[catalogId];
  if (b) b({ g, main, color, def });
  else R(g, def.w, def.h, def.d, main, 0, 0, 0, 0.03);
  return g;
}

export function hasBuilder(id: string): boolean {
  return id in builders;
}

const cachedSet = () => new Set(geoCache.values());
/** Libera geometrias exclusivas de um modelo (as compartilhadas em cache são mantidas). */
export function disposeModel(obj: THREE.Object3D) {
  const keep = cachedSet();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !keep.has(m.geometry)) m.geometry.dispose();
  });
}
