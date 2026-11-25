import { describe, it, expect } from 'vitest';
import { createCity, expandCity, lotStructure, lotBuildValue, VENUES, structureOf } from '../src/model/city';
import { genHouse, genVenue, type VenueKind } from '../src/model/gen';
import { createProject, LOT_PRESETS, openingFits, balance, netWorth, computeCost, ownedConstruction } from '../src/model/project';
import { NavGrid } from '../src/sim/nav';
import { spotsFor, spotWorld } from '../src/sim/interactions';
import type { Project } from '../src/model/types';

const asProject = (w: number, d: number, s: ReturnType<typeof genHouse>): Project => ({
  ...createProject('t', 'criativo', { id: 'x', name: 'x', w, d, price: 0, neighborhood: '' }), ...s,
});

describe('geradores', () => {
  it('casas geradas são válidas e acessíveis pela porta da frente', () => {
    for (const [w, d, theme] of [[15, 20, 'popular'], [20, 30, 'medio'], [30, 40, 'condominio'], [64, 64, 'nobre']] as const) {
      for (let seed = 1; seed <= 4; seed++) {
        const s = genHouse(w, d, seed * 97, theme);
        const p = asProject(w, d, s);
        for (const o of s.openings) expect(openingFits(p, s.walls.find((x) => x.id === o.wallId)!, o), `${theme} ${seed} ${o.kind}`).toBe(true);
        for (const it of s.items) expect(Math.abs(it.pos.x) <= w / 2 && Math.abs(it.pos.y) <= d / 2, `${it.catalogId}`).toBe(true);
        // Da calçada até a cama.
        const nav = new NavGrid(p);
        const bed = s.items.find((i) => i.catalogId.startsWith('cama'))!;
        const sp = spotsFor(bed.catalogId, 'lie')[0];
        const ap = spotWorld(bed, sp).approach;
        expect(nav.findPath(0, { x: 0, y: d / 2 + 1.6 }, 0, ap), `rota até a cama (${theme} ${seed})`).not.toBeNull();
      }
    }
  });

  it('estabelecimentos têm o objeto principal alcançável e postos de funcionários', () => {
    const main: Partial<Record<VenueKind, string>> = { mercado: 'prateleira_mercado', restaurante: 'mesa_restaurante', cinema: 'tela_cinema', loja: 'arara_roupas', escritorio: 'estacao_trabalho', academia: 'aparelho_musculacao', escola: 'lousa', hospital: 'maca', parque: 'toalha_piquenique', galeria: 'quadro', praca: 'banco_jardim' };
    for (const k of Object.keys(VENUES) as VenueKind[]) {
      const v = VENUES[k];
      const { s, staff } = genVenue(k, v.w, v.d, 1234);
      expect(staff.length, k).toBeGreaterThanOrEqual(v.staff);
      const p = asProject(v.w, v.d, s);
      for (const o of s.openings) expect(openingFits(p, s.walls.find((x) => x.id === o.wallId)!, o), `${k} ${o.kind}`).toBe(true);
      const target = s.items.find((i) => i.catalogId === main[k]);
      expect(target, k).toBeTruthy();
      const nav = new NavGrid(p);
      const goal = nav.nearestWalkable(0, target!.pos, 3);
      expect(goal, `${k}: área livre perto de ${main[k]}`).not.toBeNull();
      expect(nav.findPath(0, { x: 0, y: v.d / 2 + 1.6 }, 0, goal!), `${k}: rota da calçada`).not.toBeNull();
    }
  });
});

describe('cidade e imóveis', () => {
  it('cria bairros, estabelecimentos e insere a casa do jogador', () => {
    const p = createProject('t', 'simulacao', LOT_PRESETS[1]);
    const c = createCity(p);
    expect(c.hoods.length).toBeGreaterThanOrEqual(6);
    const kinds = new Set(c.lots.map((l) => l.kind));
    for (const k of ['mercado', 'restaurante', 'cinema', 'escola', 'hospital', 'academia', 'parque', 'escritorio', 'loja']) expect(kinds.has(k as any), k).toBe(true);
    const home = c.lots.find((l) => l.id === c.homeLotId)!;
    expect(home.owner).toBe('jogador');
    expect(c.hoods.find((h) => h.id === home.hood)!.name).toBe(LOT_PRESETS[1].neighborhood);
    // Lotes não se sobrepõem.
    for (const a of c.lots) for (const b of c.lots) {
      if (a === b) continue;
      const ov = Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 0.01 && Math.abs(a.y - b.y) < (a.d + b.d) / 2 - 0.01;
      expect(ov, `${a.address} × ${b.address}`).toBe(false);
    }
    const n = c.hoods.length;
    expandCity(c);
    expect(c.hoods.length).toBe(n + 1);
    expect(c.lots.some((l) => l.hood === c.hoods[n].id && (l.owner === 'venda' || l.owner === 'vazio' || l.owner === 'npc'))).toBe(true);
  });

  it('estrutura de casas da cidade é determinística', () => {
    const p = createProject('t', 'simulacao', LOT_PRESETS[0]);
    const c = createCity(p);
    const l = c.lots.find((x) => x.owner === 'npc')!;
    const a = lotStructure(c, l).s, b = lotStructure(c, l).s;
    expect(a.items.map((i) => i.catalogId + i.pos.x)).toEqual(b.items.map((i) => i.catalogId + i.pos.x));
  });

  it('saldo considera apenas as obras dos imóveis do jogador', () => {
    const p = createProject('t', 'simulacao', LOT_PRESETS[0]);
    p.city = createCity(p);
    const c = p.city;
    p.walls.push({ id: 'w', level: 0, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, bulge: 0, height: 3, thickness: 0.15, kind: 'parede', material: 'pintura', color: '#fff' });
    const atHome = balance(p);
    expect(atHome).toBeCloseTo(p.funds - computeCost(p).total, 0);
    // Muda para um estabelecimento: a construção dele não pesa no saldo.
    const home = c.lots.find((l) => l.id === c.homeLotId)!;
    home.structure = JSON.stringify(structureOf(p));
    home.cost = computeCost(p).total;
    const venue = c.lots.find((l) => l.kind === 'mercado')!;
    c.currentLotId = venue.id;
    Object.assign(p, lotStructure(c, venue).s);
    expect(balance(p)).toBeCloseTo(atHome, 0);
    expect(ownedConstruction(p)).toBeCloseTo(home.cost, 0);
    // Casa comprada pronta: o valor da obra já pago não é descontado de novo.
    const forSale = c.lots.find((l) => l.owner === 'venda')!;
    const build = lotBuildValue(c, forSale);
    forSale.owner = 'jogador'; forSale.base = build; forSale.cost = build;
    expect(balance(p)).toBeCloseTo(atHome, 0);
    expect(netWorth(p)).toBeGreaterThan(netWorth({ ...p, city: { ...c, lots: c.lots.filter((l) => l !== forSale) } }));
  });
});
