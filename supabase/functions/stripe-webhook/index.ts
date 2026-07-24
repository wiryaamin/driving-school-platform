/**
 * stripe-webhook — Stripe Checkout webhook handler
 *
 * Called by Stripe when a payment event fires. Verifies the request
 * signature, then on checkout.session.completed:
 *   1. Looks up the corresponding payment_request row
 *   2. Calls record_payment() RPC to settle the invoice
 *   3. Updates payment_request.status = 'completed'
 *
 * Multi-tenant signing secret resolution:
 *   Checkout session *creation* (student-portal) already supports each
 *   organization bringing its own Stripe account (organizations.settings
 *   .stripe_secret_key, falling back to the platform-wide STRIPE_SECRET_KEY).
 *   This endpoint mirrors that: an org-scoped path selects that org's own
 *   webhook signing secret, so more than one tenant's Stripe account can be
 *   verified correctly — a single global secret cannot distinguish which
 *   tenant's Stripe account actually sent a given event.
 *
 * Routes:
 *   POST /stripe-webhook             — verifies against the platform-wide
 *                                       STRIPE_WEBHOOK_SECRET (unchanged
 *                                       behaviour, for orgs using the
 *                                       platform fallback Stripe key)
 *   POST /stripe-webhook/<org_id>    — verifies against that organization's
 *                                       own settings.stripe_webhook_secret,
 *                                       falling back to the platform-wide
 *                                       secret if the org hasn't set one
 *
 * Env vars:
 *   STRIPE_WEBHOOK_SECRET   — platform-wide fallback signing secret
 *   SUPABASE_URL            — automatically set by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — automatically set by Supabase
 *
 * Setup:
 *   Register the appropriate URL above in Stripe Dashboard → Developers →
 *   Webhooks, in whichever Stripe account is being confirmed — the platform
 *   account for the bare path, or each organization's own account for the
 *   org-scoped path.
 *   Events to listen for: checkout.session.completed, checkout.session.expired
 */

import { createServiceClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';
import { decryptCredential } from '../_shared/credential-crypto.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractOrgId(req: Request): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'stripe-webhook');
  const after    = segments.slice(fnIdx + 1);
  if (after.length === 0) return null;
  const first = after[0] ?? '';
  return UUID_RE.test(first) ? first : null;
}

const JSON_CT = { 'Content-Type': 'application/json' } as const;

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}

function err(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_CT });
}

// ─── Stripe signature verification ───────────────────────────────────────────
// https://docs.stripe.com/webhooks/signature

