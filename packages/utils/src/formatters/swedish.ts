/**
 * Swedish-specific formatters.
 * All Swedish regulatory formats are handled here — single source of truth.
 */

/**
 * Format a Swedish personal number for display.
 * Accepts: YYYYMMDDXXXX, YYYYMMDD-XXXX, YYMMDDXXXX, YYMMDD-XXXX
 * Returns: YYYYMMDD-XXXX (full) or YYMMDD-XXXX (short) based on preference
 */
export function formatPersonalNumber(
  value: string,
  format: 'full' | 'short' = 'full'
): string {
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 12) {
    if (format === 'short') {
      return `${cleaned.slice(2, 8)}-${cleaned.slice(8)}`;
    }
    return `${cleaned.slice(0, 8)}-${cleaned.slice(8)}`;
  }
  return value;
}

/**
 * Mask a Swedish personal number for safe display.
 * YYYYMMDD-XXXX → YYYYMMDD-****
 */
export function maskPersonalNumber(value: string): string {
  const formatted = formatPersonalNumber(value);
  const parts = formatted.split('-');
  if (parts.length === 2) {
    return `${parts[0]}-****`;
  }
  return '****-****';
}

/**
 * Format a Swedish organization number.
 * Input: XXXXXXXXXX (10 digits)
 * Output: XXXXXX-XXXX
 */
export function formatOrgNumber(value: string): string {
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 6)}-${cleaned.slice(6)}`;
  }
  return value;
}

/**
 * Format a Swedish postal code.
 * Input: 12345 or 123 45
 * Output: 123 45
 */
export function formatPostalCode(value: string): string {
  const cleaned = value.replace(/\s/g, '');
  if (cleaned.length === 5) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
  }
  return value;
}

/**
 * Format a Swedish phone number for display.
 * Handles both local (07X) and international (+46) formats.
 */
export function formatSwedishPhone(value: string): string {
  const cleaned = value.replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('+46')) {
    const local = `0${cleaned.slice(3)}`;
    return formatLocalPhone(local);
  }
  return formatLocalPhone(cleaned);
}

function formatLocalPhone(cleaned: string): string {
  // Mobile: 07X-XXX XX XX
  if (/^07\d/.test(cleaned) && cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)} ${cleaned.slice(6, 8)} ${cleaned.slice(8)}`;
  }
  return cleaned;
}

/**
 * Format a Bankgiro number.
 * Input: XXXXXXX or XXXXXXXX
 * Output: XXX-XXXX or XXXX-XXXX
 */
export function formatBankgiro(value: string): string {
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length === 7) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
  }
  if (cleaned.length === 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
  }
  return value;
}

/**
 * Extract birth date from a Swedish personal number.
 * Returns a Date object or null if invalid.
 */
export function birthDateFromPersonalNumber(value: string): Date | null {
  const cleaned = value.replace(/\D/g, '');
  try {
    if (cleaned.length === 12) {
      const year = parseInt(cleaned.slice(0, 4), 10);
      const month = parseInt(cleaned.slice(4, 6), 10) - 1;
      const day = parseInt(cleaned.slice(6, 8), 10);
      return new Date(year, month, day);
    }
    if (cleaned.length === 10) {
      const year = parseInt(cleaned.slice(0, 2), 10);
      const fullYear = year >= 0 && year <= 30 ? 2000 + year : 1900 + year;
      const month = parseInt(cleaned.slice(2, 4), 10) - 1;
      const day = parseInt(cleaned.slice(4, 6), 10);
      return new Date(fullYear, month, day);
    }
    return null;
  } catch {
    return null;
  }
}
