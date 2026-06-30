-- ════════════════════════════════════════════════════════════════════════════
-- Phase B: Online Payments — payment_requests tracking table
--
-- Tracks every online payment attempt (Stripe Checkout sessions, Swish
-- deeplink initiations) from the student portal through to settlement.
--
-- Flow:
--   1. Student clicks "Betala med kort" or "Öppna Swish" in the portal
--   2. A payment_request row is created (status = 'pending' or 'initiated')
--   3. For Stripe: status transitions to 'completed' via stripe-webhook
--      Edge Function which then calls record_payment() to settle the invoice
--   4. For Swish: staff manually confirms via the existing payments flow
--
-- Env vars required by the stripe-webhook Edge Function:
--   STRIPE_SECRET_KEY       — platform or org Stripe secret key
--   STRIPE_WEBHOOK_SECRET   — Stripe webhook endpoint signing secret
--   APP_URL                 — frontend URL for success/cancel redirects
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id),
  student_id          uuid             REFERENCES students(id),
  invoice_id          uuid NOT NULL    REFERENCES invoices(id),

  -- 'stripe' | 'swish'
  provider            text NOT NULL CHECK (provider IN ('stripe', 'swish')),

  -- Stripe: checkout.session.id  |  Swish: not used
  provider_session_id text,
  -- Stripe: payment_intent id    |  Swish: not used
  provider_ref        text,

  amount_sek          numeric(12,2) NOT NULL CHECK (amount_sek > 0),

  -- pending    → created, awaiting user action
  -- initiated  → user clicked through (Stripe redirect or Swish deeplink)
  -- completed  → payment confirmed and settled to invoice
  -- failed     → provider reported failure
  -- expired    → TTL elapsed without payment
  -- cancelled  → user cancelled on Stripe page
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','initiated','completed','failed','expired','cancelled')),

  -- Stripe: success_url base  |  Swish: not used
  return_url          text,
  expires_at          timestamptz,
  completed_at        timestamptz,

  -- FK to payments once Stripe webhook confirms + record_payment() runs
  payment_id          uuid,

  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE payment_requests IS
  'Tracks online payment attempts (Stripe / Swish) from student portal to settlement.';

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS payment_requests_org_invoice_idx
  ON payment_requests(organization_id, invoice_id);

CREATE INDEX IF NOT EXISTS payment_requests_student_idx
  ON payment_requests(student_id);

CREATE INDEX IF NOT EXISTS payment_requests_provider_session_idx
  ON payment_requests(provider_session_id)
  WHERE provider_session_id IS NOT NULL;

-- Only index open requests to keep the index small
CREATE INDEX IF NOT EXISTS payment_requests_open_status_idx
  ON payment_requests(status, created_at)
  WHERE status IN ('pending', 'initiated');

-- ── Auto-update updated_at ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS payment_requests_set_updated_at ON payment_requests;
CREATE TRIGGER payment_requests_set_updated_at
  BEFORE UPDATE ON payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;

-- Authenticated staff see their org's payment requests
CREATE POLICY payment_requests_tenant_select ON payment_requests
  FOR SELECT TO authenticated
  USING (
    organization_id = (
      current_setting('request.jwt.claims', true)::jsonb->>'organization_id'
    )::uuid
  );

-- service_role (Edge Functions) can do everything
GRANT SELECT, INSERT, UPDATE ON payment_requests TO service_role;
GRANT SELECT                  ON payment_requests TO authenticated;
