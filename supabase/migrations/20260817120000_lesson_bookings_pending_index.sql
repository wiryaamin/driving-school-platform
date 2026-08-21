-- =============================================================================
-- Booking Engine P0 remediation (F1) — index backing the pending-request SLA
-- summary endpoint (GET /bookings/pending-summary).
--
-- BokningarPage's ">24h / >48h" staff badges previously derived from a
-- capped, windowed list fetch (per_page: 200 over a ±6 month range), which
-- silently truncates for any moderately active school. The fix replaces that
-- with a dedicated head-only count query scoped by (organization_id, status
-- = 'reserved', created_at) — this index backs exactly that query shape,
-- mirroring the existing idx_lesson_bookings_org_confirmed /
-- idx_lesson_bookings_unpaid_confirmed partial-index pattern already
-- established in 20260528000005_phase2b_scheduling_indexes.sql.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_lesson_bookings_org_reserved
  ON public.lesson_bookings (organization_id, created_at)
  WHERE status = 'reserved' AND deleted_at IS NULL;

COMMENT ON INDEX public.idx_lesson_bookings_org_reserved IS
  'Backs GET /bookings/pending-summary — pending-approval SLA count queries (>24h/>48h waiting), independent of any paginated list fetch.';
