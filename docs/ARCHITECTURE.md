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
| `lib/exporters.ts` | Exportação CSV, Excel (ExcelJS) e PDF (jsPDF + AutoTable), carregadas sob demanda |
| `data/changeLog.ts`, `data/testSeed.ts` | Histórico de versões e testes de exemplo (simulados) |
| `services/dataProvider.ts` | Provedor de dados: `mockProvider` (MVP) ou `backendProvider` (`VITE_DATA_SOURCE=backend`) |
| `context/AppContext.tsx` | Estado global: tema, filtros, catálogo, metas, regras, ocorrências |
| `pages/` | Dashboard, Catálogo, Mapa, Alertas, Integração e páginas de módulos planejados |

### Regras de contagem

- **Entradas** (nFlow) ≠ **conversas únicas** (conversationId distinto) ≠ **atendidas por humano** (métrica de fila). Nunca somadas entre si.
- No consolidado multi-URA, conversas que passaram por mais de uma URA são descontadas (`inherited`).
- Desligamento na URA (fluxo) é separado de abandono na fila (após transferência).

### Persistência no MVP
Preferências, metas, regras de alerta, tratamento de ocorrências, URAs cadastradas, testes (com evidências até 300 KB), alterações registradas e auditoria ficam no `localStorage` do navegador (protótipo).
Na Etapa 3 migram para o PostgreSQL (`server/src/db/schema.sql`) com auditoria.

## Backend (`server/`)

| Arquivo | Responsabilidade |
|---|---|
| `src/config.ts` | Lê credenciais **apenas** de variáveis de ambiente / cofre |
| `src/genesys/auth.ts` | OAuth Client Credentials, cache e renovação antecipada do token, chamadas concorrentes compartilham a mesma renovação |
| `src/genesys/allowlist.ts` | Lista de endpoints permitidos (GET e POST de consulta). Ações (`/flows/actions/*`, POST/PUT/DELETE de configuração) são bloqueadas |
| `src/genesys/client.ts` | Limitador de taxa, retry com backoff exponencial e `Retry-After` em 429/5xx, renovação em 401, timeout, paginação por página e por cursor, jobs assíncronos |
| `src/genesys/queries.ts` | Consultas de agregados usando apenas métricas/dimensões oficiais |
| `src/collectors/` | Coleta horária e histórica, mapeamento da resposta, upsert idempotente, registro em `sync_run` |
| `src/db/schema.sql` | Esquema PostgreSQL |
| `test/` | Testes (allowlist, retry 429, bloqueio, mapeamento) |

### Estratégia de sincronização
1. **Dicionários (diário):** flows (`type=INBOUNDCALL`), versões, milestones, outcomes, filas, call routes.
2. **Incremental (15 min):** agregados `PT1H` das últimas 2 horas (reprocessa para capturar dados tardios).
3. **Fechamento (diário):** D-1 completo via job assíncrono.
4. **Backfill histórico:** jobs assíncronos em janelas (ex.: 7 dias), com retomada a partir de `sync_run`.

## Segurança e LGPD
- Credenciais só no servidor; função OAuth com permissões `:view`/`:search`.
- Allowlist impede qualquer escrita na Genesys.
- Armazenamento apenas de agregados; ANI, CPF, nomes, gravações e transcrições não são persistidos.
- IA (Etapa 4): somente agregados anonimizados e após autorização formal.
- Autenticação corporativa (SSO/OIDC), perfis (Administrador, Analista CX, Supervisor, Gestor) e trilha de auditoria — Etapa 3.

## Roadmap
| Etapa | Escopo | Situação |
|---|---|---|
| 1 | Dashboard, catálogo, mapa interativo, central de alertas, dados simulados | **Concluída (este MVP)** |
| 2 | Detalhamento por etapa, comparação, falhas, relatórios, histórico, testes | **Concluída** |
| 3 | Banco, backend, adaptadores Genesys | **Estrutura criada** em `server/` (não conectada) |
| 4 | IA CX | Planejada |

## Notas da Etapa 2
- **Significância estatística:** comparações de taxas usam teste de duas proporções (aproximação normal, p < 0,05, mínimo de 30 observações por grupo). Indica diferença improvável por acaso — não prova causa.
- **Conclusões e recomendações** dos relatórios são geradas por regras explícitas e redigidas como hipóteses quando citam causas. Análise por IA fica para a Etapa 4.
- **Desligamento esperado:** desligamentos após a mensagem de fora do horário não são classificados como problema.
- **Dependências de exportação:** `exceljs` traz dependências transitivas com alertas moderados do `npm audit` (`minimatch`, `uuid`) que não afetam o uso no navegador (apenas geração de arquivos); reavaliar ao atualizar a biblioteca.
