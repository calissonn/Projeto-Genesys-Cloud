import type { Department, Ura } from './types';
import { daysAgo } from '../lib/dates';

/** Departamentos monitorados (cadastro inicial — dados SIMULADOS). */
export const DEPARTMENTS: Department[] = [
  { id: 'loja-fisica', name: 'Loja Física', short: 'Loja Física' },
  { id: 'ecommerce', name: 'Loja Online / E-commerce', short: 'E-commerce' },
  { id: 'gazinbank', name: 'GazinBank', short: 'GazinBank' },
  { id: 'consorcio', name: 'Consórcio', short: 'Consórcio' },
  { id: 'seguros', name: 'Seguros', short: 'Seguros' },
  { id: 'sac', name: 'SAC / Assistência', short: 'SAC' },
  { id: 'filiais', name: 'Filiais e Representantes', short: 'Filiais' },
];

/**
 * Catálogo de URAs SIMULADO. Os `genesysFlowId` estão nulos de propósito:
 * nenhum fluxo real foi vinculado. O vínculo será feito na Administração
 * (Etapa 3), após a integração com a Genesys Cloud estar configurada.
 */
export const URAS: Ura[] = [
  {
    id: 'ura-loja-principal', name: 'URA Loja Física — Principal', departmentId: 'loja-fisica', genesysFlowId: null,
    version: 'v3.4', status: 'ativa', description: 'Atendimento de clientes das lojas físicas: crediário, carnês e pedidos.',
    businessHours: 'Seg–Sáb 08h–20h', queues: ['Crediário Loja', 'Pedidos Loja'], lastChange: daysAgo(18),
    lastChangeNote: 'Inclusão da opção 2ª via de carnê por SMS', owner: 'Equipe CX Varejo', requiresCpf: true, baseVolume: 3800,
    menu: [
      { key: '1', label: '2ª via de carnê', kind: 'self', share: 0.34, successRate: 0.72, queue: 'Crediário Loja' },
      { key: '2', label: 'Status do pedido', kind: 'self', share: 0.22, successRate: 0.64, queue: 'Pedidos Loja' },
      { key: '3', label: 'Crediário', kind: 'transfer', share: 0.26, queue: 'Crediário Loja' },
      { key: '9', label: 'Falar com atendente', kind: 'transfer', share: 0.18, queue: 'Pedidos Loja' },
    ],
  },
  {
    id: 'ura-loja-cobranca', name: 'URA Loja Física — Cobrança', departmentId: 'loja-fisica', genesysFlowId: null,
    version: 'v2.1', status: 'ativa', description: 'Negociação de parcelas em atraso e acordos.',
    businessHours: 'Seg–Sex 08h–20h', queues: ['Cobrança'], lastChange: daysAgo(60),
    lastChangeNote: 'Ajuste do texto da saudação', owner: 'Equipe Cobrança', requiresCpf: true, baseVolume: 1500,
    menu: [
      { key: '1', label: 'Boleto de acordo', kind: 'self', share: 0.45, successRate: 0.68, queue: 'Cobrança' },
      { key: '2', label: 'Negociar dívida', kind: 'transfer', share: 0.4, queue: 'Cobrança' },
      { key: '9', label: 'Falar com atendente', kind: 'transfer', share: 0.15, queue: 'Cobrança' },
    ],
  },
  {
    id: 'ura-ecom-pedidos', name: 'URA E-commerce — Pedidos', departmentId: 'ecommerce', genesysFlowId: null,
    version: 'v5.0', status: 'ativa', description: 'Rastreio, entrega, troca e devolução de pedidos online.',
    businessHours: 'Seg–Sáb 08h–21h', queues: ['Entregas', 'Trocas e Devoluções'], lastChange: daysAgo(10),
    lastChangeNote: 'Novo menu de rastreio integrado à transportadora', owner: 'Equipe CX Digital', requiresCpf: true, baseVolume: 4200,
    menu: [
      { key: '1', label: 'Rastrear pedido', kind: 'self', share: 0.48, successRate: 0.7, queue: 'Entregas' },
      { key: '2', label: 'Troca e devolução', kind: 'transfer', share: 0.22, queue: 'Trocas e Devoluções' },
      { key: '3', label: 'Problema na entrega', kind: 'transfer', share: 0.2, queue: 'Entregas' },
      { key: '9', label: 'Falar com atendente', kind: 'transfer', share: 0.1, queue: 'Entregas' },
    ],
  },
  {
    id: 'ura-ecom-marketplace', name: 'URA E-commerce — Marketplace', departmentId: 'ecommerce', genesysFlowId: null,
    version: 'v1.3', status: 'ativa', description: 'Atendimento a clientes de compras via parceiros de marketplace.',
    businessHours: 'Seg–Sex 08h–18h', queues: ['Marketplace'], lastChange: daysAgo(74),
    lastChangeNote: 'Criação do fluxo', owner: 'Equipe CX Digital', requiresCpf: false, baseVolume: 900,
    menu: [
      { key: '1', label: 'Status do pedido', kind: 'self', share: 0.55, successRate: 0.52, queue: 'Marketplace' },
      { key: '2', label: 'Falar com atendente', kind: 'transfer', share: 0.45, queue: 'Marketplace' },
    ],
  },
  {
    id: 'ura-bank-conta', name: 'URA GazinBank — Conta Digital', departmentId: 'gazinbank', genesysFlowId: null,
    version: 'v4.2', status: 'ativa', description: 'Saldo, extrato, cartão e Pix da conta digital.',
    businessHours: '24h (atendimento humano 08h–20h)', queues: ['Conta Digital', 'Cartões'], lastChange: daysAgo(4),
    lastChangeNote: 'Troca do serviço de consulta de saldo (nova API)', owner: 'Equipe GazinBank', requiresCpf: true, baseVolume: 3100,
    menu: [
      { key: '1', label: 'Saldo e extrato', kind: 'self', share: 0.38, successRate: 0.82, queue: 'Conta Digital' },
      { key: '2', label: 'Bloqueio de cartão', kind: 'self', share: 0.14, successRate: 0.9, queue: 'Cartões' },
      { key: '3', label: 'Pix e transferências', kind: 'transfer', share: 0.24, queue: 'Conta Digital' },
      { key: '9', label: 'Falar com atendente', kind: 'transfer', share: 0.24, queue: 'Conta Digital' },
    ],
  },
  {
    id: 'ura-bank-emprestimo', name: 'URA GazinBank — Empréstimos', departmentId: 'gazinbank', genesysFlowId: null,
    version: 'v1.8', status: 'ativa', description: 'Simulação e acompanhamento de empréstimos pessoais.',
    businessHours: 'Seg–Sex 08h–20h', queues: ['Crédito Pessoal'], lastChange: daysAgo(94),
    lastChangeNote: 'Inclusão de consulta de parcelas', owner: 'Equipe GazinBank', requiresCpf: true, baseVolume: 1100,
    menu: [
      { key: '1', label: 'Consultar parcelas', kind: 'self', share: 0.42, successRate: 0.74, queue: 'Crédito Pessoal' },
      { key: '2', label: 'Contratar empréstimo', kind: 'transfer', share: 0.38, queue: 'Crédito Pessoal' },
      { key: '9', label: 'Falar com atendente', kind: 'transfer', share: 0.2, queue: 'Crédito Pessoal' },
    ],
  },
  {
    id: 'ura-consorcio', name: 'URA Consórcio — Principal', departmentId: 'consorcio', genesysFlowId: null,
    version: 'v2.6', status: 'ativa', description: 'Boletos, assembleias, lances e contemplação.',
    businessHours: 'Seg–Sex 08h–18h', queues: ['Consórcio Cotas', 'Consórcio Vendas'], lastChange: daysAgo(7),
    lastChangeNote: 'Alteração do bloco de coleta de CPF (timeout de dígitos)', owner: 'Equipe Consórcio', requiresCpf: true, baseVolume: 1700,
    menu: [
      { key: '1', label: '2ª via de boleto', kind: 'self', share: 0.4, successRate: 0.7, queue: 'Consórcio Cotas' },
      { key: '2', label: 'Resultado de assembleia', kind: 'self', share: 0.2, successRate: 0.78, queue: 'Consórcio Cotas' },
      { key: '3', label: 'Lances e contemplação', kind: 'transfer', share: 0.22, queue: 'Consórcio Cotas' },
      { key: '4', label: 'Adquirir nova cota', kind: 'transfer', share: 0.18, queue: 'Consórcio Vendas' },
    ],
  },
  {
    id: 'ura-seguros', name: 'URA Seguros — Principal', departmentId: 'seguros', genesysFlowId: null,
    version: 'v1.9', status: 'ativa', description: 'Garantia estendida, seguro prestamista e sinistros.',
    businessHours: 'Seg–Sex 08h–18h', queues: ['Sinistros', 'Apólices'], lastChange: daysAgo(44),
    lastChangeNote: 'Nova opção de acompanhamento de sinistro', owner: 'Equipe Seguros', requiresCpf: true, baseVolume: 800,
    menu: [
      { key: '1', label: 'Acompanhar sinistro', kind: 'self', share: 0.35, successRate: 0.6, queue: 'Sinistros' },
      { key: '2', label: 'Abrir sinistro', kind: 'transfer', share: 0.3, queue: 'Sinistros' },
      { key: '3', label: 'Cancelar seguro', kind: 'transfer', share: 0.2, queue: 'Apólices' },
      { key: '9', label: 'Falar com atendente', kind: 'transfer', share: 0.15, queue: 'Apólices' },
    ],
  },
  {
    id: 'ura-sac', name: 'URA SAC — Assistência Técnica', departmentId: 'sac', genesysFlowId: null,
    version: 'v6.1', status: 'ativa', description: 'Assistência técnica, garantia e reclamações.',
    businessHours: 'Seg–Sáb 08h–20h', queues: ['Assistência Técnica', 'Reclamações'], lastChange: daysAgo(27),
    lastChangeNote: 'Consulta de OS por protocolo', owner: 'Equipe SAC', requiresCpf: true, baseVolume: 2600,
    menu: [
      { key: '1', label: 'Consultar ordem de serviço', kind: 'self', share: 0.36, successRate: 0.66, queue: 'Assistência Técnica' },
      { key: '2', label: 'Abrir assistência', kind: 'transfer', share: 0.3, queue: 'Assistência Técnica' },
      { key: '3', label: 'Reclamações', kind: 'transfer', share: 0.2, queue: 'Reclamações' },
      { key: '9', label: 'Falar com atendente', kind: 'transfer', share: 0.14, queue: 'Reclamações' },
    ],
  },
  {
    id: 'ura-sac-ouvidoria', name: 'URA SAC — Ouvidoria', departmentId: 'sac', genesysFlowId: null,
    version: 'v1.2', status: 'ativa', description: 'Canal de ouvidoria (2ª instância).',
    businessHours: 'Seg–Sex 08h–18h', queues: ['Ouvidoria'], lastChange: daysAgo(143),
    lastChangeNote: 'Ajuste de mensagem de protocolo', owner: 'Equipe SAC', requiresCpf: true, baseVolume: 300,
    menu: [
      { key: '1', label: 'Consultar protocolo', kind: 'self', share: 0.3, successRate: 0.7, queue: 'Ouvidoria' },
      { key: '2', label: 'Registrar manifestação', kind: 'transfer', share: 0.7, queue: 'Ouvidoria' },
    ],
  },
  {
    id: 'ura-filiais', name: 'URA Filiais e Representantes', departmentId: 'filiais', genesysFlowId: null,
    version: 'v2.0', status: 'ativa', description: 'Suporte interno a filiais, gerentes e representantes.',
    businessHours: 'Seg–Sáb 07h30–19h', queues: ['Suporte Filiais', 'Representantes'], lastChange: daysAgo(86),
    lastChangeNote: 'Inclusão de autenticação por código da filial', owner: 'Equipe Operações', requiresCpf: false, baseVolume: 1200,
    menu: [
      { key: '1', label: 'Status de reposição', kind: 'self', share: 0.3, successRate: 0.62, queue: 'Suporte Filiais' },
      { key: '2', label: 'Suporte de sistemas', kind: 'transfer', share: 0.4, queue: 'Suporte Filiais' },
      { key: '3', label: 'Representantes', kind: 'transfer', share: 0.3, queue: 'Representantes' },
    ],
  },
  {
    id: 'ura-seguros-vendas', name: 'URA Seguros — Vendas (piloto)', departmentId: 'seguros', genesysFlowId: null,
    version: 'v0.9', status: 'em-teste', description: 'Fluxo piloto de venda ativa de seguros.',
    businessHours: 'Seg–Sex 09h–17h', queues: ['Vendas Seguros'], lastChange: daysAgo(2),
    lastChangeNote: 'Versão piloto em homologação', owner: 'Equipe Seguros', requiresCpf: false, baseVolume: 120,
    menu: [
      { key: '1', label: 'Conhecer seguros', kind: 'self', share: 0.4, successRate: 0.5, queue: 'Vendas Seguros' },
      { key: '2', label: 'Falar com consultor', kind: 'transfer', share: 0.6, queue: 'Vendas Seguros' },
    ],
  },
];
