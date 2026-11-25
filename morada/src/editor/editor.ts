import * as THREE from 'three';
import type { EntityRef, Project, P, Item, Wall, Floor } from '../model/types';
import { History } from '../core/history';
import { Emitter } from '../core/events';
import { storage } from '../core/storage';
import {
  balance, clampToLot, computeCost, serializeProject, deserializeProject, uid, MAX_LEVELS, fmtMoney,
} from '../model/project';
import {
  dist, snap as snapV, wallPath, pointInPolygon, distToPolygonEdge, bbox, centroid, rotate, add, sub, polygonArea,
} from '../model/geometry';
import { CATALOG_BY_ID } from '../model/catalog';
import type { Engine } from '../render/engine';
import { CameraRig } from '../render/camera';
import { World, type ViewState } from '../render/world';
import { InputManager, type PointerInfo } from './input';
import type { Tool } from './tools';
import { SelectTool } from './tools';

export interface Label {
  text: string;
  pos: THREE.Vector3;
  kind?: 'medida' | 'info';
}

export interface EditorEvents extends Record<string, unknown> {
  change: Project;
  selection: EntityRef | null;
  tool: Tool;
  view: ViewState;
  toast: string;
  labels: Label[];
  saved: number;
}

export interface SnapSettings {
  grid: boolean;
  step: number;
  angle: boolean;
  magnet: boolean;
}

/** Orquestra projeto, histórico, ferramentas, câmera e mundo 3D. */
export class Editor extends Emitter<EditorEvents> {
  project: Project;
  history = new History();
  rig: CameraRig;
  world: World;
  view: ViewState = { level: 0, showAll: false, wallMode: 'inteiras', showRoof: true };
  tool: Tool;
  selection: EntityRef | null = null;
  snap: SnapSettings = { grid: true, step: 0.25, angle: true, magnet: true };
  preview = new THREE.Group();
  selHelpers = new THREE.Group();
  private liveSnapshot: string | null = null;
  private saveTimer = 0;
  private toolLabels: Label[] = [];
  private selLabels: Label[] = [];

