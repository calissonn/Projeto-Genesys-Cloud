import * as THREE from 'three';
import type { Editor, ToolPointer } from '../editor/editor';
import type { Tool } from '../editor/tools';
import type { Simulation, Speed } from '../sim/simulation';
import { SimView } from '../render/simView';
import { h, iconBtn, modal } from './dom';
import { ICONS } from './icons';
import {
  NEEDS, AGE_BY_ID, CAREER_BY_ID, SKILLS, ASPIRATIONS, TRAIT_BY_ID, WEEKDAYS, dayOf, fmtClock, hourOf, moodLabel, isAdult, canWalk,
  type Sim,
} from '../model/life';
import { interactionsForObject, SOCIALS, PET_ACTIONS } from '../sim/interactions';
import { CATALOG_BY_ID } from '../model/catalog';
import { balance, computeCost, fmtMoney, levelName } from '../model/project';
import { simPortrait, petPortrait } from './portraits';
import { openCAS } from './cas';

export interface LifeCallbacks {
  openMenu(): void;
  openSettings(): void;
  toBuild(): void;
  toast(msg: string): void;
}

type CamMode = 'livre' | 'seguir' | 'pessoa';

/** Interface do modo Vida. */
export class LifeHud {
  root: HTMLElement;
  view: SimView;
  selected: string | null = null;
  tool: Tool;
  private roster: HTMLElement;
  private card: HTMLElement;
  private side: HTMLElement;
  private labels: HTMLElement;
  private clockEl: HTMLElement;
  private money: HTMLElement;
  private levelLabel: HTMLElement;
  private speedBtns: HTMLButtonElement[] = [];
  private camBtn: HTMLButtonElement;
  private panelBtn!: HTMLButtonElement;
  private panelOpen = window.innerWidth >= 1000;
  private menu: HTMLElement | null = null;
  private tab = 'necessidades';
  private camMode: CamMode = 'livre';
  private refreshAcc = 0;
  private lastHour = -1;
  private wasNight = false;
  private offs: (() => void)[] = [];
  visible = false;

  constructor(parent: HTMLElement, private e: Editor, private sim: Simulation, private cb: LifeCallbacks) {
    this.view = new SimView(e.engine, sim);
    this.root = h('div', { class: 'hud life hidden' });
    parent.append(this.root);
    this.clockEl = h('div', { class: 'clock' });
    this.money = h('div', { class: 'money' });
    this.levelLabel = h('div', { class: 'level-label' });
    const speeds: [Speed, string, string][] = [[0, '❚❚', 'Pausar'], [1, '▶', 'Velocidade normal'], [2, '▶▶', 'Rápido'], [3, '▶▶▶', 'Muito rápido']];
    const speedGroup = h('div', { class: 'speeds' });
    for (const [sp, label, title] of speeds) {
      const b = h('button', { title, 'aria-label': title, onclick: () => { sim.speed = sp; this.syncTop(); } }, label) as HTMLButtonElement;
      this.speedBtns.push(b);
      speedGroup.append(b);
    }
    this.camBtn = iconBtn(ICONS.eye, 'Câmera: livre / seguir / primeira pessoa', () => this.cycleCam());
    const top = h('div', { class: 'topbar' },
      h('div', { class: 'group' },
        iconBtn(ICONS.menu, 'Menu', () => cb.openMenu()),
        h('div', { class: 'mode-switch' },
          h('button', { onclick: () => cb.toBuild() }, '🔨 Construir'),
          h('button', { class: 'on' }, '🏠 Viver')),
        this.money),
      h('div', { class: 'group' }, this.clockEl, speedGroup),
      h('div', { class: 'group' },
        iconBtn(ICONS.down, 'Descer andar', () => e.setLevel(e.view.level - 1)),
        this.levelLabel,
        iconBtn(ICONS.up, 'Subir andar', () => e.setLevel(e.view.level + 1)),
        h('span', { class: 'sep' }),
        iconBtn(ICONS.wall, 'Paredes: inteiras / baixas / ocultas', () => {
          const order = ['inteiras', 'baixas', 'ocultas'] as const;
          e.setView({ wallMode: order[(order.indexOf(e.view.wallMode) + 1) % 3] });
          cb.toast(`Paredes ${e.view.wallMode}`);
        }),
        iconBtn(ICONS.roof, 'Mostrar / ocultar telhados', () => { e.setView({ showRoof: !e.view.showRoof }); }),
        this.camBtn,
        this.panelBtn = iconBtn(ICONS.layers, 'Mostrar / ocultar painel de necessidades', () => this.togglePanel()),
        iconBtn(ICONS.settings, 'Configurações', () => cb.openSettings()),
      ),
    );
    this.roster = h('div', { class: 'roster' });
    this.card = h('div', { class: 'simcard' });
    this.side = h('div', { class: 'lifeside' });
    this.labels = h('div', { class: 'labels' });
    this.root.append(this.labels, top, this.roster, this.card, this.side);
    this.applyPanel();

    this.tool = {
      id: 'vida', name: 'Viver', hint: '',
      down: () => false,
      tap: (p) => this.onTap(p),
      longPress: (p) => this.onTap(p),
    };
    this.offs.push(
      sim.on('roster', () => { this.renderRoster(); this.renderCard(); this.renderSide(); }),
      sim.on('update', () => this.renderCard()),
      e.on('view', () => this.syncTop()),
    );
  }

