/**
 * trial-signup — public, pre-account self-service tenant trial creation +
 * guided business interview.
 *
 * Base architecture requested directly by the Product Owner (2026-08-07):
 *
 *   Tenant Trial Created → Generate Secure Onboarding Session → Send Welcome
 *   Email → Customer clicks "Start Your Setup" → Guided Business Interview →
 *   Automatic configuration engine → Create Administrator Account →
 *   Customer creates password → Automatic Login → Dashboard
 *
 * Extended (2026-08-08, "email verification ≠ approval" correction): the
 * organization row is NO LONGER created eagerly at POST / — it, along with
 * every tenant user and externally-provisioned integration, is created only
 * once the session reaches the 'provisioning' stage inside handleComplete.
 * A rejected/cancelled/expired trial never creates any of those. Full
 * lifecycle (see tenant_trial_sessions.status column comment,
 * migration 20260808180915): pending_verification → email_verified →
 * questionnaire_in_progress → questionnaire_completed → approved →
 * provisioning → active, with rejected/cancelled/expired as terminal,
 * admin-controllable states at any point before 'active'. Every transition
 * is logged to tenant_trial_events (_shared/trial-onboarding-lifecycle.ts)
 * — Platform Admin's view/reject/cancel/expire/delete/resend actions live in
 * platform-admin/index.ts's "Trial Requests" routes, not duplicated here.
 *
 * No auth.users row, membership, or role exists until POST /:token/complete
 * has run the configuration engine.
 *
 * Modeled directly on demo-requests/index.ts's public-endpoint shape (own
 * correlationId, own ok/fail helpers, IP + per-email rate limiting,
 * honeypot, service-role client) — this function is public (verify_jwt
 * false), so there is no buildEdgeContext/JWT to lean on.
 *
 * Routes:
 *   POST /                       — one-shot short registration: collects only
 *                                  what identifies the trafikskola (contact,
 *                                  phone, legal name, address) in a single
 *                                  request. Licence categories and lesson
 *                                  price are NOT collected here (2026-08-30,
 *                                  "remove business configuration step") —
 *                                  every canonically-supported category is
 *                                  enabled automatically at the platform's
 *                                  default price, both editable afterward.
 *                                  Saves the full answer set as the
 *                                  session's interview_answers immediately
 *                                  and sends the verification email. No
 *                                  separate "questionnaire" step exists
 *                                  anymore (Starta provperiod — direct
 *                                  registration + email verification +
 *                                  password activation, 2026-08-30).
 *   GET  /:token/verify-email    — confirms the applicant controls this
 *                                  address, then immediately runs the same
 *                                  risk-assessment + provisioning finalize()
 *                                  used to power POST /:token/complete below
 *                                  — there is nothing left to fill in after
 *                                  verification, so approval/provisioning no
 *                                  longer waits on a second visit.
 *   GET  /:token                 — resume: current session status (used as a
 *                                  fallback by the client when it has no
 *                                  fresh verification-redirect result to
 *                                  show, e.g. the applicant reopens an old
 *                                  link later).
 *   PATCH /:token                — legacy autosave endpoint, kept only so an
 *                                  in-flight session from before this
 *                                  redesign can still be resumed/inspected;
 *                                  the current registration form never calls
 *                                  it (everything is submitted in one shot).
 *   POST /:token/complete        — legacy manual-submit endpoint, kept as a
 *                                  fallback finalize path (e.g. retrying a
 *                                  'provisioning_failed' session) — shares
 *                                  finalizeVerifiedSession() with
 *                                  GET /:token/verify-email rather than
 *                                  duplicating the risk+provisioning logic.
 */

import { serveCors }           from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { logger }              from '../_shared/logger.ts';
import { enforceIpRateLimit, getClientIp } from '../_shared/rate-limit.ts';
import { dispatchMessage }     from '../_shared/comm-providers.ts';
import { verifyEmailHtml, logTrialEvent } from '../_shared/trial-onboarding-lifecycle.ts';
import { provisionTrialOrganization, type CompleteAnswers, type ProvisionResult } from '../_shared/trial-provisioning.ts';
// Single source of truth for "every supported licence category" (Starta
// provperiod — remove business configuration step, 2026-08-30) — the same
// list the Configuration Extraction Engine already validates against, not a
// second, independently-maintained copy.
import { VALID_LICENCE_CATEGORIES } from '../_shared/provisioning-extraction.ts';

// deno-lint-ignore no-explicit-any
type DbClient = any;

