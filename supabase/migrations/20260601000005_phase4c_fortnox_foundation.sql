-- ============================================================
-- Phase 4C — Fortnox Foundation
-- Data model preparation for Fortnox integration.
-- No external API calls — sync state tables only.
-- Tables: customer sync, invoice sync, payment sync, export lineage.
-- ============================================================

-- ── Section 1: Fortnox Sync Status Enum ─────────────────────────────────────

CREATE TYPE public.fortnox_sync_status AS ENUM ('pending', 'synced', 'failed', 'skipped', 'stale');

-- ── Section 2: Fortnox Customer Sync ─────────────────────────────────────────

CREATE TABLE public.fortnox_customer_sync (
  id                      uuid                        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id         uuid                        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id              uuid                        NOT NULL REFERENCES public.students(id),
  fortnox_customer_number text,
  sync_status             public.fortnox_sync_status  NOT NULL DEFAULT 'pending',
  last_synced_at          timestamptz,
  last_sync_attempt_at    timestamptz,
  sync_error              text,
  retry_count             int                         NOT NULL DEFAULT 0,
  local_hash              text,   -- hash of local data at last sync; used for change detection
  fortnox_data            jsonb   NOT NULL DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fortnox_customer_org_student_unique UNIQUE (organization_id, student_id)
);

CREATE TRIGGER set_fortnox_customer_sync_updated_at
  BEFORE UPDATE ON public.fortnox_customer_sync
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.fortnox_customer_sync IS
  'Fortnox customer sync state. Tracks each student→Fortnox customer mapping. No API calls — state model only.';

-- ── Section 3: Fortnox Invoice Sync ──────────────────────────────────────────

CREATE TABLE public.fortnox_invoice_sync (
  id                     uuid                       NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id        uuid                       NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id             uuid                       NOT NULL REFERENCES public.invoices(id),
  fortnox_invoice_number text,
  fortnox_document_number text,
  sync_status            public.fortnox_sync_status NOT NULL DEFAULT 'pending',
  last_synced_at         timestamptz,
  last_sync_attempt_at   timestamptz,
  sync_error             text,
  retry_count            int                        NOT NULL DEFAULT 0,
  local_hash             text,
  fortnox_data           jsonb NOT NULL DEFAULT '{}',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fortnox_invoice_org_invoice_unique UNIQUE (organization_id, invoice_id)
);

CREATE TRIGGER set_fortnox_invoice_sync_updated_at
  BEFORE UPDATE ON public.fortnox_invoice_sync
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.fortnox_invoice_sync IS
  'Fortnox invoice sync state. Tracks each invoice→Fortnox invoice mapping.';

-- ── Section 4: Fortnox Payment Sync ──────────────────────────────────────────

CREATE TABLE public.fortnox_payment_sync (
  id                    uuid                       NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid                       NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payment_id            uuid                       NOT NULL REFERENCES public.payments(id),
  fortnox_voucher_id    text,
  fortnox_payment_ref   text,
  sync_status           public.fortnox_sync_status NOT NULL DEFAULT 'pending',
  last_synced_at        timestamptz,
  last_sync_attempt_at  timestamptz,
  sync_error            text,
  retry_count           int NOT NULL DEFAULT 0,
  local_hash            text,
  fortnox_data          jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fortnox_payment_org_payment_unique UNIQUE (organization_id, payment_id)
);

CREATE TRIGGER set_fortnox_payment_sync_updated_at
  BEFORE UPDATE ON public.fortnox_payment_sync
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.fortnox_payment_sync IS
  'Fortnox payment sync state. Tracks each payment→Fortnox voucher mapping.';

-- ── Section 5: Fortnox Export Lineage ────────────────────────────────────────

CREATE TABLE public.fortnox_export_lineage (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  export_run_id     uuid        NOT NULL UNIQUE REFERENCES public.accounting_export_runs(id),
  fortnox_batch_id  text,
  sync_status       public.fortnox_sync_status NOT NULL DEFAULT 'pending',
  entries_total     int         NOT NULL DEFAULT 0,
  entries_synced    int         NOT NULL DEFAULT 0,
  entries_failed    int         NOT NULL DEFAULT 0,
  exported_at       timestamptz,
  exported_by       uuid        REFERENCES auth.users(id),
  sync_error        text,
  fortnox_data      jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_fortnox_export_lineage_updated_at
  BEFORE UPDATE ON public.fortnox_export_lineage
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.fortnox_export_lineage IS
  'Tracks which accounting export runs have been pushed to Fortnox. Audit trail for Fortnox integration.';

-- ── Section 6: RLS ────────────────────────────────────────────────────────────

ALTER TABLE public.fortnox_customer_sync   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fortnox_invoice_sync    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fortnox_payment_sync    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fortnox_export_lineage  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fortnox_customer_sync_org_isolation"
  ON public.fortnox_customer_sync FOR ALL
  USING (organization_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')::uuid);

CREATE POLICY "fortnox_invoice_sync_org_isolation"
  ON public.fortnox_invoice_sync FOR ALL
  USING (organization_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')::uuid);

CREATE POLICY "fortnox_payment_sync_org_isolation"
  ON public.fortnox_payment_sync FOR ALL
  USING (organization_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')::uuid);

CREATE POLICY "fortnox_export_lineage_org_isolation"
  ON public.fortnox_export_lineage FOR ALL
  USING (organization_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')::uuid);

-- ── Section 7: queue_fortnox_sync() ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.queue_fortnox_sync(
  p_org_id      uuid,
  p_entity      text,   -- 'customer' | 'invoice' | 'payment'
  p_entity_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_entity = 'customer' THEN
    INSERT INTO fortnox_customer_sync (organization_id, student_id, sync_status)
    VALUES (p_org_id, p_entity_id, 'pending')
    ON CONFLICT (organization_id, student_id) DO UPDATE
      SET sync_status           = 'pending',
          last_sync_attempt_at  = NULL,
          sync_error            = NULL,
          updated_at            = now();

  ELSIF p_entity = 'invoice' THEN
    INSERT INTO fortnox_invoice_sync (organization_id, invoice_id, sync_status)
    VALUES (p_org_id, p_entity_id, 'pending')
    ON CONFLICT (organization_id, invoice_id) DO UPDATE
      SET sync_status           = 'pending',
          last_sync_attempt_at  = NULL,
          sync_error            = NULL,
          updated_at            = now();

  ELSIF p_entity = 'payment' THEN
    INSERT INTO fortnox_payment_sync (organization_id, payment_id, sync_status)
    VALUES (p_org_id, p_entity_id, 'pending')
    ON CONFLICT (organization_id, payment_id) DO UPDATE
      SET sync_status           = 'pending',
          last_sync_attempt_at  = NULL,
          sync_error            = NULL,
          updated_at            = now();

  ELSE
    RAISE EXCEPTION 'FORTNOX_QUEUE_UNKNOWN_ENTITY: entity type % is not supported (customer|invoice|payment)',
      p_entity USING ERRCODE = 'P0001';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.queue_fortnox_sync(uuid, text, uuid) IS
  'Marks an entity (customer/invoice/payment) as pending Fortnox sync. Idempotent.';

-- ── Section 8: Permissions ────────────────────────────────────────────────────

INSERT INTO public.permissions (code, domain, resource, action, description)
VALUES
  ('finance:fortnox:manage', 'finance', 'fortnox', 'manage', 'Manage Fortnox sync queue and view sync state')
ON CONFLICT (code) DO NOTHING;
