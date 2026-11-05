import type * as Phaser from 'phaser';
import { BUILDING_W, BUILDING_X, DEPTH, ELEVATOR_DOOR_X, FLOOR_H, ROOM_W, ROOM_X, SHAFT_W, SHAFT_X, type FloorDef, type Station } from '../building/layout';

type G = Phaser.GameObjects.Graphics;

const rect = (g: G, x: number, y: number, w: number, h: number, color: number, alpha = 1) => {
  g.fillStyle(color, alpha);
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

export function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const gg = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (gg << 8) | b;
}

/** Área da tela de um monitor (para animações de código, gráficos, testes…). */
export interface ScreenArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Sala em corte 2.5D: parede do fundo, parede lateral e piso em perspectiva. */
export function drawRoom(g: G, floor: FloorDef, top: number) {
  const bottom = top + FLOOR_H;
  // Laje / teto
  rect(g, BUILDING_X, top, BUILDING_W, 8, 0x9aa3ad);
  rect(g, BUILDING_X, top + 6, BUILDING_W, 2, 0x6b7280);
  // Parede do fundo
  rect(g, ROOM_X, top + 8, ROOM_W, FLOOR_H - 8 - DEPTH, floor.wall);
  // Faixa de cor do departamento e rodapé
  rect(g, ROOM_X, top + 8, ROOM_W, 4, floor.accent, 0.8);
  rect(g, ROOM_X, bottom - DEPTH - 4, ROOM_W, 4, floor.wallDark);
  // Piso em perspectiva
  g.fillStyle(floor.floor, 1);
  g.fillPoints(
    [
      { x: ROOM_X, y: bottom },
      { x: ROOM_X + 20, y: bottom - DEPTH },
      { x: ROOM_X + ROOM_W, y: bottom - DEPTH },
      { x: ROOM_X + ROOM_W, y: bottom },
    ] as Phaser.Types.Math.Vector2Like[],
    true,
  );
  // Linhas do piso (tacos)
  g.lineStyle(2, floor.floorDark, 0.7);
  for (let x = ROOM_X + 40; x < ROOM_X + ROOM_W; x += 40) g.lineBetween(x, bottom - DEPTH, x - 20, bottom);
  g.lineBetween(ROOM_X + 10, bottom - DEPTH / 2, ROOM_X + ROOM_W, bottom - DEPTH / 2);
  // Parede lateral esquerda
  g.fillStyle(floor.wallDark, 1);
  g.fillPoints(
    [
      { x: ROOM_X, y: top + 8 },
      { x: ROOM_X + 20, y: top + 20 },
      { x: ROOM_X + 20, y: bottom - DEPTH },
      { x: ROOM_X, y: bottom },
    ] as Phaser.Types.Math.Vector2Like[],
    true,
  );
  // Luminárias
  for (let x = ROOM_X + 80; x < ROOM_X + ROOM_W; x += 160) {
    rect(g, x - 18, top + 8, 36, 4, 0xe5e7eb);
    rect(g, x - 14, top + 12, 28, 2, 0xfff7d6, 0.9);
  }
  // Fachada: pilares laterais
  rect(g, BUILDING_X, top, 10, FLOOR_H, 0x8b95a1);
  rect(g, BUILDING_X + BUILDING_W - 10, top, 10, FLOOR_H, 0x8b95a1);
}

/** Poço do elevador com vidro (o carro aparece se movendo). */
export function drawShaft(g: G, top: number, level: number) {
  rect(g, SHAFT_X, top + 8, SHAFT_W, FLOOR_H - 8, 0x1e293b);
  rect(g, SHAFT_X + 6, top + 12, SHAFT_W - 12, FLOOR_H - 16, 0x334155, 0.7);
  // Trilhos
  rect(g, SHAFT_X + 10, top + 8, 3, FLOOR_H - 8, 0x64748b);
  rect(g, SHAFT_X + SHAFT_W - 13, top + 8, 3, FLOOR_H - 8, 0x64748b);
  // Porta de pavimento (contorno)
  const bottom = top + FLOOR_H;
  g.lineStyle(2, 0x94a3b8, 1);
  g.strokeRect(ELEVATOR_DOOR_X - 24, bottom - 74, 48, 72);
  rect(g, ELEVATOR_DOOR_X - 8, bottom - 86, 16, 9, 0x0f172a);
  void level;
}

export function drawElevatorCar(g: G) {
  g.clear();
  rect(g, -22, -70, 44, 70, 0xcbd5e1);
  rect(g, -20, -68, 40, 66, 0x94a3b8);
  rect(g, -1, -68, 2, 66, 0x64748b);
  rect(g, -22, -74, 44, 4, 0x475569);
  rect(g, -2, -84, 4, 10, 0x475569);
}