const JSON_CT = { 'Content-Type': 'application/json' } as const;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_PER_EMAIL_PER_HOUR = 3;
const TOKEN_BYTES = 32;
// Duplicated from apps/web's businessSetupAnswers.ts — Deno can't import
// workspace packages, per the established Edge Function convention (see
// e.g. invite-user/index.ts's INVITABLE_ROLES).
const ORG_NUMBER_RE = /^\d{6}-\d{4}$/;
const POSTAL_RE = /^\d{3}\s?\d{2}$/;
const PHONE_RE = /^\+?[\d\s-]{7,20}$/;
// The tenant no longer sets this at registration (2026-08-30, "remove
// business configuration step") — a platform default, editable afterward
// via Ekonomi → Lektionstyper, same as the field it replaces on the form.
const DEFAULT_LESSON_PRICE_SEK = 595;

function ok<T>(data: T, correlationId: string, status = 200): Response {
  return new Response(JSON.stringify({ data }), { status, headers: { ...JSON_CT, 'X-Correlation-ID': correlationId } });
}
function fail(status: number, code: string, message: string, correlationId: string): Response {
  return new Response(JSON.stringify({ code, message, trace_id: correlationId }), { status, headers: { ...JSON_CT, 'X-Correlation-ID': correlationId } });
}
function str(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === 'string' ? (body[key] as string).trim() : '';
}
function getAppOrigin(): string {
  const configured = Deno.env.get('APP_URL');
  return configured && configured.length > 0 ? configured : 'http://localhost:5173';
}

function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Email templates ──────────────────────────────────────────────────────────
// verifyEmailHtml lives in _shared/trial-onboarding-lifecycle.ts (shared
// with platform-admin's own Resend Verification action; questionnaireEmailHtml
// also still lives there for platform-admin's legacy Resend Questionnaire
// action, just no longer imported here — this function no longer sends a
// separate questionnaire email). passwordCreationEmailHtml/
// buildWelcomeConfigItems/welcomeConfigEmailHtml live in
// _shared/trial-provisioning.ts along with the provisioning logic that
// sends them.

// ─── Handler ────────────────────────────────────────────────────────────────────

Deno.serve((req) => serveCors(req, async () => {
  const correlationId = req.headers.get('X-Correlation-ID') ?? crypto.randomUUID();
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const fnIdx = segments.findLastIndex((s) => s === 'trial-signup');
  const rest = segments.slice(fnIdx + 1);

  const rateLimitGuard = enforceIpRateLimit(req, 'ip_public', correlationId);
  if (rateLimitGuard) {
    logger.warn('trial-signup.rate_limited', { ip: getClientIp(req), correlation_id: correlationId });
    return rateLimitGuard;
  }

  try {
    if (req.method === 'POST' && rest.length === 0) return await handleStart(req, correlationId);
    if (req.method === 'GET'  && rest.length === 2 && rest[1] === 'verify-email') return await handleVerifyEmail(rest[0] as string, correlationId);
    if (req.method === 'GET'  && rest.length === 1) return await handleGetSession(rest[0] as string, correlationId);
    if (req.method === 'PATCH' && rest.length === 1) return await handleSaveAnswers(req, rest[0] as string, correlationId);
    if (req.method === 'POST' && rest.length === 2 && rest[1] === 'complete') return await handleComplete(rest[0] as string, correlationId);
    return fail(404, 'NOT_FOUND', 'Route not found', correlationId);
  } catch (err) {
    logger.error('trial-signup.unhandled_error', { correlation_id: correlationId, error: err instanceof Error ? err.message : String(err) });
    return fail(500, 'INTERNAL_ERROR', 'An unexpected error occurred', correlationId);
  }
}));

// ─── POST / — start a trial ─────────────────────────────────────────────────────

