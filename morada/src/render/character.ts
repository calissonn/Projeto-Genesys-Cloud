import * as THREE from 'three';
import type { Appearance, AgeStage, PetKind } from '../model/life';
import { AGE_BY_ID } from '../model/life';

/**
 * Personagem humanoide estilizado e articulado (sem esqueleto externo).
 * Hierarquia: root(pés) → body(quadril) → spine → chest/neck/head, ombros → braços; quadril → pernas.
 * Frente voltada para +z. Altura de um adulto ≈ 1,72 m × fator de altura.
 */

export type Anim =
  | 'idle' | 'walk' | 'sit' | 'sleep' | 'lie' | 'eat' | 'cook' | 'shower' | 'exercise' | 'read' | 'type'
  | 'watch' | 'talk' | 'swim' | 'play' | 'wash' | 'dance' | 'hug' | 'kiss' | 'wave' | 'carry' | 'baby';

const mat = (color: string, rough = 0.75, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });

function capsule(r: number, len: number, m: THREE.Material, seg = 10) {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len), 4, seg);
  g.translate(0, -len / 2 - r, 0); // pendurado a partir da articulação
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  return mesh;
}

function sphere(r: number, m: THREE.Material, w = 16, h = 12) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, w, h), m);
  mesh.castShadow = true;
  return mesh;
}

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  spine: THREE.Group;
  head: THREE.Group;
  mouth: THREE.Mesh;
  armL: THREE.Group; armR: THREE.Group; elbowL: THREE.Group; elbowR: THREE.Group;
  legL: THREE.Group; legR: THREE.Group; kneeL: THREE.Group; kneeR: THREE.Group;
  hipY: number;
  scale: number;
  prop: THREE.Group;
}

