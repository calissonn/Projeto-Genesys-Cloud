/**
 * Gestos de toque e mouse:
 *  - 1 dedo: ferramenta ativa (se ela consumir) ou mover câmera
 *  - 2 dedos: pinça para zoom, giro para rotacionar, arrasto vertical para inclinar
 *  - toque longo: menu de contexto
 *  - mouse: botão direito/meio gira, roda dá zoom
 */
export interface PointerInfo {
  sx: number;
  sy: number;
  ev: PointerEvent;
}

export interface InputHandlers {
  down(p: PointerInfo): boolean;
  move(p: PointerInfo, consumed: boolean): void;
  up(p: PointerInfo, consumed: boolean): void;
  tap(p: PointerInfo): void;
  longPress(p: PointerInfo): void;
  cancel(): void;
  hover(p: PointerInfo): void;
  pan(dx: number, dy: number): void;
  zoom(f: number): void;
  rotate(dYaw: number, dPitch: number): void;
}

export class InputManager {
  private pts = new Map<number, { x: number; y: number }>();
  private consumed = false;
  private start = { x: 0, y: 0, t: 0 };
  private moved = false;
  private longTimer = 0;
  private gesture: { dist: number; ang: number; cx: number; cy: number } | null = null;
  private mouseRotate = false;
  private longFired = false;

  constructor(private el: HTMLElement, private h: InputHandlers) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.h.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  }

  private info(e: PointerEvent): PointerInfo {
    const r = this.el.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top, ev: e };
  }

  private onDown = (e: PointerEvent) => {
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ponteiro sintético ou já liberado */ }
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType === 'mouse' && (e.button === 2 || e.button === 1)) {
      this.mouseRotate = true;
      return;
    }
    if (this.pts.size === 1) {
      this.start = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.moved = false;
      this.longFired = false;
      this.consumed = this.h.down(this.info(e));
      clearTimeout(this.longTimer);
      const info = this.info(e);
      this.longTimer = window.setTimeout(() => {
        if (!this.moved && this.pts.size === 1) {
          this.longFired = true;
          if (this.consumed) { this.h.cancel(); this.consumed = false; }
          this.h.longPress(info);
        }
      }, 550);
    } else if (this.pts.size === 2) {
      clearTimeout(this.longTimer);
      if (this.consumed) { this.h.cancel(); this.consumed = false; }
      this.gesture = this.twoState();
    }
  };

  private twoState() {
    const [a, b] = [...this.pts.values()];
    return { dist: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  private onMove = (e: PointerEvent) => {
    const prev = this.pts.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse') this.h.hover(this.info(e));
      return;
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.mouseRotate) {
      this.h.rotate(-dx * 0.006, dy * 0.004);
      return;
    }
    if (Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) > 8) {
      if (!this.moved) clearTimeout(this.longTimer);
      this.moved = true;
    }
    if (this.pts.size === 2 && this.gesture) {
      const g = this.twoState();
      if (g.dist > 10 && this.gesture.dist > 10) this.h.zoom(this.gesture.dist / g.dist);
      let da = g.ang - this.gesture.ang;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      this.h.rotate(-da, (g.cy - this.gesture.cy) * 0.004);
      this.h.pan(g.cx - this.gesture.cx, 0);
      this.gesture = g;
      return;
    }
    if (this.pts.size === 1 && !this.longFired) {
      if (this.consumed) this.h.move(this.info(e), true);
      else if (this.moved) this.h.pan(dx, dy);
    }
  };

  private onUp = (e: PointerEvent) => {
    if (!this.pts.has(e.pointerId)) return;
    this.pts.delete(e.pointerId);
    clearTimeout(this.longTimer);
    if (this.mouseRotate) {
      if (this.pts.size === 0) this.mouseRotate = false;
      return;
    }
    if (this.gesture) {
      if (this.pts.size < 2) this.gesture = null;
      if (this.pts.size === 1) {
        // Continua com o dedo restante apenas movendo a câmera.
        this.consumed = false;
        this.moved = true;
        const rest = [...this.pts.values()][0];
        this.start = { x: rest.x, y: rest.y, t: 0 };
      }
      return;
    }
    if (this.longFired) return;
    const info = this.info(e);
    const isTap = !this.moved && performance.now() - this.start.t < 500;
    if (this.consumed) this.h.up(info, true);
    if (isTap) this.h.tap(info);
    this.consumed = false;
  };

  private onCancel = (e: PointerEvent) => {
    this.pts.delete(e.pointerId);
    clearTimeout(this.longTimer);
    if (this.consumed) this.h.cancel();
    this.consumed = false;
    this.gesture = null;
    this.mouseRotate = false;
  };
}
