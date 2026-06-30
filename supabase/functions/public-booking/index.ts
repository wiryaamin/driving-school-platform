/**
 * public-booking — Unauthenticated public lead capture endpoint.
 *
 * Routes:
 *   GET  /public-booking?slug=<org-slug>   → org name + available license categories
 *   POST /public-booking                   → submit a lead (name, contact, license category)
 *
 * Auth: none — service role is used internally to bypass RLS.
 * Rate limiting: IP-based limiting via _shared/rate-limit.ts.
 */

import { serveCors }                                          from '../_shared/cors.ts';
import { createServiceClient }                                from '../_shared/supabase.ts';
import { logger }                                             from '../_shared/logger.ts';
import { enforceIpRateLimit, getClientIp }                   from '../_shared/rate-limit.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

const LICENSE_CATEGORIES = [
  { value: 'AM',  label: 'AM — Moped klass II'       },
  { value: 'A1',  label: 'A1 — Lätt MC'              },
  { value: 'A2',  label: 'A2 — Mellantung MC'        },
  { value: 'A',   label: 'A — Tung MC'               },
  { value: 'B',   label: 'B — Personbil'             },
  { value: 'BE',  label: 'BE — Personbil med släp'   },
  { value: 'C1',  label: 'C1 — Lätt lastbil'         },
  { value: 'C',   label: 'C — Lastbil'               },
  { value: 'CE',  label: 'CE — Lastbil med släp'     },
  { value: 'D1',  label: 'D1 — Minibuss'             },
  { value: 'D',   label: 'D — Buss'                  },
];

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

    // ── GET: return org public info ───────────────────────────────────────────
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

      const settings = (org.settings ?? {}) as Record<string, unknown>;
      const enabled  = settings['public_booking_enabled'] !== false;

      return ok({
        org_id:                 org.id,
        org_name:               org.name,
        public_booking_enabled: enabled,
        license_categories:     LICENSE_CATEGORIES,
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

      const orgId     = (body['org_id']     as string | undefined)?.trim();
      const firstName = (body['first_name'] as string | undefined)?.trim();
      const lastName  = (body['last_name']  as string | undefined)?.trim();
      const email     = (body['email']      as string | undefined)?.trim() || null;
      const phone     = (body['phone']      as string | undefined)?.trim() || null;
      const category  = (body['license_category'] as string | undefined)?.trim() ?? 'B';
      const notes     = (body['notes']      as string | undefined)?.trim() || null;

      if (!orgId || !UUID_RE.test(orgId)) return fail(422, 'VALIDATION_ERROR', 'org_id krävs och måste vara ett UUID', correlationId);
      if (!firstName) return fail(422, 'VALIDATION_ERROR', 'Förnamn krävs', correlationId);
      if (!lastName)  return fail(422, 'VALIDATION_ERROR', 'Efternamn krävs', correlationId);
      if (!email && !phone) return fail(422, 'VALIDATION_ERROR', 'Ange minst e-post eller telefonnummer', correlationId);

      const { data: org, error: orgErr } = await db
        .from('organizations')
        .select('id, settings')
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

      const { data: lead, error: insertErr } = await db
        .from('student_leads')
        .insert({
          organization_id:  orgId,
          first_name:       firstName,
          last_name:        lastName,
          email,
          phone,
          license_category: category,
          notes,
          source:           'public_form',
          status:           'new',
        })
        .select('id, created_at')
        .single();

      if (insertErr) {
        logger.error('public-booking.insert_failed', { org_id: orgId, error: insertErr.message, correlation_id: correlationId });
        return fail(500, 'INTERNAL_ERROR', 'Kunde inte spara anmälan', correlationId);
      }

      logger.info('public-booking.lead_created', { lead_id: lead.id, org_id: orgId, correlation_id: correlationId });
      return ok({ id: lead.id, created_at: lead.created_at }, correlationId, 201);
    }

    return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed', correlationId);
  }),
);
