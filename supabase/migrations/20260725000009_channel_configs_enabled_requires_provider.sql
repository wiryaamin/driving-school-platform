-- =============================================================================
-- channel_configs — prevent enabled=true with no provider (production blocker)
--
-- Live data showed 5 orgs with enabled=true, provider=null for email — this
-- state passes RLS/permission checks but the dispatch worker has nothing to
-- send through, so notifications silently never go out. Confirmed reachable
-- through the real UI (ChannelSettingsPage's Save button has no guard against
-- toggling "enabled" on before selecting a provider).
--
-- Fix: reject the invalid state at the database level (defense in depth
-- regardless of which caller writes the row), then repair existing rows.
-- =============================================================================

-- Repair existing invalid rows first (so the constraint can be added).
UPDATE public.channel_configs
SET enabled = false
WHERE enabled = true AND provider IS NULL;

ALTER TABLE public.channel_configs
  ADD CONSTRAINT channel_configs_enabled_requires_provider
  CHECK (NOT enabled OR provider IS NOT NULL);
