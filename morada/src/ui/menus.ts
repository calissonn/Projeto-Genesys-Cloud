import { h, modal, downloadText, pickFile } from './dom';
import type { Editor } from '../editor/editor';
import { storage } from '../core/storage';
import {
  LOT_PRESETS, customLot, createProject, fmtMoney, START_FUNDS, serializeProject, deserializeProject, uid, computeCost,
} from '../model/project';
import type { GameMode, LotInfo, Project } from '../model/types';
import { sampleHouse } from '../model/sample';
import type { GraphicsSettings } from '../render/engine';

export interface AppApi {
  editor: Editor;
  startGame(p: Project): void;
  showStart(): void;
  toast(msg: string): void;
  settings: GraphicsSettings & { gridStep: number };
  applySettings(s: Partial<GraphicsSettings & { gridStep: number }>): void;
  installPrompt: (() => Promise<void>) | null;
}

const fmtDate = (t: number) => new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Tela inicial. */
export function startScreen(app: AppApi): HTMLElement {
  const last = storage.lastGameId();
  const el = h('div', { class: 'start' },
    h('div', { class: 'start-card' },
      h('div', { class: 'logo' }, h('span', { class: 'mark' }, '⌂'), h('div', {}, h('h1', {}, 'Morada'), h('p', {}, 'Construa, decore e viva'))),
      h('div', { class: 'start-buttons' },
        last ? h('button', { class: 'big primary', onclick: () => { const p = storage.loadGame(last); if (p) app.startGame(p); } }, '▶ Continuar') : null,
        h('button', { class: `big ${last ? '' : 'primary'}`, onclick: () => newGameDialog(app) }, '＋ Novo jogo'),
        h('button', { class: 'big', onclick: () => loadDialog(app) }, '📂 Carregar jogo'),
        h('button', { class: 'big', onclick: () => settingsDialog(app) }, '⚙ Configurações'),
        app.installPrompt ? h('button', { class: 'big', onclick: () => app.installPrompt?.() }, '⬇ Instalar aplicativo') : null,
      ),
      h('p', { class: 'muted small' }, 'Versão 0.2 · Construção, decoração e simulação de vida. Funciona offline após o primeiro acesso.'),
    ),
  );
  return el;
}

export function newGameDialog(app: AppApi) {
  let mode: GameMode = 'criativo';
  let lot: LotInfo = LOT_PRESETS[1];
  let withSample = false;
  const name = h('input', { type: 'text', value: 'Minha casa', maxlength: 40 }) as HTMLInputElement;
  const cw = h('input', { type: 'number', min: 8, max: 80, value: 25 }) as HTMLInputElement;
  const cd = h('input', { type: 'number', min: 8, max: 80, value: 35 }) as HTMLInputElement;
  const summary = h('div', { class: 'summary' });
  const modes = h('div', { class: 'cards' });
  const lots = h('div', { class: 'cards lots' });

  const render = () => {
    modes.innerHTML = '';
    for (const [m, t, d] of [
      ['criativo', 'Modo Criativo', 'Dinheiro ilimitado e todos os objetos liberados.'],
      ['simulacao', 'Modo Simulação', `Capital inicial de ${fmtMoney(START_FUNDS)}. O terreno e cada obra são descontados do saldo.`],
    ] as const) {
      modes.append(h('button', { class: `card ${mode === m ? 'on' : ''}`, onclick: () => { mode = m; render(); } }, h('b', {}, t), h('small', {}, d)));
    }
    lots.innerHTML = '';
    for (const l of LOT_PRESETS) {
      lots.append(h('button', { class: `card ${lot.id === l.id ? 'on' : ''}`, onclick: () => { lot = l; render(); } },
        h('b', {}, `${l.name}`), h('span', {}, `${l.w} × ${l.d} m`), h('small', {}, l.neighborhood), h('span', { class: 'price' }, fmtMoney(l.price))));
    }
    const c = customLot(Number(cw.value), Number(cd.value));
    lots.append(h('div', { class: `card custom ${lot.id === 'personalizado' ? 'on' : ''}`, onclick: (ev: Event) => { if ((ev.target as HTMLElement).tagName !== 'INPUT') { lot = customLot(Number(cw.value), Number(cd.value)); render(); } } },
      h('b', {}, 'Personalizado'), h('span', { class: 'dims' }, cw, '×', cd, 'm'), h('small', {}, c.neighborhood), h('span', { class: 'price' }, fmtMoney(c.price))));
    const sampleLot = LOT_PRESETS[1];
    const funds = mode === 'criativo' ? '∞' : fmtMoney(START_FUNDS - (withSample ? sampleLot.price : lot.price));
    summary.innerHTML = '';
    summary.append(
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: withSample, onchange: (ev: Event) => { withSample = (ev.target as HTMLInputElement).checked; render(); } }), ' Começar com o sobrado modelo (terreno médio)'),
      h('p', {}, `Saldo após a compra do terreno: ${funds}`),
    );
  };
  const onDims = () => { if (lot.id === 'personalizado') lot = customLot(Number(cw.value), Number(cd.value)); render(); };
  cw.addEventListener('change', onDims);
  cd.addEventListener('change', onDims);
  render();

  const body = h('div', { class: 'newgame' },
    h('div', { class: 'field' }, h('label', {}, 'Nome da família / projeto'), name),
    h('h3', {}, 'Modo de jogo'), modes,
    h('h3', {}, 'Terreno'), lots,
    summary,
    h('div', { class: 'row-end' }, h('button', {
      class: 'big primary',
      onclick: () => {
        let p: Project;
        if (withSample) {
          p = sampleHouse(mode);
          p.name = name.value.trim() || 'Minha casa';
          if (mode === 'simulacao' && computeCost(p).total > p.funds) {
            app.toast('A casa modelo custa mais que o capital disponível no Modo Simulação. Comece sem ela ou use o Modo Criativo.');
            return;
          }
        } else p = createProject(name.value.trim() || 'Minha casa', mode, lot);
        dlg.close();
        app.startGame(p);
      },
    }, 'Comprar terreno e começar')),
  );
  const dlg = modal('Novo jogo', body, { wide: true });
}

