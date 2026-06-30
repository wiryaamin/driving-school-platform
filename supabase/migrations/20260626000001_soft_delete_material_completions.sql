-- Add deleted_at to student_material_completions for soft-delete support.
-- Previously the "unmark completion" path did a hard DELETE, losing audit history.
-- With deleted_at, unmarking sets deleted_at; re-marking via upsert resets it to NULL.
-- The existing UNIQUE (organization_id, student_id, material_id) constraint is kept so
-- the upsert ON CONFLICT path continues to reactivate the same row.

ALTER TABLE student_material_completions ADD COLUMN deleted_at TIMESTAMPTZ;

-- Index to make deleted_at IS NULL queries efficient on large orgs.
CREATE INDEX smc_active ON student_material_completions (organization_id, student_id)
  WHERE deleted_at IS NULL;

-- Guard: row-level update permission for service_role (already has ALL, no change needed).
-- Admin SELECT policy already exists; add deleted_at filter at application layer.
COMMENT ON COLUMN student_material_completions.deleted_at IS
  'Soft-delete timestamp. NULL = active completion. Non-NULL = student unmarked progress.';
