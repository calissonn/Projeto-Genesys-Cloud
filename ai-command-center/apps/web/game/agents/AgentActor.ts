import * as Phaser from 'phaser';
import type { Agent } from '@acc/shared';
import { ELEVATOR_DOOR_X, feetY } from '../building/layout';
import { BADGE_COLORS } from '../sprites/character';
import { targetFor, type Badge, type Pose, type Target } from './behavior';

const WALK_SPEED = 120; // unidades por segundo
/** Caminhadas longas são aceleradas para o visual não ficar atrasado em relação ao estado real. */
const MAX_WALK_MS = 1500;

export interface ElevatorLike {
  ride(from: number, to: number): Promise<void>;
}

/** Estado público do ator, usado pelos testes ponta a ponta. */
export interface ActorDebug {
  id: string;
  floor: number;
  x: number;
  y: number;
  pose: Pose;
  badge: Badge;
  moving: boolean;
  state: Agent['state'];
}

export class AgentActor {
  readonly container: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly ring: Phaser.GameObjects.Ellipse;
  private readonly label: Phaser.GameObjects.Text;
  private readonly bubble: Phaser.GameObjects.Container;
  private readonly bubbleBg: Phaser.GameObjects.Graphics;
  private readonly bubbleIcon: Phaser.GameObjects.Image;
  private bubbleTween: Phaser.Tweens.Tween | null = null;

