/**
 * event-worker — Transactional outbox drain worker + maintenance tick.
 *
 * Invocation:
 *   • Cron: every minute via Supabase scheduled functions or pg_cron
 *   • Manual: POST /functions/v1/event-worker with WORKER_SECRET bearer token
 *
 * Algorithm per run:
 *   1. Claim up to BATCH_SIZE 'internal' channel events via outbox_claim_next()
 *      (FOR UPDATE SKIP LOCKED — safe to run concurrently)
 *   2. Dispatch each event to the matching handler in HANDLER_REGISTRY
 *   3. Call outbox_complete() on success
 *   4. Call outbox_fail()   on failure (DB handles backoff + dead-letter)
 *   5. Run maintenance tick: drain due reminders + expire stale reservations
 *   6. Return a metrics summary in the response body
 *
 * Dead-letter: handled entirely by outbox_fail() in the DB.
 *   Backoff schedule (default max_retries=3): 30s → 60s → 120s → dead_letter.
 *
 * Maintenance tick (Phase 3D):
 *   drain_due_reminders() — atomically claims scheduled reminders whose
 *     scheduled_for <= now(), creates notification records, marks sent.
 *   expire_stale_reservations() — cancels draft/reserved bookings past timeout,
 *     publishes Reservation.Expired events back into the outbox.
 */

import { createServiceClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const BATCH_SIZE           = Number(Deno.env.get('EVENT_WORKER_BATCH_SIZE')      ?? '50');
const ACCOUNTING_BATCH     = Number(Deno.env.get('EVENT_WORKER_ACCT_BATCH')      ?? '50');
const LOCK_TTL             = Deno.env.get('EVENT_WORKER_LOCK_TTL')               ?? '5 minutes';
const REMINDER_BATCH       = Number(Deno.env.get('EVENT_WORKER_REMINDER_BATCH')  ?? '20');
const EXPIRY_TIMEOUT       = Number(Deno.env.get('RESERVATION_EXPIRY_MINUTES')   ?? '30');
const CREDIT_EXPIRY_BATCH  = Number(Deno.env.get('CREDIT_EXPIRY_BATCH')         ?? '50');
const WORKER_SECRET        = Deno.env.get('WORKER_SECRET');

// ─── Template key mapping ─────────────────────────────────────────────────────

const REMINDER_TYPE_TO_TEMPLATE: Record<string, string> = {
  reminder_24h: 'lesson.reminder.24h',
  reminder_2h:  'lesson.reminder.2h',
  reminder_1h:  'lesson.reminder.1h',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface OutboxEvent {
  id:              string;
  organization_id: string | null;
  event_type:      string;
  event_version:   string;
  channel:         string;
  correlation_id:  string | null;
  causation_id:    string | null;
  payload:         Record<string, unknown>;
  metadata:        Record<string, unknown>;
  status:          string;
  target_id:       string | null;
  retry_count:     number;
  max_retries:     number;
}

interface HandlerResult {
  success: boolean;
  error?:  string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventHandler = (event: OutboxEvent, client: any) => Promise<HandlerResult>;

interface WorkerMetrics {
  worker_id:             string;
  run_started_at:        string;
  run_duration_ms:       number;
  events_claimed:        number;
  events_delivered:      number;
  events_failed:         number;
  events_dead_lettered:  number;
  events_no_handler:     number;
  reminders_processed:   number;
  reminders_failed:      number;
  reservations_expired:  number;
  accounting_delivered:  number;
  credits_expired:       number;
}

// ─── Outbox event handlers ────────────────────────────────────────────────────

async function handleStudentCreated(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.student_created', {
    event_id:   event.id,
    org_id:     event.organization_id,
    student_id: event.payload['student_id'],
  });
  return { success: true };
}

async function handleStudentUpdated(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.student_updated', {
    event_id:   event.id,
    student_id: event.payload['student_id'],
  });
  return { success: true };
}

async function handleStudentArchived(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.student_archived', {
    event_id:   event.id,
    student_id: event.payload['student_id'],
  });
  return { success: true };
}

async function handleInstructorCreated(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.instructor_created', {
    event_id:      event.id,
    instructor_id: event.payload['instructor_id'],
  });
  return { success: true };
}

async function handleInstructorUpdated(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.instructor_updated', {
    event_id:      event.id,
    instructor_id: event.payload['instructor_id'],
  });
  return { success: true };
}

