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

const ActivitiesQuerySchema = PageSchema.extend({
  entity_type: z.string().optional(),
  date_from:   z.string().optional(),
  date_to:     z.string().optional(),
});

const AuditLogQuerySchema = PageSchema.extend({
  actor_email: z.string().optional(),
  entity_type: z.string().optional(),
  operation:   z.enum(['INSERT', 'UPDATE', 'DELETE']).optional(),
  date_from:   z.string().optional(),
  date_to:     z.string().optional(),
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

// Picks the timestamp that actually corresponds to the event buildHandelse()
// describes, instead of always using created_at. Evidence for this mapping
// (checked against real lesson_bookings data, not assumed):
//   - cancelled_at is DB-constrained NOT NULL iff status='cancelled'
//     (lesson_bookings_cancel_consistency) — 100% reliable.
//   - no_show_marked_at is DB-constrained NOT NULL iff status='no_show'
//     (lesson_bookings_no_show_consistency) — 100% reliable, and more
//     precise than the generic status_changed_at for this status.
//   - status_changed_at has no such guarantee (no trigger maintains it; it's
//     set ad hoc by whichever code path changed the status) — live data
//     showed it NULL for 60% of 'completed' rows, so it's only used when
//     actually present, falling back to updated_at (always populated).
//   - confirmed/reserved/draft and anything else: the creation event IS the
//     described event ("inbokad"), so created_at is already correct.
// Never fabricates a value — every branch resolves to an existing,
// already-populated column.
function bookingEventTimestamp(row: {
  status: string; created_at: string; updated_at: string;
  status_changed_at: string | null; cancelled_at: string | null; no_show_marked_at: string | null;
}): string {
  if (row.status === 'cancelled' && row.cancelled_at)    return row.cancelled_at;
  if (row.status === 'no_show'   && row.no_show_marked_at) return row.no_show_marked_at;
  if (row.status === 'completed' || row.status === 'rescheduled') {
    return row.status_changed_at ?? row.updated_at;
  }
  return row.created_at;
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

function recipientTypeLabel(rt: string | null): string {
  if (rt === 'student')    return 'Elev';
  if (rt === 'instructor') return 'Lärare';
  if (rt === 'guardian')   return 'Vårdnadshavare';
  if (rt === 'staff')      return 'Personal';
  return rt ?? '—';
}

// Picks the timestamp that actually corresponds to the notification's
// current status, instead of always using created_at — same evidence-based
// approach as bookingEventTimestamp() (commit 976d4e3). Live data check:
// sent_at is populated for only 6 of 71 'sent' rows today (91% null — no DB
// constraint guarantees it, unlike lesson_bookings' cancelled_at), but for
// every one of those 6 it differs from created_at, so it's still the more
// correct value whenever actually present. failed_at was populated for
// 100% of the (small) 'failed' sample. Never fabricates a value — always
// falls back to the already-populated created_at.
function notificationEventTimestamp(row: {
  status: string; created_at: string; sent_at: string | null; failed_at: string | null;
}): string {
  if (row.status === 'sent'   && row.sent_at)   return row.sent_at;
  if (row.status === 'failed' && row.failed_at) return row.failed_at;
  return row.created_at;
}

const AUDIT_ENTITY_LABEL: Record<string, string> = {
  students:              'Elev',
  instructors:           'Lärare',
  vehicles:              'Fordon',
  lesson_bookings:       'Bokning',
  lesson_slots:          'Tid',
  package_offerings:     'Paket',
  package_catalog:       'Paket',
  invoices:              'Faktura',
  payments:              'Betalning',
  refunds:               'Återbetalning',
  memberships:           'Medlemskap',
  membership_roles:      'Rolltilldelning',
  organizations:         'Organisation',
  organization_locations: 'Plats',
  profiles:              'Profil',
  student_documents:     'Dokument',
  student_notes:         'Anteckning',
  regulatory_workflows:  'Myndighetsärende',
};

function auditEntityLabel(entityType: string): string {
  return AUDIT_ENTITY_LABEL[entityType] ?? entityType;
}

function auditOperationVerb(operation: string): string {
  if (operation === 'INSERT') return 'skapad';
  if (operation === 'UPDATE') return 'uppdaterad';
  if (operation === 'DELETE') return 'raderad';
  return operation.toLowerCase();
}

function buildAuditHandelse(operation: string, entityType: string, actorEmail: string | null): string {
  const entity = auditEntityLabel(entityType);
  const verb   = auditOperationVerb(operation);
  return actorEmail ? `${entity} ${verb} av ${actorEmail}` : `${entity} ${verb}`;
}

// activity_logs.entity_type uses singular values (e.g. 'vehicle', 'student'),
// unlike audit_logs' plural table-name values — kept as a separate map
// rather than reusing AUDIT_ENTITY_LABEL.
const ACTIVITY_ENTITY_LABEL: Record<string, string> = {
  student:    'Elev',
  instructor: 'Lärare',
  guardian:   'Vårdnadshavare',
  vehicle:    'Fordon',
  booking:    'Bokning',
  invoice:    'Faktura',
  payment:    'Betalning',
};

function activityEntityLabel(entityType: string | null): string {
  if (!entityType) return '—';
  return ACTIVITY_ENTITY_LABEL[entityType] ?? entityType;
}

const ACTIVITY_ACTION_LABEL: Record<string, string> = {
  'guardian_portal.viewed_me':          'Vårdnadshavare visade elevöversikt',
  'guardian_portal.viewed_progress':    'Vårdnadshavare visade utbildningsstatus',
  'guardian_portal.viewed_bookings':    'Vårdnadshavare visade bokningar',
  'guardian_portal.viewed_balance':     'Vårdnadshavare visade saldo',
  'guardian_portal.viewed_assessments': 'Vårdnadshavare visade bedömningar',
  'guardian_portal.viewed_documents':   'Vårdnadshavare visade dokument',
  'vehicle_registry.performed':         'Fordonsuppslag genomfört',
  'vehicle_registry.cache_hit':         'Fordonsuppslag (cachad träff)',
};

function activityActionLabel(action: string): string {
  return ACTIVITY_ACTION_LABEL[action] ?? action;
}

// ─── Handler: Booking logs ────────────────────────────────────────────────────
//
// Ordering must follow the same effective event timestamp shown in the
// "Datum" column (bookingEventTimestamp(), commit 976d4e3), not created_at —
// otherwise the list and the dates it displays can disagree (a booking
// cancelled today but created weeks ago must sort as "today", not "weeks
// ago"). PostgREST's .order() only accepts real column names, not a
// per-row CASE/COALESCE expression, so it can't express this directly.
// Fetching one page by created_at and re-sorting only that page would
// silently break pagination (a later page could contain a row that
// belongs, by event time, on an earlier page). Instead: fetch every
// matching row for this org+filter (bounded by BOOKING_LOG_FETCH_CAP as a
// resource-exhaustion guard — see the constant's own comment), sort the
// complete set by event timestamp, then paginate in memory. Real org
// volumes today are tiny (largest is 38 bookings) so this is safe now;
// if a single tenant's booking history ever approaches the cap, correct
// server-side ordering would require a small SQL function instead — not
// implemented here since it isn't needed yet and DB changes were to be
// avoided unless unavoidable.

// Generous upper bound on how many of an org's own bookings this handler
// will ever fetch in one request — not a page size. Real orgs are 1-2
// orders of magnitude below this today. Existing DB-level pagination
// remains correct up to this cap; beyond it, the oldest-by-created_at
// rows would be silently excluded rather than the result being wrong in
// a hidden way.
const BOOKING_LOG_FETCH_CAP = 2000;

async function handleBookingLogs(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:booking:read');
  if (guard) return guard;

  const raw    = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = BookingLogQuerySchema.safeParse(raw);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Invalid query', parsed.error.issues);

  const { page, per_page, filter } = parsed.data;

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  // eslint-disable-next-line prefer-const
  let q = (client as any)
    .from('lesson_bookings')
    .select(`id, status, created_at, updated_at, status_changed_at, cancelled_at, no_show_marked_at,
             starts_at, ends_at, cancellation_category, cancellation_reason,
             students ( first_name, last_name ),
             instructors ( first_name, last_name ),
             lesson_types ( name ),
             vehicles ( registration_number ),
             organization_locations ( name )`)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(0, BOOKING_LOG_FETCH_CAP - 1);

  if (filter === 'booked')    q = q.in('status', ['confirmed', 'reserved', 'completed']);
  if (filter === 'cancelled') q = q.eq('status', 'cancelled');

  const { data, error } = await q;
  if (error) return errorResp(ctx, 500, 'DB_ERROR', error.message);

  type BookingRow = {
    id: string; status: string; created_at: string; updated_at: string;
    status_changed_at: string | null; cancelled_at: string | null; no_show_marked_at: string | null;
    starts_at: string; ends_at: string;
    cancellation_category: string | null; cancellation_reason: string | null;
    students: NameRow | null; instructors: NameRow | null;
    lesson_types: LessonTypeRow | null;
    vehicles: { registration_number: string } | null;
    organization_locations: { name: string } | null;
  };

  // Sort the FULL matching set by event timestamp before paginating — the
  // whole point of this handler's structure (see comment above).
  const sorted = ((data ?? []) as BookingRow[]).slice().sort(
    (a, b) => new Date(bookingEventTimestamp(b)).getTime() - new Date(bookingEventTimestamp(a)).getTime(),
  );

  const total    = sorted.length;
  const fromIdx  = (page - 1) * per_page;
  const pageRows = sorted.slice(fromIdx, fromIdx + per_page);

  const logs = pageRows.map((b) => ({
    id:        b.id,
    kalla:     'A',
    datum:     bookingEventTimestamp(b),
    handelse:  buildHandelse(b.status, fullName(b.students), fullName(b.instructors), b.cancellation_category),
    tillfalle: buildTillfalle(b.lesson_types?.name ?? '', b.starts_at, b.ends_at),
    larare:    fullName(b.instructors),
    utford:    fullName(b.instructors),
    status:    b.status,
    // Detail-view fields — the table itself only ever shows the six fields
    // above (unchanged); these are additive, for the row's detail card only.
    elev:              fullName(b.students),
    lektionstyp:       b.lesson_types?.name ?? '—',
    fordon:            b.vehicles?.registration_number ?? null,
    plats:             b.organization_locations?.name ?? null,
    avbokningsorsak:   b.cancellation_reason ?? null,
  }));

  return pagedResp(ctx, logs, total, page, per_page);
}

// ─── Handler: Communication logs ─────────────────────────────────────────────
//
// Ordering must follow the same effective event timestamp shown in the
// "Datum" column (notificationEventTimestamp()) — same reasoning and same
// fetch-all/sort/paginate-in-memory structure as handleBookingLogs, since
// PostgREST's .order() can't express a per-row CASE/COALESCE expression.
// Real notification volumes are even smaller than bookings today (160
// total across every org), so the same generous cap is safe.

const COMMUNICATION_LOG_FETCH_CAP = 2000;

async function handleCommunications(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:booking:read');
  if (guard) return guard;

  const raw    = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = CommunicationsQuerySchema.safeParse(raw);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Invalid query', parsed.error.issues);

  const { page, per_page, channel, status } = parsed.data;

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  // eslint-disable-next-line prefer-const
  let q = (client as any)
    .from('notifications')
    .select(`id, created_at, channel, status, template_key, subject, metadata, recipient_id, recipient_type,
             sent_at, failed_at, failure_reason, scheduled_for, reference_type, reference_id`)
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .range(0, COMMUNICATION_LOG_FETCH_CAP - 1);

  if (channel !== 'all') q = q.eq('channel', channel);
  if (status  !== 'all') q = q.eq('status', status);

  const { data: notifs, error } = await q;
  if (error) return errorResp(ctx, 500, 'DB_ERROR', error.message);

  // Batch-fetch student contact info for student recipients
  const studentIds = [...new Set<string>(
    (notifs ?? []).filter((n: { recipient_type: string }) => n.recipient_type === 'student')
      .map((n: { recipient_id: string }) => n.recipient_id)
  )];

  const { data: students } = studentIds.length > 0
    ? await (client as any).from('students').select('id, email, phone').in('id', studentIds)
    : { data: [] as { id: string; email: string | null; phone: string | null }[] };

  const studentMap = new Map<string, { email: string | null; phone: string | null }>(
    (students ?? []).map((s: { id: string; email: string | null; phone: string | null }) => [s.id, s])
  );

  type NotifRow = {
    id: string; created_at: string; channel: string; status: string; template_key: string;
    subject: string | null; metadata: Record<string, string>; recipient_id: string;
    recipient_type: string | null; sent_at: string | null; failed_at: string | null;
    failure_reason: string | null; scheduled_for: string | null;
    reference_type: string | null; reference_id: string | null;
  };

  // Sort the FULL matching set by event timestamp before paginating — same
  // reasoning as handleBookingLogs.
  const sorted = ((notifs ?? []) as NotifRow[]).slice().sort(
    (a, b) => new Date(notificationEventTimestamp(b)).getTime() - new Date(notificationEventTimestamp(a)).getTime(),
  );

  const total    = sorted.length;
  const fromIdx  = (page - 1) * per_page;
  const pageRows = sorted.slice(fromIdx, fromIdx + per_page);

  const logs = pageRows.map((n) => {
    const contact = studentMap.get(n.recipient_id);
    const skickadTill = n.channel === 'sms'
      ? (contact?.phone ?? n.metadata?.to ?? '—')
      : (contact?.email ?? n.metadata?.to ?? '—');
    const skickadAv = n.metadata?.sent_by_name ?? n.metadata?.sender ?? 'System';

    return {
      id:              n.id,
      datum:           notificationEventTimestamp(n),
      kanal:           channelToLabel(n.channel),
      kanal_raw:       n.channel,
      status:          notifStatusToLabel(n.status),
      status_raw:      n.status,
      amne:            n.subject ?? '—',
      skickad_av:      skickadAv,
      skickad_till:    skickadTill,
      typ:             templateKeyToLabel(n.template_key),
      // Detail-view fields — the table itself only shows the seven fields
      // above (unchanged); these are additive, for the row's detail card.
      mottagartyp:     recipientTypeLabel(n.recipient_type),
      schemalagd_till: n.scheduled_for,
      skickat:         n.sent_at,
      misslyckades:    n.failed_at,
      misslyckande_orsak: n.failure_reason,
      relaterat_objekt: n.reference_type,
      relaterat_id:     n.reference_id,
    };
  });

  return pagedResp(ctx, logs, total, page, per_page);
}

// ─── Handler: Activity logs ───────────────────────────────────────────────────

async function handleActivities(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:booking:read');
  if (guard) return guard;

  const raw    = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = ActivitiesQuerySchema.safeParse(raw);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Invalid query', parsed.error.issues);

  const { page, per_page, entity_type, date_from, date_to } = parsed.data;
  const fromIdx = (page - 1) * per_page, toIdx = fromIdx + per_page - 1;

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  // eslint-disable-next-line prefer-const
  let q = (client as any)
    .from('activity_logs')
    .select('id, occurred_at, user_id, user_email, action, description, entity_type, entity_id', { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .order('occurred_at', { ascending: false })
    .range(fromIdx, toIdx);

  if (entity_type) q = q.eq('entity_type', entity_type);
  if (date_from)   q = q.gte('occurred_at', date_from);
  if (date_to)     q = q.lt('occurred_at', `${date_to}T23:59:59.999Z`);

  const { data: logs, count, error } = await q;

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
    typ:         l.description ?? activityActionLabel(l.action),
    entity_type: l.entity_type,
    entity_id:   l.entity_id,
    modul:       activityEntityLabel(l.entity_type),
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
    .select(`id, starts_at, ends_at, no_show_marked_at,
             students ( first_name, last_name ),
             instructors ( first_name, last_name ),
             lesson_types ( name ),
             vehicles ( registration_number ),
             organization_locations ( name )`, { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'no_show')
    .is('deleted_at', null)
    // starts_at is a real column with no per-row conditional logic (every
    // row here already has status='no_show'), so DB-level ordering +
    // .range() pagination is already correct — unlike Bokningsloggar/
    // Kommunikationsloggar, no fetch-all/sort-in-memory workaround is
    // needed. starts_at is also the authoritative event timestamp: the
    // missed-training event is the scheduled lesson itself not happening,
    // not the later administrative act of marking it (no_show_marked_at),
    // which is surfaced separately in the detail card instead.
    .order('starts_at', { ascending: false })
    .range(fromIdx, toIdx);

  if (instructor_id)  q = q.eq('instructor_id',   instructor_id);
  if (lesson_type_id) q = q.eq('lesson_type_id',  lesson_type_id);

  const { data, count, error } = await q;
  if (error) return errorResp(ctx, 500, 'DB_ERROR', error.message);

  const result = (data ?? []).map((b: {
    id: string; starts_at: string; ends_at: string; no_show_marked_at: string | null;
    students: NameRow | null; instructors: NameRow | null; lesson_types: LessonTypeRow | null;
    vehicles: { registration_number: string } | null;
    organization_locations: { name: string } | null;
  }) => ({
    id:                b.id,
    kund:              fullName(b.students),
    larare:            fullName(b.instructors),
    tidslucka:         b.lesson_types?.name ?? '—',
    datum:             b.starts_at,
    bokning_id:        b.id,
    // Detail-view fields — the table itself shows the four fields above
    // (unchanged shape), these are additive, for the row's detail card only.
    tillfalle:         buildTillfalle(b.lesson_types?.name ?? '', b.starts_at, b.ends_at),
    no_show_marked_at: b.no_show_marked_at,
    fordon:            b.vehicles?.registration_number ?? null,
    plats:             b.organization_locations?.name ?? null,
  }));

  return pagedResp(ctx, result, count ?? 0, page, per_page);
}

// ─── Handler: Missed exam moments ────────────────────────────────────────────

function examCategoryLabel(category: string | undefined): string {
  if (category === 'risk1')      return 'Riskutbildning 1';
  if (category === 'risk2')      return 'Riskutbildning 2';
  if (category === 'assessment') return 'Bedömning';
  return category ?? '—';
}

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
  //
  // status must be exactly 'no_show' — this endpoint's own name is "missed
  // examination moments", and its sibling handleMissedTraining already
  // establishes status='no_show' as this codebase's actual definition of
  // "missed" for lesson_bookings. The previous
  // .in('status', ['confirmed','completed','no_show']) included upcoming
  // (confirmed) and successfully-completed exam bookings alongside genuine
  // no-shows, which doesn't match "missed" under any reading — a real
  // functional bug, not a design choice, corrected here rather than
  // preserved.
  //
  // starts_at is a real column (every row already has status='no_show'
  // after the fix above), so DB-level ordering + .range() pagination is
  // already correct — same reasoning as handleMissedTraining.
  // eslint-disable-next-line prefer-const
  let q = (client as any)
    .from('lesson_bookings')
    .select(`id, starts_at, ends_at, lesson_type_id, no_show_marked_at,
             students ( first_name, last_name ),
             instructors ( first_name, last_name ),
             vehicles ( registration_number ),
             organization_locations ( name )`, { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .in('lesson_type_id', examTypeIds)
    .eq('status', 'no_show')
    .is('deleted_at', null)
    .order('starts_at', { ascending: false })
    .range(fromIdx, toIdx);

  if (instructor_id) q = q.eq('instructor_id', instructor_id);

  const { data, count, error } = await q;
  if (error) return errorResp(ctx, 500, 'DB_ERROR', error.message);

  const result = (data ?? []).map((b: {
    id: string; starts_at: string; ends_at: string; lesson_type_id: string;
    no_show_marked_at: string | null;
    students: NameRow | null; instructors: NameRow | null;
    vehicles: { registration_number: string } | null;
    organization_locations: { name: string } | null;
  }) => {
    const lt = examTypeMap.get(b.lesson_type_id);
    return {
      id:                b.id,
      kund:              fullName(b.students),
      larare:            fullName(b.instructors),
      tidslucka:         lt?.name ?? '—',
      datum:             b.starts_at,
      typ:               examCategoryLabel(lt?.category),
      bokning_id:        b.id,
      // Detail-view fields — the table itself shows the six fields above
      // (unchanged shape), these are additive, for the row's detail card.
      tillfalle:         buildTillfalle(lt?.name ?? '', b.starts_at, b.ends_at),
      no_show_marked_at: b.no_show_marked_at,
      fordon:            b.vehicles?.registration_number ?? null,
      plats:             b.organization_locations?.name ?? null,
    };
  });

  return pagedResp(ctx, result, count ?? 0, page, per_page);
}

// ─── Handler: Ändringslogg (tenant audit log) ────────────────────────────────
//
// audit_logs has RLS enabled with zero policies, so it is unreadable via the
// forwarded-JWT ('authenticated') client used by every other handler in this
// file. Reads go through a service-role client instead — tenant scope is
// enforced here, server-side, via ctx.organizationId. The caller can never
// supply or override the organization filter. Presentation strings (handelse,
// modul) are built here, same as buildHandelse()/buildTillfalle() above, so
// the frontend just renders ready Swedish text like every other Loggar tab.

async function handleAuditLog(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'administration:audit:read');
  if (guard) return guard;

  const raw    = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = AuditLogQuerySchema.safeParse(raw);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Invalid query', parsed.error.issues);

  const { page, per_page, actor_email, entity_type, operation, date_from, date_to } = parsed.data;
  const fromIdx = (page - 1) * per_page, toIdx = fromIdx + per_page - 1;

  const client = createSupabaseClient(req, true, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  // eslint-disable-next-line prefer-const
  let q = (client as any)
    .from('audit_logs')
    .select(
      'id, actor_id, actor_email, entity_type, entity_id, operation, table_name, old_values, new_values, changed_fields, occurred_at',
      { count: 'exact' },
    )
    .eq('organization_id', ctx.organizationId)
    .order('occurred_at', { ascending: false })
    .range(fromIdx, toIdx);

  if (actor_email) q = q.ilike('actor_email', `%${actor_email}%`);
  if (entity_type) q = q.eq('entity_type', entity_type);
  if (operation)   q = q.eq('operation', operation);
  if (date_from)   q = q.gte('occurred_at', date_from);
  if (date_to)     q = q.lt('occurred_at', `${date_to}T23:59:59.999Z`);

  const { data, count, error } = await q;
  if (error) return errorResp(ctx, 500, 'DB_ERROR', error.message);

  const result = (data ?? []).map((row: {
    id: string; actor_id: string | null; actor_email: string | null;
    entity_type: string; entity_id: string | null; operation: string; table_name: string | null;
    old_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null;
    changed_fields: string[] | null; occurred_at: string;
  }) => ({
    id:             row.id,
    datum:          row.occurred_at,
    handelse:       buildAuditHandelse(row.operation, row.entity_type, row.actor_email),
    anvandare:      row.actor_email ?? '—',
    modul:          auditEntityLabel(row.entity_type),
    operation:      row.operation,
    entity_id:      row.entity_id,
    changed_fields: row.changed_fields,
    old_values:     row.old_values,
    new_values:     row.new_values,
  }));

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
    else if (req.method === 'GET' && sub === 'audit')           { response = await handleAuditLog(req, ctx); }
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
