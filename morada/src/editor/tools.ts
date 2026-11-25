import * as THREE from 'three';
import type { Editor, ToolPointer, Label } from './editor';
import type { P, Wall, WallKind, Floor, OpeningKind, StairKind, RoofKind, Item, Stair, Roof, Opening } from '../model/types';
import {
  dist, lerp, wallPath, wallLength, projectOnPath, fmtM, fmtM2, sub, add, norm, mul, rotate, bbox,
  stairFootprint, snap as snapV,
} from '../model/geometry';
import { uid, OPENING_PRESETS, PRESET_BY_KIND, openingFits, insideLot, MAX_LEVELS } from '../model/project';
import { CATALOG_BY_ID, type CatalogDef } from '../model/catalog';
import { buildWallGeometry } from '../render/wallMesh';
import { buildStairGroup, buildRoofGroup } from '../render/structureMesh';
import { buildItemModel, disposeModel } from '../render/furniture';

/* ------------------------------------------------------------------ Tipos de opção */

export type ToolOption =
  | { type: 'seg'; label: string; value: string; options: { v: string; label: string }[]; set: (v: string) => void }
  | { type: 'range'; label: string; min: number; max: number; step: number; value: number; fmt: (v: number) => string; set: (v: number) => void }
  | { type: 'toggle'; label: string; value: boolean; set: (v: boolean) => void }
  | { type: 'button'; label: string; action: () => void; primary?: boolean; disabled?: boolean }
  | { type: 'info'; label: string }
  | { type: 'materials'; value: string; set: (v: string) => void; use?: 'parede' | 'piso' | 'telhado' | 'movel' }
  | { type: 'swatches'; value: string; set: (v: string) => void };

export interface Tool {
  id: string;
  name: string;
  hint: string;
  options?(): ToolOption[];
  down?(p: ToolPointer): boolean;
  move?(p: ToolPointer): void;
  up?(p: ToolPointer): void;
  tap?(p: ToolPointer): void;
  longPress?(p: ToolPointer): void;
  hover?(p: ToolPointer): void;
  cancel?(): void;
  activate?(): void;
  deactivate?(): void;
}

const GHOST = new THREE.MeshStandardMaterial({ color: '#5aa9ff', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
const GHOST_BAD = new THREE.MeshStandardMaterial({ color: '#ff5a5a', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
GHOST.userData.shared = GHOST_BAD.userData.shared = true;

function dot(editor: Editor, p: P, y: number, color = '#ffcc33') {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color, depthTest: false }));
  m.position.set(p.x, y + 0.05, p.y);
  m.renderOrder = 12;
  editor.preview.add(m);
}

function line(editor: Editor, pts: P[], y: number, color = '#ffcc33', closed = false) {
  const v = pts.map((p) => new THREE.Vector3(p.x, y + 0.06, p.y));
  if (closed && v.length) v.push(v[0].clone());
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(v), new THREE.LineBasicMaterial({ color, depthTest: false }));
  l.renderOrder = 12;
  editor.preview.add(l);
}

const v3 = (p: P, y: number) => new THREE.Vector3(p.x, y, p.y);

function newWall(editor: Editor, a: P, b: P, kind: WallKind, bulge = 0): Wall {
  const lh = editor.project.levelHeight;
  const presets: Record<WallKind, { h: number; t: number }> = {
    parede: { h: lh, t: 0.15 },
    meia: { h: 1.1, t: 0.15 },
    divisoria: { h: Math.min(2.6, lh), t: 0.08 },
  };
  return {
    id: uid('w'), level: editor.view.level, a: { ...a }, b: { ...b }, bulge, height: presets[kind].h, thickness: presets[kind].t,
    kind, material: 'pintura', color: '#f1ece3',
  };
}

function newFloor(editor: Editor, pts: P[], elevation?: number): Floor {
  const ground = editor.view.level === 0;
  return {
    id: uid('f'), level: editor.view.level, points: pts.map((p) => ({ ...p })),
    material: 'porcelanato', color: '#d9d4cc',
    elevation: elevation ?? (ground ? 0.05 : 0), thickness: ground ? 0.15 : 0.2,
  };
}

/** Garante orientação anti-horária e remove pontos repetidos. */
function cleanPoly(pts: P[]): P[] {
  const out: P[] = [];
  for (const p of pts) if (!out.length || dist(out[out.length - 1], p) > 0.01) out.push(p);
  if (out.length > 2 && dist(out[0], out[out.length - 1]) < 0.01) out.pop();
  return out;
}

function circlePoly(c: P, r: number, n = 48): P[] {
  return Array.from({ length: n }, (_, i) => ({ x: c.x + Math.cos((i / n) * Math.PI * 2) * r, y: c.y + Math.sin((i / n) * Math.PI * 2) * r }));
}

/* ================================================================== Selecionar */

type Drag =
  | { kind: 'item' | 'stair' | 'roof'; id: string; off: P }
  | { kind: 'opening'; id: string }
  | { kind: 'wallEnd'; id: string; end: 'a' | 'b'; linked: { id: string; end: 'a' | 'b' }[] }
  | { kind: 'wall'; id: string; start: P; a0: P; b0: P }
  | { kind: 'room'; id: string; last: P; members: ReturnType<Editor['roomMembers']> };

export class SelectTool implements Tool {
  id = 'selecionar';
  name = 'Selecionar';
  hint = 'Toque para selecionar. Arraste objetos para mover. Toque longo abre opções.';
  private drag: Drag | null = null;
  moveRoomId: string | null = null;

  constructor(private e: Editor) {}

  options(): ToolOption[] {
    if (this.moveRoomId) return [
      { type: 'info', label: 'Arraste para mover o cômodo inteiro' },
      { type: 'button', label: 'Concluir', primary: true, action: () => { this.moveRoomId = null; this.e.emit('tool', this); } },
    ];
    return [];
  }