export function buildCharacter(look: Appearance, age: AgeStage): Rig {
  const ageDef = AGE_BY_ID.get(age)!;
  const S = (ageDef.height / 1.78) * (age === 'bebe' ? 1 : look.height);
  const headK = ageDef.head;
  const build = look.build;
  const skin = mat(look.skin, 0.62);
  const topM = mat(look.topColor, 0.85);
  const botM = mat(look.bottomColor, 0.85);
  const shoeM = mat(look.shoeColor, 0.55);
  const hairM = mat(look.hairColor, 0.7);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const inner = new THREE.Group();
  inner.scale.setScalar(S);
  body.add(inner);

  const legLen = age === 'bebe' ? 0.6 : 0.9;
  const hipY = legLen;
  body.position.y = hipY * S;
  const w = 1 + build * 0.35;

  // Quadril
  const pelvis = sphere(0.15 * w, ['saia', 'calca', 'legging', 'bermuda'].includes(look.bottom) && look.top !== 'vestido' ? botM : topM);
  pelvis.scale.set(1.15, 0.7, 0.8);
  inner.add(pelvis);

  // Tronco
  const spine = new THREE.Group();
  inner.add(spine);
  const torsoProfile = [
    [0.0, 0], [0.15, 0.0], [0.16, 0.1], [0.145, 0.22], [0.165, 0.38], [0.18, 0.48], [0.12, 0.56], [0.05, 0.58],
  ].map(([r, y]) => new THREE.Vector2(r * w, y));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoProfile, 20), topM);
  torso.scale.z = 0.72;
  torso.castShadow = true;
  spine.add(torso);
  if (look.top === 'regata') {
    // Ombros à mostra
    for (const sx of [-1, 1]) { const sh = sphere(0.06, skin); sh.position.set(sx * 0.17 * w, 0.5, 0); spine.add(sh); }
  }
  if (look.top === 'camisa') {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 16), mat('#f6f6f4'));
    collar.rotation.x = Math.PI / 2; collar.position.y = 0.57; spine.add(collar);
    for (let i = 0; i < 4; i++) { const b = sphere(0.008, mat('#ddd')); b.position.set(0, 0.5 - i * 0.1, 0.125 * w * 0.72 + 0.004); spine.add(b); }
  }
  if (look.top === 'moletom') {
    const hood = sphere(0.11, topM); hood.scale.set(1.3, 0.6, 1); hood.position.set(0, 0.56, -0.08); spine.add(hood);
  }
  if (look.accessory === 'colar') {
    const n = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.006, 6, 20), mat('#e0b84f', 0.3, { metalness: 0.8 }));
    n.rotation.x = Math.PI / 2.4; n.position.set(0, 0.55, 0.02); spine.add(n);
  }

  // Pescoço e cabeça
  const neck = capsule(0.045, 0.04, skin);
  neck.position.y = 0.66;
  spine.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.64;
  head.scale.setScalar(headK);
  spine.add(head);
  const skull = sphere(0.115, skin, 24, 18);
  skull.scale.set(0.92 * look.faceWidth, 1.08, 1);
  skull.position.y = 0.12;
  head.add(skull);
  const jaw = sphere(0.09, skin, 20, 12);
  jaw.scale.set(0.95 * look.faceWidth * (0.9 + look.jaw * 0.2), 0.75, 0.95);
  jaw.position.set(0, 0.06 - look.jaw * 0.01, 0.02);
  head.add(jaw);
  for (const sx of [-1, 1]) {
    const ear = sphere(0.025, skin, 8, 6);
    ear.scale.set(0.5, 1, 0.8);
    ear.position.set(sx * 0.105 * look.faceWidth, 0.11, 0);
    head.add(ear);
    // Olhos
    const white = sphere(0.022 * look.eyeSize, mat('#ffffff', 0.3), 12, 8);
    white.position.set(sx * 0.042, 0.135, 0.095);
    white.scale.z = 0.6;
    head.add(white);
    const iris = sphere(0.013 * look.eyeSize, mat(look.eyeColor, 0.2), 10, 8);
    iris.position.set(sx * 0.042, 0.135, 0.107);
    iris.scale.z = 0.5;
    head.add(iris);
    const pupil = sphere(0.006 * look.eyeSize, mat('#050505', 0.1), 8, 6);
    pupil.position.set(sx * 0.042, 0.135, 0.113);
    head.add(pupil);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.009 * look.brows, 0.012), hairM);
    brow.position.set(sx * 0.043, 0.168, 0.1);
    brow.rotation.z = -sx * 0.12;
    head.add(brow);
  }
  const nose = sphere(0.018 * look.nose, skin, 10, 8);
  nose.scale.set(0.8, 1.1, 1.1);
  nose.position.set(0, 0.105, 0.112);
  head.add(nose);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 12, Math.PI), mat('#8c3a35', 0.5));
  mouth.position.set(0, 0.073, 0.1);
  mouth.rotation.set(0, 0, Math.PI);
  head.add(mouth);
  if (look.beard && age !== 'bebe' && age !== 'crianca') {
    const beard = sphere(0.085, hairM, 18, 10);
    beard.scale.set(look.faceWidth, 0.6, 0.9);
    beard.position.set(0, 0.045, 0.03);
    head.add(beard);
  }
  buildHair(head, look, hairM, age);
  buildHeadAccessory(head, look);

  // Braços
  const arm = (sx: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 0.2 * w, 0.52, 0);
    spine.add(shoulder);
    const longSleeve = ['manga_longa', 'camisa', 'moletom'].includes(look.top);
    const upperM = look.top === 'regata' ? skin : topM;
    shoulder.add(capsule(0.045 + build * 0.012, 0.2, upperM));
    const elbow = new THREE.Group();
    elbow.position.y = -0.29;
    shoulder.add(elbow);
    elbow.add(capsule(0.038 + build * 0.01, 0.18, longSleeve ? topM : skin));
    const hand = sphere(0.042, skin, 10, 8);
    hand.scale.set(0.8, 1.1, 0.6);
    hand.position.y = -0.28;
    elbow.add(hand);
    return { shoulder, elbow };
  };
  const L = arm(1), R = arm(-1);

  // Pernas
  const leg = (sx: number) => {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.085 * w, 0, 0);
    inner.add(hip);
    const thighM = look.top === 'vestido' || look.bottom === 'saia' ? skin : botM;
    const shinM = look.bottom === 'calca' || look.bottom === 'legging' ? botM : skin;
    const kneeLen = legLen * 0.5;
    hip.add(capsule(0.065 + build * 0.02, kneeLen - 0.13, thighM));
    const knee = new THREE.Group();
    knee.position.y = -kneeLen;
    hip.add(knee);
    knee.add(capsule(0.05 + build * 0.012, kneeLen - 0.16, shinM));
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.2), shoeM);
    shoe.geometry.translate(0, 0, 0.04);
    shoe.position.y = -kneeLen + 0.035;
    shoe.castShadow = true;
    knee.add(shoe);
    return { hip, knee };
  };
  const LL = leg(1), RL = leg(-1);

  // Saia/vestido
  if (look.top === 'vestido' || look.bottom === 'saia') {
    const len = look.top === 'vestido' ? 0.42 : 0.34;
    const skirtM = (look.top === 'vestido' ? topM : botM).clone();
    skirtM.side = THREE.DoubleSide;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * w, 0.24 * w, len, 20, 1, true), skirtM);
    skirt.position.y = 0.02 - len / 2;
    skirt.scale.z = 0.85;
    skirt.castShadow = true;
    inner.add(skirt);
  }

  // Objeto segurado (livro, prato) — exibido por animação.
  const prop = new THREE.Group();
  prop.position.set(0, -0.3, 0.05);
  L.elbow.add(prop);

  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return {
    root, body, spine, head, mouth,
    armL: L.shoulder, armR: R.shoulder, elbowL: L.elbow, elbowR: R.elbow,
    legL: LL.hip, legR: RL.hip, kneeL: LL.knee, kneeR: RL.knee, hipY: hipY * S, scale: S, prop,
  };
}