async function handleInstructorArchived(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.instructor_archived', {
    event_id:      event.id,
    instructor_id: event.payload['instructor_id'],
  });
  return { success: true };
}

async function handleLessonSlotCreated(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.lesson_slot_created', {
    event_id:      event.id,
    slot_id:       event.payload['slot_id'],
    instructor_id: event.payload['instructor_id'],
  });
  return { success: true };
}

async function handleLessonSlotCancelled(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.lesson_slot_cancelled', {
    event_id: event.id,
    slot_id:  event.payload['slot_id'],
  });
  return { success: true };
}

// Lesson.Created: schedule reminders for the new booking
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLessonCreated(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const bookingId = event.payload['booking_id'] as string | undefined;

  if (bookingId === undefined) {
    logger.warn('handler.lesson_created.missing_booking_id', { event_id: event.id });
    return { success: true };
  }

  const { data: reminderCount, error } = await client.rpc('schedule_lesson_reminders', {
    p_booking_id: bookingId,
  });

  if (error !== null) {
    logger.error('handler.lesson_created.schedule_reminders_failed', {
      event_id:   event.id,
      booking_id: bookingId,
      error:      error.message,
    });
    return { success: false, error: error.message };
  }

  logger.info('handler.lesson_created', {
    event_id:            event.id,
    booking_id:          bookingId,
    reminders_scheduled: reminderCount ?? 0,
  });
  return { success: true };
}

async function handleLessonUpdated(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.lesson_updated', {
    event_id:   event.id,
    booking_id: event.payload['booking_id'],
    status:     event.payload['status'],
  });
  return { success: true };
}

// Lesson.Cancelled: cancel reminders + promote next waitlist entry
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLessonCancelled(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const bookingId = event.payload['booking_id'] as string | undefined;
  const slotId    = event.payload['slot_id']    as string | undefined;

  if (bookingId !== undefined) {
    const { error: cancelErr } = await client.rpc('cancel_lesson_reminders', {
      p_booking_id: bookingId,
    });
    if (cancelErr !== null) {
      logger.error('handler.lesson_cancelled.cancel_reminders_failed', {
        event_id:   event.id,
        booking_id: bookingId,
        error:      cancelErr.message,
      });
      return { success: false, error: cancelErr.message };
    }
  }

  if (slotId !== undefined) {
    const { data: promotedId, error: promoteErr } = await client.rpc('promote_waitlist_next', {
      p_slot_id: slotId,
    });
    if (promoteErr !== null) {
      logger.warn('handler.lesson_cancelled.promote_waitlist_failed', {
        event_id: event.id,
        slot_id:  slotId,
        error:    promoteErr.message,
      });
      // Non-fatal: promotion failure doesn't prevent reminder cancellation
    } else {
      logger.info('handler.lesson_cancelled', {
        event_id:          event.id,
        booking_id:        bookingId,
        slot_id:           slotId,
        promoted_entry_id: promotedId,
      });
    }
  }

  return { success: true };
}

// Lesson.Rescheduled: cancel old reminders, schedule new reminders
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLessonRescheduled(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const oldBookingId = event.payload['old_booking_id'] as string | undefined;
  const newBookingId = event.payload['new_booking_id'] as string | undefined;

  if (oldBookingId !== undefined) {
    await client.rpc('cancel_lesson_reminders', { p_booking_id: oldBookingId });
  }

  if (newBookingId !== undefined) {
    const { data: count, error } = await client.rpc('schedule_lesson_reminders', {
      p_booking_id: newBookingId,
    });
    if (error !== null) {
      logger.error('handler.lesson_rescheduled.schedule_reminders_failed', {
        event_id:       event.id,
        new_booking_id: newBookingId,
        error:          error.message,
      });
      return { success: false, error: error.message };
    }
    logger.info('handler.lesson_rescheduled', {
      event_id:            event.id,
      old_booking_id:      oldBookingId,
      new_booking_id:      newBookingId,
      reminders_scheduled: count ?? 0,
    });
  }

  return { success: true };
}

// ── Phase 3D handlers ─────────────────────────────────────────────────────────

