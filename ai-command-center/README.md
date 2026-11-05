# AI Command Center

Empresa virtual de desenvolvimento de software: agentes de IA representados por personagens
pixel art num prédio animado, coordenados por um orquestrador com aprovação humana.

Arquitetura completa, custos, riscos e plano: **[docs/ARQUITETURA.md](docs/ARQUITETURA.md)**.

## Situação

| Etapa | Situação |
|---|---|
| 1. Fundação (orquestrador, eventos, banco, modo demo) | ✅ concluída |
| 2. Prédio animado (Next.js + Phaser) | ✅ concluída |
| 3. Central de Comando | ⏳ próxima |
| 4. Execução real com Claude Code (Agent SDK) | ⏳ |
| 5. Acabamento | ⏳ |

> O **modo real ainda não está habilitado**: `ACC_MODE=real` encerra com uma mensagem explicando que ele chega na Etapa 4.
> Tudo o que roda hoje é **demonstração**: nenhuma IA é chamada, nenhum arquivo é criado e nenhum comando é executado.

## Requisitos

- Node.js 22.13 ou superior (usa o SQLite embutido do Node).

## Executar

```bash
npm install
cp .env.example .env      # defina ACC_TOKEN com um valor aleatório longo (obrigatório para a web)
npm run dev               # orquestrador (127.0.0.1:4317) + web (http://localhost:3000)
```

Abra **http://localhost:3000**: o prédio aparece com os agentes ociosos na copa. Crie um projeto no painel
da direita, aprove o plano na **Fila de aprovação** e acompanhe os personagens trabalhando. Clique num
personagem (ou no nome dele abaixo do prédio) para abrir o painel com tarefa, tempo, histórico, arquivos,
testes, erros e os detalhes da execução.

## Testes

```bash
npm test                  # unitários e de integração (orquestrador + web)
npm run typecheck
npm run build && npm run test:e2e   # ponta a ponta no navegador; gera capturas em e2e/screenshots/
```

O teste ponta a ponta precisa do Playwright com Chromium (`npm i -D playwright && npx playwright install chromium`).

## Prédio animado (Etapa 2)

| Estado real do agente | O que o personagem faz |
|---|---|
| Ocioso | vai para a copa do andar e toma café |
| Em reunião (coordenadora planejando) | vai à mesa de reunião da Diretoria |
| Analisando | senta na mesa, ícone de lupa, gráficos no monitor |
| Escrevendo código | senta e digita, código rolando no monitor |
| Executando testes | testador vai ao laboratório (2º andar); barra de progresso no monitor |
| Conversando | vai (de elevador, se preciso) até o colega que fez a tarefa anterior |
| Aguardando aprovação | levanta a mão com balão “!” piscando; o monitor do administrador e a central de aprovações acendem |
| Concluído | comemora com balão ✔ e depois volta para a copa |
| Erro | fica cabisbaixo com balão ✖ e monitor vermelho |
| Pausado | fica de pé ao lado da mesa com ícone ⏸ |

Regras de fidelidade: os personagens só se movem quando o estado vindo do orquestrador muda; os monitores só mostram
atividade quando o agente está de fato no posto; a parede de protótipos só anima enquanto a designer está digitando.
Os quadros dos andares (tarefas em andamento, erros encontrados, projetos, aprovações) são calculados a partir dos dados reais.
O 1º andar (Operações) e as mesas marcadas “vaga” ficam prontos para expansão — configurados em `apps/web/game/building/layout.ts`.

Segurança da web: o navegador nunca recebe o token. A aplicação Next.js repassa as chamadas ao orquestrador
pelo servidor (`/api/acc/*`, apenas rotas conhecidas; ações exigem mesma origem) e transmite os eventos em
tempo real por Server-Sent Events (`/api/stream`).

## API do orquestrador

Também é possível controlar tudo direto pela API (útil para automações):

```bash
TOKEN=o-valor-do-seu-ACC_TOKEN
H="authorization: Bearer $TOKEN"

# 1. Criar projeto — a coordenadora (Ada) planeja e pede aprovação do plano
curl -s -H "$H" -H 'content-type: application/json' \
  -d '{"name":"Portal de clientes","description":"Portal com login e API de pedidos"}' \
  http://127.0.0.1:4317/api/projects

# 2. Ver estado completo (agentes, projetos, tarefas, aprovações)
curl -s -H "$H" http://127.0.0.1:4317/api/snapshot

# 3. Aprovar (ou "reject") uma aprovação pendente
curl -s -H "$H" -H 'content-type: application/json' -d '{"decision":"approve"}' \
  http://127.0.0.1:4317/api/approvals/<id>

# Pausar / retomar / cancelar
curl -s -X POST -H "$H" http://127.0.0.1:4317/api/projects/<id>/pause
```

Inclua `#erro` na descrição do projeto para ver o fluxo de erro (testes falhando) no modo demo.

### Rotas

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | modo atual |
| GET | `/api/snapshot` | estado completo + último número de sequência |
| GET | `/api/events?after=&projectId=&agentId=&taskId=&runId=` | histórico de eventos |
| POST | `/api/projects` | criar projeto `{name, description, budgetUsd?}` |
| GET | `/api/projects/:id` | projeto, tarefas e aprovações |
| POST | `/api/projects/:id/pause` · `/resume` · `/cancel` | controle de execução |
| POST | `/api/approvals/:id` | `{decision: "approve" \| "reject", reason?}` |
| GET | `/api/agents/:id` | agente + histórico de atividades |
| GET | `/api/runs/:id` | detalhes de uma execução (todos os eventos) |
| WS | `/ws?token=` | `hello` e depois cada evento em tempo real |

Segurança: o servidor escuta só em `127.0.0.1`, exige token em toda rota e no WebSocket e só aceita a origem
configurada em `ACC_ALLOWED_ORIGIN`.

## Estrutura

```
packages/shared         tipos de domínio, eventos e esquemas de validação (zod)
apps/orchestrator       servidor HTTP + WebSocket, motor, planejador, executores, políticas, SQLite
apps/web                Next.js + Tailwind + Phaser: prédio, painéis, proxy e stream de eventos
e2e/                    teste ponta a ponta no navegador e capturas de tela
```
