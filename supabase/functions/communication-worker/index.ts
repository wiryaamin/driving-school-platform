/**
 * communication-worker — Scheduled dispatcher, auto-retry, and event-triggered notifications.
 *
 * Routes:
 *   POST /communication-worker           — maintenance tick (scheduled + retry queue)
 *   POST /communication-worker/notify    — trigger-based notification dispatch
 *
 * Auth:
 *   Authorization: Bearer <WORKER_SECRET>
 *   Set via: supabase secrets set WORKER_SECRET=<value> --project-ref <ref>
 *
 * Invoke maintenance tick (e.g. via pg_cron / Supabase scheduled function):
 *   POST https://<ref>.supabase.co/functions/v1/communication-worker
 *   Authorization: Bearer <WORKER_SECRET>
 *
 * Trigger-based dispatch (called by event-worker or booking integrations):
 *   POST /communication-worker/notify
 *   Body: {
 *     trigger_event:     string,           e.g. "booking_confirmed"
 *     organization_id:   string,
 *     // Template variables (all keys passed to applyTemplateVars)
 *     förnamn?:          string,
 *     datum?:            string,
 *     tid?:              string,
 *     trafikskola?:      string,
 *     // Recipient contact (provide whichever channels are needed)
 *     student_phone?:    string,
 *     student_email?:    string,
 *     instructor_phone?: string,
 *     instructor_email?: string,
 *   }
 *
 * Architecture:
 *   This worker is decoupled from all business modules.
 *   It reads notification_rules and notification_templates; it does not import
 *   booking, student, or invoice code. Callers provide contact info in the payload.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveCors }         from '../_shared/cors.ts';
import { dispatchMessage }   from '../_shared/comm-providers.ts';
import { applyTemplateVars } from '../_shared/template-utils.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = 'email' | 'sms' | 'whatsapp' | 'push' | 'voice';

interface OutboundRow {
  id:                  string;
  channel:             Channel;
  recipient_address:   string;
  subject:             string | null;
  body:                string;
  provider:            string | null;
  retry_count:         number;
  max_retries:         number;
  organization_id:     string;
}

interface ChannelConfig {
  channel:      Channel;
  enabled:      boolean;
  provider:     string | null;
  from_address: string | null;
  daily_limit:  number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JSON_CT = { 'Content-Type': 'application/json' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}

/**
 * communication-worker is a WORKER_SECRET-authenticated cron endpoint — it has
 * no user JWT and therefore no EdgeRequestContext. Correlation/request IDs are
 * generated locally per request, matching the canonical error shape (ADR-003)
 * without forcing this into the tenant-context type.
 */
function err(correlationId: string, requestId: string, message: string, status: number, code: string): Response {
  return json({ code, message, trace_id: correlationId, request_id: requestId, version: 1 }, status);
}

function isWorkerRequest(req: Request): boolean {
  const secret = Deno.env.get('WORKER_SECRET');
  if (!secret) return false;
  const auth  = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return token === secret;
}

function isNotifyPath(req: Request): boolean {
  return new URL(req.url).pathname.endsWith('/notify');
}

// ─── Channel config cache ─────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function loadChannelConfigs(supabase: any, orgId: string): Promise<Map<Channel, ChannelConfig>> {
  const { data } = await supabase
    .from('channel_configs')
    .select('channel, enabled, provider, from_address, daily_limit')
    .eq('organization_id', orgId);

  const map = new Map<Channel, ChannelConfig>();
  for (const row of data ?? []) map.set(row.channel as Channel, row);
  return map;
}

// ─── Dispatch a claimed message ───────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function dispatchClaimed(supabase: any, msg: OutboundRow, cfg: ChannelConfig | undefined) {
  const result = await dispatchMessage({
    channel:  msg.channel,
    provider: cfg?.provider ?? null,
    to:       msg.recipient_address,
    from:     cfg?.from_address ?? null,
    subject:  msg.subject ?? undefined,
    body:     msg.body,
  });

  const failed        = result.status === 'failed';
  // dispatchMessage() also returns 'queued' when the channel has no provider
  // configured yet (see its own "channel active but not yet wired" comment)
  // — that is not a delivery and must not be recorded as one. Previously
  // this function only distinguished failed/not-failed, so a still-queued
  // result was written back as status: 'sent' with sent_at set, silently
  // reporting an undelivered message as delivered.
  const stillQueued    = result.status === 'queued';
  const newRetryCount  = failed ? msg.retry_count + 1 : msg.retry_count;

  // Exponential backoff with ±20% jitter to avoid thundering-herd on retry tick
  const baseBackoffMs = Math.pow(2, newRetryCount) * 60 * 1000;
  const jitter        = 0.8 + Math.random() * 0.4;
  const backoffMs     = Math.floor(baseBackoffMs * jitter);

  await supabase
    .from('outbound_messages')
    .update({
      status:              failed ? 'failed' : stillQueued ? 'queued' : 'sent',
      provider_message_id: result.providerId,
      error_message:       result.error,
      retry_count:         newRetryCount,
      retry_after:         failed ? new Date(Date.now() + backoffMs).toISOString() : null,
      sent_at:             (failed || stillQueued) ? null : new Date().toISOString(),
    })
    .eq('id', msg.id);

  return result.status;
}

