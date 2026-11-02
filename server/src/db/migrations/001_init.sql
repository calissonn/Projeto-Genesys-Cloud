-- Gazin URA Intelligence — esquema inicial (Etapa 3)
-- Princípios: somente AGREGADOS da Genesys; nenhum dado pessoal de cliente
-- (ANI, CPF, nome, gravação, transcrição) é armazenado.

-- ───────────── Cadastros ─────────────
CREATE TABLE department (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  short_name  TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ura (
  id               TEXT PRIMARY KEY,
  department_id    TEXT NOT NULL REFERENCES department(id),
  name             TEXT NOT NULL,
  genesys_flow_id  UUID UNIQUE,
  version          TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL CHECK (status IN ('ativa','em-teste','inativa')),
  requires_cpf     BOOLEAN NOT NULL DEFAULT FALSE,
  business_hours   TEXT NOT NULL DEFAULT '',
  owner            TEXT NOT NULL DEFAULT '',
  description      TEXT NOT NULL DEFAULT '',
  queues           TEXT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ura_department_idx ON ura (department_id);

CREATE TABLE queue (
  id             TEXT PRIMARY KEY,               -- queueId da Genesys (ou id local enquanto não sincronizado)
  name           TEXT NOT NULL,
  department_id  TEXT REFERENCES department(id),
  source         TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','genesys')),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────── Usuários, perfis e acesso ─────────────
CREATE TABLE app_user (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  profile     TEXT NOT NULL CHECK (profile IN ('admin','analista_cx','supervisor','gestor')),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_login  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Departamentos visíveis para supervisores (demais perfis veem todos).
CREATE TABLE user_department (
  user_id        TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  department_id  TEXT NOT NULL REFERENCES department(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, department_id)
);

CREATE TABLE audit_log (
  id         BIGSERIAL PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id    TEXT,
  user_name  TEXT NOT NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  details    TEXT
);
CREATE INDEX audit_log_at_idx ON audit_log (at DESC);
-- A trilha de auditoria é somente inclusão.
CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;

-- ───────────── Configurações e estado da aplicação ─────────────
CREATE TABLE app_setting (
  key         TEXT PRIMARY KEY,                  -- ex.: 'goals'
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

CREATE TABLE alert_rule (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL,                    -- AlertRule (mesmo formato do front-end)
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

-- Tratamento das ocorrências (status, responsável, histórico). As ocorrências em si são recalculadas.
CREATE TABLE occurrence_state (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

CREATE TABLE test_case (
  id          TEXT PRIMARY KEY,
  ura_id      TEXT NOT NULL,
  data        JSONB NOT NULL,                    -- TestCase (evidências pequenas inline; arquivos grandes → armazenamento de objetos)
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);
CREATE INDEX test_case_ura_idx ON test_case (ura_id);

CREATE TABLE ura_change (
  id          TEXT PRIMARY KEY,
  ura_id      TEXT NOT NULL,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

-- ───────────── Dicionários sincronizados da Genesys (somente leitura) ─────────────
CREATE TABLE genesys_flow (
  flow_id            UUID PRIMARY KEY,
  name               TEXT NOT NULL,
  type               TEXT NOT NULL,
  division_name      TEXT,
  published_version  TEXT,
  date_published     TIMESTAMPTZ,
  active             BOOLEAN,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE genesys_flow_version (
  flow_id         UUID NOT NULL REFERENCES genesys_flow(flow_id) ON DELETE CASCADE,
  version         TEXT NOT NULL,
  date_published  TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (flow_id, version)
);
CREATE TABLE genesys_milestone (id UUID PRIMARY KEY, name TEXT NOT NULL, description TEXT, synced_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE genesys_outcome   (id UUID PRIMARY KEY, name TEXT NOT NULL, description TEXT, synced_at TIMESTAMPTZ NOT NULL DEFAULT now());

-- Significado de cada milestone/outcome para os indicadores do sistema.
CREATE TABLE instrumentation_map (
  genesys_id  UUID NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('milestone','outcome')),
  role        TEXT NOT NULL CHECK (role IN (
                'etapa','cpf_tentativa','cpf_falha','cpf_excedido','autosservico',
                'erro_integracao','erro_api','erro_fluxo','opcao_invalida','transferencia_falha')),
  step_label  TEXT,
  ura_id      TEXT REFERENCES ura(id) ON DELETE CASCADE,  -- NULL = vale para todas as URAs
  PRIMARY KEY (genesys_id, kind)
);

-- ───────────── Fatos (agregados horários) ─────────────
CREATE TABLE flow_hour (
  flow_id          UUID NOT NULL,
  flow_version     TEXT NOT NULL DEFAULT '',
  interval_start   TIMESTAMPTZ NOT NULL,
  entries          INTEGER NOT NULL,             -- nFlow
  duration_ms_sum  BIGINT NOT NULL,              -- tFlow.sum
  duration_count   INTEGER NOT NULL,             -- tFlow.count
  disconnects      INTEGER NOT NULL,             -- tFlowDisconnect.count
  exits            INTEGER NOT NULL,             -- tFlowExit.count
  collected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (flow_id, flow_version, interval_start)
);
CREATE INDEX flow_hour_interval_idx ON flow_hour (interval_start);

CREATE TABLE flow_dimension_hour (
  flow_id         UUID NOT NULL,
  interval_start  TIMESTAMPTZ NOT NULL,
  dimension       TEXT NOT NULL CHECK (dimension IN ('milestone','outcome','destination')),
  dim_key         TEXT NOT NULL,
  metric          TEXT NOT NULL,
  count           INTEGER NOT NULL,
  sum_ms          BIGINT NOT NULL DEFAULT 0,
  collected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (flow_id, interval_start, dimension, dim_key, metric)
);
CREATE INDEX flow_dimension_hour_interval_idx ON flow_dimension_hour (interval_start);

-- ───────────── Execuções de coleta ─────────────
CREATE TABLE sync_run (
  id             BIGSERIAL PRIMARY KEY,
  collector      TEXT NOT NULL,
  interval_from  TIMESTAMPTZ,
  interval_to    TIMESTAMPTZ,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ,
  status         TEXT NOT NULL CHECK (status IN ('running','ok','erro')),
  rows           INTEGER,
  error          TEXT,
  triggered_by   TEXT NOT NULL DEFAULT 'agendador'
);
CREATE INDEX sync_run_started_idx ON sync_run (started_at DESC);

-- Janelas do backfill histórico (permite retomar de onde parou).
CREATE TABLE backfill_window (
  window_start  TIMESTAMPTZ PRIMARY KEY,
  window_end    TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('pendente','ok','erro')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
