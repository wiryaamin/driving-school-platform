/**
 * demo-requests — Unauthenticated public lead-capture endpoint.
 *
 * Route:
 *   POST /demo-requests   → submit a "Boka en personlig visning" request
 *
 * Auth: none — service role is used internally to bypass RLS, matching
 * public-booking and public-enrollment's own pattern for this codebase.
 * Rate limiting: IP-based (_shared/rate-limit.ts) plus a per-email
 * application-level limit, mirroring public-enrollment's own approach.
 *
 * Validation is hand-rolled (trim + explicit checks), not Zod, deliberately
 * matching public-booking/public-enrollment's existing convention for this
 * layer rather than introducing a new dependency pattern into public
 * endpoints. The rules below mirror
 * apps/web/src/modules/demo-page/lib/demoRequestSchema.ts's Zod schema
 * field-for-field — true cross-boundary schema sharing isn't possible here
 * (Deno Edge Functions cannot import workspace TypeScript packages; see
 * CLAUDE.md), so this is a deliberate, minimal, documented mirror, not an
 * accidental parallel implementation.
 *
 * Notification: on successful insert, an `event_outbox` row is enqueued via
 * the existing `insert_outbox_event()` SECURITY DEFINER function — the same
 * reliable-async-processing mechanism already used platform-wide, not a new
 * one invented for this endpoint. No `event-worker` handler is registered
 * for `demo_request.created` yet, and no email provider is called — this is
 * the "clean extension point" the epic asked for: the event exists and is
 * queryable/processable the moment a handler is written, but nothing
 * external is invoked today.
 */

import { serveCors }                                        from '../_shared/cors.ts';
import { createServiceClient }                              from '../_shared/supabase.ts';
import { logger }                                           from '../_shared/logger.ts';
import { enforceIpRateLimit, getClientIp }                  from '../_shared/rate-limit.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const INT_RE   = /^\d+$/;

const CURRENT_SYSTEM_VALUES = ['spreadsheets', 'other_software', 'manual', 'other'] as const;

/** Max demo requests accepted from the same email within one hour — mirrors public-enrollment's own per-email abuse guard. */
const MAX_PER_EMAIL_PER_HOUR = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JSON_CT = { 'Content-Type': 'application/json' } as const;

function ok<T>(data: T, correlationId: string, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { ...JSON_CT, 'X-Correlation-ID': correlationId },
  });
}

function fail(status: number, code: string, message: string, correlationId: string): Response {
  return new Response(JSON.stringify({ code, message, trace_id: correlationId }), {
    status,
    headers: { ...JSON_CT, 'X-Correlation-ID': correlationId },
  });
}

function str(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === 'string' ? (body[key] as string).trim() : '';
}

/**
 * The client (toDemoRequestPayload, demo-page/lib/submitDemoRequest.ts)
 * sends locationCount/studentCount as real JSON numbers, not numeric
 * strings — matching its DemoRequestPayload type. Accepts either shape
 * defensively (a number, or a numeric string) rather than assuming one,
 * since this boundary has no shared type to enforce the contract at
 * compile time (Deno Edge Functions can't import the frontend's TS types).
 */
