-- ════════════════════════════════════════════════════════════════════════════
-- User Favorites (sidebar "Favorites" nav feature)
--
-- CLAUDE.md lists "Favorites" as a real System Administration nav feature —
-- nothing backed it: no table, no UI. Per-user, per-organization pinned pages
-- for quick navigation (a personal bookmark list, not shared with other staff
-- at the school). RLS scopes strictly to the owning user — even another
-- admin in the same org cannot see or manage someone else's favorites.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.user_favorites (
  id               uuid         NOT NULL DEFAULT gen_random_uuid(),
  user_id          uuid         NOT NULL,
  organization_id  uuid         NOT NULL,
  label            text         NOT NULL,
  path             text         NOT NULL,
  created_at       timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT user_favorites_pkey        PRIMARY KEY (id),
  CONSTRAINT user_favorites_user_fkey   FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT user_favorites_org_fkey    FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT user_favorites_user_path_uniq UNIQUE (user_id, path)
);

CREATE INDEX idx_user_favorites_user ON public.user_favorites (user_id, created_at DESC);

ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_favorites_select_own"
  ON public.user_favorites FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_favorites_insert_own"
  ON public.user_favorites FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = public.auth_organization_id()
  );

CREATE POLICY "user_favorites_delete_own"
  ON public.user_favorites FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
