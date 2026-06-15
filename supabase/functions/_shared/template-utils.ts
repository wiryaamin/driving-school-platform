/**
 * Notification template variable substitution.
 *
 * Replaces {variable_name} placeholders with caller-provided values.
 * Supports full Unicode including Swedish characters (ä, ö, å).
 * Unknown placeholders are left unchanged: {unknown_key}.
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
  // [^}]+ matches any character except } — handles Unicode, spaces, hyphens.
  return text.replace(/\{([^}]+)\}/g, (match, key: string) => vars[key] ?? match);
}
