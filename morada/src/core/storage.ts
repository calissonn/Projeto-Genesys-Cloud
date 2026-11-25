import type { Project } from '../model/types';
import { serializeProject, deserializeProject } from '../model/project';

const KEY_SAVES = 'morada.saves.v1';
const KEY_BLUEPRINTS = 'morada.blueprints.v1';
const KEY_LAST = 'morada.last';
const KEY_SETTINGS = 'morada.settings.v1';

export interface SaveMeta {
  id: string;
  name: string;
  mode: string;
  lot: string;
  updatedAt: number;
}

function readMap(key: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

function writeMap(key: string, map: Record<string, string>): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

function listFrom(key: string): SaveMeta[] {
  const map = readMap(key);
  const out: SaveMeta[] = [];
  for (const [id, json] of Object.entries(map)) {
    try {
      const p = JSON.parse(json);
      out.push({ id, name: p.name, mode: p.mode, lot: `${p.lot?.w}×${p.lot?.d} m`, updatedAt: p.updatedAt ?? 0 });
    } catch { /* ignora entradas corrompidas */ }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export const storage = {
  saveGame(p: Project): boolean {
    const map = readMap(KEY_SAVES);
    map[p.id] = serializeProject(p);
    const ok = writeMap(KEY_SAVES, map);
    try { localStorage.setItem(KEY_LAST, p.id); } catch { /* sem armazenamento */ }
    return ok;
  },
  loadGame(id: string): Project | null {
    const json = readMap(KEY_SAVES)[id];
    return json ? deserializeProject(json) : null;
  },
  deleteGame(id: string): void {
    const map = readMap(KEY_SAVES);
    delete map[id];
    writeMap(KEY_SAVES, map);
  },
  listGames: () => listFrom(KEY_SAVES),
  lastGameId(): string | null {
    try {
      const id = localStorage.getItem(KEY_LAST);
      return id && readMap(KEY_SAVES)[id] ? id : null;
    } catch {
      return null;
    }
  },

  saveBlueprint(p: Project, name: string): string {
    const map = readMap(KEY_BLUEPRINTS);
    const id = 'bp' + Date.now().toString(36);
    map[id] = serializeProject({ ...p, id, name, updatedAt: Date.now() });
    writeMap(KEY_BLUEPRINTS, map);
    return id;
  },
  loadBlueprint(id: string): Project | null {
    const json = readMap(KEY_BLUEPRINTS)[id];
    return json ? deserializeProject(json) : null;
  },
  deleteBlueprint(id: string): void {
    const map = readMap(KEY_BLUEPRINTS);
    delete map[id];
    writeMap(KEY_BLUEPRINTS, map);
  },
  listBlueprints: () => listFrom(KEY_BLUEPRINTS),

  loadSettings<T>(defaults: T): T {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(KEY_SETTINGS) || '{}') };
    } catch {
      return defaults;
    }
  },
  saveSettings(s: unknown): void {
    try { localStorage.setItem(KEY_SETTINGS, JSON.stringify(s)); } catch { /* ignora */ }
  },
};
