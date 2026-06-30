-- ════════════════════════════════════════════════════════════════════════════
-- Fix outbound_messages.created_by nullable
--
-- The communication-worker dispatches messages on behalf of the system (no
-- authenticated user context). It previously set created_by to the zero-UUID
-- sentinel '00000000-0000-0000-0000-000000000000', which violates the FK
-- constraint to auth.users since that user does not exist.
--
-- Fix: make created_by nullable so system-dispatched messages can be inserted
-- without a user reference. UI-initiated sends (manual compose) still set
-- created_by to the authenticated user's ID.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE outbound_messages
  ALTER COLUMN created_by DROP NOT NULL;

-- Update the RLS insert policy to allow both authenticated and system inserts.
-- Service role (used by communication-worker) bypasses RLS entirely, so no
-- policy change is needed for the worker path. The explicit policy below
-- covers the authenticated (UI compose) path as before.

COMMENT ON COLUMN outbound_messages.created_by IS
  'Auth user who initiated this message. NULL for system-dispatched messages (reminders, automation).';