  down(p: ToolPointer): boolean {
    const e = this.e;
    if (this.moveRoomId && p.ground) {
      const f = e.project.floors.find((x) => x.id === this.moveRoomId);
      if (!f) { this.moveRoomId = null; return false; }
      e.beginLive();
      this.drag = { kind: 'room', id: f.id, last: p.ground, members: e.roomMembers(e.project, f) };
      return true;
    }
    // Alças das pontas da parede selecionada.
    const hh = p.rc.intersectObjects(e.selHelpers.children.filter((c) => c.userData.handle), false)[0];
    if (hh && e.selection?.kind === 'wall') {
      const w = e.find(e.selection) as Wall;
      const end = hh.object.userData.handle as 'a' | 'b';
      const pt = w[end];
      const linked = e.project.walls
        .filter((o) => o.id !== w.id && o.level === w.level)
        .flatMap((o) => (['a', 'b'] as const).filter((k) => dist(o[k], pt) < 0.03).map((k) => ({ id: o.id, end: k })));
      e.beginLive();
      this.drag = { kind: 'wallEnd', id: w.id, end, linked };
      return true;
    }
    const hit = e.world.pick(p.rc);
    if (!hit) return false;
    const ent = e.find(hit.ref);
    if (!ent || ent.level !== undefined && ent.level !== e.view.level && hit.ref.kind !== 'opening') return false;
    if (hit.ref.kind === 'item' || hit.ref.kind === 'stair' || hit.ref.kind === 'roof') {
      const pos = hit.ref.kind === 'roof' ? (ent as Roof).center : (ent as Item | Stair).pos;
      const g = p.ground ?? { x: hit.point.x, y: hit.point.z };
      e.select(hit.ref);
      e.beginLive();
      this.drag = { kind: hit.ref.kind, id: hit.ref.id, off: sub(pos, g) };
      return true;
    }
    if (hit.ref.kind === 'opening') {
      e.select(hit.ref);
      e.beginLive();
      this.drag = { kind: 'opening', id: hit.ref.id };
      return true;
    }
    if (hit.ref.kind === 'wall' && e.selection?.id === hit.ref.id && p.ground) {
      const w = ent as Wall;
      e.beginLive();
      this.drag = { kind: 'wall', id: w.id, start: p.ground, a0: { ...w.a }, b0: { ...w.b } };
      return true;
    }
    return false;
  }

  move(p: ToolPointer) {
    const e = this.e, d = this.drag;
    if (!d || !p.ground) return;
    const pr = e.project;
    switch (d.kind) {
      case 'item': {
        const it = pr.items.find((i) => i.id === d.id);
        if (!it) return;
        const def = CATALOG_BY_ID.get(it.catalogId)!;
        const pl = computePlacement(e, def, it.scale, it.rot, p, it.id, add(p.ground, d.off));
        it.pos = pl.pos; it.elev = pl.elev; it.rot = pl.rot;
        e.updateObjectTransform({ kind: 'item', id: it.id });
        this.collisionHint(pl.ok);
        break;
      }
      case 'stair': {
        const s = pr.stairs.find((x) => x.id === d.id);
        if (!s) return;
        s.pos = e.snapPoint(add(p.ground, d.off), { magnet: false }).p;
        e.updateObjectTransform({ kind: 'stair', id: s.id });
        break;
      }
      case 'roof': {
        const r = pr.roofs.find((x) => x.id === d.id);
        if (!r) return;
        r.center = e.snapPoint(add(p.ground, d.off), { magnet: false }).p;
        e.updateObjectTransform({ kind: 'roof', id: r.id });
        break;
      }
      case 'opening': {
        const o = pr.openings.find((x) => x.id === d.id);
        const w = o && pr.walls.find((x) => x.id === o.wallId);
        if (!o || !w) return;
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(w.level * pr.levelHeight));
        const hit = new THREE.Vector3();
        if (!p.rc.ray.intersectPlane(plane, hit)) return;
        let t = projectOnPath(wallPath(w), { x: hit.x, y: hit.z }).s;
        if (e.snap.grid) t = snapV(t, 0.05);
        if (openingFits(pr, w, { ...o, t })) { o.t = t; e.rebuild(); }
        break;
      }
      case 'wallEnd': {
        const w = pr.walls.find((x) => x.id === d.id);
        if (!w) return;
        const other = d.end === 'a' ? w.b : w.a;
        const np = e.snapPoint(p.ground, { from: other }).p;
        if (dist(np, other) < 0.2) return;
        w[d.end] = np;
        for (const l of d.linked) { const o = pr.walls.find((x) => x.id === l.id); if (o) o[l.end] = { ...np }; }
        this.clampOpenings(w);
        e.rebuild();
        this.wallLabel(w);
        break;
      }
      case 'wall': {
        const w = pr.walls.find((x) => x.id === d.id);
        if (!w) return;
        let delta = sub(p.ground, d.start);
        if (e.snap.grid) delta = { x: snapV(delta.x, e.snap.step), y: snapV(delta.y, e.snap.step) };
        const a = add(d.a0, delta), b = add(d.b0, delta);
        if (!insideLot(pr, a) || !insideLot(pr, b)) return;
        w.a = a; w.b = b;
        e.rebuild();
        break;
      }
      case 'room': {
        let delta = sub(p.ground, d.last);
        if (e.snap.grid) delta = { x: snapV(delta.x, e.snap.step), y: snapV(delta.y, e.snap.step) };
        if (Math.abs(delta.x) < 1e-6 && Math.abs(delta.y) < 1e-6) return;
        const f = pr.floors.find((x) => x.id === d.id);
        if (!f || f.points.some((pt) => !insideLot(pr, add(pt, delta)))) return;
        e.moveRoomLive(d.id, delta, d.members);
        d.last = add(d.last, delta);
        e.rebuild();
        break;
      }
    }
  }

  private badPlacement = false;
  private collisionHint(ok: boolean) {
    this.badPlacement = !ok;
  }

  private clampOpenings(w: Wall) {
    const L = wallLength(w);
    for (const o of this.e.project.openings) {
      if (o.wallId !== w.id) continue;
      o.t = Math.max(o.width / 2 + 0.05, Math.min(L - o.width / 2 - 0.05, o.t));
    }
    this.e.project.openings = this.e.project.openings.filter((o) => o.wallId !== w.id || o.width + 0.1 <= L);
  }

  private wallLabel(w: Wall) {
    const mid = wallPath(w);
    const c = mid[Math.floor(mid.length / 2)];
    this.e.setToolLabels([{ text: fmtM(wallLength(w)), pos: v3(c, w.level * this.e.project.levelHeight + w.height + 0.3), kind: 'medida' }]);
  }

  up() {
    const e = this.e;
    const d = this.drag;
    this.drag = null;
    e.setToolLabels([]);
    if (!d) return;
    if (d.kind === 'item' && this.badPlacement) {
      this.badPlacement = false;
      e.cancelLive();
      e.emit('toast', 'Posição bloqueada: o objeto colide com uma parede.');
      return;
    }
    e.endLive('Mover');
  }

  tap(p: ToolPointer) {
    if (this.moveRoomId) return;
    const e = this.e;
    const hit = e.world.pick(p.rc);
    if (!hit) { e.select(null); return; }
    const ent = e.find(hit.ref);
    if (ent && ent.level !== undefined && ent.level !== e.view.level && !e.view.showAll) { e.select(null); return; }
    e.select(hit.ref);
  }

  longPress(p: ToolPointer) {
    this.tap(p);
    if (this.e.selection) this.e.emit('selection', this.e.selection);
  }

  cancel() {
    if (this.drag) { this.drag = null; this.e.cancelLive(); }
    this.e.setToolLabels([]);
  }
}

