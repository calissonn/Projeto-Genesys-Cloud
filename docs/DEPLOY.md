# Instalação e operação — Gazin URA Intelligence

## Modos de execução

| Modo | Para quê | Dados |
|---|---|---|
| **Protótipo** (`npm run dev`) | Demonstração e validação das telas | Simulados, no navegador |
| **Backend + Genesys simulado** | Desenvolvimento e homologação sem credenciais | Coletados de um servidor Genesys **simulado** |
| **Produção** | Uso real | Coletados da Genesys Cloud (somente leitura) |

## 1. Desenvolvimento local com o backend (Genesys simulado)

Pré-requisitos: Node.js 20.6+ e PostgreSQL 14+.

```bash
# Banco local (exemplo com psql como superusuário)
psql -U postgres -c "CREATE ROLE gazin_ura LOGIN PASSWORD 'dev_only_pw';"
psql -U postgres -c "CREATE DATABASE gazin_ura OWNER gazin_ura;"
```

Terminal 1 — Genesys simulado:

```bash
cd server && npm install && npm run mock:genesys
```

Terminal 2 — backend (aplica as migrações automaticamente):

```bash
cd server && cp .env.dev.example .env && npm run dev
```

Terminal 3 — front-end em modo backend (usuário simulado `admin@gazin.com.br`, definido em `.env.backend`):

```bash
npm install && npm run dev:backend
```

Abra http://localhost:5173 e siga o roteiro:

1. **Administração → Integração → Sincronizar dicionários** (fluxos, milestones, outcomes, filas).
2. **Catálogo de URAs → Nova URA** para cada URA.
3. **Administração → URAs e fluxos**: vincule cada URA ao seu fluxo do Architect (as versões publicadas são importadas para o Histórico).
4. **Administração → Instrumentação**: defina o papel de cada Milestone/Outcome (ex.: `CPF_Falha` → Falha de identificação).
5. **Administração → Integração → Carregar histórico** (ex.: 30 dias) e **Coletar últimas horas**.
6. **Administração → Usuários e perfis**: cadastre analistas, supervisores (com departamentos) e gestores.

Testes automatizados do backend (usam um banco **dedicado**, que é apagado a cada execução):

```bash
cd server && TEST_DATABASE_URL=postgres://gazin_ura:dev_only_pw@localhost:5432/gazin_ura_test npm test
```

## 2. Produção

```
Usuário ──HTTPS──▶ Proxy de autenticação (SSO corporativo) ──▶ /      → arquivos do front-end (dist/)
                     ex.: oauth2-proxy + Microsoft Entra ID   └─▶ /api/* → backend Node.js :8080 ──▶ PostgreSQL
                                                                                         └──HTTPS (somente leitura)──▶ Genesys Cloud
```

### 2.1 Front-end

```bash
npm ci && npm run build:backend     # gera dist/ com VITE_DATA_SOURCE=backend
```

Publique `dist/` no servidor web do proxy (qualquer servidor de arquivos estáticos; configure fallback para `index.html`).

### 2.2 Backend

```bash
cd server && npm ci && npm run build && npm start
```

Variáveis em `server/.env.example`. Pontos obrigatórios:

- `NODE_ENV=production`, `AUTH_MODE=proxy` e `AUTH_PROXY_SECRET` (o servidor **recusa iniciar** em produção sem eles; `AUTH_MODE=dev` e URLs Genesys alternativas são bloqueados em produção).
- O backend **não deve ser acessível diretamente** — apenas pelo proxy, que injeta `X-Forwarded-Email` e `X-Proxy-Secret`.
- `BOOTSTRAP_ADMIN_EMAIL`: e-mail do primeiro administrador (criado no primeiro acesso). Os demais usuários são cadastrados na Administração; quem não estiver cadastrado recebe 403 mesmo autenticado no SSO.
- Banco: usuário PostgreSQL próprio, conexão com TLS e backup diário. As migrações rodam na inicialização (com lock, seguro para várias instâncias).

### 2.3 Proxy de autenticação (exemplo de referência)

Com oauth2-proxy (OIDC do Microsoft Entra ID ou outro IdP corporativo), as opções relevantes são: `--set-xauthrequest`/`--pass-user-headers` para enviar o e-mail, e um cabeçalho fixo `X-Proxy-Secret` adicionado pelo servidor web antes de encaminhar para o backend. **Valide a configuração com a equipe de infraestrutura** — os nomes exatos de opções dependem da versão e do produto adotado. Ajuste `AUTH_EMAIL_HEADER` se o proxy usar outro cabeçalho.

### 2.4 Genesys Cloud

1. A administração da Genesys cria uma **função somente leitura** com as permissões listadas em `docs/GENESYS_API.md` §2 e um **cliente OAuth Client Credentials** com essa função.
2. Configure no cofre de segredos: `GENESYS_REGION_DOMAIN=mypurecloud.com` (organização Gazin na região **Leste dos EUA / us-east-1**), `GENESYS_CLIENT_ID` e `GENESYS_CLIENT_SECRET`.
3. Confirme os limites de requisição da organização e ajuste `GENESYS_MAX_REQUESTS_PER_MINUTE`.
4. Após a primeira coleta, **valide os números** contra *Performance → Flows* da Genesys (especialmente `GENESYS_HUMAN_TRANSFER_TYPES`, que define o que conta como transferência para humano).

### 2.5 Inteligência CX — redação por IA (opcional)

As análises da Inteligência CX funcionam **sem IA generativa**. A redação do resumo por IA (Claude, modelo `claude-opus-5-5`) é opcional:

1. Obtenha a **autorização formal** da Gazin (jurídico/segurança da informação).
2. Configure no servidor: `AI_ENABLED=true` e `ANTHROPIC_API_KEY` (cofre de segredos). Opcional: `AI_MODEL`, `AI_MAX_PER_USER_PER_HOUR`.
3. O que é enviado: somente as análises já calculadas (agregados e textos), exatamente o que a tela mostra em “Ver exatamente o que seria enviado”. O servidor recusa campos fora do esquema e qualquer conteúdo com padrão de CPF, telefone ou e-mail.
4. Cada uso fica na auditoria (modelo e tokens). Para testar sem custo: `npm run mock:anthropic` e `ANTHROPIC_BASE_URL` apontando para ele.

## 3. Operação

- **Agendador** (`SCHEDULER_ENABLED=true`): dicionários na inicialização e a cada 24 h; coleta incremental a cada 15 min (reprocessa as últimas horas); fechamento diário via job assíncrono na hora `SCHEDULER_DAILY_CLOSE_HOUR`.
- **Backfill**: Administração → Integração → Carregar histórico. Janelas com falha ficam pendentes e são retomadas na próxima execução.
- **Acompanhamento**: Administração → Integração (execuções, erros, HTTP 429 tratados) e `GET /api/health` para monitoramento.
- **Auditoria**: tabela `audit_log`, somente inclusão (regras do banco impedem UPDATE/DELETE).
