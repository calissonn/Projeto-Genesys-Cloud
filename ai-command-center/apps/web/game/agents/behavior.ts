import type { Agent } from '@acc/shared';
import { SEAT_OFFSET, deskOf, floorDef, loungeOf, stationById } from '../building/layout';

export type Pose = 'stand' | 'walk' | 'sit' | 'type' | 'think' | 'raise' | 'cheer' | 'coffee' | 'talk' | 'sad';
export type Badge = 'think' | 'code' | 'test' | 'talk' | 'alert' | 'check' | 'error' | 'pause' | 'meeting' | null;
export type Screen = 'off' | 'code' | 'chart' | 'test' | 'error' | 'done' | 'alert';

export interface Target {
  floor: number;
  x: number;
  pose: Pose;
  badge: Badge;
  facing: 'left' | 'right';
  /** O que aparece no monitor da mesa do agente. */
  screen: Screen;
  /** Depois de um tempo, o personagem "relaxa" (ex.: comemorou e foi para a copa). */
  settle?: { afterMs: number; floor: number; x: number; pose: Pose; facing: 'left' | 'right' };
}

/**
 * Traduz o estado REAL do agente em posição, pose e indicadores.
 * Função pura: o prédio nunca inventa atividade, só representa o estado recebido.
 */
export function targetFor(agent: Agent, agents: Record<string, Agent>): Target {
  const desk = deskOf(agent.id);
  const homeFloor = desk?.floor.level ?? agent.floor;
  const seatX = desk ? desk.station.x + SEAT_OFFSET : 100;
  const lounge = loungeOf(homeFloor);
  const atDesk = (pose: Pose, badge: Badge, screen: Screen): Target => ({ floor: homeFloor, x: seatX, pose, badge, facing: 'left', screen });
  const loungeX = lounge.x + (agent.role === 'coordinator' ? 0 : 6);

  switch (agent.state) {
    case 'idle':
      return { floor: homeFloor, x: loungeX, pose: 'coffee', badge: null, facing: 'left', screen: 'off' };
    case 'meeting': {
      const m = stationById('meeting');
      return { floor: m?.floor.level ?? 5, x: (m?.station.x ?? 385) + 30, pose: 'talk', badge: 'meeting', facing: 'left', screen: 'off' };
    }
    case 'analyzing':
      return atDesk('think', 'think', 'chart');
    case 'typing':
      return atDesk('type', 'code', 'code');
    case 'testing': {
      if (agent.role === 'tester') {
        const lab = stationById('lab');
        if (lab) return { floor: lab.floor.level, x: lab.station.x + 40, pose: 'type', badge: 'test', facing: 'left', screen: 'test' };
      }
      return atDesk('type', 'test', 'test');
    }
    case 'talking': {
      const other = agent.withAgentId ? agents[agent.withAgentId] : undefined;
      const otherDesk = other ? deskOf(other.id) : null;
      if (otherDesk) {
        // Vai até a mesa de quem fez a tarefa anterior para receber o resultado.
        return { floor: otherDesk.floor.level, x: otherDesk.station.x + SEAT_OFFSET + 34, pose: 'talk', badge: 'talk', facing: 'left', screen: 'off' };
      }
      return atDesk('talk', 'talk', 'off');
    }
    case 'awaiting_approval': {
      if (agent.role === 'coordinator') {
        const c = stationById('approvals');
        if (c) return { floor: c.floor.level, x: c.station.x + 34, pose: 'raise', badge: 'alert', facing: 'left', screen: 'alert' };
      }
      return atDesk('raise', 'alert', 'alert');
    }
    case 'done':
      return {
        ...atDesk('cheer', 'check', 'done'),
        settle: { afterMs: 4000, floor: homeFloor, x: loungeX, pose: 'coffee', facing: 'left' },
      };
    case 'error':
      return atDesk('sad', 'error', 'error');
    case 'paused':
      return { ...atDesk('stand', 'pause', 'off'), x: seatX + 20 };
  }
}

export const STATE_LABELS: Record<Agent['state'], string> = {
  idle: 'Ocioso',
  meeting: 'Em reunião (planejando)',
  analyzing: 'Analisando',
  typing: 'Escrevendo código',
  testing: 'Executando testes',
  talking: 'Conversando',
  awaiting_approval: 'Aguardando aprovação',
  done: 'Tarefa concluída',
  error: 'Erro',
  paused: 'Pausado',
};

export { floorDef };
