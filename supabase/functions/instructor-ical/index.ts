import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext } from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { createSupabaseClient, createServiceClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';

// ─── HMAC helper ──────────────────────────────────────────────────────────────

async function computeHmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── iCal helpers ─────────────────────────────────────────────────────────────

function toIcalDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeProp(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let pos = 75;
  while (pos < line.length) {
    parts.push(' ' + line.slice(pos, pos + 74));
    pos += 74;
  }
  return parts.join('\r\n');
}

function buildVEvent(
  slot: {
    id: string;
    starts_at: string;
    ends_at: string;
    notes: string | null;
    lesson_type_name: string | null;
    student_names: string[];
  },
  nowStr: string,
): string {
  const typeName = slot.lesson_type_name ?? 'Lektion';
  const { student_names: names } = slot;
  const summary = names.length === 0
    ? typeName
    : names.length === 1
    ? `${typeName} · ${names[0]}`
    : `${typeName} · ${names[0]} +${names.length - 1}`;

  const lines: string[] = [
    'BEGIN:VEVENT',
    foldLine(`UID:${slot.id}@trafikskola.se`),
    `DTSTAMP:${nowStr}`,
    `DTSTART:${toIcalDate(slot.starts_at)}`,
    `DTEND:${toIcalDate(slot.ends_at)}`,
    foldLine(`SUMMARY:${escapeProp(summary)}`),
  ];

  if (names.length > 0) {
    lines.push(foldLine(`DESCRIPTION:${escapeProp(names.join(', '))}`));
  }
  if (slot.notes) {
    lines.push(foldLine(`COMMENT:${escapeProp(slot.notes)}`));
  }

  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlotRow {
  id: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  lesson_types: { name: string } | null;
}

interface BookingRow {
  slot_id: string;
  students: { first_name: string; last_name: string } | null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] ?? '';
  const isTokenRoute = lastSegment === 'token';

  const workerSecret = Deno.env.get('WORKER_SECRET');
  if (!workerSecret) {
    logger.error('instructor-ical: WORKER_SECRET not configured');
    return new Response('Server configuration error', { status: 500 });
  }

  // ── GET /token — JWT-authenticated, returns HMAC + feed URL ───────────────
  if (isTokenRoute) {
    return serveCors(req, async () => {
      const result = await buildEdgeContext(req);
      if (!result.ok) return result.response;
      const { ctx } = result;

      const ipGuard = enforceIpRateLimit(req, 'ip_auth', ctx.correlationId);
      if (ipGuard) return ipGuard;
      if (req.method !== 'GET') {
        const writeGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'user_write', ctx.correlationId);
        if (writeGuard) return writeGuard;
      }

      logger.info('request.started', {
        method:         req.method,
        path:           url.pathname,
        correlation_id: ctx.correlationId,
        request_id:     ctx.requestId,
        org_id:         ctx.organizationId ?? 'platform',
        actor_id:       ctx.actorId,
      });

      if (!ctx.actorId || !ctx.organizationId) {
        return new Response(
          JSON.stringify({ code: 'UNAUTHORIZED', message: 'Missing session claims', trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }),
          { status: 401, headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } },
        );
      }

      const db = createSupabaseClient(req, true, { correlationId: ctx.correlationId, requestId: ctx.requestId });
      const { data: instructor, error } = await db
        .from('instructors')
        .select('id')
        .eq('user_id', ctx.actorId)
        .eq('organization_id', ctx.organizationId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) {
        logger.error('instructor-ical: DB error looking up instructor', { error: error.message });
        return new Response(
          JSON.stringify({ error: 'Database error' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (!instructor) {
        return new Response(
          JSON.stringify({ error: 'Instructor record not found for this user' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        );
      }

      const message = `${instructor.id}|${ctx.organizationId}`;
      const token   = await computeHmac(workerSecret, message);
      const baseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const feedUrl = `${baseUrl}/functions/v1/instructor-ical?instructor_id=${instructor.id}&org_id=${ctx.organizationId}&token=${token}`;

      return new Response(
        JSON.stringify({ data: { token, feed_url: feedUrl } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
  }

  // ── GET /?instructor_id=&org_id=&token= — public, returns .ics ────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const instructorId = url.searchParams.get('instructor_id');
  const orgId        = url.searchParams.get('org_id');
  const token        = url.searchParams.get('token');

  if (!instructorId || !orgId || !token) {
    return new Response('Missing required parameters: instructor_id, org_id, token', { status: 400 });
  }

  const expected = await computeHmac(workerSecret, `${instructorId}|${orgId}`);
  if (expected !== token) {
    return new Response('Invalid token', { status: 403 });
  }

  const db  = createServiceClient();
  const now = new Date();
  const from = now.toISOString();
  const to   = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rawSlots, error: slotsErr } = await db
    .from('lesson_slots')
    .select('id, starts_at, ends_at, notes, lesson_types!lesson_type_id(name)')
    .eq('instructor_id', instructorId)
    .eq('organization_id', orgId)
    .gte('starts_at', from)
    .lte('starts_at', to)
    .is('deleted_at', null)
    .not('status', 'in', '(cancelled,blocked)')
    .order('starts_at')
    .limit(500);

  if (slotsErr) {
    logger.error('instructor-ical: slots fetch failed', { error: slotsErr.message });
    return new Response('Internal error', { status: 500 });
  }

  const slots = (rawSlots ?? []) as unknown as SlotRow[];
  const slotIds = slots.map((s) => s.id);

  // Fetch active bookings so we can include student names in each event
  const studentsBySlot: Record<string, string[]> = {};
  if (slotIds.length > 0) {
    const { data: rawBookings } = await db
      .from('lesson_bookings')
      .select('slot_id, students!student_id(first_name, last_name)')
      .in('slot_id', slotIds)
      .eq('status', 'booked');

    if (rawBookings) {
      for (const b of rawBookings as unknown as BookingRow[]) {
        if (!studentsBySlot[b.slot_id]) studentsBySlot[b.slot_id] = [];
        if (b.students) {
          studentsBySlot[b.slot_id]!.push(`${b.students.first_name} ${b.students.last_name}`);
        }
      }
    }
  }

  const nowStr  = toIcalDate(now.toISOString());
  const vevents = slots.map((slot) =>
    buildVEvent({
      id:               slot.id,
      starts_at:        slot.starts_at,
      ends_at:          slot.ends_at,
      notes:            slot.notes,
      lesson_type_name: slot.lesson_types?.name ?? null,
      student_names:    studentsBySlot[slot.id] ?? [],
    }, nowStr)
  );

  const ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Trafikskola Platform//Schema//SV',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Mitt schema',
    'X-WR-TIMEZONE:Europe/Stockholm',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...vevents,
    'END:VCALENDAR',
  ].join('\r\n');

  return new Response(ical, {
    status: 200,
    headers: {
      'Content-Type':        'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="schema.ics"',
      'Cache-Control':       'no-cache',
    },
  });
});
