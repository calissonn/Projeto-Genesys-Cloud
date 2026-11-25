import type { Simulation } from './simulation';
import type { CityState, CityLot } from '../model/city';
import { createCity, lotInfo, lotStructure, lotBuildValue, structureOf, expandCity, VENUES } from '../model/city';
import type { Bill, WeatherKind, Sim } from '../model/life';
import { dayOf, hourOf, WEATHER } from '../model/life';
import { computeCost, balance, netWorth, fmtMoney, uid } from '../model/project';
import { pointInPolygon, roofFootprint } from '../model/geometry';
import type { P } from '../model/types';
import { CATALOG_BY_ID } from '../model/catalog';
import type { StaffSpot } from '../model/gen';

const WATER_ITEMS = new Set(['chuveiro', 'banheira', 'pia_banheiro', 'pia_cozinha', 'vaso', 'tanque', 'lavadora']);
const POOLS = new Set(['piscina_ret', 'piscina_redonda', 'ofuro']);
const POWER_CATS = new Set(['eletronicos', 'eletro', 'iluminacao']);

/** Mundo além do terreno: cidade, viagens, imóveis, contas e clima. */
export class CityLife {
  private wasCut = { energia: false, agua: false };
  private rainAcc = 0;

  constructor(private sim: Simulation) {}

  get project() { return this.sim.editor.project; }

  /** Cria a cidade na primeira vez (jogos antigos também ganham uma). */
  ensure(): CityState {
    const p = this.project;
    if (!p.city) {
      p.city = createCity(p);
      p.lot = lotInfo(p.city, p.city.lots.find((l) => l.id === p.city!.homeLotId)!);
    }
    return p.city;
  }

  get city(): CityState { return this.ensure(); }
  lot(id: string): CityLot | undefined { return this.city.lots.find((l) => l.id === id); }
  get current(): CityLot { return this.lot(this.city.currentLotId)!; }
  get home(): CityLot { return this.lot(this.city.homeLotId)!; }
  get atHome(): boolean { return this.city.currentLotId === this.city.homeLotId; }
  hoodName(l: CityLot) { return this.city.hoods.find((h) => h.id === l.hood)?.name ?? ''; }

  /* ------------------------------------------------------------ Clima */

  get weather(): WeatherKind { return this.sim.life.weather?.kind ?? 'sol'; }

  temperature(): number {
    const h = hourOf(this.sim.now);
    const base = 22 + 6 * Math.sin(((h - 9) / 24) * Math.PI * 2);
    const off = { sol: 2, nublado: -1, chuva: -4, tempestade: -5 }[this.weather];
    const day = dayOf(this.sim.now);
    return Math.round(base + off + ((day * 37) % 5) - 2);
  }

  isIndoors(level: number, p: P): boolean {
    const pr = this.project;
    if (pr.floors.some((f) => f.level === level + 1 && pointInPolygon(p, f.points))) return true;
    return pr.roofs.some((r) => r.level >= level && pointInPolygon(p, roofFootprint(r)));
  }

  private nextWeather(cur: WeatherKind): WeatherKind {
    const table: Record<WeatherKind, [WeatherKind, number][]> = {
      sol: [['sol', 0.6], ['nublado', 0.3], ['chuva', 0.1]],
      nublado: [['sol', 0.35], ['nublado', 0.3], ['chuva', 0.3], ['tempestade', 0.05]],
      chuva: [['nublado', 0.45], ['chuva', 0.3], ['tempestade', 0.1], ['sol', 0.15]],
      tempestade: [['chuva', 0.7], ['nublado', 0.3]],
    };
    let x = Math.random();
    for (const [k, pr] of table[cur]) { if ((x -= pr) <= 0) return k; }
    return 'sol';
  }

