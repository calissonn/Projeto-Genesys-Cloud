import type { P, Project, Item } from '../model/types';
import type { Sim, Pet, LifeState, Need, Relationship, RelKind, AgeStage } from '../model/life';
import {
  NEED_DECAY, AGES, AGE_BY_ID, CAREER_BY_ID, fullNeeds, mood, newSimId, randomSim, blankSkills, isAdult, canWalk,
  hourOf, dayOf, isWorkday, fullName, newLife, randomAppearance,
} from '../model/life';
import { Emitter } from '../core/events';
import { balance, fmtMoney, uid } from '../model/project';
import { dist, sub, add, norm, lerp } from '../model/geometry';
import { CATALOG_BY_ID } from '../model/catalog';
import type { Anim } from '../render/character';
import { NavGrid, type RouteStep } from './nav';
import {
  INTERACTIONS, INTERACTION_BY_ID, SOCIALS, SOCIAL_BY_ID, PET_ACTIONS, spotsFor, spotWorld,
  type InteractionDef, type SocialDef, type SpotKind,
} from './interactions';
import type { Editor } from '../editor/editor';

export type Speed = 0 | 1 | 2 | 3;
const MIN_PER_SEC: Record<Speed, number> = { 0: 0, 1: 1.5, 2: 5, 3: 18 };
const WALK_M_PER_MIN = 0.95;

type PetAction = (typeof PET_ACTIONS)[number];

export interface Task {
  kind: 'obj' | 'social' | 'pet' | 'go' | 'leave' | 'faint' | 'dance' | 'eatHere' | 'babySleep';
  label: string;
  icon: string;
  player: boolean;
  def?: InteractionDef;
  itemId?: string;
  social?: SocialDef;
  targetSim?: string;
  petAct?: PetAction;
  petId?: string;
  dest?: { level: number; p: P };
  leaveReason?: 'trabalho' | 'escola' | 'visita';
  phase: 'plan' | 'move' | 'enter' | 'act';
  route?: RouteStep[];
  step: number;
  pt: number;
  linkD: number;
  elapsed: number;
  minutes: number;
  replans: number;
  spot?: { pos: P; approach: P; rot: number; y: number; kind: SpotKind; key: string };
  enterFrom?: { p: P; y: number };
  enterT: number;
}

export interface Agent {
  sim: Sim;
  queue: Task[];
  anim: Anim;
  y: number;
  posture: 'stand' | 'sit' | 'lie';
  idleUntil: number;
  engagedUntil: number;
  thought: string | null;
  thoughtUntil: number;
  visible: boolean;
}

export interface PetAgent {
  pet: Pet;
  anim: 'idle' | 'walk' | 'sleep' | 'eat' | 'play';
  y: number;
  route: P[] | null;
  until: number;
}

export interface SimEvents extends Record<string, unknown> {
  toast: string;
  update: null;
  roster: null;
}

const tpl = (t: Partial<Task> & Pick<Task, 'kind' | 'label' | 'icon'>): Task => ({
  player: false, phase: 'plan', step: 0, pt: 0, linkD: 0, elapsed: 0, minutes: 0, replans: 0, enterT: 0, ...t,
});

/** Motor do modo Vida. */
export class Simulation extends Emitter<SimEvents> {
  agents = new Map<string, Agent>();
  pets = new Map<string, PetAgent>();
  speed: Speed = 1;
  private nav: NavGrid | null = null;
  private reserved = new Map<string, string>();
  private lastDay: number;
  private saveAcc = 0;
  private rng = Math.random;
  life: LifeState;

  constructor(public editor: Editor) {
    super();
    const p = editor.project;
    if (!p.life) p.life = newLife(p.name);
    this.life = p.life;
    this.lastDay = dayOf(this.life.clock.minutes);
    for (const s of this.life.sims) this.addAgent(s);
    for (const pet of this.life.pets) this.addPet(pet);
    editor.on('change', () => { this.nav = null; });
  }

  get project(): Project { return this.editor.project; }
  get now(): number { return this.life.clock.minutes; }
  get household(): Sim[] { return this.life.sims.filter((s) => !s.visitor); }

  /** Reconecta ao estado de vida após carregar um projeto. */
  reset() {
    const p = this.editor.project;
    if (!p.life) p.life = newLife(p.name);
    this.life = p.life;
    this.agents.clear();
    this.pets.clear();
    this.reserved.clear();
    this.nav = null;
    this.lastDay = dayOf(this.life.clock.minutes);
    for (const s of this.life.sims) this.addAgent(s);
    for (const pet of this.life.pets) this.addPet(pet);
    this.emit('roster', null);
  }

  navGrid(): NavGrid {
    if (!this.nav) this.nav = new NavGrid(this.project);
    return this.nav;
  }

  base(level: number) { return level * this.project.levelHeight; }
  groundY(level: number, p: P) { return this.base(level) + this.editor.floorTopAt(level, p); }

  addAgent(s: Sim): Agent {
    const a: Agent = { sim: s, queue: [], anim: 'idle', y: 0, posture: 'stand', idleUntil: 0, engagedUntil: 0, thought: null, thoughtUntil: 0, visible: !s.away };
    a.y = this.groundY(s.level, s.pos);
    this.agents.set(s.id, a);
    return a;
  }

  addPet(pet: Pet) {
    this.pets.set(pet.id, { pet, anim: 'idle', y: this.groundY(pet.level, pet.pos), route: null, until: 0 });
  }

  /** Ponto da calçada onde personagens chegam e saem do terreno. */
  exitPoint(): P {
    return { x: 0, y: this.project.lot.d / 2 + 1.6 };
  }

  /** Ponto em frente à casa (perto da fachada voltada para a rua). */
  frontYard(): P {
    const ws = this.project.walls.filter((w) => w.level === 0);
    if (!ws.length) return { x: 0, y: this.project.lot.d / 2 - 3 };
    let maxY = -Infinity, cx = 0;
    for (const w of ws) for (const q of [w.a, w.b, lerp(w.a, w.b, 0.5)]) if (q.y > maxY) { maxY = q.y; cx = q.x; }
    const bulge = Math.max(0, ...ws.map((w) => Math.abs(w.bulge)));
    return { x: cx, y: Math.min(this.project.lot.d / 2 - 0.5, maxY + bulge + 1.6) };
  }

  /** Coloca o personagem em um ponto livre perto da entrada. */
  spawn(s: Sim, near?: P) {
    const nav = this.navGrid();
    const fy = this.frontYard();
    const p = nav.nearestWalkable(0, near ?? { x: fy.x + (this.rng() - 0.5) * 2.5, y: fy.y }, 6) ?? { x: 0, y: this.project.lot.d / 2 };
    s.level = 0;
    s.pos = p;
    const a = this.agents.get(s.id) ?? this.addAgent(s);
    a.y = this.groundY(0, p);
    a.visible = true;
  }

  /* ------------------------------------------------------------ Dinheiro */

  canSpend(v: number): boolean {
    return this.project.mode === 'criativo' || balance(this.project) >= v;
  }

  spend(v: number, what: string): boolean {
    if (this.project.mode === 'criativo') return true;
    if (!this.canSpend(v)) { this.emit('toast', `Saldo insuficiente para ${what} (${fmtMoney(v)}).`); return false; }
    this.life.cash -= v;
    return true;
  }

  earn(v: number) {
    if (this.project.mode === 'simulacao') this.life.cash += v;
  }

