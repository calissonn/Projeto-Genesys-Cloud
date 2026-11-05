import { describe, expect, it } from 'vitest';
import { AGENT_STATES, isEngagedState, type Agent } from '@acc/shared';
import { STATE_LABELS, targetFor } from '../game/agents/behavior';
import { FLOORS, SEAT_OFFSET, deskOf, stationById } from '../game/building/layout';

const agent = (id: string, role: Agent['role'], floor: number, over: Partial<Agent> = {}): Agent => ({
  id, name: id, role, title: '', department: '', floor, specialty: '', state: 'idle', stateDetail: null,
  stateSince: new Date().toISOString(), currentProjectId: null, currentTaskId: null, withAgentId: null, ...over,
});
const team = {
  'ag-coordinator': agent('ag-coordinator', 'coordinator', 5),
  'ag-programmer': agent('ag-programmer', 'programmer', 4),
  'ag-designer': agent('ag-designer', 'designer', 3),
  'ag-tester': agent('ag-tester', 'tester', 2),
};

describe('estado do agente → posição e animação', () => {
  it('cada agente tem mesa no seu andar', () => {
    for (const a of Object.values(team)) expect(deskOf(a.id)?.floor.level).toBe(a.floor);
  });

  it('cobre todos os estados com rótulo e destino válido', () => {
    const levels = FLOORS.map((f) => f.level);
    for (const state of AGENT_STATES) {
      expect(STATE_LABELS[state]).toBeTruthy();
      for (const a of Object.values(team)) {
        const t = targetFor({ ...a, state }, team);
        expect(levels).toContain(t.floor);
        expect(t.x).toBeGreaterThan(0);
      }
    }
  });

  it('ocioso descansa na copa, sem pose nem tela de trabalho', () => {
    const t = targetFor(team['ag-programmer'], team);
    expect(t).toMatchObject({ floor: 4, pose: 'coffee', badge: null, screen: 'off' });
  });

  it('estados que não são de trabalho nunca usam pose ou tela de trabalho', () => {
    for (const state of AGENT_STATES.filter((s) => !isEngagedState(s))) {
      const t = targetFor({ ...team['ag-programmer'], state }, team);
      expect(['type', 'think']).not.toContain(t.pose);
      expect(['code', 'chart', 'test']).not.toContain(t.screen);
    }
  });

  it('digitando: senta na própria mesa e o monitor mostra código', () => {
    const t = targetFor({ ...team['ag-programmer'], state: 'typing' }, team);
    expect(t).toMatchObject({ floor: 4, x: deskOf('ag-programmer')!.station.x + SEAT_OFFSET, pose: 'type', badge: 'code', screen: 'code' });
  });

  it('testador executa testes no laboratório', () => {
    const t = targetFor({ ...team['ag-tester'], state: 'testing' }, team);
    expect(t.floor).toBe(2);
    expect(t.x).toBe(stationById('lab')!.station.x + 40);
  });

  it('coordenadora planeja na sala de reunião e aguarda aprovação na central', () => {
    expect(targetFor({ ...team['ag-coordinator'], state: 'meeting' }, team)).toMatchObject({ floor: 5, pose: 'talk', badge: 'meeting' });
    const t = targetFor({ ...team['ag-coordinator'], state: 'awaiting_approval' }, team);
    expect(t).toMatchObject({ floor: 5, pose: 'raise', badge: 'alert' });
    expect(t.x).toBe(stationById('approvals')!.station.x + 34);
  });

  it('conversando: vai até a mesa do colega', () => {
    const t = targetFor({ ...team['ag-programmer'], state: 'talking', withAgentId: 'ag-designer' }, team);
    expect(t).toMatchObject({ floor: 3, pose: 'talk', badge: 'talk' });
  });

  it('erro e conclusão sinalizam com balões', () => {
    expect(targetFor({ ...team['ag-tester'], state: 'error' }, team)).toMatchObject({ pose: 'sad', badge: 'error', screen: 'error' });
    const done = targetFor({ ...team['ag-tester'], state: 'done' }, team);
    expect(done).toMatchObject({ pose: 'cheer', badge: 'check' });
    expect(done.settle?.pose).toBe('coffee');
  });
});