function num(body: Record<string, unknown>, key: string): number | null {
  const v = body[key];
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && INT_RE.test(v.trim())) return Number(v.trim());
  return null;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) =>
  serveCors(req, async () => {
    const correlationId = req.headers.get('X-Correlation-ID') ?? crypto.randomUUID();

    if (req.method !== 'POST') {
      return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed', correlationId);
    }

    // IP-based rate limiting for public endpoint
    const rateLimitGuard = enforceIpRateLimit(req, 'ip_public', correlationId);
    if (rateLimitGuard) {
      logger.warn('demo-requests.rate_limited', { ip: getClientIp(req), correlation_id: correlationId });
      return rateLimitGuard;
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return fail(422, 'VALIDATION_ERROR', 'Request body must be valid JSON', correlationId);
    }

    // ── Honeypot ────────────────────────────────────────────────────────────
    // A hidden field (`website`) real visitors never see or fill in — see
    // DemoPage.tsx. Bots that auto-fill every field trip it. Silently
    // report success without writing anything, so the bot learns nothing.
    if (str(body, 'website') !== '') {
      logger.warn('demo-requests.honeypot_triggered', { ip: getClientIp(req), correlation_id: correlationId });
      return ok({ accepted: true }, correlationId, 201);
    }

    // ── Field extraction + validation (mirrors demoRequestSchema.ts) ────────
    const name          = str(body, 'name');
    const schoolName    = str(body, 'schoolName');
    const email         = str(body, 'email').toLowerCase();
    const phone         = str(body, 'phone');
    const municipality  = str(body, 'municipality');
    const locationCount = num(body, 'locationCount');
    const studentCount  = num(body, 'studentCount');
    const currentSystem = str(body, 'currentSystem');
    const message       = str(body, 'message');

    if (name.length < 2 || name.length > 100)                 return fail(422, 'VALIDATION_ERROR', 'Ange ditt namn.', correlationId);
    if (schoolName.length < 2 || schoolName.length > 150)      return fail(422, 'VALIDATION_ERROR', 'Ange trafikskolans namn.', correlationId);
    if (!EMAIL_RE.test(email) || email.length > 200)           return fail(422, 'VALIDATION_ERROR', 'Ange en giltig e-postadress.', correlationId);
    if (phone.length < 6 || phone.length > 30)                 return fail(422, 'VALIDATION_ERROR', 'Ange ett telefonnummer.', correlationId);
    if (municipality.length < 2 || municipality.length > 100)  return fail(422, 'VALIDATION_ERROR', 'Ange kommun eller ort.', correlationId);
    if (locationCount === null || locationCount < 1)           return fail(422, 'VALIDATION_ERROR', 'Ange antal orter.', correlationId);
    if (studentCount === null || studentCount < 0)             return fail(422, 'VALIDATION_ERROR', 'Ange ett ungefärligt antal elever.', correlationId);
    if (!CURRENT_SYSTEM_VALUES.includes(currentSystem as typeof CURRENT_SYSTEM_VALUES[number])) {
      return fail(422, 'VALIDATION_ERROR', 'Välj ett alternativ.', correlationId);
    }
    if (message.length > 1000) return fail(422, 'VALIDATION_ERROR', 'Meddelandet är för långt.', correlationId);

    const db = createServiceClient();

    // ── Per-email abuse guard ────────────────────────────────────────────────
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount, error: countErr } = await db
      .from('demo_requests')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', oneHourAgo);

    if (countErr) {
      logger.error('demo-requests.rate_check_failed', { error: countErr.message, correlation_id: correlationId });
      return fail(500, 'INTERNAL_ERROR', 'Internal error', correlationId);
    }
    if ((recentCount ?? 0) >= MAX_PER_EMAIL_PER_HOUR) {
      logger.warn('demo-requests.email_rate_limited', { email, correlation_id: correlationId });
      return fail(429, 'RATE_LIMIT_EXCEEDED', 'För många förfrågningar från denna e-postadress. Försök igen senare.', correlationId);
    }

    // ── Insert ────────────────────────────────────────────────────────────────
    const { data: request, error: insertErr } = await db
      .from('demo_requests')
      .insert({
        name,
        school_name:     schoolName,
        email,
        phone,
        municipality,
        location_count:  locationCount,
        student_count:   studentCount,
        current_system:  currentSystem,
        message,
        source:          'public_demo_form',
        status:          'new',
        ip_address:      getClientIp(req),
        user_agent:      req.headers.get('User-Agent') ?? null,
      })
      .select('id, created_at')
      .single();

    if (insertErr) {
      logger.error('demo-requests.insert_failed', { error: insertErr.message, correlation_id: correlationId });
      return fail(500, 'INTERNAL_ERROR', 'Kunde inte spara förfrågan', correlationId);
    }

    logger.info('demo-requests.created', { request_id: request.id, correlation_id: correlationId });

    // ── Notification extension point ────────────────────────────────────────
    // Enqueue via the existing event_outbox mechanism rather than calling an
    // email provider directly (none is implemented — see file header). A
    // future event-worker handler for 'demo_request.created' is what would
    // actually send the visitor confirmation + internal notification emails
    // named in the epic's Email Architecture requirement.
    // p_correlation_id is deliberately omitted: correlationId here may come
    // directly from a client-supplied header (not always a well-formed
    // UUID), and insert_outbox_event's p_correlation_id column is typed
    // uuid — passing an arbitrary string would throw. correlationId is
    // still returned to the caller via the X-Correlation-ID response
    // header regardless, so no traceability is lost.
    const { error: outboxErr } = await db.rpc('insert_outbox_event', {
      p_event_type: 'demo_request.created',
      p_channel:    'email',
      p_payload: {
        demo_request_id: request.id,
        name,
        school_name:     schoolName,
        email,
        municipality,
      },
      p_organization_id: null,
      p_metadata: { source: 'demo-requests-edge-function', correlation_id: correlationId },
    });

    // Never fail the visitor's request over a notification-plumbing problem —
    // the lead is already safely stored. Log loudly so it's not silently lost.
    if (outboxErr) {
      logger.error('demo-requests.outbox_enqueue_failed', {
        request_id: request.id, error: outboxErr.message, correlation_id: correlationId,
      });
    }

    return ok({ id: request.id, created_at: request.created_at }, correlationId, 201);
  }),
);
