-- Gazin URA Intelligence — esquema PostgreSQL (Etapa 3)
-- Princípio: armazenar AGREGADOS. Nenhum dado pessoal (ANI, CPF, nome, gravação, transcrição).

CREATE TABLE department (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE ura (
  id               TEXT PRIMARY KEY,
  department_id    TEXT NOT NULL REFERENCES department(id),
  name             TEXT NOT NULL,
  genesys_flow_id  UUID UNIQUE,                 -- vínculo com o fluxo do Architect
  status           TEXT NOT NULL CHECK (status IN ('ativa','em-teste','inativa')),
  requires_cpf     BOOLEAN NOT NULL DEFAULT FALSE,
  business_hours   TEXT,
  owner            TEXT,
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE queue (
  id               TEXT PRIMARY KEY,           -- queueId da Genesys
  name             TEXT NOT NULL,
  department_id    TEXT REFERENCES department(id)
);

-- Dicionários sincronizados da Genesys (somente leitura)
CREATE TABLE genesys_flow (
  flow_id          UUID PRIMARY KEY,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL,
  published_version TEXT,
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE genesys_flow_version (
  flow_id          UUID NOT NULL REFERENCES genesys_flow(flow_id),
  version          TEXT NOT NULL,
  date_published   TIMESTAMPTZ,
  change_note      TEXT,                       -- preenchido pela equipe CX no Gazin URA Intelligence
  PRIMARY KEY (flow_id, version)
);
CREATE TABLE genesys_milestone (id UUID PRIMARY KEY, name TEXT NOT NULL, description TEXT, synced_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE genesys_outcome   (id UUID PRIMARY KEY, name TEXT NOT NULL, description TEXT, synced_at TIMESTAMPTZ NOT NULL DEFAULT now());

-- Mapeamento de milestones/outcomes para o significado no sistema (etapa do mapa, falha de CPF, autosserviço...)
CREATE TABLE instrumentation_map (
  ura_id           TEXT NOT NULL REFERENCES ura(id),
  genesys_id       UUID NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('milestone','outcome')),
  role             TEXT NOT NULL,              -- ex.: 'etapa', 'cpf_tentativa', 'cpf_falha', 'cpf_excedido', 'autosservico', 'erro_integracao'
  step_label       TEXT,
  PRIMARY KEY (ura_id, genesys_id)
);

-- Fatos horários (métricas nativas de fluxo)
CREATE TABLE flow_hour (
  flow_id          UUID NOT NULL,
  flow_version     TEXT NOT NULL DEFAULT '',
  interval_start   TIMESTAMPTZ NOT NULL,
  entries          INTEGER NOT NULL,           -- nFlow
  duration_ms_sum  BIGINT NOT NULL,            -- tFlow.sum
  duration_count   INTEGER NOT NULL,           -- tFlow.count
  disconnects      INTEGER NOT NULL,           -- tFlowDisconnect.count
  exits            INTEGER NOT NULL,           -- tFlowExit.count
  collected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (flow_id, flow_version, interval_start)
);
CREATE INDEX flow_hour_interval_idx ON flow_hour (interval_start);

-- Fatos horários por dimensão (milestones, outcomes, destinos de transferência)
CREATE TABLE flow_dimension_hour (
  flow_id          UUID NOT NULL,
  interval_start   TIMESTAMPTZ NOT NULL,
  dimension        TEXT NOT NULL,              -- 'milestone' | 'outcome' | 'destination'
  dim_key          TEXT NOT NULL,              -- ex.: milestoneId ou 'outcomeId|SUCCESS' ou 'transferType|nome'
  metric           TEXT NOT NULL,              -- métrica oficial (nFlowMilestone, nFlowOutcome, tFlowExit...)
  count            INTEGER NOT NULL,
  sum_ms           BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (flow_id, interval_start, dimension, dim_key, metric)
);

-- Alertas
CREATE TABLE alert_rule (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, metric TEXT NOT NULL, condition TEXT NOT NULL, threshold NUMERIC NOT NULL,
  department_id TEXT, ura_id TEXT, severity TEXT NOT NULL, owner TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE,
  min_volume INTEGER NOT NULL DEFAULT 0, business_hours_only BOOLEAN NOT NULL DEFAULT TRUE, baseline_days INTEGER NOT NULL DEFAULT 7,
  created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE alert_occurrence (
  id TEXT PRIMARY KEY, rule_id TEXT NOT NULL REFERENCES alert_rule(id), ura_id TEXT NOT NULL REFERENCES ura(id),
  occurred_on DATE NOT NULL, value NUMERIC NOT NULL, baseline NUMERIC, volume INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('aberta','em_analise','resolvida','descartada')), owner TEXT
);
CREATE TABLE alert_occurrence_event (
  id BIGSERIAL PRIMARY KEY, occurrence_id TEXT NOT NULL REFERENCES alert_occurrence(id),
  at TIMESTAMPTZ NOT NULL DEFAULT now(), by_user TEXT NOT NULL, text TEXT NOT NULL
);

-- Testes de URA (Etapa 2)
CREATE TABLE test_scenario (id BIGSERIAL PRIMARY KEY, ura_id TEXT NOT NULL REFERENCES ura(id), name TEXT NOT NULL, expected TEXT NOT NULL);
CREATE TABLE test_run (
  id BIGSERIAL PRIMARY KEY, scenario_id BIGINT NOT NULL REFERENCES test_scenario(id), ura_version TEXT NOT NULL,
  result TEXT, status TEXT NOT NULL CHECK (status IN ('aprovado','reprovado','pendente')), tester TEXT NOT NULL, run_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE test_evidence (id BIGSERIAL PRIMARY KEY, run_id BIGINT NOT NULL REFERENCES test_run(id), storage_key TEXT NOT NULL, file_name TEXT NOT NULL);

-- Acesso e auditoria
CREATE TABLE app_user (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, profile TEXT NOT NULL CHECK (profile IN ('admin','analista_cx','supervisor','gestor')), active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE user_department (user_id TEXT REFERENCES app_user(id), department_id TEXT REFERENCES department(id), PRIMARY KEY (user_id, department_id));
CREATE TABLE audit_log (id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), user_id TEXT, action TEXT NOT NULL, entity TEXT, entity_id TEXT, details JSONB);

-- Execuções de coleta (rastreabilidade da integração)
CREATE TABLE sync_run (
  id BIGSERIAL PRIMARY KEY, collector TEXT NOT NULL, interval_from TIMESTAMPTZ, interval_to TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ, status TEXT NOT NULL, rows INTEGER, error TEXT
);
