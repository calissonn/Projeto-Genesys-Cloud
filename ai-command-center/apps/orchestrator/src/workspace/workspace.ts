import { mkdirSync } from 'node:fs';
import path from 'node:path';

/** Pasta isolada de cada projeto. Os agentes do modo real só trabalham aqui dentro. */
export class Workspaces {
  constructor(private readonly root: string) {}

  pathFor(projectId: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) throw new Error('Identificador de projeto inválido');
    return path.join(this.root, projectId);
  }

  ensure(projectId: string): string {
    const dir = this.pathFor(projectId);
    mkdirSync(dir, { recursive: true });
    return dir;
  }
}
