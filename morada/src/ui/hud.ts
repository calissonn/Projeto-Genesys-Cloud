import type { Editor, Label } from '../editor/editor';
import type { Tool, ToolOption } from '../editor/tools';
import {
  SelectTool, WallTool, FloorTool, OpeningTool, StairTool, RoofTool, PlaceTool, PaintTool, DemolishTool,
} from '../editor/tools';
import type { EntityRef, Wall, Opening, Floor, Stair, Roof, Item, OpeningKind, StairKind, RoofKind } from '../model/types';
import { h, iconBtn, modal } from './dom';
import { ICONS } from './icons';
import { CATALOG, CATEGORIES, CATALOG_BY_ID } from '../model/catalog';
import { MATERIALS, MATERIAL_BY_ID, PALETTE, materialsFor, type MaterialUse } from '../model/materials';
import {
  balance, computeCost, fmtMoney, levelName, OPENING_PRESETS, PRESET_BY_KIND, openingFits, wallCost, floorCost,
  openingCost, stairCost, roofCost, itemCost,
} from '../model/project';
import { wallLength, polygonArea, fmtM, fmtM2, dist } from '../model/geometry';
import { thumbs } from './thumbs';

export interface HudCallbacks {
  openMenu(): void;
  toLife(): void;
  openSettings(): void;
  toast(msg: string): void;
}

/** Interface do modo construção/decoração. */
export class Hud {
  root: HTMLElement;
  private optionsBar: HTMLElement;
  private props: HTMLElement;
  private catalog: HTMLElement;
  private labelsLayer: HTMLElement;
  private money: HTMLElement;
  private levelLabel: HTMLElement;
  private toolButtons = new Map<string, HTMLButtonElement>();
  private viewButtons: Record<string, HTMLButtonElement> = {};
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;
  private savedEl: HTMLElement;
  private title: HTMLElement;
  private catCategory = CATEGORIES[0].id;
  private catSearch = '';
  private labels: Label[] = [];