  /** Avança clima, cortes por contas atrasadas e efeitos da chuva. */
  tick(dt: number) {
    const life = this.sim.life;
    const now = this.sim.now;
    if (!life.weather) life.weather = { kind: 'sol', until: 0 };
    if (now >= life.weather.until) {
      const prev = life.weather.kind;
      life.weather = { kind: life.weather.until === 0 ? 'sol' : this.nextWeather(prev), until: now + 120 + Math.random() * 300 };
      if (life.weather.kind !== prev) {
        this.sim.emit('weather', life.weather.kind);
        if (life.weather.kind === 'chuva' || life.weather.kind === 'tempestade') this.sim.log(`${WEATHER[life.weather.kind].icon} Começou a ${life.weather.kind === 'chuva' ? 'chover' : 'cair uma tempestade'}.`, false);
      }
    }
    if (life.weather.kind === 'tempestade' && Math.random() < dt / 25) this.sim.emit('flash', null);
    // Personagens ao ar livre na chuva ficam molhados.
    this.rainAcc += dt;
    if (this.rainAcc > 10) {
      this.rainAcc = 0;
      if (life.weather.kind === 'chuva' || life.weather.kind === 'tempestade') {
        for (const a of this.sim.agents.values()) {
          if (!a.visible || a.sim.visitor || a.staff || a.posture !== 'stand') continue;
          if (a.queue[0]?.def?.anim === 'swim') continue;
          if (!this.isIndoors(a.sim.level, a.sim.pos)) {
            this.sim.addMoodlet(a.sim, 'chuva', 'Molhado(a) de chuva', -7, 2);
            a.sim.needs.conforto = Math.max(0, a.sim.needs.conforto - 3);
          }
        }
      }
    }
    // Cortes de energia/água por contas vencidas (apenas na casa).
    for (const k of ['energia', 'agua'] as const) {
      const cut = this.isCut(k);
      if (cut !== this.wasCut[k]) {
        this.wasCut[k] = cut;
        if (cut) this.sim.log(k === 'energia' ? '⚡ A energia foi cortada por falta de pagamento!' : '🚱 A água foi cortada por falta de pagamento!');
        else this.sim.log(k === 'energia' ? '⚡ Energia religada.' : '🚰 Água religada.');
        this.sim.editor.world.powerOff = this.isCut('energia') && this.atHome;
        this.sim.editor.rebuild();
      }
    }
  }

  isCut(kind: 'energia' | 'agua'): boolean {
    if (this.project.mode === 'criativo') return false;
    return this.sim.life.bills.some((b) => b.kind === kind && !b.paid && this.sim.now > b.due);
  }

  /** Motivo de bloqueio por falta de energia/água (somente em casa). */
  utilityBlock(power?: boolean, water?: boolean): string | null {
    if (!this.atHome) return null;
    if (power && this.isCut('energia')) return 'Sem energia: pague a conta de luz';
    if (water && this.isCut('agua')) return 'Sem água: pague a conta de água';
    return null;
  }

  /* ------------------------------------------------------------ Contas e patrimônio */

  newDay() {
    const life = this.sim.life;
    const p = this.project;
    const day = dayOf(this.sim.now);
    life.history.push({ day, saldo: Number.isFinite(balance(p)) ? Math.round(balance(p)) : 0, patrimonio: Number.isFinite(netWorth(p)) ? Math.round(netWorth(p)) : 0 });
    if (life.history.length > 90) life.history.shift();
    if (p.mode !== 'simulacao' || day % 7 !== 0 || day === 0) return;
    const bills = this.computeBills();
    for (const b of bills) life.bills.push(b);
    life.bills = life.bills.filter((b) => !b.paid || this.sim.now - b.due < 7 * 1440);
    const total = bills.reduce((a, b) => a + b.amount, 0);
    this.sim.log(`📬 Chegaram as contas da semana: ${fmtMoney(total)}. Vencimento em 3 dias.`);
    if (life.autopay) this.payAll(true);
  }

  computeBills(): Bill[] {
    const c = this.city;
    const home = this.home;
    const s = this.atHome ? structureOf(this.project) : lotStructure(c, home).s;
    const residents = this.sim.household.length;
    let water = 30 + 16 * residents, power = 45 + 14 * residents;
    for (const it of s.items) {
      const def = CATALOG_BY_ID.get(it.catalogId);
      if (!def) continue;
      if (WATER_ITEMS.has(it.catalogId)) water += 6;
      if (POOLS.has(it.catalogId)) { water += 40; power += 45; }
      if (POWER_CATS.has(def.category)) power += 6;
      if (it.catalogId === 'elevador') power += 30;
    }
    let value = 0;
    for (const l of c.lots) if (l.owner === 'jogador') value += l.price + (l.id === c.currentLotId ? computeCost(this.project).total : l.cost ?? 0);
    const due = this.sim.now + 3 * 1440;
    const mk = (kind: Bill['kind'], name: string, amount: number): Bill => ({ id: uid('bill'), kind, name, amount: Math.round(amount), due, paid: false });
    return [mk('agua', 'Água e esgoto', water), mk('energia', 'Energia elétrica', power), mk('iptu', 'IPTU (semanal)', value * 0.0006), mk('internet', 'Internet e gás', 32)];
  }

  pay(id: string): boolean {
    const b = this.sim.life.bills.find((x) => x.id === id);
    if (!b || b.paid) return false;
    if (!this.sim.spend(b.amount, `a conta de ${b.name.toLowerCase()}`, 'contas')) return false;
    b.paid = true;
    this.tick(0);
    this.sim.emit('update', null);
    return true;
  }

