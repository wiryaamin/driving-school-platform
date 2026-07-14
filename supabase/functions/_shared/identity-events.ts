/**
 * identity-events — the single write path into identity_security_events
 * (Identity History, ADR-007 / Enterprise Architecture Handbook).
 *
 * Phase 1 of the Identity & Security Implementation Blueprint: this module
 * exists and is fully usable, but has no caller yet — Phase 2 wires the first
 * writer (password authentication events via auth-hook). Deliberately inert
 * until then, per the Blueprint's Phase 1 exit criterion.
 *
 * Every current and future identity-event writer (password auth, BankID,
 * future providers) must call recordIdentityEvent() — never write to
 * identity_security_events directly, and never introduce a second writer
 * or a provider-specific event-logging mechanism (P-027).
 *
 * Fail-open by design, mirroring audit_trigger_fn()'s own documented
 * behavior: a failure to record an identity event must never block the
 * action that triggered it (e.g. a login must still succeed even if the
 * event write fails).
 */

import { createServiceClient } from './supabase.ts';
import { logger } from './logger.ts';

export type IdentityEventProvider =
  | 'password'
  | 'bankid'
  | 'entra_id'
  | 'google_workspace'
  | 'saml';

export type IdentityEventSeverity = 'info' | 'warning' | 'critical';

export interface RecordIdentityEventInput {
  /** domain.verb format, e.g. 'login.success', 'login.failed', 'identity.linked'. */
  eventType:       string;
  provider:        IdentityEventProvider;
  /** Defaults to 'info'. */
  severity?:       IdentityEventSeverity;
  organizationId?: string | null;
  /** Null when the actor can't be resolved (e.g. a failed login with an unknown email). */
  userId?:         string | null;
  actorEmail?:     string | null;
  ipAddress?:      string | null;
  userAgent?:      string | null;
  correlationId?:  string | null;
  /** Provider-specific detail — e.g. a BankID order reference or a failure reason. */
  metadata?:       Record<string, unknown>;
}

/**
 * Writes one row to identity_security_events via the service role client
 * (RLS on that table permits no client-role writes — this is the only path).
 * Never throws — logs and returns on any failure.
 */
export async function recordIdentityEvent(input: RecordIdentityEventInput): Promise<void> {
  try {
    const db = createServiceClient();
    const { error } = await db.from('identity_security_events').insert({
      event_type:      input.eventType,
      provider:        input.provider,
      severity:        input.severity ?? 'info',
      organization_id: input.organizationId ?? null,
      user_id:         input.userId ?? null,
      actor_email:     input.actorEmail ?? null,
      ip_address:      input.ipAddress ?? null,
      user_agent:      input.userAgent ?? null,
      correlation_id:  input.correlationId ?? null,
      metadata:        input.metadata ?? {},
    });

    if (error) {
      logger.error('identity_event.write_failed', {
        event_type: input.eventType,
        provider:   input.provider,
        error:      error.message,
      });
    }
  } catch (err) {
    logger.error('identity_event.write_exception', {
      event_type: input.eventType,
      provider:   input.provider,
      error:      err instanceof Error ? err.message : String(err),
    });
  }
}