async function handleStart(req: Request, correlationId: string): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; }
  catch { return fail(422, 'VALIDATION_ERROR', 'Request body must be valid JSON', correlationId); }

  // Honeypot — same convention as demo-requests: a hidden field real
  // visitors never fill in. Silently report success without writing anything.
  if (str(body, 'website') !== '') {
    logger.warn('trial-signup.honeypot_triggered', { ip: getClientIp(req), correlation_id: correlationId });
    return ok({ started: true }, correlationId, 201);
  }

  const email          = str(body, 'email').toLowerCase();
  const firstName      = str(body, 'contact_first_name');
  const lastName       = str(body, 'contact_last_name');
  const phone          = str(body, 'phone');
  const legalName      = str(body, 'legal_name');
  const addressLine1   = str(body, 'address_line1');
  const postalCode     = str(body, 'postal_code');
  const city           = str(body, 'city');

  if (!EMAIL_RE.test(email) || email.length > 200) return fail(422, 'VALIDATION_ERROR', 'Ange en giltig e-postadress.', correlationId);
  if (firstName.length < 1 || firstName.length > 100) return fail(422, 'VALIDATION_ERROR', 'Ange ditt förnamn.', correlationId);
  if (lastName.length < 1 || lastName.length > 100) return fail(422, 'VALIDATION_ERROR', 'Ange ditt efternamn.', correlationId);
  if (phone.length > 0 && !PHONE_RE.test(phone)) return fail(422, 'VALIDATION_ERROR', 'Ange ett giltigt telefonnummer.', correlationId);
  if (legalName.length < 2 || legalName.length > 150) return fail(422, 'VALIDATION_ERROR', 'Ange trafikskolans juridiska företagsnamn.', correlationId);
  if (addressLine1.length < 1) return fail(422, 'VALIDATION_ERROR', 'Ange gatuadress.', correlationId);
  if (!POSTAL_RE.test(postalCode)) return fail(422, 'VALIDATION_ERROR', 'Ange postnummer i formatet 111 22.', correlationId);
  if (city.length < 1) return fail(422, 'VALIDATION_ERROR', 'Ange ort.', correlationId);

  const drivingSchoolName = legalName;

  const db = createServiceClient();

  // Per-email abuse guard — same shape as demo-requests.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount, error: countErr } = await db
    .from('tenant_trial_sessions').select('id', { count: 'exact', head: true })
    .eq('email', email).gte('created_at', oneHourAgo);
  if (countErr) {
    logger.error('trial-signup.rate_check_failed', { error: countErr.message, correlation_id: correlationId });
    return fail(500, 'INTERNAL_ERROR', 'Internal error', correlationId);
  }
  if ((recentCount ?? 0) >= MAX_PER_EMAIL_PER_HOUR) {
    logger.warn('trial-signup.email_rate_limited', { email, correlation_id: correlationId });
    return fail(429, 'RATE_LIMIT_EXCEEDED', 'För många förfrågningar från denna e-postadress. Försök igen senare.', correlationId);
  }

  // Duplicate-request guard — a live (non-terminal) session for this email
  // already exists; direct them to resume it instead of spawning a second,
  // confusing parallel request. Terminal statuses (rejected/cancelled/
  // expired) don't block — a genuinely new attempt is allowed through.
  const { data: existingSession } = await db
    .from('tenant_trial_sessions').select('token, status')
    .eq('email', email)
    .not('status', 'in', '(rejected,cancelled,expired)')
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();
  if (existingSession) {
    logger.warn('trial-signup.duplicate_request', { correlation_id: correlationId, email, existing_status: existingSession.status });
    return fail(409, 'DUPLICATE_REQUEST', 'Det finns redan en pågående registrering för denna e-postadress. Kolla er inkorg efter tidigare mail, eller kontakta support@trafikcloud.se.', correlationId);
  }

  // ── Build the full answer set now — everything provisioning needs is
  // already in hand (Starta provperiod — direct registration, 2026-08-30).
  // Licence categories and lesson price are no longer registration
  // questions at all (2026-08-30, "remove business configuration step") —
  // every canonically-supported category is enabled automatically
  // (VALID_LICENCE_CATEGORIES is the single source of truth, shared with
  // the Configuration Extraction Engine's own validation) at the platform's
  // default price. Every other field the short registration form doesn't
  // ask for keeps the exact same defaults documented in the field-inventory
  // audit and already used elsewhere (EMPTY_ANSWERS in apps/web's
  // businessSetupAnswers.ts) — duplicated here per the established
  // Edge-Function convention (Deno can't import workspace packages).
  const answers: CompleteAnswers = {
    contact_first_name: firstName, contact_last_name: lastName,
    legal_name: legalName, org_number: '', vat_number: '', contact_phone: phone,
    country: 'SE', default_language: 'sv', timezone: 'Europe/Stockholm',
    address_line1: addressLine1, postal_code: postalCode, city,
    branches: 1, branch_entries: [],
    licence_categories: [...VALID_LICENCE_CATEGORIES], standard_lesson_duration_minutes: 40,
    lesson_type_durations: {},
    standard_lesson_price_sek: DEFAULT_LESSON_PRICE_SEK,
    teaching_languages: ['sv'],
    vehicle_count: 0, vehicle_transmission: 'manual', vehicles: [],
    administrators: 1, admin_entries: [],
    receptionists: 0, receptionist_entries: [],
    instructors: 0, instructor_entries: [],
    working_hours_start: '08:00', working_hours_end: '17:00', weekend_schedule: 'closed',
    channels: { email: true, sms: false, whatsapp: false, invoice_notifications: true },
    vat_period: 'quarterly', payment_methods: ['invoice'],
  };

  // ── Create the session ONLY — no organization row yet ──────────────────
  // The organization (and every tenant user / externally-provisioned
  // integration) is created only once email verification finalizes the
  // session (see handleVerifyEmail/finalizeVerifiedSession below) — a
  // rejected/cancelled/expired trial never creates any of them. See
  // migration 20260808180915 and the header comment above.
  const token = generateToken();
  const { data: sessionRow, error: sessionErr } = await db.from('tenant_trial_sessions').insert({
    token, email, driving_school_name: drivingSchoolName, organization_id: null, status: 'pending_verification',
    interview_answers: answers,
  }).select('id').single();
  if (sessionErr || !sessionRow) {
    logger.error('trial-signup.session_create_failed', { error: sessionErr?.message, correlation_id: correlationId });
    return fail(500, 'INTERNAL_ERROR', 'Kunde inte skapa installationssession', correlationId);
  }
  await logTrialEvent(db, {
    sessionId: sessionRow.id, email, drivingSchoolName, eventType: 'request_created', actorType: 'applicant',
  });

  // Built from SUPABASE_URL, not the incoming request's own path — the
  // hosted gateway delivers req.url with /functions/v1/<name> already
  // stripped (same root cause as the earlier /health routing bug), so
  // reconstructing from reqUrl.origin + reqUrl.pathname silently produced
  // a broken link (missing /functions/v1/) for every real signup. Matches
  // the already-correct pattern in platform-admin's own Resend
  // Verification handler.
  const functionsUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const verifyUrl = `${functionsUrl}/functions/v1/trial-signup/${token}/verify-email`;

  // The verification email is the applicant's only way to reach activation
  // now — there is no separate questionnaire step to fall back on, so a
  // failed send is surfaced to the caller (email_verification_sent) rather
  // than silently swallowed.
  let emailVerificationSent = false;
  try {
    const verifyResult = await dispatchMessage({
      channel: 'email', provider: 'resend', to: email, from: 'Trafikcloud <info@trafikcloud.se>',
      subject: 'Bekräfta din e-postadress – Trafikcloud',
      body: verifyEmailHtml(drivingSchoolName, verifyUrl),
    });
    emailVerificationSent = verifyResult.status === 'sent';
    if (!emailVerificationSent) {
      logger.warn('trial-signup.verify_email_failed', { correlation_id: correlationId, error: verifyResult.error });
    }
  } catch (err) {
    logger.warn('trial-signup.verify_email_exception', { correlation_id: correlationId, error: err instanceof Error ? err.message : String(err) });
  }

  logger.info('trial-signup.started', { correlation_id: correlationId, session_id: sessionRow.id, email_verification_sent: emailVerificationSent });
  return ok({ token, email_verification_sent: emailVerificationSent }, correlationId, 201);
}

