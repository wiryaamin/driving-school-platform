import type { UUID, Timestamp } from './common.types.js';
import type { SystemRole } from './rbac.types.js';

// ─── Domain Event Types ───────────────────────────────────────────────────────

export type DomainEventType =
  // Auth
  | 'Auth.User.SignedIn'
  | 'Auth.User.SignedOut'
  | 'Auth.User.PasswordChanged'
  | 'Auth.User.InviteAccepted'
  // Administration
  | 'Administration.Organization.Provisioned'
  | 'Administration.Organization.Suspended'
  | 'Administration.User.Invited'
  | 'Administration.Role.Assigned'
  | 'Administration.Role.Revoked'
  // Students
  | 'Students.Student.Enrolled'
  | 'Students.Student.Updated'
  | 'Students.Student.Graduated'
  | 'Students.Student.Cancelled'
  | 'Students.Progress.MilestoneReached'
  | 'Students.Progress.Updated'
  // Scheduling
  | 'Scheduling.Lesson.Booked'
  | 'Scheduling.Lesson.Cancelled'
  | 'Scheduling.Lesson.Completed'
  | 'Scheduling.Lesson.NoShow'
  | 'Scheduling.Lesson.Rescheduled'
  // Finance
  | 'Finance.Invoice.Created'
  | 'Finance.Invoice.Sent'
  | 'Finance.Invoice.Paid'
  | 'Finance.Invoice.Voided'
  | 'Finance.Invoice.Overdue'
  | 'Finance.Payment.Received'
  | 'Finance.Package.Purchased'
  // Documents
  | 'Documents.Document.Uploaded'
  | 'Documents.Document.Signed'
  | 'Documents.Document.Deleted'
  // Communications
  | 'Communications.Message.Sent'
  | 'Notifications.Notification.Delivered';

// ─── Domain Event Envelope ────────────────────────────────────────────────────

export interface DomainEvent<TPayload = unknown> {
  id: UUID;
  type: DomainEventType;
  version: number;
  organization_id: UUID;
  actor_id: UUID;
  actor_role: SystemRole;
  occurred_at: Timestamp;
  correlation_id: UUID;
  causation_id: UUID | null;
  payload: TPayload;
  metadata: Record<string, unknown>;
}

// ─── Specific Event Payloads ──────────────────────────────────────────────────

export interface LessonBookedPayload {
  lesson_id: UUID;
  student_id: UUID;
  instructor_id: UUID;
  lesson_date: string;
  start_time: string;
  duration_minutes: number;
}

export interface InvoicePaidPayload {
  invoice_id: UUID;
  student_id: UUID;
  amount_sek: number;
  payment_method: string;
  paid_at: Timestamp;
}
