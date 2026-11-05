/**
 * Personagens em pixel art desenhados no código (arte original, sem imagens externas).
 * Cada quadro tem 16×24 pixels de arte, visto de lado e virado para a esquerda.
 */
import { PX } from '../building/layout';

export const FRAME_W = 16;
export const FRAME_H = 24;

export interface CharacterPalette {
  hair: string;
  skin: string;
  shirt: string;
  shirtDark: string;
  pants: string;
  pantsDark: string;
  shoes: string;
  longHair?: boolean;
  glasses?: boolean;
}

export const PALETTES: Record<string, CharacterPalette> = {
  'ag-coordinator': { hair: '#2e1f47', skin: '#f2c7a5', shirt: '#8b5cf6', shirtDark: '#6d3fd6', pants: '#1f2937', pantsDark: '#111827', shoes: '#0b0b0f', longHair: true, glasses: true },
  'ag-programmer': { hair: '#3b2416', skin: '#e8b48f', shirt: '#2563eb', shirtDark: '#1d4ed8', pants: '#374151', pantsDark: '#272f3a', shoes: '#111111' },
  'ag-designer': { hair: '#c2410c', skin: '#f6d2b8', shirt: '#ec4899', shirtDark: '#be185d', pants: '#1e3a8a', pantsDark: '#172c69', shoes: '#4b1d0e', longHair: true },
  'ag-tester': { hair: '#121212', skin: '#8d5a3b', shirt: '#16a34a', shirtDark: '#15803d', pants: '#3f3f46', pantsDark: '#2e2e33', shoes: '#111111', glasses: true },
};
export const DEFAULT_PALETTE: CharacterPalette = PALETTES['ag-programmer']!;

type ArmPose = 'down' | 'swingF' | 'swingB' | 'type0' | 'type1' | 'think' | 'raise0' | 'raise1' | 'cheer' | 'coffee0' | 'coffee1' | 'talk0';
type LegPose = 'stand' | 'walk0' | 'walk1' | 'walk2' | 'seated';

interface FrameSpec {
  name: string;
  legs: LegPose;
  arm: ArmPose;
  /** Deslocamento do tronco/cabeça. */
  dx?: number;
  dy?: number;
  headDy?: number;
  mouth?: boolean;
}

export const FRAMES: FrameSpec[] = [
  { name: 'stand', legs: 'stand', arm: 'down' },
  { name: 'walk0', legs: 'walk0', arm: 'swingF' },
  { name: 'walk1', legs: 'walk1', arm: 'down', dy: -1 },
  { name: 'walk2', legs: 'walk2', arm: 'swingB' },
  { name: 'walk3', legs: 'walk1', arm: 'down', dy: -1 },
  { name: 'sit', legs: 'seated', arm: 'down', dx: 1, dy: 3 },
  { name: 'type0', legs: 'seated', arm: 'type0', dx: 1, dy: 3 },
  { name: 'type1', legs: 'seated', arm: 'type1', dx: 1, dy: 3 },
  { name: 'think0', legs: 'seated', arm: 'think', dx: 1, dy: 3 },
  { name: 'think1', legs: 'seated', arm: 'think', dx: 1, dy: 3, headDy: 1 },
  { name: 'raise0', legs: 'stand', arm: 'raise0' },
  { name: 'raise1', legs: 'stand', arm: 'raise1' },
  { name: 'cheer0', legs: 'stand', arm: 'cheer' },
  { name: 'cheer1', legs: 'stand', arm: 'cheer', dy: -2 },
  { name: 'coffee0', legs: 'stand', arm: 'coffee0' },
  { name: 'coffee1', legs: 'stand', arm: 'coffee1' },
  { name: 'talk0', legs: 'stand', arm: 'talk0', mouth: true },
  { name: 'talk1', legs: 'stand', arm: 'down' },
  { name: 'sad', legs: 'stand', arm: 'down', headDy: 1 },
];

/** Animações: nome → quadros e velocidade. */
export const ANIMS: Record<string, { frames: string[]; fps: number }> = {
  stand: { frames: ['stand'], fps: 1 },
  walk: { frames: ['walk0', 'walk1', 'walk2', 'walk3'], fps: 8 },
  sit: { frames: ['sit'], fps: 1 },
  type: { frames: ['type0', 'type1'], fps: 7 },
  think: { frames: ['think0', 'think0', 'think1'], fps: 2 },
  raise: { frames: ['raise0', 'raise1'], fps: 3 },
  cheer: { frames: ['cheer0', 'cheer1'], fps: 4 },
  coffee: { frames: ['coffee0', 'coffee0', 'coffee0', 'coffee1', 'coffee1'], fps: 1.5 },
  talk: { frames: ['talk0', 'talk1'], fps: 3 },
  sad: { frames: ['sad'], fps: 1 },
};