/* ================================================================== Paredes e cômodos */

type WallMode = 'reta' | 'curva' | 'circulo' | 'retangulo' | 'poligono';

export class WallTool implements Tool {
  id = 'parede';
  name = 'Paredes';
  hint = 'Arraste o dedo para desenhar. Use os modos para curvas, círculos e cômodos.';
  mode: WallMode = 'reta';
  kind: WallKind = 'parede';
  curvature = 25;
  withFloor = true;
  private start: P | null = null;
  private end: P | null = null;
  private poly: P[] = [];

  constructor(private e: Editor) {}

  options(): ToolOption[] {
    const o: ToolOption[] = [
      {
        type: 'seg', label: 'Modo', value: this.mode, set: (v) => { this.mode = v as WallMode; this.reset(); this.e.emit('tool', this); },
        options: [
          { v: 'reta', label: 'Reta' }, { v: 'curva', label: 'Curva' }, { v: 'circulo', label: 'Círculo' },
          { v: 'retangulo', label: 'Cômodo ▭' }, { v: 'poligono', label: 'Cômodo livre' },
        ],
      },
      {
        type: 'seg', label: 'Tipo', value: this.kind, set: (v) => { this.kind = v as WallKind; this.e.emit('tool', this); },
        options: [{ v: 'parede', label: 'Parede' }, { v: 'meia', label: 'Meia parede' }, { v: 'divisoria', label: 'Divisória' }],
      },
    ];
    if (this.mode === 'curva') o.push({ type: 'range', label: 'Curvatura', min: -50, max: 50, step: 1, value: this.curvature, fmt: (v) => `${v}%`, set: (v) => { this.curvature = v; } });
    if (this.mode === 'retangulo' || this.mode === 'circulo' || this.mode === 'poligono') o.push({ type: 'toggle', label: 'Criar piso', value: this.withFloor, set: (v) => { this.withFloor = v; } });
    if (this.mode === 'poligono') {
      o.push({ type: 'info', label: `${this.poly.length} ponto(s) — toque no 1º ponto para fechar` });
      o.push({ type: 'button', label: 'Desfazer ponto', disabled: !this.poly.length, action: () => { this.poly.pop(); this.drawPoly(null); this.e.emit('tool', this); } });
      o.push({ type: 'button', label: 'Concluir', primary: true, disabled: this.poly.length < 3, action: () => this.finishPoly(true) });
      o.push({ type: 'button', label: 'Linha aberta', disabled: this.poly.length < 2, action: () => this.finishPoly(false) });
    }
    return o;
  }

  private reset() {
    this.start = this.end = null;
    this.poly = [];
    this.e.clearPreview();
    this.e.setToolLabels([]);
  }

  private get y() { return this.e.base; }

  down(p: ToolPointer): boolean {
    if (this.mode === 'poligono' || !p.ground) return false;
    this.start = this.e.snapPoint(p.ground).p;
    this.end = this.start;
    this.draw();
    return true;
  }

  move(p: ToolPointer) {
    if (!this.start || !p.ground) return;
    const from = this.mode === 'reta' || this.mode === 'curva' ? this.start : undefined;
    this.end = this.e.snapPoint(p.ground, { from }).p;
    this.draw();
  }

  hover(p: ToolPointer) {
    if (this.mode === 'poligono' && p.ground && this.poly.length) {
      this.drawPoly(this.e.snapPoint(p.ground, { from: this.poly[this.poly.length - 1] }).p);
    }
  }

  private bulge(a: P, b: P) {
    return this.mode === 'curva' ? (this.curvature / 100) * dist(a, b) : 0;
  }

