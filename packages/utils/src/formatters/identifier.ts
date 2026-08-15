/**
 * Fallback formatter for raw backend identifiers (event types, notification
 * template keys, trigger events) shown in "friendly" UI surfaces that have
 * no curated human label for that identifier yet. Turns "booking.created",
 * "Student.Created" or "booking_reconciliation_reminder" into a single,
 * consistent style: "Booking created" / "Student created" / "Booking
 * reconciliation reminder".
 *
 * Not for technical/debug surfaces (logs, admin mapping tables) where the
 * exact raw identifier is the point — those should keep showing it verbatim.
 */
export function humanizeIdentifier(raw: string): string {
  const spaced = raw.replace(/[._]/g, ' ').toLowerCase().trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
