import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { h } from './dom';
import type { Sim, Relationship, RelKind, AgeStage, TraitId } from '../model/life';
import {
  AGES, AGE_BY_ID, HAIR_STYLES, TOPS, BOTTOMS, ACCESSORIES, SKIN_TONES, HAIR_COLORS, EYE_COLORS, CLOTH_COLORS, TRAITS, ASPIRATIONS,
  CAREERS, REL_NAMES, randomSim, randomAppearance, isAdult, LAST_NAMES,
} from '../model/life';
import { buildCharacter, animate, disposeRig, type Rig } from '../render/character';
import { simPortrait } from './portraits';

export interface CasResult {
  members: Sim[];
  rels: Relationship[];
  familyName: string;
}

type PairKind = RelKind | '';

const REL_INIT: Record<string, { amizade: number; romance: number }> = {
  conjuge: { amizade: 65, romance: 70 }, noivos: { amizade: 55, romance: 65 }, namorados: { amizade: 45, romance: 55 },
  pai: { amizade: 50, romance: 0 }, filho: { amizade: 50, romance: 0 }, irmaos: { amizade: 40, romance: 0 }, colegas: { amizade: 20, romance: 0 },
};

/** Criação e edição de personagens e famílias. */
export function openCAS(initial: { members: Sim[]; rels: Relationship[]; familyName: string }, onDone: (r: CasResult) => void, onCancel?: () => void) {
  const members: Sim[] = initial.members.length ? JSON.parse(JSON.stringify(initial.members)) : [randomSim({ age: 'jovem' })];
  let familyName = initial.familyName || members[0].lastName;
  if (!initial.members.length) members[0].lastName = familyName;
  const pairs = new Map<string, PairKind>();
  const pkey = (a: string, b: string) => `${a}|${b}`;
  for (const r of initial.rels) pairs.set(pkey(r.a, r.b), r.kind);
  let cur = 0;
  let tab = 'identidade';

  // ---------- Prévia 3D
  const canvas = h('canvas', { class: 'cas-canvas' }) as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  const key = new THREE.DirectionalLight('#fff4e0', 2.4);
  key.position.set(2, 4, 3);
  scene.add(key, new THREE.AmbientLight('#ffffff', 0.4));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshStandardMaterial({ color: '#2a3340', roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  let rig: Rig | null = null;
  let rigKey = '';
  let spin = 0.3;
  let t = 0;
  let alive = true;
  const ensureRig = () => {
    const s = members[cur];
    const k = `${s.age}|${JSON.stringify(s.look)}`;
    if (k === rigKey && rig) return;
    if (rig) { scene.remove(rig.root); disposeRig(rig); }
    rig = buildCharacter(s.look, s.age);
    scene.add(rig.root);
    rigKey = k;
  };
  const frame = () => {
    if (!alive) return;
    const w = canvas.clientWidth, hh = canvas.clientHeight;
    if (w && hh && (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(hh * renderer.getPixelRatio()))) {
      renderer.setSize(w, hh, false);
    }
    cam.aspect = w / Math.max(1, hh);
    ensureRig();
    t += 1 / 60;
    if (rig) {
      animate(rig, members[cur].age === 'bebe' ? 'baby' : tab === 'rosto' || tab === 'cabelo' ? 'idle' : 'idle', t, 75);
      rig.root.rotation.y = spin;
      const H = AGE_BY_ID.get(members[cur].age)!.height;
      const focusFace = tab === 'rosto' || tab === 'cabelo';
      const cy = focusFace ? H * 0.9 : H * 0.52;
      const dist = focusFace ? 1.15 + H * 0.25 : H * 2.1 + 0.6;
      cam.position.set(0, cy + (focusFace ? 0.02 : 0.15), dist);
      cam.lookAt(0, cy, 0);
      cam.updateProjectionMatrix();
    }
    renderer.render(scene, cam);
    requestAnimationFrame(frame);
  };
  let dragX: number | null = null;
  canvas.addEventListener('pointerdown', (e) => { dragX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (dragX !== null) { spin += (e.clientX - dragX) * 0.012; dragX = e.clientX; } });
  canvas.addEventListener('pointerup', () => { dragX = null; });

  // ---------- Layout
  const roster = h('div', { class: 'cas-roster' });
  const tabs = h('div', { class: 'cas-tabs' });
  const panel = h('div', { class: 'cas-panel' });
  const nameInput = h('input', { type: 'text', value: familyName, maxlength: 30, 'aria-label': 'Sobrenome da família' }) as HTMLInputElement;
  nameInput.addEventListener('change', () => {
    const old = familyName;
    familyName = nameInput.value.trim() || familyName;
    for (const m of members) if (m.lastName === old) m.lastName = familyName;
    renderRoster();
  });
  const close = () => {
    alive = false;
    if (rig) disposeRig(rig);
    renderer.dispose();
    renderer.forceContextLoss();
    root.remove();
  };
  const finish = () => {
    if (!members.some((m) => isAdult(m.age))) { alert('A família precisa de pelo menos um jovem adulto, adulto ou idoso.'); return; }
    const rels: Relationship[] = [];
    for (const [k, kind] of pairs) {
      if (!kind) continue;
      const [a, b] = k.split('|');
      if (!members.some((m) => m.id === a) || !members.some((m) => m.id === b)) continue;
      const prev = initial.rels.find((r) => r.a === a && r.b === b && r.kind === kind);
      rels.push(prev ?? { a, b, kind, ...REL_INIT[kind] });
    }
    for (const m of members) {
      if (m.age === 'crianca' || m.age === 'adolescente') m.career = 'escola';
      else if (m.career === 'escola' || m.age === 'bebe') m.career = 'nenhuma';
    }
    close();
    onDone({ members, rels, familyName });
  };
  const root = h('div', { class: 'cas' },
    h('div', { class: 'cas-top' },
      h('div', { class: 'cas-family' }, h('label', {}, 'Família'), nameInput),
      roster,
      h('div', { class: 'cas-actions' },
        h('button', { class: 'chip', onclick: () => { close(); onCancel?.(); } }, 'Cancelar'),
        h('button', { class: 'chip primary', onclick: finish }, initial.members.length ? 'Salvar família' : 'Concluir e mudar para a casa'),
      ),
    ),
    h('div', { class: 'cas-main' }, h('div', { class: 'cas-view' }, canvas, h('div', { class: 'cas-hint' }, 'Arraste para girar')), h('div', { class: 'cas-side' }, tabs, panel)),
  );
  document.body.append(root);
  requestAnimationFrame(frame);

  // ---------- Controles
  const s = () => members[cur];
  const refresh = () => { renderPanel(); renderRoster(); };
  const slider = (label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void) => {
    const input = h('input', { type: 'range', min, max, step, value: String(get()) }) as HTMLInputElement;
    input.addEventListener('input', () => set(Number(input.value)));
    input.addEventListener('change', renderRoster);
    return h('div', { class: 'cas-row' }, h('label', {}, label), input);
  };
  const seg = (label: string, opts: readonly { id: string; name: string }[], get: () => string, set: (v: string) => void) =>
    h('div', { class: 'cas-row' }, h('label', {}, label), h('div', { class: 'seg wrap' }, ...opts.map((o) => h('button', { class: o.id === get() ? 'on' : '', onclick: () => { set(o.id); refresh(); } }, o.name))));
  const colors = (label: string, list: string[], get: () => string, set: (v: string) => void) => {
    const custom = h('input', { type: 'color', value: get(), title: 'Personalizada' }) as HTMLInputElement;
    custom.addEventListener('input', () => set(custom.value));
    custom.addEventListener('change', refresh);
    return h('div', { class: 'cas-row' }, h('label', {}, label), h('div', { class: 'swatches' },
      ...list.map((c) => h('button', { class: `sw ${c === get() ? 'on' : ''}`, style: { background: c }, 'aria-label': c, onclick: () => { set(c); refresh(); } })), custom));
  };
  const text = (label: string, get: () => string, set: (v: string) => void) => {
    const input = h('input', { type: 'text', value: get(), maxlength: 24 }) as HTMLInputElement;
    input.addEventListener('change', () => { set(input.value.trim() || get()); renderRoster(); });
    return h('div', { class: 'cas-row' }, h('label', {}, label), input);
  };

  const TABS: [string, string][] = [['identidade', 'Identidade'], ['rosto', 'Rosto'], ['corpo', 'Corpo'], ['cabelo', 'Cabelo'], ['roupas', 'Roupas'], ['personalidade', 'Personalidade'], ['relacoes', 'Relações']];

  const putpanel = (...els: (Node | string | null | undefined)[]) => panel.append(...(els.filter((x) => x != null) as (Node | string)[]));
  function renderPanel() {
    tabs.innerHTML = '';
    for (const [id, name] of TABS) tabs.append(h('button', { class: tab === id ? 'on' : '', onclick: () => { tab = id; renderPanel(); } }, name));
    panel.innerHTML = '';
    const L = s().look;
    switch (tab) {
      case 'identidade': {
        const adult = isAdult(s().age);
        putpanel(
          text('Nome', () => s().firstName, (v) => { s().firstName = v; }),
          text('Sobrenome', () => s().lastName, (v) => { s().lastName = v; }),
          seg('Idade', AGES.map((a) => ({ id: a.id, name: a.name })), () => s().age, (v) => {
            s().age = v as AgeStage;
            if (v === 'bebe') s().traits = [];
          }),
          adult ? seg('Profissão', CAREERS.filter((c) => !c.kids).map((c) => ({ id: c.id, name: c.name })), () => s().career, (v) => { s().career = v; s().careerLevel = 0; }) : h('p', { class: 'muted small' }, s().age === 'bebe' ? 'Bebês não estudam nem trabalham.' : 'Crianças e adolescentes vão à escola nos dias úteis.'),
          s().age !== 'bebe' ? seg('Aspiração', ASPIRATIONS.map((a) => ({ id: a.id, name: a.name })), () => s().aspiration, (v) => { s().aspiration = v as any; }) : null,
          h('div', { class: 'cas-row' }, h('button', { class: 'chip', onclick: () => { const r = randomSim({ age: s().age, lastName: s().lastName }); Object.assign(s(), { look: r.look, firstName: r.firstName, traits: s().age === 'bebe' ? [] : r.traits, aspiration: r.aspiration }); refresh(); } }, '🎲 Personagem aleatório')),
        );
        break;
      }
      case 'rosto':
        putpanel(
          slider('Largura do rosto', 0.85, 1.15, 0.01, () => L.faceWidth, (v) => { L.faceWidth = v; }),
          slider('Mandíbula', 0, 1, 0.01, () => L.jaw, (v) => { L.jaw = v; }),
          slider('Tamanho dos olhos', 0.8, 1.25, 0.01, () => L.eyeSize, (v) => { L.eyeSize = v; }),
          colors('Cor dos olhos', EYE_COLORS, () => L.eyeColor, (v) => { L.eyeColor = v; }),
          slider('Nariz', 0.7, 1.4, 0.01, () => L.nose, (v) => { L.nose = v; }),
          slider('Sobrancelhas', 0.5, 1.6, 0.01, () => L.brows, (v) => { L.brows = v; }),
          h('div', { class: 'cas-row' }, h('label', {}, 'Barba'), h('div', { class: 'seg' },
            h('button', { class: L.beard ? 'on' : '', onclick: () => { L.beard = true; refresh(); } }, 'Com barba'),
            h('button', { class: !L.beard ? 'on' : '', onclick: () => { L.beard = false; refresh(); } }, 'Sem barba'))),
        );
        break;
      case 'corpo':
        putpanel(
          slider('Altura', 0.85, 1.15, 0.01, () => L.height, (v) => { L.height = v; }),
          slider('Estrutura corporal', 0, 1, 0.01, () => L.build, (v) => { L.build = v; }),
          colors('Tom de pele', SKIN_TONES, () => L.skin, (v) => { L.skin = v; }),
        );
        break;
      case 'cabelo':
        putpanel(
          seg('Penteado', HAIR_STYLES, () => L.hair, (v) => { L.hair = v as any; }),
          colors('Cor do cabelo', HAIR_COLORS, () => L.hairColor, (v) => { L.hairColor = v; }),
        );
        break;
      case 'roupas':
        putpanel(
          seg('Parte de cima', TOPS, () => L.top, (v) => { L.top = v as any; }),
          colors('Cor', CLOTH_COLORS, () => L.topColor, (v) => { L.topColor = v; }),
          L.top !== 'vestido' ? seg('Parte de baixo', BOTTOMS, () => L.bottom, (v) => { L.bottom = v as any; }) : null,
          L.top !== 'vestido' ? colors('Cor', CLOTH_COLORS, () => L.bottomColor, (v) => { L.bottomColor = v; }) : null,
          colors('Calçados', ['#1f1f22', '#f1ece3', '#7a4b2a', '#b5523b', '#3e6a9a', '#e0b84f'], () => L.shoeColor, (v) => { L.shoeColor = v; }),
          seg('Acessório', ACCESSORIES, () => L.accessory, (v) => { L.accessory = v as any; }),
          h('div', { class: 'cas-row' }, h('button', { class: 'chip', onclick: () => { const r = randomAppearance(); Object.assign(L, { top: r.top, topColor: r.topColor, bottom: r.bottom, bottomColor: r.bottomColor, shoeColor: r.shoeColor, accessory: r.accessory }); refresh(); } }, '🎲 Roupa aleatória')),
        );
        break;
      case 'personalidade':
        if (s().age === 'bebe') { putpanel(h('p', { class: 'muted' }, 'A personalidade é definida quando o bebê cresce.')); break; }
        putpanel(h('p', { class: 'muted small' }, `Escolha até 3 traços (${s().traits.length}/3).`),
          h('div', { class: 'traits' }, ...TRAITS.map((tr) => {
            const on = s().traits.includes(tr.id);
            return h('button', {
              class: `trait ${on ? 'on' : ''}`,
              onclick: () => {
                if (on) s().traits = s().traits.filter((x) => x !== tr.id);
                else if (s().traits.length < 3) s().traits.push(tr.id as TraitId);
                renderPanel();
              },
            }, h('b', {}, tr.name), h('small', {}, tr.desc));
          })));
        break;
      case 'relacoes': {
        const others = members.filter((m) => m.id !== s().id);
        if (!others.length) { putpanel(h('p', { class: 'muted' }, 'Adicione outros membros para definir os laços familiares.')); break; }
        const kinds: PairKind[] = ['', 'conjuge', 'namorados', 'noivos', 'pai', 'filho', 'irmaos', 'colegas'];
        for (const o of others) {
          const k1 = pkey(s().id, o.id), k2 = pkey(o.id, s().id);
          let currentKind: PairKind = pairs.get(k1) ?? '';
          // Relação inversa (pai ↔ filho)
          const inv = pairs.get(k2);
          if (!currentKind && inv) currentKind = inv === 'pai' ? 'filho' : inv === 'filho' ? 'pai' : inv;
          putpanel(h('div', { class: 'cas-row' }, h('label', {}, `${s().firstName} é … de ${o.firstName}`),
            h('div', { class: 'seg wrap' }, ...kinds.map((k) => h('button', {
              class: currentKind === k ? 'on' : '',
              onclick: () => {
                pairs.delete(k1); pairs.delete(k2);
                if (k) pairs.set(k1, k);
                renderPanel();
              },
            }, k ? REL_NAMES[k] : 'Nenhum')))));
        }
        break;
      }
    }
  }

  function renderRoster() {
    roster.innerHTML = '';
    members.forEach((m, i) => {
      const img = h('img', { src: simPortrait(m), alt: m.firstName }) as HTMLImageElement;
      roster.append(h('div', { class: `cas-member ${i === cur ? 'on' : ''}` },
        h('button', { class: 'pic', onclick: () => { cur = i; renderPanel(); renderRoster(); }, title: `${m.firstName} ${m.lastName}` }, img, h('small', {}, m.firstName)),
        members.length > 1 ? h('button', { class: 'rm', 'aria-label': `Remover ${m.firstName}`, onclick: () => { members.splice(i, 1); cur = Math.min(cur, members.length - 1); refresh(); } }, '×') : null,
      ));
    });
    if (members.length < 8) {
      const addM = (age: AgeStage) => () => {
        const n = randomSim({ age, lastName: familyName });
        members.push(n);
        cur = members.length - 1;
        refresh();
      };
      roster.append(h('div', { class: 'cas-add' },
        h('button', { class: 'chip', onclick: addM('jovem') }, '+ Adulto'),
        h('button', { class: 'chip', onclick: addM('crianca') }, '+ Criança'),
        h('button', { class: 'chip', onclick: addM('bebe') }, '+ Bebê'),
      ));
    }
  }

  refresh();
}

export { LAST_NAMES };