/** Desenha um posto e devolve a área de tela, se houver monitor. */
export function drawStation(g: G, s: Station, fy: number, top: number, floor: FloorDef): ScreenArea | null {
  const x = s.x;
  switch (s.kind) {
    case 'desk':
    case 'admin-desk': {
      const admin = s.kind === 'admin-desk';
      const wood = admin ? 0x7c4a2d : 0x8b6b4a;
      // Cadeira (à direita da mesa)
      const sx = x + 34;
      rect(g, sx - 9, fy - 18, 18, 4, 0x1f2937);
      rect(g, sx + 6, fy - 40, 5, 24, 0x111827);
      rect(g, sx - 1, fy - 14, 3, 11, 0x4b5563);
      rect(g, sx - 9, fy - 3, 18, 3, 0x374151);
      // Mesa
      rect(g, x - 26, fy - 32, 52, 4, shade(wood, 1.15));
      rect(g, x - 26, fy - 28, 52, 10, wood);
      rect(g, x - 24, fy - 18, 4, 18, shade(wood, 0.7));
      rect(g, x + 20, fy - 18, 4, 18, shade(wood, 0.7));
      // Monitor
      rect(g, x - 3, fy - 40, 6, 8, 0x374151);
      rect(g, x - 10, fy - 34, 20, 2, 0x4b5563);
      rect(g, x - 18, fy - 64, 36, 25, 0x0b1220);
      // Teclado e caneca
      rect(g, x + 4, fy - 34, 16, 2, 0xcbd5e1);
      rect(g, x - 24, fy - 38, 5, 6, 0xf8fafc);
      if (admin) {
        rect(g, x - 26, fy - 70, 40, 4, 0x000000, 0);
      }
      if (s.owner === null) {
        // Mesa vaga: placa
        rect(g, x - 14, fy - 14, 28, 9, 0xf1f5f9, 0.85);
      }
      return { x: x - 16, y: fy - 62, w: 32, h: 21 };
    }
    case 'meeting': {
      // Quadro branco na parede
      rect(g, x - 40, top + 24, 80, 40, 0xf8fafc);
      g.lineStyle(2, 0x94a3b8, 1);
      g.strokeRect(x - 40, top + 24, 80, 40);
      rect(g, x - 32, top + 32, 30, 3, 0x8b5cf6, 0.6);
      rect(g, x - 32, top + 40, 50, 3, 0x60a5fa, 0.6);
      rect(g, x - 32, top + 48, 40, 3, 0xf472b6, 0.6);
      // Mesa de reunião
      rect(g, x - 46, fy - 30, 92, 5, 0x9a7b5b);
      rect(g, x - 42, fy - 25, 84, 6, 0x7a5c40);
      rect(g, x - 34, fy - 19, 5, 19, 0x5b4330);
      rect(g, x + 29, fy - 19, 5, 19, 0x5b4330);
      // Cadeiras
      rect(g, x - 62, fy - 36, 6, 22, 0x1f2937);
      rect(g, x + 56, fy - 36, 6, 22, 0x1f2937);
      return null;
    }
    case 'approval-center': {
      rect(g, x - 34, fy - 38, 68, 38, 0x334155);
      rect(g, x - 34, fy - 38, 68, 5, floor.accent);
      rect(g, x - 30, fy - 28, 60, 22, 0x1e293b);
      // Placa na parede
      rect(g, x - 40, top + 28, 80, 18, 0x0f172a);
      return { x: x - 14, y: fy - 62, w: 28, h: 18 };
    }
    case 'projects-board': {
      rect(g, x - 38, top + 24, 76, 50, 0x8b6b4a);
      rect(g, x - 35, top + 27, 70, 44, 0xd6b98c);
      return { x: x - 35, y: top + 27, w: 70, h: 44 };
    }
    case 'lab': {
      // Bancada com frascos e monitor
      rect(g, x - 44, fy - 32, 88, 5, 0xe2e8f0);
      rect(g, x - 42, fy - 27, 84, 8, 0x94a3b8);
      rect(g, x - 40, fy - 19, 4, 19, 0x64748b);
      rect(g, x + 36, fy - 19, 4, 19, 0x64748b);
      rect(g, x - 36, fy - 44, 6, 12, 0x86efac, 0.8);
      rect(g, x - 26, fy - 40, 6, 8, 0x93c5fd, 0.8);
      rect(g, x + 22, fy - 46, 6, 14, 0xfca5a5, 0.8);
      rect(g, x - 3, fy - 40, 6, 8, 0x374151);
      rect(g, x - 18, fy - 64, 36, 25, 0x0b1220);
      // Banqueta
      rect(g, x + 32, fy - 20, 16, 4, 0x1f2937);
      rect(g, x + 38, fy - 16, 4, 16, 0x4b5563);
      return { x: x - 16, y: fy - 62, w: 32, h: 21 };
    }
    case 'lounge-coffee': {
      rect(g, x + 22, fy - 52, 20, 52, 0x52525b);
      rect(g, x + 25, fy - 48, 14, 10, 0x18181b);
      rect(g, x + 28, fy - 30, 8, 8, 0xf5f5f4);
      rect(g, x + 24, fy - 52, 16, 3, 0xdc2626);
      rect(g, x - 26, fy - 22, 30, 4, 0xa16207);
      rect(g, x - 13, fy - 18, 4, 18, 0x713f12);
      return null;
    }
    case 'lounge-sofa': {
      rect(g, x - 34, fy - 36, 68, 14, shade(floor.accent, 0.55));
      rect(g, x - 34, fy - 24, 68, 14, shade(floor.accent, 0.7));
      rect(g, x - 38, fy - 30, 8, 22, shade(floor.accent, 0.45));
      rect(g, x + 30, fy - 30, 8, 22, shade(floor.accent, 0.45));
      rect(g, x - 32, fy - 10, 4, 10, 0x3f3f46);
      rect(g, x + 28, fy - 10, 4, 10, 0x3f3f46);
      return null;
    }
    case 'prototype-wall': {
      rect(g, x - 66, top + 20, 132, 66, 0x111827);
      rect(g, x - 62, top + 24, 124, 58, 0x0b1220);
      rect(g, x - 4, top + 86, 8, 6, 0x374151);
      return { x: x - 60, y: top + 26, w: 120, h: 54 };
    }
    case 'error-board':
    case 'tasks-board': {
      rect(g, x - 46, top + 24, 92, 46, 0x0f172a);
      g.lineStyle(2, floor.accent, 1);
      g.strokeRect(x - 46, top + 24, 92, 46);
      return { x: x - 44, y: top + 26, w: 88, h: 42 };
    }
    case 'process-monitors': {
      for (let i = -1; i <= 1; i++) {
        rect(g, x + i * 44 - 20, top + 30, 40, 28, 0x111827);
        rect(g, x + i * 44 - 17, top + 33, 34, 22, 0x1f2937);
      }
      return null;
    }
    case 'plant': {
      rect(g, x - 8, fy - 16, 16, 16, 0xb45309);
      rect(g, x - 10, fy - 18, 20, 3, 0x92400e);
      rect(g, x - 3, fy - 40, 6, 22, 0x15803d);
      rect(g, x - 12, fy - 34, 9, 6, 0x22c55e);
      rect(g, x + 3, fy - 44, 9, 6, 0x22c55e);
      rect(g, x - 9, fy - 48, 8, 6, 0x16a34a);
      return null;
    }
    case 'server-rack': {
      rect(g, x - 18, fy - 86, 36, 86, 0x1f2937);
      for (let y = fy - 80; y < fy - 6; y += 12) {
        rect(g, x - 14, y, 28, 8, 0x374151);
        rect(g, x + 8, y + 3, 3, 2, 0x22c55e);
      }
      return null;
    }
  }
}

