/**
 * Person Lookup Framework — provider abstraction for identity-based lookup
 * services (Sprint 6, Student Registration Intelligence).
 *
 * Version 1.0 ships a Mock Provider only. Future providers (e.g. Statens
 * personadressregister / SPAR) integrate by adding a new case to
 * getPersonLookupProvider() and a new class implementing PersonLookupProvider
 * — callers (the students Edge Function, and ultimately the frontend) never
 * change, mirroring the credentials-from-env / graceful-degradation idiom
 * already established in comm-providers.ts.
 *
 * No external identity data is persisted by this module. A lookup result is
 * returned to the caller for the duration of the registration session only.
 */

// ─── Capability model ─────────────────────────────────────────────────────────

export interface PersonLookupCapabilities {
  address:     boolean;
  municipality: boolean;
  gender:      boolean;
  postalCode:  boolean;
  dateOfBirth: boolean;
}

export interface PersonLookupData {
  first_name?:    string;
  last_name?:     string;
  address_line1?: string;
  postal_code?:   string;
  city?:          string; // municipality
  gender?:        'male' | 'female';
  date_of_birth?: string; // YYYY-MM-DD
}

export type PersonLookupStatus = 'found' | 'not_found' | 'unavailable';

export interface PersonLookupResult {
  status: PersonLookupStatus;
  data:   PersonLookupData | null;
}

// ─── Provider interface ────────────────────────────────────────────────────────

// getProviderName/getProviderCapabilities are synchronous by design: for any
// realistic provider (including a future SPAR implementation) these are
// fixed, known-at-construction metadata, not values that require network
// I/O. validateConnection/lookupByPersonnummer — the two operations a live
// provider actually performs over the network — are Promise-based and must
// stay that way; a future implementation is free to `await fetch(...)`
// inside either without any interface change.
export interface PersonLookupProvider {
  getProviderName(): string;
  getProviderCapabilities(): PersonLookupCapabilities;
  validateConnection(): Promise<boolean>;
  lookupByPersonnummer(personnummer: string): Promise<PersonLookupResult>;
}

// ─── Personnummer format validation (Deno can't import workspace packages —
//     duplicated from packages/utils/src/validators/swedish.ts's
//     isValidPersonalNumber, same Luhn algorithm) ────────────────────────────

export function isValidPersonnummerFormat(value: string): boolean {
  const cleaned = value.replace(/[-\s]/g, '');

  let digits: string;
  if (cleaned.length === 12) {
    digits = cleaned.slice(2);
  } else if (cleaned.length === 10) {
    digits = cleaned;
  } else {
    return false;
  }

  const month = parseInt(digits.slice(2, 4), 10);
  const day   = parseInt(digits.slice(4, 6), 10);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

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

// Normalize to the bare 10-digit form (YYMMDDXXXX) used as the fixture key.
function normalize10(personnummer: string): string {
  const cleaned = personnummer.replace(/[-\s]/g, '');
  return cleaned.length === 12 ? cleaned.slice(2) : cleaned;
}

// ─── Mock Provider ──────────────────────────────────────────────────────────
//
// Reusable, deterministic fixture data. Do NOT algorithmically synthesize
// people — a personnummer either matches a known fixture (found) or it
// doesn't (not_found), exactly as a real registry would behave for an
// unregistered person. Extend this list to add more test personas.

const MOCK_FIXTURES: Record<string, PersonLookupData> = {
  // Each entry's `gender` matches the Luhn-encoded gender digit of its own
  // personnummer key (Swedish convention: odd sequence digit = male, even =
  // female) — first_name is chosen to match that gender, not the reverse.
  '9001011239': {
    first_name: 'Anders', last_name: 'Karlsson',
    address_line1: 'Storgatan 12', postal_code: '111 22', city: 'Stockholm',
    gender: 'male', date_of_birth: '1990-01-01',
  },
  '8506154569': {
    first_name: 'Elin', last_name: 'Lindqvist',
    address_line1: 'Kungsgatan 45', postal_code: '411 19', city: 'Göteborg',
    gender: 'female', date_of_birth: '1985-06-15',
  },
  '9503207897': {
    first_name: 'Simon', last_name: 'Nilsson',
    address_line1: 'Drottninggatan 7', postal_code: '212 11', city: 'Malmö',
    gender: 'male', date_of_birth: '1995-03-20',
  },
  '7811222343': {
    first_name: 'Maria', last_name: 'Persson',
    address_line1: 'Vasagatan 3', postal_code: '753 10', city: 'Uppsala',
    gender: 'female', date_of_birth: '1978-11-22',
  },
  '0208145672': {
    first_name: 'Emil', last_name: 'Andersson',
    address_line1: 'Ringvägen 88', postal_code: '702 15', city: 'Örebro',
    gender: 'male', date_of_birth: '2002-08-14',
  },
};

export class MockPersonLookupProvider implements PersonLookupProvider {
  getProviderName(): string {
    return 'mock';
  }

  getProviderCapabilities(): PersonLookupCapabilities {
    return {
      address:      true,
      municipality: true,
      gender:       true,
      postalCode:   true,
      dateOfBirth:  true,
    };
  }

  validateConnection(): Promise<boolean> {
    // The Mock Provider has no external dependency — always available.
    return Promise.resolve(true);
  }

  lookupByPersonnummer(personnummer: string): Promise<PersonLookupResult> {
    const key = normalize10(personnummer);
    const fixture = MOCK_FIXTURES[key];
    if (!fixture) return Promise.resolve({ status: 'not_found', data: null });
    return Promise.resolve({ status: 'found', data: fixture });
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────
//
// Reads the configured provider name from Deno.env (Supabase Secrets), same
// idiom as comm-providers.ts. No provider configured, or an unrecognized
// name, both fall back to the Mock Provider — Version 1.0 ships Mock-only by
// design (no live provider exists yet), and the framework must remain fully
// functional either way.

export function getPersonLookupProvider(): PersonLookupProvider {
  const configured = Deno.env.get('PERSON_LOOKUP_PROVIDER') ?? 'mock';

  switch (configured) {
    case 'mock':
    default:
      // Future: case 'spar': return new SparPersonLookupProvider();
      return new MockPersonLookupProvider();
  }
}
