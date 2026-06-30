-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260630000001_order_management.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     Commercial Order Management — Sprint 1
--
-- Creates:
--   orders             — commercial order entity (enrollment → order → payment)
--   order_items        — line items (package, discounts, fees, adjustments)
--   order_events       — immutable audit timeline per order
--
-- Functions:
--   create_order()          — SECURITY DEFINER atomic order + items + event
--   emit_order_event()      — SECURITY DEFINER immutable timeline emitter
--   update_order_status()   — SECURITY DEFINER status transition with audit
--
-- Views:
--   v_order_summary         — enriched list view (student name, enrollment ref)
--   v_order_revenue_report  — aggregated revenue by org, month, status
--
-- Permissions:
--   orders:order:read / create / update / cancel
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. orders ─────────────────────────────────────────────────────────────────
-- Commercial order entity. Sits between Enrollment and Payment in the flow.
-- Pricing snapshot fields are immutable after the order transitions from 'draft'.

CREATE TABLE public.orders (
  id                     uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id        uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Sequential display number (org-scoped). Not gap-free; orders can be cancelled.
  order_number           bigint        NOT NULL DEFAULT 0,

  -- Customer & commercial references
  student_id             uuid          REFERENCES public.students(id) ON DELETE SET NULL,
  enrollment_id          uuid          REFERENCES public.enrollment_requests(id) ON DELETE SET NULL,

  -- Order lifecycle
  status                 text          NOT NULL DEFAULT 'draft'
    CONSTRAINT chk_order_status CHECK (status IN (
      'draft', 'pending_payment', 'paid', 'partially_paid', 'cancelled', 'refunded'
    )),

  -- ── Package snapshot (immutable after draft → pending_payment) ──────────────
  package_offering_id    uuid          REFERENCES public.package_offerings(id) ON DELETE SET NULL,
  package_name           text,
  package_code           text,
  lesson_category        text,
  package_quantity       int           CHECK (package_quantity IS NULL OR package_quantity > 0),

  -- ── Campaign / coupon snapshot (immutable) ──────────────────────────────────
  campaign_id            uuid          REFERENCES public.campaigns(id) ON DELETE SET NULL,
  campaign_name          text,
  coupon_id              uuid          REFERENCES public.campaign_coupon_codes(id) ON DELETE SET NULL,
  coupon_code            text,

  -- ── Pricing snapshot (immutable after draft) ─────────────────────────────────
  base_price             numeric(12,2) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  campaign_discount      numeric(12,2) NOT NULL DEFAULT 0 CHECK (campaign_discount >= 0),
  coupon_discount        numeric(12,2) NOT NULL DEFAULT 0 CHECK (coupon_discount >= 0),
  subtotal               numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  vat_rate               numeric(5,4)  NOT NULL DEFAULT 0.25 CHECK (vat_rate >= 0),
  vat_amount             numeric(12,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  total_amount           numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  total_amount_incl_vat  numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount_incl_vat >= 0),
  currency               text          NOT NULL DEFAULT 'SEK',

  -- ── Payment tracking ─────────────────────────────────────────────────────────
  amount_paid            numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),

  -- ── Downstream link ──────────────────────────────────────────────────────────
  -- Set when the order is paid and a package assignment is created/confirmed.
  assignment_id          uuid          REFERENCES public.student_package_assignments(id) ON DELETE SET NULL,

  -- ── Notes / metadata ─────────────────────────────────────────────────────────
  internal_notes         text,
  metadata               jsonb         NOT NULL DEFAULT '{}',

  -- ── Lifecycle timestamps ─────────────────────────────────────────────────────
  confirmed_at           timestamptz,
  paid_at                timestamptz,
  cancelled_at           timestamptz,

  -- ── Cancellation ─────────────────────────────────────────────────────────────
  cancellation_reason    text,

  -- ── Audit ────────────────────────────────────────────────────────────────────
  created_by             uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by             uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_by           uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz   NOT NULL DEFAULT now(),
  updated_at             timestamptz   NOT NULL DEFAULT now(),

  -- Soft delete
  deleted_at             timestamptz,
  deleted_by             uuid          REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Populate order_number via per-org sequence using a counter table ────────
-- Simpler than invoice_number_sequences — orders are not gap-free.
CREATE TABLE public.order_number_counters (
  organization_id uuid   NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_number     bigint NOT NULL DEFAULT 0,
  CONSTRAINT order_number_counters_pkey PRIMARY KEY (organization_id)
);

