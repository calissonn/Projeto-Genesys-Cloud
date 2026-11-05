# AI Command Center — Proposta de arquitetura do MVP

> **Status: proposta aguardando aprovação.** Nenhuma dependência foi instalada e nenhum código foi escrito.
> Este documento cobre os 6 itens pedidos antes da implementação: arquitetura, conexão agentes ↔ prédio,
> estrutura de pastas, dependências, custos/riscos e plano em etapas.

---

## 0. Decisão preliminar: onde o projeto vai morar

Este repositório já contém outro sistema (Gazin URA Intelligence — Vite + React + `server/`).
Proposta: criar o AI Command Center na pasta **`ai-command-center/`**, totalmente independente
(próprio `package.json`, sem tocar no código existente). Se preferir um repositório separado,
a estrutura abaixo se move sem alterações.

---

## 1. Arquitetura proposta

```
┌──────────────────────────── Navegador ────────────────────────────┐
│  Next.js (App Router, React, Tailwind)                            │
│  ┌──────────────────────┐   ┌──────────────────────────────────┐  │
│  │ Prédio (Phaser)      │   │ Central de Comando (React)       │  │
│  │ cena isométrica,     │   │ projetos, tarefas, aprovações,   │  │
│  │ sprites, animações   │   │ logs, custos, painel do agente   │  │
│  └─────────▲────────────┘   └──────────────▲───────────────────┘  │
│            │   lê estado (somente leitura) │ ações (REST)         │
│        ┌───┴───────────────────────────────┴───┐                  │
│        │ Store de estado (zustand) ← eventos   │                  │
│        └───────────────────▲───────────────────┘                  │
└────────────────────────────┼──────────────────────────────────────┘
                 WebSocket (eventos) + REST (comandos)
┌────────────────────────────┼──────── Orquestrador (Node, local) ──┐
│  API HTTP + WS  ──► Barramento de eventos ──► Persistência        │
│        │                    ▲                 (SQLite local)      │
│        ▼                    │                                     │
│  Coordenador (planejador) ──┤                                     │
│  Agendador (grafo de dependências, concorrência, pausa)           │
│        │                                                          │
│        ▼                                                          │
│  Runner  ──►  modo DEMO: roteiro local, sem IA, sem custo         │
│          └─►  modo REAL: Claude Agent SDK (Claude Code)           │
│                    │  canUseTool → Política de permissões         │
│                    │      └─► ação de risco → Fila de aprovação   │
│                    ▼                                              │
│              Workspace isolado por projeto (workspaces/<id>/)     │
└───────────────────────────────────────────────────────────────────┘
```

### Por que um orquestrador separado do Next.js
Execuções de agentes duram minutos, criam processos filhos e precisam de conexão contínua (WebSocket).
Rotas de API do Next.js não são feitas para isso. O orquestrador é um processo Node simples
(`npm run dev` sobe os dois juntos). A web nunca executa nada: só exibe estado e envia comandos.