  constructor(parent: HTMLElement, private e: Editor, private cb: HudCallbacks) {
    this.root = h('div', { class: 'hud' });
    parent.append(this.root);

    // Barra superior
    this.title = h('div', { class: 'title' });
    this.money = h('button', { class: 'money', title: 'Orçamento da obra', onclick: () => this.showCosts() });
    this.levelLabel = h('div', { class: 'level-label' });
    this.undoBtn = iconBtn(ICONS.undo, 'Desfazer', () => e.undo());
    this.redoBtn = iconBtn(ICONS.redo, 'Refazer', () => e.redo());
    this.savedEl = h('div', { class: 'saved' });
    let saved3d: { showRoof: boolean; showAll: boolean } | null = null;
    this.viewButtons.mode = iconBtn(ICONS.plan, 'Alternar planta 2D / 3D', () => {
      if (e.rig.mode === '3d') {
        // Planta baixa: oculta telhados e andares superiores para enxergar o pavimento atual.
        saved3d = { showRoof: e.view.showRoof, showAll: e.view.showAll };
        e.rig.setMode('planta');
        e.setView({ showRoof: false, showAll: false });
      } else {
        e.rig.setMode('3d');
        e.setView(saved3d ?? { showRoof: true });
        saved3d = null;
      }
      this.syncView();
    });
    this.viewButtons.walls = iconBtn(ICONS.wall, 'Paredes: inteiras / baixas / ocultas', () => {
      const order = ['inteiras', 'baixas', 'ocultas'] as const;
      e.setView({ wallMode: order[(order.indexOf(e.view.wallMode) + 1) % 3] });
      cb.toast(`Paredes ${e.view.wallMode}`);
    });
    this.viewButtons.levels = iconBtn(ICONS.layers, 'Mostrar todos os andares / apenas até o atual', () => {
      e.setView({ showAll: !e.view.showAll });
      cb.toast(e.view.showAll ? 'Exibindo todos os andares' : 'Exibindo até o andar atual');
    });
    this.viewButtons.roof = iconBtn(ICONS.roof, 'Mostrar / ocultar telhados', () => {
      e.setView({ showRoof: !e.view.showRoof });
      cb.toast(e.view.showRoof ? 'Telhados visíveis' : 'Telhados ocultos');
    });
    this.viewButtons.snap = iconBtn(ICONS.grid, 'Encaixe na grade', () => {
      e.snap.grid = !e.snap.grid;
      cb.toast(e.snap.grid ? 'Encaixe na grade ativado' : 'Construção livre (sem grade)');
      this.syncView();
    });
    this.viewButtons.magnet = iconBtn(ICONS.magnet, 'Ímã de vértices e ângulos', () => {
      e.snap.magnet = !e.snap.magnet;
      e.snap.angle = e.snap.magnet;
      cb.toast(e.snap.magnet ? 'Ímã de vértices e ângulos ativado' : 'Ímã desativado');
      this.syncView();
    });

    const top = h('div', { class: 'topbar' },
      h('div', { class: 'group' }, iconBtn(ICONS.menu, 'Menu', () => cb.openMenu()),
        h('div', { class: 'mode-switch' }, h('button', { class: 'on', title: 'Construir' }, '🔨', h('span', { class: 'lbl-txt' }, ' Construir')), h('button', { onclick: () => cb.toLife(), title: 'Viver' }, '🏠', h('span', { class: 'lbl-txt' }, ' Viver'))),
        this.title, this.money),
      h('div', { class: 'group level' },
        iconBtn(ICONS.down, 'Descer andar', () => e.setLevel(e.view.level - 1)),
        this.levelLabel,
        iconBtn(ICONS.up, 'Subir andar', () => e.setLevel(e.view.level + 1)),
      ),
      h('div', { class: 'group' },
        this.savedEl, this.undoBtn, this.redoBtn,
        h('span', { class: 'sep' }),
        this.viewButtons.mode, this.viewButtons.walls, this.viewButtons.levels, this.viewButtons.roof,
        this.viewButtons.snap, this.viewButtons.magnet,
        iconBtn(ICONS.settings, 'Configurações', () => cb.openSettings()),
      ),
    );

    // Barra de ferramentas lateral
    const tools: [string, string, string, () => Tool][] = [
      ['selecionar', ICONS.select, 'Selecionar', () => new SelectTool(e)],
      ['parede', ICONS.wall, 'Paredes', () => new WallTool(e)],
      ['piso', ICONS.floor, 'Pisos', () => new FloorTool(e)],
      ['abertura', ICONS.door, 'Portas e janelas', () => new OpeningTool(e)],
      ['escada', ICONS.stair, 'Escadas', () => new StairTool(e)],
      ['telhado', ICONS.roof, 'Telhados', () => new RoofTool(e)],
      ['objeto', ICONS.sofa, 'Objetos', () => new SelectTool(e)],
      ['pintar', ICONS.paint, 'Pintar', () => new PaintTool(e)],
      ['demolir', ICONS.demolish, 'Demolir', () => new DemolishTool(e)],
    ];
    const bar = h('div', { class: 'toolbar' });
    for (const [id, icon, name, make] of tools) {
      const b = h('button', {
        class: 'tool-btn', title: name, 'aria-label': name,
        onclick: () => {
          if (id === 'objeto') { this.toggleCatalog(); return; }
          this.toggleCatalog(false);
          e.select(null);
          e.setTool(make());
        },
      }, h('span', { html: icon }), h('small', {}, name));
      this.toolButtons.set(id, b);
      bar.append(b);
    }

    this.optionsBar = h('div', { class: 'options' });
    this.props = h('div', { class: 'props hidden' });
    this.catalog = h('div', { class: 'catalog hidden' });
    this.labelsLayer = h('div', { class: 'labels' });
    this.root.append(this.labelsLayer, top, bar, this.optionsBar, this.props, this.catalog);

    this.offs.push(
      e.on('change', () => this.syncTop()),
      e.on('tool', (t) => this.renderOptions(t)),
      e.on('selection', (s) => this.renderProps(s)),
      e.on('view', () => this.syncView()),
      e.on('labels', (l) => { this.labels = l; this.positionLabels(); }),
      e.on('saved', () => {
        this.savedEl.textContent = 'Salvo ✓';
        this.savedEl.classList.add('show');
        setTimeout(() => this.savedEl.classList.remove('show'), 1500);
      }),
    );
    this.prevRigChange = e.rig.onChange;
    const prev = this.prevRigChange;
    e.rig.onChange = () => { prev?.(); this.positionLabels(); };
    this.syncTop();
    this.syncView();
    this.renderOptions(e.tool);
  }

