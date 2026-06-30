-- WP3A-2: Prevent duplicate Swedish organization numbers across active organizations.
-- Partial index: multiple NULLs are allowed (org_number is optional).
-- Scoped to non-deleted organizations only so soft-deleted rows do not block reuse.
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_org_number
  ON public.organizations (org_number)
  WHERE org_number IS NOT NULL AND deleted_at IS NULL;