  payAll(silent = false): number {
    let n = 0;
    for (const b of this.sim.life.bills) if (!b.paid && this.pay(b.id)) n++;
    if (n && !silent) this.sim.emit('toast', `${n} conta(s) paga(s).`);
    return n;
  }

  /* ------------------------------------------------------------ Imóveis */

  /** Preço de compra (terreno + casa, se houver). */
  askingPrice(l: CityLot): number {
    return l.price + (l.owner === 'venda' ? lotBuildValue(this.city, l) : 0);
  }

  /** Valor de venda: 90% do valor de mercado. */
  saleValue(l: CityLot): number {
    const cost = l.id === this.city.currentLotId ? computeCost(this.project).total : l.cost ?? lotBuildValue(this.city, l);
    return Math.round(0.9 * (l.price + cost));
  }

  buy(lotId: string): boolean {
    const l = this.lot(lotId);
    if (!l || (l.owner !== 'venda' && l.owner !== 'vazio')) return false;
    const build = l.owner === 'venda' ? lotBuildValue(this.city, l) : 0;
    if (l.owner === 'venda' && !l.structure) l.structure = JSON.stringify(lotStructure(this.city, l).s);
    if (!this.sim.spend(l.price + build, 'a compra do imóvel', 'imoveis', `Compra: ${l.address}`)) return false;
    l.owner = 'jogador';
    l.base = build;
    l.cost = build;
    l.title = build ? 'Sua casa (comprada)' : 'Seu terreno';
    this.sim.log(`🔑 Imóvel comprado: ${l.address} (${this.hoodName(l)}).`);
    this.sim.editor.saveNow();
    return true;
  }

  sell(lotId: string): boolean {
    const c = this.city;
    const l = this.lot(lotId);
    if (!l || l.owner !== 'jogador') return false;
    if (l.id === c.homeLotId) { this.sim.emit('toast', 'Mude-se para outro imóvel antes de vender a sua casa.'); return false; }
    if (l.id === c.currentLotId) { this.sim.emit('toast', 'Saia do terreno antes de vendê-lo.'); return false; }
    const cost = l.cost ?? 0;
    const proceeds = this.saleValue(l);
    // O custo da obra deixa de ser descontado do saldo; ajusta o caixa para refletir a venda.
    this.sim.earn(proceeds - (cost - (l.base ?? 0)), 'imoveis', `Venda: ${l.address}`);
    l.owner = 'venda';
    l.base = 0;
    l.title = l.structure && JSON.parse(l.structure).walls.length ? 'Casa à venda' : 'Terreno à venda';
    if (!l.structure || !JSON.parse(l.structure).walls.length) { l.owner = 'vazio'; l.structure = undefined; l.cost = 0; }
    this.sim.log(`💰 Imóvel vendido por ${fmtMoney(proceeds)}: ${l.address}.`);
    this.sim.editor.saveNow();
    return true;
  }

  moveHome(lotId: string): boolean {
    const l = this.lot(lotId);
    if (!l || l.owner !== 'jogador') return false;
    const old = this.home;
    old.title = old.title === 'Sua casa' ? 'Seu imóvel' : old.title;
    this.city.homeLotId = l.id;
    l.title = 'Sua casa';
    this.sim.log(`🏡 A família ${this.sim.life.householdName} se mudou para ${l.address}, ${this.hoodName(l)}.`);
    if (this.city.currentLotId !== l.id) this.travel(l.id, true);
    return true;
  }

  expand() {
    const h = expandCity(this.city);
    this.sim.log(`🏗 Novo bairro aberto: ${h.name}! Há terrenos e casas à venda.`);
    this.sim.editor.saveNow();
    return h;
  }

  /* ------------------------------------------------------------ Viagens */

  hasCar(): boolean {
    const home = this.home;
    const s = this.atHome ? structureOf(this.project) : lotStructure(this.city, home).s;
    return s.items.some((i) => i.catalogId === 'carro');
  }