/** Telhado, letreiro, céu e rua. */
export function drawExterior(g: G, worldW: number, worldH: number, roofH: number, groundTop: number) {
  // Céu
  const sky = [0x7dd3fc, 0x93dbfd, 0xa5e3fd, 0xbae9fe];
  sky.forEach((c, i) => rect(g, 0, (i * groundTop) / sky.length, worldW, groundTop / sky.length + 1, c));
  // Nuvens
  for (const [cx, cy] of [[90, 30], [640, 48], [400, 16]] as const) {
    rect(g, cx - 30, cy, 60, 12, 0xffffff, 0.85);
    rect(g, cx - 18, cy - 8, 36, 10, 0xffffff, 0.85);
  }
  // Telhado
  rect(g, BUILDING_X - 6, roofH - 14, BUILDING_W + 12, 14, 0x475569);
  rect(g, BUILDING_X + 40, roofH - 50, 260, 36, 0x0f172a);
  rect(g, BUILDING_X + 44, roofH - 46, 252, 28, 0x111827);
  rect(g, BUILDING_X + 560, roofH - 60, 4, 46, 0x64748b);
  rect(g, BUILDING_X + 556, roofH - 64, 12, 6, 0xef4444);
  // Calçada e rua
  rect(g, 0, groundTop, worldW, 16, 0xa8a29e);
  rect(g, 0, groundTop + 16, worldW, worldH - groundTop - 16, 0x3f3f46);
  for (let x = 20; x < worldW; x += 70) rect(g, x, groundTop + 38, 34, 4, 0xfacc15);
  // Entrada
  rect(g, BUILDING_X + 260, groundTop - 6, 120, 6, 0x9ca3af);
}