  destroy() {
    this.offs.forEach((f) => f());
    this.view.clear();
    this.e.engine.scene.remove(this.view.group);
    this.closeMenu();
    this.root.remove();
  }

  show() {
    this.visible = true;
    this.root.classList.remove('hidden');
    if (!this.selected || !this.sim.agents.has(this.selected)) this.selected = this.sim.household.find((s) => canWalk(s.age))?.id ?? this.sim.household[0]?.id ?? null;
    this.renderRoster();
    this.renderCard();
    this.renderSide();
    this.syncTop();
    this.e.world.setGridVisible(false);
    if (this.selected) this.focus(this.selected);
    if (!this.sim.household.length) this.openFamily();
  }

  private togglePanel() {
    this.panelOpen = !this.panelOpen;
    this.applyPanel();
  }

  private applyPanel() {
    this.root.classList.toggle('panel-closed', !this.panelOpen);
    this.panelBtn.classList.toggle('on', this.panelOpen);
  }

  /** Centraliza a câmera no personagem. */
  focus(id: string) {
    const a = this.sim.agents.get(id);
    if (!a || a.sim.away) return;
    if (a.sim.level !== this.e.view.level) this.e.setLevel(a.sim.level);
    this.e.rig.target.set(a.sim.pos.x, a.y, a.sim.pos.y);
    this.e.rig.distance = Math.min(this.e.rig.distance, 16);
    this.e.rig.update();
  }

  hide() {
    this.visible = false;
    this.e.world.setGridVisible(true);
    this.root.classList.add('hidden');
    this.closeMenu();
    if (this.camMode !== 'livre') { this.camMode = 'livre'; this.e.rig.setMode('3d'); }
  }

  /* ------------------------------------------------------------ Quadro */

  frame(dt: number) {
    this.sim.update(dt);
    this.view.sync(this.e.view, this.visible ? this.selected : null, dt, this.sim.speed > 0 || true);
    const now = this.sim.now;
    // Iluminação acompanha o relógio.
    const hr = hourOf(now);
    if (Math.abs(hr - this.lastHour) > 0.08) {
      this.lastHour = hr;
      this.e.engine.setHour(Math.max(0, Math.min(24, hr)));
      const night = this.e.engine.nightFactor > 0.35;
      if (night !== this.wasNight) { this.wasNight = night; this.e.rebuild(); }
    }
    this.followCamera();
    this.positionLabels();
    this.refreshAcc += dt;
    if (this.refreshAcc > 0.25) {
      this.refreshAcc = 0;
      this.syncTop();
      this.updateBars();
    }
    this.e.engine.invalidate();
  }

  private cycleCam() {
    const order: CamMode[] = ['livre', 'seguir', 'pessoa'];
    this.camMode = order[(order.indexOf(this.camMode) + 1) % 3];
    if (this.camMode === 'pessoa') {
      const a = this.selected && this.sim.agents.get(this.selected);
      if (!a) { this.camMode = 'livre'; this.cb.toast('Selecione um personagem para a primeira pessoa.'); return; }
      this.e.rig.fp.look = 0;
      this.e.rig.fp.pitch = -0.08;
      this.e.rig.setMode('pessoa');
    } else {
      this.e.rig.setMode('3d');
      if (this.camMode === 'seguir') this.e.rig.distance = Math.min(this.e.rig.distance, 14);
    }
    this.cb.toast(this.camMode === 'livre' ? 'Câmera livre' : this.camMode === 'seguir' ? 'Câmera seguindo o personagem' : 'Primeira pessoa: arraste para olhar ao redor');
    this.camBtn.classList.toggle('on', this.camMode !== 'livre');
  }

