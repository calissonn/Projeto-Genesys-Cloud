import * as THREE from 'three';

export type ViewMode = '3d' | 'planta' | 'pessoa';

/** Câmera orbital (3D) e ortográfica (planta baixa 2D), controlada por gestos. */
export class CameraRig {
  persp = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
  ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 600);
  target = new THREE.Vector3(0, 0, 0);
  yaw = Math.PI / 5;
  pitch = 0.85;
  distance = 34;
  orthoZoom = 22; // metros visíveis na menor dimensão
  mode: ViewMode = '3d';
  bounds = { w: 30, d: 30 };
  onChange: (() => void) | null = null;
  private targetY = 0;
  /** Pose da câmera em primeira pessoa (definida pelo modo Vida). */
  fp = { pos: new THREE.Vector3(), yaw: 0, look: 0, pitch: -0.1 };

  constructor(private canvas: HTMLCanvasElement) {
    this.update();
  }

  get camera(): THREE.Camera {
    return this.mode === 'planta' ? this.ortho : this.persp;
  }

  setMode(m: ViewMode) {
    this.mode = m;
    this.update();
  }

  setLevelY(y: number) {
    this.targetY = y;
    this.target.y = y;
    this.update();
  }

  frame(w: number, d: number) {
    this.bounds = { w, d };
    this.target.set(0, this.targetY, 0);
    this.distance = Math.max(18, Math.max(w, d) * 1.25);
    this.orthoZoom = Math.max(w, d) * 1.15;
    this.update();
  }

  pan(dx: number, dy: number) {
    if (this.mode === 'pessoa') { this.rotate(-dx * 0.005, dy * 0.004); return; }
    const h = this.canvas.clientHeight || 1;
    const worldPerPx = this.mode !== 'planta'
      ? (2 * this.distance * Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2))) / h
      : this.orthoZoom / Math.min(h, this.canvas.clientWidth || h);
    const yaw = this.mode === '3d' ? this.yaw : 0;
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.target.addScaledVector(right, -dx * worldPerPx);
    this.target.addScaledVector(fwd, dy * worldPerPx);
    const lim = Math.max(this.bounds.w, this.bounds.d) / 2 + 25;
    this.target.x = THREE.MathUtils.clamp(this.target.x, -lim, lim);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -lim, lim);
    this.update();
  }

  zoom(factor: number) {
    if (this.mode === 'pessoa') return;
    if (this.mode === '3d') this.distance = THREE.MathUtils.clamp(this.distance * factor, 3, 160);
    else this.orthoZoom = THREE.MathUtils.clamp(this.orthoZoom * factor, 4, 160);
    this.update();
  }

  rotate(dYaw: number, dPitch: number) {
    if (this.mode === 'pessoa') {
      this.fp.look += dYaw;
      this.fp.pitch = THREE.MathUtils.clamp(this.fp.pitch - dPitch, -1.2, 1.0);
      this.update();
      return;
    }
    if (this.mode !== '3d') return;
    this.yaw += dYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, 0.12, 1.45);
    this.update();
  }

  update() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const aspect = w / Math.max(1, h);
    this.persp.aspect = aspect;
    this.persp.position.set(
      this.target.x + this.distance * Math.cos(this.pitch) * Math.sin(this.yaw),
      this.target.y + this.distance * Math.sin(this.pitch),
      this.target.z + this.distance * Math.cos(this.pitch) * Math.cos(this.yaw),
    );
    this.persp.lookAt(this.target);
    if (this.mode === 'pessoa') {
      const yaw = this.fp.yaw + this.fp.look;
      this.persp.position.copy(this.fp.pos);
      this.persp.lookAt(
        this.fp.pos.x + Math.sin(yaw) * Math.cos(this.fp.pitch),
        this.fp.pos.y + Math.sin(this.fp.pitch),
        this.fp.pos.z + Math.cos(yaw) * Math.cos(this.fp.pitch),
      );
    }
    this.persp.near = this.mode === 'pessoa' ? 0.05 : 0.1;
    this.persp.updateProjectionMatrix();

    const half = this.orthoZoom / 2;
    const hw = aspect >= 1 ? half * aspect : half;
    const hh = aspect >= 1 ? half : half / aspect;
    this.ortho.left = -hw; this.ortho.right = hw; this.ortho.top = hh; this.ortho.bottom = -hh;
    this.ortho.position.set(this.target.x, this.target.y + 120, this.target.z);
    this.ortho.up.set(0, 0, -1);
    this.ortho.lookAt(this.target.x, this.target.y, this.target.z);
    this.ortho.updateProjectionMatrix();
    this.onChange?.();
  }

  /** Raio a partir de coordenadas de tela (px relativos ao canvas). */
  ray(sx: number, sy: number): THREE.Raycaster {
    const rc = new THREE.Raycaster();
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    rc.setFromCamera(new THREE.Vector2((sx / w) * 2 - 1, -(sy / h) * 2 + 1), this.camera);
    return rc;
  }

  project(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = p.clone().project(this.camera);
    return {
      x: ((v.x + 1) / 2) * this.canvas.clientWidth,
      y: ((1 - v.y) / 2) * this.canvas.clientHeight,
      visible: v.z < 1 && v.z > -1,
    };
  }
}
