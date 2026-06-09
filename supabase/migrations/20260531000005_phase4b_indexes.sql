-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260531000005_phase4b_indexes.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4B.5 — Performance Indexes for All Phase 4B Tables
--
-- Covers all 12 new tables introduced in Phase 4B:
--   refunds, payment_allocations (4B.1)
--   discount_definitions, coupon_codes, discount_applications (4B.2)
--   dunning_schedules, dunning_schedule_stages,
--   invoice_dunning_state, invoice_reminder_log (4B.3)
--   accounting_chart_of_accounts, accounting_export_runs,
--   accounting_export_queue (4B.4)
-- ════════════════════════════════════════════════════════════════════════════

-- ── refunds ──────────────────────────────────────────────────────────────────

-- Primary lookup: list refunds for an invoice
CREATE INDEX refunds_invoice_id_idx
  ON public.refunds (organization_id, invoice_id);

-- List refunds by student (wallet/history view)
CREATE INDEX refunds_student_id_idx
  ON public.refunds (organization_id, student_id, created_at DESC);

-- Filter by status for processing queries
CREATE INDEX refunds_status_idx
  ON public.refunds (refund_status)
  WHERE refund_status NOT IN ('completed', 'cancelled');

-- Over-refund guard query: SUM(completed refunds for invoice)
CREATE INDEX refunds_invoice_completed_idx
  ON public.refunds (invoice_id, refund_status)
  WHERE refund_status = 'completed';

-- Lookup by payment for refund history
CREATE INDEX refunds_payment_id_idx
  ON public.refunds (payment_id)
  WHERE payment_id IS NOT NULL;

-- ── payment_allocations ───────────────────────────────────────────────────────

-- Headroom check: SUM(allocated_amount) for a payment
CREATE INDEX payment_allocations_payment_id_idx
  ON public.payment_allocations (payment_id);

-- Invoice allocation history
CREATE INDEX payment_allocations_invoice_id_idx
  ON public.payment_allocations (invoice_id);

-- Org-scoped list (admin view)
CREATE INDEX payment_allocations_org_created_idx
  ON public.payment_allocations (organization_id, created_at DESC);

-- ── discount_definitions ──────────────────────────────────────────────────────

-- List active discounts for an org
CREATE INDEX discount_definitions_org_active_idx
  ON public.discount_definitions (organization_id, is_active);

-- Scope lookups (apply_discount scope validation)
CREATE INDEX discount_definitions_scope_ref_idx
  ON public.discount_definitions (scope_reference_id)
  WHERE scope_reference_id IS NOT NULL;

CREATE INDEX discount_definitions_scope_category_idx
  ON public.discount_definitions (organization_id, scope_category)
  WHERE scope_category IS NOT NULL;

-- ── coupon_codes ─────────────────────────────────────────────────────────────

-- Code lookup (org-scoped, already has UNIQUE constraint but index aids planning)
CREATE INDEX coupon_codes_org_code_idx
  ON public.coupon_codes (organization_id, code)
  WHERE is_active = true;

-- Linked discount lookups
CREATE INDEX coupon_codes_discount_id_idx
  ON public.coupon_codes (discount_id);

-- ── discount_applications ─────────────────────────────────────────────────────

-- List applications per invoice
CREATE INDEX discount_applications_invoice_id_idx
  ON public.discount_applications (invoice_id);

-- Per-student coupon usage check (redemption_limit_per_student enforcement)
CREATE INDEX discount_applications_coupon_student_idx
  ON public.discount_applications (coupon_id, student_id)
  WHERE coupon_id IS NOT NULL;

-- List applications per student
CREATE INDEX discount_applications_student_id_idx
  ON public.discount_applications (student_id, applied_at DESC);

-- List applications per discount program
CREATE INDEX discount_applications_discount_id_idx
  ON public.discount_applications (discount_id, applied_at DESC);

-- ── dunning_schedules ─────────────────────────────────────────────────────────

-- Find active default schedule for an org (used by process_dunning_tick)
CREATE INDEX dunning_schedules_org_default_active_idx
  ON public.dunning_schedules (organization_id, is_default, is_active)
  WHERE is_active = true;

-- ── dunning_schedule_stages ───────────────────────────────────────────────────

-- Find stages for a schedule in order (used by advance + tick)
CREATE INDEX dunning_stages_schedule_order_idx
  ON public.dunning_schedule_stages (schedule_id, stage_number ASC);

-- Find next stage (stage_number > current)
CREATE INDEX dunning_stages_schedule_number_idx
  ON public.dunning_schedule_stages (schedule_id, stage_number);

-- ── invoice_dunning_state ─────────────────────────────────────────────────────

-- Find invoices ready for next action (process_dunning_tick main query)
CREATE INDEX invoice_dunning_state_next_action_idx
  ON public.invoice_dunning_state (next_action_at ASC)
  WHERE is_resolved = false
    AND is_escalated_legal = false
    AND next_action_at IS NOT NULL;

-- Look up state for a specific invoice (already UNIQUE, but explicit for planner)
CREATE INDEX invoice_dunning_state_invoice_id_idx
  ON public.invoice_dunning_state (invoice_id);

-- Org-scoped list of unresolved dunning states
CREATE INDEX invoice_dunning_state_org_unresolved_idx
  ON public.invoice_dunning_state (organization_id)
  WHERE is_resolved = false;

-- ── invoice_reminder_log ──────────────────────────────────────────────────────

-- List reminders per invoice (admin view)
CREATE INDEX reminder_log_invoice_id_idx
  ON public.invoice_reminder_log (invoice_id, sent_at DESC);

-- List reminders per student
CREATE INDEX reminder_log_student_id_idx
  ON public.invoice_reminder_log (student_id, sent_at DESC);

-- Org-level reminder history
CREATE INDEX reminder_log_org_sent_idx
  ON public.invoice_reminder_log (organization_id, sent_at DESC);

-- ── accounting_chart_of_accounts ──────────────────────────────────────────────

-- Event type lookup (already UNIQUE constraint; explicit for planner)
CREATE INDEX chart_of_accounts_org_event_idx
  ON public.accounting_chart_of_accounts (organization_id, event_type)
  WHERE is_active = true;

-- ── accounting_export_runs ────────────────────────────────────────────────────

-- List runs per org in descending order
CREATE INDEX export_runs_org_started_idx
  ON public.accounting_export_runs (organization_id, started_at DESC);

-- Filter by status (find pending/running)
CREATE INDEX export_runs_status_idx
  ON public.accounting_export_runs (status)
  WHERE status IN ('pending', 'running');

-- ── accounting_export_queue ───────────────────────────────────────────────────

-- Primary drain query: find pending export items for an org
CREATE INDEX export_queue_org_pending_idx
  ON public.accounting_export_queue (organization_id, transaction_date)
  WHERE exported_at IS NULL;

-- Link to export run
CREATE INDEX export_queue_run_id_idx
  ON public.accounting_export_queue (export_run_id)
  WHERE export_run_id IS NOT NULL;

-- Event type lookup (for handler-based queuing)
CREATE INDEX export_queue_event_type_idx
  ON public.accounting_export_queue (organization_id, event_type, transaction_date DESC);
