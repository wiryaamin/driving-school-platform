/**
 * public-booking — Unauthenticated public lead capture endpoint.
 *
 * Routes:
 *   GET  /public-booking?slug=<org-slug>   → org name + form config + available license categories
 *   POST /public-booking                   → submit a lead (qualification form)
 *
 * Auth: none — service role is used internally to bypass RLS.
 * Rate limiting: IP-based limiting via _shared/rate-limit.ts.
 * Spam: honeypot field ("website") on POST — a populated value is treated
 *   as a bot; nothing is persisted, and the same error already used for a
 *   genuine insert failure is returned (indistinguishable from a real
 *   transient error, and visible to a false-positive-caught real visitor
 *   rather than a fabricated success).
 *
 * Workflow on submission (Public Registration Form upgrade, 2026-08-04):
 *   1. Insert into student_leads (CRM activity + tenant notification are
 *      handled automatically by DB triggers — trg_student_leads_log_created
 *      and trg_student_leads_emit_created — not duplicated here).
 *   2. Send the visitor a welcome/confirmation email (direct dispatchMessage,
 *      same pattern as demo-requests — this endpoint has no organization
 *      session to route through communication-worker's notification_rules
 *      pipeline for a *visitor*-facing email, only for the tenant-facing one).
 *   3. Notify Platform Administration (same two-step platform_admins→profiles
 *      lookup + dispatchMessage pattern as demo-requests).
 */

import { serveCors }                                          from '../_shared/cors.ts';
import { createServiceClient }                                from '../_shared/supabase.ts';
import { logger }                                             from '../_shared/logger.ts';
import { enforceIpRateLimit, getClientIp }                   from '../_shared/rate-limit.ts';
import { buildPublicBranding }                                from '../_shared/public-branding.ts';
import { dispatchMessage }                                    from '../_shared/comm-providers.ts';
import {
  LICENSE_CATEGORIES,
  VALID_PREFERRED_LANGUAGES,
  resolvePublicBookingFormConfig,
} from '../_shared/public-booking-form-config.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DRIVING_EXPERIENCE_VALUES    = ['none', 'some_experience', 'held_license_before'];
const LEARNER_PERMIT_VALUES        = ['none', 'applied', 'has_permit'];
const TRANSMISSION_VALUES          = ['manual', 'automatic', 'no_preference'];
const LESSON_TIME_VALUES           = ['morning', 'afternoon', 'evening', 'weekend'];

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