  private draw() {
    const e = this.e;
    e.clearPreview();
    const a = this.start!, b = this.end!;
    const y = this.y;
    dot(e, a, y);
    const labels: Label[] = [];
    const ghostWall = (w: Wall) => e.preview.add(new THREE.Mesh(buildWallGeometry(w, [], y, null, 0, 0), GHOST));
    if (this.mode === 'reta' || this.mode === 'curva') {
      if (dist(a, b) > 0.05) {
        const w = newWall(e, a, b, this.kind, this.bulge(a, b));
        ghostWall(w);
        dot(e, b, y);
        const path = wallPath(w);
        const mid = path[Math.floor(path.length / 2)];
        const ang = (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI;
        labels.push({ text: `${fmtM(wallLength(w))} · ${Math.round((ang + 360) % 360)}°`, pos: v3(mid, y + w.height + 0.4), kind: 'medida' });
      }
    } else if (this.mode === 'retangulo') {
      const pts = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
      if (Math.abs(b.x - a.x) > 0.05 && Math.abs(b.y - a.y) > 0.05) {
        for (let i = 0; i < 4; i++) ghostWall(newWall(e, pts[i], pts[(i + 1) % 4], this.kind));
        const W = Math.abs(b.x - a.x), D = Math.abs(b.y - a.y);
        labels.push({ text: fmtM(W), pos: v3(lerp(pts[0], pts[1], 0.5), y + 3.3), kind: 'medida' });
        labels.push({ text: fmtM(D), pos: v3(lerp(pts[1], pts[2], 0.5), y + 3.3), kind: 'medida' });
        labels.push({ text: fmtM2(W * D), pos: v3(lerp(a, b, 0.5), y + 0.2), kind: 'info' });
      }
    } else if (this.mode === 'circulo') {
      const r = dist(a, b);
      if (r > 0.3) {
        const [w1, w2] = this.circleWalls(a, r);
        ghostWall(w1); ghostWall(w2);
        labels.push({ text: `raio ${fmtM(r)} · Ø ${fmtM(r * 2)}`, pos: v3(a, y + 3.3), kind: 'medida' });
      }
    }
    e.setToolLabels(labels);
    e.engine.invalidate();
  }

  private circleWalls(c: P, r: number): [Wall, Wall] {
    const a = { x: c.x + r, y: c.y }, b = { x: c.x - r, y: c.y };
    return [newWall(this.e, a, b, this.kind, r), newWall(this.e, b, a, this.kind, r)];
  }

  up() {
    const e = this.e;
    const a = this.start, b = this.end;
    this.start = this.end = null;
    e.clearPreview();
    e.setToolLabels([]);
    if (!a || !b) return;
    if (this.mode === 'reta' || this.mode === 'curva') {
      if (dist(a, b) < 0.2) return;
      const w = newWall(e, a, b, this.kind, this.bulge(a, b));
      e.commit('Parede', (p) => { p.walls.push(w); });
    } else if (this.mode === 'retangulo') {
      if (Math.abs(b.x - a.x) < 0.5 || Math.abs(b.y - a.y) < 0.5) return;
      const pts = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
      e.commit('Cômodo', (p) => {
        for (let i = 0; i < 4; i++) p.walls.push(newWall(e, pts[i], pts[(i + 1) % 4], this.kind));
        if (this.withFloor) p.floors.push(newFloor(e, pts));
      });
    } else if (this.mode === 'circulo') {
      const r = dist(a, b);
      if (r < 0.5) return;
      if (!insideLot(e.project, { x: a.x + r, y: a.y + r }) || !insideLot(e.project, { x: a.x - r, y: a.y - r })) {
        e.emit('toast', 'O círculo ultrapassa os limites do terreno.');
        return;
      }
      const [w1, w2] = this.circleWalls(a, r);
      e.commit('Cômodo circular', (p) => {
        p.walls.push(w1, w2);
        if (this.withFloor) p.floors.push(newFloor(e, circlePoly(a, r - 0.02)));
      });
    }
  }

  tap(p: ToolPointer) {
    if (this.mode !== 'poligono' || !p.ground) return;
    const last = this.poly[this.poly.length - 1];
    const pt = this.e.snapPoint(p.ground, { from: last }).p;
    if (this.poly.length >= 3 && dist(pt, this.poly[0]) < 0.35) { this.finishPoly(true); return; }
    if (last && dist(last, pt) < 0.1) return;
    this.poly.push(pt);
    this.drawPoly(null);
    this.e.emit('tool', this);
  }

  private drawPoly(cursor: P | null) {
    const e = this.e;
    e.clearPreview();
    const y = this.y;
    this.poly.forEach((pt, i) => dot(e, pt, y, i === 0 ? '#5aff9a' : '#ffcc33'));
    for (let i = 1; i < this.poly.length; i++) e.preview.add(new THREE.Mesh(buildWallGeometry(newWall(e, this.poly[i - 1], this.poly[i], this.kind), [], y, null, 0, 0), GHOST));
    if (cursor && this.poly.length) line(e, [this.poly[this.poly.length - 1], cursor], y);
    const labels: Label[] = [];
    for (let i = 1; i < this.poly.length; i++) labels.push({ text: fmtM(dist(this.poly[i - 1], this.poly[i])), pos: v3(lerp(this.poly[i - 1], this.poly[i], 0.5), y + 3.3), kind: 'medida' });
    e.setToolLabels(labels);
    e.engine.invalidate();
  }

  private finishPoly(closed: boolean) {
    const e = this.e;
    const pts = cleanPoly(this.poly);
    if (pts.length < (closed ? 3 : 2)) return;
    e.commit('Cômodo livre', (p) => {
      const n = closed ? pts.length : pts.length - 1;
      for (let i = 0; i < n; i++) p.walls.push(newWall(e, pts[i], pts[(i + 1) % pts.length], this.kind));
      if (closed && this.withFloor) p.floors.push(newFloor(e, pts));
    });
    this.reset();
    e.emit('tool', this);
  }

  cancel() {
    this.start = this.end = null;
    this.e.clearPreview();
    this.e.setToolLabels([]);
  }

  deactivate() { this.reset(); }
}

/* ================================================================== Pisos e plataformas */

export class FloorTool implements Tool {
  id = 'piso';
  name = 'Pisos';
  hint = 'Arraste para criar um piso retangular ou toque nos vértices no modo livre. Use elevação para plataformas e fundações.';
  mode: 'retangulo' | 'poligono' | 'preencher' = 'retangulo';
  elevation = -1;
  private start: P | null = null;
  private end: P | null = null;
  private poly: P[] = [];

  constructor(private e: Editor) {}

  options(): ToolOption[] {
    const o: ToolOption[] = [
      {
        type: 'seg', label: 'Modo', value: this.mode, set: (v) => { this.mode = v as any; this.poly = []; this.e.clearPreview(); this.e.emit('tool', this); },
        options: [{ v: 'retangulo', label: 'Retângulo' }, { v: 'poligono', label: 'Livre' }, { v: 'preencher', label: 'Preencher cômodo' }],
      },
      {
        type: 'seg', label: 'Elevação', value: String(this.elevation), set: (v) => { this.elevation = Number(v); this.e.emit('tool', this); },
        options: [{ v: '-1', label: 'Padrão' }, { v: '0.4', label: 'Plataforma 0,4 m' }, { v: '0.8', label: '0,8 m' }, { v: '1.2', label: 'Fundação 1,2 m' }],
      },
    ];
    if (this.mode === 'poligono') {
      o.push({ type: 'info', label: `${this.poly.length} ponto(s)` });
      o.push({ type: 'button', label: 'Desfazer ponto', disabled: !this.poly.length, action: () => { this.poly.pop(); this.drawPoly(); this.e.emit('tool', this); } });
      o.push({ type: 'button', label: 'Concluir', primary: true, disabled: this.poly.length < 3, action: () => this.finishPoly() });
    }
    return o;
  }

  private elev() { return this.elevation < 0 ? undefined : this.elevation; }

  down(p: ToolPointer) {
    if (this.mode !== 'retangulo' || !p.ground) return false;
    this.start = this.end = this.e.snapPoint(p.ground).p;
    return true;
  }

  move(p: ToolPointer) {
    if (!this.start || !p.ground) return;
    this.end = this.e.snapPoint(p.ground).p;
    const e = this.e, a = this.start, b = this.end;
    e.clearPreview();
    const pts = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
    line(e, pts, e.base + (this.elev() ?? 0.05), '#5aa9ff', true);
    e.setToolLabels([
      { text: `${fmtM(Math.abs(b.x - a.x))} × ${fmtM(Math.abs(b.y - a.y))}`, pos: v3(lerp(a, b, 0.5), e.base + 0.3), kind: 'medida' },
    ]);
  }

  up() {
    const e = this.e, a = this.start, b = this.end;
    this.start = this.end = null;
    e.clearPreview();
    e.setToolLabels([]);
    if (!a || !b || Math.abs(b.x - a.x) < 0.3 || Math.abs(b.y - a.y) < 0.3) return;
    const pts = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
    e.commit('Piso', (p) => { p.floors.push(newFloor(e, pts, this.elev())); });
  }

  tap(p: ToolPointer) {
    if (!p.ground) return;
    if (this.mode === 'preencher') { this.fill(p.ground); return; }
    if (this.mode !== 'poligono') return;
    const last = this.poly[this.poly.length - 1];
    const pt = this.e.snapPoint(p.ground, { from: last }).p;
    if (this.poly.length >= 3 && dist(pt, this.poly[0]) < 0.35) { this.finishPoly(); return; }
    this.poly.push(pt);
    this.drawPoly();
    this.e.emit('tool', this);
  }

