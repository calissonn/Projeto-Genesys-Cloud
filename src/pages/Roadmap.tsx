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
        <span>Módulo planejado para a <b>Etapa {plan.stage}</b>. Ainda não implementado nesta versão (Etapa 2). Abaixo, o escopo previsto e os pré-requisitos.</span>
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
          <CardHeader title="Disponível agora" />
          <div className="flex flex-wrap gap-2 p-4">
            {plan.related.map((r) => <Link key={r.to} to={r.to} className="btn-secondary">{r.label} <ArrowRight className="h-4 w-4" /></Link>)}
          </div>
        </Card>
      )}
    </div>
  );
}

export const PLANS: Record<string, ModulePlan> = {


  ia: {
    title: 'Inteligência Artificial CX', stage: 4,
    summary: 'Análises inteligentes com problema, dados utilizados, evidências, possíveis causas, grau de confiança, recomendação, impacto esperado e forma de validar.',
    features: ['Tendências e mudanças anormais (detecção estatística antes de qualquer LLM)', 'Etapas com dificuldade recorrente e oportunidades de autosserviço', 'Antes × depois de alterações (por flowVersion)', 'Resumo executivo e priorização do que investigar primeiro', 'Hipóteses sempre rotuladas como hipóteses, nunca como diagnóstico'],
    requires: ['Dados reais consolidados no PostgreSQL (Etapa 3)', 'Aprovação do uso de API de IA pela Gazin (jurídico/segurança)', 'Envio apenas de agregados anonimizados — nunca gravações, transcrições ou dados pessoais'],
    related: [{ to: '/comparacao', label: 'Comparação antes × depois com significância' }, { to: '/relatorios', label: 'Relatório executivo (análise por regras)' }],
  },


  admin: {
    title: 'Administração', stage: 3,
    summary: 'Cadastros, usuários, perfis de acesso, metas, integrações e auditoria.',
    features: ['Departamentos, URAs (com IDs de fluxo) e filas', 'Usuários e perfis: Administrador, Analista CX, Supervisor, Gestor', 'Metas personalizadas por indicador e URA', 'Configuração de integrações', 'Histórico de alterações e auditoria de ações'],
    requires: ['Autenticação corporativa (SSO) no backend', 'Tabelas de usuários, perfis e auditoria (server/db/schema.sql)'],
    related: [{ to: '/uras', label: 'Catálogo de URAs (cadastro básico)' }, { to: '/historico', label: 'Histórico e auditoria' }],
  },
};
