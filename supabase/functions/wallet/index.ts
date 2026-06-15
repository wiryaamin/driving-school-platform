/**
 * wallet — Student credit balance and ledger history.
 *
 * Routes:
 *   GET  /wallet?student_id=         — get wallet summary (per-category balances)
 *   GET  /wallet/ledger?student_id=  — get full credit ledger history
 *   POST /wallet/grant               — admin: grant bonus credits
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveCors } from '../_shared/cors.ts';
import { enrichUserFromJwt, getOrgIdFromBearer } from '../_shared/jwt.ts';

const JSON_CT = { 'Content-Type': 'application/json' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(message: string, status: number, code?: string): Response {
  return json({ error: message, ...(code !== undefined && { code }) }, status);
}
function getOrgId(user: { app_metadata?: Record<string, unknown> }): string | null {
  return (user.app_metadata?.['organization_id'] as string | undefined) ?? null;
}
function hasPermission(user: { app_metadata?: Record<string, unknown> }, perm: string): boolean {
  const perms = (user.app_metadata?.['permissions'] as string[] | undefined) ?? [];
  return perms.includes(perm);
}
function extractAction(req: Request): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'wallet');
  return segments[fnIdx + 1] ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetWallet(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:wallet:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const studentId = new URL(req.url).searchParams.get('student_id');
  if (studentId === null || !UUID_RE.test(studentId)) {
    return err('student_id query param is required', 400, 'VALIDATION_ERROR');
  }

  const { data, error } = await client
    .from('credit_balance_cache')
    .select('*')
    .eq('organization_id', orgId)
    .eq('student_id', studentId)
    .order('lesson_category', { ascending: true });

  if (error) return err(error.message, 500, 'QUERY_FAILED');

  const balances = (data ?? []) as Array<{
    lesson_category: string;
    balance: number;
  }>;

  return json({
    student_id:    studentId,
    balances,
    total_credits: balances.reduce((s, b) => s + b.balance, 0),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetLedger(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:wallet:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const url       = new URL(req.url);
  const studentId = url.searchParams.get('student_id');
  if (studentId === null || !UUID_RE.test(studentId)) {
    return err('student_id query param is required', 400, 'VALIDATION_ERROR');
  }

  const page     = Number(url.searchParams.get('page')     ?? '1');
  const perPage  = Number(url.searchParams.get('per_page') ?? '50');
  const from     = (page - 1) * perPage;
  const to       = from + perPage - 1;
  const category = url.searchParams.get('lesson_category');
  const entryType = url.searchParams.get('entry_type');

  // eslint-disable-next-line prefer-const
  let q = client
    .from('credit_ledger')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (category  !== null) q = q.eq('lesson_category', category);
  if (entryType !== null) q = q.eq('entry_type',      entryType);

  const dateFrom = url.searchParams.get('from');
  const dateTo   = url.searchParams.get('to');
  if (dateFrom !== null) q = q.gte('created_at', dateFrom);
  if (dateTo   !== null) q = q.lte('created_at', dateTo);

  const { data, error, count } = await q;
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({
    data: data ?? [],
    meta: { page, per_page: perPage, total: count ?? 0 },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGrantBonus(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:wallet:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const { student_id, lesson_category, quantity } = body;
  if (!student_id || !lesson_category || !quantity) {
    return err('student_id, lesson_category, quantity are required', 400, 'VALIDATION_ERROR');
  }

  const { data, error } = await client
    .from('credit_ledger')
    .insert({
      organization_id: orgId,
      student_id,
      lesson_category,
      entry_type:      'bonus',
      quantity:        Number(quantity),
      currency:        'SEK',
      reference_type:  'admin_adjust',
      description:     (body['description'] as string | undefined) ?? 'Manual bonus credit grant',
      actor_id:        user.id,
      expires_at:      body['expires_at'] ?? null,
      metadata:        body['metadata']   ?? {},
    })
    .select()
    .single();

  if (error) return err(error.message, 422, 'INSERT_FAILED');
  return json(data, 201);
}

Deno.serve((req: Request) => serveCors(req, async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const authHeader  = req.headers.get('Authorization') ?? '';

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user: rawUser }, error: authErr } = await client.auth.getUser();
  if (authErr !== null || rawUser === null) return err('Unauthorized', 401, 'UNAUTHORIZED');
  const user = enrichUserFromJwt(req, rawUser);

  const orgId = getOrgId(user) ?? getOrgIdFromBearer(req);
  if (orgId === null) return err('No organization context', 400, 'NO_ORG_CONTEXT');

  const action = extractAction(req);
  const method = req.method;

  if (action === 'ledger' && method === 'GET')  return handleGetLedger(req, client, orgId, user);
  if (action === 'grant'  && method === 'POST') return handleGrantBonus(req, client, orgId, user);

  if (action === null && method === 'GET') return handleGetWallet(req, client, orgId, user);

  return err('Not found', 404);
}));