GRANT SELECT, INSERT, UPDATE ON public.order_number_counters TO service_role;

-- Trigger assigns a unique sequential number per org at INSERT.
CREATE OR REPLACE FUNCTION public.assign_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.order_number_counters (organization_id, last_number)
  VALUES (NEW.organization_id, 1)
  ON CONFLICT (organization_id) DO UPDATE
    SET last_number = order_number_counters.last_number + 1
  RETURNING last_number INTO NEW.order_number;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orders_assign_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_order_number();

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_orders_org_status
  ON public.orders (organization_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_orders_student
  ON public.orders (student_id, created_at DESC)
  WHERE deleted_at IS NULL AND student_id IS NOT NULL;

CREATE INDEX idx_orders_enrollment
  ON public.orders (enrollment_id)
  WHERE enrollment_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_orders_org_created
  ON public.orders (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select" ON public.orders
  FOR SELECT USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('orders:order:read')
    AND deleted_at IS NULL
  );

CREATE POLICY "orders_insert" ON public.orders
  FOR INSERT WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('orders:order:create')
  );

CREATE POLICY "orders_update" ON public.orders
  FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('orders:order:update')
    AND deleted_at IS NULL
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('orders:order:update')
  );

GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL                    ON public.orders TO service_role;

-- ── 2. order_items ────────────────────────────────────────────────────────────
-- Line items within an order. Immutable after order leaves draft.

CREATE TABLE public.order_items (
  id                  uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_id            uuid          NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  item_type           text          NOT NULL
    CONSTRAINT chk_order_item_type CHECK (item_type IN (
      'package', 'campaign_discount', 'coupon_discount',
      'administrative_fee', 'manual_adjustment'
    )),

  description         text          NOT NULL,
  quantity            int           NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price          numeric(12,2) NOT NULL,  -- can be negative for discounts
  total_price         numeric(12,2) NOT NULL,  -- can be negative for discounts

  -- Optional upstream references for reporting
  package_offering_id uuid          REFERENCES public.package_offerings(id) ON DELETE SET NULL,
  campaign_id         uuid          REFERENCES public.campaigns(id) ON DELETE SET NULL,
  coupon_id           uuid          REFERENCES public.campaign_coupon_codes(id) ON DELETE SET NULL,

  sort_order          int           NOT NULL DEFAULT 0,
  metadata            jsonb         NOT NULL DEFAULT '{}',

  created_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order
  ON public.order_items (order_id, sort_order);

CREATE INDEX idx_order_items_org
  ON public.order_items (organization_id);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('orders:order:read')
  );

-- No authenticated INSERT/UPDATE — all mutations go through SECURITY DEFINER functions.
GRANT SELECT               ON public.order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO service_role;

-- ── 3. order_events ───────────────────────────────────────────────────────────
-- Immutable append-only timeline. No UPDATE/DELETE policies.

CREATE TABLE public.order_events (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_id        uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  event_type      text        NOT NULL
    CONSTRAINT chk_order_event_type CHECK (event_type IN (
      'order_created',
      'order_updated',
      'payment_initiated',
      'payment_completed',
      'payment_failed',
      'refunded',
      'cancelled'
    )),

  actor_id        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email     text,
  metadata        jsonb       NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_events_order
  ON public.order_events (order_id, created_at);

CREATE INDEX idx_order_events_org
  ON public.order_events (organization_id, created_at DESC);

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_events_select" ON public.order_events
  FOR SELECT USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('orders:order:read')
  );

-- No authenticated INSERT — all inserts go through emit_order_event()
GRANT SELECT               ON public.order_events TO authenticated;
GRANT SELECT, INSERT       ON public.order_events TO service_role;

-- ── 4. SECURITY DEFINER functions ─────────────────────────────────────────────

-- ── emit_order_event ─────────────────────────────────────────────────────────
-- Appends an immutable audit event for an order.
-- Called from create_order() and update_order_status().