// ─── Maintenance tick ─────────────────────────────────────────────────────────
// Processes scheduled messages + auto-retry candidates.

// deno-lint-ignore no-explicit-any
async function runMaintenanceTick(supabase: any, correlationId: string, requestId: string): Promise<Response> {
  let workerRunId: string | null = null;
  try {
    const { data: runId } = await supabase.rpc('begin_worker_run', {
      p_worker_name: 'communication-worker',
      p_metadata:    {},
    });
    workerRunId = (runId as string | null) ?? null;
  } catch (runLogErr) {
    // Monitoring must never block message dispatch.
    console.warn('[comm-worker] run_log_begin_failed:', runLogErr instanceof Error ? runLogErr.message : String(runLogErr));
  }

  const completeRun = (status: string, counts: Record<string, number>, error?: string) => {
    if (!workerRunId) return Promise.resolve();
    return supabase.rpc('complete_worker_run', {
      p_run_id:            workerRunId,
      p_status:            status,
      p_processed_count:   counts.dispatched + counts.retried + counts.errors,
      p_success_count:     counts.dispatched,
      p_failed_count:      counts.errors,
      p_retry_count:       counts.retried,
      p_dead_letter_count: 0,
      p_error_summary:     error ?? null,
    }).then(undefined, () => {});
  };

  // Claim scheduled messages (uses FOR UPDATE SKIP LOCKED)
  const { data: scheduled = [], error: schedErr } = await supabase
    .rpc('claim_scheduled_messages', { max_count: 50 });

  if (schedErr) {
    console.error('[comm-worker] claim_scheduled error:', schedErr.message);
    await completeRun('failed', { dispatched: 0, retried: 0, errors: 0 }, schedErr.message);
    return err(correlationId, requestId, 'Failed to claim scheduled messages', 500, 'CLAIM_FAILED');
  }

  // Claim auto-retry candidates
  const { data: retries = [], error: retryErr } = await supabase
    .rpc('claim_retry_messages', { max_count: 20 });

  if (retryErr) {
    console.error('[comm-worker] claim_retry error:', retryErr.message);
    await completeRun('failed', { dispatched: 0, retried: 0, errors: 0 }, retryErr.message);
    return err(correlationId, requestId, 'Failed to claim retry messages', 500, 'CLAIM_FAILED');
  }

  const allMessages: OutboundRow[] = [...(scheduled as OutboundRow[]), ...(retries as OutboundRow[])];

  if (allMessages.length === 0) {
    await completeRun('completed', { dispatched: 0, retried: 0, errors: 0 });
    return json({ dispatched: 0, retried: 0, errors: 0, message: 'Queue empty' });
  }

  // Group by org to load channel configs once per org
  const orgIds = [...new Set(allMessages.map((m) => m.organization_id))];
  const cfgsByOrg = new Map<string, Map<Channel, ChannelConfig>>();
  for (const orgId of orgIds) {
    cfgsByOrg.set(orgId, await loadChannelConfigs(supabase, orgId));
  }

  let dispatched = 0;
  let errors = 0;

  for (const msg of allMessages) {
    const cfgs = cfgsByOrg.get(msg.organization_id);
    const cfg  = cfgs?.get(msg.channel);

    const status = await dispatchClaimed(supabase, msg, cfg);
    if (status === 'sent') dispatched++;
    else errors++;
  }

  const retried = (retries as OutboundRow[]).length;
  console.log(`[comm-worker] tick done: dispatched=${dispatched} retried=${retried} errors=${errors}`);

  await completeRun(errors === 0 ? 'completed' : dispatched > 0 ? 'partial' : 'failed', { dispatched, retried, errors });

  return json({ dispatched, retried, errors });
}

// ─── Trigger-based notification dispatch ─────────────────────────────────────
// Reads notification_rules for the org + trigger, renders templates, enqueues.

