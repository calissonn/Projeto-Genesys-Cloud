import * as THREE from 'three';
import type { Engine } from './engine';
import type { Simulation } from '../sim/simulation';
import type { ViewState } from './world';
import { buildCharacter, animate, disposeRig, buildPet, animatePet, type Rig, type PetRig } from './character';
import { pointAt, wallPath } from '../model/geometry';
import type { Project } from '../model/types';

/** Desenha personagens e animais, anel de seleção e portas que se abrem. */
export class SimView {
  group = new THREE.Group();
  private rigs = new Map<string, { rig: Rig; key: string; t: number }>();
  private petRigs = new Map<string, { rig: PetRig; key: string; t: number }>();
  private ring: THREE.Mesh;
  private doorAngles = new Map<string, number>();

  constructor(engine: Engine, private sim: Simulation) {
    engine.scene.add(this.group);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.42, 32),
      new THREE.MeshBasicMaterial({ color: '#4fd18b', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 5;
    this.group.add(this.ring);
  }

  clear() {
    for (const r of this.rigs.values()) { this.group.remove(r.rig.root); disposeRig(r.rig); }
    for (const r of this.petRigs.values()) { this.group.remove(r.rig.root); }
    this.rigs.clear();
    this.petRigs.clear();
  }

  /** Atualiza transformações e animações. */
  sync(view: ViewState, selected: string | null, dt: number, animateTime: boolean) {
    const seen = new Set<string>();
    for (const a of this.sim.agents.values()) {
      const s = a.sim;
      seen.add(s.id);
      const key = `${s.age}|${JSON.stringify(s.look)}`;
      let entry = this.rigs.get(s.id);
      if (!entry || entry.key !== key) {
        if (entry) { this.group.remove(entry.rig.root); disposeRig(entry.rig); }
        const rig = buildCharacter(s.look, s.age);
        rig.root.userData.simId = s.id;
        this.group.add(rig.root);
        entry = { rig, key, t: Math.random() * 10 };
        this.rigs.set(s.id, entry);
      }
      if (animateTime) entry.t += dt;
      const r = entry.rig;
      r.root.visible = a.visible && (view.showAll || s.level <= view.level);
      r.root.position.set(s.pos.x, a.y, s.pos.y);
      r.root.rotation.y = s.rot;
      // Bebê acordado fora do berço fica sentado no chão.
      const anim = a.anim;
      animate(r, anim, entry.t, this.sim.mood(s));
      if (s.id === selected) {
        this.ring.visible = r.root.visible;
        this.ring.position.set(s.pos.x, a.y + 0.03, s.pos.y);
        const m = this.sim.mood(s);
        (this.ring.material as THREE.MeshBasicMaterial).color.set(m >= 62 ? '#4fd18b' : m >= 45 ? '#e0c34f' : m >= 28 ? '#f29544' : '#ff6b6b');
      }
    }
    if (!selected || !this.rigs.has(selected)) this.ring.visible = false;
    for (const [id, e] of this.rigs) {
      if (!seen.has(id)) { this.group.remove(e.rig.root); disposeRig(e.rig); this.rigs.delete(id); }
    }
    // Animais
    const petSeen = new Set<string>();
    for (const pa of this.sim.pets.values()) {
      petSeen.add(pa.pet.id);
      const key = `${pa.pet.kind}|${pa.pet.color}`;
      let e = this.petRigs.get(pa.pet.id);
      if (!e || e.key !== key) {
        if (e) this.group.remove(e.rig.root);
        const rig = buildPet(pa.pet.kind, pa.pet.color);
        rig.root.userData.petId = pa.pet.id;
        this.group.add(rig.root);
        e = { rig, key, t: Math.random() * 10 };
        this.petRigs.set(pa.pet.id, e);
      }
      if (animateTime) e.t += dt;
      e.rig.root.visible = view.showAll || pa.pet.level <= view.level;
      e.rig.root.position.set(pa.pet.pos.x, pa.y, pa.pet.pos.y);
      e.rig.root.rotation.y = pa.pet.rot;
      animatePet(e.rig, pa.anim, e.t);
    }
    for (const [id, e] of this.petRigs) if (!petSeen.has(id)) { this.group.remove(e.rig.root); this.petRigs.delete(id); }
    this.updateDoors(this.sim.project, dt);
  }

  /** Abre as portas próximas a alguém. */
  private updateDoors(p: Project, dt: number) {
    const world = this.sim.editor.world;
    for (const o of p.openings) {
      if (o.kind !== 'porta') continue;
      const grp = world.objects.get(o.id);
      const w = p.walls.find((x) => x.id === o.wallId);
      if (!grp || !w) continue;
      const leaf = grp.children.find((c) => c.userData.leaf);
      if (!leaf) continue;
      const c = pointAt(wallPath(w), o.t).p;
      let near = false;
      for (const a of this.sim.agents.values()) {
        if (!a.visible || a.sim.level !== w.level) continue;
        if (Math.hypot(a.sim.pos.x - c.x, a.sim.pos.y - c.y) < 1.1) { near = true; break; }
      }
      const target = near ? -1.35 : 0;
      const cur = this.doorAngles.get(o.id) ?? 0;
      const next = cur + (target - cur) * Math.min(1, dt * 6);
      this.doorAngles.set(o.id, next);
      leaf.rotation.y = next * (o.flip ? -1 : 1);
    }
  }

  /** Personagem ou animal sob o raio. */
  pick(rc: THREE.Raycaster): { simId?: string; petId?: string } | null {
    const hits = rc.intersectObjects(this.group.children.filter((c) => c.visible && c !== this.ring), true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        if (o.userData.simId) return { simId: o.userData.simId };
        if (o.userData.petId) return { petId: o.userData.petId };
        o = o.parent;
      }
    }
    return null;
  }

  headPos(simId: string): THREE.Vector3 | null {
    const e = this.rigs.get(simId);
    if (!e || !e.rig.root.visible) return null;
    const v = new THREE.Vector3();
    e.rig.head.getWorldPosition(v);
    v.y += 0.35 * e.rig.scale;
    return v;
  }

  eyePos(simId: string): THREE.Vector3 | null {
    const e = this.rigs.get(simId);
    if (!e) return null;
    const v = new THREE.Vector3();
    e.rig.head.getWorldPosition(v);
    v.y += 0.14 * e.rig.scale;
    return v;
  }
}
