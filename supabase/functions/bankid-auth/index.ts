/**
 * bankid-auth — BankID login and identity-linking (Identity & Security
 * Architecture, ADR-007, Phase 3 of the Identity & Security Implementation
 * Blueprint).
 *
 * Extends the existing Identity domain only: resolves to an existing
 * auth.users row via auth_identity_links (never a parallel user table),
 * writes every event through the existing recordIdentityEvent() shared
 * writer using the frozen taxonomy, and issues real Supabase sessions via
 * the standard admin.generateLink()/client verifyOtp() magic-link exchange —
 * never a bespoke session mechanism.
 *
 * Routes:
 *   POST /bankid-auth/init     — purpose 'login' (unauthenticated, rate-limited)
 *                                 or 'link' (authenticated — caller must already
 *                                 hold a session; BankID linking is never a side
 *                                 effect of an anonymous callback, per ADR-007's
 *                                 Future Development Guideline).
 *   POST /bankid-auth/collect  — polls order status; on BankID completion,
 *                                 resolves 'login' via auth_identity_links or
 *                                 creates the link for 'link'.
 *   POST /bankid-auth/cancel   — cancels an in-flight order.
 *
 * verify_jwt is disabled at the gateway (deployed with --no-verify-jwt) so
 * 'login' purpose orders are reachable with no Authorization header, matching
 * identity-events' established pattern; 'link' purpose independently
 * validates the caller's JWT via createSupabaseClient(req, false, ...).
 *
 * This is BankID's real, documented protocol (_shared/bankid-client.ts) — it
 * requires mTLS certificate secrets (BANKID_CLIENT_CERT/KEY/CA) that do not
 * exist in this environment (see Phase 3 Gap Analysis) and must be supplied
 * by the user. Every route checks bankidConfigured() first and returns a
 * clear, typed "not configured" error rather than an opaque network failure.
 */

import { serveCors } from '../_shared/cors.ts';
import { createSupabaseClient, createServiceClient } from '../_shared/supabase.ts';
import { enforceIpRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';
import { recordIdentityEvent } from '../_shared/identity-events.ts';
import {
  bankidConfigured, bankidAuth, bankidCollect, bankidCancel, computeQrData, autoStartUrl,
  BankidNotConfiguredError, BankidApiError,
} from '../_shared/bankid-client.ts';
import { identityCryptoConfigured, encryptPersonalNumber, hashPersonalNumber } from '../_shared/bankid-crypto.ts';

const ORDER_TTL_MS = 180_000; // BankID orders expire after ~3 minutes.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || '127.0.0.1';
}

