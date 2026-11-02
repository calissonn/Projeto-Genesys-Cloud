import { CheckCircle2, CircleDashed, Lock, PlugZap, ServerCog } from 'lucide-react';
import { useState } from 'react';
import { Card, CardHeader, PageHeader } from '../components/ui';
import { useApp } from '../context/AppContext';
import { BACKEND } from '../services/api';
import { IntegrationLive } from './Admin';
import { FLOW_METRICS, GENESYS_ENDPOINTS, INDICATORS } from '../data/genesysCatalog';

const NATIVE_VS_CONFIG: { indicator: string; native: string; config: string }[] = [
  { indicator: 'Entradas na URA', native: 'Sim — nFlow (agrupado por flowId)', config: '—' },
  { indicator: 'Desligamentos no fluxo', native: 'Sim — tFlowDisconnect; dimensões exitReason e disconnectType', config: 'Para saber EM QUAL ETAPA: Milestones no Architect' },
  { indicator: 'Tempo médio na URA', native: 'Sim — tFlow (sum ÷ count)', config: 'Tempo por etapa: Milestones/Outcomes (tFlowOutcome)' },
  { indicator: 'Transferências e destino', native: 'Sim — tFlowExit + transferType, transferTargetName/Address', config: 'Abandono após transferência: métricas de fila' },
  { indicator: 'Autosserviço concluído', native: 'Não', config: 'Flow Outcome com valor SUCCESS/FAILURE nos blocos de autosserviço' },
  { indicator: 'Falhas de CPF / tentativas', native: 'Não (exceto recognitionFailureReason em reconhecimento de fala/DTMF)', config: 'Milestones "tentativa", "falha", "excedido" ou Outcome "Identificação"' },
  { indicator: 'Erros de integração (Data Actions)', native: 'Parcial — dimensão errorCode; histórico de execução de fluxo', config: 'Milestone no caminho de falha das Data Actions (recomendado)' },
  { indicator: 'Mapa de jornada', native: 'Parcial — Journey Flows (flow paths), se licenciado', config: 'Milestones e Outcomes em cada etapa relevante' },
];

export function Integration() {
  const { dataSource, can } = useApp();
  const [ind, setInd] = useState(0);
  const rows = GENESYS_ENDPOINTS.filter((e) => !ind || e.indicators.includes(ind));
  return (
    <div>
      <PageHeader title="Integração Genesys Cloud" description="Situação da integração e mapa das APIs oficiais consultadas (somente leitura)." />
      {BACKEND && can('integration:read') && <div className="mb-5"><IntegrationLive /></div>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><PlugZap className="h-5 w-5" /></span>
            <div>
              <div className="text-sm text-slate-500">Situação</div>
              <div className="font-semibold">{dataSource.kind === 'simulado' ? 'Não configurada (modo protótipo)' : 'Modo backend'}</div>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            {dataSource.kind === 'simulado'
              ? 'O sistema está usando dados simulados. Nenhuma chamada é feita à Genesys Cloud.'
              : 'Os dados vêm do backend Gazin URA Intelligence.'}
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            <Step done={false} text="Cliente OAuth (Client Credentials) criado pela administração da Genesys, com função somente leitura" />
            <Step done={false} text="Credenciais armazenadas em cofre de segredos do backend (nunca no navegador)" />
            <Step done={false} text="Região da organização confirmada (ex.: sa-east-1 → sae1.pure.cloud)" />
            <Step done={false} text="IDs dos fluxos vinculados no Catálogo de URAs" />
            <Step done={false} text="Milestones e Outcomes configurados nos fluxos (para etapas, autosserviço e CPF)" />
            <Step done={true} text="Backend, banco PostgreSQL e adaptadores somente leitura implementados e testados (pasta server/)" />
          </ul>
          {!BACKEND && (
            <button className="btn-secondary mt-4 w-full text-xs" onClick={() => { sessionStorage.setItem('gui-simulate-error', '1'); window.location.assign('/'); }}>
              Testar tela de erro de carregamento
            </button>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Arquitetura de integração segura" />
          <div className="grid gap-3 p-4 text-sm sm:grid-cols-3">
            <Box icon={<ServerCog className="h-4 w-4" />} t="Front-end (este app)" d="Só chama a API do backend com sessão corporativa (SSO). Não conhece credenciais da Genesys." />
            <Box icon={<Lock className="h-4 w-4" />} t="Backend Node.js" d="OAuth Client Credentials, cache do token, fila com limite de requisições, retry em 429/5xx, paginação, jobs assíncronos e lista de endpoints permitidos (somente leitura)." />
            <Box icon={<PlugZap className="h-4 w-4" />} t="Genesys Cloud + PostgreSQL" d="Coletas agendadas gravam agregados horários no PostgreSQL; dados pessoais (ANI, CPF) não são armazenados." />
          </div>
          <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800">
            <div className="mb-1">Métricas de fluxo oficiais (FlowAggregationQuery):</div>
            <div className="flex flex-wrap gap-1">{FLOW_METRICS.map((m) => <code key={m} className="rounded bg-slate-100 px-1 dark:bg-slate-800">{m}</code>)}</div>
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Indicador nativo × configuração necessária no Architect" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="th">Indicador</th><th className="th">Disponível nativamente?</th><th className="th">O que configurar</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {NATIVE_VS_CONFIG.map((r) => <tr key={r.indicator}><td className="td font-medium">{r.indicator}</td><td className="td">{r.native}</td><td className="td text-slate-600 dark:text-slate-300">{r.config}</td></tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-5">
        <CardHeader title="APIs oficiais (somente leitura)" subtitle="Extraídas da especificação OpenAPI oficial da Genesys Cloud. Detalhes, exemplos e limitações em docs/GENESYS_API.md."
          actions={
            <select className="input w-auto" value={ind} onChange={(e) => setInd(Number(e.target.value))}>
              <option value={0}>Todos os indicadores</option>
              {INDICATORS.map((t, i) => <option key={t} value={i + 1}>{i + 1}. {t}</option>)}
            </select>
          } />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="th">Endpoint</th><th className="th">Finalidade</th><th className="th">Permissões</th><th className="th">Limitações</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="td w-[280px] min-w-[280px]"><span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${e.method === 'GET' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'}`}>{e.method}</span><code className="break-all text-xs">{e.path}</code>
                    {e.readOnlyPost && <div className="mt-1 text-[11px] text-slate-500">POST de consulta — não altera dados</div>}</td>
                  <td className="td">{e.purpose}<div className="mt-1 text-xs text-slate-500">{e.keyParams}</div></td>
                  <td className="td text-xs"><div className="text-slate-500">{e.permissionMode === 'ANY' ? 'Qualquer uma de:' : 'Todas:'}</div>{e.permissions.map((p) => <code key={p} className="block">{p}</code>)}</td>
                  <td className="td text-xs text-slate-600 dark:text-slate-300">{e.limitations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const Step = ({ done, text }: { done: boolean; text: string }) => (
  <li className="flex items-start gap-2">{done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}<span className={done ? '' : 'text-slate-600 dark:text-slate-300'}>{text}</span></li>
);
const Box = ({ icon, t, d }: { icon: React.ReactNode; t: string; d: string }) => (
  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><div className="flex items-center gap-1.5 font-medium">{icon}{t}</div><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{d}</p></div>
);