// deno-lint-ignore no-explicit-any
async function runNotify(supabase: any, body: Record<string, string>, correlationId: string, requestId: string): Promise<Response> {
  const { trigger_event, organization_id } = body;

  if (!trigger_event || !organization_id) {
    return err(correlationId, requestId, 'trigger_event and organization_id are required', 400, 'VALIDATION_ERROR');
  }

  // Load enabled rules for this trigger + org
  const { data: rules = [], error: rulesErr } = await supabase
    .from('notification_rules')
    .select('id, channel, template_id, recipient_type')
    .eq('organization_id', organization_id)
    .eq('trigger_event', trigger_event)
    .eq('enabled', true);

  if (rulesErr) {
    console.error('[comm-worker] rules lookup error:', rulesErr.message);
    return err(correlationId, requestId, 'Failed to load notification rules', 500, 'QUERY_FAILED');
  }

  if (rules.length === 0) {
    return json({ queued: 0, message: 'No enabled rules for this trigger' });
  }

  // Load channel configs for this org
  const cfgsByChannel = await loadChannelConfigs(supabase, organization_id);

  let queued = 0;
  const errors: string[] = [];

  for (const rule of rules) {
    // Get template
    const { data: template, error: tplErr } = await supabase
      .from('notification_templates')
      .select('body_text, subject, variables')
      .eq('id', rule.template_id)
      .single();

    if (tplErr || !template) {
      errors.push(`Template ${rule.template_id} not found`);
      continue;
    }

    // Resolve recipient address from payload
    const isStudent    = rule.recipient_type === 'student';
    const channelKey   = rule.channel === 'email'
      ? (isStudent ? 'student_email' : 'instructor_email')
      : (isStudent ? 'student_phone' : 'instructor_phone');

    const recipientAddress = body[channelKey] ?? '';
    if (!recipientAddress) {
      errors.push(`No ${channelKey} in payload for rule ${rule.id}`);
      continue;
    }

    // Apply template variables
    const finalBody    = applyTemplateVars(template.body_text, body);
    const finalSubject = template.subject ? applyTemplateVars(template.subject, body) : null;

    const cfg = cfgsByChannel.get(rule.channel as Channel);

    // Attempt immediate dispatch if channel is configured + enabled
    let status = 'queued';
    let providerId: string | null = null;
    let errorMsg: string | null = null;

    if (cfg?.enabled) {
      const result = await dispatchMessage({
        channel:  rule.channel as Channel,
        provider: cfg.provider ?? null,
        to:       recipientAddress,
        from:     cfg.from_address ?? null,
        subject:  finalSubject ?? undefined,
        body:     finalBody,
      });
      status     = result.status;
      providerId = result.providerId;
      errorMsg   = result.error;
    }

    // An immediate-dispatch failure must still be retry-eligible: without
    // retry_after set here, claim_retry_messages() (which requires
    // retry_after IS NOT NULL) can never reclaim this row, so it would stay
    // 'failed' forever with no automatic recovery — confirmed live: 4 real
    // Resend failures from this exact path, all retry_count=0/retry_after=
    // null, never retried. retry_count starts at 1 since this dispatch
    // attempt already happened; formula matches dispatchClaimed()'s own
    // 2^retry_count-minutes backoff.
    const failedImmediately = status === 'failed';

    // Insert into outbound_messages (service role bypasses RLS)
    const { error: insertErr } = await supabase
      .from('outbound_messages')
      .insert({
        organization_id:     organization_id,
        channel:             rule.channel,
        recipient_type:      rule.recipient_type,
        recipient_address:   recipientAddress,
        template_id:         rule.template_id,
        subject:             finalSubject,
        body:                finalBody,
        status,
        provider:            cfg?.provider ?? null,
        provider_message_id: providerId,
        error_message:       errorMsg,
        retry_count:         failedImmediately ? 1 : 0,
        retry_after:         failedImmediately ? new Date(Date.now() + 2 * 60 * 1000).toISOString() : null,
        sent_at:             status === 'sent' ? new Date().toISOString() : null,
        metadata:            { trigger_event, rule_id: rule.id },
        created_by:          null,
      });

    if (insertErr) {
      errors.push(`Insert failed for rule ${rule.id}: ${insertErr.message}`);
    } else {
      queued++;
    }
  }

  return json({ queued, errors: errors.length > 0 ? errors : undefined });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve((req: Request) => serveCors(req, async () => {

  const correlationId = req.headers.get('X-Correlation-ID') ?? crypto.randomUUID();
  const requestId      = crypto.randomUUID();

  if (!isWorkerRequest(req)) {
    return err(correlationId, requestId, 'Unauthorized', 401, 'UNAUTHORIZED');
  }

  if (req.method !== 'POST') {
    return err(correlationId, requestId, 'Method not allowed', 405, 'METHOD_NOT_ALLOWED');
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  try {
    if (isNotifyPath(req)) {
      const body = await req.json() as Record<string, string>;
      return runNotify(supabase, body, correlationId, requestId);
    }

    return runMaintenanceTick(supabase, correlationId, requestId);

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[comm-worker] unhandled error:', message);
    return err(correlationId, requestId, message, 500, 'INTERNAL_ERROR');
  }

}));
