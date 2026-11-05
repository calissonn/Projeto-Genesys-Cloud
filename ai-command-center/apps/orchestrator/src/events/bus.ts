import type { AccEvent, UnsequencedEvent, Mode, NewAccEvent } from '@acc/shared';
import type { Repository } from '../store/repository.ts';
import type { Clock } from '../util/runtime.ts';

export type Listener = (event: AccEvent) => void;

/**
 * Grava cada evento no banco e só então avisa os assinantes (WebSocket, testes).
 * Assim, nada aparece na interface sem estar no histórico.
 */
export class EventBus {
  private listeners = new Set<Listener>();

  constructor(
    private readonly repo: Repository,
    private readonly mode: Mode,
    private readonly clock: Clock,
  ) {}

  emit(input: NewAccEvent): AccEvent {
    const event = this.repo.appendEvent({
      projectId: null,
      agentId: null,
      taskId: null,
      runId: null,
      ...input,
      ts: this.clock.now(),
      source: this.mode,
    } as UnsequencedEvent);
    for (const l of this.listeners) {
      try {
        l(event);
      } catch (err) {
        console.error('[bus] assinante falhou', err);
      }
    }
    return event;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