async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  try {
    const parts = Object.fromEntries(
      sigHeader.split(',').map(p => {
        const eqIdx = p.indexOf('=');
        return [p.slice(0, eqIdx), p.slice(eqIdx + 1)];
      }),
    );

    const timestamp = parts['t'];
    const v1sig     = parts['v1'];
    if (!timestamp || !v1sig) return false;

    // Reject events older than 5 minutes
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

    const payload  = `${timestamp}.${rawBody}`;
    const keyData  = new TextEncoder().encode(secret);
    const msgData  = new TextEncoder().encode(payload);

    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sigBytes  = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    const computed  = Array.from(new Uint8Array(sigBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return computed === v1sig;
  } catch {
    return false;
  }
}

// ─── Operational alerting ─────────────────────────────────────────────────────
//
// Reuses the existing notifications table directly (the same canonical
// record every business event on this platform writes to, per the Unified
// Notification Center) rather than introducing a second alerting
// mechanism. Does not go through the outbox/communication-worker pipeline:
// that pipeline's recipient resolution currently only handles
// student/instructor recipients, and extending it is outside this
// function's own domain. Writing the canonical "internal" record directly
// is the smallest change that reuses real, existing infrastructure without
// touching a shared module used by every other domain on the platform.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function alertSettlementFailure(
  client: any,
  orgId: string,
  paymentRequestId: string,
  invoiceId: string,
  reason: string,
): Promise<void> {
  // Scope to this organization's own memberships first, then find the one
  // with the org_owner role — never the reverse order, to avoid any risk
  // of resolving a different organization's owner.
  const { data: orgMemberships } = await client
    .from('memberships')
    .select('id, user_id')
    .eq('organization_id', orgId)
    .eq('status', 'active');

  const membershipIds: string[] = ((orgMemberships ?? []) as Array<{ id: string; user_id: string }>).map((m) => m.id);
  if (membershipIds.length === 0) return;

  const { data: ownerRole } = await client
    .from('roles')
    .select('id')
    .eq('name', 'org_owner')
    .maybeSingle();
  const ownerRoleId = (ownerRole as { id?: string } | null)?.id;
  if (!ownerRoleId) return;

  const { data: assignment } = await client
    .from('membership_roles')
    .select('membership_id')
    .eq('role_id', ownerRoleId)
    .in('membership_id', membershipIds)
    .limit(1)
    .maybeSingle();
  const membershipId = (assignment as { membership_id?: string } | null)?.membership_id;
  if (!membershipId) return;

  const recipientId = ((orgMemberships ?? []) as Array<{ id: string; user_id: string }>)
    .find((m) => m.id === membershipId)?.user_id;
  if (!recipientId) return; // no resolvable admin — logger.error above already recorded this

  await client.from('notifications').insert({
    organization_id:      orgId,
    recipient_id:          recipientId,
    recipient_type:        'admin',
    channel:                'internal',
    template_key:          'stripe_settlement_failed',
    subject:                'Stripe-betalning kunde inte matchas mot faktura',
    body:                   `Stripe bekräftade en betalning men den kunde inte automatiskt matchas mot fakturan. Kontrollera manuellt. (Orsak: ${reason})`,
    priority:                'urgent',
    category:                'payment',
    reference_type:          'payment_request',
    reference_id:            paymentRequestId,
    metadata:                { invoice_id: invoiceId, source: 'stripe-webhook' },
    status:                  'sent',
  });
}

// ─── Stripe event types (minimal) ────────────────────────────────────────────

interface StripeCheckoutSession {
  id:             string;
  payment_status: string;
  payment_intent: string | null;
  amount_total:   number | null;
  metadata: {
    invoice_id?:          string;
    payment_request_id?:  string;
    organization_id?:     string;
    student_id?:          string;
  };
}

interface StripeEvent {
  id:   string;
  type: string;
  data: { object: StripeCheckoutSession };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Stripe only sends POST; reject everything else
  if (req.method !== 'POST') {
    return err('Method not allowed', 405);
  }

  const pathOrgId = extractOrgId(req);
  let webhookSecret: string | undefined;

  if (pathOrgId) {
    const supabase = createServiceClient();
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', pathOrgId)
      .maybeSingle();
    const settings = ((orgRow as { settings?: Record<string, unknown> } | null)?.settings) ?? {};
    const storedSecret = settings['stripe_webhook_secret'] as string | undefined;
    // decryptCredential() transparently handles both newly-encrypted values
    // and any pre-existing plaintext value stored before ADR-022 was applied
    // to this field — see _shared/credential-crypto.ts.
    webhookSecret = storedSecret !== undefined
      ? await decryptCredential(storedSecret)
      : Deno.env.get('STRIPE_WEBHOOK_SECRET');
  } else {
    webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  }

  if (!webhookSecret) {
    logger.error('stripe-webhook: no webhook secret configured', { org_id: pathOrgId });
    return err('Webhook not configured', 503);
  }

  // Read raw body (needed for signature verification before parsing JSON)
  const rawBody = await req.text();
  const sigHeader = req.headers.get('Stripe-Signature') ?? '';