  private followCamera() {
    if (this.camMode === 'livre' || !this.selected) return;
    const a = this.sim.agents.get(this.selected);
    if (!a) return;
    if (this.camMode === 'seguir') {
      const t = this.e.rig.target;
      t.x += (a.sim.pos.x - t.x) * 0.1;
      t.z += (a.sim.pos.y - t.z) * 0.1;
      t.y += (a.y + 1 - t.y) * 0.1;
      this.e.rig.update();
    } else {
      const eye = this.view.eyePos(this.selected);
      if (eye) {
        this.e.rig.fp.pos.copy(eye).add(new THREE.Vector3(Math.sin(a.sim.rot) * 0.12, 0, Math.cos(a.sim.rot) * 0.12));
        this.e.rig.fp.yaw += (a.sim.rot - this.e.rig.fp.yaw) * 0.15;
        this.e.rig.update();
      }
    }
  }

  private syncTop() {
    const p = this.e.project;
    const now = this.sim.now;
    this.clockEl.textContent = `${WEEKDAYS[dayOf(now) % 7].slice(0, 3)} ${fmtClock(now)} · dia ${dayOf(now) + 1}`;
    this.speedBtns.forEach((b, i) => b.classList.toggle('on', i === this.sim.speed));
    this.money.textContent = p.mode === 'criativo' ? '∞ Criativo' : fmtMoney(balance(p));
    this.levelLabel.textContent = levelName(this.e.view.level);
  }

  /* ------------------------------------------------------------ Seleção e menus */

  select(id: string) {
    this.selected = id;
    this.renderRoster();
    this.renderCard();
    this.renderSide();
    if (this.camMode === 'livre') this.focus(id);
  }

  private closeMenu() {
    this.menu?.remove();
    this.menu = null;
  }

  private openMenu(x: number, y: number, title: string, items: { icon: string; label: string; why?: string | null; action: () => void }[]) {
    this.closeMenu();
    if (!items.length) return;
    const openedAt = performance.now();
    const m = h('div', { class: 'pie' },
      h('div', { class: 'pie-title' }, title),
      ...items.map((it) => h('button', {
        class: it.why ? 'off' : '',
        onclick: () => {
          // Evita o clique "fantasma" gerado pelo próprio toque que abriu o menu.
          if (performance.now() - openedAt < 350) return;
          if (it.why) { this.cb.toast(it.why); return; }
          this.closeMenu();
          it.action();
        },
      }, h('span', { class: 'ic' }, it.icon), h('span', {}, it.label, it.why ? h('small', {}, it.why) : null))),
    );
    this.root.append(m);
    const r = m.getBoundingClientRect();
    // Abre ao lado do dedo (nunca embaixo dele).
    const right = x + 28 + r.width < window.innerWidth - 8;
    m.style.left = `${right ? x + 28 : Math.max(8, x - 28 - r.width)}px`;
    m.style.top = `${Math.max(56, Math.min(window.innerHeight - r.height - 8, y - 40))}px`;
    this.menu = m;
  }

  private actor(): Sim | null {
    const a = this.selected ? this.sim.agents.get(this.selected) : null;
    return a && !a.sim.visitor ? a.sim : null;
  }

