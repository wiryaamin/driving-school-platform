-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260630000003_enrollment_order_integration.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     Order Management — Sprint 2: Enrollment Integration
--
-- Resolves audit findings:
--   H-1  Enrollment → Order auto-creation (DB support for Edge Function changes)
--   H-2  student_package_assignments.order_id back-reference (bidirectional link)
--   H-3  UNIQUE constraint — one active order per enrollment (race-safe)
--
-- Adds:
--   student_package_assignments.order_id  FK → orders
--   Partial UNIQUE index on orders.enrollment_id  (active orders only)
--   link_order_assignment()               SECURITY DEFINER — sets orders.assignment_id
--   enrollment_events: 'order_created'    added to chk_enrollment_event_type
-- ════════════════════════════════════════════════════════════════════════════

-- ── H-2: order_id back-reference on package assignments ───────────────────────
-- Allows tracing any package assignment back to the originating commercial order.
-- Nullable: historical assignments created before this migration have no order.

ALTER TABLE public.student_package_assignments
  ADD COLUMN IF NOT EXISTS order_id uuid
  REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX idx_spa_order
  ON public.student_package_assignments (order_id)
  WHERE order_id IS NOT NULL;

-- ── H-3: One active order per enrollment ──────────────────────────────────────
-- Prevents two live orders being created for the same enrollment request.
-- Cancelled and refunded orders are excluded so the audit history is preserved.
-- This index is the race-condition guard — the DB enforces uniqueness even under
-- concurrent convert requests.

CREATE UNIQUE INDEX uq_orders_enrollment_active
  ON public.orders (enrollment_id)
  WHERE enrollment_id IS NOT NULL
    AND status NOT IN ('cancelled', 'refunded')
    AND deleted_at IS NULL;

-- ── Extend enrollment audit event types ──────────────────────────────────────
-- Add 'order_created' so operators can see in the enrollment timeline when an
-- order was automatically generated during conversion.

ALTER TABLE public.enrollment_events
  DROP CONSTRAINT chk_enrollment_event_type;

ALTER TABLE public.enrollment_events
  ADD CONSTRAINT chk_enrollment_event_type CHECK (event_type IN (
    'submitted',
    'viewed',
    'approved',
    'rejected',
    'converted',
    'package_assigned',
    'notes_updated',
    'status_updated',
    'order_created'
  ));

-- ── link_order_assignment: SECURITY DEFINER helper ───────────────────────────
-- Sets orders.assignment_id after the package assignment row is inserted.
-- Needed because the enrollments Edge Function authenticates with the user's JWT,
-- and not all converting users will hold orders:order:update.  This function
-- runs as the function owner (SECURITY DEFINER) and bypasses RLS for this
-- narrow write.

CREATE OR REPLACE FUNCTION public.link_order_assignment(
  p_order_id        uuid,
  p_assignment_id   uuid,
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
     SET assignment_id = p_assignment_id
   WHERE id              = p_order_id
     AND organization_id = p_organization_id
     AND deleted_at      IS NULL;
END;
$$;

REVOKE ALL    ON FUNCTION public.link_order_assignment(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_order_assignment(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_order_assignment(uuid, uuid, uuid) TO service_role;
