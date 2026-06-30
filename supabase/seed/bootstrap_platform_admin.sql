-- =============================================================================
-- BOOTSTRAP: First Platform Administrator
--
-- USE THIS FILE FOR: creating the first platform_superadmin on any environment
-- SUBSEQUENT ADMINS: run again with v_granted_by_id set to an existing PA's UUID
--
-- Prerequisites:
--   1. All migrations applied (supabase db push --linked)
--   2. Auth user created in Dashboard → Authentication → Users → Add User
--   3. Copy the UUID shown after creation into v_user_id below
--   4. Set v_user_email, v_user_first_name, v_user_last_name to match step 2
--   5. Run via Dashboard → SQL Editor (service role context required)
--
-- This script is safe to re-run. Guards prevent double-bootstrap.
-- All steps are atomic — no partial state on failure.
--
-- After completion:
--   1. User signs in to the application
--   2. Auth hook fires → JWT receives is_platform_admin: true
--   3. Call supabase.auth.refreshSession() to activate (or sign out/in)
--   4. Optionally call switch-tenant Edge Function to enter a tenant context
-- =============================================================================

DO $$
DECLARE
  -- ─── CONFIGURE THESE VALUES ───────────────────────────────────────────────
  -- Auth user UUID from Dashboard → Authentication → Users
  v_user_id         uuid := '00000000-0000-0000-0000-000000000000';  -- REPLACE ME

  -- Must match the email used when creating the auth user
  v_user_email      text := 'platform@trafikskola.se';               -- REPLACE ME
  v_user_first_name text := 'Platform';                              -- REPLACE ME
  v_user_last_name  text := 'Admin';                                 -- REPLACE ME

  -- Role to grant. Must be one of:
  --   'platform_superadmin'  — full platform access (use for first bootstrap)
  --   'platform_support'     — read-only support access
  --   'platform_billing'     — billing and subscription management
  v_role            text := 'platform_superadmin';

  -- For the FIRST bootstrap, leave this NULL (no granter exists yet).
  -- For subsequent PA grants, set to the UUID of the granting platform admin.
  v_granted_by_id   uuid := NULL;

  -- Optional human-readable note stored with this grant (preserved for audit).
  v_notes           text := 'First platform admin bootstrap — created via Dashboard SQL Editor';
  -- ─── END CONFIGURE ────────────────────────────────────────────────────────

  v_pa_id           uuid;
  v_outbox_id       uuid;
BEGIN

  -- ── Guard: UUID placeholder ─────────────────────────────────────────────────
  IF v_user_id = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION
      E'\n\n'
      '  !! v_user_id has not been configured !!\n'
      '  Replace the placeholder UUID at the top of this script\n'
      '  with the UUID from Dashboard → Authentication → Users.\n';
  END IF;

  -- ── Guard: auth.users record must exist ─────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    RAISE EXCEPTION
      E'\n\n'
      '  !! User not found in auth.users !!\n'
      '  Create the user in Dashboard → Authentication → Users first,\n'
      '  then run this script. UUID attempted: %\n', v_user_id;
  END IF;

  -- ── Guard: role value must be valid ─────────────────────────────────────────
  IF v_role NOT IN ('platform_superadmin', 'platform_support', 'platform_billing') THEN
    RAISE EXCEPTION
      'Invalid role: %. Must be platform_superadmin, platform_support, or platform_billing.',
      v_role;
  END IF;

  -- ── Guard: granted_by user must exist if provided ───────────────────────────
  IF v_granted_by_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = v_granted_by_id
  ) THEN
    RAISE EXCEPTION
      'v_granted_by_id % not found in auth.users. '
      'Use NULL for the first bootstrap (no granter exists yet).',
      v_granted_by_id;
  END IF;

  -- ── Guard: idempotency — skip if already a platform admin ───────────────────
  IF EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = v_user_id) THEN
    RAISE NOTICE
      'User % is already in platform_admins — bootstrap already complete, skipping.',
      v_user_id;
    RETURN;
  END IF;

  -- ── Step 1: Global profile (upsert) ─────────────────────────────────────────
  -- profiles is GLOBAL (no organization_id). Platform admins do not belong to
  -- any tenant — their scope is the platform itself. A profiles row is needed
  -- so the application can display the PA's name where required.
  INSERT INTO public.profiles (
    id, first_name, last_name, email,
    is_active, onboarded_at
  ) VALUES (
    v_user_id, v_user_first_name, v_user_last_name, v_user_email,
    true, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    first_name   = EXCLUDED.first_name,
    last_name    = EXCLUDED.last_name,
    email        = EXCLUDED.email,
    is_active    = true,
    onboarded_at = COALESCE(public.profiles.onboarded_at, now());

  RAISE NOTICE '✓ Profile ready: % % <%>', v_user_first_name, v_user_last_name, v_user_email;

  -- ── Step 2: Platform admin row ───────────────────────────────────────────────
  -- granted_by = NULL is correct for the first bootstrap: no granting authority
  -- pre-exists. The FK is ON DELETE SET NULL and the column is nullable — this
  -- is the documented bootstrap case. Subsequent grants must set granted_by.
  INSERT INTO public.platform_admins (
    user_id,
    role,
    is_active,
    granted_by,
    granted_at,
    notes
  ) VALUES (
    v_user_id,
    v_role,
    true,
    v_granted_by_id,
    now(),
    v_notes
  )
  RETURNING id INTO v_pa_id;

  RAISE NOTICE '✓ Platform admin row created: id=%', v_pa_id;
  RAISE NOTICE '  role       = %', v_role;
  RAISE NOTICE '  granted_by = %', COALESCE(v_granted_by_id::text, 'NULL (bootstrap)');

  -- ── Step 3: Audit event ──────────────────────────────────────────────────────
  -- organization_id = NULL: this event is platform-scoped, not tenant-scoped.
  -- The event_outbox.organization_id column is nullable — this is intentional
  -- for platform-level events that do not belong to any tenant.
  v_outbox_id := public.insert_outbox_event(
    p_event_type      := 'auth.platform_admin_granted',
    p_channel         := 'internal',
    p_organization_id := NULL,
    p_payload         := jsonb_build_object(
      'platform_admin_id', v_pa_id,
      'user_id',           v_user_id,
      'role',              v_role,
      'granted_by',        v_granted_by_id,
      'method',            'bootstrap_seed',
      'notes',             v_notes
    ),
    p_metadata        := jsonb_build_object(
      'source', 'bootstrap_platform_admin.sql'
    )
  );

  RAISE NOTICE '✓ Audit event queued: outbox_id=%', v_outbox_id;

  -- ── Summary ──────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '=== Platform Admin Bootstrap complete ===';
  RAISE NOTICE 'Platform Admin ID : %', v_pa_id;
  RAISE NOTICE 'User UUID         : %', v_user_id;
  RAISE NOTICE 'Role              : %', v_role;
  RAISE NOTICE 'Granted by        : %', COALESCE(v_granted_by_id::text, 'NULL (first bootstrap)');
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. User signs in to the application';
  RAISE NOTICE '  2. Auth hook fires — JWT will contain is_platform_admin: true';
  RAISE NOTICE '  3. Call supabase.auth.refreshSession() or sign out/in to activate';
  RAISE NOTICE '  4. Optionally call switch-tenant to enter a specific tenant context';
  RAISE NOTICE '';
  RAISE NOTICE 'To deactivate this admin (rollback):';
  RAISE NOTICE '  UPDATE public.platform_admins SET is_active = false WHERE id = ''%'';', v_pa_id;

END $$;
