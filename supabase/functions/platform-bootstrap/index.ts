/**
 * platform-bootstrap — One-time Platform Admin bootstrap.
 *
 * Creates the first platform_superadmin in a governed, auditable way.
 * Protected by PLATFORM_BOOTSTRAP_SECRET (bearer token, fail-closed).
 * One-time use: returns 409 if any platform_admins row already exists.
 *
 * Invocation (Claude-managed only):
 *   POST /functions/v1/platform-bootstrap
 *   Authorization: Bearer <PLATFORM_BOOTSTRAP_SECRET>
 *   Content-Type: application/json
 *   { "email": "...", "password": "...", "first_name": "...", "last_name": "..." }
 *
 * After bootstrap:
 *   1. Unset PLATFORM_BOOTSTRAP_SECRET immediately
 *   2. User signs in — auth hook fires, JWT receives is_platform_admin: true
 *   3. Call supabase.auth.refreshSession() or sign out/in to activate
 *   4. Optionally call switch-tenant to enter a specific tenant context
 *
 * Security lifecycle:
 *   supabase secrets set   PLATFORM_BOOTSTRAP_SECRET=<random>  → before use
 *   (invoke this function once)
 *   supabase secrets unset PLATFORM_BOOTSTRAP_SECRET            → immediately after
 *
 * After unset: Deno.env.get('PLATFORM_BOOTSTRAP_SECRET') returns undefined.
 * The function then returns 503 on all subsequent requests — permanently locked.
 * The one-time guard (409 on count > 0) provides a second independent lock.
 */

import { createServiceClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';

// ─── Config ───────────────────────────────────────────────────────────────────

const BOOTSTRAP_SECRET = Deno.env.get('PLATFORM_BOOTSTRAP_SECRET');

const VALID_ROLES = ['platform_superadmin', 'platform_support', 'platform_billing'] as const;
type PlatformRole = (typeof VALID_ROLES)[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // Fail-closed: refuse all requests if PLATFORM_BOOTSTRAP_SECRET is not configured.
  // An absent secret means no valid token can exist. After bootstrap the secret is
  // unset, which permanently locks this function (503 on every subsequent request).
  if (!BOOTSTRAP_SECRET) {
    return jsonResponse(
      { error: 'Bootstrap not configured — PLATFORM_BOOTSTRAP_SECRET missing or already unset' },
      503,
    );
  }

  // Validate bearer token — same pattern as event-worker / WORKER_SECRET
  const authHeader = req.headers.get('Authorization') ?? '';
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (token !== BOOTSTRAP_SECRET) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return jsonResponse({ error: 'Request body must be a JSON object' }, 400);
  }

  const {
    email,
    password,
    first_name,
    last_name,
    role = 'platform_superadmin',
  } = body as Record<string, unknown>;

  if (typeof email !== 'string' || !email.trim()) {
    return jsonResponse({ error: 'email is required' }, 400);
  }
  if (typeof password !== 'string' || password.length < 8) {
    return jsonResponse({ error: 'password is required (minimum 8 characters)' }, 400);
  }
  if (typeof first_name !== 'string' || !first_name.trim()) {
    return jsonResponse({ error: 'first_name is required' }, 400);
  }
  if (typeof last_name !== 'string' || !last_name.trim()) {
    return jsonResponse({ error: 'last_name is required' }, 400);
  }
  if (!(VALID_ROLES as ReadonlyArray<unknown>).includes(role)) {
    return jsonResponse(
      { error: `role must be one of: ${VALID_ROLES.join(', ')}` },
      400,
    );
  }

  const trimmedEmail     = email.trim().toLowerCase();
  const trimmedFirstName = first_name.trim();
  const trimmedLastName  = last_name.trim();
  const validatedRole    = role as PlatformRole;

  const serviceClient = createServiceClient();

  // ── One-time guard: refuse if any active platform admin already exists ────────
  // This is the primary idempotency lock. Even if PLATFORM_BOOTSTRAP_SECRET were
  // somehow still configured after bootstrap, this guard prevents a second PA row.
  const { count, error: countError } = await serviceClient
    .from('platform_admins')
    .select('id', { count: 'exact', head: true });

  if (countError !== null) {
    logger.error('bootstrap.guard_check_failed', { error: countError.message });
    return jsonResponse({ error: 'Bootstrap guard check failed', details: countError.message }, 500);
  }

  if ((count ?? 0) > 0) {
    logger.warn('bootstrap.already_bootstrapped', { platform_admin_count: count });
    return jsonResponse(
      {
        error: 'Platform already bootstrapped — a platform admin already exists.',
        code:  'ALREADY_BOOTSTRAPPED',
      },
      409,
    );
  }

  const bootstrapId = crypto.randomUUID();
  logger.info('bootstrap.started', { bootstrap_id: bootstrapId, email: trimmedEmail, role: validatedRole });

  // ── Step 1: Create auth user via Supabase Admin API ──────────────────────────
  // email_confirm: true → user is immediately active; no verification email sent.
  // This is the only path that can create auth.users without Dashboard access.
  const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
    email:         trimmedEmail,
    password,
    email_confirm: true,
  });

  if (authError !== null || authData.user === null) {
    logger.error('bootstrap.create_auth_user_failed', {
      bootstrap_id: bootstrapId,
      error:        authError?.message ?? 'No user returned from admin API',
    });
    return jsonResponse(
      { error: 'Failed to create auth user', details: authError?.message ?? 'Unknown error' },
      400,
    );
  }

  const userId    = authData.user.id;
  const createdAt = new Date().toISOString();

  logger.info('bootstrap.auth_user_created', { bootstrap_id: bootstrapId, user_id: userId });

  // ── Step 2: Upsert global profile ────────────────────────────────────────────
  // profiles is tenant-global (no organization_id). ON CONFLICT(id) is safe here
  // because the auth user was just created — a conflicting profile would mean a
  // pre-existing profile for this UUID, which the upsert updates to match.
  const { error: profileError } = await serviceClient
    .from('profiles')
    .upsert(
      {
        id:           userId,
        first_name:   trimmedFirstName,
        last_name:    trimmedLastName,
        email:        trimmedEmail,
        is_active:    true,
        onboarded_at: createdAt,
      },
      { onConflict: 'id' },
    );

  if (profileError !== null) {
    logger.error('bootstrap.profile_upsert_failed', {
      bootstrap_id: bootstrapId,
      user_id:      userId,
      error:        profileError.message,
    });
    // Rollback: delete the auth user we just created so no orphan exists
    await serviceClient.auth.admin.deleteUser(userId);
    logger.info('bootstrap.rollback_auth_user_deleted', { bootstrap_id: bootstrapId, user_id: userId });
    return jsonResponse(
      { error: 'Failed to create profile', details: profileError.message },
      500,
    );
  }

  logger.info('bootstrap.profile_ready', { bootstrap_id: bootstrapId, user_id: userId });

  // ── Step 3: Insert platform_admins row ───────────────────────────────────────
  // granted_by = NULL is correct and expected for the first bootstrap:
  // no granting authority pre-exists. The FK is nullable with ON DELETE SET NULL.
  const { data: paData, error: paError } = await serviceClient
    .from('platform_admins')
    .insert({
      user_id:    userId,
      role:       validatedRole,
      is_active:  true,
      granted_by: null,
      granted_at: createdAt,
      notes:      `Bootstrap via platform-bootstrap Edge Function — ${createdAt}`,
    })
    .select('id')
    .single();

  if (paError !== null || paData === null) {
    logger.error('bootstrap.platform_admin_insert_failed', {
      bootstrap_id: bootstrapId,
      user_id:      userId,
      error:        paError?.message ?? 'No row returned',
    });
    // Rollback: delete auth user (profile soft-fk safe; no cascade needed here)
    await serviceClient.auth.admin.deleteUser(userId);
    logger.info('bootstrap.rollback_auth_user_deleted', { bootstrap_id: bootstrapId, user_id: userId });
    return jsonResponse(
      { error: 'Failed to create platform admin', details: paError?.message ?? 'Unknown error' },
      500,
    );
  }

  const platformAdminId = paData.id as string;

  logger.info('bootstrap.platform_admin_created', {
    bootstrap_id:      bootstrapId,
    user_id:           userId,
    platform_admin_id: platformAdminId,
    role:              validatedRole,
  });

  // ── Step 4: Audit event ───────────────────────────────────────────────────────
  // organization_id = NULL: this event is platform-scoped, not tenant-scoped.
  // Non-fatal: bootstrap is complete even if outbox INSERT fails. The platform_admins
  // row and auth user are the authoritative records.
  const { error: outboxError } = await serviceClient.rpc('insert_outbox_event', {
    p_event_type:      'auth.platform_admin_granted',
    p_channel:         'internal',
    p_organization_id: null,
    p_payload: {
      platform_admin_id: platformAdminId,
      user_id:           userId,
      role:              validatedRole,
      granted_by:        null,
      method:            'bootstrap_edge_function',
      bootstrap_id:      bootstrapId,
    },
    p_metadata: {
      source: 'platform-bootstrap/index.ts',
    },
  });

  if (outboxError !== null) {
    logger.warn('bootstrap.audit_event_failed', {
      bootstrap_id:      bootstrapId,
      platform_admin_id: platformAdminId,
      error:             outboxError.message,
    });
  } else {
    logger.info('bootstrap.audit_event_queued', {
      bootstrap_id:      bootstrapId,
      platform_admin_id: platformAdminId,
    });
  }

  logger.info('bootstrap.complete', {
    bootstrap_id:      bootstrapId,
    user_id:           userId,
    platform_admin_id: platformAdminId,
    role:              validatedRole,
  });

  return jsonResponse(
    {
      user_id:           userId,
      platform_admin_id: platformAdminId,
      role:              validatedRole,
      email:             trimmedEmail,
      bootstrap_id:      bootstrapId,
    },
    201,
  );
});
