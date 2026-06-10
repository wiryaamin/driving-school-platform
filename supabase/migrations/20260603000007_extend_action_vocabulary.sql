-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260603000007_extend_action_vocabulary.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     Vocabulary Governance — Action Taxonomy Extension
--
-- PURPOSE:
--   Extends the permissions_action_check constraint with two new ERP
--   accounting verbs that cannot be expressed with existing actions.
--
-- TIMING:
--   Slot 000007 on 20260603 — the first free slot after Phase 4E's last
--   migration (20260603000006_phase4e_indexes). Phase 4E occupies slots
--   000001–000006 on this date. Slot 000007 runs after all Phase 4E
--   migrations complete and before Phase 4F begins at 20260604000001.
--
--   Governance rule: vocabulary extension migrations must occupy the
--   next free slot AFTER the last migration of the preceding phase on
--   its date. Never placed mid-sequence within a phase's date group.
--
-- NEW ACTIONS:
--
--   post       — Authorize the act of posting finalized data to the general
--                ledger (payroll journals, salary payments). Distinct from
--                'manage' (CRUD on the payroll run entity). In ERP accounting,
--                posting authority is a separate delegation boundary from
--                data-entry authority. Maps to commit-to-ledger operations.
--
--   depreciate — Authorize running the depreciation calculation engine and
--                posting depreciation entries for fixed assets. A distinct,
--                one-directional, ledger-affecting operation under Swedish
--                fixed-asset accounting (BokfL §5). Cannot be collapsed into
--                'manage' without losing audit precision.
--
-- GOVERNANCE:
--   Any future action additions must follow this pattern — dedicated migration,
--   placed AFTER the last migration of the preceding phase on its date (never
--   mid-sequence), and before the first feature migration that uses the new
--   action. New actions may not be introduced inside feature migrations.
-- ════════════════════════════════════════════════════════════════════════════

-- Drop and recreate the constraint to add 'post' and 'depreciate'.
-- The permissions table has O(100) rows — full scan is instantaneous.

ALTER TABLE public.permissions
  DROP CONSTRAINT permissions_action_check;

ALTER TABLE public.permissions
  ADD CONSTRAINT permissions_action_check CHECK (
    action IN (
      -- CRUD
      'create', 'read', 'update', 'delete',
      -- Data transfer
      'export', 'import',
      -- Workflow transitions
      'approve', 'void',
      -- Relation management
      'assign', 'advance', 'archive',
      -- Process execution
      'run',
      -- Composite
      'manage',
      -- Configuration
      'configure',
      -- Communication
      'send',
      -- Accounting ledger operations (added Phase 4F/4G governance)
      'post',        -- commit finalized data to the general ledger
      'depreciate'   -- run depreciation engine and post asset entries
    )
  );

COMMENT ON CONSTRAINT permissions_action_check ON public.permissions IS
  'Approved action vocabulary. New actions require a dedicated governance migration placed after the last migration of the preceding phase (never mid-sequence). See migration 20260603000007 header for the sequencing rule.';