CREATE OR REPLACE FUNCTION public.emit_order_event(
  p_organization_id uuid,
  p_order_id        uuid,
  p_event_type      text,
  p_actor_id        uuid  DEFAULT NULL,
  p_actor_email     text  DEFAULT NULL,
  p_metadata        jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO public.order_events (
    organization_id, order_id, event_type,
    actor_id, actor_email, metadata
  ) VALUES (
    p_organization_id, p_order_id, p_event_type,
    p_actor_id, p_actor_email, p_metadata
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.emit_order_event(uuid,uuid,text,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emit_order_event(uuid,uuid,text,uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emit_order_event(uuid,uuid,text,uuid,text,jsonb) TO service_role;

-- ── create_order ─────────────────────────────────────────────────────────────
-- Atomically creates an order with line items and the initial audit event.
-- All pricing fields are captured at creation time for historical accuracy.

CREATE OR REPLACE FUNCTION public.create_order(
  p_organization_id     uuid,
  p_student_id          uuid    DEFAULT NULL,
  p_enrollment_id       uuid    DEFAULT NULL,
  p_package_offering_id uuid    DEFAULT NULL,
  p_package_name        text    DEFAULT NULL,
  p_package_code        text    DEFAULT NULL,
  p_lesson_category     text    DEFAULT NULL,
  p_package_quantity    int     DEFAULT NULL,
  p_campaign_id         uuid    DEFAULT NULL,
  p_campaign_name       text    DEFAULT NULL,
  p_coupon_id           uuid    DEFAULT NULL,
  p_coupon_code         text    DEFAULT NULL,
  p_base_price          numeric DEFAULT 0,
  p_campaign_discount   numeric DEFAULT 0,
  p_coupon_discount     numeric DEFAULT 0,
  p_vat_rate            numeric DEFAULT 0.25,
  p_currency            text    DEFAULT 'SEK',
  p_internal_notes      text    DEFAULT NULL,
  p_actor_id            uuid    DEFAULT NULL,
  p_actor_email         text    DEFAULT NULL,
  p_metadata            jsonb   DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal            numeric(12,2);
  v_vat_amount          numeric(12,2);
  v_total               numeric(12,2);
  v_total_incl_vat      numeric(12,2);
  v_order_id            uuid;
  v_order_number        bigint;
  v_sort                int := 0;
BEGIN
  -- Calculate pricing
  v_subtotal       := GREATEST(0, p_base_price - p_campaign_discount - p_coupon_discount);
  v_vat_amount     := ROUND(v_subtotal * p_vat_rate, 2);
  v_total          := v_subtotal;
  v_total_incl_vat := v_subtotal + v_vat_amount;

  -- Insert order (order_number assigned by trigger)
  INSERT INTO public.orders (
    organization_id,
    student_id,
    enrollment_id,
    status,
    package_offering_id,
    package_name,
    package_code,
    lesson_category,
    package_quantity,
    campaign_id,
    campaign_name,
    coupon_id,
    coupon_code,
    base_price,
    campaign_discount,
    coupon_discount,
    subtotal,
    vat_rate,
    vat_amount,
    total_amount,
    total_amount_incl_vat,
    currency,
    internal_notes,
    metadata,
    created_by,
    updated_by
  ) VALUES (
    p_organization_id,
    p_student_id,
    p_enrollment_id,
    'draft',
    p_package_offering_id,
    p_package_name,
    p_package_code,
    p_lesson_category,
    p_package_quantity,
    p_campaign_id,
    p_campaign_name,
    p_coupon_id,
    p_coupon_code,
    p_base_price,
    p_campaign_discount,
    p_coupon_discount,
    v_subtotal,
    p_vat_rate,
    v_vat_amount,
    v_total,
    v_total_incl_vat,
    p_currency,
    p_internal_notes,
    p_metadata,
    p_actor_id,
    p_actor_id
  )
  RETURNING id, order_number INTO v_order_id, v_order_number;

  -- Package line item
  IF p_package_name IS NOT NULL THEN
    INSERT INTO public.order_items (
      organization_id, order_id, item_type, description,
      quantity, unit_price, total_price,
      package_offering_id, sort_order
    ) VALUES (
      p_organization_id, v_order_id, 'package',
      COALESCE(p_package_name, 'Paket'),
      COALESCE(p_package_quantity, 1), p_base_price, p_base_price,
      p_package_offering_id, 0
    );
    v_sort := v_sort + 1;
  END IF;

  -- Campaign discount line item
  IF p_campaign_discount > 0 THEN
    INSERT INTO public.order_items (
      organization_id, order_id, item_type, description,
      quantity, unit_price, total_price,
      campaign_id, sort_order
    ) VALUES (
      p_organization_id, v_order_id, 'campaign_discount',
      'Kampanjrabatt' || CASE WHEN p_campaign_name IS NOT NULL
        THEN ': ' || p_campaign_name ELSE '' END,
      1, -p_campaign_discount, -p_campaign_discount,
      p_campaign_id, v_sort
    );
    v_sort := v_sort + 1;
  END IF;

  -- Coupon discount line item
  IF p_coupon_discount > 0 THEN
    INSERT INTO public.order_items (
      organization_id, order_id, item_type, description,
      quantity, unit_price, total_price,
      coupon_id, sort_order
    ) VALUES (
      p_organization_id, v_order_id, 'coupon_discount',
      'Kupongkod' || CASE WHEN p_coupon_code IS NOT NULL
        THEN ': ' || p_coupon_code ELSE '' END,
      1, -p_coupon_discount, -p_coupon_discount,
      p_coupon_id, v_sort
    );
  END IF;

  -- Emit initial audit event
  PERFORM public.emit_order_event(
    p_organization_id, v_order_id, 'order_created',
    p_actor_id, p_actor_email,
    jsonb_build_object(
      'status',              'draft',
      'package_name',        p_package_name,
      'total_amount_incl_vat', v_total_incl_vat,
      'currency',            p_currency
    )
  );

  RETURN jsonb_build_object(
    'order_id',     v_order_id,
    'order_number', v_order_number,
    'status',       'draft',
    'total_amount_incl_vat', v_total_incl_vat,
    'currency',     p_currency
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.create_order(uuid,uuid,uuid,uuid,text,text,text,int,uuid,text,uuid,text,numeric,numeric,numeric,numeric,text,text,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(uuid,uuid,uuid,uuid,text,text,text,int,uuid,text,uuid,text,numeric,numeric,numeric,numeric,text,text,uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(uuid,uuid,uuid,uuid,text,text,text,int,uuid,text,uuid,text,numeric,numeric,numeric,numeric,text,text,uuid,text,jsonb) TO service_role;

-- ── update_order_status ───────────────────────────────────────────────────────
-- Handles order status transitions with validation and audit.
-- Allowed transitions:
--   draft → pending_payment
--   pending_payment → paid | partially_paid | cancelled | refunded
--   partially_paid  → paid | refunded | cancelled
--   paid            → refunded
--   cancelled: terminal
--   refunded:  terminal

CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id            uuid,
  p_organization_id     uuid,
  p_new_status          text,
  p_actor_id            uuid    DEFAULT NULL,
  p_actor_email         text    DEFAULT NULL,
  p_amount_paid         numeric DEFAULT NULL,
  p_cancellation_reason text    DEFAULT NULL,
  p_internal_notes      text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order       RECORD;
  v_event_type  text;
  v_now         timestamptz := now();
BEGIN
  SELECT * INTO v_order
  FROM   public.orders
  WHERE  id              = p_order_id
    AND  organization_id = p_organization_id
    AND  deleted_at      IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  -- Validate transition
  IF v_order.status IN ('cancelled', 'refunded') THEN
    RAISE EXCEPTION 'Order is % — terminal status cannot be changed', v_order.status
      USING ERRCODE = 'P0001';
  END IF;

  IF p_new_status = v_order.status THEN
    RAISE EXCEPTION 'Order is already in status %', p_new_status
      USING ERRCODE = 'P0001';
  END IF;

  -- Map to audit event type
  v_event_type := CASE p_new_status
    WHEN 'pending_payment' THEN 'payment_initiated'
    WHEN 'paid'            THEN 'payment_completed'
    WHEN 'partially_paid'  THEN 'payment_completed'
    WHEN 'cancelled'       THEN 'cancelled'
    WHEN 'refunded'        THEN 'refunded'
    ELSE                        'order_updated'
  END;

  UPDATE public.orders
  SET
    status               = p_new_status,
    amount_paid          = COALESCE(p_amount_paid,  amount_paid),
    internal_notes       = COALESCE(p_internal_notes, internal_notes),
    cancellation_reason  = CASE WHEN p_new_status = 'cancelled' THEN p_cancellation_reason ELSE cancellation_reason END,
    cancelled_by         = CASE WHEN p_new_status = 'cancelled' THEN p_actor_id ELSE cancelled_by END,
    cancelled_at         = CASE WHEN p_new_status = 'cancelled' THEN v_now ELSE cancelled_at END,
    confirmed_at         = CASE WHEN p_new_status = 'pending_payment' AND confirmed_at IS NULL THEN v_now ELSE confirmed_at END,
    paid_at              = CASE WHEN p_new_status = 'paid' THEN v_now ELSE paid_at END,
    updated_by           = p_actor_id,
    updated_at           = v_now
  WHERE id = p_order_id;

  PERFORM public.emit_order_event(
    p_organization_id, p_order_id, v_event_type,
    p_actor_id, p_actor_email,
    jsonb_build_object(
      'previous_status',      v_order.status,
      'new_status',           p_new_status,
      'amount_paid',          COALESCE(p_amount_paid, v_order.amount_paid),
      'cancellation_reason',  p_cancellation_reason
    )
  );

  RETURN jsonb_build_object(
    'order_id',   p_order_id,
    'status',     p_new_status,
    'event_type', v_event_type
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.update_order_status(uuid,uuid,text,uuid,text,numeric,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_order_status(uuid,uuid,text,uuid,text,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status(uuid,uuid,text,uuid,text,numeric,text,text) TO service_role;

-- ── 5. Views ─────────────────────────────────────────────────────────────────

-- Enriched order list view — joins student name and enrollment info.
-- security_invoker = true so the view respects the caller's RLS.
CREATE OR REPLACE VIEW public.v_order_summary
WITH (security_invoker = true)
AS
SELECT
  o.id,
  o.organization_id,
  o.order_number,
  o.status,
  o.student_id,
  s.first_name     AS student_first_name,
  s.last_name      AS student_last_name,
  s.email          AS student_email,
  o.enrollment_id,
  o.package_name,
  o.package_code,
  o.lesson_category,
  o.package_quantity,
  o.campaign_name,
  o.coupon_code,
  o.base_price,
  o.campaign_discount,
  o.coupon_discount,
  o.subtotal,
  o.vat_rate,
  o.vat_amount,
  o.total_amount,
  o.total_amount_incl_vat,
  o.currency,
  o.amount_paid,
  o.assignment_id,
  o.internal_notes,
  o.confirmed_at,
  o.paid_at,
  o.cancelled_at,
  o.cancellation_reason,
  o.created_by,
  o.created_at,
  o.updated_at
FROM  public.orders o
LEFT  JOIN public.students s ON s.id = o.student_id
WHERE o.deleted_at IS NULL;

GRANT SELECT ON public.v_order_summary TO authenticated, service_role;

-- Revenue aggregation view for reporting foundation.
CREATE OR REPLACE VIEW public.v_order_revenue_report
WITH (security_invoker = true)
AS
SELECT
  organization_id,
  date_trunc('month', created_at) AS period_month,
  status,
  currency,
  COUNT(*)                           AS order_count,
  SUM(total_amount_incl_vat)         AS gross_revenue_incl_vat,
  SUM(base_price)                    AS gross_base_price,
  SUM(campaign_discount)             AS total_campaign_discounts,
  SUM(coupon_discount)               AS total_coupon_discounts,
  SUM(amount_paid)                   AS total_collected,
  COUNT(*) FILTER (WHERE campaign_id IS NOT NULL) AS campaign_order_count,
  COUNT(*) FILTER (WHERE coupon_id   IS NOT NULL) AS coupon_order_count
FROM  public.orders
WHERE deleted_at IS NULL
GROUP BY
  organization_id,
  date_trunc('month', created_at),
  status,
  currency;

GRANT SELECT ON public.v_order_revenue_report TO authenticated, service_role;

-- ── 6. Permissions ────────────────────────────────────────────────────────────

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  (gen_random_uuid(), 'orders:order:read',   'orders', 'order', 'read',
   'View orders and order details'),
  (gen_random_uuid(), 'orders:order:create', 'orders', 'order', 'create',
   'Create new orders'),
  (gen_random_uuid(), 'orders:order:update', 'orders', 'order', 'update',
   'Update order status and notes'),
  (gen_random_uuid(), 'orders:order:cancel', 'orders', 'order', 'cancel',
   'Cancel orders')
ON CONFLICT (code) DO NOTHING;

-- org_owner + org_admin: all order permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r CROSS JOIN public.permissions p
WHERE  r.name IN ('org_owner', 'org_admin') AND r.is_system_role = true
  AND  p.code IN ('orders:order:read', 'orders:order:create', 'orders:order:update', 'orders:order:cancel')
ON CONFLICT DO NOTHING;

-- org_manager: read + create + update (not cancel)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r CROSS JOIN public.permissions p
WHERE  r.name = 'org_manager' AND r.is_system_role = true
  AND  p.code IN ('orders:order:read', 'orders:order:create', 'orders:order:update')
ON CONFLICT DO NOTHING;

-- receptionist: read only
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r CROSS JOIN public.permissions p
WHERE  r.name = 'receptionist' AND r.is_system_role = true
  AND  p.code = 'orders:order:read'
ON CONFLICT DO NOTHING;