export function loadDialog(app: AppApi) {
  const list = h('div', { class: 'list' });
  const render = () => {
    list.innerHTML = '';
    const saves = storage.listGames();
    if (!saves.length) list.append(h('p', { class: 'muted' }, 'Nenhum jogo salvo ainda.'));
    for (const s of saves) {
      list.append(h('div', { class: 'list-item' },
        h('div', {}, h('b', {}, s.name), h('small', {}, `${s.mode === 'criativo' ? 'Criativo' : 'Simulação'} · terreno ${s.lot} · ${fmtDate(s.updatedAt)}`)),
        h('div', { class: 'list-actions' },
          h('button', { class: 'chip primary', onclick: () => { const p = storage.loadGame(s.id); if (p) { dlg.close(); app.startGame(p); } } }, 'Abrir'),
          h('button', { class: 'chip', onclick: () => { const p = storage.loadGame(s.id); if (p) downloadText(`${s.name}.morada.json`, serializeProject(p)); } }, 'Exportar'),
          h('button', { class: 'chip danger', onclick: () => { if (confirm(`Excluir "${s.name}"?`)) { storage.deleteGame(s.id); render(); } } }, 'Excluir'),
        )));
    }
  };
  render();
  const body = h('div', {}, list, h('div', { class: 'row-end' }, h('button', {
    class: 'chip',
    onclick: async () => {
      const txt = await pickFile('.json,application/json');
      if (!txt) return;
      try {
        const p = deserializeProject(txt);
        p.id = uid('p');
        storage.saveGame(p);
        dlg.close();
        app.startGame(p);
        app.toast(`Jogo "${p.name}" importado.`);
      } catch (err) {
        app.toast(`Falha ao importar: ${(err as Error).message}`);
      }
    },
  }, 'Importar arquivo (.json)')));
  const dlg = modal('Carregar jogo', body, { wide: true });
}

/** Projetos de casas: salvar a construção atual como modelo e aplicá-la em outro terreno. */
export function blueprintsDialog(app: AppApi) {
  const e = app.editor;
  const list = h('div', { class: 'list' });
  const nameInput = h('input', { type: 'text', value: `${e.project.name} — projeto`, maxlength: 40 }) as HTMLInputElement;
  const apply = (bp: Project) => {
    const fits = [...bp.walls.flatMap((w) => [w.a, w.b]), ...bp.floors.flatMap((f) => f.points), ...bp.items.map((i) => i.pos)]
      .every((pt) => Math.abs(pt.x) <= e.project.lot.w / 2 + 1e-6 && Math.abs(pt.y) <= e.project.lot.d / 2 + 1e-6);
    if (!fits) { app.toast(`O projeto não cabe neste terreno (${e.project.lot.w} × ${e.project.lot.d} m).`); return; }
    if (!confirm('Substituir a construção atual por este projeto? Você poderá desfazer.')) return;
    e.select(null);
    const ok = e.commit('Aplicar projeto', (p) => {
      p.walls = bp.walls; p.openings = bp.openings; p.floors = bp.floors; p.stairs = bp.stairs; p.roofs = bp.roofs; p.items = bp.items;
      p.levels = bp.levels;
    });
    if (ok) { dlg.close(); app.toast('Projeto aplicado.'); }
  };
  const render = () => {
    list.innerHTML = '';
    const bps = storage.listBlueprints();
    if (!bps.length) list.append(h('p', { class: 'muted' }, 'Nenhum projeto salvo. Salve a construção atual para reutilizá-la em outros terrenos.'));
    for (const b of bps) {
      list.append(h('div', { class: 'list-item' },
        h('div', {}, h('b', {}, b.name), h('small', {}, `terreno de origem ${b.lot} · ${fmtDate(b.updatedAt)}`)),
        h('div', { class: 'list-actions' },
          h('button', { class: 'chip primary', onclick: () => { const bp = storage.loadBlueprint(b.id); if (bp) apply(bp); } }, 'Aplicar aqui'),
          h('button', { class: 'chip', onclick: () => { const bp = storage.loadBlueprint(b.id); if (bp) downloadText(`${b.name}.morada.json`, serializeProject(bp)); } }, 'Exportar'),
          h('button', { class: 'chip danger', onclick: () => { if (confirm(`Excluir o projeto "${b.name}"?`)) { storage.deleteBlueprint(b.id); render(); } } }, 'Excluir'),
        )));
    }
  };
  render();
  const body = h('div', {},
    h('div', { class: 'field inline' }, nameInput, h('button', {
      class: 'chip primary',
      onclick: () => { storage.saveBlueprint(e.project, nameInput.value.trim() || 'Projeto'); render(); app.toast('Projeto salvo na biblioteca.'); },
    }, 'Salvar construção atual')),
    h('h3', {}, 'Biblioteca de projetos'), list,
    h('div', { class: 'row-end' },
      h('button', {
        class: 'chip',
        onclick: async () => {
          const txt = await pickFile('.json,application/json');
          if (!txt) return;
          try {
            const bp = deserializeProject(txt);
            storage.saveBlueprint(bp, bp.name);
            render();
            app.toast(`Projeto "${bp.name}" importado para a biblioteca.`);
          } catch (err) { app.toast(`Falha ao importar: ${(err as Error).message}`); }
        },
      }, 'Importar projeto (.json)'),
      h('button', { class: 'chip', onclick: () => downloadText(`${e.project.name}.morada.json`, serializeProject(e.project)) }, 'Exportar construção atual'),
    ),
  );
  const dlg = modal('Projetos de casas', body, { wide: true });
}

