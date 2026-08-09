-- ════════════════════════════════════════════════════════════════════════════
-- One-off data repair, not a schema change.
--
-- During live permission-hardening testing, this session temporarily
-- downgraded the E2E test org's only staff account (membership
-- 19ac8e1f-aaf7-4bc6-b318-40316c1d6041) from org_owner to instructor to
-- verify permission boundaries with a genuinely restricted role. RLS on
-- membership_roles correctly blocked the account from re-promoting itself
-- (proving the boundary is real, not decorative) — which also means it
-- correctly locked the test session out of restoring its own access.
-- Restoring via migration (the only available elevated-privilege path in
-- this environment) rather than leaving the E2E test org's admin account
-- stuck on a restricted role.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE public.membership_roles
SET    role_id = (SELECT id FROM public.roles WHERE name = 'org_owner')
WHERE  id = 'c2a258ee-2b36-4d45-8606-0b2f489686d5'
  AND  membership_id = '19ac8e1f-aaf7-4bc6-b318-40316c1d6041';
