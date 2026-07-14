-- =============================================================================
-- DEMO REQUESTS — Release 2.1, Platform Administration status workflow
--
-- Release 2.0 (20260710000001_demo_requests.sql) shipped a provisional
-- status set (new/contacted/scheduled/completed/converted/declined/spam)
-- before Platform Administration's actual lifecycle was specified. Release
-- 2.1's brief defines the real workflow Platform Administration will operate
-- against:
--
--   New → Contacted → Demo Scheduled → Demo Completed → Qualified → Converted
--   (+ Declined, Spam, reachable from any earlier state)
--
-- This migration only widens/renames the `status` CHECK constraint to match.
-- It does not touch RLS, indexes, or any other column — those were already
-- correct for this table's non-tenant design (see the prior migration's
-- extensive rationale, still valid and not repeated here).
--
-- Migrations are append-only: this adds a new constraint rather than editing
-- the original CREATE TABLE statement.
-- =============================================================================

-- Defensive remap: no production rows exist in any renamed state at the time
-- of writing (verified via direct query — all 9 rows are 'new'), but remap
-- anyway so this migration is correct regardless of what has been submitted
-- through the public form since Release 2.0 shipped.
UPDATE public.demo_requests SET status = 'demo_scheduled' WHERE status = 'scheduled';
UPDATE public.demo_requests SET status = 'demo_completed' WHERE status = 'completed';

ALTER TABLE public.demo_requests DROP CONSTRAINT demo_requests_status_check;

ALTER TABLE public.demo_requests ADD CONSTRAINT demo_requests_status_check
  CHECK (status IN (
    'new',             -- submitted, not yet worked
    'contacted',       -- a platform admin has reached out
    'demo_scheduled',  -- a demo call/meeting is booked
    'demo_completed',  -- the demo has taken place
    'qualified',       -- prospect confirmed as a good fit post-demo
    'converted',       -- became a paying tenant (see converted_organization_id)
    'declined',        -- prospect said no / not interested
    'spam'             -- not a genuine lead
  ));

COMMENT ON COLUMN public.demo_requests.status IS
  'Lead lifecycle worked by Platform Administration: new -> contacted -> demo_scheduled -> demo_completed -> qualified -> converted, with declined/spam reachable from any earlier state. See apps/web/src/modules/platform/routes/PlatformDemoRequestsPage.tsx.';
