type Handler<T> = (payload: T) => void;

/** Emissor de eventos tipado e minimalista. */
export class Emitter<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<Handler<any>>>();

  on<K extends keyof Events>(name: K, h: Handler<Events[K]>): () => void {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name)!.add(h);
    return () => this.handlers.get(name)!.delete(h);
  }

  emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    this.handlers.get(name)?.forEach((h) => h(payload));
  }
}