export function gameMenu(app: AppApi) {
  const e = app.editor;
  const body = h('div', { class: 'menu-list' },
    h('button', { class: 'big', onclick: () => dlg.close() }, '▶ Continuar'),
    h('button', { class: 'big', onclick: () => { e.saveNow(); app.toast('Jogo salvo.'); dlg.close(); } }, '💾 Salvar agora'),
    h('button', { class: 'big', onclick: () => { dlg.close(); blueprintsDialog(app); } }, '📐 Projetos de casas'),
    h('button', { class: 'big', onclick: () => { dlg.close(); newGameDialog(app); } }, '＋ Novo jogo'),
    h('button', { class: 'big', onclick: () => { dlg.close(); loadDialog(app); } }, '📂 Carregar jogo'),
    h('button', { class: 'big', onclick: () => { dlg.close(); settingsDialog(app); } }, '⚙ Configurações'),
    h('button', { class: 'big', onclick: () => { e.saveNow(); dlg.close(); app.showStart(); } }, '⏏ Menu inicial'),
  );
  const dlg = modal('Menu', body);
}

export function settingsDialog(app: AppApi) {
  const s = app.settings;
  const seg = (label: string, value: string, options: [string, string][], set: (v: string) => void) => {
    const wrap = h('div', { class: 'seg' });
    const draw = (v: string) => {
      wrap.innerHTML = '';
      for (const [k, n] of options) wrap.append(h('button', { class: k === v ? 'on' : '', onclick: () => { set(k); draw(k); } }, n));
    };
    draw(value);
    return h('div', { class: 'field' }, h('label', {}, label), wrap);
  };
  const hourVal = h('span', { class: 'val' }, `${Math.floor(s.hour)}h${String(Math.round((s.hour % 1) * 60)).padStart(2, '0')}`);
  const hour = h('input', { type: 'range', min: 5, max: 21, step: 0.25, value: String(s.hour) }) as HTMLInputElement;
  hour.addEventListener('input', () => {
    const v = Number(hour.value);
    hourVal.textContent = `${Math.floor(v)}h${String(Math.round((v % 1) * 60)).padStart(2, '0')}`;
    app.applySettings({ hour: v });
  });
  const body = h('div', { class: 'settings' },
    seg('Qualidade gráfica', s.quality, [['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta']], (v) => { app.applySettings({ quality: v as any }); app.toast('Texturas e suavização de bordas mudam ao reabrir o app.'); }),
    seg('Sombras dinâmicas', s.shadows ? 'on' : 'off', [['on', 'Ligadas'], ['off', 'Desligadas']], (v) => app.applySettings({ shadows: v === 'on' })),
    h('div', { class: 'field' }, h('label', {}, 'Hora do dia (iluminação)'), h('div', { class: 'ctl' }, hour, hourVal)),
    seg('Grade visível', s.showGrid ? 'on' : 'off', [['on', 'Sim'], ['off', 'Não']], (v) => app.applySettings({ showGrid: v === 'on' })),
    seg('Passo da grade', String(s.gridStep), [['0.1', '10 cm'], ['0.25', '25 cm'], ['0.5', '50 cm'], ['1', '1 m']], (v) => app.applySettings({ gridStep: Number(v) })),
    h('p', { class: 'muted small' }, 'Dica: qualidade Baixa e sombras desligadas aumentam o desempenho em celulares mais simples.'),
  );
  modal('Configurações', body);
}

export { sampleHouse };