// ─── GET /:token/verify-email — confirms the tenant controls this address ───
//
// Clicked directly from the verification email. This used to render a real
// HTML confirmation page directly from this function, but the hosted
// Supabase gateway forces Content-Type to text/plain (and adds a locked-down
// sandbox CSP) on any hand-rolled text/html response served from the shared
// *.supabase.co functions domain — almost certainly deliberate platform-wide
// XSS hardening, since that domain also carries session cookies for every
// other project. Confirmed live: a JSON route on this same function keeps
// its correct Content-Type, only the HTML route was downgraded. So instead
// of fighting the gateway, this redirects to our own domain's /onboarding/
// :token page, now a lightweight activation-status screen (no interview
// form left to render) — the redirect itself carries the outcome (status,
// and the real action_link when one exists) as query params so that page
// can show it immediately without a second round trip; it strips both from
// the visible URL on load the same way the accept-invite/reset-password
// callbacks already do for their own tokens.
function verifyRedirect(token: string, outcome?: { status: 'active' | 'review'; actionLink?: string | null }): Response {
  const params = new URLSearchParams();
  if (outcome) {
    params.set('status', outcome.status);
    if (outcome.actionLink) params.set('action_link', outcome.actionLink);
  }
  const qs = params.toString();
  const url = `${getAppOrigin()}/onboarding/${token}${qs ? `?${qs}` : ''}`;
  return Response.redirect(url, 302);
}

