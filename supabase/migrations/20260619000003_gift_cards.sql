-- =============================================================================
-- Gift Cards (Presentkort)
--
-- Supports two creation paths:
--   1. Via Kassa / e-handel (normal path, creates accounting verifikat)
--   2. Via "Importera utan verifikat" (legacy migration, no verifikat)
--
-- Codes are unique per organization.
-- Remaining value is decremented on redemption (handled via application layer).
-- =============================================================================

CREATE TYPE gift_card_status AS ENUM ('active', 'used', 'expired', 'void');

CREATE TABLE public.gift_cards (
  id                  UUID                     NOT NULL DEFAULT gen_random_uuid(),
  organization_id     UUID                     NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- The redeemable code (e.g. "ABCD-1234-EFGH-5678")
  code                TEXT                     NOT NULL,

  -- Value tracking
  original_value_sek  NUMERIC(12,2)            NOT NULL CHECK (original_value_sek > 0),
  remaining_value_sek NUMERIC(12,2)            NOT NULL CHECK (remaining_value_sek >= 0),

  expires_at          DATE                     NULL,
  status              gift_card_status         NOT NULL DEFAULT 'active',

  -- For legacy imports only — no accounting entry created
  is_legacy_import    BOOLEAN                  NOT NULL DEFAULT false,
  legacy_reference    TEXT                     NULL,

  -- Audit
  created_by          UUID                     NULL REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ              NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ              NOT NULL DEFAULT now(),
  voided_at           TIMESTAMPTZ              NULL,
  voided_by           UUID                     NULL REFERENCES auth.users(id),
  void_reason         TEXT                     NULL,

  CONSTRAINT gift_cards_pkey PRIMARY KEY (id),
  CONSTRAINT gift_cards_code_org_unique UNIQUE (organization_id, code),
  CONSTRAINT remaining_lte_original CHECK (remaining_value_sek <= original_value_sek)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.gift_cards_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER gift_cards_updated_at
  BEFORE UPDATE ON public.gift_cards
  FOR EACH ROW EXECUTE FUNCTION public.gift_cards_set_updated_at();

-- Auto-expire: mark as expired when expires_at passes
CREATE INDEX gift_cards_org_idx        ON public.gift_cards (organization_id);
CREATE INDEX gift_cards_code_idx       ON public.gift_cards (organization_id, code);
CREATE INDEX gift_cards_status_idx     ON public.gift_cards (organization_id, status);
CREATE INDEX gift_cards_expires_idx    ON public.gift_cards (expires_at) WHERE expires_at IS NOT NULL;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;

-- Staff with finance permission
CREATE POLICY gift_cards_select_staff
  ON public.gift_cards FOR SELECT
  USING (
    organization_id = auth_organization_id()
    AND has_permission('finance:invoice:read')
  );

-- Membership-based fallback (works without JWT custom claims)
CREATE POLICY gift_cards_select_member
  ON public.gift_cards FOR SELECT
  USING (
    organization_id IN (
      SELECT m.organization_id FROM public.memberships m
      WHERE  m.user_id = auth.uid() AND m.removed_at IS NULL
    )
  );

-- Insert: org member with finance write
CREATE POLICY gift_cards_insert
  ON public.gift_cards FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT m.organization_id FROM public.memberships m
      WHERE  m.user_id = auth.uid() AND m.removed_at IS NULL
    )
  );

-- Update: org member with finance write (e.g. voiding, redemption)
CREATE POLICY gift_cards_update
  ON public.gift_cards FOR UPDATE
  USING (
    organization_id IN (
      SELECT m.organization_id FROM public.memberships m
      WHERE  m.user_id = auth.uid() AND m.removed_at IS NULL
    )
  );
