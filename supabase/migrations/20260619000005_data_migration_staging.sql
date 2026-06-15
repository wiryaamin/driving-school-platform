-- ─── Data Migration Staging Tables ──────────────────────────────────────────
-- Tracks import sessions and per-row staging for the Data Migration module.

-- data_migration_sessions: tracks an import job
CREATE TABLE public.data_migration_sessions (
  id               UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  UUID NOT NULL,
  entity_type      TEXT NOT NULL CHECK (entity_type IN ('students','instructors','bookings','invoices','payments')),
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','uploading','validating','validated','importing','completed','failed','cancelled')),
  file_name        TEXT,
  file_size_bytes  BIGINT,
  total_rows       INT  NOT NULL DEFAULT 0,
  valid_rows       INT  NOT NULL DEFAULT 0,
  warning_rows     INT  NOT NULL DEFAULT 0,
  error_rows       INT  NOT NULL DEFAULT 0,
  imported_rows    INT  NOT NULL DEFAULT 0,
  skipped_rows     INT  NOT NULL DEFAULT 0,
  import_mode      TEXT NOT NULL DEFAULT 'skip_errors' CHECK (import_mode IN ('skip_errors','abort_on_error')),
  dry_run          BOOLEAN NOT NULL DEFAULT false,
  error_summary    TEXT,
  created_by       UUID NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  deleted_at       TIMESTAMPTZ
);

-- data_migration_rows: one row per staging record
CREATE TABLE public.data_migration_rows (
  id                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id        UUID NOT NULL REFERENCES public.data_migration_sessions(id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL,
  row_number        INT  NOT NULL,
  raw_data          JSONB NOT NULL,
  normalized_data   JSONB,
  validation_status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (validation_status IN ('pending','valid','warning','error','imported','skipped','failed')),
  errors            JSONB NOT NULL DEFAULT '[]',
  warnings          JSONB NOT NULL DEFAULT '[]',
  production_id     UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- indexes
CREATE INDEX idx_dmig_sessions_org        ON public.data_migration_sessions(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_dmig_sessions_org_status  ON public.data_migration_sessions(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_dmig_rows_session         ON public.data_migration_rows(session_id);
CREATE INDEX idx_dmig_rows_session_vstatus ON public.data_migration_rows(session_id, validation_status);

-- RLS
ALTER TABLE public.data_migration_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_migration_rows ENABLE ROW LEVEL SECURITY;

-- Sessions: org members can manage their own sessions
CREATE POLICY dmig_sessions_org_read  ON public.data_migration_sessions FOR SELECT USING (organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::UUID);
CREATE POLICY dmig_sessions_org_write ON public.data_migration_sessions FOR ALL    USING (organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::UUID);

-- Rows: same org isolation
CREATE POLICY dmig_rows_org_read  ON public.data_migration_rows FOR SELECT USING (organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::UUID);
CREATE POLICY dmig_rows_org_write ON public.data_migration_rows FOR ALL    USING (organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::UUID);

-- Service role bypasses all RLS
GRANT ALL ON public.data_migration_sessions TO service_role;
GRANT ALL ON public.data_migration_rows     TO service_role;