function buildHair(head: THREE.Group, look: Appearance, m: THREE.Material, age: AgeStage) {
  const fw = look.faceWidth;
  const style = age === 'bebe' && look.hair !== 'careca' ? 'raspado' : look.hair;
  const cap = (r = 0.125, theta = Math.PI * 0.55) => {
    const g = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 14, 0, Math.PI * 2, 0, theta), m);
    g.scale.set(0.95 * fw, 1.1, 1.06);
    g.position.set(0, 0.125, -0.006);
    g.castShadow = true;
    head.add(g);
    return g;
  };
  switch (style) {
    case 'careca': return;
    case 'raspado': cap(0.119, Math.PI * 0.52); return;
    case 'curto': cap(); { const back = sphere(0.11, m); back.scale.set(0.95 * fw, 0.9, 0.8); back.position.set(0, 0.11, -0.04); head.add(back); } return;
    case 'franja': {
      cap();
      const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.2 * fw, 0.05, 0.05), m);
      fringe.position.set(0, 0.2, 0.085); fringe.rotation.x = -0.4; head.add(fringe);
      const back = sphere(0.11, m); back.scale.set(0.95 * fw, 0.95, 0.85); back.position.set(0, 0.1, -0.04); head.add(back);
      return;
    }
    case 'longo': {
      cap();
      const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.22, 4, 12), m);
      back.scale.set(1.15 * fw, 1, 0.55); back.position.set(0, -0.02, -0.06); back.castShadow = true; head.add(back);
      for (const sx of [-1, 1]) { const side = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.18, 4, 8), m); side.position.set(sx * 0.1 * fw, 0.02, 0.0); head.add(side); }
      return;
    }
    case 'rabo': {
      cap();
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.18, 4, 8), m);
      tail.position.set(0, 0.06, -0.15); tail.rotation.x = 0.35; head.add(tail);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 12), mat('#b5523b'));
      tie.position.set(0, 0.17, -0.12); tie.rotation.x = 0.9; head.add(tie);
      return;
    }
    case 'coque': {
      cap();
      const bun = sphere(0.06, m); bun.position.set(0, 0.25, -0.07); head.add(bun);
      return;
    }
    case 'cacheado': {
      cap(0.128);
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2, y = 0.08 + (i % 3) * 0.05;
        const c = sphere(0.035, m, 8, 6);
        c.position.set(Math.cos(a) * 0.11 * fw, y, Math.sin(a) * 0.1 - 0.02);
        if (Math.sin(a) > 0.6 && y < 0.16) continue;
        head.add(c);
      }
      return;
    }
    case 'black': {
      const afro = sphere(0.17, m, 20, 14);
      afro.scale.set(1.05 * fw, 0.95, 1);
      afro.position.set(0, 0.17, -0.03);
      head.add(afro);
      return;
    }
  }
}

