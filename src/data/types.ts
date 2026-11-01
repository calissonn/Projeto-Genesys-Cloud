/**
 * Modelo de domínio do Gazin URA Intelligence.
 *
 * IMPORTANTE: nesta etapa (MVP) todos os números vêm do gerador de dados
 * SIMULADOS em `mockData.ts`. Os nomes dos campos foram pensados para
 * mapear, no futuro, métricas de Analytics da Genesys Cloud — mas o
 * mapeamento exato deve ser validado na documentação oficial (ver docs/).
 */

export type DataSourceKind = 'simulado' | 'genesys';

export interface Department {
  id: string;
  name: string;
  short: string;
}

export type UraStatus = 'ativa' | 'em-teste' | 'inativa';

export interface MenuOptionConfig {
  key: string; // dígito DTMF
  label: string;
  kind: 'self' | 'transfer';
  queue?: string; // fila de destino (transfer) ou fila de fallback
  share: number; // participação relativa na escolha do menu
  successRate?: number; // conclusão do autosserviço
}

export interface Ura {
  id: string;
  name: string;
  departmentId: string;
  /** ID do fluxo no Architect. `null` = ainda não vinculado. */
  genesysFlowId: string | null;
  version: string;
  status: UraStatus;
  description: string;
  businessHours: string;
  queues: string[];
  lastChange: string; // ISO date
  lastChangeNote: string;
  owner: string;
  requiresCpf: boolean;
  menu: MenuOptionConfig[];
  /** URA cadastrada pelo usuário — não possui dados simulados. */
  userCreated?: boolean;
  baseVolume: number; // volume médio diário simulado
}

/** Registro horário de uma URA (dados agregados). */
export interface HourRecord {
  uraId: string;
  date: string; // YYYY-MM-DD
  hour: number; // 0-23
  /** Entradas no fluxo (uma conversa pode entrar mais de uma vez). */
  entries: number;
  /** Conversas distintas que entraram nesta URA. */
  unique: number;
  /** Conversas que já haviam passado por OUTRA URA antes (evita dupla contagem no consolidado). */
  inherited: number;
  /** Desligamentos pelo cliente dentro da URA. */
  disconnects: number;
  /** Transferências para fila / atendimento humano. */
  transfers: number;
  /** Autosserviços concluídos (outcome de sucesso). */
  selfService: number;
  /** Saídas restantes (encerramento pelo fluxo, fora do horário, etc.). */
  otherExits: number;
  /** Soma do tempo de permanência na URA (segundos). */
  durationSec: number;
  /** Falhas de identificação por CPF (tentativas não validadas). */
  authFailures: number;
  /** Tentativas de identificação (para cálculo de taxa). */
  authAttempts: number;
  /** Erros em integrações / consultas de API dentro do fluxo. */
  integrationErrors: number;
  /** Transferências que não completaram (fila indisponível, erro). */
  transferFailures: number;
  /** Abandonos APÓS a transferência (na fila humana) — fonte diferente: métricas de fila. */
  queueAbandons: number;
  /** Ligações que atingiram o limite de tentativas de identificação. */
  cpfExceeded: number;
  /** Falhas em consultas de API de negócio (saldo, boleto, rastreio...). */
  apiErrors: number;
  /** Erros de execução do fluxo no Architect (ex.: caminho de erro acionado). */
  flowErrors: number;
  /** Seleções de opção inválida / sem digitação no menu (navegação inesperada). */
  invalidOptions: number;
}

export interface Totals {
  entries: number;
  unique: number;
  uniqueDistinct: number;
  disconnects: number;
  transfers: number;
  selfService: number;
  otherExits: number;
  durationSec: number;
  authFailures: number;
  authAttempts: number;
  integrationErrors: number;
  transferFailures: number;
  queueAbandons: number;
  cpfExceeded: number;
  apiErrors: number;
  flowErrors: number;
  invalidOptions: number;
  failures: number;
}

export type Severity = 'baixa' | 'media' | 'alta' | 'critica';

