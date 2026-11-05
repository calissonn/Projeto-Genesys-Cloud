import * as Phaser from 'phaser';
import type { Agent } from '@acc/shared';
import { FLOORS, FLOOR_H, ELEVATOR_DOOR_X, ROOF_H, ROOM_X, WORLD_H, WORLD_W, feetY, floorTop, type StationKind } from '../building/layout';
import { AgentActor, type ActorDebug, type ElevatorLike } from '../agents/AgentActor';
import { targetFor, type Screen, type Target } from '../agents/behavior';
import { ANIMS, DEFAULT_PALETTE, FRAMES, FRAME_H, FRAME_W, ICONS, PALETTES, drawCharacterSheet, drawIcon } from '../sprites/character';
import { drawElevatorCar, drawExterior, drawRoom, drawShaft, drawStation, type ScreenArea } from '../sprites/furniture';
import type { AccState } from '../../lib/reducer';
import { PX } from '../building/layout';

export interface SceneBridge {
  onSelect(agentId: string): void;
  onReady(scene: BuildingScene): void;
}

interface ScreenSlot {
  area: ScreenArea;
  mode: Screen;
}

type BoardKind = Extract<StationKind, 'tasks-board' | 'error-board' | 'projects-board' | 'approval-center'>;

class Elevator implements ElevatorLike {
  private chain: Promise<void> = Promise.resolve();
  private level = 1;
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly car: Phaser.GameObjects.Container,
  ) {}
  private carY(level: number) {
    return floorTop(level) + FLOOR_H - 2;
  }
  private move(level: number): Promise<void> {
    const floors = Math.abs(level - this.level);
    this.level = level;
    if (!floors) return Promise.resolve();
    return new Promise((resolve) => {
      this.scene.tweens.add({ targets: this.car, y: this.carY(level), duration: 260 * floors, ease: 'Sine.InOut', onComplete: () => resolve() });
    });
  }
  /** As viagens entram em fila: um único carro atende a todos. */
  ride(from: number, to: number): Promise<void> {
    const trip = this.chain.then(async () => {
      await this.move(from);
      await this.move(to);
    });
    this.chain = trip.catch(() => undefined);
    return trip;
  }
  place(level: number) {
    this.level = level;
    this.car.y = this.carY(level);
  }
}

export class BuildingScene extends Phaser.Scene {
  private bridge!: SceneBridge;
  private actors = new Map<string, AgentActor>();
  private elevator!: Elevator;
  private screens = new Map<string, ScreenSlot>(); // por id do posto
  private screenLayer!: Phaser.GameObjects.Graphics;
  private protoArea: ScreenArea | null = null;
  private protoActive = false;
  private boards = new Map<BoardKind, Phaser.GameObjects.Text>();
  private tick = 0;
  private selectedId: string | null = null;
  private lastState: AccState | null = null;
  private ready = false;
  private pendingApprovals = 0;

  constructor() {
    super('building');
  }

  init(data: { bridge: SceneBridge }) {
    this.bridge = data.bridge;
  }

