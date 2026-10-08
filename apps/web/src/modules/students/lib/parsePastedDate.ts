// Independent parser (no shared Trafikverket/TABS parser exists in this
// codebase) turning a pasted or typed date into ISO YYYY-MM-DD. Primary
// shape is the Swedish standard YYYY-MM-DD; the exact Trafikverket
// clipboard output has not been verified against a real copy. Day-first
// only for dotted/slashed day-month-year, since Swedish never writes month
// first. Returns null for anything that isn't a real calendar date.

const SWEDISH_MONTHS: Record<string, number> = {
  jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, mars: 3, apr: 4, april: 4,
  maj: 5, jun: 6, juni: 6, jul: 7, juli: 7, aug: 8, augusti: 8,
  sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

function toIso(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parsePastedDate(raw: string): string | null {
  const text = raw.replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/[\u2010-\u2015]/g, '-').trim().toLowerCase();
  if (!text) return null;

  // YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD (also embedded in surrounding text)
  let m = text.match(/(?<!\d)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/);
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]));

  // DD.MM.YYYY / DD/MM/YYYY / DD-MM-YYYY (day first)
  m = text.match(/(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?!\d)/);
  if (m) return toIso(Number(m[3]), Number(m[2]), Number(m[1]));

  // YYYYMMDD
  m = text.match(/(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/);
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]));

  // "12 maj 2027", "3 sep. 2026"
  m = text.match(/(?<!\d)(\d{1,2})\.?\s+([a-zåäö]+)\.?\s+(\d{4})(?!\d)/);
  if (m) {
    const month = SWEDISH_MONTHS[m[2]!];
    if (month) return toIso(Number(m[3]), month, Number(m[1]));
  }
  return null;
}

/** Formats raw keyboard input as YYYY-MM-DD while typing (digits only, max 8). */
export function formatTypedDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}