async function handleWaitlistPromoted(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.waitlist_promoted', {
    event_id:             event.id,
    waitlist_entry_id:    event.payload['waitlist_entry_id'],
    student_id:           event.payload['student_id'],
    slot_id:              event.payload['slot_id'],
    reservation_deadline: event.payload['reservation_deadline'],
  });
  // TODO Phase 4: dispatch waitlist.promoted notification email/SMS
  return { success: true };
}

async function handleReservationExpired(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.reservation_expired', {
    event_id:   event.id,
    booking_id: event.payload['booking_id'],
    student_id: event.payload['student_id'],
    slot_id:    event.payload['slot_id'],
  });
  // TODO Phase 4: dispatch reservation.expired notification email
  return { success: true };
}

async function handleReminderSent(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.reminder_sent', {
    event_id:    event.id,
    reminder_id: event.payload['reminder_id'],
    booking_id:  event.payload['booking_id'],
    template:    event.payload['template_key'],
  });
  return { success: true };
}

async function handleNotificationDelivered(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.notification_delivered', {
    event_id:        event.id,
    notification_id: event.payload['notification_id'],
    recipient_id:    event.payload['recipient_id'],
    template_key:    event.payload['template_key'],
  });
  return { success: true };
}

// ── Phase 4A commercial handlers (accounting channel) ─────────────────────────
// Phase 4A: all handlers are stubs — log and acknowledge.
// Phase 4B: swap for real analytics sync, invoice notifications, etc.

async function handlePackagePurchased(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.package_purchased', {
    event_id:           event.id,
    student_package_id: event.payload['student_package_id'],
    student_id:         event.payload['student_id'],
    offering_name:      event.payload['offering_name'],
    quantity_granted:   event.payload['quantity_granted'],
    lesson_category:    event.payload['lesson_category'],
    price:              event.payload['price'],
    currency:           event.payload['currency'],
  });
  return { success: true };
}

async function handleInvoiceIssued(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.invoice_issued', {
    event_id:        event.id,
    invoice_id:      event.payload['invoice_id'],
    invoice_number:  event.payload['invoice_number'],
    student_id:      event.payload['student_id'],
    total_amount:    event.payload['total_amount'],
    currency:        event.payload['currency'],
  });
  // TODO Phase 4B: send invoice email to student
  return { success: true };
}

async function handleInvoicePaid(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.invoice_paid', {
    event_id:        event.id,
    invoice_id:      event.payload['invoice_id'],
    invoice_number:  event.payload['invoice_number'],
    student_id:      event.payload['student_id'],
    total_amount:    event.payload['total_amount'],
    payment_id:      event.payload['payment_id'],
  });
  return { success: true };
}

async function handleInvoiceVoided(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.invoice_voided', {
    event_id:        event.id,
    invoice_id:      event.payload['invoice_id'],
    invoice_number:  event.payload['invoice_number'],
    student_id:      event.payload['student_id'],
    reason:          event.payload['reason'],
  });
  return { success: true };
}

async function handlePaymentReceived(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.payment_received', {
    event_id:   event.id,
    payment_id: event.payload['payment_id'],
    invoice_id: event.payload['invoice_id'],
    student_id: event.payload['student_id'],
    amount:     event.payload['amount'],
    method:     event.payload['method'],
  });
  return { success: true };
}

async function handleCreditGranted(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.credit_granted', {
    event_id:           event.id,
    ledger_id:          event.payload['ledger_id'],
    student_id:         event.payload['student_id'],
    lesson_category:    event.payload['lesson_category'],
    quantity:           event.payload['quantity'],
    expires_at:         event.payload['expires_at'],
    student_package_id: event.payload['student_package_id'],
  });
  return { success: true };
}

async function handleCreditConsumed(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.credit_consumed', {
    event_id:        event.id,
    ledger_id:       event.payload['ledger_id'],
    student_id:      event.payload['student_id'],
    lesson_category: event.payload['lesson_category'],
    quantity:        event.payload['quantity'],
    booking_id:      event.payload['booking_id'],
  });
  return { success: true };
}

async function handleCreditExpired(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.credit_expired', {
    event_id:        event.id,
    ledger_id:       event.payload['ledger_id'],
    student_id:      event.payload['student_id'],
    lesson_category: event.payload['lesson_category'],
    quantity:        event.payload['quantity'],
    expired_at:      event.payload['expired_at'],
  });
  // TODO Phase 4B: notify student that credits are about to/have expired
  return { success: true };
}

