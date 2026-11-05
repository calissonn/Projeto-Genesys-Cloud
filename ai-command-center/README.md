# AI Command Center

Empresa virtual de desenvolvimento de software: agentes de IA representados por personagens
pixel art num prédio animado, coordenados por um orquestrador com aprovação humana.

Arquitetura completa, custos, riscos e plano: **[docs/ARQUITETURA.md](docs/ARQUITETURA.md)**.

## Situação

| Etapa | Situação |
|---|---|
| 1. Fundação (orquestrador, eventos, banco, modo demo) | ✅ concluída |
| 2. Prédio animado (Next.js + Phaser) | ⏳ próxima |
| 3. Central de Comando | ⏳ |
| 4. Execução real com Claude Code (Agent SDK) | ⏳ |
| 5. Acabamento | ⏳ |

> O **modo real ainda não está habilitado**: `ACC_MODE=real` encerra com uma mensagem explicando que ele chega na Etapa 4.
> Tudo o que roda hoje é **demonstração**: nenhuma IA é chamada, nenhum arquivo é criado e nenhum comando é executado.

## Requisitos

- Node.js 22.13 ou superior (usa o SQLite embutido do Node).

## Executar

```bash
npm install
cp .env.example .env      # defina ACC_TOKEN com um valor aleatório longo
npm run dev               # orquestrador em http://127.0.0.1:4317
npm test                  # testes automatizados
npm run typecheck
```

## Experimentar a API (Etapa 1)

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
apps/web                (Etapa 2) Next.js + Tailwind + Phaser
```