  private offs: (() => void)[] = [];
  private prevRigChange: (() => void) | null = null;

  destroy() {
    this.offs.forEach((f) => f());
    this.e.rig.onChange = this.prevRigChange;
    thumbs.clearQueue();
    this.root.remove();
  }

  /* -------------------------------------------------- topo */

  private syncTop() {
    const p = this.e.project;
    this.title.innerHTML = '';
    this.title.append(h('b', {}, p.name), h('span', { class: `badge ${p.mode}` }, p.mode === 'criativo' ? 'Criativo' : 'Simulação'));
    const cost = computeCost(p).total;
    this.money.innerHTML = '';
    if (p.mode === 'criativo') this.money.append(h('span', { html: ICONS.money }), h('span', {}, `Obra ${fmtMoney(cost)}`));
    else {
      const bal = balance(p);
      this.money.append(h('span', { html: ICONS.money }), h('span', { class: bal < 50000 ? 'low' : '' }, fmtMoney(bal)));
    }
    this.levelLabel.textContent = `${levelName(this.e.view.level)} · ${this.e.view.level + 1}/${Math.max(p.levels, this.e.view.level + 1)}`;
    this.undoBtn.disabled = !this.e.history.canUndo;
    this.redoBtn.disabled = !this.e.history.canRedo;
  }

  private syncView() {
    const e = this.e;
    this.viewButtons.mode.innerHTML = e.rig.mode === '3d' ? ICONS.plan : ICONS.cube;
    this.viewButtons.mode.title = e.rig.mode === '3d' ? 'Ver planta baixa 2D' : 'Ver em 3D';
    this.viewButtons.walls.classList.toggle('on', e.view.wallMode !== 'inteiras');
    this.viewButtons.walls.dataset.state = e.view.wallMode;
    this.viewButtons.levels.classList.toggle('on', e.view.showAll);
    this.viewButtons.roof.classList.toggle('on', !e.view.showRoof);
    this.viewButtons.roof.innerHTML = e.view.showRoof ? ICONS.roof : ICONS.roofOff;
    this.viewButtons.snap.classList.toggle('on', e.snap.grid);
    this.viewButtons.magnet.classList.toggle('on', e.snap.magnet);
    this.syncTop();
  }

  private showCosts() {
    const p = this.e.project;
    const c = computeCost(p);
    const rows: [string, number][] = [['Paredes', c.walls], ['Pisos e plataformas', c.floors], ['Portas e janelas', c.openings], ['Escadas', c.stairs], ['Telhados', c.roofs], ['Móveis e objetos', c.items]];
    const body = h('div', { class: 'costs' },
      h('p', {}, `Terreno ${p.lot.name} (${p.lot.w} × ${p.lot.d} m) em ${p.lot.neighborhood} — ${fmtMoney(p.lot.price)}`),
      h('table', {}, ...rows.map(([n, v]) => h('tr', {}, h('td', {}, n), h('td', {}, fmtMoney(Math.round(v))))),
        h('tr', { class: 'total' }, h('td', {}, 'Total da obra'), h('td', {}, fmtMoney(c.total))),
        p.mode === 'simulacao' ? h('tr', {}, h('td', {}, 'Capital disponível'), h('td', {}, fmtMoney(p.funds))) : null,
        p.mode === 'simulacao' ? h('tr', { class: 'total' }, h('td', {}, 'Saldo'), h('td', {}, fmtMoney(balance(p)))) : null,
      ),
      h('p', { class: 'muted' }, 'Demolir ou desfazer devolve o valor ao saldo. No Modo Simulação, alterações que ultrapassem o saldo são bloqueadas.'),
    );
    modal('Orçamento da obra', body);
  }