  create() {
    for (const name of Object.keys(ICONS)) this.textures.addCanvas(`icon-${name}`, drawIcon(name));

    const groundTop = ROOF_H + FLOORS.length * FLOOR_H;
    const bg = this.add.graphics().setDepth(0);
    drawExterior(bg, WORLD_W, WORLD_H, ROOF_H, groundTop);
    this.add
      .text(ROOM_X + 160, ROOF_H - 32, 'AI COMMAND CENTER', { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '15px', color: '#5eead4', fontStyle: 'bold', resolution: 2 })
      .setOrigin(0.5)
      .setDepth(2);

    const rooms = this.add.graphics().setDepth(1);
    const furniture = this.add.graphics().setDepth(5);
    for (const floor of FLOORS) {
      const top = floorTop(floor.level);
      drawRoom(rooms, floor, top);
      drawShaft(rooms, top, floor.level);
      this.add
        .text(ELEVATOR_DOOR_X, top + FLOOR_H - 81, String(floor.level), { fontFamily: 'ui-monospace, monospace', fontSize: '10px', color: '#fbbf24', resolution: 2 })
        .setOrigin(0.5)
        .setDepth(3);
      this.add
        .text(ROOM_X + 28, top + 16, floor.name.toUpperCase(), { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '11px', color: '#ffffff', backgroundColor: '#00000066', padding: { x: 4, y: 2 }, resolution: 2 })
        .setDepth(3);
      if (floor.note) {
        this.add
          .text(ROOM_X + 160, top + 16, floor.note, { fontFamily: 'ui-monospace, monospace', fontSize: '10px', color: '#fde68a', backgroundColor: '#00000066', padding: { x: 4, y: 2 }, resolution: 2 })
          .setDepth(3);
      }
      const fy = feetY(floor.level);
      for (const s of floor.stations) {
        const area = drawStation(furniture, s, fy, top, floor);
        if (s.kind === 'desk' || s.kind === 'admin-desk' || s.kind === 'lab' || s.kind === 'approval-center') {
          if (area) this.screens.set(s.id, { area, mode: 'off' });
        }
        if (s.kind === 'prototype-wall') this.protoArea = area;
        if (s.kind === 'desk' && s.owner === null) {
          this.add.text(s.x, fy - 10, 'vaga', { fontFamily: 'ui-monospace, monospace', fontSize: '8px', color: '#334155', resolution: 2 }).setOrigin(0.5).setDepth(6);
        }
        if (s.kind === 'admin-desk') {
          this.add.text(s.x, fy - 76, 'VOCÊ', { fontFamily: 'ui-monospace, monospace', fontSize: '9px', color: '#fde68a', backgroundColor: '#00000088', padding: { x: 3, y: 1 }, resolution: 2 }).setOrigin(0.5).setDepth(6);
        }
        if (s.kind === 'tasks-board' || s.kind === 'error-board' || s.kind === 'projects-board' || s.kind === 'approval-center') {
          const y = s.kind === 'approval-center' ? top + 37 : top + 48;
          const color = s.kind === 'projects-board' ? '#1f2937' : '#e2e8f0';
          const text = this.add
            .text(s.x, y, '', { fontFamily: 'ui-monospace, monospace', fontSize: '9px', color, align: 'center', resolution: 2, lineSpacing: 2 })
            .setOrigin(0.5)
            .setDepth(7);
          this.boards.set(s.kind, text);
        }
        if (s.kind === 'process-monitors') {
          this.add.text(s.x, top + 64, 'monitores de processos (sem agentes)', { fontFamily: 'ui-monospace, monospace', fontSize: '8px', color: '#a8a29e', resolution: 2 }).setOrigin(0.5).setDepth(6);
        }
      }
    }

    this.screenLayer = this.add.graphics().setDepth(8);

    const carGfx = this.add.graphics();
    drawElevatorCar(carGfx);
    const car = this.add.container(ELEVATOR_DOOR_X, 0, [carGfx]).setDepth(4);
    this.elevator = new Elevator(this, car);
    this.elevator.place(1);

    this.time.addEvent({ delay: 180, loop: true, callback: () => this.renderScreens() });
    this.ready = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => (this.ready = false));
    this.bridge.onReady(this);
  }

  private ensureCharacter(agent: Agent) {
    const key = `char-${agent.id}`;
    if (this.textures.exists(key)) return;
    const tex = this.textures.addCanvas(key, drawCharacterSheet(PALETTES[agent.id] ?? DEFAULT_PALETTE))!;
    FRAMES.forEach((f, i) => tex.add(f.name, 0, i * FRAME_W * PX, 0, FRAME_W * PX, FRAME_H * PX));
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    for (const [name, a] of Object.entries(ANIMS)) {
      this.anims.create({ key: `${agent.id}-${name}`, frames: a.frames.map((frame) => ({ key, frame })), frameRate: a.fps, repeat: -1 });
    }
  }

  /** Recebe o estado sincronizado do orquestrador. */
  sync(state: AccState) {
    if (!this.ready) return;
    this.lastState = state;
    const agents = state.agents;
    for (const agent of Object.values(agents)) {
      let actor = this.actors.get(agent.id);
      if (!actor) {
        this.ensureCharacter(agent);
        actor = new AgentActor(this, agent, this.elevator, (id) => this.bridge.onSelect(id));
        actor.setSelected(agent.id === this.selectedId);
        this.actors.set(agent.id, actor);
      } else {
        actor.update(agent, agents, (t) => this.adjustTarget(agent, t));
      }
    }


    const tasks = Object.values(state.tasks);
    const projects = Object.values(state.projects);
    const pending = Object.values(state.approvals).filter((a) => a.status === 'pending').length;
    const running = tasks.filter((t) => t.status === 'running' || t.status === 'awaiting_approval').length;
    const failedTests = tasks.reduce((n, t) => n + (t.tests?.failed ?? 0), 0);
    const failedTasks = tasks.filter((t) => t.status === 'failed').length;
    const active = projects.filter((p) => ['planning', 'awaiting_plan_approval', 'running', 'paused'].includes(p.status)).length;
    const done = projects.filter((p) => p.status === 'completed').length;
    this.boards.get('tasks-board')?.setText(`EM ANDAMENTO\n${running} tarefa${running === 1 ? '' : 's'}`);
    this.boards.get('error-board')?.setText(`ERROS ENCONTRADOS\n${failedTasks} tarefa(s)\n${failedTests} teste(s)`).setColor(failedTasks || failedTests ? '#fca5a5' : '#e2e8f0');
    this.boards.get('projects-board')?.setText(`PROJETOS\nativos: ${active}\nconcluídos: ${done}`);
    this.boards.get('approval-center')?.setText(`APROVAÇÕES: ${pending}`).setColor(pending ? '#fde68a' : '#94a3b8');
    this.pendingApprovals = pending;
    this.updateScreens();
  }

  /** Na conversa de repasse, o agente vai até onde o colega está de fato. */
  private adjustTarget(agent: Agent, t: Target): Target {
    if (agent.state !== 'talking' || !agent.withAgentId) return t;
    const spot = this.actors.get(agent.withAgentId)?.currentSpot();
    if (!spot) return t;
    return { ...t, floor: spot.floor, x: Math.min(640, spot.x + 40), facing: 'left' };
  }

  /** Monitores mostram atividade só quando o agente está de fato no posto. */
  private updateScreens() {
    const state = this.lastState;
    if (!state) return;
    for (const slot of this.screens.values()) slot.mode = 'off';
    for (const agent of Object.values(state.agents)) {
      const actor = this.actors.get(agent.id);
      const t = targetFor(agent, state.agents);
      if (t.screen === 'off' || !actor?.arrived()) continue;
      const stationId = this.stationForScreen(agent, t);
      const slot = stationId ? this.screens.get(stationId) : undefined;
      if (slot) slot.mode = t.screen;
    }
    const pending = this.pendingApprovals;
    const admin = this.screens.get('admin');
    if (admin) admin.mode = pending ? 'alert' : 'off';
    const center = this.screens.get('approvals');
    if (center) center.mode = pending ? 'alert' : 'off';
    const designer = Object.values(state.agents).find((a) => a.role === 'designer');
    this.protoActive = designer?.state === 'typing' && !!this.actors.get(designer.id)?.arrived();
  }

  private stationForScreen(agent: Agent, t: ReturnType<typeof targetFor>): string | null {
    if (agent.role === 'tester' && agent.state === 'testing') return 'lab';
    for (const floor of FLOORS) {
      const s = floor.stations.find((x) => x.owner === agent.id);
      if (s) return s.id;
    }
    void t;
    return null;
  }

  select(agentId: string | null) {
    this.selectedId = agentId;
    for (const a of this.actors.values()) a.setSelected(a.id === agentId);
  }

  private renderScreens() {
    this.tick++;
    this.updateScreens();
    const g = this.screenLayer;
    g.clear();
    for (const slot of this.screens.values()) drawScreen(g, slot.area, slot.mode, this.tick);
    if (this.protoArea) drawPrototype(g, this.protoArea, this.protoActive, this.tick);
  }

  /** Usado pelos testes ponta a ponta para localizar personagens na tela. */
  debugActors(): ActorDebug[] {
    return [...this.actors.values()].map((a) => a.debug());
  }

  get state() {
    return this.lastState;
  }
}