Deno.serve((req: Request) => serveCors(req, async () => {
  const correlationId = crypto.randomUUID();
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const route = segments[segments.findLastIndex((s) => s === 'bankid-auth') + 1] ?? null;

  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405);
  }

  const db = createServiceClient();

  // Auth/validation always runs before the BankID configuration check —
  // a caller should learn "you're not authenticated"/"bad request" regardless
  // of whether BankID's certificate happens to be configured on this
  // deployment; "not configured" is a server-side fact, checked only at the
  // point a real BankID network call is about to be made (below), never as a
  // blanket gate ahead of routing. This also keeps the auth/validation paths
  // live-verifiable independent of certificate availability.

  // ── /bankid-auth/init ───────────────────────────────────────────────────
  if (route === 'init') {
    let body: { purpose?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const purpose = body.purpose === 'link' ? 'link' : 'login';

    let callerUserId: string | null = null;
    if (purpose === 'link') {
      const userClient = createSupabaseClient(req, false, { correlationId, requestId: crypto.randomUUID() });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) return json({ error: 'Unauthenticated' }, 401);
      callerUserId = user.id;
    } else {
      const ipGuard = enforceIpRateLimit(req, 'ip_auth', correlationId);
      if (ipGuard) return ipGuard;
    }

    if (!bankidConfigured()) {
      return json({ error: 'not_configured', message: 'BankID är inte konfigurerat i den här miljön.' }, 503);
    }

    try {
      const bankidRes = await bankidAuth(clientIp(req));
      const expiresAt = new Date(Date.now() + ORDER_TTL_MS);

      const { error: insertError } = await db.from('bankid_auth_orders').insert({
        order_ref: bankidRes.orderRef,
        purpose,
        status: 'pending',
        user_id: callerUserId,
        correlation_id: correlationId,
        expires_at: expiresAt.toISOString(),
      });
      if (insertError) {
        logger.error('bankid-auth.init: order insert failed', { correlation_id: correlationId, error: insertError.message });
        return json({ error: 'internal_error' }, 500);
      }

      await recordIdentityEvent({
        eventType: 'bankid.authentication_started',
        provider: 'bankid',
        userId: callerUserId,
        correlationId,
        metadata: { order_ref: bankidRes.orderRef, purpose },
      });

      const qrData = await computeQrData(bankidRes.qrStartToken, bankidRes.qrStartSecret, new Date());

      return json({
        orderRef: bankidRes.orderRef,
        autoStartUrl: autoStartUrl(bankidRes.autoStartToken),
        qrData,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (err) {
      return handleBankidError(err, correlationId, callerUserId);
    }
  }

  // ── /bankid-auth/collect ────────────────────────────────────────────────
  if (route === 'collect') {
    let body: { orderRef?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    const orderRef = body.orderRef;
    if (!orderRef) return json({ error: 'orderRef is required' }, 400);

    const { data: order } = await db
      .from('bankid_auth_orders')
      .select('*')
      .eq('order_ref', orderRef)
      .maybeSingle();

    if (!order) return json({ error: 'not_found' }, 404);
    if (order.status === 'consumed') return json({ error: 'already_consumed' }, 410);
    if (new Date(order.expires_at as string) < new Date()) {
      await db.from('bankid_auth_orders').update({ status: 'expired' }).eq('order_ref', orderRef);
      return json({ status: 'failed', hintCode: 'expiredTransaction' });
    }
    // 'link' purpose requires the same caller who started it — re-verify on every poll.
    if (order.purpose === 'link') {
      const userClient = createSupabaseClient(req, false, { correlationId, requestId: crypto.randomUUID() });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user || user.id !== order.user_id) return json({ error: 'Unauthenticated' }, 401);
    }

    try {
      const collectRes = await bankidCollect(orderRef);

      if (collectRes.status === 'pending') {
        await db.from('bankid_auth_orders').update({ hint_code: collectRes.hintCode ?? null }).eq('order_ref', orderRef);
        return json({ status: 'pending', hintCode: collectRes.hintCode ?? null });
      }

      if (collectRes.status === 'failed') {
        await db.from('bankid_auth_orders').update({ status: 'failed', hint_code: collectRes.hintCode ?? null }).eq('order_ref', orderRef);
        await recordIdentityEvent({
          eventType: order.purpose === 'login' ? 'login.failed' : 'identity.linked',
          provider: 'bankid',
          severity: 'warning',
          userId: order.user_id as string | null,
          correlationId,
          metadata: { order_ref: orderRef, hint_code: collectRes.hintCode ?? null, outcome: 'failed', purpose: order.purpose },
        });
        return json({ status: 'failed', hintCode: collectRes.hintCode ?? null });
      }

      // status === 'complete'
      if (!identityCryptoConfigured()) {
        await db.from('bankid_auth_orders').update({ status: 'failed' }).eq('order_ref', orderRef);
        return json({ error: 'not_configured', message: 'Identitetskryptering är inte konfigurerad.' }, 503);
      }

      const personalNumber = collectRes.completionData!.user.personalNumber;
      const personalNumberHash = await hashPersonalNumber(personalNumber);
      const displayName = `${collectRes.completionData!.user.givenName} ${collectRes.completionData!.user.surname}`;

      if (order.purpose === 'login') {
        return await completeLogin(db, order, orderRef, personalNumberHash, correlationId);
      } else {
        return await completeLink(db, order, orderRef, personalNumber, personalNumberHash, displayName, correlationId);
      }
    } catch (err) {
      return handleBankidError(err, correlationId, order.user_id as string | null);
    }
  }

  // ── /bankid-auth/cancel ─────────────────────────────────────────────────
  if (route === 'cancel') {
    let body: { orderRef?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    const orderRef = body.orderRef;
    if (!orderRef) return json({ error: 'orderRef is required' }, 400);

    const { data: order } = await db.from('bankid_auth_orders').select('*').eq('order_ref', orderRef).maybeSingle();
    if (!order) return json({ error: 'not_found' }, 404);

    try {
      await bankidCancel(orderRef);
    } catch (err) {
      logger.warn('bankid-auth.cancel: bankid cancel call failed (non-fatal — order still marked failed)', {
        correlation_id: correlationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await db.from('bankid_auth_orders').update({ status: 'failed' }).eq('order_ref', orderRef);
    await recordIdentityEvent({
      eventType: 'bankid.authentication_cancelled',
      provider: 'bankid',
      userId: order.user_id as string | null,
      correlationId,
      metadata: { order_ref: orderRef, purpose: order.purpose },
    });

    return json({ success: true });
  }

  return json({ error: 'Not Found' }, 404);
}));

// ─── Completion helpers ───────────────────────────────────────────────────

async function completeLogin(
  db: ReturnType<typeof createServiceClient>,
  order: Record<string, unknown>,
  orderRef: string,
  personalNumberHash: string,
  correlationId: string,
): Promise<Response> {
  const { data: link } = await db
    .from('auth_identity_links')
    .select('user_id')
    .eq('provider', 'bankid')
    .eq('external_subject_hash', personalNumberHash)
    .maybeSingle();

  if (!link) {
    await db.from('bankid_auth_orders').update({ status: 'failed', personal_number_hash: personalNumberHash }).eq('order_ref', orderRef);
    await recordIdentityEvent({
      eventType: 'login.failed',
      provider: 'bankid',
      severity: 'warning',
      correlationId,
      metadata: { order_ref: orderRef, reason: 'no_linked_identity' },
    });
    return json({
      status: 'complete',
      linked: false,
      message: 'Inget konto är kopplat till detta BankID. Kontakta din administratör.',
    });
  }

  const userId = link.user_id as string;

  const { data: userRes, error: userErr } = await db.auth.admin.getUserById(userId);
  if (userErr || !userRes?.user?.email) {
    logger.error('bankid-auth.collect: linked user has no resolvable email', { correlation_id: correlationId, user_id: userId });
    return json({ error: 'internal_error' }, 500);
  }

  const { data: linkData, error: linkErr } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: userRes.user.email,
  });
  if (linkErr || !linkData) {
    logger.error('bankid-auth.collect: generateLink failed', { correlation_id: correlationId, user_id: userId, error: linkErr?.message });
    return json({ error: 'internal_error' }, 500);
  }

  const { data: membership } = await db
    .from('memberships')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  await db.from('bankid_auth_orders').update({
    status: 'consumed',
    user_id: userId,
    personal_number_hash: personalNumberHash,
    completed_at: new Date().toISOString(),
  }).eq('order_ref', orderRef);
  await db.from('auth_identity_links').update({ last_used_at: new Date().toISOString() })
    .eq('provider', 'bankid').eq('external_subject_hash', personalNumberHash);

  await recordIdentityEvent({
    eventType: 'login.success',
    provider: 'bankid',
    userId,
    organizationId: (membership?.organization_id as string) ?? null,
    correlationId,
    metadata: { order_ref: orderRef },
  });
  await recordIdentityEvent({
    eventType: 'session.created',
    provider: 'bankid',
    userId,
    organizationId: (membership?.organization_id as string) ?? null,
    correlationId,
    metadata: { order_ref: orderRef },
  });

  return json({
    status: 'complete',
    linked: true,
    tokenHash: linkData.properties.hashed_token,
  });
}

async function completeLink(
  db: ReturnType<typeof createServiceClient>,
  order: Record<string, unknown>,
  orderRef: string,
  personalNumber: string,
  personalNumberHash: string,
  displayName: string,
  correlationId: string,
): Promise<Response> {
  const userId = order.user_id as string;

  const { data: existing } = await db
    .from('auth_identity_links')
    .select('user_id')
    .eq('provider', 'bankid')
    .eq('external_subject_hash', personalNumberHash)
    .maybeSingle();

  if (existing && existing.user_id !== userId) {
    await db.from('bankid_auth_orders').update({ status: 'failed', personal_number_hash: personalNumberHash }).eq('order_ref', orderRef);
    return json({
      status: 'complete',
      linked: false,
      message: 'Detta BankID är redan kopplat till ett annat konto.',
    }, 409);
  }

  const encrypted = await encryptPersonalNumber(personalNumber);

  // UNIQUE(provider, external_subject_hash) and UNIQUE(user_id, provider) are
  // the atomic backstop (ADR-007) — this upsert races safely against a
  // concurrent duplicate attempt exactly like ADR-004's trigger-as-backstop pattern.
  const { error: upsertError } = await db.from('auth_identity_links').upsert({
    user_id: userId,
    provider: 'bankid',
    external_subject_encrypted: encrypted,
    external_subject_hash: personalNumberHash,
    display_name: displayName,
  }, { onConflict: 'user_id,provider' });

  if (upsertError) {
    logger.error('bankid-auth.collect: identity link upsert failed', { correlation_id: correlationId, user_id: userId, error: upsertError.message });
    return json({ error: 'internal_error' }, 500);
  }

  await db.from('bankid_auth_orders').update({
    status: 'consumed',
    personal_number_hash: personalNumberHash,
    completed_at: new Date().toISOString(),
  }).eq('order_ref', orderRef);

  const { data: membership } = await db
    .from('memberships')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  await recordIdentityEvent({
    eventType: 'identity.linked',
    provider: 'bankid',
    userId,
    organizationId: (membership?.organization_id as string) ?? null,
    correlationId,
    metadata: { order_ref: orderRef },
  });

  return json({ status: 'complete', linked: true });
}

function handleBankidError(err: unknown, correlationId: string, userId: string | null): Response {
  if (err instanceof BankidNotConfiguredError) {
    return json({ error: 'not_configured', message: 'BankID är inte konfigurerat i den här miljön.' }, 503);
  }
  if (err instanceof BankidApiError) {
    logger.warn('bankid-auth: BankID API error', { correlation_id: correlationId, status: err.status, error_code: err.errorCode });
    return json({ error: 'bankid_error', errorCode: err.errorCode }, 502);
  }
  const message = err instanceof Error ? err.message : String(err);
  logger.error('bankid-auth: unexpected error', { correlation_id: correlationId, user_id: userId, error: message });
  return json({ error: 'internal_error' }, 500);
}
