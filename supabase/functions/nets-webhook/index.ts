/**
 * nets-webhook — Nets Easy payment webhook handler
 *
 * Nets' webhook model is deliberately not the same as Stripe's: there is no
 * dashboard-configured signing secret and no HMAC signature. Each payment
 * registers its own webhook URL + a shared "authorization" string at
 * creation time (see student-portal's /payments/nets/checkout), and Nets
 * echoes that string back verbatim in every callback's Authorization header
 * — verified here as a direct comparison against the org's stored secret,
 * not a signature computation.
 *
 * Settlement waits specifically for payment.charge.created.v2, not
 * payment.checkout.completed: with checkout.charge=true, "checkout
 * completed" only means the customer finished the payment form — the
 * actual charge can still fail after that point. Only charge.created.v2
 * confirms money was actually captured.
 *
 * Routes:
 *   POST /nets-webhook/<org_id>   — verifies against that organization's
 *                                    own nets_webhook_secret
 *
 * Events handled: payment.charge.created.v2 (settles), payment.checkout.completed (ack only)
 */

import { createServiceClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';
import { decryptCredential } from '../_shared/credential-crypto.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractOrgId(req: Request): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'nets-webhook');
  const after    = segments.slice(fnIdx + 1);
  const first    = after[0] ?? '';
  return UUID_RE.test(first) ? first : null;
}

const JSON_CT = { 'Content-Type': 'application/json' } as const;

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_CT });
}

interface NetsWebhookEnvelope {
  id:        string;
  merchantId: number;
  timestamp: string;
  event:     string;
  data: {
    paymentId: string;
    chargeId?: string;
    order?: { amount: { amount: number; currency: string }; reference: string };
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return err('Method not allowed', 405);

  const orgId = extractOrgId(req);
  if (!orgId) return err('Organization id required in path', 400);

  const supabase = createServiceClient();

  const { data: orgRow } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .maybeSingle();
  const settings = ((orgRow as { settings?: Record<string, unknown> } | null)?.settings) ?? {};
  const storedSecret = settings['nets_webhook_secret'] as string | undefined;

  if (!storedSecret) {
    logger.error('nets-webhook: no webhook secret configured', { org_id: orgId });
    return err('Webhook not configured', 503);
  }

  const expectedSecret = await decryptCredential(storedSecret);
  const providedSecret = req.headers.get('Authorization') ?? '';

  if (providedSecret !== expectedSecret) {
    logger.warn('nets-webhook: authorization mismatch', { org_id: orgId });
    return err('Invalid authorization', 401);
  }

  let event: NetsWebhookEnvelope;
  try {
    event = await req.json() as NetsWebhookEnvelope;
  } catch {
    return err('Invalid JSON body', 400);
  }

  logger.info('nets-webhook: received event', { type: event.event, id: event.id, org_id: orgId });

  // ── payment.checkout.completed — acknowledge only, no settlement ──────────
  if (event.event === 'payment.checkout.completed') {
    return ok({ received: true });
  }

  // ── payment.charge.created.v2 — the actual captured-money confirmation ───
  if (event.event === 'payment.charge.created.v2') {
    const paymentId = event.data.paymentId;
    const prReference = event.data.order?.reference;

    if (!paymentId) {
      logger.warn('nets-webhook: missing paymentId', { org_id: orgId });
      return ok({ received: true, warning: 'missing paymentId — skipped' });
    }

    // payment_requests.id was sent as order.reference at creation time;
    // provider_session_id (paymentId) is the fallback lookup key.
    let prQuery = supabase
      .from('payment_requests')
      .select('id, invoice_id, amount_sek, status')
      .eq('organization_id', orgId)
      .eq('provider', 'nets');

    prQuery = prReference && UUID_RE.test(prReference)
      ? prQuery.eq('id', prReference)
      : prQuery.eq('provider_session_id', paymentId);

    const { data: pr, error: prErr } = await prQuery.maybeSingle();

    if (prErr || !pr) {
      logger.error('nets-webhook: payment_request not found', { paymentId, orgId });
      return ok({ received: true, warning: 'payment_request not found' });
    }

    const prRow = pr as { id: string; invoice_id: string; amount_sek: number; status: string };

    if (prRow.status === 'completed') {
      logger.info('nets-webhook: already completed, skipping', { pr_id: prRow.id });
      return ok({ received: true, skipped: true });
    }

    const { data: paymentRowId, error: rpcErr } = await supabase.rpc('record_payment', {
      p_invoice_id: prRow.invoice_id,
      p_amount:     prRow.amount_sek,
      p_method:     'nets',
      p_reference:  paymentId,
    });

    if (rpcErr) {
      logger.error('nets-webhook: record_payment failed', { error: rpcErr.message, pr_id: prRow.id });
    }

    const { error: updateErr } = await supabase
      .from('payment_requests')
      .update({
        status:       'completed',
        completed_at: new Date().toISOString(),
        provider_ref: paymentId,
        payment_id:   typeof paymentRowId === 'string' ? paymentRowId : null,
      })
      .eq('id', prRow.id);

    if (updateErr) {
      logger.error('nets-webhook: failed to update payment_request', { error: updateErr.message, pr_id: prRow.id });
    }

    logger.info('nets-webhook: payment settled', { pr_id: prRow.id, org_id: orgId, amount_sek: prRow.amount_sek });

    return ok({ received: true, settled: true });
  }

  return ok({ received: true, unhandled: event.event });
});
