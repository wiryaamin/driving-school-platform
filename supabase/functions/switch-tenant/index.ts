import { createSupabaseClient, createServiceClient } from '../_shared/supabase.ts';
import { serveCors } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import type {
  SwitchTenantRequest,
  SwitchTenantResponse,
  EdgeFunctionError,
  CustomClaims,
} from '../_shared/types.ts';

Deno.serve((req: Request) => serveCors(req, async () => {
  const correlationId = crypto.randomUUID();

  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405);
  }

  // ── 1. Authenticate the caller ──────────────────────────────────────────────
  // Uses the caller's JWT (forwarded by createSupabaseClient) — NOT service role.
  // This ensures auth.uid() resolves and the user is genuinely signed in.
  const userClient = createSupabaseClient(req, false);
  const { data: { user }, error: authError } = await userClient.auth.getUser();

  if (authError || !user) {
    return json({ error: 'Unauthenticated' }, 401);
  }

  // ── 2. Parse and validate request body ────────────────────────────────────
  let body: SwitchTenantRequest;
  try {
    body = (await req.json()) as SwitchTenantRequest;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { target_org_id } = body;

  if (!target_org_id || typeof target_org_id !== 'string') {
    return json({ error: 'Missing or invalid target_org_id' }, 400);
  }

  // Basic UUID format guard — prevents trivially malformed inputs reaching the DB
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(target_org_id)) {
    return json({ error: 'Invalid target_org_id format' }, 400);
  }

  try {
    const serviceClient = createServiceClient();

    // ── 3. Validate membership via get_user_jwt_claims ────────────────────────
    // We call the same function the auth hook uses. If the user has no active
    // membership in target_org_id, the function returns null or a claims object
    // with a different organization_id — both indicate access denied.
    const { data: claims, error: claimsError } = await serviceClient
      .rpc('get_user_jwt_claims', {
        p_user_id:       user.id,
        p_target_org_id: target_org_id,
      });

    if (claimsError) {
      logger.error('switch-tenant: claims lookup failed', {
        correlation_id: correlationId,
        user_id:        user.id,
        target_org_id,
        error:          claimsError.message,
      });
      return json({ error: 'Failed to validate organization access' }, 500);
    }

    const custom = claims as CustomClaims | null;

    if (!custom || custom.organization_id !== target_org_id) {
      logger.warn('switch-tenant: access denied', {
        correlation_id:   correlationId,
        user_id:          user.id,
        target_org_id,
        returned_org_id:  custom?.organization_id ?? null,
      });
      return json<EdgeFunctionError>(
        { error: 'No active membership in the requested organization' },
        403,
      );
    }

    // ── 4. Persist preferred_org_id in app_metadata ───────────────────────────
    // The auth hook reads app_metadata.preferred_org_id on each token refresh
    // to determine which org to embed in the JWT.
    // We preserve existing app_metadata keys (provider, providers, etc.).
    const { error: updateError } = await serviceClient.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        preferred_org_id: target_org_id,
      },
    });

    if (updateError) {
      logger.error('switch-tenant: app_metadata update failed', {
        correlation_id: correlationId,
        user_id:        user.id,
        error:          updateError.message,
      });
      return json({ error: 'Failed to initiate tenant switch' }, 500);
    }

    // ── 5. Audit via event outbox ─────────────────────────────────────────────
    // Fire-and-forget — failure here must never block the response.
    // created_by = NULL because service role has no auth.uid() context;
    // user context is captured in the payload instead.
    try {
      await serviceClient.rpc('insert_outbox_event', {
        p_event_type:      'auth.tenant_switched',
        p_channel:         'internal',
        p_organization_id: target_org_id,
        p_payload: {
          user_id:      user.id,
          from_org_id:  (user.app_metadata?.preferred_org_id as string) ?? null,
          to_org_id:    target_org_id,
        },
      });
    } catch (outboxErr) {
      logger.warn('switch-tenant: outbox event failed (non-fatal)', {
        error: outboxErr instanceof Error ? outboxErr.message : String(outboxErr),
      });
    }

    logger.info('switch-tenant: success', {
      correlation_id: correlationId,
      user_id:        user.id,
      target_org_id,
    });

    const response: SwitchTenantResponse = {
      success: true,
      message: 'Tenant switch staged. Call supabase.auth.refreshSession() to apply.',
    };

    return json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('switch-tenant: unexpected error', {
      correlation_id: correlationId,
      user_id:        user.id,
      error:          message,
    });
    return json({ error: 'Internal server error' }, 500);
  }
}));

function json<T>(body: T, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
