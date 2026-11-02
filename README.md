# Gazin URA Intelligence

Plataforma web para monitoramento, análise e otimização das URAs da Gazin.

> **Versão 0.4 — Etapa 4 (Inteligência CX).** No modo protótipo os indicadores são **simulados** e identificados na interface.
> O backend (`server/`) com PostgreSQL, perfis de acesso e integração **somente leitura** com a Genesys Cloud está implementado e testado contra um Genesys **simulado**; falta configurar a credencial real.

## Executar

Modo protótipo (dados simulados, sem backend):

```bash
npm install
npm run dev        # http://localhost:5173
```

Modo backend (PostgreSQL + API + Genesys simulado): ver **[docs/DEPLOY.md](docs/DEPLOY.md)**.

## Telas
- **Dashboard executivo** — 12 indicadores com variação vs. período anterior e explicação ao passar o mouse; ligações por horário; evolução diária; comparativo por departamento/URA; rankings; alertas recentes. Filtros de período, departamento e URA.
- **Catálogo de URAs** — pesquisa, filtros, ordenação, detalhes, cadastro e edição.
- **Mapa inteligente** — fluxo interativo com ramificações e loops, pontos críticos, detalhe por etapa com histórico e comparação de períodos, e a instrumentação exigida em produção para cada etapa.
- **Central de alertas** — regras configuráveis (indicador, condição, limite, escopo, criticidade, responsável, volume mínimo, horário, linha de base), simulação da regra em 30 dias, ocorrências com status, responsável e histórico.
- **Análise de desligamentos** — por etapa, por opção do menu, por horário × dia da semana (mapa de calor), por departamento e por URA; evolução diária/semanal; padrões observados; classificação por metas configuráveis; desligamento na URA separado do abandono na fila.
- **Monitoramento de falhas** — 8 tipos de falha (CPF, tentativas excedidas, integração, consultas de API, transferências, erros de fluxo, navegação inesperada, aumento anormal de desligamentos), detecção automática de anomalias (z-score sobre 14 dias, com volume mínimo), regras personalizadas e ocorrências com status, responsável e histórico.
- **Comparação de períodos** — dois períodos quaisquer ou antes × depois de uma alteração na URA, com teste estatístico de duas proporções, gráfico dia a dia e detalhamento por etapa.
- **Relatórios gerenciais** — 10 relatórios (executivo, desempenho, desligamentos por departamento e etapa, transferências por destino, autosserviço, falhas, alterações, comparativo, alertas) com conclusões e recomendações por regras; exportação **Excel, PDF e CSV**.
- **Gestão de testes** — cenários por URA e versão, esperado × obtido, evidências (texto/arquivo), status aprovado/reprovado/pendente, histórico, roteiro padrão e indicação de prontidão para publicar.
- **Histórico e auditoria** — versões publicadas com impacto antes × depois, registro manual de alterações e trilha de auditoria das ações (exportável em CSV).
- **Inteligência CX** — análises automáticas (antes × depois de alterações, tendências, mudanças anormais, etapas com perda recorrente, oportunidades de autosserviço) com problema, evidências, causas como hipóteses, grau de confiança, recomendação, impacto esperado e forma de validar; priorização “o que investigar primeiro”, resumo executivo (PDF) e redação opcional por IA, desligada por padrão.
- **Administração** — departamentos, URAs e vínculo com fluxos do Architect, filas, usuários e perfis (Administrador, Analista CX, Supervisor, Gestor), metas, instrumentação (papel de cada Milestone/Outcome) e situação/execuções da integração.
- **Integração Genesys** — situação, arquitetura, indicadores nativos × instrumentação, catálogo de APIs oficiais.

Modo claro/escuro e layout responsivo.

## Documentação
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — arquitetura, regras de contagem, segurança, roadmap
- [docs/DEPLOY.md](docs/DEPLOY.md) — instalação, desenvolvimento com backend e produção
- [docs/GENESYS_API.md](docs/GENESYS_API.md) — APIs da Genesys Cloud por indicador, permissões, exemplos, API Explorer e configurações no Architect