async function handleVerifyEmail(token: string, correlationId: string): Promise<Response> {
  const db = createServiceClient();
  const session = await loadSession(db, token);

  if (!session) return verifyRedirect(token);
  await expireIfPastDue(db, session, correlationId);
  if (session.status === 'expired') return verifyRedirect(token);
  if (session.status === 'rejected' || session.status === 'cancelled') return verifyRedirect(token);

  // Already verified (a replay click, e.g. an email security scanner or the
  // applicant clicking the link twice) — the session has already been
  // finalized one way or another, so just land on the status page and let
  // it fetch the real current state via GET /:token rather than re-running
  // (and potentially re-provisioning) anything here.
  if (session.email_verified_at) return verifyRedirect(token);

  const { error: verifyErr } = await db.from('tenant_trial_sessions')
    .update({ email_verified_at: new Date().toISOString(), status: 'email_verified' }).eq('id', session.id);
  if (verifyErr) {
    logger.error('trial-signup.verify_update_failed', { correlation_id: correlationId, error: verifyErr.message });
    return verifyRedirect(token);
  }
  await logTrialEvent(db, {
    sessionId: session.id, email: session.email, drivingSchoolName: session.driving_school_name,
    eventType: 'email_verified', actorType: 'applicant',
  });
  logger.info('trial-signup.email_verified', { correlation_id: correlationId, session_id: session.id });

  // Nothing left to fill in after verification — every field provisioning
  // needs was already collected at registration, so approval + provisioning
  // (or the manual-review fallback) runs immediately, in this same request.
  const answers = session.interview_answers as CompleteAnswers;
  if (!Array.isArray(answers.licence_categories) || answers.licence_categories.length === 0) {
    // Defensive only — the current registration form always sends this;
    // this can only happen for a pre-redesign session that somehow never
    // reached the old questionnaire step. Leave it verified and let the
    // legacy POST /:token/complete path (or Platform Admin) handle it.
    logger.error('trial-signup.verify_missing_answers', { correlation_id: correlationId, session_id: session.id });
    return verifyRedirect(token);
  }

  const outcome = await finalizeVerifiedSession(db, session, correlationId);
  if (outcome.kind === 'review') return verifyRedirect(token, { status: 'review' });
  return verifyRedirect(token, { status: 'active', actionLink: outcome.result.actionLink });
}

// ─── Session lookup helper ───────────────────────────────────────────────────

async function loadSession(db: DbClient, token: string) {
  const { data: session } = await db.from('tenant_trial_sessions').select('*').eq('token', token).maybeSingle();
  return session as {
    id: string; token: string; email: string; driving_school_name: string; organization_id: string | null;
    admin_user_id: string | null; status: string; interview_answers: Record<string, unknown>;
    expires_at: string; completed_at: string | null; email_verified_at: string | null;
    rejected_at: string | null; rejection_reason: string | null;
    cancelled_at: string | null; cancellation_reason: string | null;
  } | null;
}

// Lazily flips an abandoned session to 'expired' the next time it's touched
// — no cron/sweep needed (per "do not over-engineer"), the transition just
// happens (and gets logged) the moment anyone next loads a past-expiry
// session, whether that's the applicant or Platform Admin.
async function expireIfPastDue(db: DbClient, session: NonNullable<ReturnType<typeof loadSession> extends Promise<infer T> ? T : never>, correlationId: string): Promise<void> {
  const terminal = ['active', 'rejected', 'cancelled', 'expired'];
  if (terminal.includes(session.status)) return;
  if (new Date(session.expires_at).getTime() >= Date.now()) return;
  await db.from('tenant_trial_sessions').update({ status: 'expired' }).eq('id', session.id);
  await logTrialEvent(db, {
    sessionId: session.id, email: session.email, drivingSchoolName: session.driving_school_name,
    eventType: 'expired', actorType: 'system',
  });
  logger.info('trial-signup.session_expired', { correlation_id: correlationId, session_id: session.id });
  session.status = 'expired';
}

function sessionInvalidReason(session: ReturnType<typeof loadSession> extends Promise<infer T> ? T : never): 'not_found' | 'expired' | 'completed' | 'rejected' | 'cancelled' | null {
  if (!session) return 'not_found';
  // 'active' was the only status treated as "already done," so an applicant
  // who kept the original verification email could still reopen GET/PATCH/
  // complete on a session that had already been submitted, approved, or was
  // mid-provisioning — including resubmitting the questionnaire a second
  // time. 'provisioning_failed' is deliberately excluded: resubmitting from
  // there is the intended recovery path back to a fresh approval.
  if (['questionnaire_completed', 'approved', 'provisioning', 'active'].includes(session.status)) return 'completed';
  if (session.status === 'rejected') return 'rejected';
  if (session.status === 'cancelled') return 'cancelled';
  if (session.status === 'expired' || new Date(session.expires_at).getTime() < Date.now()) return 'expired';
  return null;
}

