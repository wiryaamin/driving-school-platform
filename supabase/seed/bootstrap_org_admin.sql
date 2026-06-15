-- =============================================================================
-- BOOTSTRAP: First Organization Administrator
--
-- USE THIS FILE FOR: production / staging / new Supabase project instances
-- FOR LOCAL DEV:     use `supabase db reset` — supabase/seed.sql runs automatically
--
-- Prerequisites:
--   1. All migrations applied (supabase start, or db push --linked)
--   2. Auth user created in Dashboard → Authentication → Users → Add User
--   3. Copy the UUID shown after creation into v_user_id below
--   4. Set v_user_email to match the email used in step 2
--
-- This script is safe to re-run. Guards prevent double-bootstrap.
-- Failed manual INSERTs are rolled back atomically — no cleanup needed.
-- Profiles are GLOBAL (no organization_id). Tenant scoping is via memberships.
--
-- LOCAL DEV STABLE UUID: 0b21a25a-a41a-4854-8407-509b320c9baf
--   (matches supabase/seed.sql — use this UUID for local dev manual runs)
-- =============================================================================

DO $$
DECLARE
  -- ─── CONFIGURE THESE VALUES ───────────────────────────────────────────────
  -- Auth user UUID from Dashboard → Authentication → Users
  -- For local dev after db reset: use 0b21a25a-a41a-4854-8407-509b320c9baf
  v_user_id          uuid := '0b21a25a-a41a-4854-8407-509b320c9baf';

  -- Must match the email used when creating the auth user in the Dashboard
  v_user_email       text := 'admin@trafikskola.se';
  v_user_first_name  text := 'Admin';
  v_user_last_name   text := 'Administratör';

  -- Organization details (legal_name is required — Swedish org registration name)
  v_org_slug         text := 'trafikskolan';        -- lowercase, URL-safe, 3–63 chars, unique
  v_org_name         text := 'Trafikskolan AB';     -- display name
  v_org_legal_name   text := 'Trafikskolan AB';     -- registered legal name (NOT NULL — required for SE compliance)
  v_org_number       text := NULL;                  -- Swedish organisationsnummer, e.g. '556123-4567' (optional at bootstrap)

  -- Primary location (required — scheduling, invoicing, and compliance are location-scoped)
  v_location_name    text := 'Huvudkontoret';
  v_location_addr    text := 'Storgatan 1';
  v_location_postal  text := '111 22';              -- Swedish format: NNN NN (e.g. '111 22' or '11122')
  v_location_city    text := 'Stockholm';
  -- ─── END CONFIGURE ────────────────────────────────────────────────────────

  v_org_id           uuid;
  v_membership_id    uuid;
  v_owner_role_id    uuid;
