/**
 * Histórico de desfazer/refazer baseado em snapshots serializados.
 * Robusto para qualquer tipo de alteração do projeto.
 */
export class History {
  private undoStack: string[] = [];
  private redoStack: string[] = [];

  constructor(private limit = 120) {}

  /** Registra o estado ANTERIOR a uma alteração. */
  push(snapshot: string): void {
    if (this.undoStack[this.undoStack.length - 1] === snapshot) return;
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo(current: string): string | null {
    const prev = this.undoStack.pop();
    if (prev === undefined) return null;
    this.redoStack.push(current);
    return prev;
  }

  redo(current: string): string | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(current);
    return next;
  }

  /** Descarta o último snapshot sem refazer (usado quando uma ação é rejeitada). */
  dropLast(): string | null {
    return this.undoStack.pop() ?? null;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
}