export type MetricKey =
  | 'disconnectRate'
  | 'transferRate'
  | 'selfServiceRate'
  | 'authFailureRate'
  | 'integrationErrors'
  | 'failures'
  | 'entries'
  | 'avgDuration'
  | 'apiErrors'
  | 'transferFailures'
  | 'cpfExceeded'
  | 'invalidOptionRate'
  | 'flowErrors';

export type AlertCondition = 'acima_de' | 'abaixo_de' | 'aumento_pct' | 'queda_pct';

export interface AlertRule {
  id: string;
  name: string;
  metric: MetricKey;
  condition: AlertCondition;
  threshold: number;
  departmentId: string; // 'all' = todos
  uraId: string; // 'all' = todas do escopo
  severity: Severity;
  owner: string;
  enabled: boolean;
  /** Volume mínimo de entradas no dia/janela para avaliar (evita falso positivo). */
  minVolume: number;
  /** Considerar apenas o horário de funcionamento (08h–20h). */
  businessHoursOnly: boolean;
  /** Dias anteriores usados como linha de base nas condições de variação. */
  baselineDays: number;
  createdAt: string;
}

export type OccurrenceStatus = 'aberta' | 'em_analise' | 'resolvida' | 'descartada';

export interface OccurrenceEvent {
  at: string;
  by: string;
  text: string;
}

export interface AlertOccurrence {
  id: string;
  ruleId: string;
  ruleName: string;
  uraId: string;
  departmentId: string;
  date: string;
  metric: MetricKey;
  value: number;
  baseline: number | null;
  threshold: number;
  condition: AlertCondition;
  severity: Severity;
  volume: number;
  status: OccurrenceStatus;
  owner: string;
  history: OccurrenceEvent[];
}

/** Origem do dado de cada etapa no mapa — indica a instrumentação exigida em produção. */
export type NodeDataSource = 'nativo' | 'milestone' | 'outcome' | 'destination' | 'journey';

export type FlowNodeKind = 'start' | 'message' | 'decision' | 'input' | 'menu' | 'selfservice' | 'transfer' | 'end' | 'error';

export interface FlowEdgeDef {
  to: string;
  p: number; // probabilidade relativa de seguir este caminho
  label?: string;
  loop?: boolean;
}

export interface FlowNodeDef {
  id: string;
  label: string;
  kind: FlowNodeKind;
  source: NodeDataSource;
  disconnectRate: number; // fração dos que chegam e desligam aqui
  errorRate: number; // fração com erro registrado
  avgSec: number | null; // permanência média na etapa
  edges: FlowEdgeDef[];
  queue?: string;
  note?: string;
}

export interface FlowModel {
  uraId: string;
  nodes: FlowNodeDef[];
}

export interface Goals {
  disconnectWarn: number; // %
  disconnectCrit: number; // %
  selfServiceTarget: number; // %
  transferMax: number; // %
  authFailureWarn: number; // %
  authFailureCrit: number; // %
  stepDisconnectWarn: number; // % por etapa do mapa
  stepDisconnectCrit: number; // % por etapa do mapa
}

export type TestStatus = 'aprovado' | 'reprovado' | 'pendente';

export interface TestEvidence {
  id: string;
  name: string;
  kind: 'texto' | 'imagem' | 'arquivo';
  /** Conteúdo textual ou data URL (somente arquivos pequenos no protótipo). */
  content: string;
  addedAt: string;
}

export interface TestCase {
  id: string;
  uraId: string;
  version: string;
  scenario: string; // categoria (ex.: "CPF inválido")
  title: string;
  steps: string;
  expected: string;
  obtained: string;
  status: TestStatus;
  owner: string;
  date: string; // YYYY-MM-DD
  evidences: TestEvidence[];
  history: OccurrenceEvent[];
}

export interface UraChange {
  id: string;
  uraId: string;
  version: string;
  date: string; // YYYY-MM-DD (publicação)
  author: string;
  description: string;
  type: 'menu' | 'identificacao' | 'integracao' | 'mensagem' | 'roteamento' | 'horario' | 'novo';
  /** Origem do registro: simulado (protótipo) ou cadastrado pelo usuário. */
  source: 'simulado' | 'usuario';
}

export interface AuditEntry {
  id: string;
  at: string; // ISO
  user: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
}
