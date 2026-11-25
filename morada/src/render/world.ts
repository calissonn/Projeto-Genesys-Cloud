import * as THREE from 'three';
import type { EntityRef, Project, Wall, P, Item } from '../model/types';
import { wallPath, projectOnPath, dist, stairFootprint, pointInPolygon, pointAt } from '../model/geometry';
import { CATALOG_BY_ID } from '../model/catalog';
import { buildWallGeometry } from './wallMesh';
import { buildFloorMesh, buildOpeningGroup, buildStairGroup, buildRoofGroup } from './structureMesh';
import { buildItemModel, disposeModel } from './furniture';
import { getMaterial } from './textures';
import type { Engine } from './engine';

export type WallMode = 'inteiras' | 'baixas' | 'ocultas';

export interface ViewState {
  level: number;
  showAll: boolean;
  wallMode: WallMode;
  showRoof: boolean;
}

export interface PickHit {
  ref: EntityRef;
  point: THREE.Vector3;
  normal: THREE.Vector3 | null;
  object: THREE.Object3D;
}

const LOW_WALL = 1.0;

/** Sincroniza o projeto com a cena 3D e oferece seleção por raio. */
export class World {
  objects = new Map<string, THREE.Object3D>();
  /** Energia cortada: luminárias não acendem. */
  powerOff = false;
  private lights: THREE.PointLight[] = [];
  private grid: THREE.LineSegments | null = null;

  constructor(private engine: Engine) {}

  levelBase(p: Project, level: number) {
    return level * p.levelHeight;
  }

  visibleLevel(view: ViewState, level: number) {
    return view.showAll || level <= view.level;
  }

  private clear() {
    const g = this.engine.world;
    for (const child of [...g.children]) {
      if (child.userData.furniture) disposeModel(child);
      else child.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
      g.remove(child);
    }
    this.objects.clear();
    this.lights = [];
  }

  private tag(obj: THREE.Object3D, ref: EntityRef) {
    obj.userData.ref = ref;
    this.objects.set(ref.id, obj);
    this.engine.world.add(obj);
  }

  private wallExtends(p: Project, w: Wall): [number, number] {
    const others = p.walls.filter((o) => o.level === w.level && o.id !== w.id);
    const touch = (pt: P) => others.some((o) => dist(o.a, pt) < 0.03 || dist(o.b, pt) < 0.03 || projectOnPath(wallPath(o), pt).d < 0.03);
    return [touch(w.a) ? w.thickness / 2 : 0, touch(w.b) ? w.thickness / 2 : 0];
  }