BEGIN

  -- Guard: verify the auth.users record exists before doing anything
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    RAISE EXCEPTION
      E'\n\n'
      '  !! User not found in auth.users !!\n'
      '  Create the user in Dashboard → Authentication → Users first,\n'
      '  then run this script. UUID attempted: %\n', v_user_id;
  END IF;

  -- Guard: skip if already bootstrapped (idempotent)
  IF EXISTS (SELECT 1 FROM public.memberships WHERE user_id = v_user_id) THEN
    RAISE NOTICE 'User % already has a membership — bootstrap already complete, skipping.', v_user_id;
    RETURN;
  END IF;

  -- Guard: verify migrations ran (org_owner role must exist)
  SELECT id INTO v_owner_role_id
  FROM public.roles
  WHERE name = 'org_owner' AND is_system_role = true;

  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION
      'org_owner role not found. Apply all migrations before running bootstrap.';
  END IF;

  -- ─── Step 1: Organization ─────────────────────────────────────────────────
  -- legal_name is NOT NULL — required for Swedish compliance (SIE4, VAT, AGI).
  -- slug must match: ^[a-z0-9][a-z0-9\-]{1,61}[a-z0-9]$ (3–63 chars, lowercase, hyphens ok).
  INSERT INTO public.organizations (
    slug, name, legal_name, org_number,
    status, subscription_tier, subscription_status,
    max_locations, max_users,
    trial_ends_at,
    settings
  ) VALUES (
    v_org_slug, v_org_name, v_org_legal_name, v_org_number,
    'active', 'trial', 'trialing',
    5, 20,
    now() + interval '30 days',
    jsonb_build_object(
      'timezone',  'Europe/Stockholm',
      'currency',  'SEK',
      'locale',    'sv-SE',
      'vat_rate',  0.25
    )
  )
  RETURNING id INTO v_org_id;

  RAISE NOTICE '✓ Organization created: % (id=%)', v_org_name, v_org_id;

  -- ─── Step 2: Primary location ─────────────────────────────────────────────
  -- At least one location is required. Scheduling, invoicing, and compliance
  -- references are location-scoped. The partial index enforces one primary per org.
  -- postal_code must match Swedish format: ^\d{3}\s?\d{2}$ (e.g. '111 22' or '11122').
  INSERT INTO public.organization_locations (
    organization_id, name, address_line1, postal_code, city,
    country, is_primary, status
  ) VALUES (
    v_org_id, v_location_name, v_location_addr, v_location_postal, v_location_city,
    'SE', true, 'active'
  );

  RAISE NOTICE '✓ Primary location created: % — %', v_location_city, v_location_name;

  -- ─── Step 3: Global profile ───────────────────────────────────────────────
  -- profiles has NO organization_id column. Migration 20260527000002 (phase1b2)
  -- removed it as part of the "global identity refactor":
  --   profiles    = global identity (who you are) — one row per auth user
  --   memberships = tenant relationship (where you belong)
  -- Org isolation is enforced by the is_same_org_member() RLS policy.
  INSERT INTO public.profiles (
    id, first_name, last_name, email,
    is_active, onboarded_at
  ) VALUES (
    v_user_id, v_user_first_name, v_user_last_name, v_user_email,
    true, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    first_name    = EXCLUDED.first_name,
    last_name     = EXCLUDED.last_name,
    email         = EXCLUDED.email,
    is_active     = true,
    onboarded_at  = COALESCE(public.profiles.onboarded_at, now());

  RAISE NOTICE '✓ Profile created: % % <%>', v_user_first_name, v_user_last_name, v_user_email;

  -- ─── Step 4: Membership ───────────────────────────────────────────────────
  INSERT INTO public.memberships (
    user_id, organization_id, status, joined_at
  ) VALUES (
    v_user_id, v_org_id, 'active', now()
  )
  RETURNING id INTO v_membership_id;

  RAISE NOTICE '✓ Membership created: %', v_membership_id;

  -- ─── Step 5: Assign org_owner role ────────────────────────────────────────
  -- org_owner is granted ALL permissions via CROSS JOIN in the migration seed.
  -- membership_roles.organization_id is auto-populated by the
  -- membership_roles_set_org_id BEFORE INSERT trigger.
  -- location_id IS NULL = org-wide scope (not restricted to a single branch).
  INSERT INTO public.membership_roles (
    membership_id, role_id, is_active
  ) VALUES (
    v_membership_id, v_owner_role_id, true
  );

  RAISE NOTICE '✓ org_owner role assigned (org-wide, all permissions)';

  RAISE NOTICE '';
  RAISE NOTICE '=== Bootstrap complete ===';
  RAISE NOTICE 'Organization ID : %', v_org_id;
  RAISE NOTICE 'User UUID       : %', v_user_id;
  RAISE NOTICE 'Membership ID   : %', v_membership_id;
  RAISE NOTICE '';
  RAISE NOTICE 'Sign in at http://localhost:5173 (local) or your hosted URL.';
  RAISE NOTICE 'The auth hook will inject organization_id, role=org_owner, and';
  RAISE NOTICE 'all permissions into the JWT on first sign-in.';

END $$;
