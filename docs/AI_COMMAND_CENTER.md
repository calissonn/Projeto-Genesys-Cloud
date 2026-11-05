# AI Command Center — Time multiagente

Time de três subagentes especializados (em `.claude/agents/`) orquestrado pelo **Coordenador** (a sessão principal do Claude Code).

## Papéis e permissões

| Agente | Arquivo | Ferramentas | Pode alterar código? | Entrega |
|---|---|---|---|---|
| **Coordenador** | sessão principal | todas (com aprovação do usuário) | sim | plano, delegação, consolidação |
| **Designer** | `designer.md` | Read, Glob, Grep | não | Especificação de Design |
| **Programador** | `programador.md` | Read, Glob, Grep, Edit, Write, Bash (verificação local) | sim | Entrega do Programador |
| **Testador** | `testador.md` | Read, Glob, Grep, Bash (testes/auditoria) | não | Relatório de Validação |

Regras do projeto em `.claude/settings.json`: instalar dependências, commit/push, `rm` e edição de arquivos de configuração **pedem aprovação**; leitura de `.env`, internet (`curl`/`wget`), publicação e deploy são **bloqueados**.

## Fluxo de trabalho (dependências)

```
Usuário ──pedido──▶ Coordenador
                      │ 1. quebra em tarefas e define critérios
                      ▼
                   Designer ──Especificação de Design──┐
                                                       ▼
                              Coordenador valida com o usuário (se a mudança for grande)
                                                       ▼
                   Programador ──Entrega (código + typecheck)──▶ Testador
                                                                   │
                       ┌──────────── REPROVADO (IDs das falhas) ◀──┤
                       ▼                                           │ APROVADO
                   Programador corrige ──▶ Testador revalida       ▼
                                                       Coordenador consolida
                                                       e apresenta ao usuário
```

1. **Designer** sempre antes do Programador quando houver tela nova ou mudança visual. Tarefas só de backend/lógica pulam esta etapa.
2. **Programador** só começa com a especificação (ou tarefa técnica) definida.
3. **Testador** só começa após a entrega do Programador. Nunca corrige; apenas relata.
4. Ciclo **corrigir → revalidar** se repete até APROVADO (máx. 3 voltas; depois o Coordenador escala ao usuário).
5. O **Coordenador** salva os relatórios em `docs/relatorios/` e pede aprovação antes de commit, instalação de dependências ou alteração de arquivos importantes.

## Regras gerais
- Nada é publicado; nenhum acesso a produção; nenhuma credencial real é configurada.
- Somente dados fictícios/simulados — nunca dados reais de clientes.
- Tarefas independentes (ex.: Designer planejando a tela B enquanto o Testador valida a tela A) podem rodar em paralelo.

## Como usar
Peça ao Coordenador em linguagem natural, por exemplo:
- "Crie a tela X do AI Command Center" → Designer → Programador → Testador.
- "Revise a organização visual do Dashboard" → só Designer.
- "Valide o código atual e gere um relatório de segurança" → só Testador.
- "Corrija as falhas F-01 e F-03 do último relatório" → Programador → Testador.

Também é possível chamar um agente diretamente: "use o agente testador para …".
