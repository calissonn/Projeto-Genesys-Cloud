# Arquitetura — Gazin URA Intelligence

## Visão geral

```
┌──────────────────────────┐   HTTPS + SSO    ┌───────────────────────────────┐   OAuth Client Credentials   ┌──────────────────┐
│ Front-end React (Vite)   │ ───────────────▶ │ Backend Node.js (server/)     │ ───────────────────────────▶ │ Genesys Cloud    │
│ - telas e gráficos       │   /api/*         │ - GenesysAuth (token)         │   somente leitura            │ Platform API     │
│ - motor de alertas (MVP) │                  │ - GenesysClient (allowlist,   │                              └──────────────────┘
│ - dados simulados (MVP)  │                  │   rate limit, retry, paginação│
└──────────────────────────┘                  │ - coletores agendados         │──▶ PostgreSQL (agregados, sem dados pessoais)
                                              └───────────────────────────────┘
```

O front-end **nunca** acessa a Genesys diretamente nem conhece credenciais.

## Front-end (`src/`)

| Pasta | Conteúdo |
|---|---|
| `data/types.ts` | Modelo de domínio (URA, registro horário, regras e ocorrências de alerta, modelo de fluxo, metas) |
| `data/catalog.ts` | Departamentos e URAs **simulados** (IDs de fluxo nulos = não vinculados) |
| `data/mockData.ts` | Gerador determinístico de dados horários fictícios, coerentes (`entradas = desligamentos + transferências + autosserviços + outras saídas`) e com cenários de demonstração |
| `data/flowModel.ts` | Modelo de etapas da URA, propagação de volume com loops (ponto fixo) e calibração pelas taxas do período; cada etapa indica a instrumentação exigida em produção |
| `data/genesysCatalog.ts` | Catálogo das APIs oficiais (somente leitura) exibido na tela de Integração |
| `lib/metrics.ts` | Índice por data, totais, taxas, agrupamentos, período anterior |
| `lib/alertEngine.ts` | Avaliação diária das regras com volume mínimo, horário comercial e linha de base; detecção automática de anomalias de falha (z-score ≥ 3 sobre 14 dias, variação absoluta e volume mínimos) |
| `lib/stepAnalytics.ts` | Desligamentos por etapa e por opção do menu (modelo calibrado) e teste de duas proporções |
| `lib/reports.ts` | Montagem dos 10 relatórios, com conclusões e recomendações geradas por regras explícitas |
| `lib/insights.ts` | Motor da Inteligência CX: antes × depois de alterações, tendências, mudanças anormais, etapas recorrentes, oportunidades de autosserviço e metas; priorização e resumo executivo (estatística + regras) |
| `lib/exporters.ts` | Exportação CSV, Excel (ExcelJS) e PDF (jsPDF + AutoTable), carregadas sob demanda |
| `data/changeLog.ts`, `data/testSeed.ts` | Histórico de versões e testes de exemplo (simulados) |
| `services/dataProvider.ts` | Provedor de dados: `mockProvider` (MVP) ou `backendProvider` (`VITE_DATA_SOURCE=backend`) |
| `context/AppContext.tsx` | Estado global: tema, filtros, catálogo, metas, regras, ocorrências |
| `pages/` | Dashboard, Catálogo, Mapa, Alertas, Integração e páginas de módulos planejados |

### Regras de contagem

- **Entradas** (nFlow) ≠ **conversas únicas** (conversationId distinto) ≠ **atendidas por humano** (métrica de fila). Nunca somadas entre si.
- No consolidado multi-URA, conversas que passaram por mais de uma URA são descontadas (`inherited`).
- Desligamento na URA (fluxo) é separado de abandono na fila (após transferência).

### Persistência
- **Modo protótipo** (padrão): preferências, metas, regras, tratamento de ocorrências, URAs cadastradas, testes, alterações e auditoria ficam no `localStorage` do navegador.
- **Modo backend** (`VITE_DATA_SOURCE=backend`, `npm run dev:backend`): tudo é lido e gravado pela API (`services/api.ts`, `lib/useCollection.ts`); o servidor audita cada alteração. A escolha é fixa no build.

## Backend (`server/`)

| Arquivo | Responsabilidade |
|---|---|
| `src/main.ts` | Inicialização: configuração, migrações, API, agendador |
| `src/config.ts` | Variáveis de ambiente; bloqueia configurações inseguras em produção |
| `src/db/migrations/*.sql`, `src/db/migrate.ts` | Esquema PostgreSQL versionado (com advisory lock) |
| `src/auth/identity.ts` | Identidade via proxy de SSO (cabeçalho + segredo compartilhado) ou modo dev |
| `src/auth/rbac.ts` | Perfis (Administrador, Analista CX, Supervisor, Gestor), permissões e escopo por departamento |
| `src/api/app.ts` | API REST (Fastify): catálogo, métricas, coleções, metas, usuários, auditoria, integração; validação de entrada e cabeçalhos de segurança |
| `src/api/metricsService.ts` | Converte os fatos coletados em registros horários por URA (regras de conversão documentadas no arquivo) |
| `src/genesys/*` | OAuth Client Credentials, cliente somente leitura (allowlist, limite de taxa, retry 429/5xx, paginação, jobs assíncronos), consultas |
| `src/sync/*` | Dicionários, coleta por janela, orquestração com locks, backfill retomável, agendador |
| `src/ai/summary.ts` | Redação opcional por IA (SDK oficial da Anthropic): esquema fechado do payload, bloqueio de dados pessoais, limite por usuário, fallback em caso de recusa |
| `src/mock/anthropicMock.ts` | API Anthropic **falsa** para testes (sem custo, sem envio de dados) |
| `src/mock/genesysMock.ts` | Servidor Genesys **simulado** (mesmos formatos dos schemas oficiais) para desenvolvimento e testes |
| `test/*.test.ts` | Testes unitários e de integração (PostgreSQL real + API + Genesys simulado) |

