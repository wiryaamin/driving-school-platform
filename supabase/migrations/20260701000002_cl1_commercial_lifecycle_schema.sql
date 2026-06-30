-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260701000002_cl1_commercial_lifecycle_schema.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Sprint:    CL-1 — Commercial Lifecycle Schema Foundation
--
-- PURPOSE:
--   Adds the linking columns and structural constraints required by the
--   order-to-invoice commercial lifecycle (CL-2 through CL-5).
--   All additions are backward-compatible nullable columns. No existing rows,
--   constraints, functions, RLS policies, or views are modified.
--
-- DELIVERABLES:
--   D1.1  invoices.order_id            — FK to orders; origin order for invoice
--   D1.2  invoices.assignment_id       — FK to student_package_assignments (System B)
--   D1.3  invoices_order_id_unique     — Unique partial index (WHERE order_id IS NOT NULL)
--   D1.4  chk_enrollment_event_type    — Extends constraint with 'invoice_created'
--   D1.5  orders.invoice_id            — FK to invoices; idempotency anchor
--
-- BACKWARD COMPATIBILITY:
--   All new columns are nullable with no DEFAULT. All existing rows receive NULL.
--   No existing data is modified. No existing functions, views, or RLS policies
--   require changes — existing policies operate solely on organization_id.
--
-- CIRCULAR FK NOTE:
--   invoices.order_id  → orders(id)   : order exists before invoice; safe
--   orders.invoice_id  → invoices(id) : NULL at insert; set by CL-2 update; safe
--   PostgreSQL permits circular FK references when one side is NULL at insert.
--
-- DEPENDENCIES (must be applied before this migration):
--   public.invoices                    — Phase 4A (20260530000001)
--   public.orders                      — 20260630000003
--   public.student_package_assignments — 20260630000002
--   public.enrollment_events           — 20260630000002 + 20260630000005
-- ════════════════════════════════════════════════════════════════════════════


-- ── D1.1 invoices.order_id ────────────────────────────────────────────────────
-- Links an issued invoice back to the commercial order from which it was created.
-- NULL for all System A (legacy) invoices and all manually created invoices.
-- ON DELETE SET NULL: the invoice record is preserved if an order is hard-deleted
-- (orders use soft deletes in practice; this guards against exceptional cases).

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS order_id uuid
    REFERENCES public.orders(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.invoices.order_id IS
  'FK to orders. Populated by create_invoice_from_order() (CL-2). '
  'NULL for System A (legacy) invoices and manually created invoices.';


-- ── D1.2 invoices.assignment_id ───────────────────────────────────────────────
-- Links an issued invoice to the System B package assignment created at
-- enrollment conversion. Enables the StudentFinancePanel to correlate invoices
-- with package ownership without traversing orders.
-- NULL for all System A invoices.
-- ON DELETE SET NULL: preserves the invoice if the assignment is removed.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS assignment_id uuid
    REFERENCES public.student_package_assignments(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.invoices.assignment_id IS
  'FK to student_package_assignments (System B). Populated by create_invoice_from_order() (CL-2). '
  'NULL for System A invoices.';


-- ── D1.3 Unique partial index on invoices(order_id) ──────────────────────────
-- Enforces one non-void invoice per order at the database level.
-- The partial condition (WHERE order_id IS NOT NULL) excludes all System A invoices
-- from the uniqueness constraint — they have order_id = NULL and must not be
-- affected.
--
-- Critical guard: without this index, create_invoice_from_order() (CL-2) cannot
-- guarantee uniqueness under concurrent execution, UI double-submit, or retry.
-- A duplicate gap-free invoice number consumed during erroneous double-issuance
-- is irrecoverable under Swedish accounting law (gap-free sequence invariant).

CREATE UNIQUE INDEX IF NOT EXISTS invoices_order_id_unique
  ON public.invoices (order_id)
  WHERE order_id IS NOT NULL;


-- ── D1.4 enrollment_events constraint extension ───────────────────────────────
-- Adds 'invoice_created' to the allowed event type vocabulary.
--
-- Current allowed set (post 20260630000005):
--   submitted, viewed, approved, rejected, converted,
--   package_assigned, notes_updated, status_updated, order_created
--
-- New allowed set adds: invoice_created
--
-- Required before CL-3 deploys: convert_enrollment_to_student() will emit
-- 'invoice_created' after successful invoice issuance via create_invoice_from_order().
-- Without this extension, the emit fails with a check constraint violation on
-- every enrollment conversion after CL-3 goes live.

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
    'order_created',
    'invoice_created'
  ));


-- ── D1.5 orders.invoice_id ────────────────────────────────────────────────────
-- Stores the FK to the invoice issued for this order.
-- NULL at order creation; set by create_invoice_from_order() (CL-2) after
-- successful invoice issuance.
--
-- Serves two roles:
--   1. Idempotency anchor: create_invoice_from_order() checks this field first.
--      If NOT NULL and the linked invoice is not void, it returns the existing
--      reference without creating a duplicate.
--   2. Void-lock resolution anchor: void_invoice() (CL-2 extension) clears this
--      field to NULL when voiding an order-linked invoice, restoring the order's
--      ability to be re-invoiced after a corrective void.
--
-- ON DELETE SET NULL: if an invoice is hard-deleted, the order's reference is
-- cleared rather than cascading a delete to the order record.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_id uuid
    REFERENCES public.invoices(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.orders.invoice_id IS
  'FK to invoices. Set by create_invoice_from_order() (CL-2). '
  'Idempotency anchor and void-lock resolution anchor. NULL until an invoice is issued.';


-- ── Supporting index on orders.invoice_id ────────────────────────────────────
-- Supports the reverse-lookup in void_invoice() (CL-2): when voiding an order-
-- linked invoice, the function updates orders.invoice_id = NULL via this path.
-- Also supports join from OrdrarPage (CL-4) to invoice status without a full scan.

CREATE INDEX IF NOT EXISTS idx_orders_invoice_id
  ON public.orders (invoice_id)
  WHERE invoice_id IS NOT NULL;
