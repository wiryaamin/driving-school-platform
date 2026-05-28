/**
 * Swedish currency formatters (SEK).
 * All monetary values in the platform are stored as NUMERIC(12,2) in SEK.
 */

const sekFormatter = new Intl.NumberFormat('sv-SE', {
  style: 'currency',
  currency: 'SEK',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const sekFormatterNoDecimals = new Intl.NumberFormat('sv-SE', {
  style: 'currency',
  currency: 'SEK',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('sv-SE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format an amount as Swedish SEK with decimals: "1 250,00 kr"
 */
export function formatSek(amount: number): string {
  return sekFormatter.format(amount);
}

/**
 * Format an amount as Swedish SEK without decimals: "1 250 kr"
 */
export function formatSekRounded(amount: number): string {
  return sekFormatterNoDecimals.format(amount);
}

/**
 * Format a number in Swedish format: "1 250,00"
 */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/**
 * Parse a Swedish-formatted number string to a number.
 * "1 250,00" → 1250.00
 */
export function parseSwedishNumber(value: string): number {
  return parseFloat(value.replace(/\s/g, '').replace(',', '.'));
}

/**
 * Format VAT (25% in Sweden): returns the VAT amount from a gross price
 */
export function calculateVat(grossAmount: number, vatRate = 0.25): number {
  return grossAmount - grossAmount / (1 + vatRate);
}

/**
 * Format for invoice display: amount + currency on separate line
 */
export function formatInvoiceAmount(amount: number): { formatted: string; currency: string } {
  return {
    formatted: numberFormatter.format(amount),
    currency: 'SEK',
  };
}
