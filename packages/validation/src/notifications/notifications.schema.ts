import { z } from 'zod';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UuidSchema = z.string().regex(UUID_RE, 'Must be a valid UUID');

const CHANNELS = ['email', 'sms', 'push', 'internal'] as const;
const RECIPIENT_TYPES = ['student', 'instructor', 'admin'] as const;
const NOTIFICATION_STATUSES = ['pending', 'sending', 'sent', 'failed', 'cancelled'] as const;
const WAITLIST_STATUSES = ['waiting', 'promoted', 'expired', 'cancelled'] as const;
const AUTOMATION_RULE_TYPES = [
  'reservation_expiry', 'reminder_24h', 'reminder_2h', 'reminder_1h',
  'auto_confirm', 'waitlist_promotion',
] as const;

// ── Notifications ────────────────────────────────────────────────────────────

export const CreateNotificationSchema = z.object({
  recipient_id:     UuidSchema,
  recipient_type:   z.enum(RECIPIENT_TYPES),
  channel:          z.enum(CHANNELS),
  template_key:     z.string().min(1).max(200),
  locale:           z.string().min(2).max(10).optional(),
  subject:          z.string().max(500).nullable().optional(),
  body:             z.string().max(10000).nullable().optional(),
  metadata:         z.record(z.unknown()).optional(),
  idempotency_key:  z.string().max(500).nullable().optional(),
  scheduled_for:    z.string().datetime({ offset: true }).nullable().optional(),
  reference_type:   z.string().max(100).nullable().optional(),
  reference_id:     UuidSchema.nullable().optional(),
});

export const NotificationListQuerySchema = z.object({
  page:         z.coerce.number().int().min(1).optional(),
  per_page:     z.coerce.number().int().min(1).max(100).optional(),
  sort_by:      z.string().optional(),
  sort_dir:     z.enum(['asc', 'desc']).optional(),
  recipient_id: UuidSchema.optional(),
  channel:      z.enum(CHANNELS).optional(),
  status:       z.enum(NOTIFICATION_STATUSES).optional(),
  template_key: z.string().optional(),
  from:         z.string().datetime({ offset: true }).optional(),
  to:           z.string().datetime({ offset: true }).optional(),
});

// ── Preferences ──────────────────────────────────────────────────────────────

export const UpsertPreferenceSchema = z.object({
  profile_id:        UuidSchema,
  channel:           z.enum(CHANNELS),
  notification_type: z.string().min(1).max(100),
  enabled:           z.boolean(),
});

// ── Waitlist ─────────────────────────────────────────────────────────────────

export const JoinWaitlistSchema = z.object({
  slot_id:    UuidSchema,
  student_id: UuidSchema,
  priority:   z.number().int().min(0).max(9999).optional(),
  expires_at: z.string().datetime({ offset: true }).nullable().optional(),
  notes:      z.string().max(2000).nullable().optional(),
});

export const WaitlistListQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  slot_id:  UuidSchema.optional(),
  status:   z.enum(WAITLIST_STATUSES).optional(),
});

// ── Automation rules ─────────────────────────────────────────────────────────

export const UpsertAutomationRuleSchema = z.object({
  rule_type: z.enum(AUTOMATION_RULE_TYPES),
  enabled:   z.boolean().optional(),
  config:    z.record(z.unknown()).optional(),
});

// ── Inferred DTO types ────────────────────────────────────────────────────────

export type CreateNotificationDto    = z.infer<typeof CreateNotificationSchema>;
export type NotificationListQueryDto = z.infer<typeof NotificationListQuerySchema>;
export type UpsertPreferenceDto      = z.infer<typeof UpsertPreferenceSchema>;
export type JoinWaitlistDto          = z.infer<typeof JoinWaitlistSchema>;
export type WaitlistListQueryDto     = z.infer<typeof WaitlistListQuerySchema>;
export type UpsertAutomationRuleDto  = z.infer<typeof UpsertAutomationRuleSchema>;
