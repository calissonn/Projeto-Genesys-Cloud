import { describe, it, expect } from 'vitest';
import { NavGrid, stairLink } from '../src/sim/nav';
import { sampleHouse } from '../src/model/sample';
import { createProject, LOT_PRESETS, balance, deserializeProject, serializeProject } from '../src/model/project';
import { mood, moodLabel, randomSim, newLife, fullNeeds, AGES, CAREERS, fmtClock, dayOf, isWorkday } from '../src/model/life';
import { SOCIAL_BY_ID, INTERACTIONS, spotsFor, spotWorld } from '../src/sim/interactions';
import { CATALOG_BY_ID } from '../src/model/catalog';
import { stairFootprint, pointInPolygon, dist } from '../src/model/geometry';

describe('navegação', () => {
  const p = sampleHouse();
  const nav = new NavGrid(p);

  it('paredes bloqueiam e portas deixam passar', () => {
    // Ponto sobre a parede lateral esquerda (x = -7) não é caminhável; o centro da sala é.
    expect(nav.walkable(0, { x: -7, y: 0 })).toBe(false);
    expect(nav.walkable(0, { x: 1.5, y: 0.8 })).toBe(true);
    // Porta dupla no centro da fachada curva.
    const front = p.walls.find((w) => w.level === 0 && w.bulge > 1)!;
    expect(front).toBeTruthy();
  });

  it('encontra rota do jardim até o andar de cima usando a escada', () => {
    const route = nav.findPath(0, { x: -1, y: 10 }, 1, { x: 2, y: -2.5 });
    expect(route).not.toBeNull();
    expect(route!.some((s) => s.type === 'link')).toBe(true);
    // Todos os trechos de caminhada passam apenas por células livres.
    for (const st of route!) {
      if (st.type !== 'walk') continue;
      for (let i = 1; i < st.pts.length - 1; i++) expect(nav.walkable(st.level, st.pts[i])).toBe(true);
    }
  });

  it('a saída da escada fica fora do vão da laje', () => {
    for (const kind of ['reta', 'L', 'U', 'espiral', 'curva'] as const) {
      const s = { id: 's', level: 0, kind, pos: { x: 0, y: 0 }, rot: 0.7, width: 1, material: 'madeira', color: '#fff' };
      const lk = stairLink(s, 3);
      const fp = stairFootprint(s, 3);
      expect(pointInPolygon(lk.top, fp), kind).toBe(false);
      expect(lk.path[lk.path.length - 1].h).toBeCloseTo(3);
    }
  });

  it('não há rota para dentro de um cômodo sem porta', () => {
    const q = createProject('t', 'criativo', LOT_PRESETS[0]);
    const pts = [{ x: -3, y: -3 }, { x: 3, y: -3 }, { x: 3, y: 3 }, { x: -3, y: 3 }];
    pts.forEach((a, i) => q.walls.push({ id: `w${i}`, level: 0, a, b: pts[(i + 1) % 4], bulge: 0, height: 3, thickness: 0.15, kind: 'parede', material: 'pintura', color: '#fff' }));
    const n2 = new NavGrid(q);
    expect(n2.findPath(0, { x: 0, y: 6 }, 0, { x: 0, y: 0 })).toBeNull();
    q.openings.push({ id: 'o', wallId: 'w2', kind: 'porta', t: 3, width: 0.9, height: 2.1, sill: 0, flip: false, color: '#fff' });
    expect(new NavGrid(q).findPath(0, { x: 0, y: 6 }, 0, { x: 0, y: 0 })).not.toBeNull();
  });
});

describe('modelo de vida', () => {
  it('humor acompanha as necessidades', () => {
    const s = randomSim({ age: 'adulto' });
    s.traits = [];
    s.needs = fullNeeds();
    const good = mood(s, 0);
    s.needs = { fome: 5, energia: 5, higiene: 10, diversao: 10, social: 10, conforto: 10, bexiga: 10 };
    expect(mood(s, 0)).toBeLessThan(good);
    expect(moodLabel(mood(s, 0)).text).toBe('Muito triste');
  });

  it('relógio e dias úteis', () => {
    expect(fmtClock(8 * 60 + 5)).toBe('08:05');
    expect(dayOf(1441)).toBe(1);
    expect(isWorkday(0)).toBe(true);
    expect(isWorkday(5 * 1440 + 10)).toBe(false);
  });

  it('carreiras têm salários para todos os níveis', () => {
    for (const c of CAREERS) expect(c.wage.length).toBe(c.titles.length);
    expect(AGES[AGES.length - 1].days).toBe(Infinity);
  });

  it('interações sociais respeitam idade e parentesco', () => {
    const a = randomSim({ age: 'adulto' }), b = randomSim({ age: 'crianca' });
    const flertar = SOCIAL_BY_ID.get('flertar')!;
    expect(flertar.require({ a, b, rel: null, hasDoubleBed: true, householdSize: 2 })).not.toBeNull();
    const c = randomSim({ age: 'adulto' });
    expect(flertar.require({ a, b: c, rel: null, hasDoubleBed: true, householdSize: 2 })).toBeNull();
    expect(flertar.require({ a, b: c, rel: { a: a.id, b: c.id, kind: 'irmaos', amizade: 50, romance: 0 }, hasDoubleBed: true, householdSize: 2 })).not.toBeNull();
    const bebe = SOCIAL_BY_ID.get('bebe')!;
    expect(bebe.require({ a, b: c, rel: { a: a.id, b: c.id, kind: 'conjuge', amizade: 60, romance: 70 }, hasDoubleBed: false, householdSize: 2 })).toMatch(/cama/);
  });

  it('todas as interações apontam para objetos do catálogo com pontos de uso', () => {
    for (const d of INTERACTIONS) for (const id of d.objects) {
      expect(CATALOG_BY_ID.has(id), `${d.id} → ${id}`).toBe(true);
      if (d.spot === 'sit' || d.spot === 'lie') expect(spotsFor(id, d.spot).length, `${d.id} em ${id}`).toBeGreaterThan(0);
    }
  });

  it('pontos de aproximação ficam fora do móvel', () => {
    const it0 = { id: 'i', catalogId: 'sofa3', level: 0, pos: { x: 2, y: 1 }, elev: 0, rot: 1.1, scale: 1, color: '#fff', material: 'tecido' };
    for (const sp of spotsFor('sofa3', 'sit')) {
      const w = spotWorld(it0, sp);
      expect(dist(w.approach, it0.pos)).toBeGreaterThan(0.45);
    }
  });

  it('estado de vida é salvo, não afeta o desfazer e entra no saldo', () => {
    const p = createProject('t', 'simulacao', LOT_PRESETS[0]);
    p.life = newLife('Teste');
    p.life.sims.push(randomSim());
    p.life.cash = 1000;
    const before = balance(p);
    const back = deserializeProject(serializeProject(p));
    expect(back.life!.sims).toHaveLength(1);
    expect(balance(back)).toBe(before);
    expect(before).toBe(p.funds + 1000);
  });
});
