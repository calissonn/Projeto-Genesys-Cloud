# Gazin URA Intelligence

Plataforma web para monitoramento, análise e otimização das URAs da Gazin.

> **Versão 0.1 — MVP (Etapa 1).** Todos os indicadores exibidos são **dados simulados**, identificados na interface.
> **Não há integração ativa com a Genesys Cloud.** A estrutura de integração somente leitura está em `server/`.

## Executar

```bash
npm install
npm run dev        # http://localhost:5173
```

Build de produção:

```bash
npm run build && npm run preview
```

Backend (estrutura da Etapa 3, testes):

```bash
cd server && npm install && npm test
```

## Telas do MVP
- **Dashboard executivo** — 12 indicadores com variação vs. período anterior e explicação ao passar o mouse; ligações por horário; evolução diária; comparativo por departamento/URA; rankings; alertas recentes. Filtros de período, departamento e URA.
- **Catálogo de URAs** — pesquisa, filtros, ordenação, detalhes, cadastro e edição.
- **Mapa inteligente** — fluxo interativo com ramificações e loops, pontos críticos, detalhe por etapa com histórico e comparação de períodos, e a instrumentação exigida em produção para cada etapa.
- **Central de alertas** — regras configuráveis (indicador, condição, limite, escopo, criticidade, responsável, volume mínimo, horário, linha de base), simulação da regra em 30 dias, ocorrências com status, responsável e histórico.
- **Integração Genesys** — situação, arquitetura, indicadores nativos × instrumentação, catálogo de APIs oficiais.
- Módulos das Etapas 2–4 com escopo e pré-requisitos descritos.

Modo claro/escuro e layout responsivo.

## Documentação
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — arquitetura, regras de contagem, segurança, roadmap
- [docs/GENESYS_API.md](docs/GENESYS_API.md) — APIs da Genesys Cloud por indicador, permissões, exemplos, API Explorer e configurações no Architect
