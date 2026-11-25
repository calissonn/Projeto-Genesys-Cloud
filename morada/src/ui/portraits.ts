import * as THREE from 'three';
import type { Sim, Pet } from '../model/life';
import { buildCharacter, animate, disposeRig, buildPet } from '../render/character';
import { thumbs } from './thumbs';

/** Retrato (rosto) de um personagem, em cache pela aparência. */
export function simPortrait(s: Pick<Sim, 'look' | 'age'>): string {
  const key = `sim|${s.age}|${JSON.stringify(s.look)}`;
  return thumbs.portrait(key, () => {
    const rig = buildCharacter(s.look, s.age);
    animate(rig, 'idle', 0, 70);
    rig.head.rotation.set(0, 0, 0);
    rig.root.updateMatrixWorld(true);
    const c = new THREE.Vector3();
    rig.head.getWorldPosition(c);
    c.y += 0.11 * rig.scale * (s.age === 'bebe' ? 1.6 : s.age === 'crianca' ? 1.3 : 1);
    return { obj: rig.root, center: c, radius: 0.2 * rig.scale * (s.age === 'bebe' ? 1.7 : s.age === 'crianca' ? 1.35 : 1.05), dispose: () => disposeRig(rig) };
  });
}

export function petPortrait(p: Pick<Pet, 'kind' | 'color'>): string {
  return thumbs.portrait(`pet|${p.kind}|${p.color}`, () => {
    const rig = buildPet(p.kind, p.color);
    rig.root.rotation.y = 0.5;
    rig.root.updateMatrixWorld(true);
    const c = new THREE.Vector3();
    rig.head.getWorldPosition(c);
    return { obj: rig.root, center: c.add(new THREE.Vector3(0, -0.05, -0.1)), radius: 0.32, dispose: () => rig.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } }) };
  });
}