function buildHeadAccessory(head: THREE.Group, look: Appearance) {
  const a = look.accessory;
  // Chapéus e bonés sobem com penteados volumosos.
  const lift = look.hair === 'black' ? 0.11 : look.hair === 'coque' || look.hair === 'cacheado' ? 0.03 : 0;
  if (a === 'oculos' || a === 'oculos_sol') {
    const frame = mat('#1f1f22', 0.4, { metalness: 0.4 });
    for (const sx of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 6, 16), frame);
      ring.position.set(sx * 0.043, 0.135, 0.118);
      head.add(ring);
      if (a === 'oculos_sol') {
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.025, 16), mat('#111', 0.1, { metalness: 0.5 }));
        lens.position.set(sx * 0.043, 0.135, 0.119);
        head.add(lens);
      }
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, 0.12), frame);
      arm.position.set(sx * 0.07, 0.135, 0.06);
      head.add(arm);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.004), frame);
    bridge.position.set(0, 0.14, 0.12);
    head.add(bridge);
  } else if (a === 'chapeu') {
    const hm = mat('#d6b48a', 0.8);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.01, 24), hm);
    brim.position.y = 0.21 + lift; head.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.115, 0.1, 20), hm);
    crown.position.y = 0.26 + lift; head.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.116, 0.116, 0.02, 20), mat('#3d3c3a'));
    band.position.y = 0.225 + lift; head.add(band);
  } else if (a === 'bone') {
    const cm = mat(look.topColor, 0.7);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.128, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), cm);
    crown.position.y = 0.15 + lift; crown.scale.set(0.98 * look.faceWidth * (lift > 0.05 ? 1.3 : 1), 0.85, 1.05 * (lift > 0.05 ? 1.3 : 1)); head.add(crown);
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.008, 20, 1, false, -Math.PI / 2, Math.PI), cm);
    visor.position.set(0, 0.16 + lift, 0.1); visor.scale.z = 1.2; head.add(visor);
  } else if (a === 'brincos') {
    for (const sx of [-1, 1]) {
      const e = sphere(0.009, mat('#e0b84f', 0.2, { metalness: 0.9 }), 8, 6);
      e.position.set(sx * 0.108 * look.faceWidth, 0.085, 0.005);
      head.add(e);
    }
  }
}

