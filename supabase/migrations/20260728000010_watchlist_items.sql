-- ════════════════════════════════════════════════════════════════════════════
-- Watchlist (Bevakningar) — shared org-wide follow-up list, backed by a table
--
-- Found via live pilot commissioning: the entire Bevakningar feature
-- (useWatchlist.ts) stored items in browser localStorage only — no table, no
-- multi-user visibility, no tenant isolation. A receptionist flagging "this
-- student's payment is overdue, follow up" was invisible to every other
-- staff member and vanished on a cleared browser or a different device —
-- the opposite of what a shared team follow-up list is for. Unlike Support
-- (deliberately deferred, documented in SupportPage.tsx), this was simply
-- never wired to a backend.
--
-- Mirrors user_favorites' proven shape (20260728000007) — small, per-org
-- table, no new architecture — except visibility is org-wide, not per-user,
-- since a shared watchlist is the entire point of the feature (student_notes
-- was not reused: its FK is specifically to student_id, but a watchlist
-- subject is free text and covers non-student concerns too — payment,
-- exam, other).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TYPE public.watchlist_item_type   AS ENUM ('student', 'payment', 'exam', 'other');
CREATE TYPE public.watchlist_item_status AS ENUM ('active', 'archived');

CREATE TABLE public.watchlist_items (
  id               uuid                        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid                        NOT NULL,
  subject          text                        NOT NULL,
  type             public.watchlist_item_type   NOT NULL DEFAULT 'other',
  note             text                        NOT NULL,
  status           public.watchlist_item_status NOT NULL DEFAULT 'active',
  archived_at      timestamptz,
  created_by       uuid                        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz                 NOT NULL DEFAULT now(),
  updated_at       timestamptz                 NOT NULL DEFAULT now(),

  CONSTRAINT watchlist_items_pkey    PRIMARY KEY (id),
  CONSTRAINT watchlist_items_org_fkey FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT watchlist_items_archived_consistency CHECK (
    (status = 'archived') = (archived_at IS NOT NULL)
  )
);

CREATE INDEX idx_watchlist_items_org
  ON public.watchlist_items (organization_id, created_at DESC);

CREATE TRIGGER watchlist_items_set_updated_at
  BEFORE UPDATE ON public.watchlist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;

-- Any staff member at the org can see and manage every watchlist item —
-- shared team visibility is the point of this feature (contrast with
-- user_favorites, which is deliberately private per user).
CREATE POLICY "watchlist_items_select_org"
  ON public.watchlist_items FOR SELECT
  TO authenticated
  USING (organization_id = public.auth_organization_id());

CREATE POLICY "watchlist_items_insert_org"
  ON public.watchlist_items FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.auth_organization_id());

CREATE POLICY "watchlist_items_update_org"
  ON public.watchlist_items FOR UPDATE
  TO authenticated
  USING (organization_id = public.auth_organization_id())
  WITH CHECK (organization_id = public.auth_organization_id());

CREATE POLICY "watchlist_items_delete_org"
  ON public.watchlist_items FOR DELETE
  TO authenticated
  USING (organization_id = public.auth_organization_id());
