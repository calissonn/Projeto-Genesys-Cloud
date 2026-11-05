import { describe, expect, it } from 'vitest';
import type { AccEvent, Snapshot } from '@acc/shared';
import { FEED_LIMIT, applyEvent, applySnapshot, emptyState } from '../lib/reducer';

const snap: Snapshot = { mode: 'demo', seq: 10, agents: [], projects: [], tasks: [], approvals: [], runs: [] };
const log = (seq: number): AccEvent => ({ seq, ts: 't', source: 'demo', projectId: null, agentId: null, taskId: null, runId: null, type: 'log', level: 'info', message: String(seq) });

describe('aplicação de eventos', () => {
  it('ignora eventos já aplicados', () => {
    const s = applySnapshot(emptyState, snap);
    expect(applyEvent(s, log(10))).toBe(s);
    expect(applyEvent(s, log(11)).seq).toBe(11);
  });

  it('atualiza entidades', () => {
    const s = applySnapshot(emptyState, snap);
    const agent = { id: 'a', name: 'A' } as never;
    const next = applyEvent(s, { ...log(11), type: 'agent.upserted', agent } as AccEvent);
    expect(next.agents.a).toBe(agent);
  });

  it('limita o tamanho do feed', () => {
    let s = applySnapshot(emptyState, { ...snap, seq: 0 });
    for (let i = 1; i <= FEED_LIMIT + 50; i++) s = applyEvent(s, log(i));
    expect(s.feed).toHaveLength(FEED_LIMIT);
    expect(s.feed.at(-1)!.seq).toBe(FEED_LIMIT + 50);
  });
});