  private onTap(p: ToolPointer) {
    this.closeMenu();
    const x = p.ev.clientX, y = p.ev.clientY;
    const hitSim = this.view.pick(p.rc);
    const me = this.actor();
    if (hitSim?.simId) {
      const target = this.sim.agents.get(hitSim.simId)!.sim;
      if (!target.visitor && (!me || target.id === me.id || !canWalk(me.age))) { this.select(target.id); return; }
      if (!me) { this.cb.toast('Selecione alguém da família primeiro.'); return; }
      if (!canWalk(me.age)) { this.select(target.id); return; }
      const items = SOCIALS.map((sd) => ({
        icon: sd.icon, label: sd.name, why: sd.require(this.sim.socialContext(me, target)),
        action: () => this.sim.enqueue(me.id, this.sim.socialTask(sd, target.id)),
      })).filter((i) => !i.why || !/Apenas|Somente adolescentes|Já mora|Bebês não/.test(i.why));
      if (!target.visitor) items.unshift({ icon: '👆', label: `Controlar ${target.firstName}`, why: null, action: () => this.select(target.id) });
      this.openMenu(x, y, `${target.firstName} ${target.lastName} · ${this.sim.relLabel(me.id, target.id)}`, items);
      return;
    }
    if (hitSim?.petId) {
      const pa = this.sim.pets.get(hitSim.petId)!;
      if (!me || !canWalk(me.age)) { this.cb.toast('Selecione alguém da família primeiro.'); return; }
      this.openMenu(x, y, `${pa.pet.name} (${pa.pet.kind})`, PET_ACTIONS.map((pact) => ({
        icon: pact.icon, label: pact.name, why: pact.id === 'alimentar_pet' && me.age === 'crianca' ? 'Criança não alcança a ração' : null,
        action: () => this.sim.enqueue(me.id, this.sim.petTask(pact, pa.pet.id)),
      })));
      return;
    }
    if (!me) { this.cb.toast('Crie ou selecione uma família para jogar.'); return; }
    const hit = this.e.world.pick(p.rc, ['item']);
    if (hit) {
      const it = this.e.project.items.find((i) => i.id === hit.ref.id);
      const def = it && CATALOG_BY_ID.get(it.catalogId);
      if (it && def) {
        const list = interactionsForObject(it.catalogId).map((d) => ({
          icon: d.icon,
          label: d.name + (d.cost && this.e.project.mode === 'simulacao' ? ` (${fmtMoney(d.cost)})` : ''),
          why: d.ages && !d.ages.includes(me.age) ? `Não disponível para ${AGE_BY_ID.get(me.age)!.name.toLowerCase()}` : null,
          action: () => this.sim.enqueue(me.id, this.sim.objectTask(d, it.id)),
        }));
        if (list.length) { this.openMenu(x, y, def.name, list); return; }
      }
    }
    if (p.ground) {
      const ground = p.ground;
      const lvl = this.e.view.level;
      this.openMenu(x, y, 'Local', [
        { icon: '🚶', label: 'Ir até aqui', action: () => this.sim.enqueue(me.id, this.sim.goTask(lvl, ground)) },
        ...(this.sim.life.partyUntil && this.sim.now < this.sim.life.partyUntil ? [{ icon: '💃', label: 'Dançar', action: () => this.sim.enqueue(me.id, this.sim.danceTask()) }] : []),
      ]);
    }
  }

  /* ------------------------------------------------------------ Elenco e cartão */

  renderRoster() {
    const r = this.roster;
    r.innerHTML = '';
    for (const s of this.sim.household) {
      const m = moodLabel(this.sim.mood(s));
      r.append(h('button', {
        class: `face ${s.id === this.selected ? 'on' : ''} ${s.away ? 'away' : ''}`,
        title: `${s.firstName} — ${m.text}`,
        style: { borderColor: m.color },
        onclick: () => this.select(s.id),
      }, h('img', { src: simPortrait(s), alt: s.firstName }), s.away ? h('span', { class: 'tag' }, s.away === 'escola' ? '🎒' : '💼') : null));
    }
    for (const pa of this.sim.pets.values()) {
      r.append(h('button', { class: 'face pet', title: pa.pet.name, onclick: () => this.cb.toast(`${pa.pet.name}: fome ${Math.round(pa.pet.needs.fome)} · diversão ${Math.round(pa.pet.needs.diversao)} · energia ${Math.round(pa.pet.needs.energia)}`) },
        h('img', { src: petPortrait(pa.pet), alt: pa.pet.name })));
    }
    r.append(h('button', { class: 'face add', title: 'Família', onclick: () => this.openFamily() }, '👥'));
  }

