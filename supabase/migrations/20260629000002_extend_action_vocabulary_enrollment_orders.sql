-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260629000002_extend_action_vocabulary_enrollment_orders.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     Vocabulary Governance — Action Taxonomy Extension
--
-- PURPOSE:
--   Extends the permissions_action_check constraint with four new action
--   verbs required by the enrollment, order, and package consumption
--   migrations beginning at 20260630000001.
--
-- TIMING:
--   Slot 000002 on 20260629 — immediately after campaigns_lifecycle
--   (20260629000001), the last successfully applied migration before this
--   vocabulary is needed. Placed before 20260630000001_enrollment_requests
--   which first uses 'convert'. Follows the governance sequencing rule:
--   vocabulary extension migrations must occupy the next free slot AFTER
--   the last migration of the preceding phase (never mid-sequence within
--   a feature migration date group).
--
-- NEW ACTIONS:
--
--   convert  — Convert an approved enrollment request into a student record.
--              Distinct from 'approve' (which marks the enrollment as ready)
--              and 'create' (which would imply creating from scratch).
--              Used by: enrollment:request:convert
--
--   cancel   — Cancel an active order, preventing further processing.
--              Distinct from 'void' (accounting reversal) and 'delete'
--              (destructive). Cancellation is a workflow state transition
--              that preserves the order record for audit purposes.
--              Used by: orders:order:cancel
--
--   record   — Record a consumption event against a student package credit
--              balance. Distinct from 'create' (generic entity creation) —
--              'record' specifically models the act of debiting a credit
--              balance with an immutable consumption entry.
--              Used by: packages:consumption:record
--
--   reverse  — Reverse a previously recorded consumption event, restoring
--              the package credit. Distinct from 'delete' (destructive) —
--              reversal is append-only and preserves the original event.
--              Used by: packages:consumption:reverse
--
-- GOVERNANCE:
--   Any future action additions must follow this pattern — dedicated
--   migration, placed AFTER the last migration of the preceding phase on
--   its date (never mid-sequence), and before the first feature migration
--   that uses the new action. New actions may not be introduced inside
--   feature migrations.
-- ════════════════════════════════════════════════════════════════════════════

-- Drop and recreate the constraint to add 'convert', 'cancel', 'record', 'reverse'.
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
      -- Enrollment lifecycle (added 20260629000002)
      'convert',      -- convert an approved enrollment to a student record
      -- Order lifecycle (added 20260629000002)
      'cancel',       -- cancel an active order (state transition, not deletion)
      -- Package consumption (added 20260629000002)
      'record',       -- record a consumption event against a package credit balance
      'reverse',      -- reverse a previously recorded consumption event (append-only)
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
      -- Accounting ledger operations (added 20260603000007)
      'post',         -- commit finalized data to the general ledger
      'depreciate'    -- run depreciation engine and post asset entries
    )
  );

COMMENT ON CONSTRAINT permissions_action_check ON public.permissions IS
  'Approved action vocabulary. New actions require a dedicated governance migration placed after the last migration of the preceding phase (never mid-sequence). See migrations 20260603000007 and 20260629000002 for the sequencing rule and prior extensions.';
