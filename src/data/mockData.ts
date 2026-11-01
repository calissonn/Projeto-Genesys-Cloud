/**
 * GERADOR DE DADOS SIMULADOS.
 *
 * Todos os números gerados aqui são FICTÍCIOS e servem apenas para validar a
 * interface e as regras de negócio do MVP. Eles são determinísticos (mesma
 * semente = mesmos dados) e coerentes entre si:
 *   entradas = desligamentos + transferências + autosserviços + outras saídas
 *
 * Cenários embutidos para demonstração (relativos à data da última alteração
 * de cada URA no catálogo):
 *  - Consórcio: aumento de falhas na identificação por CPF após alteração do bloco de coleta.
 *  - GazinBank Conta Digital: aumento de erros de integração após troca da API de saldo.
 *  - E-commerce Pedidos: melhora no autosserviço após novo menu de rastreio.
 *  - Loja Cobrança: desligamentos mais altos às segundas-feiras.
 */
import { addDays, diffDays, todayISO, weekday } from '../lib/dates';
import { hashString, mulberry32, noise } from '../lib/random';
import { buildFlowModel, propagate, type FlowAdjust } from './flowModel';
import type { HourRecord, Ura } from './types';

export const HISTORY_DAYS = 120;

// Distribuição do volume ao longo do dia (soma ≈ 1).
const HOUR_SHARE = [
  0.004, 0.003, 0.002, 0.002, 0.003, 0.006, 0.014, 0.032, 0.066, 0.086, 0.09, 0.084,
  0.066, 0.068, 0.082, 0.084, 0.078, 0.066, 0.052, 0.038, 0.032, 0.018, 0.012, 0.008,
];
const WEEKDAY_FACTOR = [0.32, 1.18, 1.05, 1.0, 0.98, 1.02, 0.7]; // dom..sáb

/** Fatores de cenário por URA/dia. */
export function scenarioAdjust(ura: Ura, date: string): FlowAdjust & { integration: number; volume: number } {
  const since = diffDays(ura.lastChange, date); // >= 0 após a alteração
  const adj = { disc: 1, auth: 1, ss: 1, integration: 1, volume: 1 };
  switch (ura.id) {
    case 'ura-consorcio':
      if (since >= 0) {
        const ramp = Math.min(1, (since + 1) / 3);
        adj.auth = 1 + 1.5 * ramp;
        adj.disc = 1 + 0.35 * ramp;
      }
      break;
    case 'ura-bank-conta':
      if (since >= 0) {
        adj.integration = 7;
        adj.ss = 0.84;
        adj.disc = 1.18;
      }
      break;
    case 'ura-ecom-pedidos':
      if (since >= 0) {
        adj.ss = 1.16;
        adj.disc = 0.86;
      }
      break;
    case 'ura-loja-principal':
      if (since >= 0) adj.ss = 1.05;
      break;
    case 'ura-loja-cobranca':
      if (weekday(date) === 1) adj.disc = 1.3;
      break;
  }
  return adj;
}

/** URAs que recebem chamadas encaminhadas por outra URA (para o cálculo de conversas distintas). */
const INHERITED_SHARE: Record<string, number> = {
  'ura-loja-cobranca': 0.22,
  'ura-bank-emprestimo': 0.18,
  'ura-sac-ouvidoria': 0.3,
  'ura-ecom-marketplace': 0.12,
};

export function generateRecords(uras: Ura[], endDate = todayISO(), days = HISTORY_DAYS): HourRecord[] {
  const out: HourRecord[] = [];
  const nowHour = new Date().getHours();
  for (const ura of uras) {
    if (ura.userCreated) continue; // URAs cadastradas pelo usuário não têm dados simulados
    const model = buildFlowModel(ura);
    for (let i = days - 1; i >= 0; i--) {
      const date = addDays(endDate, -i);
      if (ura.status === 'em-teste' && diffDays(ura.lastChange, date) < 0) continue;
      const rnd = mulberry32(hashString(`${ura.id}|${date}`));
      const sc = scenarioAdjust(ura, date);
      const dayAdj: FlowAdjust = { disc: sc.disc * noise(rnd, 0.08), auth: sc.auth * noise(rnd, 0.1), ss: sc.ss * noise(rnd, 0.03) };
      const r = propagate(model, 1, dayAdj);
      const trend = 1 + (days - i) * 0.0006;
      const dayVolume = ura.baseVolume * WEEKDAY_FACTOR[weekday(date)] * trend * noise(rnd, 0.1) * sc.volume;
      const authRate = r.authAttempts > 0 ? r.authFailures / r.authAttempts : 0;
      const maxHour = date === endDate ? nowHour : 23;
      for (let h = 0; h <= maxHour; h++) {
        const entries = Math.round(dayVolume * HOUR_SHARE[h] * noise(rnd, 0.18));
        if (entries <= 0) continue;
        const nightFactor = h < 7 || h >= 21 ? 1.25 : 1;
        // Fora do horário de atendimento humano, transferências viram "outras saídas".
        const disconnects = Math.min(entries, Math.round(entries * r.outcome.disconnects * nightFactor * noise(rnd, 0.15)));
        const ssCount = Math.min(entries - disconnects, Math.round(entries * r.outcome.selfService * noise(rnd, 0.1)));
        const transfers = Math.min(entries - disconnects - ssCount, Math.round(entries * r.outcome.transfers * noise(rnd, 0.08)));
        const otherExits = entries - disconnects - ssCount - transfers;
        const authAttempts = ura.requiresCpf ? Math.round(entries * r.authAttempts * noise(rnd, 0.05)) : 0;
        const authFailures = ura.requiresCpf ? Math.round(authAttempts * authRate * noise(rnd, 0.12)) : 0;
        const integrationErrors = Math.round(entries * 0.004 * sc.integration * noise(rnd, 0.5) + (rnd() < 0.05 ? 1 : 0));
        const transferFailures = Math.round(transfers * 0.006 * noise(rnd, 0.6));
        const unique = Math.round(entries / (1.03 + rnd() * 0.03));
        const inherited = Math.round(unique * (INHERITED_SHARE[ura.id] ?? 0.015) * noise(rnd, 0.2));
        out.push({
          uraId: ura.id,
          date,
          hour: h,
          entries,
          unique,
          inherited,
          disconnects,
          transfers,
          selfService: ssCount,
          otherExits,
          durationSec: Math.round(entries * r.avgDurationSec * noise(rnd, 0.08)),
          authFailures,
          authAttempts,
          integrationErrors,
          transferFailures,
          queueAbandons: Math.round(transfers * 0.075 * noise(rnd, 0.3)),
        });
      }
    }
  }
  return out;
}
