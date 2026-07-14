/**
 * identity-events — records client-observable identity events that no
 * server-side hook can capture (Identity & Security Event Store, ADR-007,
 * Phase 2 of the Identity & Security Implementation Blueprint).
 *
 * auth-hook only fires on successful JWT issuance — it is never invoked for
 * a failed password check, so login.failed has no server-side capture point
 * without this function. Logout is client-initiated and identity_security_events'
 * RLS denies all client writes by design, so it also needs an explicit,
 * server-validated write path.
 *
 * Routes:
 *   POST /identity-events/login-failed  — unauthenticated (a failed login has
 *                                          no valid session); rate-limited.
 *   POST /identity-events/logout        — authenticated via the caller's own
 *                                          JWT, called before the client clears
 *                                          its local session.
 *
 * verify_jwt is disabled at the gateway for this function (deployed with
 * --no-verify-jwt) so /login-failed is reachable with no Authorization header;
 * /logout independently validates the caller's JWT internally, the same
 * pattern already used by switch-tenant.
 */

import { serveCors } from '../_shared/cors.ts';
import { createSupabaseClient, createServiceClient } from '../_shared/supabase.ts';
import { enforceIpRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';
import { recordIdentityEvent } from '../_shared/identity-events.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve((req: Request) => serveCors(req, async () => {
  const correlationId = crypto.randomUUID();
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const route = segments[segments.findLastIndex((s) => s === 'identity-events') + 1] ?? null;

  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405);
  }

  // ── /identity-events/login-failed — unauthenticated ─────────────────────────
  if (route === 'login-failed') {
    const ipGuard = enforceIpRateLimit(req, 'ip_auth', correlationId);
    if (ipGuard) return ipGuard;

    let body: { email?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : null;
    if (!email) return json({ error: 'email is required' }, 400);

    // Server-side-only enrichment — never reflected in the response, so this
    // lookup cannot become a user-enumeration side channel for the caller.
    // profiles has no organization_id column (superseded by memberships for
    // multi-org support — confirmed against the current generated schema,
    // not the original migration text) — organization is resolved via the
    // user's active membership instead.
    let userId: string | null = null;
    let organizationId: string | null = null;
    try {
      const db = createServiceClient();
      const { data: profile } = await db
        .from('profiles')
        .select('id')
        .ilike('email', email)
        .maybeSingle();

      if (profile) {
        userId = profile.id as string;
        const { data: membership } = await db
          .from('memberships')
          .select('organization_id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        organizationId = (membership?.organization_id as string) ?? null;
      }
    } catch (err) {
      logger.warn('identity-events.login-failed.lookup_failed', {
        correlation_id: correlationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await recordIdentityEvent({
      eventType:      'login.failed',
      provider:       'password',
      severity:       'warning',
      userId,
      organizationId,
      actorEmail:     email,
      correlationId,
      metadata:       {},
    });

    // Always the same response regardless of whether the email resolved to a
    // real account — the point of the enrichment above is internal record
    // quality, not a client-visible signal.
    return json({ success: true });
  }

  // ── /identity-events/logout — authenticated ─────────────────────────────────
  if (route === 'logout') {
    const userClient = createSupabaseClient(req, false, { correlationId, requestId: crypto.randomUUID() });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return json({ error: 'Unauthenticated' }, 401);
    }

    const preferredOrgId = (user.app_metadata?.['preferred_org_id'] as string | undefined) ?? null;

    await recordIdentityEvent({
      eventType:      'session.logout',
      provider:       'password',
      severity:       'info',
      userId:         user.id,
      organizationId: preferredOrgId,
      actorEmail:     user.email ?? null,
      correlationId,
      metadata:       {},
    });

    return json({ success: true });
  }

  return json({ error: 'Not Found' }, 404);
}));