  log(text: string, toast = true) {
    this.life.log.push({ t: this.now, text });
    if (this.life.log.length > 60) this.life.log.shift();
    if (toast) this.emit('toast', text);
  }

  /* ------------------------------------------------------------ Relacionamentos */

  rel(a: string, b: string): Relationship | null {
    return this.life.relationships.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a)) ?? null;
  }

  ensureRel(a: string, b: string, kind: RelKind = 'conhecidos'): Relationship {
    let r = this.rel(a, b);
    if (!r) { r = { a, b, kind, amizade: 0, romance: 0 }; this.life.relationships.push(r); }
    return r;
  }

  /** Descrição da relação do ponto de vista de `from`. */
  relLabel(from: string, to: string): string {
    const r = this.rel(from, to);
    if (!r) return 'Desconhecidos';
    if (r.kind === 'pai') return r.a === from ? 'Pai/mãe' : 'Filho(a)';
    if (r.kind === 'filho') return r.a === from ? 'Filho(a)' : 'Pai/mãe';
    const names: Record<RelKind, string> = { conjuge: 'Cônjuge', noivos: 'Noivo(a)', namorados: 'Namorado(a)', irmaos: 'Irmão(ã)', colegas: 'Colega de casa', amigos: 'Amigo(a)', conhecidos: 'Conhecido(a)', pai: '', filho: '' };
    if ((r.kind === 'conhecidos' || r.kind === 'colegas') && r.amizade >= 60) return 'Melhor amigo(a)';
    if (r.kind === 'conhecidos' && r.amizade >= 30) return 'Amigo(a)';
    if (r.kind === 'conhecidos' && r.amizade <= -30) return 'Desafeto';
    return names[r.kind];
  }

  /* ------------------------------------------------------------ Comandos do jogador */

  enqueue(simId: string, t: Task) {
    const a = this.agents.get(simId);
    if (!a) return;
    if (a.sim.away) { this.emit('toast', `${a.sim.firstName} está fora de casa.`); return; }
    if (!canWalk(a.sim.age)) { this.emit('toast', 'Bebês ainda não fazem ações sozinhos. Peça a um adulto para cuidar.'); return; }
    // Ações do jogador substituem as autônomas.
    a.queue = a.queue.filter((q, i) => q.player || (i === 0 && q.phase === 'act'));
    if (a.queue.length && !a.queue[0].player) this.cancelTask(a, 0);
    if (a.queue.length >= 6) { this.emit('toast', 'A fila de ações está cheia.'); return; }
    t.player = true;
    a.queue.push(t);
    this.emit('update', null);
  }

  objectTask(def: InteractionDef, itemId: string): Task {
    return tpl({ kind: 'obj', label: def.name, icon: def.icon, def, itemId, minutes: def.minutes });
  }

  objectTaskById(defId: string, itemId: string): Task {
    return this.objectTask(INTERACTION_BY_ID.get(defId)!, itemId);
  }

  socialTask(def: SocialDef, targetSim: string): Task {
    return tpl({ kind: 'social', label: def.name, icon: def.icon, social: def, targetSim, minutes: def.minutes });
  }

  petTask(act: PetAction, petId: string): Task {
    return tpl({ kind: 'pet', label: act.name, icon: act.icon, petAct: act, petId, minutes: act.minutes });
  }

  goTask(level: number, p: P): Task {
    return tpl({ kind: 'go', label: 'Ir até aqui', icon: '🚶', dest: { level, p } });
  }

  danceTask(): Task {
    return tpl({ kind: 'dance', label: 'Dançar', icon: '💃', minutes: 40 });
  }

  cancelTask(a: Agent, index: number) {
    const t = a.queue[index];
    if (!t) return;
    if (t.spot) this.reserved.delete(t.spot.key);
    if (index === 0) this.standUp(a, t);
    a.queue.splice(index, 1);
    this.emit('update', null);
  }

  private standUp(a: Agent, t: Task) {
    if (a.posture !== 'stand' && t.spot) {
      a.sim.pos = { ...t.spot.approach };
      a.y = this.groundY(a.sim.level, a.sim.pos);
    }
    a.posture = 'stand';
    a.anim = 'idle';
  }

  socialContext(a: Sim, b: Sim) {
    return {
      a, b, rel: this.rel(a.id, b.id),
      hasDoubleBed: this.project.items.some((i) => i.catalogId === 'cama_casal'),
      householdSize: this.household.length,
    };
  }

  /* ------------------------------------------------------------ Ciclo */

  update(dtReal: number) {
    const dt = Math.min(dtReal, 0.25) * MIN_PER_SEC[this.speed];
    if (dt <= 0) return;
    // Sub-passos para manter estabilidade em velocidades altas.
    const steps = Math.ceil(dt / 1.5);
    for (let i = 0; i < steps; i++) this.tick(dt / steps);
  }

  private tick(dt: number) {
    const life = this.life;
    life.clock.minutes += dt;
    const now = this.now;
    const day = dayOf(now);
    if (day !== this.lastDay) { this.lastDay = day; this.newDay(); }
    for (const a of [...this.agents.values()]) this.updateAgent(a, dt);
    for (const pa of this.pets.values()) this.updatePet(pa, dt);
    if (life.partyUntil && now >= life.partyUntil) {
      life.partyUntil = undefined;
      this.log('A festa terminou! Todos se divertiram muito.');
    }
    this.saveAcc += dt;
    if (this.saveAcc > 60) { this.saveAcc = 0; this.editor.scheduleSave(); }
  }

  private newDay() {
    if (!this.life.aging) return;
    for (const s of this.household) {
      s.ageDays += 1;
      const def = AGE_BY_ID.get(s.age)!;
      if (s.ageDays >= def.days) {
        const idx = AGES.findIndex((x) => x.id === s.age);
        const next = AGES[Math.min(AGES.length - 1, idx + 1)].id as AgeStage;
        if (next !== s.age) {
          s.age = next;
          s.ageDays = 0;
          if (next === 'crianca' || next === 'adolescente') s.career = 'escola';
          if (next === 'jovem' && s.career === 'escola') { s.career = 'nenhuma'; s.careerLevel = 0; }
          if (next === 'crianca') {
            s.needs = { ...s.needs, bexiga: Math.max(s.needs.bexiga, 80), higiene: Math.max(s.needs.higiene, 60) };
            const a = this.agents.get(s.id);
            if (a) { a.queue = []; a.posture = 'stand'; this.spawn(s, s.pos); }
          }
          this.log(`🎂 ${s.firstName} fez aniversário e agora é ${AGE_BY_ID.get(next)!.name.toLowerCase()}!`);
          this.emit('roster', null);
        }
      }
    }
  }

  private moodlet(s: Sim, id: string, name: string, value: number, hours: number) {
    s.moodlets = s.moodlets.filter((m) => m.id !== id && m.until > this.now);
    s.moodlets.push({ id, name, value, until: this.now + hours * 60 });
  }

  private think(a: Agent, text: string) {
    a.thought = text;
    a.thoughtUntil = this.now + 40;
  }

  private decay(a: Agent, dt: number) {
    const s = a.sim;
    const h = dt / 60;
    const tr = (t: string) => s.traits.includes(t as any);
    const mult: Record<Need, number> = {
      fome: tr('glutao') ? 1.3 : 1, energia: tr('preguicoso') ? 1.25 : 1, higiene: tr('limpinho') ? 1.25 : 1,
      diversao: 1, social: tr('sociavel') ? 1.3 : tr('solitario') ? 0.6 : 1, conforto: 1, bexiga: 1,
    };
    const away = s.away ? 0.5 : 1;
    const baby = s.age === 'bebe' ? 0.8 : 1;
    const asleep = a.anim === 'sleep';
    for (const k of Object.keys(NEED_DECAY) as Need[]) {
      const sleepK = asleep && (k === 'bexiga' || k === 'fome' || k === 'higiene') ? 0.45 : asleep && k === 'social' ? 0.2 : 1;
      s.needs[k] = Math.max(0, s.needs[k] - NEED_DECAY[k] * mult[k] * h * away * baby * sleepK);
    }
  }

  private updateAgent(a: Agent, dt: number) {
    const s = a.sim;
    this.decay(a, dt);
    s.moodlets = s.moodlets.filter((m) => m.until > this.now);
    if (a.thought && this.now > a.thoughtUntil) a.thought = null;

    // Visitantes vão embora.
    if (s.visitor && s.leaveAt && this.now >= s.leaveAt && !a.queue.some((t) => t.kind === 'leave')) {
      if (a.queue.length) this.cancelTask(a, 0);
      a.queue = [tpl({ kind: 'leave', label: 'Ir embora', icon: '👋', leaveReason: 'visita' })];
    }

    // Trabalho e escola.
    if (s.away) { this.checkReturn(a); return; }
    if (!s.visitor) this.checkWork(a);

    // Gravidez.
    if (s.pregnantUntil && this.now >= s.pregnantUntil) this.birth(s);

    // Situações críticas.
    if (canWalk(s.age)) {
      if (s.needs.bexiga <= 0.5) {
        s.needs.bexiga = 100;
        s.needs.higiene = Math.max(0, s.needs.higiene - 45);
        this.moodlet(s, 'acidente', 'Que vergonha!', -15, 4);
        this.log(`${s.firstName} não chegou ao banheiro a tempo...`);
      }
      if (s.needs.energia <= 0.5 && !(a.queue[0]?.kind === 'faint' || a.queue[0]?.def?.id === 'dormir')) {
        while (a.queue.length) this.cancelTask(a, 0);
        a.queue.push(tpl({ kind: 'faint', label: 'Desmaiou de sono', icon: '😵', minutes: 150 }));
        this.log(`${s.firstName} desmaiou de cansaço!`);
      }
      if (s.needs.fome < 8) this.moodlet(s, 'fome', 'Faminto', -18, 1);
    }

    if (s.age === 'bebe') { this.updateBaby(a, dt); return; }

    // Bexiga apertada interrompe o que estiver fazendo (inclusive dormir).
    if (s.needs.bexiga < 14 && a.queue[0]?.def?.id !== 'banheiro' && a.queue[0]?.kind !== 'leave' && a.queue[0]?.kind !== 'faint') {
      const wc = this.nearestItem(s, ['vaso']);
      if (wc) {
        if (a.queue.length && a.queue[0].phase !== 'plan') this.cancelTask(a, 0);
        a.queue.unshift(this.objectTaskById('banheiro', wc.id));
        this.think(a, '🚻');
      }
    }

    // Em conversa: para de andar e espera (ações em andamento continuam).
    if (this.now < a.engagedUntil && (!a.queue[0] || a.queue[0].phase !== 'act')) {
      if (a.posture === 'stand') a.anim = 'talk';
      return;
    }

    const t = a.queue[0];
    if (!t) {
      a.anim = a.posture === 'stand' ? 'idle' : a.anim;
      if (this.now >= a.idleUntil && (this.life.autonomy || s.visitor)) this.autonomy(a);
      return;
    }
    this.runTask(a, t, dt);
  }

  /* ------------------------------------------------------------ Bebês */

  private updateBaby(a: Agent, dt: number) {
    const s = a.sim;
    const h = dt / 60;
    if (a.posture === 'lie') {
      s.needs.energia = Math.min(100, s.needs.energia + 14 * h);
      s.needs.conforto = Math.min(100, s.needs.conforto + 8 * h);
      a.anim = 'sleep';
      if (s.needs.energia >= 98) { a.posture = 'stand'; this.placeBaby(a, false); }
      return;
    }
    a.anim = 'baby';
    if (s.needs.energia < 30) { this.placeBaby(a, true); return; }
    if (s.needs.fome < 30 || s.needs.higiene < 25) this.think(a, '🍼');
  }

  /** Coloca o bebê no berço (se houver) para dormir ou brincar. */
  placeBaby(a: Agent, sleep: boolean) {
    const crib = this.project.items.find((i) => i.catalogId === 'berco');
    if (crib) {
      const sp = spotsFor('berco', 'lie')[0];
      const w = spotWorld(crib, sp);
      a.sim.level = crib.level;
      a.sim.pos = w.pos;
      a.sim.rot = w.rot;
      a.y = this.base(crib.level) + crib.elev + sp.h;
      a.posture = sleep ? 'lie' : 'sit';
    } else {
      a.posture = sleep ? 'lie' : 'stand';
      a.y = this.groundY(a.sim.level, a.sim.pos);
    }
  }

  private birth(mother: Sim) {
    mother.pregnantUntil = undefined;
    const partnerRel = this.life.relationships.find((r) => (r.a === mother.id || r.b === mother.id) && ['conjuge', 'noivos', 'namorados'].includes(r.kind));
    const partner = partnerRel ? this.life.sims.find((x) => x.id === (partnerRel.a === mother.id ? partnerRel.b : partnerRel.a)) : undefined;
    const look = randomAppearance();
    look.skin = (this.rng() < 0.5 || !partner ? mother : partner).look.skin;
    look.hairColor = (this.rng() < 0.5 || !partner ? mother : partner).look.hairColor;
    look.eyeColor = (this.rng() < 0.5 || !partner ? mother : partner).look.eyeColor;
    look.beard = false;
    look.accessory = 'nenhum';
    const baby: Sim = {
      ...randomSim({ age: 'bebe', lastName: mother.lastName }),
      look, career: 'nenhuma', traits: [], needs: fullNeeds(), skills: blankSkills(),
    };
    baby.pos = { ...mother.pos };
    baby.level = mother.level;
    this.life.sims.push(baby);
    const ag = this.addAgent(baby);
    this.placeBaby(ag, false);
    for (const parent of [mother, partner]) {
      if (!parent) continue;
      this.life.relationships.push({ a: parent.id, b: baby.id, kind: 'pai', amizade: 40, romance: 0 });
      this.moodlet(parent, 'bebe', 'Novo bebê!', 22, 24);
    }
    this.log(`👶 Nasceu ${baby.firstName}! Bem-vindo(a) à família ${mother.lastName}.`);
    this.emit('roster', null);
  }

  /* ------------------------------------------------------------ Trabalho */

  private checkWork(a: Agent) {
    const s = a.sim;
    const c = CAREER_BY_ID.get(s.career);
    if (!c || !c.hours || !canWalk(s.age)) return;
    if (!isWorkday(this.now)) return;
    const h = hourOf(this.now);
    const day = dayOf(this.now);
    if (s.workedDay === day) return;
    if (h >= c.start - 0.75 && h < c.start + c.hours - 1 && !a.queue.some((t) => t.kind === 'leave')) {
      while (a.queue.length) this.cancelTask(a, 0);
      a.queue.push(tpl({ kind: 'leave', label: c.kids ? 'Ir para a escola' : 'Ir trabalhar', icon: c.kids ? '🎒' : '💼', leaveReason: c.kids ? 'escola' : 'trabalho' }));
      this.emit('update', null);
    }
  }

  private checkReturn(a: Agent) {
    const s = a.sim;
    const c = CAREER_BY_ID.get(s.career);
    if (!c) { s.away = null; return; }
    const h = hourOf(this.now);
    if (h >= c.start + c.hours || h < c.start - 1 || dayOf(this.now) !== s.workedDay) {
      const wasSchool = s.away === 'escola';
      s.away = null;
      this.spawn(s, this.exitPoint());
      const m = mood(s, this.now);
      const perf = ((m - 40) / 5) * (s.traits.includes('ambicioso') ? 1.5 : 1) + (c.skill ? s.skills[c.skill] * 1.2 : 0) + 6;
      s.performance = Math.max(-50, s.performance + perf);
      if (wasSchool) {
        this.log(`${s.firstName} voltou da escola.`, false);
      } else {
        const wage = c.wage[s.careerLevel] ?? 0;
        const pay = Math.round(wage * c.hours * (0.8 + Math.max(0, m) / 250));
        this.earn(pay);
        this.log(`${s.firstName} voltou do trabalho e recebeu ${fmtMoney(pay)}.`);
      }
      if (s.performance >= 100 && s.careerLevel < c.titles.length - 1) {
        s.careerLevel++;
        s.performance = 0;
        this.moodlet(s, 'promo', 'Promoção!', 20, 12);
        this.log(`🎉 ${s.firstName} foi promovido(a) a ${c.titles[s.careerLevel]}!`);
      }
      if (s.performance < -40 && !c.kids && s.careerLevel > 0) {
        s.careerLevel--;
        s.performance = 0;
        this.log(`${s.firstName} foi rebaixado(a) por mau desempenho.`);
      }
      this.emit('roster', null);
    }
  }

  /* ------------------------------------------------------------ Execução de tarefas */

  private fail(a: Agent, msg: string) {
    const t = a.queue[0];
    if (t?.player) this.emit('toast', `${a.sim.firstName}: ${msg}`);
    this.think(a, '❓');
    if (t) this.cancelTask(a, 0);
    a.idleUntil = this.now + 10;
  }

  nearestItem(s: Sim, ids: string[]): Item | undefined {
    let best: Item | undefined, bd = Infinity;
    for (const it of this.project.items) {
      if (!ids.includes(it.catalogId)) continue;
      const d = dist(it.pos, s.pos) + Math.abs(it.level - s.level) * 5;
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  private item(id?: string): Item | undefined {
    return id ? this.project.items.find((i) => i.id === id) : undefined;
  }

  private chooseSpot(a: Agent, t: Task): boolean {
    const def = t.def!;
    const it = this.item(t.itemId);
    if (!it) { this.fail(a, 'o objeto não existe mais.'); return false; }
    let target = it;
    let kind: SpotKind = def.spot as SpotKind;
    let spots = def.spot === 'seatNear' || def.spot === 'here' ? [] : spotsFor(it.catalogId, kind);
    if (def.spot === 'seatNear') {
      // Procura assento voltado para o objeto (TV) ou ao lado (mesa/computador).
      const maxD = def.id === 'tv' ? 6 : 1.6;
      const seats = this.project.items
        .filter((s2) => s2.level === it.level && spotsFor(s2.catalogId, 'sit').length && s2.catalogId !== 'vaso')
        .map((s2) => ({ s2, d: dist(s2.pos, it.pos) }))
        .filter((x) => x.d < maxD)
        .filter((x) => {
          if (def.id !== 'tv') return true;
          const fwd = { x: Math.sin(x.s2.rot), y: Math.cos(x.s2.rot) };
          const to = norm(sub(it.pos, x.s2.pos));
          return fwd.x * to.x + fwd.y * to.y > 0.5;
        })
        .sort((p, q) => p.d - q.d);
      for (const { s2 } of seats) {
        const sp = spotsFor(s2.catalogId, 'sit');
        const free = sp.findIndex((_, i) => !this.reserved.has(`${s2.id}:${i}`));
        if (free >= 0) { target = s2; kind = 'sit'; spots = sp; break; }
      }
      if (target === it) { kind = 'stand'; spots = spotsFor(it.catalogId, 'stand'); }
    }
    if (def.id === 'comer') {
      // Prefere cadeiras perto de mesas; senão, come em pé.
      const tables = this.project.items.filter((x) => ['mesa_jantar', 'mesa_redonda', 'mesa_externa', 'ilha', 'mesa_centro'].includes(x.catalogId));
      const seats = this.project.items
        .filter((x) => spotsFor(x.catalogId, 'sit').length && x.catalogId !== 'vaso')
        .map((x) => ({ x, d: dist(x.pos, a.sim.pos) + (x.level !== a.sim.level ? 8 : 0) - (tables.some((tb) => tb.level === x.level && dist(tb.pos, x.pos) < 1.4) ? 6 : 0) }))
        .sort((p, q) => p.d - q.d);
      for (const { x } of seats) {
        const sp = spotsFor(x.catalogId, 'sit');
        const free = sp.findIndex((_, i) => !this.reserved.has(`${x.id}:${i}`));
        if (free >= 0) { target = x; spots = sp; kind = 'sit'; break; }
      }
      if (!spots.length) { a.queue[0] = { ...t, kind: 'eatHere', phase: 'act' }; return false; }
    }
    // Ponto livre mais próximo.
    let best = -1, bestD = Infinity;
    spots.forEach((sp, i) => {
      if (this.reserved.has(`${target.id}:${i}`)) return;
      const w = spotWorld(target, sp);
      const d = dist(w.approach, a.sim.pos);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best < 0) { this.fail(a, 'está ocupado.'); return false; }
    const sp = spots[best];
    const w = spotWorld(target, sp);
    const key = `${target.id}:${best}`;
    this.reserved.set(key, a.sim.id);
    const y = this.base(target.level) + (kind === 'stand' ? this.editor.floorTopAt(target.level, w.pos) : target.elev + sp.h * target.scale);
    t.spot = { pos: w.pos, approach: w.approach, rot: w.rot, y, kind, key };
    t.dest = { level: target.level, p: kind === 'stand' ? w.pos : w.approach };
    return true;
  }

  private plan(a: Agent, t: Task): boolean {
    const s = a.sim;
    switch (t.kind) {
      case 'obj':
        if (!this.chooseSpot(a, t)) return false;
        if (t.def?.cost && !this.spend(t.def.cost, t.def.name.toLowerCase())) { this.cancelTask(a, 0); return false; }
        break;
      case 'social':
      case 'pet': {
        const tp = t.kind === 'social' ? this.agents.get(t.targetSim!)?.sim : this.pets.get(t.petId!)?.pet;
        if (!tp || (t.kind === 'social' && (tp as Sim).away)) { this.fail(a, 'não está em casa.'); return false; }
        if (t.kind === 'social') {
          const why = t.social!.require(this.socialContext(s, tp as Sim));
          if (why) { this.fail(a, why); return false; }
          // O alvo espera a aproximação (se não estiver ocupado com algo em andamento).
          const ta = this.agents.get(t.targetSim!)!;
          if (!ta.queue[0] || (!ta.queue[0].player && (ta.queue[0].phase === 'plan' || ta.queue[0].phase === 'move'))) ta.engagedUntil = Math.max(ta.engagedUntil, this.now + Math.min(t.player ? 60 : 30, 10 + (dist(s.pos, tp.pos) * 1.6 + Math.abs(s.level - tp.level) * 6) / WALK_M_PER_MIN));
        }
        const dir = norm(sub(s.pos, tp.pos));
        const gap = t.kind === 'pet' ? 0.6 : (t.social?.anim === 'hug' || t.social?.anim === 'kiss' ? 0.55 : 0.9);
        const want = add(tp.pos, { x: (dir.x || 1) * gap, y: dir.y * gap });
        const p = this.navGrid().nearestWalkable(tp.level, want, 2) ?? want;
        t.dest = { level: tp.level, p };
        break;
      }
      case 'leave':
        t.dest = { level: 0, p: this.exitPoint() };
        break;
      case 'go':
        break;
      default:
        t.phase = 'act';
        return true;
    }
    if (t.dest) {
      const route = this.navGrid().findPath(s.level, s.pos, t.dest.level, t.dest.p);
      if (!route) { this.fail(a, 'não consigo chegar lá.'); return false; }
      if (a.posture !== 'stand') { a.posture = 'stand'; }
      t.route = route;
      t.step = 0; t.pt = 0; t.linkD = 0;
      t.phase = 'move';
    }
    return true;
  }

  private move(a: Agent, t: Task, dt: number): boolean {
    const s = a.sim;
    let budget = dt * WALK_M_PER_MIN;
    a.anim = 'walk';
    while (budget > 0 && t.route && t.step < t.route.length) {
      const st = t.route[t.step];
      if (st.type === 'walk') {
        s.level = st.level;
        const next = st.pts[t.pt + 1];
        if (!next) { t.step++; t.pt = 0; continue; }
        const d = dist(s.pos, next);
        if (d <= budget) { s.pos = { ...next }; t.pt++; budget -= d; }
        else { s.pos = lerp(s.pos, next, budget / d); budget = 0; }
        const dir = sub(next, s.pos);
        if (Math.hypot(dir.x, dir.y) > 0.01) s.rot = Math.atan2(dir.x, dir.y);
        a.y = this.groundY(s.level, s.pos);
      } else {
        const path = st.up ? st.link.path : [...st.link.path].reverse();
        const base = this.base(st.link.lower);
        let total = 0;
        const seg: number[] = [];
        for (let k = 1; k < path.length; k++) { const l = Math.max(0.01, dist(path[k - 1].p, path[k].p) + Math.abs(path[k].h - path[k - 1].h) * 0.6); seg.push(l); total += l; }
        t.linkD += budget * 0.7;
        budget = 0;
        let rem = Math.min(t.linkD, total);
        let k = 0;
        while (k < seg.length - 1 && rem > seg[k]) { rem -= seg[k]; k++; }
        const f = Math.min(1, rem / seg[k]);
        const p0 = path[k], p1 = path[k + 1];
        s.pos = lerp(p0.p, p1.p, f);
        a.y = base + p0.h + (p1.h - p0.h) * f;
        const dir = sub(p1.p, p0.p);
        if (Math.hypot(dir.x, dir.y) > 0.01) s.rot = Math.atan2(dir.x, dir.y);
        s.level = st.link.lower + (f > 0.5 && k === seg.length - 1 ? (st.up ? 1 : 0) : (st.up ? 0 : 1));
        if (t.linkD >= total) {
          s.level = st.up ? st.link.lower + 1 : st.link.lower;
          s.pos = { ...(st.up ? st.link.top : st.link.bottom) };
          a.y = this.groundY(s.level, s.pos);
          t.step++; t.pt = 0; t.linkD = 0;
        }
        if (st.link.kind === 'elevador') a.anim = 'idle';
      }
    }
    return !!t.route && t.step >= t.route.length;
  }

  private runTask(a: Agent, t: Task, dt: number) {
    const s = a.sim;
    if (t.phase === 'plan') {
      if (!this.plan(a, t)) return;
      t.elapsed = 0;
    }
    if (t.phase === 'move') {
      // Segurança: deslocamentos que demoram demais são abandonados.
      t.elapsed += dt;
      if (t.elapsed > 150) { t.elapsed = 0; this.fail(a, 'desisti, o caminho está muito difícil.'); return; }
      // Alvo social em movimento: replaneja se ficou longe.
      if (!this.move(a, t, dt)) return;
      if (t.kind === 'social' || t.kind === 'pet') {
        const tp = t.kind === 'social' ? this.agents.get(t.targetSim!)?.sim : this.pets.get(t.petId!)?.pet;
        if (!tp) { this.cancelTask(a, 0); return; }
        if ((dist(tp.pos, s.pos) > 1.8 || tp.level !== s.level) && t.replans < 3) { t.replans++; t.phase = 'plan'; return; }
        s.rot = Math.atan2(tp.pos.x - s.pos.x, tp.pos.y - s.pos.y);
        t.elapsed = 0;
        if (t.kind === 'social') {
          const ta = this.agents.get(t.targetSim!)!;
          ta.engagedUntil = this.now + t.minutes;
          if (ta.posture === 'stand' && (!ta.queue[0] || ta.queue[0].phase !== 'act')) {
            ta.sim.rot = Math.atan2(s.pos.x - ta.sim.pos.x, s.pos.y - ta.sim.pos.y);
          }
        }
        t.phase = 'act';
      } else if (t.kind === 'leave') {
        this.leaveLot(a, t);
        return;
      } else if (t.kind === 'go') {
        this.cancelTask(a, 0);
        return;
      } else if (t.spot) {
        t.elapsed = 0;
        t.phase = 'enter';
        t.enterFrom = { p: { ...s.pos }, y: a.y };
        t.enterT = 0;
      } else t.phase = 'act';
    }
    if (t.phase === 'enter') {
      t.elapsed = 0;
      t.enterT += dt / 0.8;
      const f = Math.min(1, t.enterT);
      const sp = t.spot!;
      s.pos = lerp(t.enterFrom!.p, sp.pos, f);
      a.y = t.enterFrom!.y + (sp.y - t.enterFrom!.y) * f;
      s.rot = sp.rot;
      a.anim = 'walk';
      if (f >= 1) {
        a.posture = sp.kind === 'sit' ? 'sit' : sp.kind === 'lie' ? 'lie' : 'stand';
        t.phase = 'act';
      } else return;
    }
    if (t.phase === 'act') this.act(a, t, dt);
  }

  private standAnim(anim: Anim, posture: Agent['posture']): Anim {
    if (posture === 'sit') return anim;
    if (anim === 'type') return 'cook';
    if (anim === 'watch' || anim === 'read' || anim === 'sit' || anim === 'eat') return anim === 'eat' ? 'eat' : 'idle';
    return anim;
  }

  private act(a: Agent, t: Task, dt: number) {
    const s = a.sim;
    const h = dt / 60;
    t.elapsed += dt;
    const add = (k: Need, v: number) => { s.needs[k] = Math.max(0, Math.min(100, s.needs[k] + v)); };
    switch (t.kind) {
      case 'obj':
      case 'eatHere': {
        const def = t.kind === 'eatHere' ? INTERACTION_BY_ID.get('comer')! : t.def!;
        let anim = def.anim;
        if (t.kind === 'eatHere') anim = 'eat';
        a.anim = def.anim === 'sleep' || def.anim === 'lie' || def.anim === 'swim' || def.anim === 'shower' ? def.anim : this.standAnim(anim, a.posture);
        if (def.anim === 'eat' && a.posture === 'stand') a.anim = 'eat';
        const bonus = Object.entries(def.traitBonus ?? {}).reduce((m, [tr, v]) => (s.traits.includes(tr as any) ? m * (v ?? 1) : m), 1);
        for (const [k, v] of Object.entries(def.rates) as [Need, number][]) add(k, v * h * (v > 0 && k === 'diversao' ? bonus : 1));
        if (def.skill) {
          const mult = (def.skill.id === 'criatividade' && s.traits.includes('criativo')) || (def.skill.id === 'fitness' && s.traits.includes('ativo')) ? 1.5 : 1;
          s.skills[def.skill.id] = Math.min(10, s.skills[def.skill.id] + def.skill.perHour * h * mult);
        }
        if (def.earn) this.earn(def.earn * h * (1 + s.skills.logica / 10));
        // Natação: nada de um lado ao outro da piscina.
        if (def.anim === 'swim' && t.spot) {
          const it = this.item(t.itemId);
          if (it) {
            const def2 = CATALOG_BY_ID.get(it.catalogId)!;
            const off = Math.sin(t.elapsed / 3) * (def2.w * it.scale / 2 - 0.9);
            s.pos = add2(it.pos, { x: Math.cos(-it.rot) * off, y: Math.sin(-it.rot) * off });
            s.rot = it.rot + Math.PI / 2 * Math.sign(Math.cos(t.elapsed / 3));
            a.y = this.base(it.level) + it.elev + def2.h - 0.25;
          }
        }
        const full = def.untilFull && s.needs[def.untilFull] >= 99;
        if (t.elapsed >= t.minutes * (def.untilFull ? 2.5 : 1) || full || (def.untilFull && t.elapsed >= t.minutes && s.needs[def.untilFull] >= 95)) this.finish(a, t);
        else if (t.elapsed >= t.minutes && !def.untilFull) this.finish(a, t);
        break;
      }
      case 'faint':
        a.anim = 'sleep';
        a.posture = 'lie';
        add('energia', 20 * h);
        add('conforto', -4 * h);
        if (t.elapsed >= t.minutes || s.needs.energia > 45) { a.posture = 'stand'; a.queue.shift(); }
        break;
      case 'dance':
        a.anim = 'dance';
        add('diversao', 40 * h);
        add('social', 20 * h);
        add('energia', -6 * h);
        if (t.elapsed >= t.minutes) a.queue.shift();
        break;
      case 'social': {
        const def = t.social!;
        const ta = this.agents.get(t.targetSim!);
        if (!ta || ta.sim.away) { this.cancelTask(a, 0); return; }
        a.anim = def.anim;
        if (ta.posture === 'stand' && (!ta.queue[0] || ta.queue[0].phase !== 'act')) ta.anim = def.anim === 'hug' || def.anim === 'kiss' ? def.anim : ta.sim.age === 'bebe' ? 'baby' : 'talk';
        const k = h * (60 / Math.max(1, def.minutes));
        const socialMult = s.traits.includes('sociavel') ? 1.3 : 1;
        add('social', def.social * k * socialMult);
        ta.sim.needs.social = Math.min(100, ta.sim.needs.social + def.social * k);
        if (def.diversao) { add('diversao', def.diversao * k); ta.sim.needs.diversao = Math.min(100, ta.sim.needs.diversao + def.diversao * k); }
        if (def.id === 'cuidar_bebe') {
          for (const n of ['fome', 'higiene', 'social', 'diversao', 'bexiga'] as Need[]) ta.sim.needs[n] = Math.min(100, ta.sim.needs[n] + 160 * h);
        }
        if (t.elapsed >= t.minutes) this.finishSocial(a, ta, def);
        break;
      }
      case 'pet': {
        const pa = this.pets.get(t.petId!);
        if (!pa) { this.cancelTask(a, 0); return; }
        a.anim = t.petAct!.id === 'brincar_pet' ? 'play' : 'carry';
        pa.anim = t.petAct!.id === 'alimentar_pet' ? 'eat' : 'play';
        pa.until = this.now + 2;
        if (t.elapsed >= t.minutes) {
          const act = t.petAct!;
          if ('cost' in act && act.cost && !this.spend(act.cost, 'ração')) { this.cancelTask(a, 0); return; }
          for (const [k, v] of Object.entries(act.actor) as [Need, number][]) add(k, v);
          for (const [k, v] of Object.entries(act.pet)) (pa.pet.needs as any)[k] = Math.max(0, Math.min(100, (pa.pet.needs as any)[k] + v));
          a.queue.shift();
          a.anim = 'idle';
        }
        break;
      }
      default:
        a.queue.shift();
    }
  }

  private finish(a: Agent, t: Task) {
    const s = a.sim;
    if (t.spot) this.reserved.delete(t.spot.key);
    a.queue.shift();
    if (t.def?.then) {
      // Prato pronto: passa a comer (ação seguinte na frente da fila).
      const next = INTERACTION_BY_ID.get(t.def.then)!;
      a.queue.unshift(tpl({ kind: 'obj', label: next.name, icon: next.icon, def: next, itemId: t.itemId, minutes: next.minutes, player: t.player }));
      if (t.def.id === 'cozinhar') s.needs.fome = Math.min(100, s.needs.fome + 5);
    }
    if (a.posture !== 'stand' && !(a.queue[0]?.phase === 'act')) this.standUp(a, t);
    else a.posture = 'stand';
    if (t.def?.id === 'dormir') this.moodlet(s, 'descansado', 'Bem descansado', 8, 4);
    if (t.def?.id === 'banho' || t.def?.id === 'banheira') this.moodlet(s, 'limpo', 'Cheiroso', 5, 3);
    this.emit('update', null);
  }

  private finishSocial(a: Agent, ta: Agent, def: SocialDef) {
    const s = a.sim, b = ta.sim;
    a.queue.shift();
    ta.engagedUntil = this.now;
    a.anim = 'idle';
    const r = this.ensureRel(s.id, b.id);
    const fam = ['pai', 'filho', 'irmaos'].includes(r.kind) && s.traits.includes('familia') ? 1.4 : 1;
    const romMult = s.traits.includes('romantico') || b.traits.includes('romantico') ? 1.5 : 1;
    let am = def.amizade * fam * (1 + s.skills.carisma / 15);
    // Piadas podem não agradar.
    if (def.id === 'piada' && this.rng() < 0.2 - s.skills.carisma / 60) { am = -4; this.think(ta, '😒'); }
    else this.think(ta, def.icon);
    r.amizade = Math.max(-100, Math.min(100, r.amizade + am));
    r.romance = Math.max(0, Math.min(100, r.romance + def.romance * romMult));
    s.skills.carisma = Math.min(10, s.skills.carisma + 0.04);
    const both = `${s.firstName} e ${b.firstName}`;
    switch (def.id) {
      case 'discutir': this.moodlet(s, 'briga', 'Discussão acalorada', -10, 3); this.moodlet(b, 'briga', 'Discussão acalorada', -12, 3); break;
      case 'beijar': this.moodlet(s, 'paixao', 'Apaixonado(a)', 10, 6); this.moodlet(b, 'paixao', 'Apaixonado(a)', 10, 6); break;
      case 'namoro':
        if (r.romance >= 45 && this.rng() < 0.85) { r.kind = 'namorados'; this.log(`💞 ${both} estão namorando!`); }
        else { r.romance = Math.max(0, r.romance - 10); this.log(`${b.firstName} recusou o pedido de namoro.`); }
        break;
      case 'pedido':
        if (this.rng() < 0.85) { r.kind = 'noivos'; this.log(`💍 ${both} ficaram noivos!`); this.moodlet(s, 'noivado', 'Noivado!', 18, 24); this.moodlet(b, 'noivado', 'Noivado!', 18, 24); }
        else { r.romance -= 12; this.log(`${b.firstName} ainda não se sente pronto(a) para casar.`); }
        break;
      case 'casar':
        r.kind = 'conjuge';
        this.moodlet(s, 'casamento', 'Recém-casados', 25, 48);
        this.moodlet(b, 'casamento', 'Recém-casados', 25, 48);
        if (b.visitor) this.moveIn(b);
        this.log(`💒 ${both} se casaram! Felicidades!`);
        break;
      case 'bebe':
        if (this.rng() < 0.75) {
          const carrier = s.traits.length && this.rng() < 0.5 ? s : b;
          carrier.pregnantUntil = this.now + 1440;
          this.log(`🤰 ${both} terão um bebê! Ele(a) chega em 1 dia.`);
        } else this.log(`${both} tentaram, mas ainda não foi desta vez.`);
        break;
      case 'convidar_morar':
        if (this.rng() < 0.9) { this.moveIn(b); this.log(`🏡 ${b.firstName} agora mora com a família!`); }
        else this.log(`${b.firstName} agradeceu, mas não quis se mudar agora.`);
        break;
      case 'despedir':
        b.leaveAt = this.now;
        break;
    }
    this.emit('update', null);
  }

  private moveIn(b: Sim) {
    b.visitor = false;
    b.leaveAt = undefined;
    if (b.career === 'nenhuma' && isAdult(b.age)) b.career = 'nenhuma';
    this.emit('roster', null);
  }

  private leaveLot(a: Agent, t: Task) {
    const s = a.sim;
    a.queue.shift();
    if (t.leaveReason === 'visita') {
      this.removeSim(s.id);
      return;
    }
    s.away = t.leaveReason === 'escola' ? 'escola' : 'trabalho';
    s.workedDay = dayOf(this.now);
    a.visible = false;
    this.emit('roster', null);
  }

  removeSim(id: string) {
    const a = this.agents.get(id);
    if (a) for (let i = a.queue.length - 1; i >= 0; i--) this.cancelTask(a, i);
    this.agents.delete(id);
    this.life.sims = this.life.sims.filter((x) => x.id !== id);
    this.life.relationships = this.life.relationships.filter((r) => r.a !== id && r.b !== id);
    this.emit('roster', null);
  }

  /* ------------------------------------------------------------ Autonomia */

  private weight(v: number) {
    const x = (100 - v) / 100;
    return x * x * 4 + 0.04;
  }

  private autonomy(a: Agent) {
    const s = a.sim;
    const night = hourOf(this.now) >= 22 || hourOf(this.now) < 6;
    const w = (k: Need) => this.weight(s.needs[k]) * (k === 'energia' && night ? 2.2 : 1);
    const opts: { score: number; task: () => Task }[] = [];
    const items = this.project.items;
    for (const def of INTERACTIONS) {
      if (def.hidden || (def.ages && !def.ages.includes(s.age)) || (s.visitor && !def.visitors)) continue;
      if (def.id === 'dormir' && !night && s.needs.energia > 35) continue;
      if (def.id === 'freela' && s.needs.diversao < 40) continue;
      let benefit = 0;
      for (const [k, v] of Object.entries(def.rates) as [Need, number][]) if (v > 0) benefit += Math.min(v * (def.minutes / 60), 100 - s.needs[k] + 20) * w(k);
      if (def.then === 'comer') benefit += Math.min(100 - s.needs.fome, 80) * w('fome') * 1.25 * (s.traits.includes('glutao') ? 1.3 : 1);
      if (def.id === 'lanche') benefit *= 0.75;
      if (def.earn && this.project.mode === 'simulacao') benefit += 8;
      if (def.skill) benefit += 2;
      for (const [tr, m] of Object.entries(def.traitBonus ?? {})) if (s.traits.includes(tr as any)) benefit *= m ?? 1;
      if (def.cost && !this.canSpend(def.cost)) continue;
      if (benefit < 1.5) continue;
      for (const it of items) {
        if (!def.objects.includes(it.catalogId)) continue;
        const d = dist(it.pos, s.pos) + Math.abs(it.level - s.level) * 4;
        opts.push({ score: benefit - d * 0.35, task: () => this.objectTask(def, it.id) });
      }
    }
    // Social
    for (const b of this.agents.values()) {
      if (b === a || b.sim.away || !b.visible) continue;
      if (b.sim.age === 'bebe') {
        if (!isAdult(s.age) || s.visitor) continue;
        const need = Math.min(b.sim.needs.fome, b.sim.needs.higiene, b.sim.needs.social);
        if (need < 55) opts.push({ score: this.weight(need) * 70 * (s.traits.includes('familia') ? 1.3 : 1), task: () => this.socialTask(SOCIAL_BY_ID.get('cuidar_bebe')!, b.sim.id) });
        continue;
      }
      const ctx = this.socialContext(s, b.sim);
      const r = ctx.rel;
      const d = dist(b.sim.pos, s.pos) + Math.abs(b.sim.level - s.level) * 4;
      const base = w('social') * 40 * (s.traits.includes('solitario') ? 0.6 : 1) - d * 0.3;
      opts.push({ score: base, task: () => this.socialTask(SOCIAL_BY_ID.get('conversar')!, b.sim.id) });
      opts.push({ score: base * 0.6 + w('diversao') * 15, task: () => this.socialTask(SOCIAL_BY_ID.get('piada')!, b.sim.id) });
      if ((r?.amizade ?? 0) > 30 || (r && ['pai', 'filho', 'irmaos', 'conjuge'].includes(r.kind))) opts.push({ score: base * 0.8, task: () => this.socialTask(SOCIAL_BY_ID.get('abracar')!, b.sim.id) });
      if (r && ['namorados', 'noivos', 'conjuge'].includes(r.kind) && !SOCIAL_BY_ID.get('beijar')!.require(ctx)) opts.push({ score: base * 0.9 + (s.traits.includes('romantico') ? 8 : 3), task: () => this.socialTask(SOCIAL_BY_ID.get('beijar')!, b.sim.id) });
      if (s.age === 'crianca' || b.sim.age === 'crianca') opts.push({ score: base * 0.7 + w('diversao') * 20, task: () => this.socialTask(SOCIAL_BY_ID.get('brincar_crianca')!, b.sim.id) });
      if ((r?.amizade ?? 0) < -30) opts.push({ score: 3, task: () => this.socialTask(SOCIAL_BY_ID.get('discutir')!, b.sim.id) });
    }
    // Pets
    if (!s.visitor && canWalk(s.age)) for (const pa of this.pets.values()) {
      if (pa.pet.needs.fome < 40 && isAdult(s.age)) opts.push({ score: this.weight(pa.pet.needs.fome) * 50, task: () => this.petTask(PET_ACTIONS[1], pa.pet.id) });
      opts.push({ score: w('diversao') * 18 + this.weight(pa.pet.needs.diversao) * 6, task: () => this.petTask(PET_ACTIONS[0], pa.pet.id) });
      opts.push({ score: w('social') * 10, task: () => this.petTask(PET_ACTIONS[2], pa.pet.id) });
    }
    if (this.life.partyUntil && this.now < this.life.partyUntil) opts.push({ score: 14 + w('diversao') * 20, task: () => this.danceTask() });
    opts.sort((x, y) => y.score - x.score);
    const top = opts.filter((o) => o.score > 2).slice(0, 3);
    if (!top.length) {
      a.idleUntil = this.now + 20 + this.rng() * 30;
      // Passeio curto
      const nav = this.navGrid();
      const p = nav.nearestWalkable(s.level, { x: s.pos.x + (this.rng() - 0.5) * 6, y: s.pos.y + (this.rng() - 0.5) * 6 }, 2);
      if (p && this.rng() < 0.5) a.queue.push(this.goTask(s.level, p));
      return;
    }
    const pickIdx = this.rng() < 0.7 ? 0 : Math.floor(this.rng() * top.length);
    a.queue.push(top[pickIdx].task());
    a.idleUntil = this.now + 5;
  }

  /* ------------------------------------------------------------ Pets */

  private updatePet(pa: PetAgent, dt: number) {
    const n = pa.pet.needs;
    const h = dt / 60;
    n.fome = Math.max(0, n.fome - 5 * h);
    n.diversao = Math.max(0, n.diversao - 4 * h);
    if (pa.anim === 'sleep') {
      n.energia = Math.min(100, n.energia + 15 * h);
      if (n.energia > 95) pa.anim = 'idle';
      return;
    }
    n.energia = Math.max(0, n.energia - 4 * h);
    if (this.now < pa.until) return;
    if (n.energia < 20) { pa.anim = 'sleep'; return; }
    if (pa.route && pa.route.length) {
      pa.anim = 'walk';
      let budget = dt * WALK_M_PER_MIN * 0.9;
      while (budget > 0 && pa.route.length) {
        const next = pa.route[0];
        const d = dist(pa.pet.pos, next);
        if (d <= budget) { pa.pet.pos = { ...next }; pa.route.shift(); budget -= d; }
        else { pa.pet.pos = lerp(pa.pet.pos, next, budget / d); budget = 0; }
        const dir = sub(next, pa.pet.pos);
        if (Math.hypot(dir.x, dir.y) > 0.01) pa.pet.rot = Math.atan2(dir.x, dir.y);
      }
      pa.y = this.groundY(pa.pet.level, pa.pet.pos);
      return;
    }
    pa.anim = 'idle';
    if (this.rng() < dt / 25) {
      // Passeia ou segue alguém da família.
      const fam = [...this.agents.values()].filter((x) => x.visible && x.sim.level === pa.pet.level);
      const goal = fam.length && this.rng() < 0.5 ? fam[Math.floor(this.rng() * fam.length)].sim.pos : { x: pa.pet.pos.x + (this.rng() - 0.5) * 8, y: pa.pet.pos.y + (this.rng() - 0.5) * 8 };
      const route = this.navGrid().findPath(pa.pet.level, pa.pet.pos, pa.pet.level, goal);
      if (route && route[0]?.type === 'walk') pa.route = route[0].pts.slice(1);
    }
  }

  /* ------------------------------------------------------------ Ações da família */

  inviteVisitor(count = 1, hours = 4): Sim[] {
    const out: Sim[] = [];
    for (let i = 0; i < count; i++) {
      const v = randomSim({ age: this.rng() < 0.8 ? (this.rng() < 0.5 ? 'jovem' : 'adulto') : 'adolescente' });
      v.visitor = true;
      v.leaveAt = this.now + hours * 60;
      this.life.sims.push(v);
      this.addAgent(v);
      this.spawn(v, add(this.exitPoint(), { x: (i - count / 2) * 0.8, y: 0 }));
      for (const h of this.household) this.ensureRel(h.id, v.id).amizade = Math.max(this.rel(h.id, v.id)!.amizade, 5);
      out.push(v);
    }
    this.emit('roster', null);
    return out;
  }

  throwParty(): boolean {
    if (this.life.partyUntil && this.now < this.life.partyUntil) { this.emit('toast', 'Já há uma festa acontecendo!'); return false; }
    if (!this.spend(600, 'a festa')) return false;
    this.inviteVisitor(4, 5);
    this.life.partyUntil = this.now + 5 * 60;
    for (const s of this.life.sims) this.moodlet(s, 'festa', 'Festa animada', 15, 5);
    this.log('🎉 A festa começou! Os convidados estão chegando.');
    return true;
  }

  adoptPet(kind: 'cachorro' | 'gato', name: string): boolean {
    if (this.life.pets.length >= 4) { this.emit('toast', 'Limite de 4 animais de estimação.'); return false; }
    if (!this.spend(450, 'a adoção')) return false;
    const colors = kind === 'cachorro' ? ['#c9a063', '#3b2416', '#f1ece3', '#8d8d8d', '#6a4127'] : ['#e09a4f', '#2b2b2b', '#f1ece3', '#9a9a96', '#6a4127'];
    const pet: Pet = {
      id: uid('pet'), name, kind, color: colors[Math.floor(this.rng() * colors.length)],
      needs: { fome: 80, diversao: 70, energia: 80 }, level: 0, pos: this.exitPoint(), rot: Math.PI,
    };
    const nav = this.navGrid();
    pet.pos = nav.nearestWalkable(0, { x: 0, y: this.project.lot.d / 2 - 1.5 }, 6) ?? pet.pos;
    this.life.pets.push(pet);
    this.addPet(pet);
    this.log(`🐾 ${name} foi adotado(a)!`);
    this.emit('roster', null);
    return true;
  }

  /** Muda uma família criada no editor de personagens para o terreno. */
  moveInFamily(sims: Sim[], rels: Relationship[], name: string) {
    for (const s of this.household) this.removeSim(s.id);
    this.life.householdName = name;
    this.life.relationships = this.life.relationships.filter((r) => this.life.sims.some((s) => s.id === r.a || s.id === r.b));
    const today = dayOf(this.now);
    for (const s of sims) {
      s.needs = s.needs ?? fullNeeds();
      s.workedDay = today; // dia da mudança: folga do trabalho e da escola
      this.life.sims.push(s);
      const a = this.addAgent(s);
      if (s.age === 'bebe') { s.pos = { x: 0, y: 0 }; this.spawn(s); this.placeBaby(a, false); }
      else this.spawn(s);
    }
    this.life.relationships.push(...rels);
    this.emit('roster', null);
    this.editor.saveNow();
  }

  /** Teleporta personagens presos (após reformas) para o ponto livre mais próximo. */
  unstick() {
    const nav = this.navGrid();
    for (const a of this.agents.values()) {
      if (a.sim.away || a.posture !== 'stand') continue;
      if (a.sim.level >= this.project.levels) a.sim.level = 0;
      if (!nav.walkable(a.sim.level, a.sim.pos)) {
        const p = nav.nearestWalkable(a.sim.level, a.sim.pos, 8) ?? nav.nearestWalkable(0, this.exitPoint(), 8);
        if (p) { a.sim.pos = p; a.y = this.groundY(a.sim.level, p); }
      }
      a.queue = a.queue.filter((t) => t.player && t.phase === 'plan');
      for (const t of a.queue) t.phase = 'plan';
    }
    this.reserved.clear();
  }

  createSimId() { return newSimId(); }
  fullName = fullName;
  mood(s: Sim) { return mood(s, this.now); }
  socials = SOCIALS;
}

function add2(a: P, b: P): P {
  return { x: a.x + b.x, y: a.y + b.y };
}
