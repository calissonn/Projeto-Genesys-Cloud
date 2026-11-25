/** Coordenadas de planta (metros). x → leste, y → sul (no mundo 3D, y da planta = z). */
export interface P {
  x: number;
  y: number;
}

export type WallKind = 'parede' | 'meia' | 'divisoria';

export interface Wall {
  id: string;
  level: number;
  a: P;
  b: P;
  /** Flecha do arco (m) medida a partir do ponto médio da corda, para a esquerda de a→b. 0 = reta. */
  bulge: number;
  height: number;
  thickness: number;
  kind: WallKind;
  material: string;
  color: string;
}

export type OpeningKind =
  | 'porta'
  | 'porta_dupla'
  | 'porta_correr'
  | 'janela'
  | 'janela_alta'
  | 'janela_grande'
  | 'fachada_vidro';

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  /** Distância (m) ao longo da parede, de a até o centro da abertura. */
  t: number;
  width: number;
  height: number;
  sill: number;
  /** Inverte o lado de abertura da porta. */
  flip: boolean;
  color: string;
}

export interface Floor {
  id: string;
  level: number;
  points: P[];
  material: string;
  color: string;
  /** Elevação do topo do piso acima da base do andar (plataformas/fundações). */
  elevation: number;
  thickness: number;
}

export type StairKind = 'reta' | 'L' | 'U' | 'espiral' | 'curva';

export interface Stair {
  id: string;
  level: number;
  kind: StairKind;
  pos: P;
  rot: number;
  width: number;
  material: string;
  color: string;
}

export type RoofKind = 'plano' | 'uma_agua' | 'duas_aguas' | 'quatro_aguas' | 'curvo';

export interface Roof {
  id: string;
  /** Andar sobre o qual o telhado se apoia (topo das paredes deste andar). */
  level: number;
  kind: RoofKind;
  center: P;
  w: number;
  d: number;
  rot: number;
  /** Inclinação: altura / meio vão. */
  pitch: number;
  overhang: number;
  material: string;
  color: string;
}

export interface Item {
  id: string;
  catalogId: string;
  level: number;
  pos: P;
  /** Altura da base do objeto acima da base do andar (m). Para objetos de parede, altura do centro. */
  elev: number;
  rot: number;
  scale: number;
  color: string;
  material: string;
}

export type GameMode = 'criativo' | 'simulacao';

export interface LotInfo {
  id: string;
  name: string;
  w: number;
  d: number;
  price: number;
  neighborhood: string;
}

import type { LifeState } from './life';

export interface Project {
  version: number;
  id: string;
  name: string;
  mode: GameMode;
  /** Capital inicial disponível depois de comprar o terreno (modo simulação). */
  funds: number;
  lot: LotInfo;
  levelHeight: number;
  levels: number;
  walls: Wall[];
  openings: Opening[];
  floors: Floor[];
  stairs: Stair[];
  roofs: Roof[];
  items: Item[];
  /** Estado do modo Vida (família, relógio, relações). Fica fora do desfazer da construção. */
  life?: LifeState;
  createdAt: number;
  updatedAt: number;
}

export type EntityKind = 'wall' | 'opening' | 'floor' | 'stair' | 'roof' | 'item';

export interface EntityRef {
  kind: EntityKind;
  id: string;
}
