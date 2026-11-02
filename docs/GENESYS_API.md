# APIs da Genesys Cloud para o Gazin URA Intelligence (somente leitura)

> **Fonte e método.** Todos os endpoints, métodos, parâmetros, permissões, escopos, métricas e
> dimensões deste documento foram **extraídos da especificação OpenAPI oficial** da Genesys Cloud
> Platform API (`swagger.json` publicado no repositório oficial
> [MyPureCloud/platform-client-sdk-javascript](https://github.com/MyPureCloud/platform-client-sdk-javascript),
> SDK `purecloud-platform-client-v2` v265.0.0, conferido em 01/11/2026). O extrato bruto está em
> [`referencias/genesys-openapi-extract.txt`](referencias/genesys-openapi-extract.txt).
>
> **Limitação desta pesquisa:** o domínio `developer.genesys.cloud` não estava acessível a partir do
> ambiente onde este documento foi gerado (bloqueio de rede). Por isso:
> - os **links de documentação** apontam para o API Explorer e para os guias oficiais, mas não puderam
>   ser abertos para conferência;
> - **limites numéricos** (requisições por minuto, tamanho máximo de intervalo, retenção) **não constam
>   da especificação OpenAPI** e estão marcados como **"confirmar"**. Antes de codificar, valide-os na
>   página oficial de limites: <https://developer.genesys.cloud/organization/organization/limits>
>   (URL citada na própria especificação).
> - Os **exemplos de resposta** seguem exatamente os *schemas* oficiais, mas os **valores são ilustrativos**.

---

## 1. Resumo: qual API responde a qual indicador

| # | Indicador | API principal | Nativo? | Configuração no Architect |
|---|-----------|---------------|---------|---------------------------|
| 1 | Entradas nas URAs | `POST /api/v2/analytics/flows/aggregates/query` → métrica **`nFlow`** | ✅ | — |
| 2 | Desligamentos dentro dos fluxos | idem → **`tFlowDisconnect`**; dimensões `exitReason`, `disconnectType` | ✅ (total) | Milestones para saber **em qual etapa** |
| 3 | Tempo médio de permanência | idem → **`tFlow`** (`sum ÷ count`) | ✅ (fluxo) | Milestones/Outcomes para tempo **por etapa** |
| 4 | Fluxos existentes no Architect | `GET /api/v2/flows` (+ `/{flowId}`, `/versions`, `/configuration`), `GET /api/v2/architect/ivrs` | ✅ | — |
| 5 | Destinos e transferências | aggregates → **`tFlowExit`** + `transferType`, `transferTargetName`, `transferTargetAddress`; `GET /api/v2/routing/queues`; filas: `POST /api/v2/analytics/conversations/aggregates/query` | ✅ | — |
| 6 | Flow Outcomes | aggregates → **`nFlowOutcome`, `nFlowOutcomeFailed`, `tFlowOutcome`** + `flowOutcomeId`/`flowOutcomeValue`; cadastro: `GET /api/v2/flows/outcomes` | ⚙️ | Criar Outcomes e acioná-los nos fluxos |
| 7 | Flow Milestones | aggregates → **`nFlowMilestone`, `oFlowMilestone`** + `flowMilestoneId`; cadastro: `GET /api/v2/flows/milestones` | ⚙️ | Criar Milestones e acioná-los nos fluxos |
| 8 | Falhas de identificação / tentativas de CPF | aggregates com `flowMilestoneId` (ou `flowOutcomeId`); `POST /api/v2/journey/flows/paths/query` (categoria `RecognitionFailure`/`Error`) | ❌ | **Obrigatório** instrumentar (ver §5) |
| 9 | Histórico de desempenho | `POST /api/v2/analytics/flows/aggregates/jobs` (assíncrono) + `granularity`; dimensão `flowVersion`; `GET /api/v2/flows/{flowId}/versions` | ✅ | — |
| 10 | Indicadores para mapas de jornada | `POST /api/v2/journey/flows/paths/query` (Journey Flows); `POST /api/v2/analytics/conversations/details/query` (ou `/jobs`) | ⚙️ | Milestones e Outcomes nas etapas |

✅ nativo · ⚙️ disponível na API, mas só com dados se houver instrumentação · ❌ não existe métrica pronta.

### Métricas oficiais de fluxo (enum `FlowAggregationQuery.metrics`)

`nFlow`, `nFlowMilestone`, `nFlowOutcome`, `nFlowOutcomeFailed`, `oFlowMilestone`, `tFlow`,
`tFlowDisconnect`, `tFlowExit`, `tFlowOutcome`. **Não existem** outras métricas de fluxo nesse endpoint.

Convenção de nomes (Analytics da Genesys): `n` = contagem; `t` = tempo (traz `count` e `sum` em ms;
o `count` de uma métrica `t` também é a quantidade de ocorrências); `o` = observação.
Interpretação a validar com dados reais:

| Métrica | Uso no sistema |
|---|---|
| `nFlow` | entradas no fluxo |
| `tFlow` | tempo no fluxo → tempo médio = `sum / count` |
| `tFlowDisconnect` | `count` = desligamentos dentro do fluxo; `sum` = tempo até desligar |
| `tFlowExit` | `count` = saídas do fluxo (transferências, etc.); agrupar por `transferType` |
| `nFlowOutcome` / `nFlowOutcomeFailed` | outcomes atingidos / falhos |
| `tFlowOutcome` | tempo para concluir o outcome |
| `nFlowMilestone` | quantas vezes cada milestone foi atingida |
| `oFlowMilestone` | observação de milestones (ver documentação) |

### Dimensões úteis (enum `groupBy` / `filter.dimension`)

`flowId`, `flowName`, `flowType`, `flowVersion`, `flowMilestoneId`, `flowOutcome`, `flowOutcomeId`,
`flowOutcomeValue`, `exitReason`, `disconnectType`, `transferType`, `transferTargetName`,
`transferTargetAddress`, `entryReason`, `entryType`, `recognitionFailureReason`, `errorCode`,
`selfServed`, `authenticated`, `queueId`, `dnis`, `conversationId`, `divisionId`, `startingLanguage`, `endingLanguage`
(lista completa no extrato).

---

## 2. Autenticação (OAuth) — usada por todas as chamadas

| Item | Valor |
|---|---|
| Tipo de concessão | **Client Credentials** (servidor-a-servidor, sem usuário) |
| Endpoint de token | `POST https://login.{região}/oauth/token` |
| Corpo | `grant_type=client_credentials` (form-urlencoded) |
| Cabeçalho | `Authorization: Basic base64(clientId:clientSecret)` |
| Host das APIs | `https://api.{região}` |
| Região da Gazin | **Leste dos EUA (`us-east-1`)** — confirmada pela usuária em 02/11/2026. Domínio `mypurecloud.com` (conforme `PureCloudRegionHosts` do SDK oficial) → `login.mypurecloud.com` / `api.mypurecloud.com` |

```http
POST https://login.mypurecloud.com/oauth/token
Authorization: Basic <base64(CLIENT_ID:CLIENT_SECRET)>
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
```
```json
{ "access_token": "eyJ...", "token_type": "bearer", "expires_in": 86399 }
```

**Permissões no Client Credentials:** são concedidas pela **função (role)** atribuída ao cliente OAuth
(e pelas divisões dessa função). Os **escopos** (`analytics:readonly`, `architect:readonly`…) se aplicam
às concessões com usuário (Code/PKCE/Implicit) — confirmar na documentação de OAuth.

**Função somente leitura recomendada** (todas as permissões são `:view`/`:search`, nenhuma de edição):

```
analytics:flowAggregate:view
analytics:flowObservation:view
analytics:conversationAggregate:view
analytics:conversationDetail:view          (só se usar Conversation Details)
analytics:rateLimitAggregate:view          (opcional — monitorar limites)
architect:flow:view
architect:flowMilestone:view
architect:flowOutcome:view
architect:flowInstance:search              (opcional — diagnóstico de execução)
routing:queue:view
routing:callRoute:view
journey:flowpaths:view                     (se Journey Flows estiver licenciado)
```

Não conceder: `architect:flow:edit`, `architect:flow:publish`, `architect:flowMilestone:add/edit`,
nem nenhuma permissão `:add`, `:edit`, `:delete`, `:publish`.

---

## 3. Endpoints detalhados

Convenções: todos exigem `Authorization: Bearer <token>`. Erros possíveis (declarados na especificação):
`400, 401, 403, 404, 408, 409, 413, 415, 429, 500, 503, 504`. **`429`** = limite de requisições
excedido (respeitar o cabeçalho `Retry-After` — confirmar nome/semântica na documentação).

### 3.1 Agregados de fluxo — `POST /api/v2/analytics/flows/aggregates/query`

- **Finalidade:** indicadores 1, 2, 3, 5, 6, 7, 8 e 9 — volume, desligamento, tempo, saídas, outcomes e milestones por fluxo/versão/período.
- **Permissão:** `analytics:flowAggregate:view` · **Escopos:** `analytics` ou `analytics:readonly`
- **Corpo (`FlowAggregationQuery`):**
  - `interval` **(obrigatório)** — ISO-8601 `início/fim`, ex. `2026-10-01T03:00:00.000Z/2026-11-01T03:00:00.000Z`
  - `metrics` **(obrigatório)** — lista das métricas acima
  - `granularity` — ex. `PT1H`, `P1D` (padrão = intervalo inteiro)
  - `timeZone` — ex. `America/Sao_Paulo` (padrão UTC)
  - `groupBy` — dimensões
  - `filter` — `{ type: "and"|"or", predicates: [{ type: "dimension", dimension, operator: "matches"|"exists"|"notExists", value }], clauses: [...] }`
  - `views`, `flattenMultivaluedDimensions`, `alternateTimeDimension` (`eventTime`)
- **Exemplo de requisição** (entradas, desligamentos, tempo e saídas por fluxo, por hora):
```json
{
  "interval": "2026-10-31T03:00:00.000Z/2026-11-01T03:00:00.000Z",
  "granularity": "PT1H",
  "timeZone": "America/Sao_Paulo",
  "groupBy": ["flowId"],
  "filter": {
    "type": "and",
    "predicates": [{ "type": "dimension", "dimension": "flowType", "operator": "matches", "value": "INBOUNDCALL" }]
  },
  "metrics": ["nFlow", "tFlow", "tFlowDisconnect", "tFlowExit"]
}
```
- **Exemplo de resposta** (`FlowAggregateQueryResponse`, valores ilustrativos):
```json
{
  "results": [
    {
      "group": { "flowId": "8f6c...-....-....-....-...." },
      "data": [
        {
          "interval": "2026-10-31T12:00:00.000Z/2026-10-31T13:00:00.000Z",
          "metrics": [
            { "metric": "nFlow",           "stats": { "count": 412 } },
            { "metric": "tFlow",           "stats": { "count": 412, "sum": 35021000, "max": 301000, "min": 900 } },
            { "metric": "tFlowDisconnect", "stats": { "count": 71,  "sum": 2810000 } },
            { "metric": "tFlowExit",       "stats": { "count": 296, "sum": 25110000 } }
          ]
        }
      ]
    }
  ]
}
```
- **Variações úteis:**
  - Destinos: `groupBy: ["flowId","transferType","transferTargetName"]`, `metrics: ["tFlowExit"]`
  - Motivo de saída: `groupBy: ["flowId","exitReason"]`
  - Outcomes: `groupBy: ["flowId","flowOutcomeId","flowOutcomeValue"]`, `metrics: ["nFlowOutcome","nFlowOutcomeFailed","tFlowOutcome"]`
  - Milestones: `groupBy: ["flowId","flowMilestoneId"]`, `metrics: ["nFlowMilestone"]`
  - Antes × depois: `groupBy: ["flowId","flowVersion"]`
- **Limitações:** síncrono; intervalo máximo e limite de requisições — **confirmar**. Para histórico longo, usar 3.2.
- **Documentação:** <https://developer.genesys.cloud/devapps/api-explorer#post-api-v2-analytics-flows-aggregates-query>

### 3.2 Agregados de fluxo assíncronos (histórico) — jobs

| Método | Caminho | Uso |
|---|---|---|
| POST | `/api/v2/analytics/flows/aggregates/jobs` | cria o job (corpo `FlowAsyncAggregationQuery` = mesmo da 3.1 + `pageSize`) → `{ "jobId": "..." }` |
| GET | `/api/v2/analytics/flows/aggregates/jobs/{jobId}` | status: `QUEUED`, `PENDING`, `FAILED`, `CANCELLED`, `FULFILLED`, `EXPIRED` (+ `expirationDate`, `errorMessage`) |
| GET | `/api/v2/analytics/flows/aggregates/jobs/{jobId}/results?cursor=` | página de resultados `{ results: [...], cursor }` — repetir enquanto houver `cursor` |

- **Permissão:** `analytics:flowAggregate:view` · **Escopos:** `analytics`, `analytics:readonly`
- **Limitações:** polling com backoff; resultados expiram; número de jobs simultâneos — **confirmar**.
- **Documentação:** <https://developer.genesys.cloud/devapps/api-explorer#post-api-v2-analytics-flows-aggregates-jobs>

### 3.3 Observação em tempo real — `POST /api/v2/analytics/flows/observations/query`

- **Finalidade:** quantas chamadas estão **agora** em cada fluxo (indicador 1 em tempo real).
- **Permissão:** `analytics:flowObservation:view`
- **Corpo (`FlowObservationQuery`):** `filter` **(obrigatório)**, `metrics` **(obrigatório, `["oFlow"]`)**
```json
{
  "filter": { "type": "or", "predicates": [
    { "type": "dimension", "dimension": "flowId", "operator": "matches", "value": "8f6c..." }
  ]},
  "metrics": ["oFlow"]
}
```
```json
{ "results": [ { "group": { "flowId": "8f6c..." }, "data": [ { "metric": "oFlow", "stats": { "count": 37 } } ] } ] }
```
- **Limitações:** fotografia instantânea; não acumula histórico.
- `POST /api/v2/analytics/flows/activity/query` (mesma permissão) traz a lista detalhada (`groupBy` obrigatório; `pageSize`, `pageNumber`) — **pode expor ANI (telefone)**: não persistir (LGPD).

### 3.4 Detalhe de conversas — `POST /api/v2/analytics/conversations/details/query`

- **Finalidade:** conversas únicas, jornada por conversa, motivo de saída, transferências, outcomes (indicadores 1, 2, 5, 6, 8, 10).
- **Permissões (qualquer uma):** `analytics:conversationDetail:view`, `analytics:agentConversationDetail:view`, `externalContacts:conversation:viewAll`
- **Corpo (`ConversationQuery`):** `interval` **(obrigatório)**; `segmentFilters`, `conversationFilters`, `order`, `orderBy` (`conversationStart`, `segmentStart`, `segmentEnd`), `paging` (`pageSize`, `pageNumber`; padrão 25), `aggregations`.
```json
{
  "interval": "2026-10-31T03:00:00.000Z/2026-10-31T15:00:00.000Z",
  "segmentFilters": [{ "type": "and", "predicates": [
    { "type": "dimension", "dimension": "flowId", "operator": "matches", "value": "8f6c..." }
  ]}],
  "paging": { "pageSize": 100, "pageNumber": 1 }
}
```
- **Resposta (`AnalyticsConversationQueryResponse`):** `conversations[]`, `totalHits`, `aggregations`.
  Em cada `participants[].sessions[]`: `flow` (objeto `AnalyticsFlow`: `flowId`, `flowName`, `flowVersion`,
  `entryType`, `entryReason`, `exitReason`, `transferType`, `transferTargetName`, `transferTargetAddress`,
  `recognitionFailureReason`, `issuedCallback`, `outcomes[]` com `flowOutcomeId`, `flowOutcomeValue`,
  `flowOutcomeStartTimestamp`, `flowOutcomeEndTimestamp`) e `segments[]` (`segmentType` = `ivr`, `interact`…,
  `segmentStart`, `segmentEnd`, `disconnectType`, `queueId`, `errorCode`).
```json
{
  "totalHits": 1,
  "conversations": [{
    "conversationId": "c1d2...",
    "conversationStart": "2026-10-31T13:02:11.120Z",
    "participants": [{
      "purpose": "ivr",
      "sessions": [{
        "flow": {
          "flowId": "8f6c...", "flowName": "URA Consorcio", "flowVersion": "26.0",
          "exitReason": "DISCONNECT", "transferType": null,
          "outcomes": [{ "flowOutcomeId": "a9b8...", "flowOutcomeValue": "FAILURE",
                         "flowOutcomeStartTimestamp": "2026-10-31T13:02:20.000Z" }]
        },
        "segments": [{ "segmentType": "ivr", "segmentStart": "2026-10-31T13:02:11.120Z",
                       "segmentEnd": "2026-10-31T13:03:05.870Z", "disconnectType": "peer" }]
      }]
    }]
  }]
}
```
- **Limitações:** contém **dados pessoais** (ANI/DNIS, nomes) — filtrar no backend antes de gravar;
  o objeto `flow` **não traz milestones** (usar 3.1 com `flowMilestoneId` ou 3.8); intervalo máximo e
  limites — **confirmar**. Para volume, usar a versão assíncrona:
  `POST /api/v2/analytics/conversations/details/jobs` → `GET .../jobs/{jobId}` → `GET .../jobs/{jobId}/results?cursor=&pageSize=`,
  após conferir `GET /api/v2/analytics/conversations/details/jobs/availability` (data até a qual o data lake está disponível).
- **Documentação:** <https://developer.genesys.cloud/devapps/api-explorer#post-api-v2-analytics-conversations-details-query>

### 3.5 Agregados de conversa (filas) — `POST /api/v2/analytics/conversations/aggregates/query`

- **Finalidade:** o que acontece **depois** da transferência (ofertadas, atendidas, abandonadas na fila) — separa desligamento na URA de abandono na fila.
- **Permissão:** `analytics:conversationAggregate:view`
- **Corpo:** `ConversationAggregationQuery` (`interval`, `metrics`, `groupBy: ["queueId"]`, `filter`, `granularity`). As métricas de fila disponíveis estão no enum do *schema* — selecionar na implementação.

### 3.6 Fluxos do Architect (indicador 4)

| Método | Caminho | Permissão | Parâmetros principais |
|---|---|---|---|
| GET | `/api/v2/flows` | `architect:flow:view` | `type=INBOUNDCALL`, `pageNumber`, `pageSize`, `sortBy`, `sortOrder`, `name`, `nameOrDescription`, `publishedAfter`, `publishedBefore`, `divisionId`, `deleted`, `includeSchemas` (`id` está **depreciado** → usar `GET /api/v2/flows/lookup`) |
| GET | `/api/v2/flows/{flowId}` | `architect:flow:view` | `deleted` |
| GET | `/api/v2/flows/{flowId}/versions` | `architect:flow:view` | `pageNumber`, `pageSize`, `deleted` |
| GET | `/api/v2/flows/{flowId}/versions/{versionId}/configuration` | `architect:flow:view` | — (resposta sem *schema* formal: parser tolerante) |
| GET | `/api/v2/flows/{flowId}/latestconfiguration` | `architect:flow:view` | `deleted` |
| GET | `/api/v2/flows/divisionviews` | `architect:flow:search` | versão simplificada (nome e tipo) |
| GET | `/api/v2/architect/ivrs` | `routing:callRoute:view` | `name`, `dnis`, `scheduleGroup`, `expand` — números e horários ligados ao fluxo |

Escopos: `architect` / `architect:readonly` (ivrs também). Resposta paginada:
```json
{ "entities": [ { "id": "8f6c...", "name": "URA Consorcio", "type": "INBOUNDCALL",
                  "publishedVersion": { "id": "26.0", "datePublished": "2026-10-25T14:00:00Z" },
                  "active": true, "division": { "id": "...", "name": "Home" } } ],
  "pageSize": 25, "pageNumber": 1, "total": 1, "pageCount": 1 }
```
Paginação: `pageNumber`/`pageSize` até `pageNumber == pageCount`.

### 3.7 Cadastros de Milestones e Outcomes (indicadores 6, 7, 8)

| Método | Caminho | Permissão (ALL) |
|---|---|---|
| GET | `/api/v2/flows/milestones` (+ `/{milestoneId}`) | `architect:flowMilestone:view` |
| GET | `/api/v2/flows/outcomes` (+ `/{flowOutcomeId}`) | `architect:flowOutcome:view` |

Parâmetros: `pageNumber`, `pageSize`, `sortBy`, `sortOrder`, `id`, `name`, `description`, `nameOrDescription`, `divisionId`.
Resposta: `{ entities: [{ id, name, description, division }], ... }`. Servem de **dicionário** para traduzir
`flowMilestoneId`/`flowOutcomeId` vindos dos agregados. **Não use** os `POST`/`PUT`/`DELETE` desses caminhos (alteram configuração).

### 3.8 Journey Flows — `POST /api/v2/journey/flows/paths/query` (indicador 10)

- **Finalidade:** árvore agregada dos caminhos dentro dos fluxos com contagem por elemento.
- **Permissão:** `journey:flowpaths:view` · **Escopos:** `journey`, `journey:readonly`
- **Corpo (`FlowPathsQuery`):** `category` **(obrigatório)**: `All`, `Abandoned`, `AgentEscalation`, `Complete`, `Disconnect`, `Error`, `RecognitionFailure`, `Transfer`; `flows` **(obrigatório)**: `[{ "id": "<flowId>" }]`
```json
{ "category": "Disconnect", "flows": [ { "id": "8f6c..." } ] }
```
- **Resposta (`FlowPaths`):** `category`, `dateStart`, `dateEnd`, `elements` (mapa id → elemento). Cada elemento:
  `parentId`, `type` (`Root`, `Milestone`, `Outcome`, `Disconnect`, `Error`, `RecognitionFailure`, `Exit`,
  `TransferToAcd`, `TransferToFlow`, `TransferToNumber`, `TransferToUser`, `AgentEscalation`, `Abandoned`…),
  `count`, `flows[]` (`flow`, `version`, `type`, `count`), `flowMilestone`, `flowOutcome`, `flowOutcomeValue` (`SUCCESS`/`FAILURE`/`UNKNOWN`).
```json
{ "category": "Disconnect", "dateStart": "2026-10-02T00:00:00Z", "dateEnd": "2026-11-01T00:00:00Z",
  "elements": {
    "root": { "type": "Root", "count": 11525 },
    "m1":   { "parentId": "root", "type": "Milestone", "count": 10516, "flowMilestone": { "id": "...", "name": "CPF_Solicitado" } },
    "d1":   { "parentId": "m1",   "type": "Disconnect", "count": 504 }
  } }
```
- **Limitações:** **não há parâmetro de período** no corpo — o período vem definido pelo serviço (`dateStart`/`dateEnd`);
  só aparecem etapas instrumentadas (Milestones/Outcomes); disponibilidade pode depender de licença — **confirmar**.
  É a fonte correta para o **Mapa Inteligente**; sem ela, o mapa só pode mostrar entrada → (desligamento | destino).

### 3.9 Histórico de execução de fluxo (diagnóstico pontual, opcional)

| Método | Caminho | Permissão |
|---|---|---|
| GET | `/api/v2/flows/instances/settings/executiondata` | `architect:flowinstanceexecutiondata:view` — verifica se o histórico está habilitado |
| GET | `/api/v2/flows/instances/querycapabilities` | `architect:flowInstance:search` |
| POST | `/api/v2/flows/instances/query` | `architect:flowInstance:search` — corpo `CriteriaQuery` (`query` obrigatório); **máx. 200 resultados** |
| POST | `/api/v2/flows/instances/jobs` · GET `/api/v2/flows/instances/{instanceId}` | `architect:flowInstance:view` — preparam download de dados de execução |

Útil para investigar casos de falha de Data Action; **não** usar como fonte de métricas. O `PATCH .../settings/executiondata` altera configuração — **não usar**.

### 3.10 Apoio

- `GET /api/v2/routing/queues` (`routing:queue:view`) — nomes das filas para `queueId`/`transferTargetAddress`.
- `POST /api/v2/analytics/ratelimits/aggregates/query` (`analytics:rateLimitAggregate:view`) — estimativa de proximidade dos limites (dados a partir de 90% do máximo; "best effort").

---

## 4. Como testar no API Explorer da Genesys

1. Acesse <https://developer.genesys.cloud/devapps/api-explorer>.
2. Selecione a **região** da organização Gazin e faça login com um usuário corporativo.
   As chamadas são executadas **com as permissões desse usuário** (não as do cliente OAuth) — para
   reproduzir o backend, use um usuário com a mesma função somente leitura.
3. Pesquise o recurso (ex.: *Analytics → Flows → POST /api/v2/analytics/flows/aggregates/query*).
4. Cole o corpo de exemplo da seção 3.1, troque o `interval` por um período recente e o `flowId` por um
   fluxo real (obtido antes em `GET /api/v2/flows?type=INBOUNDCALL`).
5. Execute e verifique: código `200`, `results[].group.flowId`, métricas presentes. Respostas `403`
   indicam permissão faltante; `400` geralmente indica `interval`/`metrics` inválidos.
6. Ordem sugerida de validação:
   1. `GET /api/v2/flows?type=INBOUNDCALL&pageSize=100` — anotar IDs das URAs;
   2. `GET /api/v2/flows/milestones` e `GET /api/v2/flows/outcomes` — ver o que já está instrumentado;
   3. aggregates com `nFlow, tFlow, tFlowDisconnect, tFlowExit` por `flowId` (1 dia, `PT1H`);
   4. aggregates com `groupBy: ["flowId","flowMilestoneId"]` e `["flowId","flowOutcomeId","flowOutcomeValue"]`;
   5. aggregates com `groupBy: ["flowId","transferType","transferTargetName"]`;
   6. `POST /api/v2/journey/flows/paths/query` com `category: "Disconnect"` (se retornar `403`/`404`, verificar licença/permissão);
   7. comparar os números com os relatórios de desempenho de fluxo da própria Genesys (*Performance → Flows*).
7. **Use somente GET e os POST de consulta listados aqui.** O API Explorer também executa `POST/PUT/DELETE`
   que alteram fluxos — não os utilize.

---

## 5. Configurações necessárias no Architect (o que a API NÃO fornece sozinha)

| Necessidade | Situação na API | Configuração recomendada |
|---|---|---|
| Etapa em que o cliente desligou | `tFlowDisconnect` só informa o total por fluxo | Criar **Flow Milestones** no Architect e adicionar a ação de milestone do Architect (*Add Flow Milestone*) no início de cada etapa: `Saudacao`, `Horario_OK`, `CPF_Solicitado`, `CPF_Validado`, `CPF_Falha`, `CPF_Excedido`, `Menu_Principal`, `Opcao_Invalida`, `Opcao_<n>`, `Transferencia_<fila>` |
| Autosserviço concluído | sem métrica nativa | Criar **Flow Outcomes** por serviço (ex.: `2a_Via_Boleto`, `Saldo`, `Rastreio`) e usar *Initialize Flow Outcome* no início e *Set Flow Outcome* = Success/Failure no fim |
| Falhas e tentativas de CPF | sem métrica nativa | Milestones `CPF_Tentativa`, `CPF_Falha`, `CPF_Excedido` (contagem via `nFlowMilestone`); ou Outcome `Identificacao_CPF` (taxa via `nFlowOutcome`/`nFlowOutcomeFailed`). **Nunca** gravar o CPF em atributos para fins de métrica |
| Erros de integração (Data Actions) | `errorCode` existe como dimensão; detalhe só em execução | Milestone no caminho de **Failure/Timeout** de cada *Call Data Action* (ex.: `API_Saldo_Falha`) |
| Tempo por etapa | só `tFlow` total | Diferença entre timestamps de Milestones (detalhe) ou `tFlowOutcome` por Outcome |
| Antes × depois | `flowVersion` nativo | Registrar no Gazin URA Intelligence a nota da alteração para cada versão publicada |

Os nomes das ações do Architect citados acima devem ser conferidos na versão em uso. Essas alterações são feitas **pela equipe responsável pelos fluxos**, com processo de teste e publicação
próprio. O Gazin URA Intelligence **não altera fluxos** — apenas lê.

---

## 6. Integração com o Gazin URA Intelligence

**Implementado na Etapa 3** — ver [`ARCHITECTURE.md`](ARCHITECTURE.md), [`DEPLOY.md`](DEPLOY.md) e o código em [`../server`](../server). Resumo:

```
Navegador (React)  ──HTTPS+SSO──▶  Backend Node.js (API própria /api/*)
                                     ├─ GenesysAuth: Client Credentials, cache do token, renovação antes de expirar
                                     ├─ GenesysClient: allowlist somente leitura, fila de requisições,
                                     │                 retry com backoff em 429/5xx, timeout, paginação
                                     ├─ Coletores agendados:
                                     │    • a cada 15 min: flows/aggregates/query (PT1H, últimas 2 h)
                                     │    • diário: flows/aggregates/jobs (D-1 completo, recálculo)
                                     │    • diário: flows, versions, milestones, outcomes, queues (dicionários)
                                     │    • backfill histórico: jobs assíncronos em janelas, com retomada
                                     └─ PostgreSQL: agregados horários por fluxo/versão/dimensão — sem dados pessoais
```

Regras de segurança:
- `clientId`/`clientSecret` apenas em variáveis de ambiente ou cofre de segredos do servidor; nunca no front-end, no Git ou em logs.
- Allowlist de endpoints no cliente HTTP: qualquer método/caminho fora da lista é bloqueado **antes** de sair do servidor.
- Função OAuth com permissões apenas `:view`/`:search`.
- Dados pessoais (ANI, nomes, CPF, gravações, transcrições) não são persistidos nem enviados a serviços de IA.
- Auditoria de cada coleta (endpoint, intervalo, status, quantidade de linhas, duração).