  /** Detecta o contorno de paredes ao redor do ponto e cria o piso. */
  private fill(pt: P) {
    const poly = findEnclosure(this.e, pt);
    if (!poly) { this.e.emit('toast', 'Nenhum cômodo fechado encontrado neste ponto.'); return; }
    this.e.commit('Preencher piso', (p) => { p.floors.push(newFloor(this.e, poly, this.elev())); });
  }

  private drawPoly() {
    const e = this.e;
    e.clearPreview();
    this.poly.forEach((pt, i) => dot(e, pt, e.base, i === 0 ? '#5aff9a' : '#ffcc33'));
    line(e, this.poly, e.base, '#5aa9ff');
    e.engine.invalidate();
  }

  private finishPoly() {
    const pts = cleanPoly(this.poly);
    if (pts.length < 3) return;
    this.e.commit('Piso livre', (p) => { p.floors.push(newFloor(this.e, pts, this.elev())); });
    this.poly = [];
    this.e.clearPreview();
    this.e.emit('tool', this);
  }

  cancel() { this.start = this.end = null; this.e.clearPreview(); this.e.setToolLabels([]); }
  deactivate() { this.poly = []; this.cancel(); }
}

/**
 * Encontra o menor polígono de paredes que envolve o ponto (paredes do andar atual).
 * Constrói um grafo planar com as paredes (curvas viram poligonais) e percorre faces.
 */
export function findEnclosure(e: Editor, pt: P): P[] | null {
  const walls = e.project.walls.filter((w) => w.level === e.view.level);
  const nodes: P[] = [];
  const key = (p: P) => {
    for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], p) < 0.03) return i;
    nodes.push(p);
    return nodes.length - 1;
  };
  const edges = new Set<string>();
  const adj = new Map<number, Set<number>>();
  const link = (i: number, j: number) => {
    if (i === j) return;
    if (!adj.has(i)) adj.set(i, new Set());
    if (!adj.has(j)) adj.set(j, new Set());
    adj.get(i)!.add(j); adj.get(j)!.add(i);
    edges.add(`${Math.min(i, j)}-${Math.max(i, j)}`);
  };
  // Divide paredes em junções T (ponta de uma parede sobre outra).
  const ends = walls.flatMap((w) => [w.a, w.b]);
  for (const w of walls) {
    const path = wallPath(w, 0.5);
    const extra: { s: number; p: P }[] = [];
    for (const q of ends) {
      const pr = projectOnPath(path, q);
      if (pr.d < 0.03 && dist(q, w.a) > 0.05 && dist(q, w.b) > 0.05) extra.push({ s: pr.s, p: q });
    }
    const pts: { s: number; p: P }[] = [];
    let acc = 0;
    path.forEach((p, i) => { if (i) acc += dist(path[i - 1], p); pts.push({ s: acc, p }); });
    const all = [...pts, ...extra].sort((a, b) => a.s - b.s);
    for (let i = 1; i < all.length; i++) link(key(all[i - 1].p), key(all[i].p));
  }
  if (!nodes.length) return null;
  // Percorre faces (regra "virar mais à direita") e escolhe a menor que contém o ponto.
  const angle = (i: number, j: number) => Math.atan2(nodes[j].y - nodes[i].y, nodes[j].x - nodes[i].x);
  const used = new Set<string>();
  let best: P[] | null = null;
  let bestArea = Infinity;
  for (const [i, nb] of adj) {
    for (const j of nb) {
      if (used.has(`${i}>${j}`)) continue;
      const face: number[] = [];
      let a = i, b = j, guard = 0;
      while (guard++ < 2000) {
        used.add(`${a}>${b}`);
        face.push(a);
        const back = angle(b, a);
        let next = -1, bestTurn = Infinity;
        for (const c of adj.get(b)!) {
          if (c === a && adj.get(b)!.size > 1) continue;
          let t = angle(b, c) - back;
          while (t <= 0) t += Math.PI * 2;
          if (t < bestTurn) { bestTurn = t; next = c; }
        }
        if (next < 0) break;
        a = b; b = next;
        if (a === i && b === j) break;
      }
      if (face.length < 3) continue;
      const poly = face.map((k) => nodes[k]);
      let area = 0;
      for (let k = 0; k < poly.length; k++) { const p = poly[k], q = poly[(k + 1) % poly.length]; area += p.x * q.y - q.x * p.y; }
      area /= 2;
      if (area <= 0) continue;
      if (area < bestArea && pointInPoly(pt, poly)) { bestArea = area; best = poly; }
    }
  }
  return best;
}

function pointInPoly(p: P, poly: P[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + 1e-12) + a.x) inside = !inside;
  }
  return inside;
}

/* ================================================================== Portas e janelas */

export class OpeningTool implements Tool {
  id = 'abertura';
  name = 'Portas e janelas';
  hint = 'Toque ou arraste sobre uma parede para posicionar.';
  kind: OpeningKind = 'porta';
  private ghost: { wall: Wall; t: number; ok: boolean } | null = null;

  constructor(private e: Editor) {}

  options(): ToolOption[] {
    return [{
      type: 'seg', label: 'Modelo', value: this.kind, set: (v) => { this.kind = v as OpeningKind; this.e.emit('tool', this); },
      options: OPENING_PRESETS.map((p) => ({ v: p.kind, label: p.name })),
    }];
  }

  private update(p: ToolPointer) {
    const e = this.e;
    e.clearPreview();
    this.ghost = null;
    const hit = e.world.pick(p.rc, ['wall', 'opening']);
    if (!hit) return;
    let wall: Wall | undefined;
    if (hit.ref.kind === 'wall') wall = e.project.walls.find((w) => w.id === hit.ref.id);
    else { const o = e.project.openings.find((x) => x.id === hit.ref.id); wall = o && e.project.walls.find((w) => w.id === o.wallId); }
    if (!wall || wall.level !== e.view.level) return;
    const preset = PRESET_BY_KIND.get(this.kind)!;
    let t = projectOnPath(wallPath(wall), { x: hit.point.x, y: hit.point.z }).s;
    if (e.snap.grid) t = snapV(t, 0.05);
    const L = wallLength(wall);
    t = Math.max(preset.width / 2 + 0.05, Math.min(L - preset.width / 2 - 0.05, t));
    const height = Math.min(preset.height, wall.height - preset.sill - 0.05);
    const o: Opening = { id: 'ghost', wallId: wall.id, kind: this.kind, t, width: preset.width, height, sill: preset.sill, flip: false, color: '#ffffff' };
    const ok = height > 0.3 && openingFits(e.project, wall, o);
    const path = wallPath(wall);
    const { p: c, tan } = projectOnPathPoint(path, t);
    const base = wall.level * e.project.levelHeight;
    const box = new THREE.Mesh(new THREE.BoxGeometry(preset.width, height, wall.thickness + 0.1), ok ? GHOST : GHOST_BAD);
    box.position.set(c.x, base + preset.sill + height / 2, c.y);
    box.rotation.y = Math.atan2(-tan.y, tan.x);
    e.preview.add(box);
    const left = t - preset.width / 2, right = L - t - preset.width / 2;
    e.setToolLabels([{ text: `${fmtM(left)} | ${fmtM(preset.width)} | ${fmtM(right)}`, pos: new THREE.Vector3(c.x, base + preset.sill + height + 0.3, c.y), kind: 'medida' }]);
    this.ghost = { wall, t, ok };
    e.engine.invalidate();
  }

