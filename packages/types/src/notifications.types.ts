import type { UUID, Timestamp } from './common.types.js';
import type {
  NotificationStatusEnum,
  ReminderStatusEnum,
  WaitlistStatusEnum,
  AutomationRuleTypeEnum,
  Json,
} from './database.types.js';

export type NotificationStatus  = NotificationStatusEnum;
export type ReminderStatus      = ReminderStatusEnum;
export type WaitlistStatus      = WaitlistStatusEnum;
export type AutomationRuleType  = AutomationRuleTypeEnum;

export type NotificationChannel = 'email' | 'sms' | 'push' | 'internal';
export type RecipientType       = 'student' | 'instructor' | 'admin';

// ─── Domain models ────────────────────────────────────────────────────────────

export interface NotificationTemplate {
  id:              UUID;
  organization_id: UUID | null;
  key:             string;
  locale:          string;
  channel:         NotificationChannel;
  subject:         string | null;
  body_html:       string | null;
  body_text:       string;
  variables:       string[];
  is_active:       boolean;
  created_at:      Timestamp;
  updated_at:      Timestamp;
}

export interface Notification {
  id:                UUID;
  organization_id:   UUID;
  recipient_id:      UUID;
  recipient_type:    RecipientType;
  channel:           NotificationChannel;
  template_key:      string;
  locale:            string;
  subject:           string | null;
  body:              string | null;
  metadata:          Json;
  status:            NotificationStatus;
  status_changed_at: Timestamp | null;
  sent_at:           Timestamp | null;
  failed_at:         Timestamp | null;
  failure_reason:    string | null;
  retry_count:       number;
  max_retries:       number;
  idempotency_key:   string | null;
  scheduled_for:     Timestamp | null;
  reference_type:    string | null;
  reference_id:      UUID | null;
  created_at:        Timestamp;
  updated_at:        Timestamp;
}

export interface NotificationPreference {
  id:                UUID;
  organization_id:   UUID;
  profile_id:        UUID;
  channel:           NotificationChannel;
  notification_type: string;
  enabled:           boolean;
  created_at:        Timestamp;
  updated_at:        Timestamp;
}

export interface LessonReminder {
  id:              UUID;
  organization_id: UUID;
  booking_id:      UUID;
  recipient_id:    UUID;
  recipient_type:  'student' | 'instructor';
  reminder_type:   string;
  offset_minutes:  number;
  scheduled_for:   Timestamp;
  status:          ReminderStatus;
  notification_id: UUID | null;
  idempotency_key: string;
  created_at:      Timestamp;
  updated_at:      Timestamp;
}

export interface WaitlistEntry {
  id:                   UUID;
  organization_id:      UUID;
  slot_id:              UUID;
  student_id:           UUID;
  priority:             number;
  status:               WaitlistStatus;
  status_changed_at:    Timestamp | null;
  expires_at:           Timestamp | null;
  promoted_booking_id:  UUID | null;
  notified_at:          Timestamp | null;
  reservation_deadline: Timestamp | null;
  notes:                string | null;
  created_at:           Timestamp;
  updated_at:           Timestamp;
}

export interface AutomationRule {
  id:              UUID;
  organization_id: UUID;
  rule_type:       AutomationRuleType;
  enabled:         boolean;
  config:          Json;
  created_at:      Timestamp;
  updated_at:      Timestamp;
}

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreateNotificationInput {
  recipient_id:     UUID;
  recipient_type:   RecipientType;
  channel:          NotificationChannel;
  template_key:     string;
  locale?:          string;
  subject?:         string | null;
  body?:            string | null;
  metadata?:        Json;
  idempotency_key?: string | null;
  scheduled_for?:   Timestamp | null;
  reference_type?:  string | null;
  reference_id?:    UUID | null;
}

export interface UpsertPreferenceInput {
  profile_id:        UUID;
  channel:           NotificationChannel;
  notification_type: string;
  enabled:           boolean;
}

export interface JoinWaitlistInput {
  slot_id:    UUID;
  student_id: UUID;
  priority?:  number;
  expires_at?: Timestamp | null;
  notes?:     string | null;
}

export interface UpsertAutomationRuleInput {
  rule_type: AutomationRuleType;
  enabled?:  boolean;
  config?:   Json;
}

// ─── Insert/Update types (repository layer) ───────────────────────────────────

export interface NotificationInsert extends CreateNotificationInput {
  status?: NotificationStatus;
}

export interface NotificationUpdate {
  status?:            NotificationStatus;
  status_changed_at?: Timestamp | null;
  sent_at?:           Timestamp | null;
  failed_at?:         Timestamp | null;
  failure_reason?:    string | null;
  retry_count?:       number;
  subject?:           string | null;
  body?:              string | null;
}

export interface WaitlistEntryInsert extends JoinWaitlistInput {
  status?: WaitlistStatus;
}

export interface WaitlistEntryUpdate {
  status?:               WaitlistStatus;
  status_changed_at?:    Timestamp | null;
  promoted_booking_id?:  UUID | null;
  notified_at?:          Timestamp | null;
  reservation_deadline?: Timestamp | null;
}

// ─── List query input types ───────────────────────────────────────────────────

export interface NotificationListQueryInput {
  page?:         number;
  per_page?:     number;
  sort_by?:      string;
  sort_dir?:     'asc' | 'desc';
  recipient_id?: UUID;
  channel?:      NotificationChannel;
  status?:       NotificationStatus;
  template_key?: string;
  from?:         Timestamp;
  to?:           Timestamp;
}

export interface WaitlistListQueryInput {
  page?:     number;
  per_page?: number;
  slot_id?:  UUID;
  status?:   WaitlistStatus;
}
