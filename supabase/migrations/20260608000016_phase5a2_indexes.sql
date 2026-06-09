-- Phase 5A.2: Indexes + Canonical Builder Registry View
--
-- Phase 5A.2 introduces no new tables (only new/updated functions), so there
-- are no new table indexes to add. This migration provides:
--   1. A diagnostic view (canonical_builder_registry) that enumerates all
--      supported entity types and their canonical payload builders — useful
--      for compliance audits and operational monitoring.
--   2. Composite indexes on high-cardinality replay assertion queries
--      introduced by the Phase 5A.2 assertion volume increase.

-- ── canonical_builder_registry ────────────────────────────────────────────────
-- Read-only view documenting which entity types have canonical payload builders
-- and which hash function is applied to their output. This is the authoritative
-- reference for replay validation pipeline configuration.

CREATE OR REPLACE VIEW canonical_builder_registry
  WITH (security_invoker = true)
AS
SELECT
  entity_type,
  builder_function,
  hash_function,
  stored_hash_column,
  is_replay_validated,
  notes
FROM (VALUES
  (
    'agi_submission',
    'build_agi_canonical_payload(total_gross, total_withheld_tax, total_employer_contrib)',
    'canonical_accounting_hash',
    'agi_submissions.submission_hash',
    true,
    'AGI monthly payroll report; dispatched via build_canonical_payload()'
  ),
  (
    'vat_declaration',
    'build_vat_canonical_payload(box05, box10, box11, box12, box30)',
    'canonical_accounting_hash',
    'vat_declarations.declaration_hash',
    true,
    'Swedish SKV 4700 momsdeklaration; BOX49 excluded from hash (computed column)'
  ),
  (
    'saf_t_export',
    'build_saft_canonical_payload(org_id, period_start, period_end, scope, je_count, tx_count, acc_count)',
    'generate_replay_safe_hash',
    'saf_t_exports.content_hash',
    true,
    'SAF-T package fingerprint; entity UUID is part of hash input'
  ),
  (
    'sie4_export',
    'build_sie4_canonical_payload(org_id, fiscal_year_id, period_start, period_end, entry_count, account_count)',
    'generate_replay_safe_hash',
    'sie4_exports.content_hash',
    false,
    'SIE4 file fingerprint; forward-looking builder for PEPPOL integration'
  ),
  (
    'invoice',
    'build_invoice_canonical_payload(org_id, invoice_number, student_id, total_amount, tax_amount, invoice_date)',
    'generate_replay_safe_hash',
    'invoices.content_hash',
    false,
    'Invoice canonical form; forward-looking builder for PEPPOL BIS-3 exports'
  )
) AS t(entity_type, builder_function, hash_function, stored_hash_column, is_replay_validated, notes);

-- ── Additional replay assertion indexes ───────────────────────────────────────
-- Phase 5A.2 increases assert_replay_determinism call volume (validation now
-- runs against all three entity types in automated compliance checks). Add
-- composite indexes to keep assertion queries fast.

-- Already have: replay_assertions(org, entity_type, entity_id) from migration 000012.
-- Add covering index for status-filtered queries used by getReplayAssertions().
CREATE INDEX IF NOT EXISTS idx_replay_assertions_org_status_at
  ON replay_assertions (organization_id, assertion_status, asserted_at DESC);

-- Index to support looking up the most recent assertion per entity
CREATE INDEX IF NOT EXISTS idx_replay_assertions_entity_at
  ON replay_assertions (entity_type, entity_id, asserted_at DESC);

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT ON canonical_builder_registry TO authenticated, service_role;
