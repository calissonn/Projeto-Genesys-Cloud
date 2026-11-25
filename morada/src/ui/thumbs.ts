import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildItemModel, disposeModel } from '../render/furniture';
import { CATALOG_BY_ID } from '../model/catalog';

/** Gera miniaturas 3D reais dos móveis (carregamento progressivo, em cache). */
class Thumbnails {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  private cache = new Map<string, string>();
  private queue: { id: string; cb: (url: string) => void }[] = [];
  private busy = false;

  private init() {
    if (this.renderer) return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 160;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(160, 160, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(3, 5, 4);
    this.scene.add(key, new THREE.AmbientLight('#ffffff', 0.5));
  }

  request(id: string, cb: (url: string) => void) {
    const c = this.cache.get(id);
    if (c) { cb(c); return; }
    this.queue.push({ id, cb });
    this.pump();
  }

  clearQueue() {
    this.queue.length = 0;
  }

  private pump() {
    if (this.busy) return;
    this.busy = true;
    const step = () => {
      const job = this.queue.shift();
      if (!job) { this.busy = false; return; }
      try {
        job.cb(this.render(job.id));
      } catch {
        /* contexto WebGL indisponível: mantém ícone textual */
      }
      setTimeout(step, 0);
    };
    step();
  }

  private render(id: string): string {
    const c = this.cache.get(id);
    if (c) return c;
    this.init();
    const def = CATALOG_BY_ID.get(id)!;
    const model = buildItemModel(id, def.color, def.material);
    this.scene.add(model);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) * 0.62 + 0.02;
    const dist = r / Math.tan(THREE.MathUtils.degToRad(15));
    const dir = new THREE.Vector3(0.9, 0.7, 1.2).normalize();
    this.cam.position.copy(center).addScaledVector(dir, dist);
    this.cam.lookAt(center);
    this.cam.near = dist / 20;
    this.cam.far = dist * 4;
    this.cam.updateProjectionMatrix();
    this.renderer!.render(this.scene, this.cam);
    const url = this.renderer!.domElement.toDataURL('image/png');
    this.scene.remove(model);
    disposeModel(model);
    this.cache.set(id, url);
    return url;
  }
}

export const thumbs = new Thumbnails();
