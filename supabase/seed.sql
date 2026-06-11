-- =============================================================================
-- LOCAL DEVELOPMENT SEED
-- supabase/seed.sql — runs automatically after: supabase db reset
--
-- PURPOSE:
--   Restores a fully-bootstrapped local development environment after every
--   db reset. Creates a deterministic dev admin user with a stable UUID (so
--   the bootstrap is reproducible without any manual steps), then wires up
--   the complete org → location → profile → membership → org_owner role chain
--   that the auth hook's get_user_jwt_claims() requires to enrich JWTs.
--
-- AFTER RESET:
--   1. supabase db reset          ← applies migrations + runs this seed
--   2. Open http://localhost:5173
--   3. Sign in with:
--        Email:    admin@trafikskola.se
--        Password: Admin1234!
--   JWT will contain: organization_id, role=org_owner, all permissions.
--
-- LOCAL CREDENTIALS (dev only — never use in production or staging):
--   Email:    admin@trafikskola.se
--   Password: Admin1234!
--   UUID:     11111111-1111-1111-1111-111111111111
--
-- PRODUCTION BOOTSTRAP:
--   Use supabase/seed/bootstrap_org_admin.sql after creating the auth user
--   manually in the Supabase Dashboard.
-- =============================================================================

DO $$
DECLARE
  -- Stable dev UUID — fixed so bootstrap is reproducible after every db reset.
  -- Must match v_user_id in supabase/seed/bootstrap_org_admin.sql.
  v_user_id          uuid := '11111111-1111-1111-1111-111111111111';
  v_email            text := 'admin@trafikskola.se';
  v_password         text := 'Admin1234!';

  v_org_id           uuid;
  v_membership_id    uuid;
  v_owner_role_id    uuid;
BEGIN

  -- ── 1. Dev auth user ───────────────────────────────────────────────────────
  -- Inserted directly into auth.users with bcrypt-hashed password.
  -- email_confirmed_at = now() so the user can log in without email confirmation.
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now(),
    '', '', '', ''
  )
  ON CONFLICT (id) DO NOTHING;

  -- ── 2. Email identity (required for GoTrue email login) ────────────────────
  -- auth.identities links the auth user to the email provider.
  -- Guard avoids unique-constraint conflicts on re-run.
  IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_user_id) THEN
    INSERT INTO auth.identities (
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      v_user_id::text,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email',
      now(), now(), now()
    );
  END IF;

  -- ── 3. Guard: migrations must be applied (org_owner role must exist) ────────
  SELECT id INTO v_owner_role_id
  FROM public.roles
  WHERE name = 'org_owner' AND is_system_role = true;

  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION
      'org_owner role not found — all migrations must be applied before seeding. '
      'Run: supabase db reset (which applies migrations then runs this seed).';
  END IF;

  -- ── 4. Guard: idempotent — skip if already bootstrapped ────────────────────
  IF EXISTS (SELECT 1 FROM public.memberships WHERE user_id = v_user_id) THEN
    RAISE NOTICE 'Dev user already bootstrapped — skipping tenant setup.';
    RETURN;
  END IF;

  -- ── 5. Organization ────────────────────────────────────────────────────────
  -- legal_name is NOT NULL (required for Swedish compliance: SIE4, VAT, AGI).
  INSERT INTO public.organizations (
    slug,
    name,
    legal_name,
    status,
    subscription_tier,
    subscription_status,
    max_locations,
    max_users,
    trial_ends_at,
    settings
  ) VALUES (
    'trafikskolan',
    'Trafikskolan AB',
    'Trafikskolan AB',
    'active',
    'trial',
    'trialing',
    5,
    20,
    now() + interval '30 days',
    '{"timezone":"Europe/Stockholm","currency":"SEK","locale":"sv-SE","vat_rate":0.25}'::jsonb
  )
  RETURNING id INTO v_org_id;

  RAISE NOTICE '✓ Organization: Trafikskolan AB (id=%)', v_org_id;

  -- ── 6. Primary location ────────────────────────────────────────────────────
  -- At least one location is required for scheduling, invoicing, and compliance.
  INSERT INTO public.organization_locations (
    organization_id,
    name,
    address_line1,
    postal_code,
    city,
    country,
    is_primary,
    status
  ) VALUES (
    v_org_id,
    'Huvudkontoret',
    'Storgatan 1',
    '111 22',
    'Stockholm',
    'SE',
    true,
    'active'
  );

  RAISE NOTICE '✓ Primary location: Huvudkontoret, Stockholm';

  -- ── 7. Profile ─────────────────────────────────────────────────────────────
  -- profiles is global (no organization_id). Tenant scoping is via memberships.
  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    email,
    is_active,
    onboarded_at
  ) VALUES (
    v_user_id,
    'Admin',
    'Administratör',
    v_email,
    true,
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    first_name   = EXCLUDED.first_name,
    last_name    = EXCLUDED.last_name,
    email        = EXCLUDED.email,
    is_active    = true,
    onboarded_at = COALESCE(public.profiles.onboarded_at, now());

  RAISE NOTICE '✓ Profile: Admin Administratör <%>', v_email;

  -- ── 8. Membership ──────────────────────────────────────────────────────────
  INSERT INTO public.memberships (
    user_id,
    organization_id,
    status,
    joined_at
  ) VALUES (
    v_user_id,
    v_org_id,
    'active',
    now()
  )
  RETURNING id INTO v_membership_id;

  RAISE NOTICE '✓ Membership: % → Trafikskolan AB', v_membership_id;

  -- ── 9. org_owner role ──────────────────────────────────────────────────────
  -- org_owner holds ALL permissions (granted by CROSS JOIN in the foundation migration).
  -- membership_roles_set_org_id trigger auto-populates organization_id from the membership.
  -- location_id IS NULL = org-wide scope (not restricted to a single branch).
  INSERT INTO public.membership_roles (
    membership_id,
    role_id,
    is_active
  ) VALUES (
    v_membership_id,
    v_owner_role_id,
    true
  );

  RAISE NOTICE '✓ Role: org_owner (org-wide, all permissions)';
  RAISE NOTICE '';
  RAISE NOTICE '=== Local dev seed complete ===';
  RAISE NOTICE 'URL:      http://localhost:5173';
  RAISE NOTICE 'Email:    %', v_email;
  RAISE NOTICE 'Password: %', v_password;
  RAISE NOTICE 'User UUID: %', v_user_id;
  RAISE NOTICE 'Org ID:    %', v_org_id;
  RAISE NOTICE '';
  RAISE NOTICE 'The auth hook will inject organization_id, role=org_owner,';
  RAISE NOTICE 'and all permissions into the JWT on first sign-in.';

END $$;