  /* -------------------------------------------------- opções da ferramenta */

  private renderOptions(t: Tool) {
    for (const [id, b] of this.toolButtons) b.classList.toggle('active', id === t.id || (id === 'objeto' && t.id === 'objeto'));
    const bar = this.optionsBar;
    bar.innerHTML = '';
    bar.append(h('div', { class: 'hint' }, h('b', {}, t.name), ' — ', t.hint));
    const opts = t.options?.() ?? [];
    if (!opts.length) return;
    const row = h('div', { class: 'opt-row' });
    for (const o of opts) row.append(this.renderOption(o));
    bar.append(row);
  }

  private renderOption(o: ToolOption): HTMLElement {
    switch (o.type) {
      case 'seg':
        return h('div', { class: 'opt' }, h('label', {}, o.label),
          h('div', { class: 'seg' }, ...o.options.map((x) => h('button', { class: x.v === o.value ? 'on' : '', onclick: () => o.set(x.v) }, x.label))));
      case 'range': {
        const val = h('span', { class: 'val' }, o.fmt(o.value));
        const input = h('input', { type: 'range', min: o.min, max: o.max, step: o.step, value: String(o.value) }) as HTMLInputElement;
        input.addEventListener('input', () => { val.textContent = o.fmt(Number(input.value)); o.set(Number(input.value)); });
        return h('div', { class: 'opt' }, h('label', {}, o.label), input, val);
      }
      case 'toggle': {
        const b = h('button', { class: `chip ${o.value ? 'on' : ''}` }, `${o.value ? '✓ ' : ''}${o.label}`);
        b.onclick = () => { o.set(!o.value); o.value = !o.value; b.className = `chip ${o.value ? 'on' : ''}`; b.textContent = `${o.value ? '✓ ' : ''}${o.label}`; };
        return h('div', { class: 'opt' }, b);
      }
      case 'button':
        return h('div', { class: 'opt' }, h('button', { class: `chip ${o.primary ? 'primary' : ''}`, disabled: o.disabled, onclick: o.action }, o.label));
      case 'info':
        return h('div', { class: 'opt info' }, o.label);
      case 'materials':
        return h('div', { class: 'opt' }, h('label', {}, 'Material'), this.materialPicker(o.use ? materialsFor(o.use) : MATERIALS, o.value, o.set));
      case 'swatches':
        return h('div', { class: 'opt' }, h('label', {}, 'Cor'), this.swatches(o.value, o.set));
    }
  }

  private materialPicker(list = MATERIALS, value: string, set: (v: string) => void) {
    return h('div', { class: 'seg mats' }, ...list.map((m) => h('button', { class: m.id === value ? 'on' : '', onclick: () => set(m.id), title: m.name },
      h('i', { style: { background: m.base } }), m.name)));
  }

  private swatches(value: string, set: (v: string) => void) {
    const custom = h('input', { type: 'color', value, title: 'Cor personalizada' }) as HTMLInputElement;
    custom.addEventListener('change', () => set(custom.value));
    return h('div', { class: 'swatches' },
      ...PALETTE.map((c) => h('button', { class: `sw ${c.toLowerCase() === value.toLowerCase() ? 'on' : ''}`, style: { background: c }, title: c, 'aria-label': `Cor ${c}`, onclick: () => set(c) })),
      custom);
  }

  /* -------------------------------------------------- catálogo */

