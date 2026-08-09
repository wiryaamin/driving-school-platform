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
 * Notification: on successful insert, an `event_outbox` row is still enqueued
 * via `insert_outbox_event()` for future async processing/reporting, but it
 * is never actually claimable as-is — it's written with `p_channel: 'email'`
 * while `event-worker`'s own claim query only picks up `channel = 'internal'`
 * rows (see event-worker's HANDLER_REGISTRY), so no handler could ever have
 * fired for it. Platform Admin notification is therefore sent directly below
 * (same direct-dispatchMessage pattern as the visitor's welcome email, same
 * rationale: no organization_id exists yet at this stage for
 * communication-worker's own /notify endpoint to key off).
 */

import { serveCors }                                        from '../_shared/cors.ts';
import { createServiceClient }                              from '../_shared/supabase.ts';
import { logger }                                           from '../_shared/logger.ts';
import { enforceIpRateLimit, getClientIp }                  from '../_shared/rate-limit.ts';
import { dispatchMessage }                                  from '../_shared/comm-providers.ts';

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

    // ── Welcome email ───────────────────────────────────────────────────────
    // Sent directly via dispatchMessage rather than routed through the
    // event_outbox/event-worker pipeline above: that pipeline only claims
    // 'internal'-channel events today (see event-worker's HANDLER_REGISTRY),
    // and communication-worker's own /notify endpoint requires an
    // organization_id, which doesn't exist yet at this stage (no org has
    // been created for this lead). A single, direct, best-effort send is the
    // smallest correct mechanism for this one transactional email — never
    // fails the visitor's request if sending fails, matching the outbox
    // guard immediately above.
    try {
      const welcomeResult = await dispatchMessage({
        channel:  'email',
        provider: 'resend',
        to:       email,
        from:     'Trafikcloud <info@trafikcloud.se>',
        subject:  'Välkommen till Trafikcloud – vi har tagit emot er registrering',
        body: `
          <div style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
            <p style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">Trafikcloud</p>
            <h2 style="font-size: 18px; margin-top: 24px;">Vi har tagit emot er registrering</h2>
            <p>Hej ${name},</p>
            <p>Tack för att ni registrerat er hos Trafikcloud! Vi har tagit emot er anmälan för <strong>${schoolName}</strong> och förbereder nu er kostnadsfria provperiod.</p>
            <p><strong>Vad händer nu?</strong></p>
            <p>Vårt team går igenom er registrering och sätter upp er organisation i Trafikcloud. Så snart allt är klart skickar vi ett separat e-postmeddelande med en inbjudan där ni kan logga in och komma igång.</p>
            <p>Har ni frågor under tiden är ni varmt välkomna att höra av er till oss på <a href="mailto:support@trafikcloud.se">support@trafikcloud.se</a>.</p>
            <p>Vi ser fram emot att välkomna er till Trafikcloud!</p>
            <p>Vänliga hälsningar,<br>Trafikcloud</p>
          </div>
        `.trim(),
      });
      if (welcomeResult.status !== 'sent') {
        logger.error('demo-requests.welcome_email_failed', {
          request_id: request.id, error: welcomeResult.error, correlation_id: correlationId,
        });
      }
    } catch (e) {
      logger.error('demo-requests.welcome_email_threw', {
        request_id: request.id, error: e instanceof Error ? e.message : String(e), correlation_id: correlationId,
      });
    }

    // ── Platform Administration notification ────────────────────────────────
    // Two-step lookup rather than a PostgREST embedded join: platform_admins
    // has no FK to profiles (only to auth.users, which profiles also
    // references 1:1 but separately), so `profiles!inner(...)` embedding has
    // no relationship to auto-detect. Best-effort, same as the welcome email
    // above: a notification failure must never fail the visitor's
    // already-successful registration.
    try {
      const { data: admins, error: adminsErr } = await db
        .from('platform_admins')
        .select('user_id')
        .eq('is_active', true);

      if (adminsErr) {
        logger.error('demo-requests.platform_admin_lookup_failed', {
          request_id: request.id, error: adminsErr.message, correlation_id: correlationId,
        });
      } else {
        const adminIds = (admins ?? []).map((a) => a.user_id as string);
        const { data: adminProfiles, error: profilesErr } = adminIds.length > 0
          ? await db.from('profiles').select('email').in('id', adminIds)
          : { data: [] as { email: string | null }[], error: null };

        if (profilesErr) {
          logger.error('demo-requests.platform_admin_profiles_failed', {
            request_id: request.id, error: profilesErr.message, correlation_id: correlationId,
          });
        }

        const recipients = (adminProfiles ?? [])
          .map((p) => p.email)
          .filter((e): e is string => typeof e === 'string' && e.length > 0);

        for (const adminEmail of recipients) {
          const result = await dispatchMessage({
            channel:  'email',
            provider: 'resend',
            to:       adminEmail,
            from:     'Trafikcloud <info@trafikcloud.se>',
            subject:  `Ny registrering: ${schoolName}`,
            body: `
              <p>En ny trafikskola har registrerat sig för en provperiod.</p>
              <ul>
                <li><strong>Trafikskola:</strong> ${schoolName}</li>
                <li><strong>Kontaktperson:</strong> ${name}</li>
                <li><strong>E-post:</strong> ${email}</li>
                <li><strong>Telefon:</strong> ${phone}</li>
                <li><strong>Kommun/ort:</strong> ${municipality}</li>
              </ul>
              <p>Granska och godkänn registreringen i Platform Administration.</p>
            `.trim(),
          });
          if (result.status !== 'sent') {
            logger.error('demo-requests.admin_notification_failed', {
              request_id: request.id, admin_email: adminEmail, error: result.error, correlation_id: correlationId,
            });
          }
        }
      }
    } catch (e) {
      logger.error('demo-requests.admin_notification_threw', {
        request_id: request.id, error: e instanceof Error ? e.message : String(e), correlation_id: correlationId,
      });
    }

    return ok({ id: request.id, created_at: request.created_at }, correlationId, 201);
  }),
);