  renderCard() {
    const c = this.card;
    c.innerHTML = '';
    const a = this.selected ? this.sim.agents.get(this.selected) : null;
    if (!a) { c.classList.add('hidden'); return; }
    c.classList.remove('hidden');
    const s = a.sim;
    const m = moodLabel(this.sim.mood(s));
    const career = CAREER_BY_ID.get(s.career);
    const queue = h('div', { class: 'queue' }, ...a.queue.map((t, i) => h('button', {
      class: `qi ${i === 0 ? 'cur' : ''}`, title: `${t.label} — toque para cancelar`,
      onclick: () => { if (a.queue[i]?.kind === 'leave' && !s.visitor) { this.cb.toast('Não dá para faltar ao trabalho/escola.'); return; } this.sim.cancelTask(a, i); },
    }, h('span', {}, t.icon), h('small', {}, t.label))));
    if (!a.queue.length) queue.append(h('span', { class: 'muted small' }, s.away ? (s.away === 'escola' ? 'Na escola' : 'No trabalho') : canWalk(s.age) ? (this.sim.life.autonomy ? 'Livre (autonomia ativa)' : 'Aguardando ordens') : 'Bebê — peça a um adulto para cuidar'));
    c.append(
      h('div', { class: 'who' },
        h('img', { src: simPortrait(s), alt: '' }),
        h('div', {},
          h('b', {}, `${s.firstName} ${s.lastName}`),
          h('small', {}, `${AGE_BY_ID.get(s.age)!.name}${career && career.hours ? ` · ${career.titles[s.careerLevel]}` : ''}${s.visitor ? ' · visitante' : ''}`),
          h('span', { class: 'mood', style: { color: m.color } }, `● ${m.text}`)),
      ),
      queue,
    );
  }

  private updateBars() {
    const a = this.selected ? this.sim.agents.get(this.selected) : null;
    if (!a) return;
    this.side.querySelectorAll<HTMLElement>('[data-need]').forEach((el) => {
      const v = a.sim.needs[el.dataset.need as keyof Sim['needs']];
      const bar = el.querySelector('i') as HTMLElement;
      bar.style.width = `${v}%`;
      bar.style.background = v > 60 ? '#4fd18b' : v > 35 ? '#e0c34f' : v > 15 ? '#f29544' : '#ff6b6b';
    });
    // Humor no elenco
    this.roster.querySelectorAll<HTMLElement>('.face').forEach((el, i) => {
      const s = this.sim.household[i];
      if (s) el.style.borderColor = moodLabel(this.sim.mood(s)).color;
    });
    const moodEl = this.card.querySelector('.mood') as HTMLElement | null;
    if (moodEl) { const m = moodLabel(this.sim.mood(a.sim)); moodEl.textContent = `● ${m.text}`; moodEl.style.color = m.color; }
  }

  /* ------------------------------------------------------------ Painel lateral */