  floor: number;
  pose: Pose = 'stand';
  badge: Badge = null;
  moving = false;
  target: Target | null = null;
  private agent: Agent;
  private generation = 0;
  private settleTimer: Phaser.Time.TimerEvent | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    agent: Agent,
    private readonly elevator: ElevatorLike,
    onSelect: (id: string) => void,
  ) {
    this.agent = agent;
    const initial = targetFor(agent, { [agent.id]: agent });
    this.floor = initial.floor;
    const y = feetY(initial.floor);
    this.container = scene.add.container(initial.x, y);
    this.shadow = scene.add.ellipse(0, 0, 26, 6, 0x000000, 0.25);
    this.ring = scene.add.ellipse(0, 0, 40, 12).setStrokeStyle(2, 0xfacc15, 1).setVisible(false);
    this.sprite = scene.add.sprite(0, 0, `char-${agent.id}`, 'stand').setOrigin(0.5, 1);
    this.label = scene.add
      .text(0, 4, agent.name, { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '11px', color: '#ffffff', backgroundColor: '#0f172acc', padding: { x: 3, y: 1 }, resolution: 2 })
      .setOrigin(0.5, 0);
    this.bubbleBg = scene.add.graphics();
    this.bubbleIcon = scene.add.image(0, -9, 'icon-think');
    this.bubble = scene.add.container(0, -58, [this.bubbleBg, this.bubbleIcon]).setVisible(false);
    this.container.add([this.shadow, this.ring, this.sprite, this.label, this.bubble]);
    this.container.setSize(34, 56);
    this.container.setInteractive(new Phaser.Geom.Rectangle(-17, -50, 34, 70), Phaser.Geom.Rectangle.Contains);
    this.container.on('pointerdown', () => onSelect(agent.id));
    this.container.on('pointerover', () => scene.input.setDefaultCursor('pointer'));
    this.container.on('pointerout', () => scene.input.setDefaultCursor('default'));
    this.applyPose(initial.pose, initial.facing);
    this.setBadge(initial.badge);
    this.target = initial;
    this.updateDepth();
  }

  get id() {
    return this.agent.id;
  }

  setSelected(selected: boolean) {
    this.ring.setVisible(selected);
  }

  /** Recebe o estado real do agente e move/anima o personagem de acordo. */
  update(agent: Agent, all: Record<string, Agent>, adjust?: (t: Target) => Target) {
    const prev = this.agent;
    this.agent = agent;
    const base = targetFor(agent, all);
    const t = adjust ? adjust(base) : base;
    const same =
      this.target &&
      prev.state === agent.state &&
      prev.withAgentId === agent.withAgentId &&
      this.target.floor === t.floor &&
      this.target.x === t.x &&
      this.target.pose === t.pose &&
      this.target.badge === t.badge;
    if (same) return;
    this.target = t;
    void this.goTo(t);
  }

  private async goTo(t: Target) {
    const gen = ++this.generation;
    this.settleTimer?.remove();
    this.settleTimer = null;
    this.setBadge(t.badge);
    await this.travel(t.floor, t.x, gen);
    if (gen !== this.generation) return;
    this.applyPose(t.pose, t.facing);
    if (t.settle) {
      const settle = t.settle;
      this.settleTimer = this.scene.time.delayedCall(settle.afterMs, async () => {
        if (gen !== this.generation) return;
        await this.travel(settle.floor, settle.x, gen);
        if (gen === this.generation) {
          this.applyPose(settle.pose, settle.facing);
          this.setBadge(null);
        }
      });
    }
  }

  private async travel(floor: number, x: number, gen: number) {
    if (floor !== this.floor) {
      await this.walkTo(ELEVATOR_DOOR_X, gen);
      if (gen !== this.generation) return;
      await this.fade(0, gen);
      const from = this.floor;
      await this.elevator.ride(from, floor);
      if (gen !== this.generation) {
        // Outra mudança chegou durante a viagem: o personagem já está no novo andar.
        this.placeOnFloor(floor, ELEVATOR_DOOR_X);
        this.container.setAlpha(1);
        return;
      }
      this.placeOnFloor(floor, ELEVATOR_DOOR_X);
      await this.fade(1, gen);
    }
    await this.walkTo(x, gen);
  }

  private placeOnFloor(floor: number, x: number) {
    this.floor = floor;
    this.container.setPosition(x, feetY(floor));
    this.updateDepth();
  }

  private walkTo(x: number, gen: number): Promise<void> {
    const dx = x - this.container.x;
    if (Math.abs(dx) < 1) return Promise.resolve();
    this.moving = true;
    this.applyPose('walk', dx < 0 ? 'left' : 'right');
    return new Promise((resolve) => {
      this.scene.tweens.killTweensOf(this.container);
      this.scene.tweens.add({
        targets: this.container,
        x,
        duration: Math.min(MAX_WALK_MS, (Math.abs(dx) / WALK_SPEED) * 1000),
        ease: 'Linear',
        onUpdate: () => this.updateDepth(),
        onComplete: () => {
          this.moving = false;
          resolve();
        },
        onStop: () => {
          this.moving = false;
          resolve();
        },
      });
      void gen;
    });
  }

  private fade(alpha: number, gen: number): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens.add({ targets: this.container, alpha, duration: 180, onComplete: () => resolve(), onStop: () => resolve() });
      void gen;
    });
  }

  private applyPose(pose: Pose, facing: 'left' | 'right') {
    this.pose = pose;
    this.sprite.setFlipX(facing === 'right');
    this.sprite.play(`${this.agent.id}-${pose}`, true);
  }

  private setBadge(badge: Badge) {
    if (badge === this.badge && this.bubble.visible === !!badge) return;
    this.badge = badge;
    this.bubbleTween?.stop();
    this.bubbleTween = null;
    this.bubble.setScale(1).setAlpha(1).setY(-58);
    if (!badge) {
      this.bubble.setVisible(false);
      return;
    }
    const color = BADGE_COLORS[badge]!.border;
    this.bubbleBg.clear();
    this.bubbleBg.fillStyle(0xffffff, 1);
    this.bubbleBg.fillRoundedRect(-13, -22, 26, 24, 5);
    this.bubbleBg.lineStyle(2, color, 1);
    this.bubbleBg.strokeRoundedRect(-13, -22, 26, 24, 5);
    this.bubbleBg.fillStyle(0xffffff, 1);
    this.bubbleBg.fillTriangle(-4, 1, 4, 1, 0, 7);
    this.bubbleBg.lineStyle(2, color, 1);
    this.bubbleBg.lineBetween(-4, 2, 0, 7);
    this.bubbleBg.lineBetween(4, 2, 0, 7);
    this.bubbleIcon.setTexture(`icon-${badge}`);
    this.bubble.setVisible(true);
    if (badge === 'alert' || badge === 'error') {
      this.bubbleTween = this.scene.tweens.add({ targets: this.bubble, scale: 1.15, duration: 420, yoyo: true, repeat: -1 });
    } else if (badge === 'check') {
      this.bubble.setScale(0.2);
      this.bubbleTween = this.scene.tweens.add({ targets: this.bubble, scale: 1, duration: 300, ease: 'Back.Out' });
    } else {
      this.bubbleTween = this.scene.tweens.add({ targets: this.bubble, y: -61, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
  }

  private updateDepth() {
    this.container.setDepth(1000 + this.container.y + this.container.x / 1000);
  }

  /** Para onde o personagem está indo agora (ou onde está, se já chegou). */
  currentSpot(): { floor: number; x: number } | null {
    if (!this.target) return null;
    return this.moving || this.floor !== this.target.floor ? { floor: this.target.floor, x: this.target.x } : { floor: this.floor, x: this.container.x };
  }

  /** true quando o personagem chegou ao destino do estado atual (não está a caminho). */
  arrived(): boolean {
    return !!this.target && !this.moving && this.floor === this.target.floor && Math.abs(this.container.x - this.target.x) < 2;
  }

  debug(): ActorDebug {
    return { id: this.agent.id, floor: this.floor, x: this.container.x, y: this.container.y, pose: this.pose, badge: this.badge, moving: this.moving, state: this.agent.state };
  }
}