  constructor(public engine: Engine, project: Project) {
    super();
    this.project = project;
    this.rig = new CameraRig(engine.canvas);
    this.world = new World(engine);
    engine.helpers.add(this.preview, this.selHelpers);
    engine.activeCamera = this.rig.camera;
    this.rig.onChange = () => {
      engine.activeCamera = this.rig.camera;
      engine.invalidate();
      this.emitLabels();
    };
    engine.buildTerrain(project.lot);
    this.rig.frame(project.lot.w, project.lot.d);
    this.tool = new SelectTool(this);
    new InputManager(engine.canvas, {
      down: (p) => this.tool.down?.(this.ptr(p)) ?? false,
      move: (p) => this.tool.move?.(this.ptr(p)),
      up: (p) => this.tool.up?.(this.ptr(p)),
      tap: (p) => this.tool.tap?.(this.ptr(p)),
      longPress: (p) => this.tool.longPress?.(this.ptr(p)),
      cancel: () => this.tool.cancel?.(),
      hover: (p) => this.tool.hover?.(this.ptr(p)),
      pan: (dx, dy) => this.rig.pan(dx, dy),
      zoom: (f) => this.rig.zoom(f),
      rotate: (a, b) => this.rig.rotate(a, b),
    });
    this.rebuild();
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.autosave) this.saveNow(); });
  }

  /* ------------------------------------------------------------ Coordenadas */

  get base(): number {
    return this.view.level * this.project.levelHeight;
  }

  ptr(p: PointerInfo): ToolPointer {
    const rc = this.rig.ray(p.sx, p.sy);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.base);
    const hit = new THREE.Vector3();
    const ok = rc.ray.intersectPlane(plane, hit);
    return { ...p, rc, ground: ok ? { x: hit.x, y: hit.z } : null };
  }

  /** Aplica grade, ímã nos vértices existentes e limites do lote. */
  snapPoint(pt: P, opts: { from?: P; magnet?: boolean } = {}): { p: P; magnet: boolean } {
    let p = { ...pt };
    let magnet = false;
    if (this.snap.magnet && opts.magnet !== false) {
      let best = 0.35;
      for (const w of this.project.walls) {
        if (w.level !== this.view.level) continue;
        for (const e of [w.a, w.b]) {
          const d = dist(e, pt);
          if (d < best) { best = d; p = { ...e }; magnet = true; }
        }
      }
    }
    if (!magnet) {
      if (opts.from && this.snap.angle) {
        const d = sub(p, opts.from);
        const L = Math.hypot(d.x, d.y);
        if (L > 0.05) {
          const step = Math.PI / 12;
          const ang = Math.atan2(d.y, d.x);
          const sa = Math.round(ang / step) * step;
          if (Math.abs(sa - ang) < 0.06) {
            const Ls = this.snap.grid ? Math.max(this.snap.step, snapV(L, this.snap.step)) : L;
            p = { x: opts.from.x + Math.cos(sa) * Ls, y: opts.from.y + Math.sin(sa) * Ls };
            return { p: clampToLot(this.project, p), magnet };
          }
        }
      }
      if (this.snap.grid) p = { x: snapV(p.x, this.snap.step), y: snapV(p.y, this.snap.step) };
    }
    return { p: clampToLot(this.project, p), magnet };
  }

  /** Altura do topo do piso (relativa à base do andar) em um ponto. */
  floorTopAt(level: number, pt: P): number {
    let top = 0;
    for (const f of this.project.floors) {
      if (f.level === level && pointInPolygon(pt, f.points)) top = Math.max(top, f.elevation);
    }
    return top;
  }

  /* ------------------------------------------------------------ Alterações */

  /** Snapshot da construção (sem o estado do modo Vida, que não participa do desfazer). */
  snapshot(): string {
    return serializeProject({ ...this.project, life: undefined, city: undefined });
  }

  /** Restaura um snapshot preservando o estado do modo Vida. */
  private restore(s: string) {
    const { life, city } = this.project;
    this.project = deserializeProject(s);
    this.project.life = life;
    this.project.city = city;
  }

  /** Executa uma alteração atômica com desfazer e validação de saldo. */
  commit(label: string, fn: (p: Project) => void): boolean {
    const before = this.snapshot();
    try {
      fn(this.project);
    } catch (e) {
      this.restore(before);
      this.rebuild();
      const msg = (e as Error).message;
      this.emit('toast', msg === 'fora' ? 'A alteração ultrapassa os limites do terreno.' : `Não foi possível aplicar: ${msg}`);
      return false;
    }
    if (before === this.snapshot()) return false;
    return this.finish(before, label);
  }

  beginLive() {
    if (!this.liveSnapshot) this.liveSnapshot = this.snapshot();
  }

  endLive(label: string): boolean {
    const before = this.liveSnapshot;
    this.liveSnapshot = null;
    if (!before) return false;
    if (before === this.snapshot()) return false;
    return this.finish(before, label);
  }

  cancelLive() {
    if (!this.liveSnapshot) return;
    this.restore(this.liveSnapshot);
    this.liveSnapshot = null;
    this.rebuild();
  }

  private finish(before: string, _label: string): boolean {
    if (this.project.mode === 'simulacao' && balance(this.project) < 0) {
      const cost = computeCost(this.project).total;
      this.restore(before);
      this.rebuild();
      this.emit('toast', `Saldo insuficiente: faltam ${fmtMoney(cost - this.project.funds)}`);
      return false;
    }
    this.history.push(before);
    this.project.updatedAt = Date.now();
    this.recountLevels();
    this.rebuild();
    this.scheduleSave();
    return true;
  }

  undo() {
    const s = this.history.undo(this.snapshot());
    if (!s) return;
    this.restore(s);
    this.afterRestore();
  }

  redo() {
    const s = this.history.redo(this.snapshot());
    if (!s) return;
    this.restore(s);
    this.afterRestore();
  }

  private afterRestore() {
    if (this.selection && !this.find(this.selection)) this.selection = null;
    this.view.level = Math.min(this.view.level, this.project.levels - 1);
    this.rebuild();
    this.emit('selection', this.selection);
    this.scheduleSave();
  }

  loadProject(p: Project) {
    this.project = p;
    this.autosave = true;
    this.history.clear();
    this.select(null);
    this.view.level = 0;
    this.engine.buildTerrain(p.lot);
    this.rig.setLevelY(0);
    this.rig.frame(p.lot.w, p.lot.d);
    this.rebuild();
    this.saveNow();
  }

  /** Troca o conteúdo construído exibido (mudança de terreno na cidade). */
  swapStructure(lot: Project['lot'], s: { levels: number; walls: Project['walls']; openings: Project['openings']; floors: Project['floors']; stairs: Project['stairs']; roofs: Project['roofs']; items: Project['items'] }) {
    Object.assign(this.project, { lot, levels: Math.max(1, s.levels), walls: s.walls, openings: s.openings, floors: s.floors, stairs: s.stairs, roofs: s.roofs, items: s.items });
    this.history.clear();
    this.selection = null;
    this.view.level = 0;
    this.engine.buildTerrain(lot);
    this.rig.setLevelY(0);
    this.rig.frame(lot.w, lot.d);
    this.rebuild();
    this.emit('selection', null);
    this.scheduleSave();
  }

  private recountLevels() {
    const p = this.project;
    let maxL = 0;
    for (const arr of [p.walls, p.floors, p.items, p.roofs] as { level: number }[][]) for (const e of arr) maxL = Math.max(maxL, e.level);
    for (const s of p.stairs) maxL = Math.max(maxL, s.level + 1);
    p.levels = Math.max(p.levels, maxL + 1, this.view.level + 1);
  }

  /** Salvamento automático só depois que um jogo começa (não salva o cenário do menu). */
  autosave = false;

  scheduleSave() {
    if (!this.autosave) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveNow(), 1200);
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    const ok = storage.saveGame(this.project);
    if (ok) this.emit('saved', Date.now());
    else this.emit('toast', 'Não foi possível salvar: armazenamento cheio ou bloqueado.');
  }

  rebuild() {
    this.world.rebuild(this.project, this.view);
    this.refreshSelection();
    this.emit('change', this.project);
  }

  /* ------------------------------------------------------------ Entidades */

  find(ref: EntityRef): any {
    const p = this.project;
    const arr = { wall: p.walls, opening: p.openings, floor: p.floors, stair: p.stairs, roof: p.roofs, item: p.items }[ref.kind] as { id: string }[];
    return arr.find((e) => e.id === ref.id) ?? null;
  }

  removeEntity(p: Project, ref: EntityRef) {
    switch (ref.kind) {
      case 'wall':
        p.walls = p.walls.filter((w) => w.id !== ref.id);
        p.openings = p.openings.filter((o) => o.wallId !== ref.id);
        break;
      case 'opening': p.openings = p.openings.filter((o) => o.id !== ref.id); break;
      case 'floor': p.floors = p.floors.filter((f) => f.id !== ref.id); break;
      case 'stair': p.stairs = p.stairs.filter((s) => s.id !== ref.id); break;
      case 'roof': p.roofs = p.roofs.filter((r) => r.id !== ref.id); break;
      case 'item': p.items = p.items.filter((i) => i.id !== ref.id); break;
    }
  }

  deleteSelection() {
    const sel = this.selection;
    if (!sel) return;
    this.select(null);
    this.commit('Excluir', (p) => this.removeEntity(p, sel));
  }

  duplicateSelection() {
    const sel = this.selection;
    if (!sel) return;
    const e = this.find(sel);
    if (!e) return;
    const off = { x: 1, y: 1 };
    const copy = JSON.parse(JSON.stringify(e));
    copy.id = uid(sel.kind[0]);
    let ok = true;
    ok = this.commit('Duplicar', (p) => {
      switch (sel.kind) {
        case 'wall': {
          const w = copy as Wall;
          w.a = clampToLot(p, add(w.a, off)); w.b = clampToLot(p, add(w.b, off));
          p.walls.push(w);
          break;
        }
        case 'floor': {
          this.copyRoomInto(p, e as Floor, this.roomCopyOffset(e as Floor));
          break;
        }
        case 'item': copy.pos = clampToLot(p, add(copy.pos, off)); p.items.push(copy); break;
        case 'stair': copy.pos = clampToLot(p, add(copy.pos, { x: 2, y: 0 })); p.stairs.push(copy); break;
        case 'roof': copy.center = clampToLot(p, add(copy.center, { x: 2, y: 0 })); p.roofs.push(copy); break;
        case 'opening': {
          const o = copy;
          const wall = p.walls.find((w) => w.id === o.wallId);
          if (wall) { o.t += o.width + 0.3; p.openings.push(o); }
          break;
        }
      }
    });
    if (ok && sel.kind !== 'floor' && sel.kind !== 'opening') this.select({ kind: sel.kind, id: copy.id });
  }

  /* ------------------------------------------------------------ Cômodos */

  /** Entidades pertencentes a um cômodo (definido por um piso). */
  roomMembers(p: Project, f: Floor) {
    const inside = (pt: P) => pointInPolygon(pt, f.points) || distToPolygonEdge(pt, f.points) < 0.08;
    return {
      walls: p.walls.filter((w) => w.level === f.level && inside(w.a) && inside(w.b) && wallPath(w).every(inside)),
      items: p.items.filter((i) => i.level === f.level && inside(i.pos)),
      stairs: p.stairs.filter((s) => s.level === f.level && inside(s.pos)),
    };
  }

  roomCopyOffset(f: Floor): P {
    const b = bbox(f.points);
    const w = b.maxX - b.minX;
    const lot = this.project.lot;
    if (b.maxX + w + 1 <= lot.w / 2) return { x: w + 1, y: 0 };
    if (b.minX - w - 1 >= -lot.w / 2) return { x: -w - 1, y: 0 };
    const d = b.maxY - b.minY;
    return { x: 0, y: b.maxY + d + 1 <= lot.d / 2 ? d + 1 : -d - 1 };
  }

  copyRoomInto(p: Project, f: Floor, off: P): string {
    const m = this.roomMembers(p, f);
    const nf: Floor = { ...JSON.parse(JSON.stringify(f)), id: uid('f') };
    nf.points = nf.points.map((pt) => add(pt, off));
    p.floors.push(nf);
    for (const w of m.walls) {
      const nw: Wall = { ...JSON.parse(JSON.stringify(w)), id: uid('w') };
      nw.a = add(nw.a, off); nw.b = add(nw.b, off);
      p.walls.push(nw);
      for (const o of p.openings.filter((oo) => oo.wallId === w.id)) p.openings.push({ ...o, id: uid('o'), wallId: nw.id });
    }
    for (const it of m.items) p.items.push({ ...JSON.parse(JSON.stringify(it)), id: uid('i'), pos: add(it.pos, off) });
    for (const s of m.stairs) p.stairs.push({ ...JSON.parse(JSON.stringify(s)), id: uid('s'), pos: add(s.pos, off) });
    return nf.id;
  }

  /** Move piso + paredes + objetos de um cômodo (operação ao vivo). */
  moveRoomLive(floorId: string, delta: P, members: ReturnType<Editor['roomMembers']>) {
    const p = this.project;
    const f = p.floors.find((x) => x.id === floorId);
    if (!f) return;
    f.points = f.points.map((pt) => add(pt, delta));
    const wallIds = new Set(members.walls.map((w) => w.id));
    for (const w of p.walls) if (wallIds.has(w.id)) { w.a = add(w.a, delta); w.b = add(w.b, delta); }
    const itemIds = new Set(members.items.map((i) => i.id));
    for (const i of p.items) if (itemIds.has(i.id)) i.pos = add(i.pos, delta);
    const stairIds = new Set(members.stairs.map((s) => s.id));
    for (const s of p.stairs) if (stairIds.has(s.id)) s.pos = add(s.pos, delta);
  }

  /** Redimensiona um cômodo em relação ao centro (dw/dd em metros). */
  resizeRoom(floorId: string, dw: number, dd: number) {
    const f0 = this.project.floors.find((x) => x.id === floorId);
    if (!f0) return;
    const b = bbox(f0.points);
    const W = b.maxX - b.minX, D = b.maxY - b.minY;
    const sx = Math.max(0.2, (W + dw) / W), sy = Math.max(0.2, (D + dd) / D);
    if ((W + dw) < 1 || (D + dd) < 1) { this.emit('toast', 'Tamanho mínimo: 1 m'); return; }
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    const sc = (pt: P): P => ({ x: c.x + (pt.x - c.x) * sx, y: c.y + (pt.y - c.y) * sy });
    this.commit('Redimensionar cômodo', (p) => {
      const f = p.floors.find((x) => x.id === floorId)!;
      const m = this.roomMembers(p, f);
      f.points = f.points.map(sc);
      for (const w of m.walls) {
        const L0 = dist(w.a, w.b);
        w.a = sc(w.a); w.b = sc(w.b);
        const L1 = dist(w.a, w.b);
        if (L0 > 0) w.bulge *= L1 / L0;
      }
      for (const i of m.items) i.pos = sc(i.pos);
      for (const s of m.stairs) s.pos = sc(s.pos);
      if (f.points.some((pt) => Math.abs(pt.x) > p.lot.w / 2 + 1e-6 || Math.abs(pt.y) > p.lot.d / 2 + 1e-6)) {
        throw new Error('fora');
      }
    });
  }

  /* ------------------------------------------------------------ Seleção */

  select(ref: EntityRef | null) {
    this.selection = ref;
    this.refreshSelection();
    this.emit('selection', ref);
  }

  refreshSelection() {
    this.selHelpers.clear();
    this.selLabels = [];
    const sel = this.selection;
    if (sel && !this.find(sel)) this.selection = null;
    if (this.selection) {
      const obj = this.world.objects.get(this.selection.id);
      const e = this.find(this.selection);
      if (obj) {
        const box = new THREE.BoxHelper(obj, '#ffcc33');
        (box.material as THREE.LineBasicMaterial).depthTest = false;
        box.renderOrder = 10;
        this.selHelpers.add(box);
      }
      if (this.selection.kind === 'wall' && e) {
        const w = e as Wall;
        const base = w.level * this.project.levelHeight;
        for (const [k, pt] of [['a', w.a], ['b', w.b]] as const) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10), new THREE.MeshBasicMaterial({ color: '#ffcc33', depthTest: false }));
          s.position.set(pt.x, base + 0.3, pt.y);
          s.renderOrder = 11;
          s.userData.handle = k;
          this.selHelpers.add(s);
        }
      }
      if (this.selection.kind === 'floor' && e) {
        const f = e as Floor;
        const c = centroid(f.points);
        this.selLabels.push({ text: `${Math.abs(polygonArea(f.points)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m²`, pos: new THREE.Vector3(c.x, f.level * this.project.levelHeight + f.elevation + 0.1, c.y), kind: 'info' });
      }
    }
    this.engine.invalidate();
    this.emitLabels();
  }

  /** Atualiza só a transformação 3D de uma entidade (durante arrastos). */
  updateObjectTransform(ref: EntityRef) {
    const obj = this.world.objects.get(ref.id);
    const e = this.find(ref);
    if (!obj || !e) return;
    const p = this.project;
    if (ref.kind === 'item') this.world.placeItem(obj, e as Item, p);
    else if (ref.kind === 'stair') { obj.position.set(e.pos.x, e.level * p.levelHeight, e.pos.y); obj.rotation.y = -e.rot; }
    else if (ref.kind === 'roof') { obj.position.set(e.center.x, e.level * p.levelHeight + p.levelHeight, e.center.y); obj.rotation.y = -e.rot; }
    this.refreshSelection();
  }

  /* ------------------------------------------------------------ Ferramentas e vista */

  setTool(t: Tool) {
    this.tool.deactivate?.();
    this.clearPreview();
    this.setToolLabels([]);
    this.tool = t;
    t.activate?.();
    this.emit('tool', t);
  }

  clearPreview() {
    for (const c of [...this.preview.children]) {
      c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.shared) m.geometry.dispose(); });
      this.preview.remove(c);
    }
    this.engine.invalidate();
  }

  setToolLabels(l: Label[]) {
    this.toolLabels = l;
    this.emitLabels();
  }

  private emitLabels() {
    this.emit('labels', [...this.selLabels, ...this.toolLabels]);
  }

  setLevel(level: number) {
    if (level < 0) return;
    if (level >= MAX_LEVELS) { this.emit('toast', `Limite de ${MAX_LEVELS} andares neste dispositivo`); return; }
    if (level >= this.project.levels) this.project.levels = level + 1;
    this.view.level = level;
    this.rig.setLevelY(level * this.project.levelHeight);
    this.select(null);
    this.tool.cancel?.();
    this.rebuild();
    this.emit('view', this.view);
  }

  setView(patch: Partial<ViewState>) {
    Object.assign(this.view, patch);
    this.rebuild();
    this.emit('view', this.view);
  }

  catalogDef(id: string) {
    return CATALOG_BY_ID.get(id);
  }

  rotatePoint(p: P, c: P, a: number): P {
    return add(c, rotate(sub(p, c), a));
  }
}

export interface ToolPointer extends PointerInfo {
  rc: THREE.Raycaster;
  ground: P | null;
}
