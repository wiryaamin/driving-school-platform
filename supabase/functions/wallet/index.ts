/**
 * wallet — Student credit balance and ledger history.
 *
 * Routes:
 *   GET  /wallet?student_id=         — get wallet summary (per-category balances)
 *   GET  /wallet/ledger?student_id=  — get full credit ledger history
 *   POST /wallet/grant               — admin: grant bonus credits
 */

import { serveCors }            from '../_shared/cors.ts';
import { buildEdgeContext }     from '../_shared/context.ts';
import { createSupabaseClient }  from '../_shared/supabase.ts';
import { createFunctionLogger }  from '../_shared/logger.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';

const log     = createFunctionLogger('wallet');
const JSON_CT = { 'Content-Type': 'application/json' } as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok<T>(ctx: EdgeRequestContext, body: T, status = 200): Response {
  return new Response(JSON.stringify({ data: body }), {
    status,
    headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId },
  });
}

function fail(ctx: EdgeRequestContext, status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message, trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }), {
    status,
    headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId },
  });
}

function requirePerm(ctx: EdgeRequestContext, code: string): Response | null {
  if (ctx.organizationId === null) return fail(ctx, 403, 'FORBIDDEN', 'Organisation context is required');
  if (ctx.isPlatformAdmin) return null;
  if (!ctx.permissions.includes(code)) return fail(ctx, 403, 'FORBIDDEN', `Requires permission: ${code}`);
  return null;
}

function extractAction(req: Request): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'wallet');
  return segments[fnIdx + 1] ?? null;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetWallet(req: Request, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:wallet:read');
  if (guard) return guard;

  const studentId = new URL(req.url).searchParams.get('student_id');
  if (studentId === null || !UUID_RE.test(studentId)) {
    return fail(ctx, 422, 'VALIDATION_ERROR', 'student_id query param is required and must be a UUID');
  }

  const { data, error } = await client
    .from('credit_balance_cache')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .eq('student_id', studentId)
    .order('lesson_category', { ascending: true });

  if (error) {
    log.error('wallet.get_failed', { correlation_id: ctx.correlationId, error: error.message, student_id: studentId });
    return fail(ctx, 500, 'INTERNAL_ERROR', 'Failed to fetch wallet');
  }

  const balances = (data ?? []) as Array<{ lesson_category: string; balance: number }>;

  return ok(ctx, {
    student_id:    studentId,
    balances,
    total_credits: balances.reduce((s, b) => s + b.balance, 0),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetLedger(req: Request, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:wallet:read');
  if (guard) return guard;

  const url       = new URL(req.url);
  const studentId = url.searchParams.get('student_id');
  if (studentId === null || !UUID_RE.test(studentId)) {
    return fail(ctx, 422, 'VALIDATION_ERROR', 'student_id query param is required and must be a UUID');
  }

  const page    = Math.max(1, Number(url.searchParams.get('page')     ?? '1'));
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get('per_page') ?? '50')));
  const from    = (page - 1) * perPage;
  const to      = from + perPage - 1;

  const category  = url.searchParams.get('lesson_category');
  const entryType = url.searchParams.get('entry_type');
  const dateFrom  = url.searchParams.get('from');
  const dateTo    = url.searchParams.get('to');

  // eslint-disable-next-line prefer-const
  let q = client
    .from('credit_ledger')
    .select('*', { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (category  !== null) q = q.eq('lesson_category', category);
  if (entryType !== null) q = q.eq('entry_type',      entryType);
  if (dateFrom  !== null) q = q.gte('created_at',     dateFrom);
  if (dateTo    !== null) q = q.lte('created_at',     dateTo);

  const { data, error, count } = await q;
  if (error) {
    log.error('wallet.ledger_failed', { correlation_id: ctx.correlationId, error: error.message, student_id: studentId });
    return fail(ctx, 500, 'INTERNAL_ERROR', 'Failed to fetch credit ledger');
  }

  return new Response(
    JSON.stringify({ data: data ?? [], meta: { page, per_page: perPage, total: count ?? 0, has_more: page * perPage < (count ?? 0) } }),
    { status: 200, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } }
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGrantBonus(req: Request, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:wallet:manage');
  if (guard) return guard;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return fail(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  const { student_id, lesson_category, quantity } = body;
  if (!student_id || !lesson_category || !quantity) {
    return fail(ctx, 422, 'VALIDATION_ERROR', 'student_id, lesson_category, quantity are required');
  }

  const { data, error } = await client
    .from('credit_ledger')
    .insert({
      organization_id: ctx.organizationId,
      student_id,
      lesson_category,
      entry_type:      'bonus',
      quantity:        Number(quantity),
      currency:        'SEK',
      reference_type:  'admin_adjust',
      description:     (body['description'] as string | undefined) ?? 'Manual bonus credit grant',
      actor_id:        ctx.actorId,
      expires_at:      body['expires_at'] ?? null,
      metadata:        body['metadata']   ?? {},
    })
    .select()
    .single();

  if (error) {
    log.error('wallet.grant_failed', { correlation_id: ctx.correlationId, error: error.message });
    return fail(ctx, 422, 'INTERNAL_ERROR', 'Failed to grant credits');
  }

  log.info('Wallet.BonusGranted', {
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId,
    student_id,
    quantity,
    actor_id:       ctx.actorId,
  });

  return ok(ctx, data, 201);
}

// ─── Router ───────────────────────────────────────────────────────────────────

Deno.serve((req: Request) => serveCors(req, async () => {
  const ctxResult = await buildEdgeContext(req);
  if (!ctxResult.ok) return ctxResult.response;
  const ctx = ctxResult.ctx;

  const ipGuard = enforceIpRateLimit(req, 'ip_auth', ctx.correlationId);
  if (ipGuard) return ipGuard;
  if (req.method !== 'GET') {
    const writeGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'user_write', ctx.correlationId);
    if (writeGuard) return writeGuard;
  }

  log.requestStarted(req, ctx.correlationId, ctx.organizationId, ctx.actorId);

  const action = extractAction(req);
  const method = req.method;
  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });

  let response: Response;

  try {
    if (action === 'ledger' && method === 'GET')  { response = await handleGetLedger(req, ctx, client); }
    else if (action === 'grant'  && method === 'POST') { response = await handleGrantBonus(req, ctx, client); }
    else if (action === null     && method === 'GET')  { response = await handleGetWallet(req, ctx, client); }
    else { response = fail(ctx, 404, 'NOT_FOUND', 'Route not found'); }
  } catch (err) {
    log.error('wallet.unhandled_error', {
      correlation_id: ctx.correlationId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack   : undefined,
    });
    response = fail(ctx, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }

  log.requestCompleted(req, response.status, ctx.correlationId, ctx.startedAt);
  return response;
}));