  toggleCatalog(force?: boolean) {
    const show = force ?? this.catalog.classList.contains('hidden');
    this.catalog.classList.toggle('hidden', !show);
    this.toolButtons.get('objeto')!.classList.toggle('open', show);
    if (show) { this.renderCatalog(); this.props.classList.add('hidden'); }
    else thumbs.clearQueue();
  }

  private renderCatalog() {
    const c = this.catalog;
    c.innerHTML = '';
    const search = h('input', { type: 'search', placeholder: 'Buscar objeto…', value: this.catSearch }) as HTMLInputElement;
    search.addEventListener('input', () => { this.catSearch = search.value; this.renderGrid(grid); });
    const tabs = h('div', { class: 'cat-tabs' }, ...CATEGORIES.map((cat) => h('button', {
      class: cat.id === this.catCategory && !this.catSearch ? 'on' : '',
      onclick: () => { this.catCategory = cat.id; this.catSearch = ''; this.renderCatalog(); },
    }, h('span', {}, cat.icon), cat.name)));
    const grid = h('div', { class: 'cat-grid' });
    c.append(h('div', { class: 'cat-head' }, search, iconBtn(ICONS.close, 'Fechar catálogo', () => this.toggleCatalog(false))), tabs, grid);
    this.renderGrid(grid);
  }

  private renderGrid(grid: HTMLElement) {
    grid.innerHTML = '';
    thumbs.clearQueue();
    const q = this.catSearch.trim().toLowerCase();
    const list = q ? CATALOG.filter((d) => d.name.toLowerCase().includes(q)) : CATALOG.filter((d) => d.category === this.catCategory);
    if (!list.length) grid.append(h('p', { class: 'muted' }, 'Nenhum objeto encontrado.'));
    for (const def of list) {
      const img = h('img', { alt: def.name, src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }) as HTMLImageElement;
      thumbs.request(def.id, (url) => { img.src = url; });
      grid.append(h('button', {
        class: 'cat-item',
        onclick: () => {
          this.toggleCatalog(false);
          this.e.select(null);
          this.e.setTool(new PlaceTool(this.e, def));
        },
      }, img, h('span', { class: 'n' }, def.name), h('span', { class: 'p' }, fmtMoney(def.price))));
    }
  }

  /* -------------------------------------------------- rótulos de medidas */

  private positionLabels() {
    const layer = this.labelsLayer;
    while (layer.children.length < this.labels.length) layer.append(h('div', { class: 'lbl' }));
    while (layer.children.length > this.labels.length) layer.lastChild!.remove();
    this.labels.forEach((l, i) => {
      const el = layer.children[i] as HTMLElement;
      const s = this.e.rig.project(l.pos);
      el.textContent = l.text;
      el.className = `lbl ${l.kind ?? ''}`;
      el.style.display = s.visible ? '' : 'none';
      el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
    });
  }

  /* -------------------------------------------------- propriedades */

  private live<T>(ref: EntityRef, fn: (ent: T) => void) {
    const e = this.e;
    e.beginLive();
    const ent = e.find(ref);
    if (!ent) return;
    fn(ent as T);
    e.rebuild();
  }

  private commitLive() {
    this.e.endLive('Propriedade');
  }

  private slider(label: string, min: number, max: number, step: number, value: number, fmt: (v: number) => string, onInput: (v: number) => void) {
    const val = h('span', { class: 'val' }, fmt(value));
    const input = h('input', { type: 'range', min, max, step, value: String(value) }) as HTMLInputElement;
    input.addEventListener('input', () => { val.textContent = fmt(Number(input.value)); onInput(Number(input.value)); });
    input.addEventListener('change', () => this.commitLive());
    return h('div', { class: 'prop' }, h('label', {}, label), h('div', { class: 'ctl' }, input, val));
  }

  private segProp(label: string, value: string, options: { v: string; label: string }[], set: (v: string) => void) {
    return h('div', { class: 'prop' }, h('label', {}, label),
      h('div', { class: 'seg wrap' }, ...options.map((o) => h('button', { class: o.v === value ? 'on' : '', onclick: () => set(o.v) }, o.label))));
  }

