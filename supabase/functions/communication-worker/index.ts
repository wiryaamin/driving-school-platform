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
 *     student_phone?:          string,
 *     student_email?:          string,
 *     instructor_phone?:       string,
 *     instructor_email?:       string,
 *     guardian_phone?:         string,
 *     guardian_email?:         string,
 *     // Recipient identity — required for the push channel, which fans out
 *     // to every active device registered in push_device_tokens for this
 *     // recipient (see _shared/push-tokens.ts) rather than a single address.
 *     student_id?:             string,
 *     instructor_id?:          string,
 *     guardian_id?:            string,
 *     // Optional — attaches the canonical Notification Center record (see
 *     // runNotify's Step 1) to the business entity it concerns, e.g.
 *     // reference_type: 'lesson_booking', reference_id: <booking id>.
 *     reference_type?:         string,
 *     reference_id?:           string,
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
import { getActivePushTokens, revokePushToken, touchPushToken } from '../_shared/push-tokens.ts';
import type { PushTokenOwnerColumn } from '../_shared/push-tokens.ts';

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
    organizationId: msg.organization_id,
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

// ─── Notification Center — canonical record metadata ─────────────────────────
// Maps a trigger_event to the Notification Center's category enum, a stable
// frontend route identifier (never a stored URL — the frontend resolves
// this + reference_type/reference_id to an actual path, so a routing
// change never needs a data migration), and a canonical business title.
//
// `title` is a deliberate, minimal first step toward the roadmap direction
// (Handbook, "Push Notifications + Notification Center" entry): the
// long-term design is a real canonical-template source the Notification
// Center owns outright, with delivery channels (push/email/sms) holding
// only channel-specific formatting of that same canonical wording. This
// hardcoded map is that same idea in its smallest possible form — it
// guarantees the canonical record always has a stable, business-meaningful
// subject that does not depend on which delivery channel's template
// happened to be selected for the body (some channels, e.g. SMS, have no
// subject field at all).

const TRIGGER_EVENT_META: Record<string, { title: string; category: string; deepLink: string | null }> = {
  booking_confirmed:         { title: 'Körlektion bokad',           category: 'booking',  deepLink: 'booking_detail' },
  booking_cancelled:         { title: 'Körlektion inställd',        category: 'booking',  deepLink: 'booking_detail' },
  booking_rescheduled:       { title: 'Körlektion ombokad',         category: 'booking',  deepLink: 'booking_detail' },
  booking_reminder_24h:      { title: 'Påminnelse: lektion imorgon', category: 'lesson',   deepLink: 'booking_detail' },
  booking_reminder_same_day: { title: 'Påminnelse: lektion idag',    category: 'lesson',   deepLink: 'booking_detail' },
  waitlist_promoted:         { title: 'Väntelistan uppdaterad',     category: 'waitlist', deepLink: 'waitlist' },
  invoice_issued:            { title: 'Ny faktura',                 category: 'invoice',  deepLink: 'invoice_detail' },
  invoice_overdue:           { title: 'Betalningspåminnelse',       category: 'invoice',  deepLink: 'invoice_detail' },
  instructor_schedule_daily: { title: 'Dagens schema',              category: 'lesson',   deepLink: 'instructor_schedule' },
  lead_created:              { title: 'Nytt lead mottaget',         category: 'system',   deepLink: null },
  enrollment_request_created: { title: 'Ny anmälan mottagen',       category: 'system',   deepLink: null },
};

