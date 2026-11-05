/**
 * Configuração do prédio. Para adicionar andares ou salas, edite apenas este arquivo.
 * Coordenadas em unidades do mundo (1 pixel da arte = PX unidades).
 */
export const PX = 2;
export const WORLD_W = 800;
export const ROOF_H = 80;
export const FLOOR_H = 138;
export const GROUND_H = 70;

export const BUILDING_X = 30;
export const BUILDING_W = 740;
export const ROOM_X = BUILDING_X + 10;
export const ROOM_W = 610;
export const SHAFT_X = ROOM_X + ROOM_W + 10; // início do poço do elevador
export const SHAFT_W = 90;
export const ELEVATOR_DOOR_X = SHAFT_X + SHAFT_W / 2;
/** Profundidade isométrica do piso. */
export const DEPTH = 34;

export type StationKind =
  | 'desk'
  | 'admin-desk'
  | 'meeting'
  | 'approval-center'
  | 'projects-board'
  | 'lab'
  | 'lounge-coffee'
  | 'lounge-sofa'
  | 'prototype-wall'
  | 'error-board'
  | 'tasks-board'
  | 'process-monitors'
  | 'plant'
  | 'server-rack';

export interface Station {
  id: string;
  kind: StationKind;
  x: number;
  /** Agente dono da mesa (null = mesa vaga, disponível para expansão). */
  owner?: string | null;
  label?: string;
}

export interface FloorDef {
  level: number;
  name: string;
  department: string;
  wall: number;
  wallDark: number;
  floor: number;
  floorDark: number;
  accent: number;
  stations: Station[];
  /** Aviso exibido no andar (ex.: andar ainda sem agentes). */
  note?: string;
}

export const FLOORS: FloorDef[] = [
  {
    level: 5,
    name: '5º Diretoria',
    department: 'Diretoria',
    wall: 0x3b3355,
    wallDark: 0x2c2642,
    floor: 0x6b4f3a,
    floorDark: 0x523b2b,
    accent: 0xa78bfa,
    stations: [
      { id: 'admin', kind: 'admin-desk', x: 95, label: 'Administrador (você)' },
      { id: 'coord-desk', kind: 'desk', x: 215, owner: 'ag-coordinator' },
      { id: 'board', kind: 'projects-board', x: 296 },
      { id: 'meeting', kind: 'meeting', x: 385 },
      { id: 'approvals', kind: 'approval-center', x: 500 },
      { id: 'lounge5', kind: 'lounge-sofa', x: 590 },
    ],
  },
  {
    level: 4,
    name: '4º Desenvolvimento',
    department: 'Desenvolvimento',
    wall: 0x23324d,
    wallDark: 0x1a263b,
    floor: 0x4a5568,
    floorDark: 0x394252,
    accent: 0x60a5fa,
    stations: [
      { id: 'dev-1', kind: 'desk', x: 95, owner: 'ag-programmer' },
      { id: 'dev-2', kind: 'desk', x: 215, owner: null },
      { id: 'dev-3', kind: 'desk', x: 335, owner: null },
      { id: 'tasks', kind: 'tasks-board', x: 440 },
      { id: 'lounge4', kind: 'lounge-coffee', x: 575 },
    ],
  },
  {
    level: 3,
    name: '3º Design',
    department: 'Design',
    wall: 0x4a2c45,
    wallDark: 0x3a2236,
    floor: 0x7c5a4a,
    floorDark: 0x634638,
    accent: 0xf472b6,
    stations: [
      { id: 'des-1', kind: 'desk', x: 95, owner: 'ag-designer' },
      { id: 'des-2', kind: 'desk', x: 215, owner: null },
      { id: 'proto', kind: 'prototype-wall', x: 365 },
      { id: 'plant3', kind: 'plant', x: 480 },
      { id: 'lounge3', kind: 'lounge-sofa', x: 575 },
    ],
  },
  {
    level: 2,
    name: '2º Qualidade',
    department: 'Qualidade',
    wall: 0x1f3d36,
    wallDark: 0x172e29,
    floor: 0x52606d,
    floorDark: 0x414c57,
    accent: 0x4ade80,
    stations: [
      { id: 'qa-1', kind: 'desk', x: 95, owner: 'ag-tester' },
      { id: 'errors', kind: 'error-board', x: 205 },
      { id: 'lab', kind: 'lab', x: 330 },
      { id: 'rack', kind: 'server-rack', x: 450 },
      { id: 'lounge2', kind: 'lounge-coffee', x: 575 },
    ],
  },
  {
    level: 1,
    name: '1º Operações',
    department: 'Operações',
    wall: 0x3d3a2a,
    wallDark: 0x2e2c20,
    floor: 0x5c5346,
    floorDark: 0x4a4338,
    accent: 0xfbbf24,
    note: 'Expansão futura — ainda sem agentes',
    stations: [
      { id: 'ops-1', kind: 'desk', x: 95, owner: null },
      { id: 'ops-2', kind: 'desk', x: 215, owner: null },
      { id: 'monitors', kind: 'process-monitors', x: 360 },
      { id: 'plant1', kind: 'plant', x: 470 },
      { id: 'lounge1', kind: 'lounge-sofa', x: 575 },
    ],
  },
];

export const WORLD_H = ROOF_H + FLOORS.length * FLOOR_H + GROUND_H;

/** Topo (y) do andar. */
export function floorTop(level: number): number {
  const idx = FLOORS.findIndex((f) => f.level === level);
  return ROOF_H + idx * FLOOR_H;
}
/** Linha (y) onde ficam os pés dos personagens no andar. */
export function feetY(level: number): number {
  return floorTop(level) + FLOOR_H - 16;
}
export function floorDef(level: number): FloorDef {
  const f = FLOORS.find((x) => x.level === level);
  if (!f) throw new Error(`Andar ${level} não existe`);
  return f;
}
export function stationById(id: string): { floor: FloorDef; station: Station } | null {
  for (const floor of FLOORS) {
    const station = floor.stations.find((s) => s.id === id);
    if (station) return { floor, station };
  }
  return null;
}
export function deskOf(agentId: string): { floor: FloorDef; station: Station } | null {
  for (const floor of FLOORS) {
    const station = floor.stations.find((s) => s.owner === agentId);
    if (station) return { floor, station };
  }
  return null;
}
export function loungeOf(level: number): Station {
  const s = floorDef(level).stations.find((x) => x.kind === 'lounge-coffee' || x.kind === 'lounge-sofa');
  if (!s) throw new Error(`Andar ${level} sem área de descanso`);
  return s;
}
/** O personagem senta à direita da mesa, de frente para o monitor. */
export const SEAT_OFFSET = 34;
