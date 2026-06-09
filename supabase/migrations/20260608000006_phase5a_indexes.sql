-- Phase 5A: Indexes and Governance Views

-- ── compliance_events ────────────────────────────────────────────────────────

CREATE INDEX idx_compliance_events_org_type
  ON compliance_events (organization_id, event_type, occurred_at DESC);
CREATE INDEX idx_compliance_events_entity
  ON compliance_events (entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_compliance_events_actor
  ON compliance_events (organization_id, actor_id, occurred_at DESC);

-- ── agi_submissions ───────────────────────────────────────────────────────────

CREATE INDEX idx_agi_submissions_org
  ON agi_submissions (organization_id, submission_status, created_at DESC);
CREATE INDEX idx_agi_submissions_export
  ON agi_submissions (agi_export_id, submission_status);
CREATE UNIQUE INDEX idx_agi_submissions_original
  ON agi_submissions (organization_id, agi_export_id)
  WHERE correction_of_id IS NULL;
CREATE INDEX idx_agi_submission_lines_submission
  ON agi_submission_lines (submission_id, employee_id);
CREATE INDEX idx_agi_corrections_original
  ON agi_corrections (organization_id, original_submission_id, created_at DESC);

-- ── vat_declarations ─────────────────────────────────────────────────────────

CREATE INDEX idx_vat_declarations_org
  ON vat_declarations (organization_id, declaration_status, created_at DESC);
CREATE INDEX idx_vat_declarations_period
  ON vat_declarations (vat_period_id, declaration_status);
CREATE UNIQUE INDEX idx_vat_declarations_original
  ON vat_declarations (organization_id, vat_period_id)
  WHERE correction_of_id IS NULL AND declaration_status != 'corrected';
CREATE INDEX idx_vat_declaration_lines_declaration
  ON vat_declaration_lines (declaration_id, sort_order);
CREATE INDEX idx_vat_corrections_original
  ON vat_corrections (organization_id, original_declaration_id, created_at DESC);

-- ── filing_certifications ────────────────────────────────────────────────────

CREATE INDEX idx_filing_certifications_org
  ON filing_certifications (organization_id, entity_type, certification_status);
CREATE INDEX idx_filing_certifications_entity
  ON filing_certifications (entity_type, entity_id, certification_status);

-- ── compliance_replay_links ───────────────────────────────────────────────────

CREATE INDEX idx_compliance_replay_links_filing
  ON compliance_replay_links (organization_id, filing_type, filing_id);
CREATE INDEX idx_compliance_replay_links_cert
  ON compliance_replay_links (replay_certification_id);

-- ── saf_t_exports ─────────────────────────────────────────────────────────────

CREATE INDEX idx_saf_t_exports_org
  ON saf_t_exports (organization_id, export_status, period_start DESC);
CREATE INDEX idx_saf_t_exports_period
  ON saf_t_exports (organization_id, period_start, period_end);

-- ── regulatory_export_hashes ─────────────────────────────────────────────────

CREATE INDEX idx_regulatory_export_hashes_org
  ON regulatory_export_hashes (organization_id, export_type, generated_at DESC);
CREATE INDEX idx_regulatory_export_hashes_export
  ON regulatory_export_hashes (export_type, export_id);

-- ── retention_policies ───────────────────────────────────────────────────────

CREATE INDEX idx_retention_policies_org
  ON retention_policies (organization_id, policy_type, is_active);
CREATE INDEX idx_retention_enforcement_log_org
  ON retention_enforcement_log (organization_id, policy_type, check_date DESC);
CREATE INDEX idx_retention_enforcement_log_outcome
  ON retention_enforcement_log (organization_id, outcome, check_date DESC);

-- ── Views ────────────────────────────────────────────────────────────────────

-- Compliance overview: recent events and filing status per org
CREATE VIEW v_compliance_overview
WITH (security_invoker = true)
AS
SELECT
  ce.organization_id,
  ce.event_type,
  ce.entity_type,
  ce.entity_id,
  ce.actor_id,
  ce.occurred_at,
  ce.metadata
FROM compliance_events ce
WHERE ce.occurred_at >= now() - interval '90 days';

-- AGI filing status per submission
CREATE VIEW v_agi_filing_status
WITH (security_invoker = true)
AS
SELECT
  sub.id                       AS submission_id,
  sub.organization_id,
  sub.agi_export_id,
  sub.declaration_period_start,
  sub.declaration_period_end,
  sub.submission_status,
  sub.submission_hash,
  sub.certification_hash,
  sub.certified_at,
  sub.skatteverket_receipt,
  sub.correction_of_id,
  sub.created_at,
  -- Correction chain depth
  (SELECT COUNT(*) FROM agi_corrections c
   WHERE c.original_submission_id = sub.id) AS correction_count,
  -- AGI export amounts
  ae.total_gross,
  ae.total_withheld_tax,
  ae.total_employer_contrib,
  ae.employee_count
FROM agi_submissions sub
JOIN agi_exports ae ON ae.id = sub.agi_export_id;

-- VAT declaration status per declaration
CREATE VIEW v_vat_declaration_status
WITH (security_invoker = true)
AS
SELECT
  vd.id                    AS declaration_id,
  vd.organization_id,
  vd.vat_period_id,
  vp.period_start,
  vp.period_end,
  vp.frequency,
  vd.declaration_status,
  vd.box_05_taxable_turnover,
  vd.box_10_output_vat_25,
  vd.box_11_output_vat_12,
  vd.box_12_output_vat_6,
  vd.box_30_input_vat,
  vd.box_49_net_vat,
  vd.declaration_hash,
  vd.certification_hash,
  vd.certified_at,
  vd.skatteverket_receipt,
  vd.correction_of_id,
  vd.created_at,
  (SELECT COUNT(*) FROM vat_corrections c
   WHERE c.original_declaration_id = vd.id) AS correction_count
FROM vat_declarations vd
JOIN vat_periods vp ON vp.id = vd.vat_period_id;

-- Retention overview per policy
CREATE VIEW v_retention_overview
WITH (security_invoker = true)
AS
SELECT
  rp.id                AS policy_id,
  rp.organization_id,
  rp.policy_type,
  rp.retention_years,
  rp.legal_basis,
  rp.applies_to_table,
  rp.is_active,
  rp.effective_from,
  rp.effective_to,
  last_check.check_date AS last_check_date,
  last_check.outcome    AS last_outcome,
  last_check.records_at_risk AS last_records_at_risk
FROM retention_policies rp
LEFT JOIN LATERAL (
  SELECT check_date, outcome, records_at_risk
  FROM retention_enforcement_log rel
  WHERE rel.policy_id = rp.id
  ORDER BY check_date DESC
  LIMIT 1
) last_check ON true;