  /** Leva a família presente (e a câmera) para outro terreno. */
  travel(lotId: string, free = false): boolean {
    const c = this.city;
    const sim = this.sim;
    const target = this.lot(lotId);
    if (!target || lotId === c.currentLotId) return false;
    const present = sim.household.filter((s) => !s.away);
    if (present.length && !free) {
      const car = this.hasCar();
      const fare = car ? 9 : 5 * present.length;
      if (!sim.spend(fare, car ? 'a gasolina' : 'as passagens', 'transporte', car ? 'Gasolina' : 'Ônibus')) return false;
    }
    // Salva o terreno atual, se for do jogador.
    const cur = this.current;
    if (cur.owner === 'jogador') {
      cur.structure = JSON.stringify(structureOf(this.project));
      cur.cost = computeCost(this.project).total;
    }
    // Quem não é da família fica para trás.
    for (const s of [...sim.life.sims]) if (s.visitor) sim.despawn(s.id, !s.townie);
    sim.life.partyUntil = undefined;
    c.currentLotId = target.id;
    const { s, staff } = lotStructure(c, target);
    sim.editor.world.powerOff = false;
    sim.editor.swapStructure(lotInfo(c, target), s);
    sim.resetNav();
    for (const m of present) sim.arrive(m);
    this.populate(target, staff);
    sim.life.clock.minutes += 20;
    const where = target.kind === 'residencial'
      ? target.owner === 'jogador' ? (target.id === c.homeLotId ? 'em casa' : 'ao seu imóvel') : target.owner === 'npc' ? `à casa da ${target.title.toLowerCase()}` : 'à casa à venda'
      : `a ${target.title}`;
    sim.log(`🚌 ${present.length ? `A família chegou ${where}` : `Você foi ${where}`} (${this.hoodName(target)}).`);
    sim.emit('travel', target.id);
    sim.emit('roster', null);
    sim.editor.saveNow();
    return true;
  }

  /** Moradores, funcionários e frequentadores do lugar. */
  private populate(l: CityLot, staffSpots: StaffSpot[]) {
    const sim = this.sim;
    const c = this.city;
    const byId = new Map(c.townies.map((t) => [t.id, t]));
    const used = new Set<string>();
    const far = sim.now + 30 * 1440;
    const bring = (t: Sim, leaveAt: number) => {
      used.add(t.id);
      t.visitor = true;
      t.leaveAt = leaveAt;
      t.away = null;
      sim.life.sims.push(t);
      return sim.addAgent(t);
    };
    for (const id of l.residents ?? []) {
      const t = byId.get(id);
      if (!t) continue;
      const a = bring(t, far);
      if (t.age === 'bebe') sim.placeBaby(a, false);
      else sim.spawn(t, sim.frontYard());
    }
    (l.staff ?? []).forEach((id, i) => {
      const t = byId.get(id);
      const sp = staffSpots[i];
      if (!t || !sp) return;
      const a = bring(t, far);
      t.level = 0;
      t.pos = { x: sp.x, y: sp.y };
      t.rot = sp.rot;
      a.y = sim.groundY(0, t.pos);
      a.staff = { pos: { x: sp.x, y: sp.y }, rot: sp.rot, anim: sp.anim };
    });
    if (l.kind !== 'residencial') {
      const [lo, hi] = VENUES[l.kind].patrons;
      const n = lo + Math.floor(Math.random() * (hi - lo + 1));
      const hour = hourOf(sim.now);
      const open = hour >= 7 && hour < 23;
      const pool = c.townies.filter((t) => !used.has(t.id) && !c.lots.some((x) => x.staff?.includes(t.id)) && t.age !== 'bebe');
      for (let i = 0; i < (open ? n : Math.min(1, n)) && pool.length; i++) {
        const t = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        bring(t, sim.now + 90 + Math.random() * 240);
        sim.spawn(t, sim.exitPoint());
      }
    }
  }

  /** Ao carregar um jogo salvo fora de casa, recoloca os funcionários nos postos. */
  restoreStaff() {
    const l = this.current;
    if (!l || l.kind === 'residencial' || !l.staff) return;
    const spots = lotStructure(this.city, l).staff;
    l.staff.forEach((id, i) => {
      const a = this.sim.agents.get(id);
      const sp = spots[i];
      if (a && sp) a.staff = { pos: { x: sp.x, y: sp.y }, rot: sp.rot, anim: sp.anim };
    });
  }

  /** Visitante da cidade foi morar com a família. */
  adopt(id: string) {
    const c = this.city;
    c.townies = c.townies.filter((t) => t.id !== id);
    for (const l of c.lots) {
      if (l.residents) l.residents = l.residents.filter((x) => x !== id);
      if (l.staff) l.staff = l.staff.filter((x) => x !== id);
    }
  }

  /** Visitante para convidar: prefere conhecidos da cidade. */
  pickTownie(): Sim | null {
    const c = this.city;
    const present = new Set(this.sim.life.sims.map((s) => s.id));
    const pool = c.townies.filter((t) => !present.has(t.id) && t.age !== 'bebe' && !c.lots.some((l) => l.staff?.includes(t.id)));
    if (!pool.length) return null;
    const known = pool.filter((t) => this.sim.household.some((h) => this.sim.rel(h.id, t.id)));
    const list = known.length && Math.random() < 0.6 ? known : pool;
    return list[Math.floor(Math.random() * list.length)];
  }
}
