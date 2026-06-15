// ─── RFC 4180-compatible CSV Parser ──────────────────────────────────────────
// No external dependencies. Handles quoted fields, embedded commas, and
// embedded newlines inside quoted fields.

export interface ParseResult {
  headers:  string[];
  rows:     Array<Record<string, string>>;
  errors:   string[];
  rowCount: number;
}

/**
 * Parse a CSV string into rows.
 * Normalizes line endings, handles quoted fields with commas and embedded newlines.
 */
export function parseCsv(text: string): ParseResult {
  const errors: string[] = [];

  // Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return { headers: [], rows: [], errors: ['Filen är tom'], rowCount: 0 };

  const rawRows = splitCsvRows(normalized);
  if (rawRows.length < 2) {
    return {
      headers:  [],
      rows:     [],
      errors:   ['Filen innehåller inga datarader (enbart rubrikrad)'],
      rowCount: 0,
    };
  }

  const headers = parseCsvRow(rawRows[0] ?? '').map(
    (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  );

  if (headers.length === 0) {
    return { headers: [], rows: [], errors: ['Inga kolumner hittades i rubrikraden'], rowCount: 0 };
  }

  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < rawRows.length; i++) {
    const line = rawRows[i];
    if (!line?.trim()) continue; // skip blank lines

    const cells = parseCsvRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx]?.trim() ?? '';
    });
    rows.push(row);

    if (rows.length > 2000) {
      errors.push('Filen innehåller fler än 2 000 rader. Dela upp filen i mindre delar.');
      break;
    }
  }

  return { headers, rows, errors, rowCount: rows.length };
}

function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let i = 0;

  while (i < line.length) {
    if (line[i] === '"') {
      // Quoted field
      let cell = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          cell += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          cell += line[i];
          i++;
        }
      }
      cells.push(cell);
      if (line[i] === ',') i++; // skip comma after closing quote
    } else {
      // Unquoted field — read until comma
      const start = i;
      while (i < line.length && line[i] !== ',') i++;
      cells.push(line.slice(start, i));
      if (line[i] === ',') i++;
    }
  }

  return cells;
}

function splitCsvRows(text: string): string[] {
  // Split on newlines, but not inside quoted fields
  const rows: string[] = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuote = !inQuote;
      current += ch;
    } else if (ch === '\n' && !inQuote) {
      rows.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim()) rows.push(current);
  return rows;
}