  rebuild(p: Project, view: ViewState) {
    this.clear();
    const night = this.engine.nightFactor;
    const lightBudget = this.engine.settings.quality === 'baixa' ? 0 : this.engine.settings.quality === 'media' ? 6 : 12;

    // Paredes + aberturas
    for (const w of p.walls) {
      if (!this.visibleLevel(view, w.level)) continue;
      const isCurrent = w.level === view.level;
      if (isCurrent && view.wallMode === 'ocultas') continue;
      const low = isCurrent && view.wallMode === 'baixas' ? Math.min(LOW_WALL, w.height) : null;
      const ops = p.openings.filter((o) => o.wallId === w.id);
      const [ea, eb] = this.wallExtends(p, w);
      const base = this.levelBase(p, w.level);
      const geo = buildWallGeometry(w, ops, base, low, ea, eb);
      const mat = w.kind === 'divisoria' && w.material === 'vidro' ? getMaterial('vidro') : getMaterial(w.material, w.color);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.tag(mesh, { kind: 'wall', id: w.id });
      if (low === null) {
        const path = wallPath(w);
        for (const o of ops) {
          const { p: c, tan } = pointAt(path, o.t);
          const grp = buildOpeningGroup(o, w.thickness);
          grp.position.set(c.x, base, c.y);
          grp.rotation.y = Math.atan2(-tan.y, tan.x);
          this.tag(grp, { kind: 'opening', id: o.id });
        }
      }
    }

    // Pisos
    for (const f of p.floors) {
      if (!this.visibleLevel(view, f.level) || f.points.length < 3) continue;
      const holes = p.stairs
        .filter((s) => s.level === f.level - 1)
        .map((s) => stairFootprint(s, p.levelHeight))
        .filter((fp) => fp.every((pt) => pointInPolygon(pt, f.points)));
      const mesh = buildFloorMesh(f, this.levelBase(p, f.level), holes);
      this.tag(mesh, { kind: 'floor', id: f.id });
    }

    // Escadas
    for (const s of p.stairs) {
      if (!this.visibleLevel(view, s.level)) continue;
      const g = buildStairGroup(s, p.levelHeight);
      g.position.set(s.pos.x, this.levelBase(p, s.level), s.pos.y);
      g.rotation.y = -s.rot;
      this.tag(g, { kind: 'stair', id: s.id });
    }

    // Telhados
    if (view.showRoof) {
      for (const r of p.roofs) {
        if (!view.showAll && r.level > view.level) continue;
        const outer = new THREE.Group();
        outer.add(buildRoofGroup(r));
        outer.position.set(r.center.x, this.levelBase(p, r.level) + p.levelHeight, r.center.y);
        outer.rotation.y = -r.rot;
        this.tag(outer, { kind: 'roof', id: r.id });
      }
    }

    // Objetos
    for (const it of p.items) {
      if (!this.visibleLevel(view, it.level)) continue;
      const obj = this.makeItem(it, p);
      this.tag(obj, { kind: 'item', id: it.id });
      const def = CATALOG_BY_ID.get(it.catalogId);
      if (def?.light && !this.powerOff && night > 0.35 && this.lights.length < lightBudget && it.level <= view.level) {
        const L = new THREE.PointLight('#ffd7a0', 6 * night, 7, 1.6);
        L.position.set(0, def.mount === 'teto' ? 0.1 : def.h * 0.85, 0);
        obj.add(L);
        this.lights.push(L);
      }
    }
    this.updateGrid(p, view);
    this.engine.invalidate();
  }

  makeItem(it: Item, p: Project): THREE.Group {
    const obj = buildItemModel(it.catalogId, it.color, it.material);
    obj.userData.furniture = true;
    obj.scale.setScalar(it.scale);
    this.placeItem(obj, it, p);
    return obj;
  }

  placeItem(obj: THREE.Object3D, it: Item, p: Project) {
    obj.position.set(it.pos.x, this.levelBase(p, it.level) + it.elev, it.pos.y);
    obj.rotation.y = it.rot;
  }

  private gridHidden = false;

  /** Oculta a grade temporariamente (modo Vida). */
  setGridVisible(v: boolean) {
    this.gridHidden = !v;
    if (this.grid) this.grid.visible = v;
    this.engine.invalidate();
  }

  updateGrid(p: Project, view: ViewState) {
    if (this.grid) {
      this.engine.helpers.remove(this.grid);
      this.grid.geometry.dispose();
      this.grid = null;
    }
    if (!this.engine.settings.showGrid) return;
    const pts: number[] = [];
    const hw = p.lot.w / 2, hd = p.lot.d / 2;
    const y = this.levelBase(p, view.level) + (view.level === 0 ? 0.035 : 0.012);
    for (let x = -hw; x <= hw + 1e-6; x += 1) pts.push(x, y, -hd, x, y, hd);
    for (let z = -hd; z <= hd + 1e-6; z += 1) pts.push(-hw, y, z, hw, y, z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false }));
    this.grid.renderOrder = 2;
    this.grid.visible = !this.gridHidden;
    this.engine.helpers.add(this.grid);
  }

  /** Raio contra os objetos visíveis. */
  pick(rc: THREE.Raycaster, kinds?: EntityRef['kind'][], exclude?: string): PickHit | null {
    const hits = rc.intersectObjects(this.engine.world.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      let visible = true;
      let ref: EntityRef | undefined;
      while (o) {
        if (!o.visible) visible = false;
        if (!ref && o.userData.ref) ref = o.userData.ref;
        o = o.parent;
      }
      if (!visible || !ref) continue;
      if (exclude && ref.id === exclude) continue;
      if (kinds && !kinds.includes(ref.kind)) continue;
      const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : null;
      return { ref, point: h.point.clone(), normal, object: this.objects.get(ref.id)! };
    }
    return null;
  }
}