function strArray(body: Record<string, unknown>, key: string): string[] {
  const v = body[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) =>
  serveCors(req, async () => {
    const correlationId = req.headers.get('X-Correlation-ID') ?? crypto.randomUUID();

    // IP-based rate limiting for public endpoint
    const rateLimitGuard = enforceIpRateLimit(req, 'ip_public', correlationId);
    if (rateLimitGuard) {
      logger.warn('public-booking.rate_limited', { ip: getClientIp(req), correlation_id: correlationId });
      return rateLimitGuard;
    }

    const url = new URL(req.url);
    const db  = createServiceClient();

    // ── GET: return org public info + form configuration ─────────────────────
    if (req.method === 'GET') {
      const slug = url.searchParams.get('slug')?.trim().toLowerCase();
      if (!slug || !SLUG_RE.test(slug)) {
        return fail(400, 'VALIDATION_ERROR', 'Invalid or missing slug', correlationId);
      }

      const { data: org, error } = await db
        .from('organizations')
        .select('id, name, settings')
        .eq('slug', slug)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle();

      if (error) {
        logger.error('public-booking.org_lookup_failed', { slug, error: error.message, correlation_id: correlationId });
        return fail(500, 'INTERNAL_ERROR', 'Internal error', correlationId);
      }
      if (!org) return fail(404, 'NOT_FOUND', 'Trafikskola not found', correlationId);

      const settings   = (org.settings ?? {}) as Record<string, unknown>;
      const enabled    = settings['public_booking_enabled'] !== false;
      const formConfig = resolvePublicBookingFormConfig(settings);

      return ok({
        org_id:                 org.id,
        org_name:               org.name,
        public_booking_enabled: enabled,
        license_categories:     LICENSE_CATEGORIES.filter((c) => formConfig.license_categories.includes(c.value)),
        preferred_languages:    VALID_PREFERRED_LANGUAGES,
        form_config:            formConfig,
        branding:               buildPublicBranding(settings),
      }, correlationId);
    }

    // ── POST: submit a lead ──────────────────────────────────────────────────
    if (req.method === 'POST') {
      let body: Record<string, unknown>;
      try {
        body = await req.json() as Record<string, unknown>;
      } catch {
        return fail(422, 'VALIDATION_ERROR', 'Request body must be valid JSON', correlationId);
      }

      // Honeypot: "website" is never shown to a real visitor; a bot filling
      // every field on the form will typically populate it. Responds with
      // the exact same error already used below for a genuine insert
      // failure — indistinguishable from an ordinary transient error to a
      // bot, while a real visitor caught by a false positive (e.g.
      // aggressive browser autofill on a hidden field) sees a real, visible
      // error and can retry, rather than a fabricated success.
      const honeypot = (body['website'] as string | undefined)?.trim();
      if (honeypot) {
        return fail(500, 'INTERNAL_ERROR', 'Kunde inte spara anmälan', correlationId);
      }

      const orgId     = (body['org_id']     as string | undefined)?.trim();
      const firstName = str(body, 'first_name');
      const lastName  = str(body, 'last_name');
      const email     = str(body, 'email') || null;
      const phone     = str(body, 'phone') || null;
      const notes     = str(body, 'notes') || null;

      if (!orgId || !UUID_RE.test(orgId)) return fail(422, 'VALIDATION_ERROR', 'org_id krävs och måste vara ett UUID', correlationId);
      if (!firstName) return fail(422, 'VALIDATION_ERROR', 'Förnamn krävs', correlationId);
      if (!lastName)  return fail(422, 'VALIDATION_ERROR', 'Efternamn krävs', correlationId);
      if (!email && !phone) return fail(422, 'VALIDATION_ERROR', 'Ange minst e-post eller telefonnummer', correlationId);

      const { data: org, error: orgErr } = await db
        .from('organizations')
        .select('id, name, settings')
        .eq('id', orgId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle();

      if (orgErr) {
        logger.error('public-booking.org_check_failed', { org_id: orgId, error: orgErr.message, correlation_id: correlationId });
        return fail(500, 'INTERNAL_ERROR', 'Internal error', correlationId);
      }
      if (!org) return fail(404, 'NOT_FOUND', 'Trafikskola not found', correlationId);

      const settings = (org.settings ?? {}) as Record<string, unknown>;
      if (settings['public_booking_enabled'] === false) {
        return fail(403, 'FORBIDDEN', 'Online-anmälan är inte aktiverad', correlationId);
      }

      const formConfig = resolvePublicBookingFormConfig(settings);

      // ── License category (restricted to the org's configured offering) ────
      const rawCategory = str(body, 'license_category');
      const allowedCategories = formConfig.license_categories;
      const category = rawCategory && allowedCategories.includes(rawCategory)
        ? rawCategory
        : (allowedCategories[0] ?? 'B');

      // ── Qualification fields ────────────────────────────────────────────────
      const preferredStartDate = str(body, 'preferred_start_date');
      const drivingExperience  = str(body, 'driving_experience');
      const learnerPermit      = str(body, 'learner_permit_status');
      const transmission       = str(body, 'preferred_transmission');
      const lessonTimes        = strArray(body, 'preferred_lesson_times').filter((t) => LESSON_TIME_VALUES.includes(t));
      const preferredLanguage  = str(body, 'preferred_language');
      const existingCategory   = str(body, 'existing_license_category') || null;
      const needsTheory        = body['needs_theory'] === true;
      const needsRisk1         = body['needs_risk1']  === true;
      const needsRisk2         = body['needs_risk2']  === true;

      // ── Server-side enforcement of tenant-configured required fields ───────
      // Client-side already enforces this (better UX), but a tenant's
      // required-field policy must hold even against a direct API call.
      const fieldPresence: Record<string, boolean> = {
        preferred_start_date:      preferredStartDate.length > 0,
        driving_experience:        drivingExperience.length > 0,
        learner_permit_status:     learnerPermit.length > 0,
        preferred_transmission:    transmission.length > 0,
        preferred_lesson_times:    lessonTimes.length > 0,
        preferred_language:        preferredLanguage.length > 0,
        existing_license_category: (existingCategory ?? '').length > 0,
        notes:                     (notes ?? '').length > 0,
        // training_needs is a checkbox group of independently-optional
        // booleans — "required" has no meaningful enforcement here (see
        // _shared/public-booking-form-config.ts).
      };
      for (const [field, present] of Object.entries(fieldPresence)) {
        const cfg = formConfig.fields[field];
        if (cfg?.required && !present) {
          return fail(422, 'VALIDATION_ERROR', 'Vänligen fyll i alla obligatoriska fält.', correlationId);
        }
      }

      if (preferredStartDate && !DATE_RE.test(preferredStartDate)) {
        return fail(422, 'VALIDATION_ERROR', 'Ogiltigt datumformat för önskat startdatum.', correlationId);
      }
      if (drivingExperience && !DRIVING_EXPERIENCE_VALUES.includes(drivingExperience)) {
        return fail(422, 'VALIDATION_ERROR', 'Ogiltigt värde för körerfarenhet.', correlationId);
      }
      if (learnerPermit && !LEARNER_PERMIT_VALUES.includes(learnerPermit)) {
        return fail(422, 'VALIDATION_ERROR', 'Ogiltigt värde för körkortstillstånd.', correlationId);
      }
      if (transmission && !TRANSMISSION_VALUES.includes(transmission)) {
        return fail(422, 'VALIDATION_ERROR', 'Ogiltigt värde för växellåda.', correlationId);
      }
      if (preferredLanguage && !(VALID_PREFERRED_LANGUAGES as readonly string[]).includes(preferredLanguage)) {
        return fail(422, 'VALIDATION_ERROR', 'Ogiltigt språkval.', correlationId);
      }

      const { data: lead, error: insertErr } = await db
        .from('student_leads')
        .insert({
          organization_id:           orgId,
          first_name:                firstName,
          last_name:                 lastName,
          email,
          phone,
          license_category:          category,
          notes,
          source:                    'public_form',
          status:                    'new',
          preferred_start_date:      preferredStartDate || null,
          driving_experience:        drivingExperience  || null,
          learner_permit_status:     learnerPermit       || null,
          preferred_transmission:    transmission || 'no_preference',
          preferred_lesson_times:    lessonTimes,
          preferred_language:        preferredLanguage || formConfig.default_preferred_language,
          existing_license_category: existingCategory,
          needs_theory:              needsTheory,
          needs_risk1:               needsRisk1,
          needs_risk2:               needsRisk2,
        })
        .select('id, created_at')
        .single();

      if (insertErr) {
        logger.error('public-booking.insert_failed', { org_id: orgId, error: insertErr.message, correlation_id: correlationId });
        return fail(500, 'INTERNAL_ERROR', 'Kunde inte spara anmälan', correlationId);
      }

      logger.info('public-booking.lead_created', { lead_id: lead.id, org_id: orgId, correlation_id: correlationId });

      // ── Welcome email to the visitor (best-effort, never fails the request) ─
      if (email) {
        try {
          const orgName = (org.name as string) || 'din trafikskola';
          const result = await dispatchMessage({
            channel:  'email',
            provider: 'resend',
            to:       email,
            from:     'Trafikcloud <info@trafikcloud.se>',
            subject:  `Tack för din anmälan till ${orgName}`,
            body: `
              <div style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
                <h2 style="font-size: 18px; margin-top: 0;">Tack för din anmälan, ${firstName}!</h2>
                <p>Vi har tagit emot din intresseanmälan hos <strong>${orgName}</strong>.</p>
                <p><strong>Vad händer nu?</strong></p>
                <p>${orgName} går igenom din anmälan och kontaktar dig inom kort för att diskutera din utbildning och nästa steg.</p>
                <p>Har du frågor under tiden är du varmt välkommen att kontakta ${orgName} direkt.</p>
                <p>Vänliga hälsningar,<br>${orgName}</p>
              </div>
            `.trim(),
          });
          if (result.status !== 'sent') {
            logger.error('public-booking.welcome_email_failed', { lead_id: lead.id, error: result.error, correlation_id: correlationId });
          }
        } catch (e) {
          logger.error('public-booking.welcome_email_threw', { lead_id: lead.id, error: e instanceof Error ? e.message : String(e), correlation_id: correlationId });
        }
      }

      // ── Platform Administration notification (best-effort) ─────────────────
      try {
        const { data: admins, error: adminsErr } = await db
          .from('platform_admins')
          .select('user_id')
          .eq('is_active', true);

        if (adminsErr) {
          logger.error('public-booking.platform_admin_lookup_failed', { lead_id: lead.id, error: adminsErr.message, correlation_id: correlationId });
        } else {
          const adminIds = (admins ?? []).map((a) => a.user_id as string);
          const { data: adminProfiles } = adminIds.length > 0
            ? await db.from('profiles').select('email').in('id', adminIds)
            : { data: [] as { email: string | null }[] };

          const recipients = (adminProfiles ?? [])
            .map((p) => p.email)
            .filter((e): e is string => typeof e === 'string' && e.length > 0);

          for (const adminEmail of recipients) {
            await dispatchMessage({
              channel:  'email',
              provider: 'resend',
              to:       adminEmail,
              from:     'Trafikcloud <info@trafikcloud.se>',
              subject:  `Nytt lead: ${org.name as string}`,
              body: `
                <p>Ett nytt lead har kommit in via det publika bokningsformuläret.</p>
                <ul>
                  <li><strong>Trafikskola:</strong> ${org.name as string}</li>
                  <li><strong>Namn:</strong> ${firstName} ${lastName}</li>
                  <li><strong>E-post:</strong> ${email ?? '—'}</li>
                  <li><strong>Telefon:</strong> ${phone ?? '—'}</li>
                  <li><strong>Körkortskategori:</strong> ${category}</li>
                </ul>
              `.trim(),
            });
          }
        }
      } catch (e) {
        logger.error('public-booking.platform_admin_notification_threw', { lead_id: lead.id, error: e instanceof Error ? e.message : String(e), correlation_id: correlationId });
      }

      return ok({ id: lead.id, created_at: lead.created_at }, correlationId, 201);
    }

    return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed', correlationId);
  }),
);
