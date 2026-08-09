/**
 * Notification template variable substitution.
 *
 * Replaces {variable_name} and {{variable_name}} placeholders with
 * caller-provided values — most sms/push templates use the single-brace
 * form, but every email template (invoice.issued, invoice.overdue,
 * waitlist.promoted, reservation.expired, refund.processed, ...) was written
 * in the double-brace Mustache style, which this function never matched:
 * {{förnamn}} does not contain a bare {förnamn} substring (the inner {förnamn
 * is followed by a single }, then a second, unmatched } remains), so every
 * email ever sent by this platform rendered raw literal placeholders instead
 * of real values. Confirmed via a live Resend delivery during this feature's
 * own end-to-end verification. Matching both forms fixes every existing
 * email template without a data migration to rewrite their stored bodies.
 * Supports full Unicode including Swedish characters (ä, ö, å).
 * Unknown placeholders are left unchanged: {unknown_key} / {{unknown_key}}.
 *
 * Standard variables used in Swedish trafikskola templates:
 *   {förnamn}       — recipient first name
 *   {datum}         — lesson/event date (formatted)
 *   {tid}           — lesson time (e.g. "09:00")
 *   {trafikskola}   — organization display name
 *   {fakturanr}     — invoice number
 *   {belopp}        — amount (formatted)
 *   {förfallodatum} — invoice due date
 *   {betalsätt}     — payment method
 *   {loginlänk}     — login URL
 */
export function applyTemplateVars(
  text: string,
  vars: Record<string, string>,
): string {
  // Double-brace alternative tried first so {{key}} matches as one unit
  // rather than leaving stray braces behind; [^}]+ handles Unicode/spaces/hyphens.
  return text.replace(
    /\{\{([^}]+)\}\}|\{([^}]+)\}/g,
    (match, dblKey: string | undefined, singleKey: string | undefined) => {
      const key = dblKey ?? singleKey ?? '';
      return vars[key] ?? match;
    },
  );
}
