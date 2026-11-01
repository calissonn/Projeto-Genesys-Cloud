import { addDays, todayISO } from '../lib/dates';
import type { TestCase } from './types';

/** Categorias de cenário sugeridas para testes funcionais de URA. */
export const TEST_SCENARIOS = [
  'CPF válido', 'CPF inválido', 'Três tentativas incorretas', 'Ausência de digitação', 'Transferência para atendimento',
  'Atendimento fora do horário', 'Feriados', 'Sobreaviso', 'Falha de integração', 'Fluxo de contingência', 'Opção de menu', 'Outro',
];

const ev = (at: string, text: string, by = 'Equipe CX') => ({ at: `${at}T10:00`, by, text });

/** Testes de exemplo (SIMULADOS) para demonstrar a organização por versão. */
export function seedTests(): TestCase[] {
  const t = todayISO();
  const mk = (id: string, uraId: string, version: string, scenario: string, title: string, expected: string, obtained: string, status: TestCase['status'], owner: string, daysAgo: number, steps = ''): TestCase => {
    const date = addDays(t, -daysAgo);
    return { id, uraId, version, scenario, title, steps, expected, obtained, status, owner, date, evidences: [], history: [ev(date, `Teste registrado com status "${status}".`, owner)] };
  };
  return [
    mk('t1', 'ura-consorcio', 'v2.6', 'CPF válido', 'Identificação com CPF válido de consorciado', 'Validar CPF e seguir para o menu principal em até 5 s.', 'CPF validado; menu tocado após 3 s.', 'aprovado', 'Marina (CX)', 8, '1. Ligar para o número do Consórcio\n2. Digitar CPF de massa de teste válido\n3. Aguardar o menu'),
    mk('t2', 'ura-consorcio', 'v2.6', 'Ausência de digitação', 'Cliente não digita o CPF', 'Após o timeout, repetir a solicitação uma vez e depois transferir.', 'Timeout de dígitos encerrou a coleta antes do cliente terminar de digitar (11 dígitos em ~6 s).', 'reprovado', 'Marina (CX)', 7, '1. Ligar\n2. Digitar o CPF devagar (1 dígito/s)'),
    mk('t3', 'ura-consorcio', 'v2.6', 'Três tentativas incorretas', 'Três CPFs inválidos seguidos', 'Na 3ª falha, transferir para a fila Consórcio Cotas com mensagem.', 'Transferiu corretamente.', 'aprovado', 'Marina (CX)', 7),
    mk('t4', 'ura-bank-conta', 'v4.2', 'Falha de integração', 'Consulta de saldo com nova API indisponível', 'Informar indisponibilidade e oferecer atendente.', 'Mensagem genérica de erro e desligamento da chamada.', 'reprovado', 'Rafael (GazinBank)', 5),
    mk('t5', 'ura-bank-conta', 'v4.2', 'CPF válido', 'Consulta de saldo com CPF válido', 'Informar saldo em até 8 s.', '', 'pendente', 'Rafael (GazinBank)', 4),
    mk('t6', 'ura-ecom-pedidos', 'v5.0', 'Opção de menu', 'Rastreio de pedido pela opção 1', 'Informar status e previsão de entrega do último pedido.', 'Status informado corretamente.', 'aprovado', 'Equipe CX Digital', 11),
    mk('t7', 'ura-ecom-pedidos', 'v5.0', 'Atendimento fora do horário', 'Ligação às 22h', 'Tocar mensagem de horário e oferecer rastreio automático.', 'Conforme esperado.', 'aprovado', 'Equipe CX Digital', 11),
    mk('t8', 'ura-seguros-vendas', 'v0.9', 'Fluxo de contingência', 'Fila de vendas sem agentes logados', 'Direcionar para fila de contingência ou callback.', '', 'pendente', 'Equipe Seguros', 1),
    mk('t9', 'ura-loja-principal', 'v3.4', 'Feriados', 'Ligação em feriado nacional cadastrado', 'Mensagem de feriado e encerramento.', 'Conforme esperado.', 'aprovado', 'Equipe CX Varejo', 19),
  ];
}