// Reused by every handler downstream of GET /:token/verify-email — simply
// knowing the session token must never be sufficient to reach the interview
// or complete it, only an actual verification click.
function requireVerifiedEmail(session: ReturnType<typeof loadSession> extends Promise<infer T> ? T : never, correlationId: string): Response | null {
  if (!session!.email_verified_at) {
    return fail(403, 'EMAIL_NOT_VERIFIED', 'Bekräfta er e-postadress via länken vi skickade innan ni fortsätter — kolla er inkorg (och skräppost).', correlationId);
  }
  return null;
}

const INVALID_REASON_MESSAGE: Record<string, string> = {
  not_found: 'Länken kunde inte hittas.',
  expired:   'Länken är inte längre giltig.',
  completed: 'Den här registreringen är redan slutförd.',
  rejected:  'Den här registreringen har avvisats. Kontakta support@trafikcloud.se om ni tror att detta är fel.',
  cancelled: 'Den här registreringen har avbrutits. Kontakta support@trafikcloud.se om ni vill registrera er igen.',
};

// ─── GET /:token — resume ────────────────────────────────────────────────────

const POST_SUBMISSION_STATUSES = ['questionnaire_completed', 'approved', 'provisioning', 'provisioning_failed', 'active'];

async function handleGetSession(token: string, correlationId: string): Promise<Response> {
  const db = createServiceClient();
  const session = await loadSession(db, token);
  if (session) await expireIfPastDue(db, session, correlationId);

  // Reopening the emailed link is the applicant's only way to check on a
  // registration once it's been submitted — a flat 410 "link no longer
  // valid" here was a dead end with no way to see current status (Starta
  // provperiod workflow redesign, 2026-08-30, "post-submission
  // experience"). Every status from here on is a real, current answer, not
  // an error — the interview itself is over regardless of outcome.
  if (session && POST_SUBMISSION_STATUSES.includes(session.status)) {
    return ok({
      status: session.status,
      driving_school_name: session.driving_school_name,
      email: session.email,
      organization_id: session.organization_id,
    }, correlationId);
  }

  const invalid = sessionInvalidReason(session);
  if (invalid) return fail(410, invalid.toUpperCase(), INVALID_REASON_MESSAGE[invalid] ?? 'Länken är inte längre giltig.', correlationId);
  const unverified = requireVerifiedEmail(session, correlationId);
  if (unverified) return unverified;

  return ok({
    driving_school_name: session!.driving_school_name,
    email: session!.email,
    interview_answers: session!.interview_answers,
  }, correlationId);
}

// ─── PATCH /:token — autosave ────────────────────────────────────────────────

async function handleSaveAnswers(req: Request, token: string, correlationId: string): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; }
  catch { return fail(422, 'VALIDATION_ERROR', 'Request body must be valid JSON', correlationId); }

  const db = createServiceClient();
  const session = await loadSession(db, token);
  if (session) await expireIfPastDue(db, session, correlationId);
  const invalid = sessionInvalidReason(session);
  if (invalid) return fail(410, invalid.toUpperCase(), INVALID_REASON_MESSAGE[invalid] ?? 'Länken är inte längre giltig.', correlationId);
  const unverified = requireVerifiedEmail(session, correlationId);
  if (unverified) return unverified;

  const merged = { ...session!.interview_answers, ...body };
  const update: Record<string, unknown> = { interview_answers: merged, updated_at: new Date().toISOString() };
  // First real save after verification — marks that the applicant has
  // actually started the questionnaire, not just clicked the link.
  if (session!.status === 'email_verified') update['status'] = 'questionnaire_in_progress';

  const { error } = await db.from('tenant_trial_sessions').update(update).eq('id', session!.id);
  if (error) {
    logger.error('trial-signup.save_answers_failed', { error: error.message, correlation_id: correlationId });
    return fail(500, 'INTERNAL_ERROR', 'Kunde inte spara svar', correlationId);
  }
  if (update['status'] === 'questionnaire_in_progress') {
    await logTrialEvent(db, {
      sessionId: session!.id, email: session!.email, drivingSchoolName: session!.driving_school_name,
      eventType: 'questionnaire_started', actorType: 'applicant',
    });
  }
  return ok({ saved: true }, correlationId);
}