  const valid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);
  if (!valid) {
    logger.warn('stripe-webhook: signature verification failed');
    return err('Invalid signature', 401);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return err('Invalid JSON body', 400);
  }

  logger.info('stripe-webhook: received event', { type: event.type, id: event.id });

  // ── Handle checkout.session.completed ──────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session  = event.data.object;
    const prId     = session.metadata.payment_request_id;
    const orgId    = session.metadata.organization_id;
    const invoiceId = session.metadata.invoice_id;

    if (!prId || !orgId || !invoiceId) {
      logger.warn('stripe-webhook: missing metadata', { prId, orgId, invoiceId });
      return ok({ received: true, warning: 'missing metadata — skipped' });
    }

    const supabase = createServiceClient();

    // Look up payment_request to get amount and validate
    const { data: pr, error: prErr } = await supabase
      .from('payment_requests')
      .select('id, amount_sek, status, student_id')
      .eq('id', prId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (prErr || !pr) {
      logger.error('stripe-webhook: payment_request not found', { prId, orgId });
      return ok({ received: true, warning: 'payment_request not found' });
    }

    // Idempotency: skip if already completed
    if ((pr as { status: string }).status === 'completed') {
      logger.info('stripe-webhook: already completed, skipping', { prId });
      return ok({ received: true, skipped: true });
    }

    // Call record_payment() RPC to post payment and settle invoice.
    // p_actor_id is intentionally omitted (defaults to NULL): this is a
    // provider-confirmed, automated settlement with no staff confirmer —
    // neither a student ID nor an organization ID is ever a valid
    // payments_confirmed_by_fkey target (auth.users), and record_payment()
    // already supports NULL for exactly this case. The Stripe payment_intent
    // is preserved as the audit trail via p_reference.
    const { data: paymentId, error: rpcErr } = await supabase.rpc('record_payment', {
      p_invoice_id: invoiceId,
      p_amount:     (pr as { amount_sek: number }).amount_sek,
      p_method:     'stripe',
      p_reference:  session.payment_intent ?? session.id,
    });

    if (rpcErr) {
      logger.error('stripe-webhook: record_payment failed', {
        error: rpcErr.message, prId, invoiceId,
      });
      // Still mark payment_request as completed since Stripe confirmed payment.
      // Finance team will reconcile manually.
    }

    // Update payment_request → completed
    const { error: updateErr } = await supabase
      .from('payment_requests')
      .update({
        status:       'completed',
        completed_at: new Date().toISOString(),
        provider_ref: session.payment_intent ?? session.id,
        payment_id:   typeof paymentId === 'string' ? paymentId : null,
      })
      .eq('id', prId);

    if (updateErr) {
      logger.error('stripe-webhook: failed to update payment_request', { error: updateErr.message, prId });
    }

    // Stripe confirmed the payment but settlement didn't fully complete on
    // our side — alert an admin so this isn't only discoverable via logs.
    // Non-fatal by construction: never allowed to affect the response
    // returned to Stripe or interrupt the flow above.
    if (rpcErr || updateErr) {
      await alertSettlementFailure(supabase, orgId, prId, invoiceId, (rpcErr ?? updateErr)!.message)
        .catch((alertErr: unknown) => {
          logger.warn('stripe-webhook: settlement failure alert could not be sent', {
            prId, error: String(alertErr),
          });
        });
    }

    logger.info('stripe-webhook: payment settled', {
      pr_id:      prId,
      invoice_id: invoiceId,
      org_id:     orgId,
      amount_sek: (pr as { amount_sek: number }).amount_sek,
    });

    return ok({ received: true, settled: true });
  }

  // ── Handle checkout.session.expired ────────────────────────────────────────
  if (event.type === 'checkout.session.expired') {
    const session = event.data.object;
    const prId    = session.metadata.payment_request_id;
    const orgId   = session.metadata.organization_id;

    if (prId && orgId) {
      const supabase = createServiceClient();
      await supabase
        .from('payment_requests')
        .update({ status: 'expired' })
        .eq('id', prId)
        .eq('organization_id', orgId)
        .eq('status', 'pending');

      logger.info('stripe-webhook: session expired', { prId });
    }

    return ok({ received: true });
  }

  // All other event types — acknowledge without action
  return ok({ received: true, unhandled: event.type });
});