/** Desenha todos os quadros lado a lado num canvas (escala PX). */
export function drawCharacterSheet(p: CharacterPalette): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = FRAMES.length * FRAME_W * PX;
  canvas.height = FRAME_H * PX;
  const ctx = canvas.getContext('2d')!;
  FRAMES.forEach((spec, i) => drawFrame(ctx, i * FRAME_W, spec, p));
  return canvas;
}

function drawFrame(ctx: CanvasRenderingContext2D, ox: number, f: FrameSpec, p: CharacterPalette) {
  const r = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect((ox + x) * PX, y * PX, w * PX, h * PX);
  };
  const dx = f.dx ?? 0;
  const dy = f.dy ?? 0;
  const hy = dy + (f.headDy ?? 0);

  // Pernas
  switch (f.legs) {
    case 'stand':
      r(5, 16 + dy, 6, 3, p.pants);
      r(5, 19, 2, 4, p.pants);
      r(8, 19, 2, 4, p.pantsDark);
      r(4, 23, 3, 1, p.shoes);
      r(7, 23, 3, 1, p.shoes);
      break;
    case 'walk0':
      r(5, 16, 6, 3, p.pants);
      r(8, 19, 2, 4, p.pantsDark);
      r(4, 19, 2, 4, p.pants);
      r(8, 23, 3, 1, p.shoes);
      r(3, 23, 3, 1, p.shoes);
      break;
    case 'walk1':
      r(5, 16 + dy, 6, 3, p.pants);
      r(6, 19 + dy, 3, 4 - dy, p.pants);
      r(5, 23, 4, 1, p.shoes);
      break;
    case 'walk2':
      r(5, 16, 6, 3, p.pants);
      r(4, 19, 2, 4, p.pantsDark);
      r(8, 19, 2, 4, p.pants);
      r(3, 23, 3, 1, p.shoes);
      r(8, 23, 3, 1, p.shoes);
      break;
    case 'seated':
      r(3, 17, 9, 3, p.pants); // coxas para a frente (esquerda)
      r(3, 20, 2, 3, p.pants);
      r(5, 20, 1, 3, p.pantsDark);
      r(2, 23, 4, 1, p.shoes);
      break;
  }

  // Tronco
  r(5 + dx, 9 + dy, 6, 7, p.shirt);
  r(5 + dx, 9 + dy, 6, 1, p.shirtDark);
  r(5 + dx, 15 + dy, 6, 1, p.pantsDark);

  // Braço do fundo (só em algumas poses)
  if (f.arm === 'cheer') {
    r(9 + dx, 3 + dy, 2, 7, p.shirtDark);
    r(9 + dx, 1 + dy, 2, 2, p.skin);
  }

  // Cabeça
  r(7 + dx, 8 + hy, 2, 1, p.skin); // pescoço
  r(5 + dx, 3 + hy, 5, 5, p.skin);
  r(5 + dx, 2 + hy, 6, 2, p.hair);
  r(9 + dx, 3 + hy, 2, 3, p.hair);
  if (p.longHair) r(9 + dx, 4 + hy, 3, 6, p.hair);
  r(6 + dx, 5 + hy + (f.headDy ? 1 : 0), 1, 1, '#1b1b1b'); // olho
  if (p.glasses) {
    r(5 + dx, 4 + hy, 3, 1, '#0f172a');
    r(5 + dx, 5 + hy, 1, 1, '#0f172a');
  }
  if (f.mouth) r(5 + dx, 7 + hy, 1, 1, '#7a2e2e');

  // Braço da frente
  switch (f.arm) {
    case 'down':
      r(7 + dx, 10 + dy, 2, 5, p.shirtDark);
      r(7 + dx, 15 + dy, 2, 1, p.skin);
      break;
    case 'swingF':
      r(6 + dx, 10 + dy, 2, 5, p.shirtDark);
      r(5 + dx, 15 + dy, 2, 1, p.skin);
      break;
    case 'swingB':
      r(8 + dx, 10 + dy, 2, 5, p.shirtDark);
      r(9 + dx, 15 + dy, 2, 1, p.skin);
      break;
    case 'type0':
    case 'type1': {
      const hand = f.arm === 'type0' ? 0 : 1;
      r(7 + dx, 10 + dy, 2, 3, p.shirtDark);
      r(2 + dx, 12 + dy, 6, 2, p.shirtDark);
      r(1 + dx, 12 + dy + hand, 1, 2, p.skin);
      break;
    }
    case 'think':
      r(7 + dx, 10 + dy, 2, 3, p.shirtDark);
      r(5 + dx, 9 + dy, 2, 4, p.shirtDark);
      r(5 + dx, 8 + dy, 2, 1, p.skin);
      break;
    case 'raise0':
    case 'raise1': {
      const wave = f.arm === 'raise1' ? 1 : 0;
      r(7 + dx, 3 + dy, 2, 7, p.shirtDark);
      r(7 + dx - wave, 0 + dy, 2, 3, p.skin);
      break;
    }
    case 'cheer':
      r(6 + dx, 3 + dy, 2, 7, p.shirtDark);
      r(6 + dx, 1 + dy, 2, 2, p.skin);
      break;
    case 'coffee0':
      r(7 + dx, 10 + dy, 2, 3, p.shirtDark);
      r(4 + dx, 12 + dy, 4, 2, p.shirtDark);
      r(1 + dx, 10 + dy, 3, 4, '#e5e7eb');
      r(1 + dx, 10 + dy, 3, 1, '#6b3f1d');
      break;
    case 'coffee1':
      r(7 + dx, 10 + dy, 2, 2, p.shirtDark);
      r(5 + dx, 8 + dy, 2, 4, p.shirtDark);
      r(3 + dx, 6 + dy, 3, 4, '#e5e7eb');
      r(3 + dx, 6 + dy, 3, 1, '#6b3f1d');
      break;
    case 'talk0':
      r(7 + dx, 10 + dy, 2, 2, p.shirtDark);
      r(3 + dx, 11 + dy, 5, 2, p.shirtDark);
      r(2 + dx, 10 + dy, 1, 2, p.skin);
      break;
  }
}

