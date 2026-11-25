import { describe, it, expect } from 'vitest';
import { arcOf, wallPath, wallLength, projectOnPath, polygonArea, pointInPolygon, stairFootprint, snapAngle } from '../src/model/geometry';
import { createProject, LOT_PRESETS, computeCost, balance, openingFits, serializeProject, deserializeProject, customLot, START_FUNDS } from '../src/model/project';
import { History } from '../src/core/history';
import { CATALOG, CATEGORIES } from '../src/model/catalog';
import { sampleHouse } from '../src/model/sample';
import type { Wall } from '../src/model/types';

const wall = (over: Partial<Wall> = {}): Wall => ({
  id: 'w1', level: 0, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, bulge: 0, height: 3, thickness: 0.15, kind: 'parede', material: 'pintura', color: '#fff', ...over,
});

describe('geometria de paredes', () => {
  it('parede reta tem 2 pontos e comprimento da corda', () => {
    const w = wall();
    expect(wallPath(w)).toHaveLength(2);
    expect(wallLength(w)).toBeCloseTo(4);
  });

  it('semicírculo: flecha = metade da corda produz arco de comprimento π·r', () => {
    const w = wall({ bulge: 2 });
    const arc = arcOf(w.a, w.b, w.bulge)!;
    expect(arc.radius).toBeCloseTo(2);
    expect(wallLength(w)).toBeCloseTo(Math.PI * 2, 2);
    const pts = wallPath(w);
    expect(pts[0]).toEqual(w.a);
    expect(pts[pts.length - 1]).toEqual(w.b);
    // O ponto médio do arco fica do lado esquerdo (y positivo) a 2 m da corda.
    const mid = pts[Math.floor(pts.length / 2)];
    expect(mid.y).toBeCloseTo(2, 1);
  });

  it('flecha negativa curva para o lado oposto', () => {
    const pts = wallPath(wall({ bulge: -1 }));
    expect(pts[Math.floor(pts.length / 2)].y).toBeLessThan(-0.9);
  });

  it('projeção sobre a parede retorna distância ao longo', () => {
    const r = projectOnPath(wallPath(wall()), { x: 1.5, y: 0.3 });
    expect(r.s).toBeCloseTo(1.5);
    expect(r.d).toBeCloseTo(0.3);
  });

  it('ângulo é encaixado em múltiplos de 15°', () => {
    const p = snapAngle({ x: 0, y: 0 }, { x: 10, y: 0.4 }, 15);
    expect(p.y).toBeCloseTo(0);
  });
});

describe('polígonos', () => {
  const sq = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 3 }, { x: 0, y: 3 }];
  it('área e ponto interno', () => {
    expect(Math.abs(polygonArea(sq))).toBeCloseTo(6);
    expect(pointInPolygon({ x: 1, y: 1 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 3, y: 1 }, sq)).toBe(false);
  });
});

describe('projeto e economia', () => {
  it('modo simulação desconta o terreno do capital', () => {
    const p = createProject('t', 'simulacao', LOT_PRESETS[0]);
    expect(p.funds).toBe(START_FUNDS - LOT_PRESETS[0].price);
    expect(balance(p)).toBe(p.funds);
    p.walls.push(wall());
    expect(computeCost(p).walls).toBeGreaterThan(0);
    expect(balance(p)).toBeLessThan(p.funds);
  });

  it('modo criativo tem saldo infinito e sobrevive à serialização', () => {
    const p = createProject('t', 'criativo', LOT_PRESETS[1]);
    expect(balance(p)).toBe(Infinity);
    const back = deserializeProject(serializeProject(p));
    expect(back.funds).toBe(Infinity);
    expect(back.lot.w).toBe(20);
  });

  it('terreno personalizado é limitado e precificado por área', () => {
    const l = customLot(200, 3);
    expect(l.w).toBe(80);
    expect(l.d).toBe(8);
    expect(l.price).toBeGreaterThan(0);
  });

  it('aberturas não podem se sobrepor nem sair da parede', () => {
    const p = createProject('t', 'criativo', LOT_PRESETS[0]);
    const w = wall();
    p.walls.push(w);
    const o = { id: 'o1', wallId: 'w1', kind: 'porta' as const, t: 1, width: 0.9, height: 2.1, sill: 0, flip: false, color: '#fff' };
    expect(openingFits(p, w, o)).toBe(true);
    p.openings.push(o);
    expect(openingFits(p, w, { ...o, id: 'o2', t: 1.5 })).toBe(false);
    expect(openingFits(p, w, { ...o, id: 'o2', t: 3 })).toBe(true);
    expect(openingFits(p, w, { ...o, id: 'o2', t: 3.9 })).toBe(false);
    expect(openingFits(p, w, { ...o, id: 'o2', t: 3, height: 3.5 })).toBe(false);
  });

  it('importação descarta aberturas órfãs e objetos desconhecidos', () => {
    const p = createProject('t', 'criativo', LOT_PRESETS[0]);
    const raw = JSON.parse(serializeProject(p));
    raw.openings = [{ id: 'x', wallId: 'nao-existe' }];
    raw.items = [{ id: 'i', catalogId: 'inexistente' }];
    const back = deserializeProject(JSON.stringify(raw));
    expect(back.openings).toHaveLength(0);
    expect(back.items).toHaveLength(0);
    expect(() => deserializeProject('{"foo":1}')).toThrow();
  });

  it('escada reta ocupa ~4,8 m para pé-direito de 3 m', () => {
    const fp = stairFootprint({ id: 's', level: 0, kind: 'reta', pos: { x: 0, y: 0 }, rot: 0, width: 1, material: 'madeira', color: '#fff' }, 3);
    expect(Math.abs(polygonArea(fp))).toBeCloseTo(17 * 0.28, 1);
  });
});

describe('histórico', () => {
  it('desfaz e refaz na ordem correta', () => {
    const h = new History();
    h.push('A');
    h.push('B');
    expect(h.undo('C')).toBe('B');
    expect(h.undo('B')).toBe('A');
    expect(h.undo('A')).toBeNull();
    expect(h.redo('A')).toBe('B');
    h.push('X');
    expect(h.canRedo).toBe(false);
  });
});

describe('catálogo e casa modelo', () => {
  it('todos os objetos pertencem a uma categoria válida e têm dimensões', () => {
    const cats = new Set(CATEGORIES.map((c) => c.id));
    for (const c of CATALOG) {
      expect(cats.has(c.category)).toBe(true);
      expect(c.w * c.d * c.h).toBeGreaterThan(0);
    }
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(CATALOG.length);
  });

  it('casa modelo é válida: aberturas cabem e tudo está dentro do lote', () => {
    const p = sampleHouse();
    for (const o of p.openings) {
      const w = p.walls.find((x) => x.id === o.wallId)!;
      expect(openingFits(p, w, o), `${o.kind} em parede ${w.a.x},${w.a.y}`).toBe(true);
    }
    const inLot = (pt: { x: number; y: number }) => Math.abs(pt.x) <= p.lot.w / 2 && Math.abs(pt.y) <= p.lot.d / 2;
    expect(p.walls.every((w) => inLot(w.a) && inLot(w.b))).toBe(true);
    expect(p.items.every((i) => inLot(i.pos))).toBe(true);
  });
});
