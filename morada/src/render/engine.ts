import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { LotInfo } from '../model/types';
import { getMaterial, setTextureQuality, textureFor } from './textures';
import { buildItemModel } from './furniture';

export type Quality = 'baixa' | 'media' | 'alta';

export interface GraphicsSettings {
  quality: Quality;
  shadows: boolean;
  hour: number;
  showGrid: boolean;
}

/** Renderizador, cena, iluminação dinâmica (sol/céu) e terreno do bairro. */
export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  sun = new THREE.DirectionalLight('#fff4e0', 2.6);
  hemi = new THREE.HemisphereLight('#cfe3ff', '#6b6150', 0.9);
  ambient = new THREE.AmbientLight('#ffffff', 0.15);
  world = new THREE.Group();
  terrain = new THREE.Group();
  helpers = new THREE.Group();
  private skyColor = new THREE.Color();
  private needsRender = true;
  private lot: LotInfo | null = null;
  onFrame: ((dt: number) => void) | null = null;
  activeCamera: THREE.Camera | null = null;
  settings: GraphicsSettings;
  nightFactor = 0;
  /** Nebulosidade (0 a 1) e intensidade da chuva (0 a 1). */
  cloud = 0;
  rain = 0;
  private rainMesh: THREE.LineSegments | null = null;
  private flashT = 0;

  constructor(public canvas: HTMLCanvasElement, settings: GraphicsSettings) {
    this.settings = settings;
    setTextureQuality(settings.quality === 'alta' ? 1024 : settings.quality === 'media' ? 512 : 256);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: settings.quality !== 'baixa',
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;

    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target, this.hemi, this.ambient, this.world, this.terrain, this.helpers);
    this.applySettings(settings);

    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.onFrame?.(dt);
      if (this.needsRender && this.activeCamera) {
        this.needsRender = false;
        this.renderer.render(this.scene, this.activeCamera);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  invalidate() {
    this.needsRender = true;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.invalidate();
  }

  applySettings(s: GraphicsSettings) {
    this.settings = s;
    const maxDpr = s.quality === 'alta' ? 2 : s.quality === 'media' ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.shadowMap.enabled = s.shadows;
    this.sun.castShadow = s.shadows;
    const size = s.quality === 'alta' ? 4096 : s.quality === 'media' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      (this.sun.shadow as any).map = null;
    }
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.setHour(s.hour);
    this.resize();
  }

  /** Ciclo dia/noite: posiciona o sol e ajusta céu e luzes. */
  setHour(hour: number) {
    this.settings.hour = hour;
    const t = ((hour - 6) / 12) * Math.PI; // 6h nascer, 18h pôr do sol
    const elev = Math.sin(t);
    const az = Math.cos(t);
    const R = 60;
    const dayness = THREE.MathUtils.clamp(elev * 2.2 + 0.15, 0, 1);
    this.nightFactor = 1 - dayness;
    this.sun.position.set(az * R * 0.8, Math.max(4, elev * R), R * 0.45);
    this.sun.target.position.set(0, 0, 0);
    const warm = THREE.MathUtils.clamp(1 - elev * 2.5, 0, 1);
    this.sun.color.setRGB(1, 0.95 - warm * 0.3, 0.88 - warm * 0.5);
    this.sun.intensity = 2.8 * dayness * (1 - this.cloud * 0.75);
    this.hemi.intensity = (0.25 + 0.75 * dayness) * (1 - this.cloud * 0.25);
    this.ambient.intensity = 0.12 + 0.05 * (1 - dayness);
    const day = new THREE.Color('#9fc8ea');
    const dusk = new THREE.Color('#e9a77c');
    const night = new THREE.Color('#0d1628');
    this.skyColor.copy(night).lerp(dusk, Math.min(1, dayness * 2)).lerp(day, Math.max(0, dayness * 2 - 1) * (1 - warm * 0.6));
    // Céu encoberto fica acinzentado.
    const grey = new THREE.Color().setRGB(0.55, 0.58, 0.62).multiplyScalar(0.25 + 0.75 * dayness);
    this.skyColor.lerp(grey, this.cloud * 0.85);
    this.scene.background = this.skyColor;
    if (!this.scene.fog) this.scene.fog = new THREE.Fog(this.skyColor, 120, 320);
    else (this.scene.fog as THREE.Fog).color.copy(this.skyColor);
    this.scene.environmentIntensity = 0.12 + 0.35 * dayness;
    this.renderer.toneMappingExposure = 0.85 + 0.25 * dayness;
    this.fitShadow();
    this.invalidate();
  }

  /** Define o clima visível. */
  setWeather(kind: 'sol' | 'nublado' | 'chuva' | 'tempestade') {
    this.cloud = { sol: 0, nublado: 0.55, chuva: 0.8, tempestade: 1 }[kind];
    this.rain = { sol: 0, nublado: 0, chuva: 0.6, tempestade: 1 }[kind];
    if (this.rain > 0 && !this.rainMesh) {
      const N = this.settings.quality === 'baixa' ? 500 : this.settings.quality === 'media' ? 1100 : 1800;
      const pos = new Float32Array(N * 6);
      for (let i = 0; i < N; i++) {
        const x = (Math.random() - 0.5) * 50, y = Math.random() * 25, z = (Math.random() - 0.5) * 50;
        pos.set([x, y, z, x + 0.05, y - 0.55, z + 0.03], i * 6);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.rainMesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#c9d6e3', transparent: true, opacity: 0.5, depthWrite: false }));
      this.rainMesh.frustumCulled = false;
      this.scene.add(this.rainMesh);
    }
    if (this.rainMesh) {
      this.rainMesh.visible = this.rain > 0;
      (this.rainMesh.material as THREE.LineBasicMaterial).opacity = 0.25 + this.rain * 0.35;
    }
    this.setHour(this.settings.hour);
  }

  /** Anima a chuva em volta do ponto observado e os relâmpagos. */
  updateWeather(dt: number, center: THREE.Vector3) {
    if (this.rainMesh && this.rain > 0) {
      const a = this.rainMesh.geometry.attributes.position as THREE.BufferAttribute;
      const arr = a.array as Float32Array;
      const fall = dt * (18 + this.rain * 10);
      for (let i = 0; i < arr.length; i += 6) {
        arr[i + 1] -= fall; arr[i + 4] -= fall;
        if (arr[i + 4] < 0) { const y = 22 + Math.random() * 4; arr[i + 1] = y; arr[i + 4] = y - 0.55; }
      }
      a.needsUpdate = true;
      this.rainMesh.position.set(center.x, center.y - 2, center.z);
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.ambient.intensity = this.flashT > 0 ? 2.5 : 0.12 + 0.05 * this.nightFactor;
    }
  }

  flash() {
    this.flashT = 0.12;
    this.ambient.intensity = 2.5;
    this.invalidate();
  }

  private fitShadow() {
    const lot = this.lot;
    const half = lot ? Math.max(lot.w, lot.d) * 0.75 + 8 : 40;
    const cam = this.sun.shadow.camera as THREE.OrthographicCamera;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.near = 1; cam.far = 200;
    cam.updateProjectionMatrix();
  }

  /** Constrói o terreno: gramado, lote, calçada, rua e vizinhança decorativa. */
  buildTerrain(lot: LotInfo) {
    this.lot = lot;
    this.terrain.clear();
    const grassTex = textureFor('grama')!;
    const grassMat = new THREE.MeshStandardMaterial({ map: grassTex.tex.clone(), roughness: 1, color: '#d8e8c8' });
    grassMat.map!.needsUpdate = true;
    grassMat.map!.repeat.set(200, 200);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), grassMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    ground.userData.ground = true;
    this.terrain.add(ground);

    const lotMat = getMaterial('grama');
    const lotGeo = new THREE.PlaneGeometry(lot.w, lot.d);
    const uv = lotGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * lot.w, uv.getY(i) * lot.d);
    const lotMesh = new THREE.Mesh(lotGeo, lotMat);
    lotMesh.rotation.x = -Math.PI / 2;
    lotMesh.position.y = 0;
    lotMesh.receiveShadow = true;
    lotMesh.userData.ground = true;
    this.terrain.add(lotMesh);

    // Contorno do lote.
    const hw = lot.w / 2, hd = lot.d / 2;
    const border = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-hw, 0.03, -hd), new THREE.Vector3(hw, 0.03, -hd), new THREE.Vector3(hw, 0.03, hd), new THREE.Vector3(-hw, 0.03, hd)]),
      new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }),
    );
    this.terrain.add(border);

    // Calçada e rua na frente (+z).
    const sidewalkTex = textureFor('calcada')!.tex.clone(); sidewalkTex.needsUpdate = true; sidewalkTex.repeat.set(200, 3);
    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(400, 0.12, 3), new THREE.MeshStandardMaterial({ map: sidewalkTex, roughness: 0.9 }));
    sidewalk.position.set(0, 0.04, hd + 1.5);
    sidewalk.receiveShadow = true;
    this.terrain.add(sidewalk);
    const asphaltTex = textureFor('asfalto')!.tex.clone(); asphaltTex.needsUpdate = true; asphaltTex.repeat.set(130, 3);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(400, 9), new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.85 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.005, hd + 7.5);
    road.receiveShadow = true;
    this.terrain.add(road);
    const lineMat = new THREE.MeshBasicMaterial({ color: '#e8d26a' });
    for (let x = -200; x < 200; x += 6) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.15), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.012, hd + 7.5);
      this.terrain.add(line);
    }
    const curb = new THREE.Mesh(new THREE.BoxGeometry(400, 0.18, 3), new THREE.MeshStandardMaterial({ map: sidewalkTex, roughness: 0.9 }));
    curb.position.set(0, 0.06, hd + 13.5);
    this.terrain.add(curb);

    // Árvores da rua e casas vizinhas simplificadas ao fundo.
    for (let x = -90; x <= 90; x += 11) {
      if (Math.abs(x) < hw + 2) continue;
      const tree = buildItemModel('arvore', '#4f7a4a', 'grama');
      tree.position.set(x, 0, hd + 1.6);
      tree.scale.setScalar(0.8);
      this.terrain.add(tree);
    }
    const houseColors = ['#e8e1d4', '#d9c7a8', '#c8d3d8', '#e9d5c9', '#d4d9c4'];
    let k = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const w = 12, d = 10, x = side * (hw + 10 + i * 20);
        const house = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, d), getMaterial('reboco', houseColors[k++ % houseColors.length]));
        body.position.y = 1.6;
        body.castShadow = body.receiveShadow = true;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) / 2 + 0.6, 2.4, 4), getMaterial('telha_ceramica'));
        roof.rotation.y = Math.PI / 4;
        roof.scale.set(1, 1, d / w);
        roof.position.y = 3.2 + 1.2;
        roof.castShadow = true;
        house.add(body, roof);
        house.position.set(x, 0, hd - d / 2 - 3);
        this.terrain.add(house);
      }
    }
    this.terrain.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.ground) o.castShadow = true; });
    this.fitShadow();
    this.invalidate();
  }
}