/** Ícones 7×7 dos balões. "#" = cor do ícone, "o" = cor secundária. */
export const ICONS: Record<string, string[]> = {
  think: ['.###...', '#...#..', '#...#..', '#...#..', '.###...', '....##.', '.....##'],
  code: ['.......', '.#...#.', '#..#..#', '#..#..#', '#.#...#', '.#...#.', '.......'],
  test: ['..###..', '...#...', '...#...', '..#o#..', '.#ooo#.', '#ooooo#', '#######'],
  talk: ['.......', '.......', '.......', '#.#.#..', '.......', '.......', '.......'],
  alert: ['...#...', '...#...', '...#...', '...#...', '...#...', '.......', '...#...'],
  check: ['.......', '......#', '.....#.', '#...#..', '.#.#...', '..#....', '.......'],
  error: ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'],
  pause: ['.......', '.##.##.', '.##.##.', '.##.##.', '.##.##.', '.##.##.', '.......'],
  meeting: ['.#...#.', '###.###', '.#...#.', '.......', '#######', '#.....#', '.......'],
};

export const BADGE_COLORS: Record<string, { fg: string; alt: string; border: number }> = {
  think: { fg: '#2563eb', alt: '#93c5fd', border: 0x2563eb },
  code: { fg: '#0f766e', alt: '#5eead4', border: 0x0f766e },
  test: { fg: '#7c3aed', alt: '#a7f3d0', border: 0x7c3aed },
  talk: { fg: '#334155', alt: '#cbd5e1', border: 0x64748b },
  alert: { fg: '#b45309', alt: '#fde68a', border: 0xf59e0b },
  check: { fg: '#15803d', alt: '#bbf7d0', border: 0x16a34a },
  error: { fg: '#b91c1c', alt: '#fecaca', border: 0xdc2626 },
  pause: { fg: '#475569', alt: '#e2e8f0', border: 0x64748b },
  meeting: { fg: '#6d28d9', alt: '#ddd6fe', border: 0x8b5cf6 },
};

export function drawIcon(name: string): HTMLCanvasElement {
  const rows = ICONS[name]!;
  const colors = BADGE_COLORS[name]!;
  const canvas = document.createElement('canvas');
  canvas.width = 7 * PX;
  canvas.height = 7 * PX;
  const ctx = canvas.getContext('2d')!;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = ch === '#' ? colors.fg : colors.alt;
      ctx.fillRect(x * PX, y * PX, PX, PX);
    }),
  );
  return canvas;
}