const CODE_COLORS = [0x60a5fa, 0xf472b6, 0x34d399, 0xfbbf24, 0xa78bfa, 0xe2e8f0];

function hash(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function drawScreen(g: Phaser.GameObjects.Graphics, a: ScreenArea, mode: Screen, tick: number) {
  const fill = (x: number, y: number, w: number, h: number, c: number, alpha = 1) => {
    g.fillStyle(c, alpha);
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  switch (mode) {
    case 'off':
      fill(a.x, a.y, a.w, a.h, 0x0b1220);
      fill(a.x + 3, a.y + 3, a.w * 0.3, 2, 0xffffff, 0.06);
      return;
    case 'code': {
      fill(a.x, a.y, a.w, a.h, 0x0f172a);
      const lines = Math.floor(a.h / 3.5);
      for (let i = 0; i < lines; i++) {
        const n = tick + i; // rola para cima
        const indent = Math.floor(hash(n * 3.1) * 3) * 3;
        const w = 6 + hash(n) * (a.w - 10 - indent);
        fill(a.x + 2 + indent, a.y + 2 + i * 3.5, w, 2, CODE_COLORS[Math.floor(hash(n * 7.7) * CODE_COLORS.length)]!);
      }
      if (tick % 4 < 2) fill(a.x + a.w - 5, a.y + a.h - 4, 2, 3, 0xffffff);
      return;
    }
    case 'chart': {
      fill(a.x, a.y, a.w, a.h, 0x0f1d33);
      const bars = 5;
      const bw = (a.w - 6) / bars;
      for (let i = 0; i < bars; i++) {
        const h = 3 + (Math.sin(tick / 4 + i * 1.3) * 0.5 + 0.5) * (a.h - 7);
        fill(a.x + 3 + i * bw, a.y + a.h - 2 - h, bw - 2, h, 0x60a5fa);
      }
      // lupa
      g.lineStyle(2, 0xfbbf24, 1);
      g.strokeCircle(a.x + a.w - 8 + Math.sin(tick / 3) * 3, a.y + 7, 3);
      return;
    }
    case 'test': {
      fill(a.x, a.y, a.w, a.h, 0x111827);
      const p = (tick % 24) / 24;
      fill(a.x + 3, a.y + a.h - 6, (a.w - 6) * p, 3, 0x22c55e);
      for (let i = 0; i < Math.floor(p * 8); i++) fill(a.x + 3 + i * 3.5, a.y + 4 + (i % 2) * 4, 2, 2, 0x4ade80);
      return;
    }
    case 'error':
      fill(a.x, a.y, a.w, a.h, 0x450a0a);
      g.lineStyle(2, 0xef4444, tick % 4 < 2 ? 1 : 0.5);
      g.lineBetween(a.x + a.w / 2 - 5, a.y + a.h / 2 - 5, a.x + a.w / 2 + 5, a.y + a.h / 2 + 5);
      g.lineBetween(a.x + a.w / 2 + 5, a.y + a.h / 2 - 5, a.x + a.w / 2 - 5, a.y + a.h / 2 + 5);
      return;
    case 'done':
      fill(a.x, a.y, a.w, a.h, 0x052e16);
      g.lineStyle(2, 0x4ade80, 1);
      g.lineBetween(a.x + a.w / 2 - 6, a.y + a.h / 2, a.x + a.w / 2 - 2, a.y + a.h / 2 + 4);
      g.lineBetween(a.x + a.w / 2 - 2, a.y + a.h / 2 + 4, a.x + a.w / 2 + 6, a.y + a.h / 2 - 5);
      return;
    case 'alert':
      fill(a.x, a.y, a.w, a.h, tick % 6 < 3 ? 0x713f12 : 0x451a03);
      fill(a.x + a.w / 2 - 1, a.y + 3, 3, a.h - 10, 0xfde047);
      fill(a.x + a.w / 2 - 1, a.y + a.h - 5, 3, 3, 0xfde047);
      return;
  }
}

/** Parede de protótipos: os blocos do layout surgem enquanto a designer está criando. */
function drawPrototype(g: Phaser.GameObjects.Graphics, a: ScreenArea, active: boolean, tick: number) {
  const blocks: [number, number, number, number, number][] = [
    [0, 0, 1, 0.14, 0xf472b6],
    [0, 0.18, 0.24, 0.82, 0x334155],
    [0.28, 0.18, 0.34, 0.36, 0x60a5fa],
    [0.66, 0.18, 0.34, 0.36, 0xa78bfa],
    [0.28, 0.6, 0.72, 0.16, 0x34d399],
    [0.28, 0.8, 0.46, 0.2, 0xfbbf24],
  ];
  g.fillStyle(0x0b1220, 1);
  g.fillRect(a.x, a.y, a.w, a.h);
  const visible = active ? (Math.floor(tick / 5) % (blocks.length + 3)) + 1 : blocks.length;
  blocks.slice(0, visible).forEach(([x, y, w, h, c]) => {
    g.fillStyle(c, active ? 0.9 : 0.25);
    g.fillRect(a.x + 3 + x * (a.w - 6), a.y + 3 + y * (a.h - 6), w * (a.w - 6) - 2, h * (a.h - 6) - 2);
  });
  if (active) {
    const b = blocks[Math.min(visible, blocks.length) - 1]!;
    g.fillStyle(0xffffff, 1);
    g.fillRect(a.x + 3 + (b[0] + b[2]) * (a.w - 6) - 3, a.y + 3 + (b[1] + b[3]) * (a.h - 6) - 3, 3, 3);
  }
}