  private matProp(ref: EntityRef, use: MaterialUse, ent: { material: string; color: string }) {
    const tint = MATERIAL_BY_ID.get(ent.material)?.tintable ?? true;
    return [
      h('div', { class: 'prop' }, h('label', {}, 'Material'), this.materialPicker(materialsFor(use), ent.material, (v) => this.apply(ref, (x: any) => { x.material = v; }))),
      tint || ent.material === 'tecido' || ent.material === 'couro'
        ? h('div', { class: 'prop' }, h('label', {}, 'Cor'), this.swatches(ent.color, (v) => this.apply(ref, (x: any) => { x.color = v; })))
        : h('div', { class: 'prop muted' }, 'Este material usa a cor natural.'),
    ];
  }

  private apply(ref: EntityRef, fn: (x: any) => void) {
    this.e.commit('Propriedade', () => { const ent = this.e.find(ref); if (ent) fn(ent); });
    this.renderProps(this.e.selection);
  }

  private actions(...btns: (HTMLElement | null)[]) {
    return h('div', { class: 'actions' }, ...btns);
  }

  private act(icon: string, label: string, fn: () => void, cls = '') {
    return h('button', { class: `act ${cls}`, onclick: fn }, h('span', { html: icon }), label);
  }

  renderProps(ref: EntityRef | null) {
    const p = this.props;
    p.innerHTML = '';
    if (!ref) { p.classList.add('hidden'); return; }
    const ent = this.e.find(ref);
    if (!ent) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden');
    this.catalog.classList.add('hidden');
    const e = this.e;
    const del = this.act(ICONS.trash, 'Excluir', () => e.deleteSelection(), 'danger');
    const dup = this.act(ICONS.copy, 'Duplicar', () => e.duplicateSelection());
    const body: (HTMLElement | null)[] = [];
    let title = '';
    let price = 0;

    switch (ref.kind) {
      case 'wall': {
        const w = ent as Wall;
        title = w.kind === 'meia' ? 'Meia parede' : w.kind === 'divisoria' ? 'Divisória' : w.bulge ? 'Parede curva' : 'Parede';
        price = wallCost(w);
        const chord = dist(w.a, w.b);
        body.push(
          h('div', { class: 'prop info' }, `Comprimento ${fmtM(wallLength(w))} · arraste as alças amarelas para editar as pontas`),
          this.slider('Altura', 0.3, 6, 0.05, w.height, fmtM, (v) => this.live<Wall>(ref, (x) => {
            x.height = v;
            e.project.openings = e.project.openings.filter((o) => o.wallId !== x.id || o.sill + o.height <= v - 0.02);
          })),
          this.slider('Espessura', 0.05, 0.4, 0.01, w.thickness, fmtM, (v) => this.live<Wall>(ref, (x) => { x.thickness = v; })),
          this.slider('Curvatura', -50, 50, 1, Math.round((w.bulge / Math.max(chord, 0.01)) * 100), (v) => `${v}%`, (v) => this.live<Wall>(ref, (x) => { x.bulge = (v / 100) * dist(x.a, x.b); })),
          ...this.matProp(ref, 'parede', w),
        );
        body.push(this.actions(dup, del));
        break;
      }
      case 'opening': {
        const o = ent as Opening;
        const wall = e.project.walls.find((w) => w.id === o.wallId)!;
        title = PRESET_BY_KIND.get(o.kind)?.name ?? 'Abertura';
        price = openingCost(o);
        const guard = (fn: (x: Opening, v: number) => void) => (v: number) => this.live<Opening>(ref, (x) => {
          const before = { ...x };
          fn(x, v);
          if (!openingFits(e.project, wall, x)) Object.assign(x, before);
        });
        body.push(
          this.segProp('Modelo', o.kind, OPENING_PRESETS.map((x) => ({ v: x.kind, label: x.name })), (v) => this.apply(ref, (x: Opening) => {
            const pr = PRESET_BY_KIND.get(v as OpeningKind)!;
            const next = { ...x, kind: v as OpeningKind, width: pr.width, height: Math.min(pr.height, wall.height - pr.sill - 0.05), sill: pr.sill };
            if (openingFits(e.project, wall, next)) Object.assign(x, next);
            else this.cb.toast('O novo modelo não cabe nesta posição.');
          })),
          this.slider('Largura', 0.4, 6, 0.05, o.width, fmtM, guard((x, v) => { x.width = v; })),
          this.slider('Altura', 0.3, wall.height, 0.05, o.height, fmtM, guard((x, v) => { x.height = v; })),
          this.slider('Peitoril', 0, Math.max(0, wall.height - 0.4), 0.05, o.sill, fmtM, guard((x, v) => { x.sill = v; })),
          o.kind.startsWith('porta') ? h('div', { class: 'prop' }, h('button', { class: 'chip', onclick: () => this.apply(ref, (x: Opening) => { x.flip = !x.flip; }) }, '⇄ Inverter abertura')) : null,
          h('div', { class: 'prop' }, h('label', {}, 'Cor da esquadria'), this.swatches(o.color, (v) => this.apply(ref, (x: Opening) => { x.color = v; }))),
          this.actions(dup, del),
        );
        break;
      }
      case 'floor': {
        const f = ent as Floor;
        title = f.elevation >= 0.3 ? 'Plataforma' : 'Piso';
        price = floorCost(f);
        body.push(
          h('div', { class: 'prop info' }, `Área ${fmtM2(Math.abs(polygonArea(f.points)))}`),
          this.slider('Elevação', 0, 3, 0.05, f.elevation, fmtM, (v) => this.live<Floor>(ref, (x) => { x.elevation = v; })),
          this.slider('Espessura', 0.03, 1.5, 0.01, f.thickness, fmtM, (v) => this.live<Floor>(ref, (x) => { x.thickness = v; })),
          ...this.matProp(ref, 'piso', f),
          h('div', { class: 'prop' }, h('label', {}, 'Cômodo (piso + paredes + objetos)'),
            h('div', { class: 'seg wrap' },
              h('button', { onclick: () => { const t = new SelectTool(e); t.moveRoomId = f.id; e.setTool(t); this.cb.toast('Arraste na tela para mover o cômodo'); } }, '✥ Mover'),
              h('button', { onclick: () => e.duplicateSelection() }, '⧉ Copiar'),
              h('button', { onclick: () => e.resizeRoom(f.id, 0.5, 0) }, 'Largura +'),
              h('button', { onclick: () => e.resizeRoom(f.id, -0.5, 0) }, 'Largura −'),
              h('button', { onclick: () => e.resizeRoom(f.id, 0, 0.5) }, 'Profund. +'),
              h('button', { onclick: () => e.resizeRoom(f.id, 0, -0.5) }, 'Profund. −'),
            )),
          this.actions(del),
        );
        break;
      }
      case 'stair': {
        const s = ent as Stair;
        title = 'Escada';
        price = stairCost(s);
        body.push(
          this.segProp('Formato', s.kind, [{ v: 'reta', label: 'Reta' }, { v: 'L', label: 'Em L' }, { v: 'U', label: 'Em U' }, { v: 'espiral', label: 'Espiral' }, { v: 'curva', label: 'Curva' }], (v) => this.apply(ref, (x: Stair) => { x.kind = v as StairKind; })),
          this.slider('Largura', 0.7, 1.6, 0.05, s.width, fmtM, (v) => this.live<Stair>(ref, (x) => { x.width = v; })),
          this.slider('Rotação', 0, 345, 15, Math.round((s.rot * 180) / Math.PI), (v) => `${v}°`, (v) => this.live<Stair>(ref, (x) => { x.rot = (v * Math.PI) / 180; })),
          ...this.matProp(ref, 'movel', s),
          this.actions(dup, del),
        );
        break;
      }
      case 'roof': {
        const r = ent as Roof;
        title = 'Telhado';
        price = roofCost(r);
        body.push(
          this.segProp('Tipo', r.kind, [{ v: 'duas_aguas', label: 'Duas águas' }, { v: 'quatro_aguas', label: 'Quatro águas' }, { v: 'uma_agua', label: 'Uma água' }, { v: 'plano', label: 'Laje plana' }, { v: 'curvo', label: 'Curvo' }],
            (v) => this.apply(ref, (x: Roof) => { x.kind = v as RoofKind; if (v !== 'plano' && x.pitch < 0.1) x.pitch = 0.45; })),
          this.slider('Inclinação', 0, 1.2, 0.05, r.pitch, (v) => `${Math.round((Math.atan(v) * 180) / Math.PI)}°`, (v) => this.live<Roof>(ref, (x) => { x.pitch = v; })),
          this.slider('Largura', 1, e.project.lot.w + 2, 0.25, r.w, fmtM, (v) => this.live<Roof>(ref, (x) => { x.w = v; })),
          this.slider('Profundidade', 1, e.project.lot.d + 2, 0.25, r.d, fmtM, (v) => this.live<Roof>(ref, (x) => { x.d = v; })),
          this.slider('Beiral', 0, 1.5, 0.05, r.overhang, fmtM, (v) => this.live<Roof>(ref, (x) => { x.overhang = v; })),
          this.slider('Rotação', 0, 345, 15, Math.round((r.rot * 180) / Math.PI), (v) => `${v}°`, (v) => this.live<Roof>(ref, (x) => { x.rot = (v * Math.PI) / 180; })),
          ...this.matProp(ref, 'telhado', r),
          this.actions(dup, del),
        );
        break;
      }
      case 'item': {
        const it = ent as Item;
        const def = CATALOG_BY_ID.get(it.catalogId)!;
        title = def.name;
        price = itemCost(it);
        const deg = Math.round((((it.rot * 180) / Math.PI) % 360 + 360) % 360);
        body.push(
          h('div', { class: 'prop info' }, `${(def.w * it.scale).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} × ${(def.d * it.scale).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} × ${(def.h * it.scale).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m${def.affords.length ? ` · funções: ${def.affords.join(', ').replace(/_/g, ' ')}` : ''}`),
          h('div', { class: 'prop' }, h('label', {}, 'Girar'), h('div', { class: 'seg' },
            h('button', { onclick: () => this.apply(ref, (x: Item) => { x.rot -= Math.PI / 4; }) }, '⟲ 45°'),
            h('button', { onclick: () => this.apply(ref, (x: Item) => { x.rot -= Math.PI / 12; }) }, '⟲ 15°'),
            h('button', { onclick: () => this.apply(ref, (x: Item) => { x.rot += Math.PI / 12; }) }, '15° ⟳'),
            h('button', { onclick: () => this.apply(ref, (x: Item) => { x.rot += Math.PI / 4; }) }, '45° ⟳'))),
          this.slider('Rotação livre', 0, 359, 1, deg, (v) => `${v}°`, (v) => this.live<Item>(ref, (x) => { x.rot = (v * Math.PI) / 180; })),
          this.slider('Altura do chão', 0, e.project.levelHeight - 0.05, 0.01, it.elev, fmtM, (v) => this.live<Item>(ref, (x) => { x.elev = v; })),
          this.slider('Tamanho', 0.5, 2, 0.05, it.scale, (v) => `${Math.round(v * 100)}%`, (v) => this.live<Item>(ref, (x) => { x.scale = v; })),
          ...this.matProp(ref, 'movel', it),
          this.actions(dup, del),
        );
        break;
      }
    }
    p.append(
      h('div', { class: 'props-head' }, h('div', {}, h('b', {}, title), h('small', {}, fmtMoney(Math.round(price)))), iconBtn(ICONS.close, 'Fechar', () => e.select(null))),
      h('div', { class: 'props-body' }, ...body),
    );
  }

}
