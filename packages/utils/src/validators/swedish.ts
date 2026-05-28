/**
 * Swedish regulatory validators.
 * All return boolean — use with Zod .refine() for form validation.
 */

/**
 * Validate Swedish personal number (Personnummer).
 * Supports both 10-digit (YYMMDD-XXXX) and 12-digit (YYYYMMDD-XXXX) formats.
 * Validates the Luhn checksum.
 */
export function isValidPersonalNumber(value: string): boolean {
  const cleaned = value.replace(/[-\s]/g, '');

  let digits: string;
  if (cleaned.length === 12) {
    digits = cleaned.slice(2); // Strip century
  } else if (cleaned.length === 10) {
    digits = cleaned;
  } else {
    return false;
  }

  // Validate date part
  const month = parseInt(digits.slice(2, 4), 10);
  const day = parseInt(digits.slice(4, 6), 10);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Luhn algorithm on first 9 digits
  const luhn = digits
    .slice(0, 9)
    .split('')
    .reduce((sum, digit, index) => {
      let n = parseInt(digit, 10);
      if (index % 2 === 0) n *= 2;
      if (n > 9) n -= 9;
      return sum + n;
    }, 0);

  const checkDigit = (10 - (luhn % 10)) % 10;
  return checkDigit === parseInt(digits[9] ?? '', 10);
}

/**
 * Validate Swedish organization number (Organisationsnummer).
 * Format: XXXXXX-XXXX (10 digits with optional dash)
 * Third digit must be >= 2 (not a personal number).
 */
export function isValidOrgNumber(value: string): boolean {
  const cleaned = value.replace(/[-\s]/g, '');
  if (cleaned.length !== 10) return false;
  if (!/^\d{10}$/.test(cleaned)) return false;
  if (parseInt(cleaned[2] ?? '0', 10) < 2) return false;
  return isLuhnValid(cleaned);
}

/**
 * Validate Swedish postal code (Postnummer).
 * Must be exactly 5 digits.
 */
export function isValidPostalCode(value: string): boolean {
  return /^\d{3}\s?\d{2}$/.test(value.trim());
}

/**
 * Validate a Swedish mobile number.
 * Accepts: 07X-XXX XX XX, 07XXXXXXXX, +467XXXXXXXX
 */
export function isValidSwedishMobile(value: string): boolean {
  const cleaned = value.replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('+46')) {
    return /^\+467\d{8}$/.test(cleaned);
  }
  return /^07\d{8}$/.test(cleaned);
}

/**
 * Validate a Swedish VAT number (Momsnummer).
 * Format: SE + 12 digits
 */
export function isValidVatNumber(value: string): boolean {
  return /^SE\d{12}$/.test(value.toUpperCase());
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isLuhnValid(value: string): boolean {
  const digits = value.split('').map(Number);
  const checkDigit = digits.pop();
  const sum = digits
    .reverse()
    .reduce((acc, digit, index) => {
      let n = index % 2 === 0 ? digit * 2 : digit;
      if (n > 9) n -= 9;
      return acc + n;
    }, 0);
  return (10 - (sum % 10)) % 10 === checkDigit;
}
