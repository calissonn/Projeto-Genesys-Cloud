/**
 * Histórico de alterações das URAs — SIMULADO.
 * A versão mais recente de cada URA corresponde ao campo `lastChange` do catálogo.
 * Em produção: versões vêm de GET /api/v2/flows/{flowId}/versions (somente leitura) e a
 * descrição da alteração é registrada pela equipe CX no próprio Gazin URA Intelligence.
 */
import { addDays } from '../lib/dates';
import type { Ura, UraChange } from './types';

const PAST_NOTES: { type: UraChange['type']; text: string }[] = [
  { type: 'mensagem', text: 'Revisão dos textos de áudio da saudação' },
  { type: 'menu', text: 'Reordenação das opções do menu principal' },
  { type: 'horario', text: 'Atualização da tabela de feriados' },
  { type: 'roteamento', text: 'Ajuste de fila de contingência' },
  { type: 'integracao', text: 'Aumento do timeout da consulta de cadastro' },
];

function bumpDown(v: string, n: number): string {
  const m = /^v(\d+)\.(\d+)$/.exec(v);
  if (!m) return v;
  let major = Number(m[1]);
  let minor = Number(m[2]) - n;
  while (minor < 0) { major = Math.max(0, major - 1); minor += 10; }
  return `v${major}.${minor}`;
}

function typeOf(note: string): UraChange['type'] {
  const n = note.toLowerCase();
  if (n.includes('cpf') || n.includes('autentica')) return 'identificacao';
  if (n.includes('api') || n.includes('serviço') || n.includes('integr')) return 'integracao';
  if (n.includes('menu') || n.includes('opção')) return 'menu';
  if (n.includes('criação') || n.includes('piloto')) return 'novo';
  if (n.includes('saudação') || n.includes('mensagem') || n.includes('texto')) return 'mensagem';
  return 'roteamento';
}

export function buildChangeLog(uras: Ura[]): UraChange[] {
  const out: UraChange[] = [];
  for (const u of uras) {
    if (u.userCreated) continue;
    out.push({ id: `${u.id}-${u.version}`, uraId: u.id, version: u.version, date: u.lastChange, author: u.owner, description: u.lastChangeNote, type: typeOf(u.lastChangeNote), source: 'simulado' });
    // Duas versões anteriores, espaçadas, quando ainda dentro do histórico simulado.
    for (let i = 1; i <= 2; i++) {
      const date = addDays(u.lastChange, -(21 * i + (u.id.length % 9)));
      const note = PAST_NOTES[(u.id.length + i) % PAST_NOTES.length];
      out.push({ id: `${u.id}-${bumpDown(u.version, i)}`, uraId: u.id, version: bumpDown(u.version, i), date, author: u.owner, description: note.text, type: note.type, source: 'simulado' });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export const CHANGE_TYPE_LABEL: Record<UraChange['type'], string> = {
  menu: 'Menu', identificacao: 'Identificação', integracao: 'Integração', mensagem: 'Mensagens', roteamento: 'Roteamento', horario: 'Horários', novo: 'Novo fluxo',
};