// ─── Standard auto-approval risk assessment ─────────────────────────────────
//
// Starta provperiod workflow redesign (2026-08-30): the normal, low-risk
// trafikskola registration no longer waits on a human — it's approved and
// provisioned in this same request, using the exact same
// provisionTrialOrganization() Platform Admin's own manual approve action
// calls (not a second provisioning path). Only registrations that trip one
// of these conservative, evidence-based signals still fall back to the
// pre-existing manual-review queue. Deliberately narrow — no scoring model,
// no external fraud service, just structural checks against data already
// collected: malformed/duplicate organization numbers, a pattern of prior
// abandoned/rejected attempts from the same email, and business figures
// clearly outside a normal trafikskola's range. Honeypot and rate-limiting
// are already fully enforced upstream in handleStart — a request that
// reaches this point never triggered either, so there's nothing to re-check
// here.
interface TrialRiskAssessment { needsReview: boolean; reasons: string[] }

async function assessTrialRisk(db: DbClient, email: string, answers: CompleteAnswers): Promise<TrialRiskAssessment> {
  const reasons: string[] = [];

  const orgNumber = (answers.org_number ?? '').trim();
  if (orgNumber) {
    // Defense-in-depth — the wizard already validates this client-side, but
    // a direct API call bypasses that entirely.
    if (!ORG_NUMBER_RE.test(orgNumber)) reasons.push('invalid_org_number_format');
    const { data: existingOrg } = await db.from('organizations').select('id').eq('org_number', orgNumber).maybeSingle();
    if (existingOrg) reasons.push('org_number_already_registered');
  }

  // A pattern of prior rejected/cancelled/failed attempts from this exact
  // email is worth a human look — a single abandoned attempt is normal
  // (someone got busy and re-registered later), a repeated pattern is not.
  const { count: priorAttempts } = await db
    .from('tenant_trial_sessions').select('id', { count: 'exact', head: true })
    .eq('email', email).in('status', ['rejected', 'cancelled', 'provisioning_failed']);
  if ((priorAttempts ?? 0) >= 2) reasons.push('repeated_prior_attempts');

  // Generous sanity bounds on the Swedish driving-lesson market, wide enough
  // to never flag a genuine school's real pricing — only clearly nonsensical
  // values (a placeholder, a typo with an extra digit).
  const price = Number(answers.standard_lesson_price_sek);
  if (!Number.isFinite(price) || price < 50 || price > 5000) reasons.push('lesson_price_out_of_range');

  // A trial declaring an implausibly large operation on day one reads more
  // like test/abuse traffic than a real new customer.
  if ((answers.vehicles?.length ?? 0) > 25) reasons.push('unusually_large_vehicle_count');
  if ((answers.instructor_entries?.length ?? 0) > 25) reasons.push('unusually_large_instructor_count');

  return { needsReview: reasons.length > 0, reasons };
}

// ─── Shared finalize: risk-assess, then approve+provision or flag for review ──
//
// Extracted so GET /:token/verify-email (the current, single-step path — the
// registration form already collected everything, so verification is the
// only remaining gate) and POST /:token/complete (kept as a fallback finalize
// path, e.g. retrying a 'provisioning_failed' session) share one
// implementation instead of two copies of the same risk+provisioning logic.
// Either way, provisioning (when it runs) is the exact same
// _shared/trial-provisioning.ts implementation Platform Admin's own POST
// /platform-admin/trial-requests/:id/approve calls — one provisioning
// system, several ways to reach the same approval step.
type FinalizeOutcome =
  | { kind: 'review'; message: string }
  | { kind: 'active'; result: Extract<ProvisionResult, { ok: true }> };

