/**
 * dunning — Dunning schedule configuration and overdue invoice state.
 *
 * Routes:
 *   GET  /dunning/schedules          — list dunning schedules
 *   POST /dunning/schedules          — create schedule
 *   GET  /dunning/schedules/:id      — get schedule with stages
 *   POST /dunning/schedules/:id/stages — add stage
 *   GET  /dunning/state              — list active dunning states
 *   GET  /dunning/state/:invoiceId   — get state for one invoice
 *   POST /dunning/state/:invoiceId/advance  — manually advance to next stage
 *   POST /dunning/state/:invoiceId/resolve  — mark as resolved
 *   GET  /dunning/reminders/:invoiceId     — get reminder history
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext, type EdgeRequestContext } from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { buildErrorResponse } from '../_shared/errors.ts';

const JSON_CT = { 'Content-Type': 'application/json' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(ctx: EdgeRequestContext, message: string, status: number, code: string): Response {
  return buildErrorResponse(ctx, status, code, message);
}

Deno.serve((req: Request) => serveCors(req, async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const authHeader  = req.headers.get('Authorization') ?? '';

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const ctxResult = await buildEdgeContext(req);
  if (!ctxResult.ok) return ctxResult.response;
  const ctx = ctxResult.ctx;

  const ipGuard = enforceIpRateLimit(req, 'ip_auth', ctx.correlationId);
  if (ipGuard) return ipGuard;
  if (req.method !== 'GET') {
    const writeGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'user_write', ctx.correlationId);
    if (writeGuard) return writeGuard;
  }

  const orgId = ctx.organizationId;
  if (orgId === null) return err(ctx, 'No organization context', 400, 'NO_ORG_CONTEXT');

  if (!ctx.permissions.includes('finance:dunning:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'dunning');
  const section  = segments[fnIdx + 1] ?? '';
  const id       = segments[fnIdx + 2] ?? '';
  const action   = segments[fnIdx + 3] ?? '';
  const method   = req.method;

  // ─── /dunning/schedules ───────────────────────────────────────────────────

  if (section === 'schedules') {
    if (!UUID_RE.test(id)) {
      if (method === 'GET') {
        const { data, error: qErr } = await client
          .from('dunning_schedules')
          .select('*')
          .eq('organization_id', orgId)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true });
        if (qErr) return err(ctx, qErr.message, 500, 'QUERY_FAILED');
        return json({ data: data ?? [] });
      }
      if (method === 'POST') {
        let body: Record<string, unknown>;
        try { body = await req.json(); } catch { return err(ctx, 'Invalid JSON body', 400, 'VALIDATION_ERROR'); }
        if (!body['name']) return err(ctx, 'name is required', 400, 'VALIDATION_ERROR');
        const { data: sched, error: iErr } = await client
          .from('dunning_schedules')
          .insert({
            organization_id: orgId,
            name:        body['name'],
            description: body['description'] ?? null,
            is_default:  body['is_default']  ?? false,
            is_active:   body['is_active']   ?? true,
            created_by:  ctx.actorId,
          })
          .select('*')
          .single();
        if (iErr) return err(ctx, iErr.message, 500, 'INSERT_FAILED');
        return json(sched, 201);
      }
      return err(ctx, 'Method not allowed', 405, 'METHOD_NOT_ALLOWED');
    }

    // With schedule ID
    if (action === 'stages') {
      if (method === 'GET') {
        const { data, error: qErr } = await client
          .from('dunning_schedule_stages')
          .select('*')
          .eq('schedule_id', id)
          .order('stage_number', { ascending: true });
        if (qErr) return err(ctx, qErr.message, 500, 'QUERY_FAILED');
        return json({ data: data ?? [] });
      }
      if (method === 'POST') {
        let body: Record<string, unknown>;
        try { body = await req.json(); } catch { return err(ctx, 'Invalid JSON body', 400, 'VALIDATION_ERROR'); }
        const { stage_number, days_overdue, action_type } = body;
        if (stage_number === undefined || days_overdue === undefined || !action_type) {
          return err(ctx, 'stage_number, days_overdue, action_type are required', 400, 'VALIDATION_ERROR');
        }
        const { data: stage, error: iErr } = await client
          .from('dunning_schedule_stages')
          .insert({
            schedule_id:      id,
            stage_number:     Number(stage_number),
            days_overdue:     Number(days_overdue),
            action_type,
            subject_template: body['subject_template'] ?? null,
            message_template: body['message_template'] ?? null,
            late_fee_amount:  Number(body['late_fee_amount'] ?? 0),
            suspend_access:   body['suspend_access']   ?? false,
            is_final_stage:   body['is_final_stage']   ?? false,
          })
          .select('*')
          .single();
        if (iErr) return err(ctx, iErr.message, 500, 'INSERT_FAILED');
        return json(stage, 201);
      }
      return err(ctx, 'Method not allowed', 405, 'METHOD_NOT_ALLOWED');
    }

    if (method === 'GET') {
      const { data: sched, error: qErr } = await client
        .from('dunning_schedules')
        .select('*')
        .eq('id', id)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (qErr) return err(ctx, qErr.message, 500, 'QUERY_FAILED');
      if (sched === null) return err(ctx, 'Schedule not found', 404, 'NOT_FOUND');
      const { data: stages } = await client
        .from('dunning_schedule_stages')
        .select('*')
        .eq('schedule_id', id)
        .order('stage_number', { ascending: true });
      return json({ ...sched, stages: stages ?? [] });
    }

    return err(ctx, 'Method not allowed', 405, 'METHOD_NOT_ALLOWED');
  }

  // ─── /dunning/state ───────────────────────────────────────────────────────

  if (section === 'state') {
    if (!UUID_RE.test(id)) {
      if (method !== 'GET') return err(ctx, 'Method not allowed', 405, 'METHOD_NOT_ALLOWED');
      const { data, error: qErr } = await client
        .from('invoice_dunning_state')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_resolved', false)
        .order('next_action_at', { ascending: true });
      if (qErr) return err(ctx, qErr.message, 500, 'QUERY_FAILED');
      return json({ data: data ?? [] });
    }

    if (action === 'advance' && method === 'POST') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: rpcErr } = await (client as any).rpc('advance_dunning_stage', {
        p_invoice_id: id,
        p_actor_id:   ctx.actorId,
      });
      if (rpcErr) {
        const msg = rpcErr.message as string;
        if (msg.includes('DUNNING_STATE_NOT_FOUND')) return err(ctx, 'No dunning state for invoice', 404, 'NOT_FOUND');
        if (msg.includes('DUNNING_RESOLVED'))        return err(ctx, 'Dunning is already resolved', 409, 'RESOLVED');
        if (msg.includes('NO_NEXT_STAGE'))           return err(ctx, 'No further stages in schedule', 422, 'NO_NEXT_STAGE');
        return err(ctx, msg, 422, 'ADVANCE_FAILED');
      }
      return json({ invoice_id: id, advanced: true });
    }

    if (action === 'resolve' && method === 'POST') {
      const { error: uErr } = await client
        .from('invoice_dunning_state')
        .update({ is_resolved: true, updated_at: new Date().toISOString() })
        .eq('invoice_id', id)
        .eq('organization_id', orgId);
      if (uErr) return err(ctx, uErr.message, 500, 'UPDATE_FAILED');
      return json({ invoice_id: id, is_resolved: true });
    }

    if (method === 'GET') {
      const { data, error: qErr } = await client
        .from('invoice_dunning_state')
        .select('*')
        .eq('invoice_id', id)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (qErr) return err(ctx, qErr.message, 500, 'QUERY_FAILED');
      if (data === null) return err(ctx, 'Dunning state not found', 404, 'NOT_FOUND');
      return json(data);
    }

    return err(ctx, 'Method not allowed', 405, 'METHOD_NOT_ALLOWED');
  }

  // ─── /dunning/reminders/:invoiceId ───────────────────────────────────────

  if (section === 'reminders' && UUID_RE.test(id) && method === 'GET') {
    const { data, error: qErr } = await client
      .from('invoice_reminder_log')
      .select('*')
      .eq('organization_id', orgId)
      .eq('invoice_id', id)
      .order('sent_at', { ascending: false });
    if (qErr) return err(ctx, qErr.message, 500, 'QUERY_FAILED');
    return json({ data: data ?? [] });
  }

  return err(ctx, 'Route not found', 404, 'NOT_FOUND');
}));
