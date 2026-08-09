-- ════════════════════════════════════════════════════════════════════════════
-- Announcements (Nyheter / TABSnytt)
--
-- CLAUDE.md lists "Nyheter / TABSnytt" as a real System Administration /
-- Support feature (platform admin publishes news, tenant staff see it), but
-- nothing backing it existed — no table, no publish UI, no tenant-facing
-- display. Platform-wide content (not per-tenant data): published once by a
-- platform admin, visible to every organization. RLS therefore has no
-- organization_id scoping — read access is gated on "currently published"
-- (is_active + published_at <= now() + not expired), not tenant membership.
-- Platform admin CRUD is served by the existing platform-admin Edge Function
-- (already gates every route on ctx.isPlatformAdmin); tenant-side reads go
-- directly through PostgREST under this table's own RLS SELECT policy,
-- matching how other simple read-only tenant displays already work.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TYPE public.announcement_severity AS ENUM ('info', 'warning', 'critical');

CREATE TABLE public.announcements (
  id            uuid                          NOT NULL DEFAULT gen_random_uuid(),
  title         text                          NOT NULL,
  body          text                          NOT NULL,
  severity      public.announcement_severity  NOT NULL DEFAULT 'info',
  is_active     boolean                       NOT NULL DEFAULT true,
  published_at  timestamptz                   NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  created_by    uuid                          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz                   NOT NULL DEFAULT now(),
  updated_at    timestamptz                   NOT NULL DEFAULT now(),

  CONSTRAINT announcements_pkey PRIMARY KEY (id),
  CONSTRAINT announcements_expiry_after_publish CHECK (expires_at IS NULL OR expires_at > published_at)
);

CREATE INDEX idx_announcements_published
  ON public.announcements (published_at DESC)
  WHERE is_active = true;

CREATE TRIGGER set_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Any authenticated user (any org, any role) can read currently-live
-- announcements — this is platform-wide broadcast content, not tenant data.
CREATE POLICY "announcements_select_live"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND published_at <= now()
    AND (expires_at IS NULL OR expires_at > now())
  );

-- Platform admins manage announcements exclusively through the platform-admin
-- Edge Function, which uses the service-role client (bypasses RLS entirely) —
-- no authenticated-role INSERT/UPDATE/DELETE policy is needed or granted.
