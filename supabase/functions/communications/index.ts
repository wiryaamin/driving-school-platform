/**
 * communications — Unified multi-channel communication engine.
 *
 * Routes:
 *   GET    /communications                     — list outbound_messages (paginated)
 *   POST   /communications/send                — send or schedule a message
 *   PATCH  /communications/:id/retry           — manually retry a failed message
 *   PATCH  /communications/:id/cancel          — cancel a queued message
 *
 *   GET    /communications/channels            — list channel configs
 *   PUT    /communications/channels/:channel   — upsert channel config (admin only)
 *
 *   GET    /communications/templates           — list active notification templates
 *   POST   /communications/templates           — create org-specific template
 *   PATCH  /communications/templates/:id       — update org-specific template
 *   DELETE /communications/templates/:id       — deactivate org-specific template
 *
 *   GET    /communications/rules               — list notification rules
 *   POST   /communications/rules               — create notification rule
 *   PATCH  /communications/rules/:id           — update rule (enable/disable, template)
 *   DELETE /communications/rules/:id           — delete rule
 *
 * Authorization:
 *   All routes require a valid JWT with organization_id + sub claims (via auth hook).
 *   Write operations on channels and templates additionally require admin/manager/owner role.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveCors }            from '../_shared/cors.ts';
import { getOrgIdFromBearer, getUserIdFromBearer, getRoleFromBearer } from '../_shared/jwt.ts';
import { dispatchMessage }      from '../_shared/comm-providers.ts';
import { applyTemplateVars }    from '../_shared/template-utils.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNELS   = ['email', 'sms', 'whatsapp', 'push', 'voice'] as const;
const STATUSES   = ['queued', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'cancelled'] as const;
const ADMIN_ROLES = new Set(['admin', 'manager', 'owner']);

type Channel = typeof CHANNELS[number];
type Status  = typeof STATUSES[number];

// ─── Response helpers ─────────────────────────────────────────────────────────

const JSON_CT = { 'Content-Type': 'application/json' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}

function err(message: string, status: number, code?: string): Response {
  return json({ error: message, ...(code !== undefined && { code }) }, status);
}

// ─── URL routing ──────────────────────────────────────────────────────────────

type PathParts = { id: string | null; action: string | null; sub: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractPath(req: Request): PathParts {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'communications');
  const after    = segments.slice(fnIdx + 1);
  if (after.length === 0) return { id: null, action: null, sub: null };

  const first  = after[0] ?? '';
  const second = after[1] ?? null;

  // /channels (list) or /channels/:name (upsert)
  if (first === 'channels') return { id: null, action: 'channels', sub: second };

  // /templates or /templates/:uuid
  if (first === 'templates') {
    return { id: second && UUID_RE.test(second) ? second : null, action: 'templates', sub: null };
  }

  // /rules or /rules/:uuid
  if (first === 'rules') {
    return { id: second && UUID_RE.test(second) ? second : null, action: 'rules', sub: null };
  }

  // /send
  if (first === 'send') return { id: null, action: 'send', sub: null };

  // /analytics, /queue-health, /bulk-retry
  if (first === 'analytics')    return { id: null, action: 'analytics',    sub: null };
  if (first === 'queue-health') return { id: null, action: 'queue-health', sub: null };
  if (first === 'bulk-retry')   return { id: null, action: 'bulk-retry',   sub: null };

  // /:uuid/(retry|cancel)
  if (UUID_RE.test(first)) return { id: first, action: second, sub: null };

  return { id: null, action: null, sub: null };
}

// ─── Daily limit check ────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function isDailyLimitExceeded(supabase: any, orgId: string, channel: string, limit: number): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('outbound_messages')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('channel', channel)
    .not('status', 'in', '("cancelled")')
    .gte('created_at', todayStart.toISOString());

  return (count ?? 0) >= limit;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve((req: Request) => serveCors(req, async () => {

  const orgId  = getOrgIdFromBearer(req);
  const userId = getUserIdFromBearer(req);

  if (!orgId || !userId) {
    return err('Unauthorized — missing organization context', 401, 'UNAUTHORIZED');
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { method } = req;
  const { id, action, sub } = extractPath(req);
  const sp = new URL(req.url).searchParams;

  try {

    // ══════════════════════════════════════════════════════════════════════════
    // CHANNEL CONFIG
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'channels' && !sub) {
      if (method !== 'GET') return err('Method not allowed', 405);
      const { data, error } = await supabase
        .from('channel_configs')
        .select('*')
        .eq('organization_id', orgId)
        .order('channel');
      if (error) throw error;
      return json({ data: data ?? [] });
    }

    if (action === 'channels' && sub) {
      if (method !== 'PUT') return err('Method not allowed', 405);
      const role = getRoleFromBearer(req);
      if (!ADMIN_ROLES.has(role ?? '')) {
        return err('Forbidden — requires admin, manager, or owner role', 403, 'FORBIDDEN');
      }
      const channel = sub as Channel;
      if (!CHANNELS.includes(channel)) return err('Invalid channel', 400, 'INVALID_CHANNEL');

      const body = await req.json() as {
        enabled?:      boolean;
        provider?:     string | null;
        from_address?: string | null;
        display_name?: string | null;
        daily_limit?:  number;
      };

      const { data, error } = await supabase
        .from('channel_configs')
        .upsert({
          organization_id: orgId,
          channel,
          enabled:      body.enabled      ?? false,
          provider:     body.provider     ?? null,
          from_address: body.from_address ?? null,
          display_name: body.display_name ?? null,
          daily_limit:  body.daily_limit  ?? 500,
          updated_at:   new Date().toISOString(),
        }, { onConflict: 'organization_id,channel' })
        .select()
        .single();
      if (error) throw error;
      return json({ data });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // NOTIFICATION TEMPLATES
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'templates' && !id) {
      if (method === 'GET') {
        const channel = sp.get('channel');
        let q = supabase
          .from('notification_templates')
          .select('id, organization_id, key, locale, channel, subject, body_text, body_html, variables, is_active')
          .eq('is_active', true)
          .or(`organization_id.eq.${orgId},organization_id.is.null`)
          .order('key');
        if (channel) q = q.eq('channel', channel);
        const { data, error } = await q;
        if (error) throw error;
        return json({ data: data ?? [] });
      }

      if (method === 'POST') {
        const role = getRoleFromBearer(req);
        if (!ADMIN_ROLES.has(role ?? '')) return err('Forbidden', 403, 'FORBIDDEN');

        const body = await req.json() as {
          key:        string;
          locale?:    string;
          channel:    string;
          subject?:   string | null;
          body_text:  string;
          body_html?: string | null;
          variables?: string[];
        };
        if (!body.key?.trim())       return err('key is required', 400);
        if (!body.channel?.trim())   return err('channel is required', 400);
        if (!body.body_text?.trim()) return err('body_text is required', 400);

        const { data, error } = await supabase
          .from('notification_templates')
          .insert({
            organization_id: orgId,
            key:       body.key.trim(),
            locale:    body.locale ?? 'sv',
            channel:   body.channel,
            subject:   body.subject ?? null,
            body_text: body.body_text.trim(),
            body_html: body.body_html ?? null,
            variables: body.variables ?? [],
            is_active: true,
          })
          .select()
          .single();
        if (error) throw error;
        return json({ data }, 201);
      }

      return err('Method not allowed', 405);
    }

    if (action === 'templates' && id) {
      if (method === 'PATCH') {
        const role = getRoleFromBearer(req);
        if (!ADMIN_ROLES.has(role ?? '')) return err('Forbidden', 403, 'FORBIDDEN');

        const body = await req.json() as {
          subject?:   string | null;
          body_text?: string;
          body_html?: string | null;
          variables?: string[];
          is_active?: boolean;
        };
        const { data, error } = await supabase
          .from('notification_templates')
          .update({ ...body, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('organization_id', orgId) // prevent editing system templates
          .select()
          .single();
        if (error) throw error;
        return json({ data });
      }

      if (method === 'DELETE') {
        const role = getRoleFromBearer(req);
        if (!ADMIN_ROLES.has(role ?? '')) return err('Forbidden', 403, 'FORBIDDEN');

        const { error } = await supabase
          .from('notification_templates')
          .update({ is_active: false })
          .eq('id', id)
          .eq('organization_id', orgId); // prevent editing system templates
        if (error) throw error;
        return json({ success: true });
      }

      return err('Method not allowed', 405);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // NOTIFICATION RULES
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'rules' && !id) {
      if (method === 'GET') {
        const { data, error } = await supabase
          .from('notification_rules')
          .select(`
            id, trigger_event, channel, recipient_type, enabled, created_at,
            template:template_id(id, key, locale, channel)
          `)
          .eq('organization_id', orgId)
          .order('trigger_event')
          .order('channel');
        if (error) throw error;
        return json({ data: data ?? [] });
      }

      if (method === 'POST') {
        const role = getRoleFromBearer(req);
        if (!ADMIN_ROLES.has(role ?? '')) return err('Forbidden', 403, 'FORBIDDEN');

        const body = await req.json() as {
          trigger_event:  string;
          channel:        Channel;
          template_id:    string;
          recipient_type?: 'student' | 'instructor';
          enabled?:       boolean;
        };
        if (!body.trigger_event) return err('trigger_event is required', 400);
        if (!body.channel || !CHANNELS.includes(body.channel)) return err('Invalid channel', 400);
        if (!body.template_id)   return err('template_id is required', 400);

        const { data, error } = await supabase
          .from('notification_rules')
          .insert({
            organization_id: orgId,
            trigger_event:   body.trigger_event,
            channel:         body.channel,
            template_id:     body.template_id,
            recipient_type:  body.recipient_type ?? 'student',
            enabled:         body.enabled ?? false,
          })
          .select()
          .single();
        if (error) throw error;
        return json({ data }, 201);
      }

      return err('Method not allowed', 405);
    }

    if (action === 'rules' && id) {
      if (method === 'PATCH') {
        const role = getRoleFromBearer(req);
        if (!ADMIN_ROLES.has(role ?? '')) return err('Forbidden', 403, 'FORBIDDEN');

        const body = await req.json() as {
          enabled?:       boolean;
          template_id?:   string;
          recipient_type?: 'student' | 'instructor';
        };
        const { data, error } = await supabase
          .from('notification_rules')
          .update({ ...body, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('organization_id', orgId)
          .select()
          .single();
        if (error) throw error;
        return json({ data });
      }

      if (method === 'DELETE') {
        const role = getRoleFromBearer(req);
        if (!ADMIN_ROLES.has(role ?? '')) return err('Forbidden', 403, 'FORBIDDEN');

        const { error } = await supabase
          .from('notification_rules')
          .delete()
          .eq('id', id)
          .eq('organization_id', orgId);
        if (error) throw error;
        return json({ success: true });
      }

      return err('Method not allowed', 405);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MESSAGE DISPATCH
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'send') {
      if (method !== 'POST') return err('Method not allowed', 405);

      const body = await req.json() as {
        channel:            Channel;
        recipient_type?:    'student' | 'instructor' | 'manual';
        recipient_id?:      string;
        recipient_address:  string;
        template_id?:       string;
        subject?:           string;
        body:               string;
        scheduled_at?:      string;
        variables?:         Record<string, string>;
        metadata?:          Record<string, unknown>;
      };

      if (!body.channel || !CHANNELS.includes(body.channel)) {
        return err('Invalid or missing channel', 400, 'INVALID_CHANNEL');
      }
      if (!body.recipient_address?.trim()) return err('recipient_address is required', 400, 'MISSING_RECIPIENT');
      if (!body.body?.trim())              return err('body is required', 400, 'MISSING_BODY');

      const finalBody    = body.variables ? applyTemplateVars(body.body, body.variables) : body.body.trim();
      const finalSubject = (body.subject && body.variables)
        ? applyTemplateVars(body.subject, body.variables)
        : (body.subject ?? null);

      const { data: cfg } = await supabase
        .from('channel_configs')
        .select('enabled, provider, from_address, daily_limit')
        .eq('organization_id', orgId)
        .eq('channel', body.channel)
        .maybeSingle();

      const isScheduled = !!body.scheduled_at;
      let dispatchStatus: Status = 'queued';
      let providerId: string | null = null;
      let errorMsg:   string | null = null;

      if (!isScheduled && cfg?.enabled) {
        const limitExceeded = await isDailyLimitExceeded(supabase, orgId, body.channel, cfg.daily_limit ?? 500);
        if (limitExceeded) return err(`Daily send limit reached for ${body.channel}`, 429, 'DAILY_LIMIT_EXCEEDED');

        const result = await dispatchMessage({
          channel:  body.channel,
          provider: cfg.provider ?? null,
          to:       body.recipient_address.trim(),
          from:     cfg.from_address ?? null,
          subject:  finalSubject ?? undefined,
          body:     finalBody,
        });
        dispatchStatus = result.status;
        providerId     = result.providerId;
        errorMsg       = result.error;
      }

      const { data: msg, error: insertErr } = await supabase
        .from('outbound_messages')
        .insert({
          organization_id:     orgId,
          channel:             body.channel,
          recipient_type:      body.recipient_type ?? 'manual',
          recipient_id:        body.recipient_id ?? null,
          recipient_address:   body.recipient_address.trim(),
          template_id:         body.template_id ?? null,
          subject:             finalSubject,
          body:                finalBody,
          status:              dispatchStatus,
          provider:            cfg?.provider ?? null,
          provider_message_id: providerId,
          error_message:       errorMsg,
          scheduled_at:        body.scheduled_at ?? null,
          sent_at:             dispatchStatus === 'sent' ? new Date().toISOString() : null,
          metadata:            body.metadata ?? {},
          created_by:          userId,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;
      return json({ data: msg }, 201);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MESSAGE MUTATIONS (retry / cancel)
    // ══════════════════════════════════════════════════════════════════════════

    if (id && action === 'retry') {
      if (method !== 'PATCH') return err('Method not allowed', 405);

      const { data: msg, error: fetchErr } = await supabase
        .from('outbound_messages')
        .select('*')
        .eq('id', id)
        .eq('organization_id', orgId)
        .single();
      if (fetchErr || !msg) return err('Message not found', 404, 'NOT_FOUND');
      if (msg.status !== 'failed') return err('Only failed messages can be retried', 400, 'INVALID_STATE');
      if (msg.retry_count >= msg.max_retries) return err('Max retries exceeded', 400, 'MAX_RETRIES');

      const { data: cfg } = await supabase
        .from('channel_configs')
        .select('enabled, provider, from_address')
        .eq('organization_id', orgId)
        .eq('channel', msg.channel)
        .maybeSingle();

      const result       = await dispatchMessage({
        channel:  msg.channel as Channel,
        provider: cfg?.provider ?? null,
        to:       msg.recipient_address,
        from:     cfg?.from_address ?? null,
        subject:  msg.subject ?? undefined,
        body:     msg.body,
      });

      const newRetryCount = msg.retry_count + 1;
      const backoffMs     = Math.pow(2, newRetryCount) * 60 * 1000;

      const { data: updated, error: updErr } = await supabase
        .from('outbound_messages')
        .update({
          status:              result.status,
          provider_message_id: result.providerId ?? msg.provider_message_id,
          error_message:       result.error,
          retry_count:         newRetryCount,
          retry_after:         result.status === 'failed'
            ? new Date(Date.now() + backoffMs).toISOString()
            : null,
          sent_at: result.status === 'sent' ? new Date().toISOString() : msg.sent_at,
        })
        .eq('id', id)
        .select()
        .single();
      if (updErr) throw updErr;
      return json({ data: updated });
    }

    if (id && action === 'cancel') {
      if (method !== 'PATCH') return err('Method not allowed', 405);

      const { data, error: updErr } = await supabase
        .from('outbound_messages')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .eq('organization_id', orgId)
        .in('status', ['queued'])
        .select()
        .single();
      if (updErr || !data) return err('Message not found or already dispatched', 400, 'INVALID_STATE');
      return json({ data });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ANALYTICS
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'analytics') {
      if (method !== 'GET') return err('Method not allowed', 405);

      const days  = Math.min(Math.max(1, parseInt(sp.get('days') ?? '7', 10)), 90);
      const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from('communication_daily_stats')
        .select('channel, status, stat_date, message_count')
        .eq('organization_id', orgId)
        .gte('stat_date', since);
      if (error) throw error;

      // Aggregate per channel
      const byChannel = new Map<string, { total: number; sent: number; failed: number; queued: number }>();
      for (const row of (data ?? []) as Array<{ channel: string; status: string; stat_date: string; message_count: number }>) {
        if (!byChannel.has(row.channel)) byChannel.set(row.channel, { total: 0, sent: 0, failed: 0, queued: 0 });
        const acc = byChannel.get(row.channel)!;
        acc.total += row.message_count;
        if (row.status === 'sent'  || row.status === 'delivered') acc.sent   += row.message_count;
        if (row.status === 'failed'|| row.status === 'bounced')   acc.failed += row.message_count;
        if (row.status === 'queued'|| row.status === 'sending')   acc.queued += row.message_count;
      }

      const summary = [...byChannel.entries()].map(([channel, counts]) => ({
        channel,
        ...counts,
        delivery_rate: counts.total > 0 ? Math.round((counts.sent / counts.total) * 100) : 0,
      }));

      return json({ data: summary, days });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // QUEUE HEALTH
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'queue-health') {
      if (method !== 'GET') return err('Method not allowed', 405);

      const { data, error } = await supabase
        .from('communication_queue_health')
        .select('channel, queued_count, sending_count, retryable_count, failed_total, oldest_queued_at')
        .eq('organization_id', orgId);
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        channel:          string;
        queued_count:     number;
        sending_count:    number;
        retryable_count:  number;
        failed_total:     number;
        oldest_queued_at: string | null;
      }>;

      const summary = {
        total_queued:    rows.reduce((s, r) => s + (r.queued_count ?? 0), 0),
        total_retryable: rows.reduce((s, r) => s + (r.retryable_count ?? 0), 0),
        oldest_queued_at: rows.reduce<string | null>((s, r) => {
          if (!r.oldest_queued_at) return s;
          return (!s || r.oldest_queued_at < s) ? r.oldest_queued_at : s;
        }, null),
        by_channel: rows,
      };

      return json({ data: summary });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BULK RETRY
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'bulk-retry') {
      if (method !== 'POST') return err('Method not allowed', 405);
      const role = getRoleFromBearer(req);
      if (!ADMIN_ROLES.has(role ?? '')) return err('Forbidden — requires admin role', 403, 'FORBIDDEN');

      const body = await req.json() as { channel?: string };
      const { data, error } = await supabase.rpc('bulk_retry_messages', {
        p_org_id:  orgId,
        p_channel: body.channel ?? null,
      });
      if (error) throw error;
      return json({ retried: data as number });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MESSAGE LIST
    // ══════════════════════════════════════════════════════════════════════════

    if (!action && !id) {
      if (method !== 'GET') return err('Method not allowed', 405);

      const page     = Math.max(1, parseInt(sp.get('page')     ?? '1',  10));
      const per_page = Math.min(   parseInt(sp.get('per_page') ?? '50', 10), 200);
      const channel  = sp.get('channel');
      const status   = sp.get('status');
      const from     = sp.get('from');
      const to       = sp.get('to');
      const rangeFrom = (page - 1) * per_page;
      const rangeTo   = rangeFrom + per_page - 1;

      let q = supabase
        .from('outbound_messages')
        .select('*', { count: 'exact' })
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(rangeFrom, rangeTo);

      if (channel && CHANNELS.includes(channel as Channel)) q = q.eq('channel', channel);
      if (status  && STATUSES.includes(status as Status))   q = q.eq('status', status);
      if (from)    q = q.gte('created_at', from);
      if (to)      q = q.lte('created_at', to);

      const { data, count, error } = await q;
      if (error) throw error;

      return json({
        data: data ?? [],
        meta: { total: count ?? 0, page, per_page },
      });
    }

    return err('Not found', 404, 'NOT_FOUND');

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[communications] error:', message);
    return err(message, 500, 'INTERNAL');
  }

}));
