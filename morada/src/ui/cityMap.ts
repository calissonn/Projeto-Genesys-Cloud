import { h } from './dom';
import type { Simulation } from '../sim/simulation';
import type { CityLot } from '../model/city';
import { VENUES, lotIcon } from '../model/city';
import { fmtMoney } from '../model/project';
import { fullName } from '../model/life';

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag: string, attrs: Record<string, string | number>) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

export interface MapCallbacks {
  /** Após viajar: o app decide o modo (vida/construção). */
  onTravel(lot: CityLot): void;
  toast(msg: string): void;
}

/** Mapa da cidade com bairros, imóveis e estabelecimentos. */
export function openCityMap(sim: Simulation, cb: MapCallbacks) {
  const W = sim.world;
  const city = W.city;
  let selected: CityLot | null = W.current;
  const card = h('div', { class: 'map-card' });
  const svg = svgEl('svg', { class: 'map-svg' }) as SVGSVGElement;
  const close = () => root.remove();
  const headerInfo = h('span', { class: 'muted small' });
  const root = h('div', { class: 'citymap' },
    h('div', { class: 'map-head' },
      h('div', {}, h('b', {}, `🗺 ${city.name}`), ' ', headerInfo),
      h('div', { class: 'map-tools' },
        h('button', { class: 'chip', onclick: () => zoom(0.75) }, '＋'),
        h('button', { class: 'chip', onclick: () => zoom(1.33) }, '－'),
        h('button', { class: 'chip', onclick: () => { W.expand(); draw(); fit(); } }, '🏗 Abrir novo bairro'),
        h('button', { class: 'icon-btn', 'aria-label': 'Fechar mapa', title: 'Fechar mapa', onclick: close }, '✕'),
      ),
    ),
    h('div', { class: 'map-main' }, h('div', { class: 'map-view' }, svg), card),
  );
  document.body.append(root);

  // ------------------------------------------------ Vista (pan/zoom)
  let vb = { x: 0, y: 0, w: 800, h: 600 };
  const apply = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const bounds = () => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const hd of city.hoods) { x0 = Math.min(x0, hd.x); y0 = Math.min(y0, hd.y); x1 = Math.max(x1, hd.x + hd.w); y1 = Math.max(y1, hd.y + hd.h); }
    return { x0: x0 - 20, y0: y0 - 20, x1: x1 + 20, y1: y1 + 20 };
  };
  const fit = () => {
    const b = bounds();
    const r = svg.getBoundingClientRect();
    const aspect = (r.width || 800) / (r.height || 600);
    let w = b.x1 - b.x0, hh = b.y1 - b.y0;
    if (w / hh > aspect) hh = w / aspect; else w = hh * aspect;
    vb = { x: (b.x0 + b.x1) / 2 - w / 2, y: (b.y0 + b.y1) / 2 - hh / 2, w, h: hh };
    apply();
  };
  function zoom(f: number, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) {
    const nw = Math.max(60, Math.min(4000, vb.w * f));
    const k = nw / vb.w;
    vb = { x: cx - (cx - vb.x) * k, y: cy - (cy - vb.y) * k, w: nw, h: vb.h * k };
    apply();
  }
  const toWorld = (clientX: number, clientY: number) => {
    const r = svg.getBoundingClientRect();
    return { x: vb.x + ((clientX - r.left) / r.width) * vb.w, y: vb.y + ((clientY - r.top) / r.height) * vb.h };
  };
  const pts = new Map<number, { x: number; y: number }>();
  let moved = 0;
  let pinch = 0;
  svg.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; try { svg.setPointerCapture(e.pointerId); } catch { /* */ } if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
  svg.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved += Math.abs(dx) + Math.abs(dy);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) { const c = toWorld((a.x + b.x) / 2, (a.y + b.y) / 2); zoom(pinch / d, c.x, c.y); }
      pinch = d;
      return;
    }
    const r = svg.getBoundingClientRect();
    vb.x -= (dx / r.width) * vb.w;
    vb.y -= (dy / r.height) * vb.h;
    apply();
  });
  const up = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = 0;
    if (moved < 6 && pts.size === 0) {
      const w = toWorld(e.clientX, e.clientY);
      const l = city.lots.find((x) => Math.abs(w.x - x.x) <= x.w / 2 && Math.abs(w.y - x.y) <= x.d / 2);
      if (l) { selected = l; draw(); }
    }
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', (e) => pts.delete(e.pointerId));
  svg.addEventListener('wheel', (e) => { e.preventDefault(); const c = toWorld(e.clientX, e.clientY); zoom(Math.exp(e.deltaY * 0.0015), c.x, c.y); }, { passive: false });

  // ------------------------------------------------ Desenho
  function draw() {
    svg.innerHTML = '';
    const b = bounds();
    svg.append(svgEl('rect', { x: b.x0 - 2000, y: b.y0 - 2000, width: b.x1 - b.x0 + 4000, height: b.y1 - b.y0 + 4000, fill: '#5d6b5a' }));
    for (const hd of city.hoods) {
      svg.append(svgEl('rect', { x: hd.x, y: hd.y, width: hd.w, height: hd.h, rx: 10, fill: hd.color, opacity: 0.9 }));
      const t = svgEl('text', { x: hd.x + 10, y: hd.y - 5, 'font-size': 13, fill: '#f6f2ea', 'font-weight': 700 });
      t.textContent = hd.name;
      svg.append(t);
    }
    for (const l of city.lots) {
      const g = svgEl('g', {});
      const fill = l.owner === 'jogador' ? '#ffd98a' : l.owner === 'vazio' ? '#d7e5c3' : l.owner === 'venda' ? '#f6f2ea' : l.kind === 'parque' || l.kind === 'praca' ? '#8fb07a' : l.kind !== 'residencial' ? '#ffffff' : '#ece6dc';
      g.append(svgEl('rect', {
        x: l.x - l.w / 2, y: l.y - l.d / 2, width: l.w, height: l.d, rx: 2, fill,
        stroke: l === selected ? '#f2b544' : l.owner === 'venda' || l.owner === 'vazio' ? '#4fd18b' : '#7d7a74',
        'stroke-width': l === selected ? 2.5 : l.owner === 'venda' || l.owner === 'vazio' ? 1.2 : 0.6,
        'stroke-dasharray': l.owner === 'vazio' ? '3 2' : '',
      }));
      const ic = svgEl('text', { x: l.x, y: l.y + Math.min(l.w, l.d) * 0.16, 'font-size': Math.min(l.w, l.d) * 0.48, 'text-anchor': 'middle' });
      ic.textContent = lotIcon(l);
      g.append(ic);
      if (l.id === city.currentLotId) {
        const pin = svgEl('text', { x: l.x + l.w / 2 - 3, y: l.y - l.d / 2 + 9, 'font-size': 12, 'text-anchor': 'middle' });
        pin.textContent = '📍';
        g.append(pin);
      }
      svg.append(g);
    }
    headerInfo.textContent = `· você está em ${W.current.kind === 'residencial' ? W.current.title : W.current.title} (${W.hoodName(W.current)})`;
    renderCard();
  }

  function renderCard() {
    card.innerHTML = '';
    const l = selected;
    if (!l) {
      card.append(h('p', { class: 'muted' }, 'Toque em um terreno ou estabelecimento.'));
      return;
    }
    const isVenue = l.kind !== 'residencial';
    const p = sim.editor.project;
    const here = l.id === city.currentLotId;
    const actions: HTMLElement[] = [];
    const go = (label: string) => h('button', {
      class: 'chip primary', disabled: here,
      onclick: () => { if (W.travel(l.id)) { close(); cb.onTravel(l); } },
    }, here ? 'Você está aqui' : label);
    const lines: (HTMLElement | string)[] = [];
    lines.push(h('small', { class: 'muted' }, `${l.address} · ${W.hoodName(l)} · ${l.w} × ${l.d} m`));
    if (isVenue) {
      const v = VENUES[l.kind as keyof typeof VENUES];
      lines.push(h('p', {}, v.desc));
      if (l.careers?.length) lines.push(h('p', { class: 'small muted' }, `Local de trabalho: ${l.careers.join(', ')}`));
      actions.push(go(`Ir para ${v.name.toLowerCase()}`));
    } else if (l.owner === 'jogador') {
      const home = l.id === city.homeLotId;
      lines.push(h('p', {}, home ? '⭐ Sua residência' : '🔑 Imóvel seu'));
      lines.push(h('p', { class: 'small' }, `Valor de mercado: ${fmtMoney(W.saleValue(l) / 0.9)}`));
      actions.push(go(home ? 'Ir para casa' : 'Ir para lá (construir ou visitar)'));
      if (!home) {
        actions.push(h('button', { class: 'chip', onclick: () => { if (confirm('Mudar a família para este imóvel?')) { if (W.moveHome(l.id)) { close(); cb.onTravel(l); } else draw(); } } }, '🏡 Mudar-se para cá'));
        actions.push(h('button', { class: 'chip danger', disabled: here, onclick: () => { if (confirm(`Vender por ${fmtMoney(W.saleValue(l))}?`)) { W.sell(l.id); draw(); } } }, `Vender (${fmtMoney(W.saleValue(l))})`));
      }
    } else if (l.owner === 'npc') {
      const names = (l.residents ?? []).map((id) => city.townies.find((t) => t.id === id)).filter(Boolean).map((t) => fullName(t!));
      lines.push(h('p', {}, `Moradores: ${names.join(', ') || '—'}`));
      actions.push(go('Visitar a família'));
    } else {
      const price = W.askingPrice(l);
      lines.push(h('p', {}, l.owner === 'vazio' ? '🏷 Terreno vazio à venda' : '🏡 Casa mobiliada à venda'));
      lines.push(h('p', { class: 'price-big' }, fmtMoney(price)));
      if (p.mode === 'criativo') lines.push(h('p', { class: 'small muted' }, 'Modo Criativo: compra sem custo.'));
      if (l.owner === 'venda') actions.push(go('Visitar a casa'));
      actions.push(h('button', { class: 'chip primary', onclick: () => { if (W.buy(l.id)) { cb.toast('Imóvel comprado! Vá até ele para construir ou decorar.'); draw(); } } }, l.owner === 'vazio' ? 'Comprar terreno' : 'Comprar casa'));
    }
    card.append(
      h('div', { class: 'map-card-title' }, h('span', { class: 'ic' }, lotIcon(l)), h('b', {}, l.title)),
      ...lines,
      h('div', { class: 'map-actions' }, ...actions),
      h('hr'),
      h('div', { class: 'legend small muted' }, '⭐ sua casa · 🔑 seus imóveis · 🏠 família da cidade · 🏡 casa à venda · 🏷 terreno à venda · 📍 você está aqui'),
    );
  }

  draw();
  requestAnimationFrame(() => {
    fit();
    // Começa aproximado no lugar atual.
    const cur = W.current;
    vb = { x: cur.x - 220, y: cur.y - 150, w: 440, h: 300 };
    const r = svg.getBoundingClientRect();
    if (r.width) { vb.h = vb.w * (r.height / r.width); vb.y = cur.y - vb.h / 2; }
    apply();
  });
}