async function finalizeVerifiedSession(
  db: DbClient,
  session: { id: string; email: string; driving_school_name: string; interview_answers: Record<string, unknown> },
  correlationId: string,
): Promise<FinalizeOutcome> {
  const answers = session.interview_answers as CompleteAnswers;
  const risk = await assessTrialRisk(db, session.email, answers);

  await db.from('tenant_trial_sessions').update({ status: 'questionnaire_completed' }).eq('id', session.id);
  await logTrialEvent(db, {
    sessionId: session.id, email: session.email, drivingSchoolName: session.driving_school_name,
    eventType: 'questionnaire_completed', actorType: 'applicant',
    metadata: risk.needsReview ? { flagged_for_review: true, risk_reasons: risk.reasons } : undefined,
  });

  if (risk.needsReview) {
    logger.info('trial-signup.flagged_for_review', { correlation_id: correlationId, session_id: session.id, reasons: risk.reasons });
    return {
      kind: 'review',
      message: 'Tack! Er registrering granskas manuellt av Trafikcloud — det gäller ett litet antal registreringar. Ni får ett mail så snart er trafikskola är redo att användas. Ni kan öppna den här länken igen för att se aktuell status.',
    };
  }

  // ── Standard case: approve and provision immediately, no human in the loop ──
  await logTrialEvent(db, {
    sessionId: session.id, email: session.email, drivingSchoolName: session.driving_school_name,
    eventType: 'approved', actorType: 'system',
  });
  await db.from('tenant_trial_sessions').update({ status: 'approved' }).eq('id', session.id);

  const result = await provisionTrialOrganization(
    db,
    { id: session.id, email: session.email, driving_school_name: session.driving_school_name, interview_answers: answers as unknown as Record<string, unknown> },
    correlationId,
  );

  if (!result.ok) {
    // provisionTrialOrganization already rolled back everything it created
    // and left the session in provisioning_failed — Platform Admin can
    // retry via the existing approve action (TRIAL_APPROVABLE_STATUSES
    // already includes provisioning_failed), so this degrades to exactly
    // the pre-existing manual-review path rather than a dead end.
    logger.error('trial-signup.auto_provisioning_failed', {
      correlation_id: correlationId, session_id: session.id, code: result.code, error: result.message,
    });
    return {
      kind: 'review',
      message: 'Tack! Vi kunde inte slutföra konfigurationen automatiskt just nu — Trafikcloud tittar på det manuellt. Ni får ett mail så snart er trafikskola är redo att användas.',
    };
  }

  logger.info('trial-signup.auto_provisioned', { correlation_id: correlationId, session_id: session.id, organization_id: result.organizationId });
  return { kind: 'active', result };
}

// ─── POST /:token/complete — legacy manual-submit finalize path ─────────────
//
// The current registration form never calls this — GET /:token/verify-email
// already finalizes the session the moment the applicant verifies their
// email, since there is no later questionnaire step left to submit from.
// Kept as a fallback (e.g. retrying a 'provisioning_failed' session, or
// finishing a session created before this redesign) — shares
// finalizeVerifiedSession() with verify-email rather than a second copy.

async function handleComplete(token: string, correlationId: string): Promise<Response> {
  const db = createServiceClient();
  const session = await loadSession(db, token);
  if (session) await expireIfPastDue(db, session, correlationId);
  const invalid = sessionInvalidReason(session);
  if (invalid) return fail(410, invalid.toUpperCase(), INVALID_REASON_MESSAGE[invalid] ?? 'Länken är inte längre giltig.', correlationId);
  const unverified = requireVerifiedEmail(session, correlationId);
  if (unverified) return unverified;

  const answers = session!.interview_answers as CompleteAnswers;
  if (!Array.isArray(answers.licence_categories) || answers.licence_categories.length === 0) {
    return fail(422, 'VALIDATION_ERROR', 'Välj minst en behörighet ni utbildar för.', correlationId);
  }

  const outcome = await finalizeVerifiedSession(db, session!, correlationId);
  if (outcome.kind === 'review') {
    return ok({ status: 'questionnaire_completed', message: outcome.message } satisfies CompleteTrialReviewResult, correlationId, 200);
  }

  const result = outcome.result;
  return ok({
    status: 'active',
    organization_id: result.organizationId,
    action_link: result.actionLink,
    lesson_types_created: result.lessonTypesCreated,
    package_templates_created: result.packageTemplatesCreated,
    branch_created: result.branchCreated,
    priced_lesson_types: result.pricedLessonTypes,
    vehicles_created: result.vehiclesCreated,
    instructors_created: result.instructorsCreated,
    staff_invited: result.staffInvited,
    additional_branches_created: result.additionalBranchesCreated,
    slots_generated: result.slotsGenerated,
    provisioning_warnings: result.provisioningWarnings,
  } satisfies CompleteTrialActiveResult, correlationId, 200);
}

interface CompleteTrialReviewResult { status: 'questionnaire_completed'; message: string }
interface CompleteTrialActiveResult {
  status: 'active'; organization_id: string; action_link: string | null;
  lesson_types_created: number; package_templates_created: number; branch_created: number; priced_lesson_types: number;
  vehicles_created: number; instructors_created: number; staff_invited: number;
  additional_branches_created: number; slots_generated: number; provisioning_warnings: string[];
}