  renderSide() {
    const sd = this.side;
    sd.innerHTML = '';
    const a = this.selected ? this.sim.agents.get(this.selected) : null;
    const tabs: [string, string][] = [['necessidades', 'Necessidades'], ['humor', 'Humor'], ['relacoes', 'Relações'], ['habilidades', 'Habilidades'], ['carreira', 'Carreira'], ['familia', 'Família']];
    sd.append(h('div', { class: 'seg tabs' }, ...tabs.map(([id, n]) => h('button', { class: this.tab === id ? 'on' : '', onclick: () => { this.tab = id; this.renderSide(); } }, n))));
    const body = h('div', { class: 'side-body' });
    const putbody = (...els: (Node | string | null | undefined)[]) => body.append(...(els.filter((x) => x != null) as (Node | string)[]));
    sd.append(body);
    const s = a?.sim;
    const bar = (label: string, v: number, max = 100, need?: string, color?: string) =>
      h('div', { class: 'bar', 'data-need': need }, h('span', {}, label), h('div', { class: 'track' }, h('i', { style: { width: `${(v / max) * 100}%`, background: color ?? (v / max > 0.6 ? '#4fd18b' : v / max > 0.35 ? '#e0c34f' : '#f29544') } })));
    if (this.tab !== 'familia' && !s) { putbody(h('p', { class: 'muted' }, 'Ninguém selecionado.')); return; }
    switch (this.tab) {
      case 'necessidades':
        for (const n of NEEDS) putbody(bar(`${n.icon} ${n.name}`, s!.needs[n.id], 100, n.id));
        break;
      case 'humor': {
        const m = moodLabel(this.sim.mood(s!));
        putbody(h('p', {}, h('b', { style: { color: m.color } }, m.text)));
        if (s!.traits.length) putbody(h('p', { class: 'small' }, 'Traços: ', s!.traits.map((t) => TRAIT_BY_ID.get(t)?.name).join(', ')));
        const ml = s!.moodlets.filter((x) => x.until > this.sim.now);
        if (!ml.length) putbody(h('p', { class: 'muted small' }, 'Nenhum sentimento especial no momento.'));
        for (const x of ml) putbody(h('div', { class: 'moodlet' }, h('span', {}, x.name), h('b', { style: { color: x.value >= 0 ? '#4fd18b' : '#ff6b6b' } }, `${x.value > 0 ? '+' : ''}${x.value}`), h('small', {}, `${Math.ceil((x.until - this.sim.now) / 60)} h`)));
        if (s!.pregnantUntil) putbody(h('p', { class: 'small' }, `🤰 Bebê a caminho: chega em ${Math.ceil((s!.pregnantUntil - this.sim.now) / 60)} h`));
        break;
      }
      case 'relacoes': {
        const others = this.sim.life.sims.filter((o) => o.id !== s!.id && this.sim.rel(s!.id, o.id));
        if (!others.length) putbody(h('p', { class: 'muted' }, 'Ainda não conhece ninguém. Converse com visitantes!'));
        for (const o of others) {
          const r = this.sim.rel(s!.id, o.id)!;
          putbody(h('div', { class: 'relrow' },
            h('img', { src: simPortrait(o), alt: '' }),
            h('div', {}, h('b', {}, `${o.firstName} ${o.lastName}`), h('small', {}, this.sim.relLabel(s!.id, o.id)),
              bar('Amizade', r.amizade + 100, 200, undefined, r.amizade >= 0 ? '#5aa9ff' : '#ff6b6b'),
              r.romance > 0 ? bar('Romance', r.romance, 100, undefined, '#e86fa6') : null)));
        }
        break;
      }
      case 'habilidades':
        for (const sk of SKILLS) putbody(bar(`${sk.name} ${s!.skills[sk.id].toFixed(1)}`, s!.skills[sk.id], 10, undefined, '#5aa9ff'));
        putbody(this.aspiration(s!));
        break;
      case 'carreira': {
        const c = CAREER_BY_ID.get(s!.career)!;
        if (!c.hours) {
          putbody(h('p', { class: 'muted' }, s!.age === 'bebe' ? 'Bebês não trabalham.' : 'Sem emprego.'));
          if (isAdult(s!.age) && !s!.visitor) {
            putbody(h('p', { class: 'small' }, 'Procurar emprego:'), h('div', { class: 'seg wrap' }, ...[...CAREER_BY_ID.values()].filter((x) => x.hours && !x.kids).map((x) => h('button', {
              onclick: () => { s!.career = x.id; s!.careerLevel = 0; s!.performance = 0; this.cb.toast(`${s!.firstName} agora trabalha com ${x.name.toLowerCase()} (${x.titles[0]}).`); this.renderSide(); this.renderCard(); },
            }, `${x.name} · ${fmtMoney(x.wage[0])}/h`))));
          }
          break;
        }
        putbody(
          h('p', {}, h('b', {}, c.name), h('br'), c.titles[s!.careerLevel]),
          h('p', { class: 'small' }, `Horário: ${String(c.start).padStart(2, '0')}h às ${String(c.start + c.hours).padStart(2, '0')}h, de segunda a sexta`),
          c.kids ? null : h('p', { class: 'small' }, `Salário: ${fmtMoney(c.wage[s!.careerLevel])}/h · ${fmtMoney(c.wage[s!.careerLevel] * c.hours)}/dia`),
          bar('Desempenho', Math.max(0, s!.performance), 100, undefined, '#e0b84f'),
          h('p', { class: 'muted small' }, c.kids ? 'Bom humor melhora as notas.' : 'Bom humor e a habilidade da área aceleram promoções.'),
          !c.kids && !s!.visitor ? h('button', { class: 'chip danger', onclick: () => { if (confirm(`${s!.firstName} vai pedir demissão?`)) { s!.career = 'nenhuma'; s!.careerLevel = 0; this.renderSide(); } } }, 'Pedir demissão') : null,
        );
        break;
      }
      case 'familia': {
        const life = this.sim.life;
        const p = this.e.project;
        putbody(
          h('p', {}, h('b', {}, `Família ${life.householdName}`), h('br'), h('small', { class: 'muted' }, `${this.sim.household.length} membro(s) · ${life.pets.length} pet(s)`)),
          p.mode === 'simulacao' ? h('p', { class: 'small' }, `Patrimônio: ${fmtMoney(balance(p) + computeCost(p).total + p.lot.price)}`) : null,
          h('div', { class: 'actions-grid' },
            h('button', { onclick: () => this.openFamily() }, '👥 Editar família'),
            h('button', { onclick: () => { this.sim.inviteVisitor(1, 4); this.cb.toast('Um visitante está chegando!'); } }, '🚪 Convidar visita'),
            h('button', { onclick: () => this.sim.throwParty() }, `🎉 Dar uma festa${p.mode === 'simulacao' ? ' (R$ 600)' : ''}`),
            h('button', { onclick: () => this.adopt() }, `🐾 Adotar pet${p.mode === 'simulacao' ? ' (R$ 450)' : ''}`),
            h('button', { class: life.autonomy ? 'on' : '', onclick: () => { life.autonomy = !life.autonomy; this.cb.toast(life.autonomy ? 'Autonomia ligada: os personagens cuidam de si quando estão livres.' : 'Autonomia desligada: personagens só agem sob comando (visitantes continuam autônomos).'); this.renderSide(); } }, `🤖 Autonomia ${life.autonomy ? 'ligada' : 'desligada'}`),
            h('button', { class: life.aging ? 'on' : '', onclick: () => { life.aging = !life.aging; this.renderSide(); } }, `⏳ Envelhecer ${life.aging ? 'ligado' : 'desligado'}`),
            h('button', { onclick: () => this.diary() }, '📜 Diário'),
          ),
        );
        break;
      }
    }
  }

