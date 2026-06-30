/**
 * stripe-webhook — Stripe Checkout webhook handler
 *
 * Called by Stripe when a payment event fires. Verifies the request
 * signature, then on checkout.session.completed:
 *   1. Looks up the corresponding payment_request row
 *   2. Calls record_payment() RPC to settle the invoice
 *   3. Updates payment_request.status = 'completed'
 *
 * Env vars:
 *   STRIPE_WEBHOOK_SECRET   — signing secret from Stripe Dashboard → Webhooks
 *   SUPABASE_URL            — automatically set by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — automatically set by Supabase
 *
 * Setup:
 *   Register this URL in Stripe Dashboard → Developers → Webhooks:
 *   https://<project-ref>.supabase.co/functions/v1/stripe-webhook
 *   Events to listen for: checkout.session.completed, checkout.session.expired
 */

import { createServiceClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';

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

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    logger.error('stripe-webhook: STRIPE_WEBHOOK_SECRET not set');
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

    // Call record_payment() RPC to post payment and settle invoice
    const { data: paymentId, error: rpcErr } = await supabase.rpc('record_payment', {
      p_invoice_id: invoiceId,
      p_amount:     (pr as { amount_sek: number }).amount_sek,
      p_method:     'stripe',
      p_actor_id:   (pr as { student_id: string | null }).student_id ?? orgId,
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
