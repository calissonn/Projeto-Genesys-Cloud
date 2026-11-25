import * as THREE from 'three';
import { MATERIAL_BY_ID } from '../model/materials';

/**
 * Texturas procedurais geradas em canvas (sem downloads, funcionam offline).
 * Cada textura representa 1 m × 1 m do mundo, a menos que `metersPerTile` diga o contrário.
 */

type Painter = (g: CanvasRenderingContext2D, s: number, rnd: () => number) => void;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function noise(g: CanvasRenderingContext2D, s: number, rnd: () => number, amount: number, count = 4000, size = 2) {
  for (let i = 0; i < count; i++) {
    const v = Math.floor(rnd() * 255);
    g.fillStyle = `rgba(${v},${v},${v},${amount * rnd()})`;
    g.fillRect(rnd() * s, rnd() * s, size * rnd() + 0.5, size * rnd() + 0.5);
  }
}

const painters: Record<string, { tile: number; paint: Painter }> = {
  pintura: { tile: 2, paint: (g, s, r) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s); noise(g, s, r, 0.035, 6000, 1.5); } },
  reboco: { tile: 1, paint: (g, s, r) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s); noise(g, s, r, 0.12, 9000, 3); } },
  azulejo: {
    tile: 0.6,
    paint: (g, s, r) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s); noise(g, s, r, 0.03, 2000);
      g.strokeStyle = 'rgba(120,120,120,0.55)'; g.lineWidth = s / 128;
      const n = 4;
      for (let i = 0; i <= n; i++) {
        g.beginPath(); g.moveTo((i * s) / n, 0); g.lineTo((i * s) / n, s); g.stroke();
        g.beginPath(); g.moveTo(0, (i * s) / n); g.lineTo(s, (i * s) / n); g.stroke();
      }
    },
  },
  porcelanato: {
    tile: 1.2,
    paint: (g, s, r) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) {
        g.strokeStyle = `rgba(150,145,140,${0.05 + r() * 0.08})`; g.lineWidth = 1 + r() * 3;
        g.beginPath(); g.moveTo(r() * s, r() * s); g.bezierCurveTo(r() * s, r() * s, r() * s, r() * s, r() * s, r() * s); g.stroke();
      }
      g.strokeStyle = 'rgba(110,110,110,0.45)'; g.lineWidth = s / 200;
      g.strokeRect(0, 0, s / 2, s / 2); g.strokeRect(s / 2, 0, s / 2, s / 2); g.strokeRect(0, s / 2, s / 2, s / 2); g.strokeRect(s / 2, s / 2, s / 2, s / 2);
    },
  },
  tijolo: {
    tile: 1,
    paint: (g, s, r) => {
      g.fillStyle = '#c9c0b4'; g.fillRect(0, 0, s, s);
      const rows = 14, cols = 4, bh = s / rows, bw = s / cols;
      for (let y = 0; y < rows; y++) {
        for (let x = -1; x < cols; x++) {
          const ox = (y % 2) * bw * 0.5;
          const c = 150 + r() * 50;
          g.fillStyle = `rgb(${c + 20},${c * 0.55},${c * 0.4})`;
          g.fillRect(x * bw + ox + 2, y * bh + 2, bw - 4, bh - 4);
        }
      }
      noise(g, s, r, 0.12, 5000);
    },
  },
  concreto: {
    tile: 2,
    paint: (g, s, r) => {
      g.fillStyle = '#a9a9a5'; g.fillRect(0, 0, s, s); noise(g, s, r, 0.18, 12000, 3);
      for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(80,80,80,${r() * 0.1})`; g.beginPath(); g.arc(r() * s, r() * s, r() * s * 0.12, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(60,60,60,0.25)'; g.lineWidth = 2; g.strokeRect(0, 0, s, s);
      g.fillStyle = 'rgba(40,40,40,0.35)';
      for (const [x, y] of [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) { g.beginPath(); g.arc(x * s, y * s, s / 90, 0, 7); g.fill(); }
    },
  },
  pedra: {
    tile: 1.2,
    paint: (g, s, r) => {
      g.fillStyle = '#5d564d'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 26; i++) {
        const c = 110 + r() * 70;
        g.fillStyle = `rgb(${c},${c * 0.95},${c * 0.86})`;
        const x = r() * s, y = r() * s, w = s * (0.12 + r() * 0.18), h = s * (0.08 + r() * 0.12);
        g.beginPath(); g.ellipse(x, y, w / 2, h / 2, r() * 3, 0, 7); g.fill();
        g.beginPath(); g.ellipse((x + s / 2) % s, (y + s / 2) % s, w / 2, h / 2, r() * 3, 0, 7); g.fill();
      }
      noise(g, s, r, 0.15, 6000);
    },
  },
  madeira: {
    tile: 1.5,
    paint: (g, s, r) => {
      const planks = 8, ph = s / planks;
      for (let p = 0; p < planks; p++) {
        const c = 0.85 + r() * 0.3;
        g.fillStyle = `rgb(${255 * c * 0.9},${255 * c * 0.78},${255 * c * 0.62})`;
        g.fillRect(0, p * ph, s, ph);
        for (let k = 0; k < 18; k++) {
          g.strokeStyle = `rgba(90,55,25,${0.05 + r() * 0.1})`; g.lineWidth = 1 + r() * 2;
          const y = p * ph + r() * ph;
          g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + r() * 6 - 3, s * 0.6, y + r() * 6 - 3, s, y); g.stroke();
        }
        g.fillStyle = 'rgba(50,30,15,0.5)'; g.fillRect(0, p * ph, s, 2);
        const cut = r() * s; g.fillRect(cut, p * ph, 2, ph);
      }
    },
  },
  marmore: {
    tile: 1.6,
    paint: (g, s, r) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 26; i++) {
        g.strokeStyle = `rgba(110,110,120,${0.08 + r() * 0.22})`; g.lineWidth = 0.5 + r() * 2.5;
        let x = r() * s, y = r() * s; g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 8; k++) { x += (r() - 0.3) * s * 0.18; y += (r() - 0.5) * s * 0.18; g.lineTo(x, y); }
        g.stroke();
      }
    },
  },
  granito: {
    tile: 1,
    paint: (g, s, r) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s); noise(g, s, r, 0.6, 26000, 3); },
  },
  carpete: { tile: 0.5, paint: (g, s, r) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s); noise(g, s, r, 0.25, 30000, 1.5); } },
  tecido: {
    tile: 0.4,
    paint: (g, s, r) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 1;
      for (let i = 0; i < s; i += 3) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); }
      noise(g, s, r, 0.08, 6000);
    },
  },
  couro: { tile: 0.5, paint: (g, s, r) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s); noise(g, s, r, 0.12, 16000, 4); } },
  telha_ceramica: {
    tile: 1,
    paint: (g, s, r) => {
      const rows = 6, cols = 5, rh = s / rows, cw = s / cols;
      g.fillStyle = '#6d2f18'; g.fillRect(0, 0, s, s);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const c = 140 + r() * 40;
        const grd = g.createLinearGradient(x * cw, 0, (x + 1) * cw, 0);
        grd.addColorStop(0, `rgb(${c * 0.75},${c * 0.36},${c * 0.2})`);
        grd.addColorStop(0.5, `rgb(${c + 30},${c * 0.55},${c * 0.32})`);
        grd.addColorStop(1, `rgb(${c * 0.7},${c * 0.33},${c * 0.18})`);
        g.fillStyle = grd; g.fillRect(x * cw + 1, y * rh + 1, cw - 2, rh - 3);
      }
    },
  },
  telha_ardosia: {
    tile: 1,
    paint: (g, s, r) => {
      g.fillStyle = '#2f3237'; g.fillRect(0, 0, s, s);
      const rows = 8, cols = 5, rh = s / rows, cw = s / cols;
      for (let y = 0; y < rows; y++) for (let x = -1; x < cols; x++) {
        const c = 70 + r() * 30; g.fillStyle = `rgb(${c},${c + 4},${c + 10})`;
        g.fillRect(x * cw + (y % 2) * cw / 2 + 1, y * rh + 1, cw - 2, rh - 2);
      }
    },
  },
  grama: {
    tile: 2,
    paint: (g, s, r) => {
      g.fillStyle = '#5d8a3c'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 9000; i++) {
        const c = r();
        g.strokeStyle = `rgba(${60 + c * 60},${110 + c * 70},${30 + c * 30},0.55)`;
        const x = r() * s, y = r() * s;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4); g.stroke();
      }
    },
  },
  deck: {
    tile: 1.2,
    paint: (g, s, r) => {
      const planks = 7, pw = s / planks;
      for (let p = 0; p < planks; p++) {
        const c = 0.8 + r() * 0.3;
        g.fillStyle = `rgb(${190 * c},${130 * c},${82 * c})`; g.fillRect(p * pw, 0, pw, s);
        for (let k = 0; k < 10; k++) { g.strokeStyle = `rgba(70,40,20,${r() * 0.15})`; const x = p * pw + r() * pw; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + r() * 4 - 2, s); g.stroke(); }
        g.fillStyle = 'rgba(30,18,10,0.7)'; g.fillRect(p * pw, 0, 3, s);
      }
    },
  },
  metal: {
    tile: 1,
    paint: (g, s, r) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 800; i++) { g.strokeStyle = `rgba(0,0,0,${r() * 0.05})`; const y = r() * s; g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
    },
  },
  asfalto: { tile: 3, paint: (g, s, r) => { g.fillStyle = '#3c3d40'; g.fillRect(0, 0, s, s); noise(g, s, r, 0.35, 20000, 2); } },
  calcada: {
    tile: 1,
    paint: (g, s, r) => {
      g.fillStyle = '#b9b4aa'; g.fillRect(0, 0, s, s); noise(g, s, r, 0.12, 6000);
      g.strokeStyle = 'rgba(80,80,80,0.4)'; g.lineWidth = 2;
      g.strokeRect(1, 1, s / 2 - 2, s / 2 - 2); g.strokeRect(s / 2 + 1, 1, s / 2 - 2, s / 2 - 2);
      g.strokeRect(1, s / 2 + 1, s / 2 - 2, s / 2 - 2); g.strokeRect(s / 2 + 1, s / 2 + 1, s / 2 - 2, s / 2 - 2);
    },
  },
};

const cache = new Map<string, THREE.CanvasTexture>();
let texSize = 512;

export function setTextureQuality(size: number) {
  texSize = size;
}

export function textureFor(id: string): { tex: THREE.CanvasTexture; tile: number } | null {
  const p = painters[id];
  if (!p) return null;
  let tex = cache.get(id);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = c.height = texSize;
    const g = c.getContext('2d')!;
    p.paint(g, texSize, rng(id.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7)));
    tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    cache.set(id, tex);
  }
  return { tex, tile: p.tile };
}

export interface MatProps {
  roughness: number;
  metalness: number;
  transparent?: boolean;
  opacity?: number;
}

const PROPS: Record<string, MatProps> = {
  pintura: { roughness: 0.9, metalness: 0 },
  reboco: { roughness: 0.95, metalness: 0 },
  tijolo: { roughness: 0.92, metalness: 0 },
  concreto: { roughness: 0.85, metalness: 0 },
  pedra: { roughness: 0.9, metalness: 0 },
  madeira: { roughness: 0.6, metalness: 0 },
  madeira_escura: { roughness: 0.55, metalness: 0 },
  marmore: { roughness: 0.18, metalness: 0 },
  granito: { roughness: 0.25, metalness: 0 },
  porcelanato: { roughness: 0.22, metalness: 0 },
  azulejo: { roughness: 0.2, metalness: 0 },
  carpete: { roughness: 1, metalness: 0 },
  vidro: { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3 },
  metal: { roughness: 0.32, metalness: 0.85 },
  metal_preto: { roughness: 0.4, metalness: 0.6 },
  tecido: { roughness: 0.95, metalness: 0 },
  couro: { roughness: 0.5, metalness: 0 },
  telha_ceramica: { roughness: 0.8, metalness: 0 },
  telha_ardosia: { roughness: 0.7, metalness: 0 },
  grama: { roughness: 1, metalness: 0 },
  deck: { roughness: 0.7, metalness: 0 },
};

const TEX_ALIAS: Record<string, string> = { madeira_escura: 'madeira', metal_preto: 'metal' };

const matCache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Material compartilhado (por material + cor). Texturas usam coordenadas UV em metros.
 * Materiais não tingíveis usam a cor base do material.
 */
export function getMaterial(matId: string, color?: string): THREE.MeshStandardMaterial {
  const def = MATERIAL_BY_ID.get(matId);
  const col = def && !def.tintable && matId !== 'tecido' && matId !== 'couro' ? def.base : color ?? def?.base ?? '#cccccc';
  const key = `${matId}|${col}`;
  let m = matCache.get(key);
  if (m) return m;
  const props = PROPS[matId] ?? { roughness: 0.8, metalness: 0 };
  const t = textureFor(TEX_ALIAS[matId] ?? matId);
  m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(col),
    roughness: props.roughness,
    metalness: props.metalness,
    transparent: !!props.transparent,
    opacity: props.opacity ?? 1,
    side: THREE.DoubleSide,
    depthWrite: !props.transparent,
  });
  if (t) {
    const tex = t.tex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1 / t.tile, 1 / t.tile);
    m.map = tex;
  }
  // Tons de madeira e metal têm cor própria na textura; ajusta a cor para não escurecer demais.
  if (matId === 'madeira' || matId === 'madeira_escura' || matId === 'deck') m.color.set(matId === 'madeira_escura' ? '#7a5034' : color && def?.tintable ? color : '#ffffff');
  if (matId === 'grama') m.color.set('#ffffff');
  if (matId === 'tijolo' || matId === 'pedra' || matId === 'telha_ceramica' || matId === 'telha_ardosia' || matId === 'concreto') m.color.set('#ffffff');
  matCache.set(key, m);
  return m;
}

/** Material simples sem textura (para detalhes de móveis). */
const plainCache = new Map<string, THREE.MeshStandardMaterial>();
export function plain(color: string, roughness = 0.7, metalness = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}|${JSON.stringify(extra)}`;
  let m = plainCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
    plainCache.set(key, m);
  }
  return m;
}

export const GLASS = () => plain('#cfe6ee', 0.04, 0.1, { transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