function humanizeTriggerEvent(triggerEvent: string): string {
  const words = triggerEvent.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function notificationMetaFor(triggerEvent: string): { title: string; category: string; deepLink: string | null } {
  return TRIGGER_EVENT_META[triggerEvent]
    ?? { title: humanizeTriggerEvent(triggerEvent), category: 'system', deepLink: null };
}

// ─── Trigger-based notification dispatch ─────────────────────────────────────
// Reads notification_rules for the org + trigger, renders templates, enqueues.
//
// Two independent steps (Notification Center, Version 1.1):
//   1. Create exactly one canonical `notifications` row per distinct
//      recipient among the enabled rules — the permanent, channel-agnostic
//      business history the portal bell reads.
//   2. The existing per-rule channel dispatch loop, now linking each
//      `outbound_messages` row it creates back to that canonical record via
//      `notification_id`. A channel failing here never touches step 1's row.

// deno-lint-ignore no-explicit-any
async function runNotify(supabase: any, body: Record<string, string>, correlationId: string, requestId: string): Promise<Response> {
  const { trigger_event, organization_id } = body;

  if (!trigger_event || !organization_id) {
    return err(correlationId, requestId, 'trigger_event and organization_id are required', 400, 'VALIDATION_ERROR');
  }

  // Optional caller-supplied override — e.g. a dunning stage's own
  // admin-authored subject_template/message_template, which the caller
  // resolves and passes here rather than this function knowing about
  // per-stage schedules. When present, takes priority over whatever
  // notification_templates row the matched rule points to, still rendered
  // through the same applyTemplateVars(..., body) call below.
  const overrideSubject = body['override_subject'];
  const overrideBody    = body['override_body'];

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

  // ── Step 1: one canonical notification per distinct recipient ────────────
  const notificationIdByRecipientType = new Map<string, string>();
  const meta = notificationMetaFor(trigger_event);

  for (const recipientType of new Set(rules.map((r: { recipient_type: string }) => r.recipient_type))) {
    const recipientId = recipientType === 'student'    ? body['student_id']
                       : recipientType === 'instructor' ? body['instructor_id']
                       : recipientType === 'guardian'   ? body['guardian_id']
                       : body['admin_id']; // recipientType === 'admin' — the org owner, resolved by the emitting handler
    if (!recipientId) continue; // no identity to attach canonical history to — per-channel errors below still fire

    // Render canonical content from a matching rule's template —
    // channel-neutral, deterministic; individual channels may still render
    // their own subject/body variants for actual delivery. Prefer sms/push
    // over email: some 'email' templates predate the current
    // {variable}-substitution format (an older Phase 3D seed inserted first,
    // so a later Phase A seed for the same key+channel silently no-opped on
    // its ON CONFLICT DO NOTHING) and would render literal unresolved
    // {{mustache}} placeholders into the canonical record — confirmed via a
    // live test during this feature's own end-to-end verification.
    const primaryRule =
      ['sms', 'push', 'email'].map(ch =>
        rules.find((r: { recipient_type: string; channel: string }) => r.recipient_type === recipientType && r.channel === ch),
      ).find(Boolean)
      ?? rules.find((r: { recipient_type: string }) => r.recipient_type === recipientType);
    const { data: primaryTpl } = await supabase
      .from('notification_templates')
      .select('subject, body_text')
      .eq('id', primaryRule.template_id)
      .single();

    const { data: notif, error: notifErr } = await supabase
      .from('notifications')
      .insert({
        organization_id,
        recipient_id:   recipientId,
        recipient_type: recipientType,
        channel:        'internal',
        status:         'sent',
        template_key:   trigger_event,
        locale:         'sv',
        // subject is always the canonical business title (never the
        // delivery template's subject, which may be null — SMS templates
        // have no subject field — or absent depending on which channel was
        // selected above). A canonical Notification Center record must
        // always have a meaningful title.
        subject:        meta.title,
        body:           overrideBody ? applyTemplateVars(overrideBody, body) : (primaryTpl ? applyTemplateVars(primaryTpl.body_text, body) : null),
        category:       meta.category,
        deep_link_identifier: meta.deepLink,
        reference_type: body['reference_type'] ?? null,
        reference_id:   body['reference_id'] ?? null,
        metadata:       { trigger_event },
      })
      .select('id')
      .single();

    if (notifErr) {
      console.error('[comm-worker] notification create failed:', notifErr.message);
    } else if (notif) {
      notificationIdByRecipientType.set(recipientType as string, (notif as { id: string }).id);
    }
  }

  // ── Step 2: existing per-channel dispatch, now linked to step 1's record ──
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

    const isStudent  = rule.recipient_type === 'student';
    const isAdmin    = rule.recipient_type === 'admin';
    const isGuardian = rule.recipient_type === 'guardian';
    const cfg        = cfgsByChannel.get(rule.channel as Channel);

    // Apply template variables — override takes priority when the caller
    // supplied one (see overrideBody/overrideSubject above).
    const finalBody    = overrideBody    ? applyTemplateVars(overrideBody, body)
                        :                   applyTemplateVars(template.body_text, body);
    const finalSubject = overrideSubject ? applyTemplateVars(overrideSubject, body)
                        : template.subject ? applyTemplateVars(template.subject, body) : null;

    // Push fans out to every active device token for the recipient, looked
    // up from push_device_tokens — it has no single "address" in the payload
    // the way email/sms/whatsapp do.
    if (rule.channel === 'push') {
      // push_device_tokens has no admin/staff owner column — only ever
      // seeded for student/instructor/guardian rules, but guard against a
      // rule an admin could still hand-create via the rules UI.
      if (isAdmin) {
        errors.push(`Push is not supported for recipient_type 'admin' (rule ${rule.id})`);
        continue;
      }
      const ownerColumn: PushTokenOwnerColumn = isStudent ? 'student_id' : isGuardian ? 'guardian_id' : 'instructor_id';
      const ownerId = isStudent ? body['student_id'] : isGuardian ? body['guardian_id'] : body['instructor_id'];

      if (!ownerId) {
        errors.push(`No ${ownerColumn} in payload for rule ${rule.id}`);
        continue;
      }

      const tokens = await getActivePushTokens(supabase, organization_id, ownerColumn, ownerId);
      if (tokens.length === 0) {
        errors.push(`No active device tokens for ${ownerColumn}=${ownerId}, rule ${rule.id}`);
        continue;
      }

      for (const deviceToken of tokens) {
        let status = 'queued';
        let providerId: string | null = null;
        let errorMsg: string | null = null;

        if (cfg?.enabled) {
          const result = await dispatchMessage({
            channel:  'push',
            provider: cfg.provider ?? null,
            to:       deviceToken.token,
            from:     cfg.from_address ?? null,
            subject:  finalSubject ?? undefined,
            body:     finalBody,
            organizationId: organization_id,
          });
          status     = result.status;
          providerId = result.providerId;
          errorMsg   = result.error;

          if (result.invalidToken) {
            await revokePushToken(supabase, organization_id, ownerColumn, ownerId, deviceToken.id, 'provider_reported_invalid');
          } else if (result.status === 'sent') {
            void touchPushToken(supabase, deviceToken.id);
          }
        }

        const { error: insertErr } = await supabase
          .from('outbound_messages')
          .insert({
            organization_id:     organization_id,
            channel:             'push',
            recipient_type:      rule.recipient_type,
            recipient_address:   deviceToken.token,
            template_id:         rule.template_id,
            subject:             finalSubject,
            body:                finalBody,
            status,
            provider:            cfg?.provider ?? null,
            provider_message_id: providerId,
            error_message:       errorMsg,
            sent_at:             status === 'sent' ? new Date().toISOString() : null,
            metadata:            { trigger_event, rule_id: rule.id, device_token_id: deviceToken.id },
            notification_id:     notificationIdByRecipientType.get(rule.recipient_type) ?? null,
            created_by:          null,
          });

        if (insertErr) {
          errors.push(`Insert failed for rule ${rule.id} (device ${deviceToken.id}): ${insertErr.message}`);
        } else {
          queued++;
        }
      }
      continue;
    }

    // Resolve recipient address from payload (email/sms/whatsapp/voice)
    const channelKey = rule.channel === 'email'
      ? (isAdmin ? 'admin_email' : isStudent ? 'student_email' : isGuardian ? 'guardian_email' : 'instructor_email')
      : (isAdmin ? 'admin_phone' : isStudent ? 'student_phone' : isGuardian ? 'guardian_phone' : 'instructor_phone');

    const recipientAddress = body[channelKey] ?? '';
    if (!recipientAddress) {
      errors.push(`No ${channelKey} in payload for rule ${rule.id}`);
      continue;
    }

    // Respect the student's own opt-out, same rule communications/index.ts's
    // manual /send route already enforces (comment there: "found via live
    // pilot simulation (a student opted out of email still received one)").
    // That fix only ever covered the manual-compose path — every automated
    // trigger (booking confirmed/cancelled/rescheduled, reminders, waitlist
    // promotions, ...) went through this function and none of them checked
    // it. Only email/sms have a dedicated opt-in column to enforce.
    let optedOut = false;
    if (isStudent && (rule.channel === 'email' || rule.channel === 'sms') && body['student_id']) {
      const optInColumn = rule.channel === 'email' ? 'communication_opt_in_email' : 'communication_opt_in_sms';
      const { data: student } = await supabase
        .from('students')
        .select(optInColumn)
        .eq('id', body['student_id'])
        .eq('organization_id', organization_id)
        .maybeSingle();
      optedOut = student != null && (student as Record<string, boolean>)[optInColumn] === false;
    }

    if (optedOut) {
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
          status:              'cancelled',
          error_message:       `Recipient has opted out of ${rule.channel} communications`,
          metadata:            { trigger_event, rule_id: rule.id },
          notification_id:     notificationIdByRecipientType.get(rule.recipient_type) ?? null,
          created_by:          null,
        });
      if (insertErr) errors.push(`Insert failed for rule ${rule.id}: ${insertErr.message}`);
      continue;
    }

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
        organizationId: organization_id,
      });
      status     = result.status;
      providerId = result.providerId;
      errorMsg   = result.error;
    }

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
        sent_at:             status === 'sent' ? new Date().toISOString() : null,
        metadata:            { trigger_event, rule_id: rule.id },
        notification_id:     notificationIdByRecipientType.get(rule.recipient_type) ?? null,
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
