// Swedish, business-facing names for the system notification templates.
// Template keys (e.g. "booking.confirmed") are internal identifiers and are
// never shown to the school.

const TEMPLATE_LABELS: Record<string, string> = {
  'booking.confirmed':               'Lektion bokad',
  'booking.confirmed.instructor':    'Lektion bokad (till läraren)',
  'booking.cancelled':               'Lektion avbokad',
  'booking.cancelled.instructor':    'Lektion avbokad (till läraren)',
  'booking.rescheduled':             'Lektion flyttad',
  'booking.rescheduled.instructor':  'Lektion flyttad (till läraren)',
  'booking.reminder.24h':            'Påminnelse dagen före',
  'booking.reminder_1d':             'Påminnelse dagen före (kort)',
  'booking.reminder.same_day':       'Påminnelse samma dag',
  'booking.reminder.2h':             'Påminnelse två timmar före',
  'booking.reminder_2h':             'Påminnelse två timmar före (kort)',
  'booking.reconciliation_reminder': 'Obekräftade lektioner (till läraren)',
  'booking.waitlist_available':      'Ledig tid från väntelistan',
  'lesson.reminder.24h':             'Lektionspåminnelse dagen före',
  'lesson.reminder.2h':              'Lektionspåminnelse två timmar före',
  'lesson.reminder.1h':              'Lektionspåminnelse en timme före',
  'waitlist.promoted':               'Plats ledig från väntelistan',
  'reservation.expired':             'Reserverad tid har gått ut',
  'instructor.schedule.daily':       'Dagsschema till läraren',
  'invoice.issued':                  'Ny faktura',
  'invoice.due':                     'Faktura förfaller snart',
  'invoice.overdue':                 'Betalningspåminnelse',
  'invoice.payment_reminder':        'Påminnelse om betalning',
  'refund.processed':                'Återbetalning genomförd',
  'welcome.new_student':             'Välkommen som elev',
  'permit.expiring':                 'Körkortstillståndet går snart ut',
  'exam.scheduled':                  'Prov bokat',
  'lead.created':                    'Ny intresseanmälan',
  'enrollment_request.created':      'Ny anmälan',
};

/** Human Swedish name for a template; falls back to its subject, never the raw key. */
export function templateLabel(t: { key: string; subject?: string | null }): string {
  return TEMPLATE_LABELS[t.key] ?? (t.subject?.trim() || 'Egen mall');
}