/** Pose procedural a partir do nome da animação e do tempo. */
export function animate(r: Rig, anim: Anim, t: number, moodValue = 60) {
  const s = Math.sin, c = Math.cos;
  const reset = () => {
    for (const g of [r.armL, r.armR, r.elbowL, r.elbowR, r.legL, r.legR, r.kneeL, r.kneeR, r.spine, r.head, r.body]) g.rotation.set(0, 0, 0);
    r.body.position.set(0, r.hipY, 0);
    r.armL.rotation.z = 0.08;
    r.armR.rotation.z = -0.08;
    r.prop.visible = false;
  };
  reset();
  // Boca reflete o humor (sorriso ↔ tristeza).
  r.mouth.rotation.z = moodValue >= 45 ? Math.PI : 0;
  r.mouth.position.y = moodValue >= 45 ? 0.075 : 0.062;
  const breathe = s(t * 2) * 0.015;
  r.spine.rotation.x = breathe;
  const sitPose = () => {
    r.legL.rotation.x = r.legR.rotation.x = -Math.PI / 2;
    r.kneeL.rotation.x = r.kneeR.rotation.x = Math.PI / 2;
    r.body.position.y = 0.08 * r.scale;
  };
  switch (anim) {
    case 'idle':
      r.armL.rotation.x = s(t * 1.3) * 0.03;
      r.armR.rotation.x = -s(t * 1.3) * 0.03;
      r.head.rotation.y = s(t * 0.4) * 0.15;
      break;
    case 'walk': {
      const f = t * 7.5;
      r.legL.rotation.x = s(f) * 0.55;
      r.legR.rotation.x = -s(f) * 0.55;
      r.kneeL.rotation.x = Math.max(0, -c(f)) * 0.7;
      r.kneeR.rotation.x = Math.max(0, c(f)) * 0.7;
      r.armL.rotation.x = -s(f) * 0.45;
      r.armR.rotation.x = s(f) * 0.45;
      r.elbowL.rotation.x = r.elbowR.rotation.x = -0.25;
      r.body.position.y = r.hipY + Math.abs(c(f)) * 0.03 * r.scale;
      break;
    }
    case 'sit':
    case 'watch':
      sitPose();
      r.armL.rotation.x = r.armR.rotation.x = -0.5;
      r.elbowL.rotation.x = r.elbowR.rotation.x = -0.6;
      if (anim === 'watch') r.head.rotation.x = -0.05;
      break;
    case 'eat':
      sitPose();
      r.armR.rotation.x = -0.6;
      r.elbowR.rotation.x = -0.8;
      r.armL.rotation.x = -0.6 - Math.max(0, s(t * 3)) * 0.6;
      r.elbowL.rotation.x = -1.2 - Math.max(0, s(t * 3)) * 0.9;
      r.prop.visible = true;
      break;
    case 'type':
      sitPose();
      r.armL.rotation.x = r.armR.rotation.x = -1.0;
      r.elbowL.rotation.x = -0.5 + s(t * 14) * 0.08;
      r.elbowR.rotation.x = -0.5 + c(t * 13) * 0.08;
      r.head.rotation.x = 0.1;
      break;
    case 'read':
      sitPose();
      r.armL.rotation.x = r.armR.rotation.x = -0.9;
      r.elbowL.rotation.x = r.elbowR.rotation.x = -1.1;
      r.armL.rotation.z = 0.3; r.armR.rotation.z = -0.3;
      r.head.rotation.x = 0.35;
      r.prop.visible = true;
      break;
    case 'sleep':
    case 'lie':
      r.body.rotation.x = -Math.PI / 2;
      r.body.position.y = 0.12 * r.scale;
      r.armL.rotation.z = 0.15; r.armR.rotation.z = -0.15;
      r.spine.rotation.x = anim === 'sleep' ? s(t * 1.2) * 0.02 : 0;
      r.head.rotation.y = anim === 'sleep' ? 0.4 : 0;
      break;
    case 'cook':
    case 'wash':
      r.armL.rotation.x = r.armR.rotation.x = -0.9;
      r.elbowL.rotation.x = -0.6 + s(t * 5) * 0.25;
      r.elbowR.rotation.x = -0.6 - s(t * 5) * 0.25;
      r.head.rotation.x = 0.3;
      r.spine.rotation.x = 0.1;
      break;
    case 'shower':
      r.armL.rotation.x = r.armR.rotation.x = -2.6 + s(t * 4) * 0.2;
      r.elbowL.rotation.x = r.elbowR.rotation.x = -1.2;
      r.head.rotation.x = -0.2;
      break;
    case 'exercise': {
      const f = t * 11;
      r.legL.rotation.x = s(f) * 0.8;
      r.legR.rotation.x = -s(f) * 0.8;
      r.kneeL.rotation.x = Math.max(0, -c(f)) * 1.2;
      r.kneeR.rotation.x = Math.max(0, c(f)) * 1.2;
      r.armL.rotation.x = -s(f) * 0.9;
      r.armR.rotation.x = s(f) * 0.9;
      r.elbowL.rotation.x = r.elbowR.rotation.x = -1.4;
      r.body.position.y = r.hipY + Math.abs(c(f)) * 0.06 * r.scale;
      break;
    }
    case 'swim': {
      const f = t * 3;
      r.body.rotation.x = Math.PI / 2.2;
      r.body.position.y = 0.1 * r.scale;
      r.armL.rotation.x = -f % (Math.PI * 2);
      r.armR.rotation.x = -(f + Math.PI) % (Math.PI * 2);
      r.legL.rotation.x = s(t * 9) * 0.3;
      r.legR.rotation.x = -s(t * 9) * 0.3;
      break;
    }
    case 'talk':
      r.armR.rotation.x = -0.5 + s(t * 3) * 0.3;
      r.elbowR.rotation.x = -0.9 + s(t * 4) * 0.3;
      r.armL.rotation.z = 0.2 + s(t * 2.3) * 0.1;
      r.head.rotation.z = s(t * 1.7) * 0.08;
      r.head.rotation.x = s(t * 5) * 0.04;
      break;
    case 'hug':
      r.armL.rotation.x = r.armR.rotation.x = -1.4;
      r.armL.rotation.z = -0.5; r.armR.rotation.z = 0.5;
      r.elbowL.rotation.x = r.elbowR.rotation.x = -0.6;
      break;
    case 'kiss':
      r.armL.rotation.x = r.armR.rotation.x = -1.1;
      r.armL.rotation.z = -0.3; r.armR.rotation.z = 0.3;
      r.spine.rotation.x = 0.15;
      r.head.rotation.x = 0.1;
      break;
    case 'wave':
      r.armR.rotation.z = -2.6;
      r.elbowR.rotation.z = s(t * 8) * 0.4;
      break;
    case 'dance': {
      const f = t * 6;
      r.body.position.y = r.hipY + Math.abs(s(f)) * 0.05 * r.scale;
      r.body.rotation.y = s(f / 2) * 0.4;
      r.armL.rotation.z = 1.2 + s(f) * 0.6;
      r.armR.rotation.z = -1.2 - s(f + 1) * 0.6;
      r.kneeL.rotation.x = Math.max(0, s(f)) * 0.5;
      r.kneeR.rotation.x = Math.max(0, -s(f)) * 0.5;
      break;
    }
    case 'play':
      sitPose();
      r.body.position.y = 0;
      r.legL.rotation.x = r.legR.rotation.x = -Math.PI / 2;
      r.kneeL.rotation.x = r.kneeR.rotation.x = 0.2;
      r.armL.rotation.x = -0.8 + s(t * 5) * 0.4;
      r.armR.rotation.x = -0.8 - s(t * 5) * 0.4;
      break;
    case 'carry':
      r.armL.rotation.x = r.armR.rotation.x = -1.0;
      r.elbowL.rotation.x = r.elbowR.rotation.x = -1.2;
      break;
    case 'baby':
      sitPose();
      r.body.position.y = 0;
      r.legL.rotation.x = r.legR.rotation.x = -Math.PI / 2;
      r.kneeL.rotation.x = r.kneeR.rotation.x = 0;
      r.armL.rotation.x = -0.5 + s(t * 2) * 0.3;
      r.armR.rotation.x = -0.5 - s(t * 2.2) * 0.3;
      break;
  }
}