### Integração real com Claude Code
Usar o **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`), a biblioteca oficial que executa
o Claude Code programaticamente. Ele oferece exatamente o que precisamos (verificado na versão atual do pacote):

| Recurso do SDK | Uso no projeto |
|---|---|
| `query()` com fluxo de mensagens | cada `tool_use` (Read, Edit, Bash…) vira um evento real que move o personagem |
| `canUseTool` | intercepta cada ação; as de risco vão para a fila de aprovação e aguardam o administrador |
| `allowedTools` / `disallowedTools` / `permissionMode` | permissões mínimas por cargo |
| `cwd` | o agente trabalha só dentro do workspace do projeto |
| `sandbox` | isolamento de comandos Bash (sistema de arquivos e rede) no Linux/macOS |
| `maxTurns`, `maxBudgetUsd`, `abortController` | limites de recursos, custo e botão **Pausar/Parar** |
| `outputFormat: json_schema` | o coordenador devolve o plano em JSON validado |
| `total_cost_usd`, `usage` no resultado | custo por tarefa (é uma **estimativa do SDK**, não fatura — será rotulado assim) |

Autenticação: `ANTHROPIC_API_KEY` no arquivo `.env.local` do orquestrador **ou** o login já existente
do Claude Code na máquina (assinatura Pro/Max). A chave nunca vai para o navegador.

### Modo demonstração × produção (separação estrita)
- Variável `ACC_MODE=demo|real`, escolhida ao iniciar; **não se mistura em tempo de execução**.
- Demo usa um `DemoRunner` que emite os mesmos tipos de evento, porém todos carregam `source: "demo"`.
- Banco separado: `data/demo.sqlite` × `data/real.sqlite`.
- Interface mostra faixa fixa **“MODO DEMONSTRAÇÃO — nada aqui é execução real”**; custos aparecem como “—”.
- No modo real, o `DemoRunner` nem é carregado; se o SDK falhar, a tarefa vai para **erro** (nunca cai para demo).

### Persistência
MVP: **SQLite local** com o módulo nativo `node:sqlite` do Node 22 (zero dependência, zero custo).
O acesso fica atrás de uma interface `Repository`, com esquema espelhando Postgres, para
trocar por **Supabase** (auth + banco + realtime) numa etapa futura sem reescrever o domínio.
Motivo: Supabase local exige Docker, e o remoto exige conta — você pediu priorizar execução local gratuita.

---

## 2. Como os agentes se conectam ao prédio

**Princípio: o prédio é um espelho dos eventos reais — nunca decide sozinho o que um agente está fazendo.**

1. O runner traduz cada mensagem do SDK em um **evento de domínio** com número de sequência:
   `agent.state_changed`, `task.updated`, `tool.used`, `approval.requested`, `run.finished`, `run.failed`…
2. O evento é gravado no banco **e depois** transmitido via WebSocket (o histórico é a fonte da verdade).
3. A store do navegador aplica o evento. Ao reconectar, pede um *snapshot* + eventos após o último `seq`.
4. A cena Phaser observa a store e uma **máquina de estados por personagem** escolhe a animação.

| Estado do agente | Origem real (modo real) | Animação no prédio |
|---|---|---|
| `idle` | nenhuma execução ativa | vai à copa, toma café, senta no sofá |
| `walking` | transição entre estados que exige outro local | caminha pelo corredor / elevador |
| `meeting` | coordenador gerando o plano | reunião na sala de diretoria |
| `analyzing` | ferramentas Read / Grep / Glob / WebFetch | olha o monitor, ícone de lupa |
| `typing` | ferramentas Edit / Write | senta e digita, código rolando na tela |
| `testing` | Bash com comando de teste (`npm test`, `vitest`…) | laboratório, barra de progresso |
| `talking` | agente lê o resultado de outro agente (dependência concluída) | dois personagens com balão de fala |
| `awaiting_approval` | `canUseTool` aguardando decisão | levanta a mão, balão “!” amarelo piscando |
| `done` | resultado `success` | balão ✔ verde, comemora |
| `error` | resultado de erro, exceção, limite estourado | balão ✖ vermelho, fumacinha no monitor |
| `paused` | administrador pausou | ícone ⏸ sobre a cabeça |

Garantia anti-“falso trabalho”: o estado `typing/analyzing/testing` só pode ser emitido pelo runner enquanto
existe um `run` com status `running`; um teste automatizado verifica essa regra.

**Clique no personagem** → abre painel lateral com nome, cargo, tarefa, estado, tempo decorrido,
histórico de ações, arquivos criados/modificados (a partir de Edit/Write + `git diff --stat` do workspace),
resultados de testes, erros e botão “Ver detalhes da execução” (transcrição completa das mensagens do SDK).

### Arte
Toda a arte será **original e gerada no código** (sprites pixel art definidos como matrizes de cores e
convertidos em texturas Phaser), sem baixar imagens de terceiros. O prédio será uma **fachada em corte 2.5D**:
5 andares empilhados com piso e paredes em projeção isométrica, elevador lateral, mobília em pixel art.
No MVP os andares 5–1 existem visualmente; os 3 agentes ficam nos andares 4 (Programador), 3 (Designer)
e 2 (Testador), mais o Coordenador no 5º. A definição dos andares fica num arquivo de configuração,
para adicionar andares/salas depois sem mexer na cena.

---

## 3. Estrutura de pastas

```
ai-command-center/
├── package.json                # npm workspaces + scripts (dev, test, typecheck)
├── .env.example                # ACC_MODE, ANTHROPIC_API_KEY (opcional), limites
├── docs/                       # este documento, guia de uso, segurança
├── packages/
│   └── shared/                 # tipos e esquemas zod compartilhados
│       └── src/ (agents.ts, tasks.ts, events.ts, approvals.ts)
├── apps/
│   ├── web/                    # Next.js
│   │   ├── app/
│   │   │   ├── page.tsx                  # prédio + painéis
│   │   │   ├── command/page.tsx          # Central de Comando
│   │   │   └── projects/[id]/page.tsx    # detalhes do projeto
│   │   ├── components/        # AgentPanel, TaskList, ApprovalQueue, ProjectForm,
│   │   │                      # ActivityLog, CostCard, ModeBanner, RunDetails
│   │   ├── game/
│   │   │   ├── PhaserGame.tsx            # carregado só no cliente (sem SSR)
│   │   │   ├── scenes/BuildingScene.ts
│   │   │   ├── building/floors.ts        # configuração de andares e salas
│   │   │   ├── sprites/                  # pixel art em código
│   │   │   └── agents/AgentActor.ts      # máquina de estados → animação
│   │   └── lib/ (wsClient.ts, store.ts, api.ts)
│   └── orchestrator/
│       ├── src/
│       │   ├── server.ts                 # HTTP + WebSocket (só 127.0.0.1)
│       │   ├── events/bus.ts
│       │   ├── store/ (repository.ts, sqlite.ts, migrations/)
│       │   ├── coordinator/planner.ts    # requisitos → tarefas + dependências
│       │   ├── scheduler/scheduler.ts    # grafo, concorrência, pausa, retomada
│       │   ├── runners/ (runner.ts, claudeRunner.ts, demoRunner.ts, eventMapper.ts)
│       │   ├── policy/ (roles.ts, riskClassifier.ts)
│       │   ├── approvals/approvalQueue.ts
│       │   └── workspace/workspace.ts    # cria/isola workspaces/<projeto>/
│       └── test/
├── workspaces/                 # código gerado pelos agentes (ignorado no git)
└── data/                       # bancos SQLite (ignorado no git)
```

---

## 4. Dependências

Versões atuais conferidas no npm. Nenhuma tem módulo nativo para compilar.

| Pacote | Onde | Para quê |
|---|---|---|
| `next`, `react`, `react-dom` | web | aplicação |
| `tailwindcss` (+ `@tailwindcss/postcss`) | web | interface |
| `phaser` 3.90 | web | prédio animado (versão 3 por ser a mais madura/documentada; Phaser 4 é opção) |
| `zustand` | web | store de estado alimentada por eventos |
| `zod` | shared | validação de eventos, plano do coordenador e entradas da API |
| `ws` | orchestrator | WebSocket |
| `@anthropic-ai/claude-agent-sdk` | orchestrator | execução real via Claude Code (só usado em `ACC_MODE=real`) |
| `typescript`, `tsx`, `vitest`, `concurrently` | dev | build, execução, testes, subir web+orquestrador |
| `@playwright/test` | dev (opcional) | teste ponta a ponta do prédio e da central |

Sem: banco externo, Docker, Redis, filas pagas. Persistência via `node:sqlite` (embutido no Node 22).

---

## 5. Custos e riscos

### Custos
| Item | Custo |
|---|---|
| Rodar web + orquestrador + SQLite localmente | **R$ 0** |
| Modo demonstração | **R$ 0** (nenhuma chamada de IA) |
| Modo real com assinatura Claude Pro/Max já existente | sem custo extra, sujeito aos limites de uso do plano |
| Modo real com `ANTHROPIC_API_KEY` | cobrança por token. Ordem de grandeza (estimativa, varia muito): tarefa pequena US$ 0,05–0,50; projeto MVP de 4–6 tarefas US$ 0,50–5 |
| Supabase (etapa futura) | plano gratuito atende o início |

Controles: limite `maxBudgetUsd` por tarefa e teto por projeto (padrão sugerido US$ 2), `maxTurns`,
modelo configurável, concorrência padrão = 1. A interface separa **custo estimado** (antes de executar,
por heurística) de **custo medido** (informado pelo SDK ao final — também uma estimativa do SDK, não fatura).

### Riscos e mitigação
| Risco | Mitigação |
|---|---|
| Agente executar comando destrutivo | Bash com lista de comandos permitidos por cargo; `rm`, `git push`, `curl`, instalação de pacote, deploy etc. passam pela **fila de aprovação**; `sandbox` do SDK ativo; `cwd` fixo no workspace |
| Isolamento por pasta não é barreira de segurança completa | documentado com clareza; etapa futura: container Docker por projeto. No Windows o sandbox de Bash do Claude Code não está disponível → recomendado WSL2 |
| Gasto descontrolado | limites de orçamento/turnos, concorrência 1, botão Parar com `abortController`, modo demo para testes |
| Injeção de instruções (código/README malicioso orientando o agente) | agentes só leem o próprio workspace, sem rede por padrão, ações de risco sempre aprovadas por humano |
| Vazamento de credenciais | chave só no `.env.local` do orquestrador; ambiente do agente filtrado; servidor escuta só em `127.0.0.1` com token local |
| Animação dessincronizada do estado real | eventos com `seq`, snapshot ao reconectar, estado derivado só de eventos, teste da regra anti-falso-trabalho |
| Phaser + Next.js (SSR) | cena carregada com `dynamic(..., { ssr: false })` |
| Escopo grande | MVP limitado aos 10 itens pedidos; o resto entra como etapas futuras |
| Validação do modo real neste ambiente de nuvem | aqui consigo testar o modo demo e o runner real com SDK simulado; a execução real completa precisa da sua chave/login, rodando na sua máquina |

### Ações que sempre exigem aprovação humana
Publicar/deploy, excluir arquivos ou dados, alterar produção, instalar dependências, operações financeiras,
comunicações externas (rede, e-mail, git push), além do **plano do coordenador** antes de qualquer execução.

---

## 6. Plano em etapas

Cada etapa termina com: testes executados, resumo do que foi feito, o que falta e como verificar.

| Etapa | Entrega | Verificação |
|---|---|---|
| **1. Fundação** | monorepo, tipos/eventos compartilhados, orquestrador com HTTP+WS, SQLite, barramento de eventos, `DemoRunner` | testes unitários (eventos, repositório, agendador com dependências) |
| **2. Prédio animado** | cena Phaser com 5 andares, elevador, mobília, 3 agentes + coordenador, todas as animações da tabela, clique abre painel | Playwright: cena carrega, troca de estado muda animação, clique abre painel; capturas de tela |
| **3. Central de Comando** | criar projeto, lista de tarefas, painel do agente com histórico/arquivos/testes/erros, fila de aprovação, pausar, logs, faixa de modo | fluxo completo em modo demo, ponta a ponta |
| **4. Execução real** | coordenador planejando via SDK (JSON validado), `ClaudeRunner`, mapeamento de mensagens → eventos, política de permissões + aprovações, workspaces, custos | testes com SDK simulado; roteiro para você rodar 1 projeto real pequeno localmente |
| **5. Acabamento** | reconexão, tratamento de erros, documentação de uso e segurança | suíte completa + checklist manual |

**Futuro (fora do MVP):** Supabase (auth, banco, realtime), container por projeto, mais cargos (arquiteto,
segurança, dados, atendimento, automação), salas de reunião com vários agentes, edição de andares, custos por período.

---

## Pontos para sua decisão

1. **Local do projeto:** pasta `ai-command-center/` neste repositório (recomendado) ou repositório novo?
2. **Banco no MVP:** SQLite local agora e Supabase depois (recomendado) ou Supabase desde a Etapa 1?
3. **Modelo padrão para os agentes no modo real:** Sonnet (recomendado, melhor custo) ou Opus?
