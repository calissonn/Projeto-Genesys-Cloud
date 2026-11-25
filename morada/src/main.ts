import './styles.css';
import { Engine, type GraphicsSettings } from './render/engine';
import { Editor } from './editor/editor';
import { Hud } from './ui/hud';
import { LifeHud } from './ui/lifeHud';
import { Simulation } from './sim/simulation';
import { SelectTool } from './editor/tools';
import { h, toastFactory } from './ui/dom';
import { startScreen, gameMenu, settingsDialog, type AppApi } from './ui/menus';
import { storage } from './core/storage';
import { sampleHouse } from './model/sample';
import type { Project } from './model/types';

type Settings = GraphicsSettings & { gridStep: number };

const isMobile = matchMedia('(pointer: coarse)').matches;
const settings: Settings = storage.loadSettings<Settings>({
  quality: isMobile ? 'media' : 'alta',
  shadows: true,
  hour: 10.5,
  showGrid: true,
  gridStep: 0.25,
});

const root = document.getElementById('app')!;
const canvas = h('canvas', { class: 'view' });
root.append(canvas);
const toast = toastFactory(document.body);

let engine: Engine;
try {
  engine = new Engine(canvas, settings);
} catch (err) {
  root.innerHTML = '';
  root.append(h('div', { class: 'fatal' }, h('h1', {}, 'Morada'), h('p', {}, 'Seu navegador não oferece suporte a WebGL, necessário para os gráficos 3D.'), h('small', {}, String(err))));
  throw err;
}

// Projeto inicial: último jogo salvo ou o sobrado de exemplo como cenário do menu.
let initial: Project;
try {
  const last = storage.lastGameId();
  initial = (last && storage.loadGame(last)) || sampleHouse();
} catch {
  initial = sampleHouse();
}
const editor = new Editor(engine, initial);
editor.snap.step = settings.gridStep;

const sim = new Simulation(editor);
let hud: Hud | null = null;
let life: LifeHud | null = null;
let mode: 'construir' | 'viver' = 'construir';

const buildFrame = (dt: number) => { life?.view.sync(editor.view, null, dt, false); };

function toLife() {
  if (!hud || !life) return;
  mode = 'viver';
  hud.root.style.display = 'none';
  editor.select(null);
  editor.setTool(life.tool);
  if (editor.rig.mode === 'planta') editor.rig.setMode('3d');
  if (editor.view.wallMode === 'inteiras') editor.setView({ wallMode: 'baixas', showRoof: false });
  sim.unstick();
  life.show();
  engine.onFrame = (dt) => life?.frame(dt);
}

function toBuild() {
  if (!hud || !life) return;
  mode = 'construir';
  life.hide();
  hud.root.style.display = '';
  editor.setTool(new SelectTool(editor));
  engine.onFrame = buildFrame;
  editor.saveNow();
}

let startEl: HTMLElement | null = null;
let deferredInstall: any = null;

const app: AppApi = {
  editor,
  settings,
  toast,
  installPrompt: null,
  startGame(p: Project) {
    editor.loadProject(p);
    startEl?.remove();
    startEl = null;
    hud?.destroy();
    life?.destroy();
    sim.reset();
    hud = new Hud(root, editor, {
      openMenu: () => gameMenu(app),
      openSettings: () => settingsDialog(app),
      toLife,
      toast,
    });
    life = new LifeHud(root, editor, sim, {
      openMenu: () => gameMenu(app),
      openSettings: () => settingsDialog(app),
      toBuild,
      toast,
    });
    mode = 'construir';
    editor.setTool(new SelectTool(editor));
    engine.onFrame = buildFrame;
    document.body.classList.add('playing');
  },
  showStart() {
    hud?.destroy();
    hud = null;
    life?.destroy();
    life = null;
    mode = 'construir';
    if (editor.rig.mode === 'pessoa') editor.rig.setMode('3d');
    document.body.classList.remove('playing');
    startEl?.remove();
    startEl = startScreen(app);
    root.append(startEl);
    // Câmera girando lentamente atrás do menu.
    engine.onFrame = (dt) => editor.rig.rotate(dt * 0.08, 0);
  },
  applySettings(patch) {
    Object.assign(settings, patch);
    storage.saveSettings(settings);
    editor.snap.step = settings.gridStep;
    engine.applySettings(settings);
    editor.rebuild();
  },
};

editor.on('toast', (m) => toast(m));
sim.on('toast', (m) => toast(m));

window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  deferredInstall = ev;
  app.installPrompt = async () => {
    deferredInstall?.prompt();
    await deferredInstall?.userChoice;
    deferredInstall = null;
    app.installPrompt = null;
  };
  if (startEl) app.showStart();
});

// Atalhos de teclado (quando houver teclado).
window.addEventListener('keydown', (ev) => {
  if (!hud || mode !== 'construir' || (ev.target as HTMLElement).tagName === 'INPUT') return;
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? editor.redo() : editor.undo(); }
  else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); editor.redo(); }
  else if (ev.key === 'Delete' || ev.key === 'Backspace') editor.deleteSelection();
  else if (ev.key === 'Escape') { editor.tool.cancel?.(); editor.select(null); }
});

app.showStart();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline indisponível */ });
}

// Exposto para testes automatizados.
(window as any).__morada = { editor, app, sim, get life() { return life; }, toLife, toBuild };