// ─── Handler registry ─────────────────────────────────────────────────────────

const HANDLER_REGISTRY: Record<string, EventHandler> = {
  'Student.Created':         handleStudentCreated,
  'Student.Updated':         handleStudentUpdated,
  'Student.Archived':        handleStudentArchived,
  'Instructor.Created':      handleInstructorCreated,
  'Instructor.Updated':      handleInstructorUpdated,
  'Instructor.Archived':     handleInstructorArchived,
  'Lesson.SlotCreated':      handleLessonSlotCreated,
  'Lesson.SlotCancelled':    handleLessonSlotCancelled,
  'Lesson.Created':          handleLessonCreated,
  'Lesson.Updated':          handleLessonUpdated,
  'Lesson.Cancelled':        handleLessonCancelled,
  'Lesson.Rescheduled':      handleLessonRescheduled,
  // Phase 3D: Automation + notification events
  'Waitlist.Promoted':       handleWaitlistPromoted,
  'Reservation.Expired':     handleReservationExpired,
  'Reminder.Sent':           handleReminderSent,
  'Notification.Delivered':  handleNotificationDelivered,
  // Phase 4A: Commercial accounting events (accounting channel)
  'Package.Purchased':       handlePackagePurchased,
  'Invoice.Issued':          handleInvoiceIssued,
  'Invoice.Paid':            handleInvoicePaid,
  'Invoice.Voided':          handleInvoiceVoided,
  'Payment.Received':        handlePaymentReceived,
  'Credit.Granted':          handleCreditGranted,
  'Credit.Consumed':         handleCreditConsumed,
  'Credit.Expired':          handleCreditExpired,
};

// ─── Maintenance tick ─────────────────────────────────────────────────────────
// Runs after every outbox drain. Handles time-based automation that isn't
// driven by outbox events: reminder dispatch + stale reservation expiry.