### Modelo de dados
- **Cadastros:** `department`, `ura` (com `genesys_flow_id` único), `queue`.
- **Acesso:** `app_user`, `user_department` (escopo do supervisor), `audit_log` (somente inclusão).
- **Aplicação:** `app_setting` (metas), `alert_rule`, `occurrence_state`, `test_case`, `ura_change` (JSON no mesmo formato do front-end).
- **Dicionários Genesys:** `genesys_flow`, `genesys_flow_version`, `genesys_milestone`, `genesys_outcome`, `instrumentation_map` (papel de cada milestone/outcome).
- **Fatos:** `flow_hour` (nFlow, tFlow, tFlowDisconnect, tFlowExit por fluxo/versão/hora) e `flow_dimension_hour` (milestones, outcomes, destinos).
- **Operação:** `sync_run` (cada coleta), `backfill_window` (retomada do histórico).

### Estratégia de sincronização
1. **Dicionários** (inicialização e diário): fluxos `INBOUNDCALL`, versões dos fluxos vinculados (viram registros no Histórico), milestones, outcomes, filas. Ao vincular um fluxo a uma URA, as versões são importadas na hora.
2. **Incremental** (15 min): agregados `PT1H` das últimas horas, reprocessando para capturar dados tardios (upsert idempotente).
3. **Fechamento** (diário): últimas 24 h via job assíncrono.
4. **Backfill**: janelas de 7 dias via jobs assíncronos; janelas com erro ficam pendentes e são retomadas.
5. Cada tipo de coleta usa um advisory lock — nunca roda em duplicidade, mesmo com várias instâncias.

### Limitações conhecidas (dados reais)
- **Conversas únicas** e **abandono na fila** não vêm dos agregados de fluxo: exigem Conversation Details / métricas de fila (próxima evolução). A interface mostra “—” e um aviso.
- **Mapa inteligente** em modo backend: as etapas dependem de Milestones mapeadas; a montagem automática do grafo a partir da configuração do fluxo (`/versions/{id}/configuration`) é a próxima evolução.
- Regras de conversão (ex.: `transferType` = transferência humana) devem ser validadas com dados reais.

## Segurança e LGPD
- Credenciais só no servidor; função OAuth com permissões `:view`/`:search`.
- Allowlist impede qualquer escrita na Genesys.
- Armazenamento apenas de agregados; ANI, CPF, nomes, gravações e transcrições não são persistidos.
- IA (Etapa 4): somente agregados anonimizados e após autorização formal.
- Autenticação corporativa via proxy de SSO; perfis com escopo por departamento aplicados no servidor; auditoria imutável no banco.
- Credenciais da Genesys só no servidor; cliente com allowlist somente leitura (testado: toda chamada feita ao Genesys simulado é verificada contra a allowlist).

## Roadmap
| Etapa | Escopo | Situação |
|---|---|---|
| 1 | Dashboard, catálogo, mapa interativo, central de alertas, dados simulados | **Concluída (este MVP)** |
| 2 | Detalhamento por etapa, comparação, falhas, relatórios, histórico, testes | **Concluída** |
| 3 | Banco, backend, adaptadores Genesys, perfis, Administração | **Concluída** (validada com Genesys simulado; falta credencial real) |
| 4 | Inteligência CX (análises, priorização, IA opcional) | **Concluída** |

## Notas da Etapa 2
- **Significância estatística:** comparações de taxas usam teste de duas proporções (aproximação normal, p < 0,05, mínimo de 30 observações por grupo). Indica diferença improvável por acaso — não prova causa.
- **Conclusões e recomendações** dos relatórios são geradas por regras explícitas e redigidas como hipóteses quando citam causas. Análise por IA fica para a Etapa 4.
- **Desligamento esperado:** desligamentos após a mensagem de fora do horário não são classificados como problema.
- **Dependências de exportação:** `exceljs` traz dependências transitivas com alertas moderados do `npm audit` (`minimatch`, `uuid`) que não afetam o uso no navegador (apenas geração de arquivos); reavaliar ao atualizar a biblioteca.

## Notas da Etapa 4 — Inteligência CX
- **A inteligência é estatística e por regras**, executada no próprio sistema: antes × depois de alterações (teste de duas proporções, p < 0,01), tendências (regressão linear + teste entre metades da janela), mudanças anormais (ocorrências abertas), etapas recorrentes (3 de 4 semanas acima da meta), oportunidades de autosserviço e metas.
- Cada análise contém: problema, dados utilizados, evidências, possíveis causas (sempre **hipóteses**), grau de confiança com justificativa, recomendação, impacto esperado e forma de validar. As causas e recomendações vêm de uma base de conhecimento explícita no código (`changePlaybook`, `stepPlaybook`), revisável pela equipe de CX.
- **Priorização:** ligações afetadas por semana (estimativa) × criticidade × confiança.
- **IA generativa (opcional):** apenas redige o resumo a partir das análises; não calcula números. Desligada por padrão; ver `docs/DEPLOY.md` §2.5.
- O tratamento das análises (nova, em investigação, ação definida, resolvida, descartada) é gravado (`insight_state`) e auditado.
- A API recusa campos fora do esquema em todas as rotas (`removeAdditional: false`), em vez de removê-los silenciosamente.
