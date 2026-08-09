-- ════════════════════════════════════════════════════════════════════════════
-- Vehicle Compliance Reminders — reminder-sent tracking columns
--
-- vehicles.registration_expires_at / insurance_expires_at / next_inspection_
-- due_at have been indexed for exactly this purpose since Phase 2A (comment
-- on the partial index literally anticipates lookups by expiry), but nothing
-- has ever queried them proactively — a lapsed vehicle registration,
-- insurance policy, or besiktning is a genuine legal-compliance risk for a
-- driving school, silently invisible unless a staff member happens to open
-- the Resources page. This migration adds one reminder_sent_at column per
-- expiry type (three separate compliance concerns, tracked independently —
-- a single column would wrongly suppress an insurance reminder just because
-- a registration reminder already fired) so the new maintenance-tick step
-- (deployed alongside this migration, mirroring checkDueRegulatoryWorkflows'
-- proven due-soon + overdue-escalation pattern) can dedupe correctly.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.vehicles
  ADD COLUMN registration_reminder_sent_at timestamptz,
  ADD COLUMN insurance_reminder_sent_at    timestamptz,
  ADD COLUMN inspection_reminder_sent_at   timestamptz;