interface MaintenanceMetrics {
  reminders_processed:  number;
  reminders_failed:     number;
  reservations_expired: number;
  credits_expired:      number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processReminder(client: any, reminder: Record<string, unknown>, workerId: string): Promise<boolean> {
  const reminderId   = reminder['id']              as string;
  const orgId        = reminder['organization_id'] as string;
  const bookingId    = reminder['booking_id']      as string;
  const recipientId  = reminder['recipient_id']    as string;
  const recipientType = reminder['recipient_type'] as string;
  const reminderType = reminder['reminder_type']   as string;
  const templateKey  = REMINDER_TYPE_TO_TEMPLATE[reminderType] ?? `lesson.${reminderType}`;
  const idemKey      = `notif:reminder:${reminderId}`;

  try {
    // Create notification record (idempotent via unique idempotency_key)
    const { data: notif, error: insertErr } = await client
      .from('notifications')
      .insert({
        organization_id: orgId,
        recipient_id:    recipientId,
        recipient_type:  recipientType,
        channel:         'email',
        template_key:    templateKey,
        locale:          'sv',
        status:          'sending',
        idempotency_key: idemKey,
        reference_type:  'lesson_booking',
        reference_id:    bookingId,
      })
      .select('id')
      .single();

    // Tolerate duplicate key (reminder already processed by a concurrent worker)
    if (insertErr !== null && !insertErr.message.includes('duplicate key')) {
      throw new Error(insertErr.message);
    }

    const notifId = notif?.id ?? null;

    // Stub dispatch — logs the notification. In production, call SendGrid / Twilio here.
    logger.info('notification.dispatch', {
      worker_id:     workerId,
      template_key:  templateKey,
      recipient_id:  recipientId,
      recipient_type: recipientType,
      booking_id:    bookingId,
      channel:       'email',
    });

    // Mark notification sent
    if (notifId !== null) {
      await client
        .from('notifications')
        .update({ status: 'sent', status_changed_at: new Date().toISOString(), sent_at: new Date().toISOString() })
        .eq('id', notifId);
    }

    // Mark reminder sent and link notification
    await client
      .from('lesson_reminders')
      .update({
        status:          'sent',
        notification_id: notifId,
        updated_at:      new Date().toISOString(),
      })
      .eq('id', reminderId);

    // Publish Reminder.Sent event
    await client.rpc('insert_outbox_event', {
      p_event_type:      'Reminder.Sent',
      p_channel:         'internal',
      p_payload:         {
        reminder_id:  reminderId,
        booking_id:   bookingId,
        recipient_id: recipientId,
        template_key: templateKey,
      },
      p_organization_id: orgId,
      p_target_id:       reminderId,
    });

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('notification.dispatch_failed', {
      worker_id:   workerId,
      reminder_id: reminderId,
      error:       msg,
    });

    // Mark reminder failed
    await client
      .from('lesson_reminders')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', reminderId);

    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runMaintenanceTick(client: any, workerId: string): Promise<MaintenanceMetrics> {
  const metrics: MaintenanceMetrics = {
    reminders_processed:  0,
    reminders_failed:     0,
    reservations_expired: 0,
    credits_expired:      0,
  };

  // 1. Drain due reminders (atomic claim via SKIP LOCKED in DB function)
  const { data: dueReminders, error: drainErr } = await client.rpc('drain_due_reminders', {
    p_limit: REMINDER_BATCH,
  });

  if (drainErr !== null) {
    logger.error('maintenance.drain_reminders_failed', {
      worker_id: workerId,
      error:     drainErr.message,
    });
  } else {
    for (const reminder of (dueReminders ?? []) as Record<string, unknown>[]) {
      const sent = await processReminder(client, reminder, workerId);
      if (sent) {
        metrics.reminders_processed++;
      } else {
        metrics.reminders_failed++;
      }
    }
  }

  // 2. Expire stale reservations (publishes Reservation.Expired events to outbox)
  const { data: expiredCount, error: expireErr } = await client.rpc('expire_stale_reservations', {
    p_timeout_minutes: EXPIRY_TIMEOUT,
  });

  if (expireErr !== null) {
    logger.warn('maintenance.expire_reservations_failed', {
      worker_id: workerId,
      error:     expireErr.message,
    });
  } else {
    metrics.reservations_expired = (expiredCount as number) ?? 0;
    if (metrics.reservations_expired > 0) {
      logger.info('maintenance.reservations_expired', {
        worker_id: workerId,
        count:     metrics.reservations_expired,
      });
    }
  }

  // 3. Expire stale credits (Phase 4A: FIFO grant expiry via SKIP LOCKED in DB)
  const { data: expiredCredits, error: creditExpireErr } = await (client as any).rpc(
    'expire_stale_credits',
    { p_limit: CREDIT_EXPIRY_BATCH }
  );

  if (creditExpireErr !== null) {
    logger.warn('maintenance.expire_credits_failed', {
      worker_id: workerId,
      error:     creditExpireErr.message,
    });
  } else {
    metrics.credits_expired = (expiredCredits as number) ?? 0;
    if (metrics.credits_expired > 0) {
      logger.info('maintenance.credits_expired', {
        worker_id: workerId,
        count:     metrics.credits_expired,
      });
    }
  }

  return metrics;
}

// ─── Worker core ──────────────────────────────────────────────────────────────

async function runWorker(workerId: string): Promise<WorkerMetrics> {
  const startedAt     = Date.now();
  const runStartedAt  = new Date().toISOString();

  const metrics: WorkerMetrics = {
    worker_id:            workerId,
    run_started_at:       runStartedAt,
    run_duration_ms:      0,
    events_claimed:       0,
    events_delivered:     0,
    events_failed:        0,
    events_dead_lettered: 0,
    events_no_handler:    0,
    reminders_processed:  0,
    reminders_failed:     0,
    reservations_expired: 0,
    accounting_delivered: 0,
    credits_expired:      0,
  };

  const client = createServiceClient();

  // Claim the next batch of 'internal' channel events
  const { data: events, error: claimError } = await (client as any).rpc('outbox_claim_next', {
    p_channel:    'internal',
    p_worker_id:  workerId,
    p_batch_size: BATCH_SIZE,
    p_lock_ttl:   LOCK_TTL,
  });

  if (claimError !== null) {
    logger.error('worker.claim_failed', {
      worker_id: workerId,
      error:     claimError.message,
    });
    metrics.run_duration_ms = Date.now() - startedAt;
    return metrics;
  }

  const batch = (events ?? []) as OutboxEvent[];
  metrics.events_claimed = batch.length;

  if (batch.length > 0) {
    logger.info('worker.batch_claimed', {
      worker_id:  workerId,
      batch_size: batch.length,
    });
  } else {
    logger.debug('worker.no_events', { worker_id: workerId });
  }

  for (const event of batch) {
    const handler = HANDLER_REGISTRY[event.event_type];

    if (handler === undefined) {
      logger.warn('worker.no_handler', {
        worker_id:  workerId,
        event_id:   event.id,
        event_type: event.event_type,
      });
      await (client as any).rpc('outbox_complete', { p_event_id: event.id });
      metrics.events_no_handler++;
      metrics.events_delivered++;
      continue;
    }

    try {
      const result = await handler(event, client);

      if (result.success) {
        await (client as any).rpc('outbox_complete', { p_event_id: event.id });
        metrics.events_delivered++;
      } else {
        const errMsg = result.error ?? 'Handler returned failure';
        logger.warn('worker.handler_failed', {
          worker_id:   workerId,
          event_id:    event.id,
          event_type:  event.event_type,
          retry_count: event.retry_count,
          error:       errMsg,
        });
        await (client as any).rpc('outbox_fail', { p_event_id: event.id, p_error: errMsg });
        metrics.events_failed++;
        if (event.retry_count >= event.max_retries) metrics.events_dead_lettered++;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('worker.handler_threw', {
        worker_id:   workerId,
        event_id:    event.id,
        event_type:  event.event_type,
        retry_count: event.retry_count,
        error:       errMsg,
        stack:       err instanceof Error ? err.stack : undefined,
      });
      await (client as any).rpc('outbox_fail', { p_event_id: event.id, p_error: errMsg });
      metrics.events_failed++;
      if (event.retry_count >= event.max_retries) metrics.events_dead_lettered++;
    }
  }

  // Phase 4A: Drain accounting channel (commercial events: Invoice, Payment, Credit)
  const { data: accountingEvents, error: acctClaimErr } = await (client as any).rpc('outbox_claim_next', {
    p_channel:    'accounting',
    p_worker_id:  workerId,
    p_batch_size: ACCOUNTING_BATCH,
    p_lock_ttl:   LOCK_TTL,
  });

  if (acctClaimErr !== null) {
    logger.warn('worker.accounting_claim_failed', {
      worker_id: workerId,
      error:     acctClaimErr.message,
    });
  } else {
    for (const event of (accountingEvents ?? []) as OutboxEvent[]) {
      const handler = HANDLER_REGISTRY[event.event_type];
      try {
        if (handler === undefined) {
          await (client as any).rpc('outbox_complete', { p_event_id: event.id });
        } else {
          const result = await handler(event, client);
          if (result.success) {
            await (client as any).rpc('outbox_complete', { p_event_id: event.id });
            metrics.accounting_delivered++;
          } else {
            await (client as any).rpc('outbox_fail', {
              p_event_id: event.id,
              p_error:    result.error ?? 'accounting handler failure',
            });
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error('worker.accounting_handler_threw', {
          worker_id:  workerId,
          event_id:   event.id,
          event_type: event.event_type,
          error:      errMsg,
        });
        await (client as any).rpc('outbox_fail', { p_event_id: event.id, p_error: errMsg });
      }
    }
  }

  // Phase 3D + 4A: Maintenance tick — runs every invocation regardless of outbox state
  const maintMetrics = await runMaintenanceTick(client as any, workerId);
  metrics.reminders_processed  = maintMetrics.reminders_processed;
  metrics.reminders_failed     = maintMetrics.reminders_failed;
  metrics.reservations_expired = maintMetrics.reservations_expired;
  metrics.credits_expired      = maintMetrics.credits_expired;

  metrics.run_duration_ms = Date.now() - startedAt;

  logger.info('worker.run_complete', { ...metrics });

  return metrics;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (WORKER_SECRET !== undefined && WORKER_SECRET !== '' && token !== WORKER_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const workerId = `edge-${crypto.randomUUID()}`;

  logger.info('worker.invoked', { worker_id: workerId, batch_size: BATCH_SIZE });

  try {
    const metrics = await runWorker(workerId);
    return new Response(JSON.stringify(metrics), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error('worker.fatal_error', {
      worker_id: workerId,
      error:     err instanceof Error ? err.message : String(err),
      stack:     err instanceof Error ? err.stack : undefined,
    });
    return new Response(
      JSON.stringify({ error: 'Worker failed', worker_id: workerId }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
