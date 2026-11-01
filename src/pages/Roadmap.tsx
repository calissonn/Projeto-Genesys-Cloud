import { ArrowRight, CalendarClock, Database } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, PageHeader } from '../components/ui';

export interface ModulePlan {
  title: string;
  stage: number;
  summary: string;
  features: string[];
  requires: string[];
  related?: { to: string; label: string }[];
}

/** Página de módulo planejado: descreve o escopo e o que é necessário — sem botões sem função. */
export function Roadmap({ plan }: { plan: ModulePlan }) {
  return (
    <div>
      <PageHeader title={plan.title} description={plan.summary} />
      <div className="mb-5 flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        <span>Módulo planejado para a <b>Etapa {plan.stage}</b>. Ainda não implementado nesta versão (MVP — Etapa 1). Abaixo, o escopo previsto e os pré-requisitos.</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Funcionalidades previstas" />
          <ul className="list-disc space-y-1.5 py-3 pl-9 pr-4 text-sm text-slate-700 dark:text-slate-300">{plan.features.map((f) => <li key={f}>{f}</li>)}</ul>
        </Card>
        <Card>
          <CardHeader title="O que será necessário" />
          <ul className="space-y-2 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
            {plan.requires.map((f) => <li key={f} className="flex gap-2"><Database className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{f}</li>)}
          </ul>
        </Card>
      </div>
      {plan.related && (
        <Card className="mt-5">
          <CardHeader title="Disponível agora no MVP" />
          <div className="flex flex-wrap gap-2 p-4">
            {plan.related.map((r) => <Link key={r.to} to={r.to} className="btn-secondary">{r.label} <ArrowRight className="h-4 w-4" /></Link>)}
          </div>
        </Card>
      )}
    </div>
  );
}

export const PLANS: Record<string, ModulePlan> = {
  desligamentos: {
    title: 'Análise de desligamentos', stage: 2,
    summary: 'Área dedicada aos desligamentos e abandonos: por opção, etapa, horário, departamento e URA, com classificação crítica por metas.',
    features: ['Desligamentos por opção, etapa, horário e departamento', 'Evolução diária e semanal; comparação entre URAs', 'Principais pontos de saída da jornada', 'Classificação crítica baseada em metas configuráveis', 'Separação entre desligamento na URA e abandono após transferência (fila)', 'Identificação de padrões (dia da semana, horário, versão do fluxo)'],
    requires: ['Métricas tFlowDisconnect / nFlow por flowId e flowVersion (nativas)', 'Milestones por etapa no Architect para localizar o ponto de saída', 'Métricas de fila (Conversation Aggregates) para abandono após transferência'],
    related: [{ to: '/', label: 'Dashboard (taxas e ranking de desligamento)' }, { to: '/mapa', label: 'Mapa da URA (desligamento por etapa)' }],
  },
  falhas: {
    title: 'Monitoramento de falhas', stage: 2,
    summary: 'Central de falhas operacionais: CPF, tentativas excedidas, integrações, consultas de API, transferências e erros de fluxo.',
    features: ['Falhas de identificação por CPF e tentativas excedidas', 'Erros de integração e de consultas (Data Actions)', 'Transferências malsucedidas e erros de fluxo do Architect', 'Navegação inesperada (loops excessivos, opção inválida)', 'Ocorrências com data, departamento, URA, criticidade, status, responsável e histórico', 'Regras personalizadas (reaproveitando o motor da Central de alertas)'],
    requires: ['Milestones nos caminhos de falha (CPF inválido, timeout, excedido, falha de Data Action)', 'Dimensões errorCode / recognitionFailureReason nas métricas de fluxo', 'Histórico de execução de fluxo habilitado para diagnóstico de casos (opcional)'],
    related: [{ to: '/alertas', label: 'Central de alertas (regras de falha de CPF e integração)' }],
  },
  ia: {
    title: 'Inteligência Artificial CX', stage: 4,
    summary: 'Análises inteligentes com problema, dados utilizados, evidências, possíveis causas, grau de confiança, recomendação, impacto esperado e forma de validar.',
    features: ['Tendências e mudanças anormais (detecção estatística antes de qualquer LLM)', 'Etapas com dificuldade recorrente e oportunidades de autosserviço', 'Antes × depois de alterações (por flowVersion)', 'Resumo executivo e priorização do que investigar primeiro', 'Hipóteses sempre rotuladas como hipóteses, nunca como diagnóstico'],
    requires: ['Dados reais consolidados no PostgreSQL (Etapa 3)', 'Aprovação do uso de API de IA pela Gazin (jurídico/segurança)', 'Envio apenas de agregados anonimizados — nunca gravações, transcrições ou dados pessoais'],
    related: [{ to: '/alertas', label: 'Alertas com indicação de alteração recente na URA' }],
  },
  testes: {
    title: 'Gestão de testes das URAs', stage: 2,
    summary: 'Registro de testes funcionais antes da publicação de alterações, organizados por versão da URA.',
    features: ['Cenários: CPF válido/inválido, três tentativas, ausência de digitação, transferência, fora do horário, feriados, sobreaviso, falha de integração, contingência', 'Comportamento esperado × obtido, evidências (anexos)', 'Status aprovado / reprovado / pendente, responsável, data e versão', 'Histórico por versão'],
    requires: ['Banco de dados (tabelas test_scenario, test_run, test_evidence — ver server/db/schema.sql)', 'Armazenamento de arquivos para evidências', 'Perfis de acesso (Analista CX / Administrador)'],
  },
  relatorios: {
    title: 'Relatórios gerenciais', stage: 2,
    summary: 'Relatórios com filtros, gráficos, conclusões e recomendações, exportáveis em Excel e PDF.',
    features: ['Desempenho geral; desligamentos por departamento e por etapa', 'Transferências por destino; conclusão de autosserviços', 'Falhas operacionais; análise de alterações nos fluxos; comparativo entre períodos', 'Histórico de alertas; relatório executivo com análise inteligente', 'Exportação Excel (.xlsx) e PDF'],
    requires: ['Dados consolidados por período no backend', 'Geração de arquivos no servidor (para relatórios grandes)'],
    related: [{ to: '/', label: 'Dashboard executivo' }],
  },
  admin: {
    title: 'Administração', stage: 3,
    summary: 'Cadastros, usuários, perfis de acesso, metas, integrações e auditoria.',
    features: ['Departamentos, URAs (com IDs de fluxo) e filas', 'Usuários e perfis: Administrador, Analista CX, Supervisor, Gestor', 'Metas personalizadas por indicador e URA', 'Configuração de integrações', 'Histórico de alterações e auditoria de ações'],
    requires: ['Autenticação corporativa (SSO) no backend', 'Tabelas de usuários, perfis e auditoria (server/db/schema.sql)'],
    related: [{ to: '/uras', label: 'Catálogo de URAs (cadastro básico)' }],
  },
};