  down(p: ToolPointer) { this.update(p); return true; }
  move(p: ToolPointer) { this.update(p); }
  hover(p: ToolPointer) { this.update(p); }

  up() {
    const e = this.e, g = this.ghost;
    e.clearPreview();
    e.setToolLabels([]);
    this.ghost = null;
    if (!g) return;
    if (!g.ok) { e.emit('toast', 'Não cabe aqui: sobrepõe outra abertura ou excede a parede.'); return; }
    const preset = PRESET_BY_KIND.get(this.kind)!;
    const id = uid('o');
    const ok = e.commit('Abertura', (p) => {
      p.openings.push({
        id, wallId: g.wall.id, kind: this.kind, t: g.t, width: preset.width,
        height: Math.min(preset.height, g.wall.height - preset.sill - 0.05), sill: preset.sill, flip: false,
        color: preset.kind === 'porta' || preset.kind === 'porta_dupla' ? '#8a5a3a' : '#f6f6f4',
      });
    });
    if (ok) e.select({ kind: 'opening', id });
  }

  cancel() { this.ghost = null; this.e.clearPreview(); this.e.setToolLabels([]); }
}

function projectOnPathPoint(path: P[], s: number) {
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const l = dist(path[i - 1], path[i]);
    if (acc + l >= s || i === path.length - 1) {
      const t = l ? Math.max(0, Math.min(1, (s - acc) / l)) : 0;
      return { p: lerp(path[i - 1], path[i], t), tan: norm(sub(path[i], path[i - 1])) };
    }
    acc += l;
  }
  return { p: path[0], tan: { x: 1, y: 0 } };
}

/* ================================================================== Escadas */

export class StairTool implements Tool {
  id = 'escada';
  name = 'Escadas';
  hint = 'Toque ou arraste para posicionar. A escada liga este andar ao de cima.';
  kind: StairKind = 'reta';
  width = 1.0;
  rot = 0;
  private ghost: Stair | null = null;

  constructor(private e: Editor) {}

  options(): ToolOption[] {
    return [
      {
        type: 'seg', label: 'Formato', value: this.kind, set: (v) => { this.kind = v as StairKind; this.e.emit('tool', this); },
        options: [{ v: 'reta', label: 'Reta' }, { v: 'L', label: 'Em L' }, { v: 'U', label: 'Em U' }, { v: 'espiral', label: 'Espiral' }, { v: 'curva', label: 'Curva' }],
      },
      { type: 'range', label: 'Largura', min: 0.7, max: 1.6, step: 0.05, value: this.width, fmt: (v) => fmtM(v), set: (v) => { this.width = v; } },
      { type: 'button', label: 'Girar 90°', action: () => { this.rot = (this.rot + Math.PI / 2) % (Math.PI * 2); if (this.ghost) { this.ghost.rot = this.rot; this.drawGhost(); } } },
    ];
  }

  private place(p: ToolPointer) {
    if (!p.ground) return;
    const e = this.e;
    const pos = e.snapPoint(p.ground, { magnet: false }).p;
    this.ghost = { id: 'ghost', level: e.view.level, kind: this.kind, pos, rot: this.rot, width: this.width, material: 'madeira', color: '#c49a6c' };
    this.drawGhost();
  }

  private drawGhost() {
    const e = this.e, s = this.ghost;
    e.clearPreview();
    if (!s) return;
    const g = buildStairGroup(s, e.project.levelHeight);
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = this.valid(s) ? GHOST : GHOST_BAD; });
    g.position.set(s.pos.x, e.base, s.pos.y);
    g.rotation.y = -s.rot;
    e.preview.add(g);
    e.engine.invalidate();
  }

  private valid(s: Stair) {
    return stairFootprint(s, this.e.project.levelHeight).every((pt) => insideLot(this.e.project, pt)) && s.level + 1 < MAX_LEVELS;
  }

  down(p: ToolPointer) { this.place(p); return true; }
  move(p: ToolPointer) { this.place(p); }
  hover(p: ToolPointer) { this.place(p); }

  up() {
    const e = this.e, s = this.ghost;
    this.ghost = null;
    e.clearPreview();
    if (!s) return;
    if (s.level + 1 >= MAX_LEVELS) { e.emit('toast', 'Não há andar acima para ligar a escada.'); return; }
    if (!this.valid(s)) { e.emit('toast', 'A escada precisa ficar dentro do terreno.'); return; }
    const id = uid('s');
    if (e.commit('Escada', (p) => { p.stairs.push({ ...s, id }); p.levels = Math.max(p.levels, s.level + 2); })) {
      e.select({ kind: 'stair', id });
      e.emit('toast', 'Escada criada. Suba de andar para construir o pavimento superior.');
    }
  }

  cancel() { this.ghost = null; this.e.clearPreview(); }
}

/* ================================================================== Telhados */

export class RoofTool implements Tool {
  id = 'telhado';
  name = 'Telhados';
  hint = 'Arraste um retângulo sobre a construção ou use o telhado automático.';
  kind: RoofKind = 'duas_aguas';
  pitch = 0.45;
  overhang = 0.5;
  material = 'telha_ceramica';
  private start: P | null = null;
  private end: P | null = null;

  constructor(private e: Editor) {}

  options(): ToolOption[] {
    return [
      {
        type: 'seg', label: 'Tipo', value: this.kind, set: (v) => { this.kind = v as RoofKind; this.e.emit('tool', this); },
        options: [{ v: 'duas_aguas', label: 'Duas águas' }, { v: 'quatro_aguas', label: 'Quatro águas' }, { v: 'uma_agua', label: 'Uma água' }, { v: 'plano', label: 'Laje plana' }, { v: 'curvo', label: 'Curvo' }],
      },
      { type: 'range', label: 'Inclinação', min: 0.1, max: 1.2, step: 0.05, value: this.pitch, fmt: (v) => `${Math.round((Math.atan(v) * 180) / Math.PI)}°`, set: (v) => { this.pitch = v; } },
      { type: 'range', label: 'Beiral', min: 0, max: 1.2, step: 0.1, value: this.overhang, fmt: (v) => fmtM(v), set: (v) => { this.overhang = v; } },
      {
        type: 'seg', label: 'Material', value: this.material, set: (v) => { this.material = v; this.e.emit('tool', this); },
        options: [{ v: 'telha_ceramica', label: 'Cerâmica' }, { v: 'telha_ardosia', label: 'Ardósia' }, { v: 'metal', label: 'Metálica' }, { v: 'concreto', label: 'Concreto' }, { v: 'grama', label: 'Telhado verde' }],
      },
      { type: 'button', label: 'Telhado automático', primary: true, action: () => this.auto() },
    ];
  }