  private aspiration(s: Sim) {
    const asp = ASPIRATIONS.find((x) => x.id === s.aspiration);
    if (!asp || s.age === 'bebe') return h('div');
    let prog = 0;
    const life = this.sim.life;
    const p = this.e.project;
    switch (asp.id) {
      case 'familia': prog = life.relationships.filter((r) => r.kind === 'pai' && r.a === s.id).length / 3; break;
      case 'fortuna': prog = p.mode === 'simulacao' ? (balance(p) + computeCost(p).total + p.lot.price) / 1_000_000 : 1; break;
      case 'carreira': { const c = CAREER_BY_ID.get(s.career)!; prog = c.titles.length > 1 ? s.careerLevel / (c.titles.length - 1) : 0; break; }
      case 'social': prog = life.relationships.filter((r) => (r.a === s.id || r.b === s.id) && r.amizade >= 30).length / 5; break;
      case 'conhecimento': prog = s.skills.logica / 10; break;
      case 'atleta': prog = s.skills.fitness / 10; break;
      case 'romance': prog = life.relationships.some((r) => (r.a === s.id || r.b === s.id) && r.kind === 'conjuge') ? 1 : 0; break;
    }
    prog = Math.max(0, Math.min(1, prog));
    return h('div', { class: 'asp' }, h('b', {}, `Aspiração: ${asp.name}`), h('small', {}, asp.desc),
      h('div', { class: 'bar' }, h('span', {}, prog >= 1 ? 'Concluída ✓' : `${Math.round(prog * 100)}%`), h('div', { class: 'track' }, h('i', { style: { width: `${prog * 100}%`, background: '#b07de0' } }))));
  }

