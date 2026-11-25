type Attrs = Record<string, any>;

/** Criação declarativa de elementos DOM. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && typeof v !== 'string') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(c));
  }
  return el;
}

export function iconBtn(icon: string, title: string, onClick: () => void, cls = ''): HTMLButtonElement {
  return h('button', { class: `icon-btn ${cls}`, title, 'aria-label': title, html: icon, onclick: onClick });
}

export function toastFactory(root: HTMLElement) {
  const box = h('div', { class: 'toasts' });
  root.append(box);
  return (msg: string, ms = 2600) => {
    const t = h('div', { class: 'toast' }, msg);
    box.append(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
  };
}

export function modal(title: string, body: HTMLElement, opts: { onClose?: () => void; wide?: boolean; closable?: boolean } = {}) {
  const close = () => { wrap.classList.remove('show'); setTimeout(() => wrap.remove(), 200); opts.onClose?.(); };
  const wrap = h('div', { class: 'modal-wrap' },
    h('div', { class: `modal ${opts.wide ? 'wide' : ''}` },
      h('div', { class: 'modal-head' }, h('h2', {}, title), opts.closable === false ? null : h('button', { class: 'icon-btn', title: 'Fechar', 'aria-label': 'Fechar', html: '✕', onclick: close })),
      h('div', { class: 'modal-body' }, body),
    ),
  );
  if (opts.closable !== false) wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(); });
  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  return { close, el: wrap };
}

export function downloadText(name: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function pickFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: { display: 'none' } });
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      resolve(f ? await f.text() : null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}
