import { randomUUID } from 'node:crypto';

export interface Clock {
  now(): string;
}
export const systemClock: Clock = { now: () => new Date().toISOString() };

export type IdGen = (prefix: string) => string;
export const uuidIds: IdGen = (prefix) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

export class AbortedError extends Error {
  constructor() {
    super('Execução interrompida');
    this.name = 'AbortedError';
  }
}

/** Espera respeitando o AbortSignal. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortedError());
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortedError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
