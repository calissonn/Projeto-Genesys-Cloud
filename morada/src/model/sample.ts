import type { Project, Wall, Floor, Item, P, Opening, WallKind } from './types';
import { uid, LOT_PRESETS, createProject } from './project';
import { wallPath, wallLength } from './geometry';
import { CATALOG_BY_ID } from './catalog';

/** Gera um sobrado moderno de exemplo (parede curva, fachada de vidro, escada, sacada, piscina). */
export function sampleHouse(mode: Project['mode'] = 'criativo'): Project {
  const p = createProject('Sobrado Modelo', mode, LOT_PRESETS[1]);
  const W = (level: number, a: P, b: P, bulge = 0, kind: WallKind = 'parede', color = '#f1ece3', material = 'pintura'): Wall => {
    const w: Wall = { id: uid('w'), level, a, b, bulge, height: kind === 'meia' ? 1.1 : 3, thickness: 0.15, kind, material, color };
    p.walls.push(w);
    return w;
  };
  const O = (w: Wall, kind: Opening['kind'], t: number | 'mid', width: number, height: number, sill: number, color = '#f6f6f4') => {
    const L = wallLength(w);
    p.openings.push({ id: uid('o'), wallId: w.id, kind, t: t === 'mid' ? L / 2 : t, width, height, sill, flip: false, color });
  };
  const F = (level: number, points: P[], material: string, color: string, elevation: number, thickness: number): Floor => {
    const f: Floor = { id: uid('f'), level, points, material, color, elevation, thickness };
    p.floors.push(f);
    return f;
  };
  const I = (catalogId: string, level: number, x: number, y: number, rot = 0, elev?: number, color?: string): Item => {
    const def = CATALOG_BY_ID.get(catalogId)!;
    const it: Item = { id: uid('i'), catalogId, level, pos: { x, y }, elev: elev ?? (level === 0 ? 0.05 : 0), rot, scale: 1, color: color ?? def.color, material: def.material };
    p.items.push(it);
    return it;
  };

  // ---------- Térreo
  const back = W(0, { x: -7, y: -6 }, { x: 5, y: -6 });
  const right = W(0, { x: 5, y: -6 }, { x: 5, y: 4 }, 0, 'parede', '#e8e1d4', 'reboco');
  const front = W(0, { x: -7, y: 4 }, { x: 5, y: 4 }, 1.6, 'parede', '#3d3c3a', 'concreto');
  const left = W(0, { x: -7, y: 4 }, { x: -7, y: -6 }, 0, 'parede', '#e8e1d4', 'reboco');
  W(0, { x: -1, y: -6 }, { x: -1, y: -1 });
  const inner2 = W(0, { x: -7, y: -1 }, { x: -1, y: -1 });
  W(0, { x: -4, y: -6 }, { x: -4, y: -1 });
  O(back, 'fachada_vidro', 8.5, 4.5, 2.8, 0.05, '#2c2d30');
  O(back, 'janela', 2, 1.2, 1.1, 1.0);
  O(back, 'janela_alta', 4.8, 0.8, 0.5, 1.7);
  O(front, 'porta_dupla', 'mid', 1.6, 2.2, 0, '#6b4329');
  O(front, 'janela_grande', 3.2, 2.4, 1.6, 0.6, '#2c2d30');
  O(front, 'janela_grande', wallLength(front) - 3.2, 2.4, 1.6, 0.6, '#2c2d30');
  O(right, 'janela', 7, 1.2, 1.2, 1.0);
  O(left, 'janela', 2.5, 1.6, 1.2, 1.0);
  O(left, 'janela_alta', 6.2, 0.8, 0.5, 1.7);
  O(left, 'janela_alta', 8.5, 0.8, 0.5, 1.7);
  O(inner2, 'porta', 4.2, 0.8, 2.1, 0, '#8a5a3a');
  O(inner2, 'porta', 1.5, 0.8, 2.1, 0, '#8a5a3a');

  const arc = wallPath(front).slice().reverse();
  F(0, [{ x: -7, y: -6 }, { x: 5, y: -6 }, { x: 5, y: 4 }, ...arc.slice(1, -1), { x: -7, y: 4 }], 'porcelanato', '#d9d4cc', 0.05, 0.15);

  // Escada reta encostada na parede direita
  p.stairs.push({ id: uid('s'), level: 0, kind: 'reta', pos: { x: 4.3, y: -1.5 }, rot: 0, width: 1.0, material: 'madeira', color: '#c49a6c' });

  // ---------- 1º andar
  const b1 = W(1, { x: -7, y: -6 }, { x: 5, y: -6 });
  const r1 = W(1, { x: 5, y: -6 }, { x: 5, y: 1 });
  const f1 = W(1, { x: 5, y: 1 }, { x: -7, y: 1 }, 0, 'parede', '#3d3c3a', 'concreto');
  const l1 = W(1, { x: -7, y: 1 }, { x: -7, y: -6 });
  const i1 = W(1, { x: -1, y: -6 }, { x: -1, y: 1 });
  O(b1, 'janela_grande', 3, 2.4, 1.4, 0.8, '#2c2d30');
  O(b1, 'janela', 9, 1.2, 1.2, 1.0, '#2c2d30');
  O(f1, 'porta_correr', 3.5, 2.4, 2.3, 0, '#2c2d30');
  O(f1, 'porta_correr', 9, 2.4, 2.3, 0, '#2c2d30');
  O(r1, 'janela', 3.5, 1.2, 1.2, 1.0);
  O(l1, 'janela', 3.5, 1.2, 1.2, 1.0);
  O(i1, 'porta', 2.0, 0.9, 2.1, 0, '#8a5a3a');
  F(1, [{ x: -7.075, y: -6.075 }, { x: 5.075, y: -6.075 }, { x: 5.075, y: 3.2 }, { x: -7.075, y: 3.2 }], 'madeira', '#c49a6c', 0, 0.2);
  for (let x = -6; x <= 4; x += 2) I('guarda_corpo', 1, x, 3.15, 0, 0);

  // ---------- Telhado
  p.roofs.push({ id: uid('r'), level: 1, kind: 'quatro_aguas', center: { x: -1, y: -2.5 }, w: 12.15, d: 7.15, rot: 0, pitch: 0.4, overhang: 0.6, material: 'telha_ardosia', color: '#4b5058' });

  // ---------- Móveis térreo
  I('tapete', 0, 1.2, 1.5, 0);
  I('sofa_l', 0, 1.0, 2.6, Math.PI);
  I('mesa_centro', 0, 1.2, 1.3, 0);
  I('rack_tv', 0, 1.2, -0.6, 0);
  I('tv', 0, 1.2, -0.6, 0, 0.55);
  I('planta_grande', 0, 3.6, 3.2);
  I('luminaria_piso', 0, -0.8, 3.2);
  I('mesa_jantar', 0, -4.0, 1.8, 0);
  for (const [x, y, r] of [[-4.6, 1.15, 0], [-3.4, 1.15, 0], [-4.6, 2.45, Math.PI], [-3.4, 2.45, Math.PI]] as const) I('cadeira', 0, x, y, r);
  I('pendente', 0, -4.0, 1.8, 0, 2.1);
  // Cozinha
  I('balcao', 0, -6.6, -5.0, Math.PI / 2);
  I('pia_cozinha', 0, -6.6, -3.9, Math.PI / 2);
  I('fogao', 0, -6.6, -2.85, Math.PI / 2);
  I('geladeira', 0, -6.55, -1.95, Math.PI / 2);
  I('ilha', 0, -5.2, -3.6, Math.PI / 2);
  I('microondas', 0, -6.6, -5.0, Math.PI / 2, 0.95);
  // Banheiro
  I('vaso', 0, -2.6, -5.5, 0);
  I('pia_banheiro', 0, -1.4, -3.5, -Math.PI / 2);
  I('chuveiro', 0, -3.4, -2.2, 0);
  // ---------- Móveis 1º andar
  I('cama_casal', 1, 2.0, -4.85, 0);
  I('criado', 1, 0.7, -5.5, 0);
  I('criado', 1, 3.3, -5.5, 0);
  I('abajur', 1, 0.7, -5.5, 0, 0.55);
  I('guarda_roupa', 1, -0.6, -2.2, Math.PI / 2);
  I('quadro', 1, 2.0, -5.9, 0, 1.6);
  I('escrivaninha', 1, -4, -5.4, 0);
  I('cadeira_escritorio', 1, -4, -4.7, Math.PI);
  I('computador', 1, -4, -5.4, 0, 0.75);
  I('estante', 1, -6.7, -3, Math.PI / 2);
  I('poltrona', 1, -2.0, 0.3, Math.PI);
  I('espreguicadeira', 1, -4.5, 2.2, Math.PI);

  // ---------- Área externa
  F(0, [{ x: -8, y: -13.5 }, { x: 4, y: -13.5 }, { x: 4, y: -6.1 }, { x: -8, y: -6.1 }], 'deck', '#9b6a42', 0.1, 0.15);
  I('piscina_ret', 0, -2, -10.2, 0, 0.1);
  I('espreguicadeira', 0, 2.8, -9.5, 0, 0.1);
  I('espreguicadeira', 0, 2.8, -11.8, 0, 0.1);
  I('ombrelone', 0, 3.2, -13, 0, 0.1);
  F(0, [{ x: 6, y: 1 }, { x: 9.5, y: 1 }, { x: 9.5, y: 15 }, { x: 6, y: 15 }], 'concreto', '#9a9a96', 0.03, 0.1);
  I('carro', 0, 7.75, 6, 0, 0.03, '#b5523b');
  I('arvore', 0, -8, 10);
  I('arvore', 0, 7.5, -11);
  I('palmeira', 0, -8.5, -3);
  I('arbusto', 0, -5, 7.5);
  I('arbusto', 0, -3.5, 7.8);
  I('canteiro', 0, 2.5, 7.5, 0);
  I('poste_jardim', 0, -1, 9);
  I('poste_jardim', 0, 4.5, 9);
  for (let y = 5.5; y <= 14.5; y += 1) I('caminho', 0, -1, y + 0.2);
  for (let x = -9; x <= 4; x += 2) if (x !== -1) I('cerca', 0, x, 14.9, 0);
  I('portao', 0, 7.75, 14.9, 0);
  p.levels = 2;
  return p;
}
