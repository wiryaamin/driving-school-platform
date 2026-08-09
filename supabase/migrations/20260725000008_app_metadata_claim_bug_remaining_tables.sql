-- =============================================================================
-- Fix the remaining app_metadata JWT-claim RLS bug across 22 tables
--
-- Found via a full-schema search for the same defect already fixed on
-- student_leads and retention_policies today: RLS checking
-- auth.jwt()->'app_metadata'->>'organization_id', a path this app's auth
-- flow never populates (organization_id lives at the top level of the JWT
-- claims — see auth_organization_id()). Every one of these policies has
-- been silently denying all access, for every org, always.
--
-- Two of the affected tables are not read-only compliance/replay
-- infrastructure — they are functionality already believed commissioned
-- this session:
--   - training_materials: MaterialsSettingsPage's real backend. Its RLS
--     bug means the page has been unable to load or save any material for
--     any tenant — a correction to the earlier "Commissioned" classification.
--   - data_migration_sessions / data_migration_rows: DataMigrationPage's
--     backend (classified yesterday as "Not a Tenant Configuration surface"
--     — a wizard — which is still correct; but the wizard itself has been
--     non-functional for every tenant because of this bug).
--   - student_practice_log: student practice-session logging, same defect.
--
-- The remaining 18 tables are Sweden-compliance/regulatory-export/replay
-- infrastructure (AGI, VAT declarations, SAF-T, certifications, replay
-- assertions, retention enforcement log, data-migration). Same fix,
-- applied uniformly rather than piecemeal, since leaving a known-broken
-- isolation bug in place on sibling tables after finding the pattern would
-- be negligent — consistent with today's earlier 9-table and channel_configs/
-- notification_templates/student_leads/retention_policies corrections.
--
-- Fix: same minimal, mechanical correction — repoint every affected
-- policy to auth_organization_id(), preserving each policy's exact name,
-- command scope (SELECT/INSERT/UPDATE/ALL), and the absence of any
-- additional permission check that wasn't already there. No schema change,
-- no new policies, no structural change.
-- =============================================================================

-- ── Pure-SELECT compliance/replay tables (single policy each) ────────────────

DROP POLICY IF EXISTS "agi_corrections_select" ON public.agi_corrections;
CREATE POLICY "agi_corrections_select" ON public.agi_corrections FOR SELECT
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "agi_submission_lines_select" ON public.agi_submission_lines;
CREATE POLICY "agi_submission_lines_select" ON public.agi_submission_lines FOR SELECT
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "agi_submissions_select" ON public.agi_submissions;
CREATE POLICY "agi_submissions_select" ON public.agi_submissions FOR SELECT
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "certification_snapshots_select" ON public.certification_snapshots;
CREATE POLICY "certification_snapshots_select" ON public.certification_snapshots FOR SELECT
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "compliance_events_select" ON public.compliance_events;
CREATE POLICY "compliance_events_select" ON public.compliance_events FOR SELECT
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "compliance_replay_links_select" ON public.compliance_replay_links;
CREATE POLICY "compliance_replay_links_select" ON public.compliance_replay_links FOR SELECT
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "deterministic_export_registry_select" ON public.deterministic_export_registry;
CREATE POLICY "deterministic_export_registry_select" ON public.deterministic_export_registry FOR SELECT
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "export_lineage_records_select" ON public.export_lineage_records;
CREATE POLICY "export_lineage_records_select" ON public.export_lineage_records FOR SELECT
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "filing_certifications_select" ON public.filing_certifications;
CREATE POLICY "filing_certifications_select" ON public.filing_certifications FOR SELECT
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "regulatory_certifications_select" ON public.regulatory_certifications;
CREATE POLICY "regulatory_certifications_select" ON public.regulatory_certifications FOR SELECT
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "regulatory_evidence_packages_select" ON public.regulatory_evidence_packages;
CREATE POLICY "regulatory_evidence_packages_select" ON public.regulatory_evidence_packages FOR SELECT
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "regulatory_export_hashes_select" ON public.regulatory_export_hashes;
CREATE POLICY "regulatory_export_hashes_select" ON public.regulatory_export_hashes FOR SELECT
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "replay_assertions_select" ON public.replay_assertions;
CREATE POLICY "replay_assertions_select" ON public.replay_assertions FOR SELECT
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "retention_enforcement_log_select" ON public.retention_enforcement_log;
CREATE POLICY "retention_enforcement_log_select" ON public.retention_enforcement_log FOR SELECT
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "saf_t_exports_select" ON public.saf_t_exports;
CREATE POLICY "saf_t_exports_select" ON public.saf_t_exports FOR SELECT
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "vat_corrections_select" ON public.vat_corrections;
CREATE POLICY "vat_corrections_select" ON public.vat_corrections FOR SELECT
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "vat_declaration_lines_select" ON public.vat_declaration_lines;
CREATE POLICY "vat_declaration_lines_select" ON public.vat_declaration_lines FOR SELECT
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "vat_declarations_select" ON public.vat_declarations;
CREATE POLICY "vat_declarations_select" ON public.vat_declarations FOR SELECT
  USING (organization_id = public.auth_organization_id());

-- ── data_migration_sessions / data_migration_rows (read + write) ─────────────

DROP POLICY IF EXISTS "dmig_sessions_org_read"  ON public.data_migration_sessions;
DROP POLICY IF EXISTS "dmig_sessions_org_write" ON public.data_migration_sessions;

CREATE POLICY "dmig_sessions_org_read" ON public.data_migration_sessions FOR SELECT
  USING (organization_id = public.auth_organization_id());

CREATE POLICY "dmig_sessions_org_write" ON public.data_migration_sessions FOR ALL
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "dmig_rows_org_read"  ON public.data_migration_rows;
DROP POLICY IF EXISTS "dmig_rows_org_write" ON public.data_migration_rows;

CREATE POLICY "dmig_rows_org_read" ON public.data_migration_rows FOR SELECT
  USING (organization_id = public.auth_organization_id());

CREATE POLICY "dmig_rows_org_write" ON public.data_migration_rows FOR ALL
  USING (organization_id = public.auth_organization_id());

-- ── student_practice_log (insert + read + update) ────────────────────────────

DROP POLICY IF EXISTS "student_practice_log: org member insert" ON public.student_practice_log;
DROP POLICY IF EXISTS "student_practice_log: org member read"   ON public.student_practice_log;
DROP POLICY IF EXISTS "student_practice_log: org member update" ON public.student_practice_log;

CREATE POLICY "student_practice_log: org member insert" ON public.student_practice_log FOR INSERT
  WITH CHECK (organization_id = public.auth_organization_id());

CREATE POLICY "student_practice_log: org member read" ON public.student_practice_log FOR SELECT
  USING (organization_id = public.auth_organization_id());

CREATE POLICY "student_practice_log: org member update" ON public.student_practice_log FOR UPDATE
  USING (organization_id = public.auth_organization_id());

-- ── training_materials (insert + read + update) ──────────────────────────────

DROP POLICY IF EXISTS "training_materials_insert" ON public.training_materials;
DROP POLICY IF EXISTS "training_materials_select" ON public.training_materials;
DROP POLICY IF EXISTS "training_materials_update" ON public.training_materials;

CREATE POLICY "training_materials_insert" ON public.training_materials FOR INSERT
  WITH CHECK (organization_id = public.auth_organization_id());

CREATE POLICY "training_materials_select" ON public.training_materials FOR SELECT
  USING (organization_id = public.auth_organization_id());

CREATE POLICY "training_materials_update" ON public.training_materials FOR UPDATE
  USING (organization_id = public.auth_organization_id());