  private positionLabels() {
    const L = this.labels;
    const list: { text: string; pos: THREE.Vector3; cls: string }[] = [];
    if (this.visible && this.camMode !== 'pessoa') {
      for (const a of this.sim.agents.values()) {
        if (!a.visible) continue;
        const hp = this.view.headPos(a.sim.id);
        if (!hp) continue;
        const t = a.queue[0];
        const icon = a.thought ?? (t && t.phase === 'act' ? t.icon : '');
        if (a.sim.id === this.selected || a.sim.visitor || icon) list.push({ text: `${icon ? icon + ' ' : ''}${a.sim.id === this.selected || a.sim.visitor ? a.sim.firstName : ''}`.trim(), pos: hp, cls: a.sim.visitor ? 'visitor' : a.sim.id === this.selected ? 'sel' : '' });
      }
    }
    while (L.children.length < list.length) L.append(h('div', { class: 'bubble' }));
    while (L.children.length > list.length) L.lastChild!.remove();
    list.forEach((l, i) => {
      const el = L.children[i] as HTMLElement;
      const sp = this.e.rig.project(l.pos);
      el.textContent = l.text;
      el.className = `bubble ${l.cls}`;
      el.style.display = sp.visible && l.text ? '' : 'none';
      el.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -100%)`;
    });
  }

  /* ------------------------------------------------------------ Família, pets, diário */

  openFamily() {
    const prevSpeed = this.sim.speed;
    this.sim.speed = 0;
    const members = this.sim.household;
    const ids = new Set(members.map((m) => m.id));
    openCAS(
      { members, rels: this.sim.life.relationships.filter((r) => ids.has(r.a) && ids.has(r.b)), familyName: this.sim.life.householdName === this.e.project.name && !members.length ? '' : this.sim.life.householdName },
      (res) => {
        if (!members.length) {
          this.sim.moveInFamily(res.members, res.rels, res.familyName);
          this.selected = this.sim.household.find((s) => canWalk(s.age))?.id ?? null;
          if (this.selected) setTimeout(() => this.selected && this.focus(this.selected), 50);
          this.cb.toast(`A família ${res.familyName} se mudou! Toque em objetos e pessoas para interagir.`);
        } else {
          // Atualiza membros existentes, adiciona novos e remove os excluídos.
          const keep = new Set(res.members.map((m) => m.id));
          for (const old of members) if (!keep.has(old.id)) this.sim.removeSim(old.id);
          for (const m of res.members) {
            const cur = this.sim.life.sims.find((x) => x.id === m.id);
            if (cur) Object.assign(cur, { firstName: m.firstName, lastName: m.lastName, age: m.age, look: m.look, traits: m.traits, aspiration: m.aspiration, career: m.career, careerLevel: cur.career === m.career ? cur.careerLevel : 0 });
            else {
              this.sim.life.sims.push(m);
              const ag = this.sim.addAgent(m);
              this.sim.spawn(m);
              if (m.age === 'bebe') this.sim.placeBaby(ag, false);
            }
          }
          const all = new Set(res.members.map((m) => m.id));
          this.sim.life.relationships = this.sim.life.relationships.filter((r) => !(all.has(r.a) && all.has(r.b)) || res.rels.some((x) => x.a === r.a && x.b === r.b));
          for (const r of res.rels) {
            const ex = this.sim.life.relationships.find((x) => x.a === r.a && x.b === r.b);
            if (ex) ex.kind = r.kind; else this.sim.life.relationships.push(r);
          }
          this.sim.life.householdName = res.familyName;
          this.sim.emit('roster', null);
          this.e.saveNow();
        }
        this.selected = this.sim.household.find((s) => canWalk(s.age))?.id ?? null;
        this.sim.speed = prevSpeed || 1;
        this.renderRoster(); this.renderCard(); this.renderSide();
      },
      () => { this.sim.speed = prevSpeed; },
    );
  }

  private adopt() {
    let kind: 'cachorro' | 'gato' = 'cachorro';
    const name = h('input', { type: 'text', value: 'Pipoca', maxlength: 20 }) as HTMLInputElement;
    const seg = h('div', { class: 'seg' });
    const draw = () => {
      seg.innerHTML = '';
      for (const [k, n] of [['cachorro', '🐶 Cachorro'], ['gato', '🐱 Gato']] as const) seg.append(h('button', { class: kind === k ? 'on' : '', onclick: () => { kind = k; draw(); } }, n));
    };
    draw();
    const dlg = modal('Adotar um pet', h('div', {},
      h('div', { class: 'field' }, h('label', {}, 'Espécie'), seg),
      h('div', { class: 'field' }, h('label', {}, 'Nome'), name),
      h('div', { class: 'row-end' }, h('button', { class: 'big primary', onclick: () => { if (this.sim.adoptPet(kind, name.value.trim() || 'Pipoca')) dlg.close(); } }, 'Adotar')),
    ));
  }

  private diary() {
    const log = [...this.sim.life.log].reverse();
    modal('Diário da família', h('div', { class: 'list' },
      ...(log.length ? log.map((l) => h('div', { class: 'list-item' }, h('div', {}, h('small', {}, `Dia ${dayOf(l.t) + 1}, ${fmtClock(l.t)}`), l.text))) : [h('p', { class: 'muted' }, 'Nada registrado ainda.')]),
    ));
  }
}
