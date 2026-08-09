-- =============================================================================
-- Fix: notifications_select RLS policy checks a permission code that was
-- never granted to any role.
--
-- Discovered live while commissioning the Regulatory Workflow Tracker's
-- due-date reminder (event-worker's checkDueRegulatoryWorkflows() correctly
-- wrote a row to `notifications`, confirmed via the scheduled pg_cron tick
-- setting regulatory_workflows.reminder_sent_at) — but the notification was
-- then invisible through both a direct query and the real, production
-- `notifications` Edge Function route (which uses a user-JWT-scoped client,
-- so it is subject to this same RLS policy, not a service-role bypass).
--
-- Root cause: 20260529000001_phase3d_notifications.sql's "notifications_select"
-- policy checks has_permission('notifications:read') — a permission code
-- that was never seeded into public.permissions and never granted to any
-- role. Every real caller actually holds 'notifications:notification:read'
-- (seeded by 20260619000007_seed_notifications_permissions.sql, checked
-- correctly by the notifications Edge Function's own requirePerm() call,
-- and confirmed present in this session's own live JWT). This means the
-- in-app Notification Bell / notification list has been returning zero
-- rows for every organization since Phase 3D, independent of anything
-- built in this session — the Edge Function's own permission check always
-- passed, but the underlying RLS SELECT policy silently filtered out every
-- row regardless.
--
-- Fixed by correcting the checked permission code to match the one that
-- actually exists and is granted — the same one-line "wrong string in an
-- RLS check" shape as several other defects already found this session,
-- just on a SELECT policy instead of a CHECK constraint.
-- =============================================================================

DROP POLICY "notifications_select" ON notifications;

CREATE POLICY "notifications_select"
  ON notifications FOR SELECT
  USING (
    organization_id = auth_organization_id()
    AND has_permission('notifications:notification:read')
  );
