// Shared business wording for automatic messages (notification rules), used by
// the communication overview and the Utskick/Notisregler page.

// Business wording only — the tenant configures *what the school sends*, never
// the technical event names behind it.
export const TRIGGER_EVENTS = [
  { value: 'booking_confirmed',          label: 'Bekräftelse när en lektion bokas' },
  { value: 'booking_cancelled',          label: 'Bekräftelse när en lektion avbokas' },
  { value: 'booking_rescheduled',        label: 'Besked när en lektion flyttas' },
  { value: 'booking_reminder_24h',       label: 'Påminnelse dagen före lektionen' },
  { value: 'booking_reminder_same_day',  label: 'Påminnelse samma dag som lektionen' },
  { value: 'instructor_schedule_daily',  label: 'Dagsschema till läraren' },
  { value: 'waitlist_promoted',          label: 'Besked när en plats från väntelistan blir ledig' },
  { value: 'reservation_expired',        label: 'Besked när en reserverad tid har gått ut' },
  { value: 'invoice_issued',             label: 'Faktura skickad' },
  { value: 'invoice_due',                label: 'Påminnelse innan fakturan förfaller' },
  { value: 'invoice_overdue',            label: 'Påminnelse om förfallen faktura' },
  { value: 'refund_processed',           label: 'Besked om återbetalning' },
  { value: 'student_created',            label: 'Välkomstmeddelande till ny elev' },
  { value: 'permit_expiring',            label: 'Påminnelse när körkortstillståndet snart går ut' },
  { value: 'exam_scheduled',             label: 'Besked när ett prov är bokat' },
  { value: 'booking_reconciliation_reminder', label: 'Påminnelse till läraren om obekräftade lektioner' },
  { value: 'lead_created',               label: 'Avisering om ny intresseanmälan' },
  { value: 'enrollment_request_created', label: 'Avisering om ny anmälan' },
] as const;

export type TriggerEvent = (typeof TRIGGER_EVENTS)[number]['value'];

// Rule types the system never dispatches through notification_rules (no sender
// exists for them — student_created only queues an in-app notice). Shown as
// switches they would look like working automation, so they are not listed.
export const UNDISPATCHED_EVENTS = new Set<string>(['invoice_due', 'student_created', 'permit_expiring', 'exam_scheduled']);

// The automatic messages every school should have: on for new schools, and one
// click away for schools created before that default existed.
export const CORE_STUDENT_EVENTS = ['booking_confirmed', 'booking_cancelled', 'booking_rescheduled', 'booking_reminder_24h'] as const;

export function eventLabel(triggerEvent: string): string {
  return TRIGGER_EVENTS.find((t) => t.value === triggerEvent)?.label ?? 'Övrigt utskick';
}
