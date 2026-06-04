import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, EventChannelEnum } from '@platform/types';
import type { TenantContext } from '../context/tenant-context.js';
import { mapDbError } from '../errors/db-error-mapper.js';

export interface OutboxEventInput {
  eventType: string;
  channel: EventChannelEnum;
  payload: Record<string, unknown>;
  targetId?: string;
  causationId?: string;
  scheduledAt?: string;
  maxRetries?: number;
  metadata?: Record<string, unknown>;
  eventVersion?: string;
}

/**
 * OutboxPublisher — writes domain events to the event_outbox table via the
 * insert_outbox_event() SECURITY DEFINER function.
 *
 * Events must be written in the same logical unit as the domain mutation they
 * describe. For operations that use DB RPCs (Phase 2B/2C triggers), the outbox
 * INSERT happens inside the RPC — no need to call publish() from the service.
 * Use publish() only for operations where the trigger cannot fire (e.g. bulk
 * service-layer operations, background job completions, manual corrections).
 */
export class OutboxPublisher {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async publish(ctx: TenantContext, event: OutboxEventInput): Promise<string> {
    // Build args conditionally to satisfy exactOptionalPropertyTypes.
    // Required fields are always present; optional fields are omitted when absent
    // rather than passed as undefined (which Supabase rejects).
    const args: Record<string, unknown> = {
      p_event_type:    event.eventType,
      p_channel:       event.channel,
      p_payload:       event.payload,
      p_correlation_id: ctx.correlationId,
      p_event_version: event.eventVersion ?? '1',
      p_metadata:      event.metadata ?? {},
    };

    if (ctx.organizationId !== null) {
      args['p_organization_id'] = ctx.organizationId;
    }
    if (event.causationId !== undefined) args['p_causation_id'] = event.causationId;
    if (event.targetId !== undefined)    args['p_target_id'] = event.targetId;
    if (event.scheduledAt !== undefined) args['p_scheduled_at'] = event.scheduledAt;
    if (event.maxRetries !== undefined)  args['p_max_retries'] = event.maxRetries;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.db as any).rpc('insert_outbox_event', args);
    if (error) throw mapDbError(error as Error);
    return data as string;
  }

  async publishBatch(
    ctx: TenantContext,
    events: OutboxEventInput[]
  ): Promise<string[]> {
    return Promise.all(events.map(e => this.publish(ctx, e)));
  }
}

export function createOutboxPublisher(
  db: SupabaseClient<Database>
): OutboxPublisher {
  return new OutboxPublisher(db);
}
