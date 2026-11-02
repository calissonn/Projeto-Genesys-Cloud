-- Etapa 4: tratamento das análises da Inteligência CX (status e responsável).
CREATE TABLE insight_state (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);