  private make(a: P, b: P): Roof {
    return {
      id: uid('r'), level: this.e.view.level, kind: this.kind,
      center: lerp(a, b, 0.5), w: Math.abs(b.x - a.x), d: Math.abs(b.y - a.y), rot: 0,
      pitch: this.kind === 'plano' ? 0 : this.pitch, overhang: this.overhang, material: this.material, color: '#a4532f',
    };
  }

  /** Cria um telhado por cômodo fechado (piso) do andar, ou um único pelo contorno das paredes. */
  auto() {
    const e = this.e;
    const lvl = e.view.level;
    const walls = e.project.walls.filter((w) => w.level === lvl && w.kind === 'parede');
    if (!walls.length) { e.emit('toast', 'Construa paredes neste andar antes de criar o telhado.'); return; }
    const pts = walls.flatMap((w) => wallPath(w));
    const b = bbox(pts);
    const t = 0.075;
    const r = this.make({ x: b.minX - t, y: b.minY - t }, { x: b.maxX + t, y: b.maxY + t });
    if (this.kind === 'duas_aguas' && r.d > r.w) {
      // Cumeeira ao longo do maior lado.
      [r.w, r.d] = [r.d, r.w];
      r.rot = Math.PI / 2;
    }
    const id = r.id;
    if (e.commit('Telhado automático', (p) => {
      p.roofs = p.roofs.filter((x) => x.level !== lvl);
      p.roofs.push(r);
    })) e.select({ kind: 'roof', id });
  }

  down(p: ToolPointer) {
    if (!p.ground) return false;
    this.start = this.end = this.e.snapPoint(p.ground).p;
    return true;
  }

  move(p: ToolPointer) {
    if (!this.start || !p.ground) return;
    this.end = this.e.snapPoint(p.ground).p;
    const e = this.e;
    e.clearPreview();
    if (Math.abs(this.end.x - this.start.x) < 0.5 || Math.abs(this.end.y - this.start.y) < 0.5) return;
    const r = this.make(this.start, this.end);
    const g = buildRoofGroup(r);
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = GHOST; });
    g.position.set(r.center.x, e.base + e.project.levelHeight, r.center.y);
    e.preview.add(g);
    e.setToolLabels([{ text: `${fmtM(r.w)} × ${fmtM(r.d)}`, pos: v3(r.center, e.base + e.project.levelHeight + 1), kind: 'medida' }]);
    e.engine.invalidate();
  }

  up() {
    const e = this.e, a = this.start, b = this.end;
    this.start = this.end = null;
    e.clearPreview();
    e.setToolLabels([]);
    if (!a || !b || Math.abs(b.x - a.x) < 0.5 || Math.abs(b.y - a.y) < 0.5) return;
    const r = this.make(a, b);
    if (e.commit('Telhado', (p) => { p.roofs.push(r); })) e.select({ kind: 'roof', id: r.id });
  }

  cancel() { this.start = this.end = null; this.e.clearPreview(); this.e.setToolLabels([]); }
}

/* ================================================================== Posicionar objetos */

export interface Placement {
  pos: P;
  elev: number;
  rot: number;
  ok: boolean;
}

/** Calcula onde um objeto fica: piso, sobre superfícies, em paredes ou no teto. */
export function computePlacement(e: Editor, def: CatalogDef, scale: number, rot: number, p: ToolPointer, excludeId?: string, groundOverride?: P): Placement {
  const pr = e.project;
  const base = e.base;
  const step = e.snap.grid ? 0.05 : 0;
  const snapP = (q: P) => (step ? { x: snapV(q.x, step), y: snapV(q.y, step) } : q);
  const g = groundOverride ?? p.ground;
  if (def.mount === 'parede') {
    const hit = e.world.pick(p.rc, ['wall'], excludeId);
    const wall = hit && pr.walls.find((w) => w.id === hit.ref.id);
    if (hit && wall && wall.level === e.view.level && hit.normal) {
      const n = norm({ x: hit.normal.x, y: hit.normal.z });
      const pos = add({ x: hit.point.x, y: hit.point.z }, mul(n, (def.d * scale) / 2 + 0.005));
      const h = def.h * scale;
      const elev = Math.max(0, Math.min(wall.height - h, hit.point.y - base - h / 2));
      return { pos, elev, rot: Math.atan2(n.x, n.y), ok: true };
    }
    return { pos: g ? snapP(g) : { x: 0, y: 0 }, elev: 1.2, rot, ok: false };
  }
  if (!g) return { pos: { x: 0, y: 0 }, elev: 0, rot, ok: false };
  let pos = snapP(g);
  let elev = e.floorTopAt(e.view.level, pos);
  if (def.mount === 'teto') {
    elev = pr.levelHeight - def.h * scale;
  } else if (def.mount === 'superficie') {
    const hit = e.world.pick(p.rc, ['item'], excludeId);
    const it = hit && pr.items.find((i) => i.id === hit.ref.id);
    const idef = it && CATALOG_BY_ID.get(it.catalogId);
    if (hit && idef?.surface && hit.normal && hit.normal.y > 0.5) {
      pos = { x: hit.point.x, y: hit.point.z };
      elev = hit.point.y - base;
    }
  }
  const ok = insideLot(pr, pos) && !collidesWithWalls(e, def, scale, pos, elev, rot);
  return { pos: clampLot(e, pos), elev, rot, ok };
}

function clampLot(e: Editor, p: P): P {
  return { x: Math.max(-e.project.lot.w / 2, Math.min(e.project.lot.w / 2, p.x)), y: Math.max(-e.project.lot.d / 2, Math.min(e.project.lot.d / 2, p.y)) };
}

/** Colisão simples: algum ponto do eixo de parede dentro da projeção do objeto. */
export function collidesWithWalls(e: Editor, def: CatalogDef, scale: number, pos: P, elev: number, rot: number): boolean {
  if (def.h < 0.06 || def.mount === 'parede' || def.mount === 'teto') return false;
  const hw = (def.w * scale) / 2, hd = (def.d * scale) / 2;
  for (const w of e.project.walls) {
    if (w.level !== e.view.level || w.height <= elev + 0.02) continue;
    const m = w.thickness / 2 - 0.03;
    const path = wallPath(w, 0.1);
    for (let i = 1; i < path.length; i++) {
      const L = dist(path[i - 1], path[i]);
      const n = Math.max(1, Math.ceil(L / 0.08));
      for (let k = 0; k <= n; k++) {
        const q = lerp(path[i - 1], path[i], k / n);
        const local = rotate(sub(q, pos), rot);
        if (Math.abs(local.x) < hw + m && Math.abs(local.y) < hd + m) return true;
      }
    }
  }
  return false;
}