export function disposeRig(r: Rig) {
  r.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
}

/* ------------------------------------------------------------------ Animais de estimação */

export interface PetRig {
  root: THREE.Group;
  legs: THREE.Group[];
  tail: THREE.Group;
  head: THREE.Group;
  body: THREE.Group;
}

export function buildPet(kind: PetKind, color: string): PetRig {
  const m = mat(color, 0.85);
  const dark = mat('#1f1f22', 0.4);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const dog = kind === 'cachorro';
  const L = dog ? 0.25 : 0.18;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(dog ? 0.12 : 0.085, dog ? 0.3 : 0.24, 4, 12), m);
  torso.rotation.x = Math.PI / 2;
  torso.position.y = L + 0.08;
  torso.castShadow = true;
  body.add(torso);
  const legs: THREE.Group[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(sx * (dog ? 0.07 : 0.05), L + 0.05, sz * (dog ? 0.16 : 0.13));
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(dog ? 0.03 : 0.022, L - 0.04, 3, 8), m);
    leg.geometry.translate(0, -L / 2, 0);
    leg.castShadow = true;
    g.add(leg);
    body.add(g);
    legs.push(g);
  }
  const head = new THREE.Group();
  head.position.set(0, L + (dog ? 0.2 : 0.15), dog ? 0.27 : 0.2);
  body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(dog ? 0.1 : 0.08, 16, 12), m);
  skull.castShadow = true;
  head.add(skull);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(dog ? 0.055 : 0.035, 12, 8), m);
  snout.position.set(0, -0.02, dog ? 0.09 : 0.065);
  snout.scale.set(1, 0.8, dog ? 1.3 : 1);
  head.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), dark);
  nose.position.set(0, 0, dog ? 0.16 : 0.1);
  head.add(nose);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), dark);
    eye.position.set(sx * 0.04, 0.03, dog ? 0.085 : 0.065);
    head.add(eye);
    const ear = new THREE.Mesh(dog ? new THREE.SphereGeometry(0.04, 8, 6) : new THREE.ConeGeometry(0.03, 0.07, 4), m);
    if (dog) { ear.scale.set(0.5, 1.2, 0.8); ear.position.set(sx * 0.085, 0.01, 0); }
    else ear.position.set(sx * 0.045, 0.085, 0);
    head.add(ear);
  }
  const tail = new THREE.Group();
  tail.position.set(0, L + 0.12, dog ? -0.27 : -0.2);
  const tailMesh = new THREE.Mesh(new THREE.CapsuleGeometry(dog ? 0.02 : 0.015, dog ? 0.15 : 0.22, 3, 6), m);
  tailMesh.geometry.translate(0, 0.1, 0);
  tail.add(tailMesh);
  tail.rotation.x = -0.7;
  body.add(tail);
  return { root, legs, tail, head, body };
}

export function animatePet(r: PetRig, anim: 'idle' | 'walk' | 'sleep' | 'eat' | 'play', t: number) {
  const s = Math.sin;
  r.body.rotation.set(0, 0, 0);
  r.body.position.y = 0;
  r.head.rotation.set(0, 0, 0);
  r.legs.forEach((l) => l.rotation.set(0, 0, 0));
  r.tail.rotation.set(-0.7, 0, s(t * 6) * 0.5);
  if (anim === 'walk' || anim === 'play') {
    const f = t * (anim === 'play' ? 14 : 10);
    r.legs.forEach((l, i) => { l.rotation.x = s(f + (i % 3 === 0 ? 0 : Math.PI)) * 0.6; });
    if (anim === 'play') r.body.position.y = Math.abs(s(f / 2)) * 0.08;
  } else if (anim === 'sleep') {
    r.body.rotation.z = Math.PI / 2.3;
    r.body.position.y = 0.05;
    r.tail.rotation.z = 0;
  } else if (anim === 'eat') {
    r.head.rotation.x = 0.7 + s(t * 6) * 0.1;
  } else {
    r.head.rotation.y = s(t * 0.7) * 0.3;
  }
}
