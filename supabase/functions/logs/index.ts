import { z } from 'npm:zod@3';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext } from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';

const JSON_CT = { 'Content-Type': 'application/json' } as const;

function errorResp(ctx: EdgeRequestContext, status: number, code: string, message: string, details?: unknown): Response {
  const body: Record<string, unknown> = { code, message, trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 };
  if (details !== undefined) body['details'] = details;
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId },
  });
}

function pagedResp<T>(ctx: EdgeRequestContext, data: T[], total: number, page: number, perPage: number): Response {
  return new Response(
    JSON.stringify({ data, meta: { total, page, per_page: perPage, has_more: page * perPage < total } }),
    { status: 200, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } }
  );
}

function requirePerm(ctx: EdgeRequestContext, code: string): Response | null {
  if (ctx.organizationId === null) return errorResp(ctx, 403, 'FORBIDDEN', 'Organisation context is required');
  if (ctx.isPlatformAdmin) return null;
  if (!ctx.permissions.includes(code)) return errorResp(ctx, 403, 'FORBIDDEN', `Requires permission: ${code}`);
  return null;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const PageSchema = z.object({
  page:     z.coerce.number().int().positive().max(1000).default(1),
  per_page: z.coerce.number().int().positive().max(100).default(50),
});

const BookingLogQuerySchema = PageSchema.extend({
  filter: z.enum(['all', 'booked', 'cancelled']).default('all'),
});

const CommunicationsQuerySchema = PageSchema.extend({
  channel: z.enum(['all', 'email', 'sms', 'push']).default('all'),
  status:  z.enum(['all', 'sent', 'failed', 'pending']).default('all'),
});

const MissedTrainingQuerySchema = PageSchema.extend({
  instructor_id:   z.string().uuid().optional(),
  lesson_type_id:  z.string().uuid().optional(),
});

const MissedExamsQuerySchema = PageSchema.extend({
  instructor_id: z.string().uuid().optional(),
  category:      z.enum(['all', 'risk1', 'risk2', 'assessment']).default('all'),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface NameRow { first_name: string; last_name: string }
interface StudentRow extends NameRow { email?: string | null; phone?: string | null }
interface LessonTypeRow { name: string; category?: string }

function fullName(r: NameRow | null | undefined): string {
  if (!r) return '—';
  return `${r.first_name} ${r.last_name}`.trim();
}

function buildHandelse(status: string, studentName: string, instructorName: string, cancellationCategory: string | null): string {
  if (status === 'confirmed' || status === 'reserved') return `${studentName} inbokad av ${instructorName}`;
  if (status === 'completed')  return `${studentName} — lektion genomförd av ${instructorName}`;
  if (status === 'cancelled') {
    if (cancellationCategory === 'student_request') return `${studentName} avbokade sig`;
    return `${studentName} avbokades av ${instructorName}`;
  }
  if (status === 'no_show')    return `${studentName} uteblev (${instructorName})`;
  if (status === 'rescheduled') return `${studentName} — ombokas av ${instructorName}`;
  return `${studentName} — ${status}`;
}

function buildTillfalle(lessonTypeName: string, startsAt: string, endsAt: string): string {
  try {
    const tz = 'Europe/Stockholm';
    const s = new Date(startsAt), e = new Date(endsAt);
    const dayRaw  = s.toLocaleDateString('sv-SE', { weekday: 'long', timeZone: tz });
    const dateStr = s.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz });
    const st      = s.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    const et      = e.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    return `${lessonTypeName} (${dayRaw.charAt(0).toUpperCase() + dayRaw.slice(1)} ${dateStr} ${st} - ${et})`;
  } catch { return lessonTypeName; }
}

function templateKeyToLabel(key: string): string {
  const MAP: Record<string, string> = {
    booking_confirmation:  'Bokningsbekräftelse',
    booking_reminder:      'Bokningspåminnelse',
    lesson_reminder:       'Bokningspåminnelse',
    password_reset:        'Nytt lösenord',
    welcome:               'Välkommen',
    slot_available:        'Ledig tid',
    waitlist_promotion:    'Väntelistebefordran',
    cancellation:          'Avbokning',
  };
  return MAP[key] ?? key;
}

function channelToLabel(ch: string): string {
  if (ch === 'email') return 'E-post';
  if (ch === 'sms')   return 'SMS';
  if (ch === 'push')  return 'Push';
  return ch;
}

function notifStatusToLabel(st: string): string {
  if (st === 'sent')      return 'Levererad';
  if (st === 'failed')    return 'Misslyckad';
  if (st === 'pending')   return 'Väntar';
  if (st === 'sending')   return 'Skickas';
  if (st === 'cancelled') return 'Avbruten';
  return st;
}

// ─── Handler: Booking logs ────────────────────────────────────────────────────

async function handleBookingLogs(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:booking:read');
  if (guard) return guard;

  const raw    = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = BookingLogQuerySchema.safeParse(raw);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Invalid query', parsed.error.issues);

  const { page, per_page, filter } = parsed.data;
  const fromIdx = (page - 1) * per_page, toIdx = fromIdx + per_page - 1;

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  // eslint-disable-next-line prefer-const
  let q = (client as any)
    .from('lesson_bookings')
    .select(`id, status, created_at, starts_at, ends_at, cancellation_category,
             students ( first_name, last_name ),
             instructors ( first_name, last_name ),
             lesson_types ( name )`, { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(fromIdx, toIdx);

  if (filter === 'booked')    q = q.in('status', ['confirmed', 'reserved', 'completed']);
  if (filter === 'cancelled') q = q.eq('status', 'cancelled');

  const { data, count, error } = await q;
  if (error) return errorResp(ctx, 500, 'DB_ERROR', error.message);

  const logs = (data ?? []).map((b: {
    id: string; status: string; created_at: string; starts_at: string; ends_at: string;
    cancellation_category: string | null; students: NameRow | null; instructors: NameRow | null;
    lesson_types: LessonTypeRow | null;
  }) => ({
    id:        b.id,
    kalla:     'A',
    datum:     b.created_at,
    handelse:  buildHandelse(b.status, fullName(b.students), fullName(b.instructors), b.cancellation_category),
    tillfalle: buildTillfalle(b.lesson_types?.name ?? '', b.starts_at, b.ends_at),
    larare:    fullName(b.instructors),
    utford:    fullName(b.instructors),
    status:    b.status,
  }));

  return pagedResp(ctx, logs, count ?? 0, page, per_page);
}

// ─── Handler: Communication logs ─────────────────────────────────────────────

async function handleCommunications(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:booking:read');
  if (guard) return guard;

  const raw    = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = CommunicationsQuerySchema.safeParse(raw);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Invalid query', parsed.error.issues);

  const { page, per_page, channel, status } = parsed.data;
  const fromIdx = (page - 1) * per_page, toIdx = fromIdx + per_page - 1;

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  // eslint-disable-next-line prefer-const
  let q = (client as any)
    .from('notifications')
    .select('id, created_at, channel, status, template_key, subject, metadata, recipient_id, recipient_type, sent_at',
      { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .range(fromIdx, toIdx);

  if (channel !== 'all') q = q.eq('channel', channel);
  if (status  !== 'all') q = q.eq('status', status === 'sent' ? 'sent' : status);

  const { data: notifs, count, error } = await q;
  if (error) return errorResp(ctx, 500, 'DB_ERROR', error.message);

  // Batch-fetch student contact info for student recipients
  const studentIds = (notifs ?? [])
    .filter((n: { recipient_type: string }) => n.recipient_type === 'student')
    .map((n: { recipient_id: string }) => n.recipient_id);

  const { data: students } = studentIds.length > 0
    ? await (client as any).from('students').select('id, email, phone').in('id', studentIds)
    : { data: [] as { id: string; email: string | null; phone: string | null }[] };

  const studentMap = new Map<string, { email: string | null; phone: string | null }>(
    (students ?? []).map((s: { id: string; email: string | null; phone: string | null }) => [s.id, s])
  );

  const logs = (notifs ?? []).map((n: {
    id: string; created_at: string; channel: string; status: string; template_key: string;
    subject: string | null; metadata: Record<string, string>; recipient_id: string;
    recipient_type: string; sent_at: string | null;
  }) => {
    const contact = studentMap.get(n.recipient_id);
    const skickadTill = n.channel === 'sms'
      ? (contact?.phone ?? n.metadata?.to ?? '—')
      : (contact?.email ?? n.metadata?.to ?? '—');
    const skickadAv = n.metadata?.sent_by_name ?? n.metadata?.sender ?? 'System';

    return {
      id:          n.id,
      datum:       n.created_at,
      kanal:       channelToLabel(n.channel),
      kanal_raw:   n.channel,
      status:      notifStatusToLabel(n.status),
      status_raw:  n.status,
      amne:        n.subject ?? '—',
      skickad_av:  skickadAv,
      skickad_till: skickadTill,
      typ:         templateKeyToLabel(n.template_key),
    };
  });

  return pagedResp(ctx, logs, count ?? 0, page, per_page);
}

// ─── Handler: Activity logs ───────────────────────────────────────────────────

async function handleActivities(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:booking:read');
  if (guard) return guard;

  const raw    = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = PageSchema.safeParse(raw);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Invalid query', parsed.error.issues);

  const { page, per_page } = parsed.data;
  const fromIdx = (page - 1) * per_page, toIdx = fromIdx + per_page - 1;

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  const { data: logs, count, error } = await (client as any)
    .from('activity_logs')
    .select('id, occurred_at, user_id, user_email, action, description, entity_type, entity_id', { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .order('occurred_at', { ascending: false })
    .range(fromIdx, toIdx);

  if (error) return errorResp(ctx, 500, 'DB_ERROR', error.message);

  // Batch-fetch profile names for user_id
  const userIds = [...new Set<string>(
    (logs ?? []).filter((l: { user_id: string | null }) => l.user_id).map((l: { user_id: string }) => l.user_id)
  )];
  const { data: profiles } = userIds.length > 0
    ? await (client as any).from('profiles').select('id, first_name, last_name').in('id', userIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[] };

  const profileMap = new Map<string, NameRow>(
    (profiles ?? []).map((p: { id: string } & NameRow) => [p.id, p])
  );

  const result = (logs ?? []).map((l: {
    id: string; occurred_at: string; user_id: string | null; user_email: string | null;
    action: string; description: string | null; entity_type: string | null; entity_id: string | null;
  }) => ({
    id:          l.id,
    datum:       l.occurred_at,
    kund:        l.user_id ? fullName(profileMap.get(l.user_id)) : '—',
    email:       l.user_email ?? '—',
    typ:         l.description ?? l.action,
    entity_type: l.entity_type,
    entity_id:   l.entity_id,
  }));

  return pagedResp(ctx, result, count ?? 0, page, per_page);
}

// ─── Handler: Missed training (no-show) ──────────────────────────────────────

async function handleMissedTraining(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:booking:read');
  if (guard) return guard;

  const raw    = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = MissedTrainingQuerySchema.safeParse(raw);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Invalid query', parsed.error.issues);

  const { page, per_page, instructor_id, lesson_type_id } = parsed.data;
  const fromIdx = (page - 1) * per_page, toIdx = fromIdx + per_page - 1;

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  // eslint-disable-next-line prefer-const
  let q = (client as any)
    .from('lesson_bookings')
    .select(`id, starts_at, ends_at,
             students ( first_name, last_name ),
             instructors ( first_name, last_name ),
             lesson_types ( name )`, { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'no_show')
    .is('deleted_at', null)
    .order('starts_at', { ascending: false })
    .range(fromIdx, toIdx);

  if (instructor_id)  q = q.eq('instructor_id',   instructor_id);
  if (lesson_type_id) q = q.eq('lesson_type_id',  lesson_type_id);

  const { data, count, error } = await q;
  if (error) return errorResp(ctx, 500, 'DB_ERROR', error.message);

  const result = (data ?? []).map((b: {
    id: string; starts_at: string; ends_at: string;
    students: NameRow | null; instructors: NameRow | null; lesson_types: LessonTypeRow | null;
  }) => ({
    id:         b.id,
    kund:       fullName(b.students),
    larare:     fullName(b.instructors),
    tidslucka:  b.lesson_types?.name ?? '—',
    datum:      buildTillfalle(b.lesson_types?.name ?? '', b.starts_at, b.ends_at),
    bokning_id: b.id,
  }));

  return pagedResp(ctx, result, count ?? 0, page, per_page);
}

// ─── Handler: Missed exam moments ────────────────────────────────────────────

async function handleMissedExams(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:booking:read');
  if (guard) return guard;

  const raw    = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = MissedExamsQuerySchema.safeParse(raw);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Invalid query', parsed.error.issues);

  const { page, per_page, instructor_id, category } = parsed.data;
  const fromIdx = (page - 1) * per_page, toIdx = fromIdx + per_page - 1;

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });

  // Step 1: get exam-type lesson type IDs for this org
  const examCategories = category === 'all' ? ['risk1', 'risk2', 'assessment'] : [category];
  const { data: examTypes, error: typeErr } = await (client as any)
    .from('lesson_types')
    .select('id, name, category')
    .eq('organization_id', ctx.organizationId)
    .in('category', examCategories);

  if (typeErr) return errorResp(ctx, 500, 'DB_ERROR', typeErr.message);

  const examTypeIds = (examTypes ?? []).map((t: { id: string }) => t.id);
  const examTypeMap = new Map<string, LessonTypeRow>(
    (examTypes ?? []).map((t: { id: string } & LessonTypeRow) => [t.id, t])
  );

  if (examTypeIds.length === 0) return pagedResp(ctx, [], 0, page, per_page);

  // Step 2: query bookings for those lesson types
  // eslint-disable-next-line prefer-const
  let q = (client as any)
    .from('lesson_bookings')
    .select(`id, starts_at, ends_at, lesson_type_id,
             students ( first_name, last_name ),
             instructors ( first_name, last_name )`, { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .in('lesson_type_id', examTypeIds)
    .in('status', ['confirmed', 'completed', 'no_show'])
    .is('deleted_at', null)
    .order('starts_at', { ascending: false })
    .range(fromIdx, toIdx);

  if (instructor_id) q = q.eq('instructor_id', instructor_id);

  const { data, count, error } = await q;
  if (error) return errorResp(ctx, 500, 'DB_ERROR', error.message);

  const result = (data ?? []).map((b: {
    id: string; starts_at: string; ends_at: string; lesson_type_id: string;
    students: NameRow | null; instructors: NameRow | null;
  }) => {
    const lt = examTypeMap.get(b.lesson_type_id);
    return {
      id:         b.id,
      kund:       fullName(b.students),
      larare:     fullName(b.instructors),
      tidslucka:  lt?.name ?? '—',
      datum:      buildTillfalle(lt?.name ?? '', b.starts_at, b.ends_at),
      typ:        lt?.name ?? '—',
      bokning_id: b.id,
    };
  });

  return pagedResp(ctx, result, count ?? 0, page, per_page);
}

// ─── Router ───────────────────────────────────────────────────────────────────

Deno.serve((req) =>
  serveCors(req, async () => {
    const result = await buildEdgeContext(req);
    if (!result.ok) return result.response;
    const { ctx } = result;

    const ipGuard = enforceIpRateLimit(req, 'ip_auth', ctx.correlationId);
    if (ipGuard) return ipGuard;
    if (req.method !== 'GET') {
      const writeGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'user_write', ctx.correlationId);
      if (writeGuard) return writeGuard;
    }

    const url      = new URL(req.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const logsIdx  = segments.findLastIndex((s) => s === 'logs');
    const sub      = segments[logsIdx + 1] ?? '';

    logger.info('request.started', {
      method:         req.method,
      path:           url.pathname,
      correlation_id: ctx.correlationId,
      request_id:     ctx.requestId,
      org_id:         ctx.organizationId ?? 'platform',
      actor_id:       ctx.actorId,
    });

    const startedAt = Date.now();
    let response: Response;

    if (req.method === 'GET' && sub === 'bookings')         { response = await handleBookingLogs(req, ctx); }
    else if (req.method === 'GET' && sub === 'communications')  { response = await handleCommunications(req, ctx); }
    else if (req.method === 'GET' && sub === 'activities')      { response = await handleActivities(req, ctx); }
    else if (req.method === 'GET' && sub === 'missed-training') { response = await handleMissedTraining(req, ctx); }
    else if (req.method === 'GET' && sub === 'missed-exams')    { response = await handleMissedExams(req, ctx); }
    else {
      response = new Response(
        JSON.stringify({ code: 'NOT_FOUND', message: 'Unknown logs sub-route', trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }),
        { status: 404, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } },
      );
    }

    logger.info('request.completed', {
      method:         req.method,
      path:           url.pathname,
      status:         response.status,
      correlation_id: ctx.correlationId,
      request_id:     ctx.requestId,
      duration_ms:    Date.now() - startedAt,
    });

    return response;
  })
);