export class PlaceTool implements Tool {
  id = 'objeto';
  name = 'Posicionar objeto';
  hint = 'Toque ou arraste para posicionar. Itens de parede encaixam nas paredes; pequenos objetos, sobre mesas e bancadas.';
  rot = 0;
  private ghost: THREE.Group | null = null;
  private pl: Placement | null = null;
  private footprint: THREE.Mesh | null = null;

  constructor(private e: Editor, public def: CatalogDef, private color = def.color, private material = def.material) {
    this.name = def.name;
  }

  options(): ToolOption[] {
    return [
      { type: 'info', label: `${this.def.name} · ${this.def.w.toLocaleString('pt-BR')} × ${this.def.d.toLocaleString('pt-BR')} m` },
      { type: 'button', label: 'Girar 45°', action: () => { this.rot = (this.rot + Math.PI / 4) % (Math.PI * 2); if (this.ghost) this.ghost.rotation.y = this.rot; this.e.engine.invalidate(); } },
      { type: 'button', label: 'Cancelar', action: () => this.e.setTool(new SelectTool(this.e)) },
    ];
  }

  activate() {
    this.ghost = buildItemModel(this.def.id, this.color, this.material);
    this.ghost.visible = false;
    this.e.engine.helpers.add(this.ghost);
    this.footprint = new THREE.Mesh(new THREE.PlaneGeometry(this.def.w, this.def.d), GHOST);
    this.footprint.rotation.x = -Math.PI / 2;
    this.footprint.visible = false;
    this.e.engine.helpers.add(this.footprint);
  }

  deactivate() {
    if (this.ghost) { this.e.engine.helpers.remove(this.ghost); disposeModel(this.ghost); }
    if (this.footprint) { this.e.engine.helpers.remove(this.footprint); this.footprint.geometry.dispose(); }
    this.ghost = null;
    this.footprint = null;
  }

  private update(p: ToolPointer) {
    if (!this.ghost) return;
    const pl = computePlacement(this.e, this.def, 1, this.rot, p);
    this.pl = pl;
    this.ghost.visible = true;
    this.ghost.position.set(pl.pos.x, this.e.base + pl.elev, pl.pos.y);
    this.ghost.rotation.y = pl.rot;
    if (this.footprint) {
      this.footprint.visible = this.def.mount !== 'parede';
      this.footprint.material = pl.ok ? GHOST : GHOST_BAD;
      this.footprint.position.set(pl.pos.x, this.e.base + pl.elev + 0.01, pl.pos.y);
      this.footprint.rotation.set(-Math.PI / 2, 0, pl.rot);
    }
    this.e.engine.invalidate();
  }

  down(p: ToolPointer) { this.update(p); return true; }
  move(p: ToolPointer) { this.update(p); }
  hover(p: ToolPointer) { this.update(p); }

  up() {
    const pl = this.pl;
    if (!pl) return;
    if (!pl.ok) {
      this.e.emit('toast', this.def.mount === 'parede' ? 'Toque sobre uma parede para fixar este objeto.' : 'Posição inválida: colide com parede ou está fora do terreno.');
      return;
    }
    const item: Item = {
      id: uid('i'), catalogId: this.def.id, level: this.e.view.level, pos: pl.pos, elev: pl.elev, rot: pl.rot,
      scale: 1, color: this.color, material: this.material,
    };
    if (this.e.commit('Objeto', (pr) => { pr.items.push(item); })) {
      const sel = new SelectTool(this.e);
      this.e.setTool(sel);
      this.e.select({ kind: 'item', id: item.id });
    }
  }

  cancel() { if (this.ghost) this.ghost.visible = false; this.e.engine.invalidate(); }
}

/* ================================================================== Pintar */

export class PaintTool implements Tool {
  id = 'pintar';
  name = 'Pintar e revestir';
  hint = 'Escolha material e cor e toque em paredes, pisos, telhados, escadas ou objetos.';
  material = 'pintura';
  color = '#e8d5b5';

  constructor(private e: Editor) {}

  options(): ToolOption[] {
    return [
      { type: 'materials', value: this.material, set: (v) => { this.material = v; this.e.emit('tool', this); } },
      { type: 'swatches', value: this.color, set: (v) => { this.color = v; this.e.emit('tool', this); } },
    ];
  }

  tap(p: ToolPointer) {
    const e = this.e;
    const hit = e.world.pick(p.rc);
    if (!hit) return;
    const ref = hit.ref;
    e.commit('Pintar', () => {
      const ent = e.find(ref);
      if (!ent) return;
      if (ref.kind === 'opening') { ent.color = this.color; return; }
      ent.material = this.material;
      ent.color = this.color;
    });
  }
}

/* ================================================================== Demolir */

export class DemolishTool implements Tool {
  id = 'demolir';
  name = 'Demolir';
  hint = 'Toque em qualquer estrutura ou objeto para removê-lo.';

  constructor(private e: Editor) {}

  options(): ToolOption[] {
    return [{ type: 'button', label: 'Demolir andar inteiro', action: () => this.levelAll() }];
  }

  private levelAll() {
    const e = this.e;
    const lvl = e.view.level;
    if (!confirm(`Demolir tudo do ${lvl === 0 ? 'térreo' : `${lvl}º andar`}? Você poderá desfazer.`)) return;
    e.select(null);
    e.commit('Demolir andar', (p) => {
      const ids = new Set(p.walls.filter((w) => w.level === lvl).map((w) => w.id));
      p.walls = p.walls.filter((w) => w.level !== lvl);
      p.openings = p.openings.filter((o) => !ids.has(o.wallId));
      p.floors = p.floors.filter((f) => f.level !== lvl);
      p.stairs = p.stairs.filter((s) => s.level !== lvl);
      p.roofs = p.roofs.filter((r) => r.level !== lvl);
      p.items = p.items.filter((i) => i.level !== lvl);
    });
  }

  tap(p: ToolPointer) {
    const e = this.e;
    const hit = e.world.pick(p.rc);
    if (!hit) return;
    const ent = e.find(hit.ref);
    if (ent?.level !== undefined && ent.level !== e.view.level) return;
    if (e.selection?.id === hit.ref.id) e.select(null);
    e.commit('Demolir', (pr) => e.removeEntity(pr, hit.ref));
  }
}

