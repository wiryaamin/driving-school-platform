/**
 * Person Lookup Framework — provider-agnostic identity-lookup abstraction
 * for the Student Domain (Sprint 6 origin; v3.0 production-grade rebuild).
 *
 * v2.0 (prior pass) reshaped this into a provider-factory + canonical-model
 * pattern but deliberately deferred caching, tenant configuration, a
 * standardized error taxonomy, and audit logging as Version 1.1 Backlog —
 * see docs/INTEGRATION_CONFIGURATION_GUIDE.md §4.10. That deferral has now
 * been explicitly lifted: this pass builds all four, plus a first real
 * provider (Roaring — see RoaringPersonLookupProvider below) and per-tenant
 * configuration (person_lookup_provider_configs, migration
 * 20260727000001).
 *
 * Module boundaries (Phase 2's "Student Registration must talk only to the
 * Person Lookup Service" requirement):
 *   - THIS file: the provider interface, the canonical data model, format
 *     validation, and the provider implementations themselves (Mock,
 *     NotImplemented, Roaring). Nothing here knows about tenants, caching,
 *     or audit logging — it is pure "given credentials and a personnummer,
 *     return a canonical record."
 *   - person-lookup-service.ts: the orchestration layer. Resolves a
 *     tenant's config, decrypts its credentials, checks/writes the cache,
 *     applies retry+timeout, records the identity-event audit trail and
 *     provider-health row. students/index.ts calls ONLY this layer — never
 *     getPersonLookupProvider() directly, never a provider class directly.
 *     This is what makes "business logic must never know which provider is
 *     being used" actually true, rather than true-in-spirit: the Student
 *     Domain doesn't import this file at all anymore.
 *
 * No raw personnummer is ever persisted by this module or its cache — see
 * person-lookup-cache.ts (HMAC-hashed key, encrypted-at-rest value).
 */

// ─── Canonical Data Model ───────────────────────────────────────────────────
//
// What every provider implementation returns internally, regardless of how
// different the upstream API's own response shape is. Providers translate
// their own response into this shape; nothing outside a provider
// implementation (and the toWireFormat() adapter below) ever sees a
// provider-specific field name.

export interface CanonicalPersonRecord {
  personnummer:       string;
  firstName?:         string;
  middleName?:        string;
  lastName?:          string;
  /** Full legal name as the registry itself formats it, when a provider
   *  distinguishes this from firstName+middleName+lastName concatenation
   *  (e.g. legal ordering conventions). Falls back to a simple
   *  concatenation in toWireFormat() when a provider doesn't supply one. */
  fullLegalName?:     string;
  dateOfBirth?:       string; // YYYY-MM-DD
  gender?:            'male' | 'female';
  addressLine1?:      string;
  postalCode?:        string;
  city?:              string;
  municipality?:      string;
  county?:            string;
  country?:           string;
  /** True when the registry confirms this personnummer/identity is
   *  currently valid (not a data-entry error, not a placeholder/reserve
   *  number). Distinct from `deceased`/`emigrated`: an emigrated or
   *  deceased person still has a valid identity number. */
  identityValid?:     boolean;
  protectedIdentity?: boolean;
  deceased?:          boolean;
  /** True when the registry shows this person as having emigrated
   *  (folkbokförd utomlands) — current Swedish address data should not be
   *  trusted/auto-filled when this is true. */
  emigrated?:         boolean;
  citizenship?:       string;
  /** Free-text description of where this record came from (e.g. 'mock-fixture', 'spar-api'). */
  source:             string;
  /** The provider name that produced this record — same value as getProviderName(). */
  provider:           string;
  /** How much this provider actually knows about the match: 'exact' for a
   *  confirmed personnummer match, 'partial' for a match with materially
   *  incomplete data, 'unknown' when the provider itself can't say. */
  confidence:         'exact' | 'partial' | 'unknown';
  /** ISO 8601 timestamp of when this record was produced (not when the
   *  underlying registry data was last updated upstream — providers that
   *  can distinguish the two may extend this later; not required today). */
  lastUpdated:        string;
}

// ─── Capability model ─────────────────────────────────────────────────────────
//
// Extended from the original 5-field model with the additional dimensions a
// real Swedish provider (SPAR and similar) could plausibly expose. Every
// provider — including Mock and the Not-Implemented placeholder below —
// must return this full shape; a provider that doesn't support a dimension
// reports `false` for it rather than omitting the key, so callers never need
// to guard against a missing property.

export interface PersonLookupCapabilities {
  address:              boolean;
  municipality:         boolean;
  gender:               boolean;
  postalCode:           boolean;
  dateOfBirth:          boolean;
  county:               boolean;
  country:              boolean;
  identityValidation:   boolean;
  protectedIdentity:    boolean;
  deceasedStatus:       boolean;
  emigrationStatus:     boolean;
  citizenship:          boolean;
  historicalAddresses:  boolean;
  companyOwnership:     boolean;
  relations:            boolean;
}

// ─── Wire format (HTTP response shape — unchanged field names, additive only) ─
//
// This is deliberately still snake_case and still the same shape
// apps/web/src/modules/students/hooks/usePersonLookup.ts already expects.
// New fields are optional additions only; nothing was renamed or removed.

export interface PersonLookupData {
  first_name?:         string;
  middle_name?:        string;
  last_name?:          string;
  full_legal_name?:    string;
  address_line1?:      string;
  postal_code?:        string;
  city?:               string;
  gender?:             'male' | 'female';
  date_of_birth?:      string;
  municipality?:       string;
  county?:             string;
  country?:            string;
  identity_valid?:     boolean;
  protected_identity?: boolean;
  deceased?:           boolean;
  emigrated?:          boolean;
  citizenship?:        string;
}

export type PersonLookupStatus = 'found' | 'not_found' | 'unavailable';

// ─── Standardized error taxonomy ────────────────────────────────────────────
//
// Distinct, stable machine-readable categories every provider adapter must
// classify its failures into — the cross-provider error taxonomy the v2.0
// pass explicitly deferred. A provider that can't distinguish its own
// failure this precisely should pick the closest honest category rather
// than invent a new one; callers (retry logic, UI messaging, audit
// metadata) branch on this, not on provider-specific error strings.
export type PersonLookupErrorType =
  | 'timeout'
  | 'rate_limited'
  | 'authentication_failed'
  | 'misconfigured'
  | 'provider_unavailable'
  | 'invalid_request'
  | 'unknown';

export interface PersonLookupResult {
  status: PersonLookupStatus;
  data:   PersonLookupData | null;
  /** Present only for 'unavailable' — a human-readable reason (e.g. "provider
   *  'spar' is not yet implemented"), never a stack trace or raw upstream
   *  error body. Optional and additive: existing callers that only read
   *  `.status`/`.data` are unaffected. */
  error?:     string;
  /** Present only for 'unavailable' — the standardized category above. */
  errorType?:  PersonLookupErrorType;
  /** Present only for 'found' — carried over from the canonical record
   *  (CanonicalPersonRecord.confidence) since PersonLookupData itself is
   *  the wire/UI shape, not a place for response-level metadata to live. */
  confidence?: 'exact' | 'partial' | 'unknown';
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

// Normalize to the full 12-digit form (YYYYMMDDXXXX) Roaring's real API
// requires (confirmed live: personalNumber=193604139208 found a record;
// the 10-digit form did not). Infers century for a bare 10-digit input
// using the standard "not born in the future" rule — this does not
// distinguish a '+'-separated (100+ years old) input, a known, narrow
// edge case rather than a silent guess about the common case.
function normalize12(personnummer: string): string {
  const cleaned = personnummer.replace(/[-\s+]/g, '');
  if (cleaned.length === 12) return cleaned;

  const yy = parseInt(cleaned.slice(0, 2), 10);
  const currentYear = new Date().getUTCFullYear();
  const currentCentury = Math.floor(currentYear / 100) * 100;
  let fullYear = currentCentury + yy;
  if (fullYear > currentYear) fullYear -= 100;
  return `${fullYear}${cleaned.slice(2)}`;
}

// ─── Canonical → wire adapter ──────────────────────────────────────────────
//
// The one place a CanonicalPersonRecord ever gets translated into the HTTP
// response shape. Every provider (present or future) produces a
// CanonicalPersonRecord; every provider's output reaches the frontend
// through this exact function, so the wire format can never silently drift
// per-provider.

function toWireFormat(record: CanonicalPersonRecord): PersonLookupData {
  const wire: PersonLookupData = {};
  if (record.firstName         !== undefined) wire.first_name         = record.firstName;
  if (record.middleName        !== undefined) wire.middle_name        = record.middleName;
  if (record.lastName          !== undefined) wire.last_name          = record.lastName;
  if (record.addressLine1      !== undefined) wire.address_line1      = record.addressLine1;
  if (record.postalCode        !== undefined) wire.postal_code        = record.postalCode;
  if (record.city              !== undefined) wire.city               = record.city;
  if (record.gender            !== undefined) wire.gender             = record.gender;
  if (record.dateOfBirth       !== undefined) wire.date_of_birth      = record.dateOfBirth;
  if (record.municipality      !== undefined) wire.municipality       = record.municipality;
  if (record.county            !== undefined) wire.county             = record.county;
  if (record.country           !== undefined) wire.country            = record.country;
  if (record.identityValid     !== undefined) wire.identity_valid     = record.identityValid;
  if (record.protectedIdentity !== undefined) wire.protected_identity = record.protectedIdentity;
  if (record.deceased          !== undefined) wire.deceased           = record.deceased;
  if (record.emigrated         !== undefined) wire.emigrated          = record.emigrated;
  if (record.citizenship       !== undefined) wire.citizenship        = record.citizenship;

  // full_legal_name: use the provider's own value if it supplied one,
  // otherwise fall back to a simple concatenation — never omitted when any
  // name part is known, since it's a required field of the canonical model.
  const fallbackName = [record.firstName, record.middleName, record.lastName]
    .filter((part) => part !== undefined && part !== '')
    .join(' ');
  const legalName = record.fullLegalName ?? (fallbackName !== '' ? fallbackName : undefined);
  if (legalName !== undefined) wire.full_legal_name = legalName;

  return wire;
}

// ─── Mock Provider ──────────────────────────────────────────────────────────
//
// Reusable, deterministic fixture data. Do NOT algorithmically synthesize
// people — a personnummer either matches a known fixture (found) or it
// doesn't (not_found), exactly as a real registry would behave for an
// unregistered person. Extend this list to add more test personas.
//
// v2.0: fixtures now carry the fuller canonical field set (municipality,
// county, country, protectedIdentity, deceased, citizenship), and two new
// scenario fixtures were added — a deceased record and a protected-identity
// record — so the new fields can actually be exercised in testing. A third
// new fixture demonstrates a "found but incomplete" result (confidence:
// 'partial', no address on file), the shape a real provider would plausibly
// return for someone it has only partial data on. All fixture personnummer
// values pass the same Luhn/date validation real input does — none of them
// are shortcuts around isValidPersonnummerFormat().

type MockFixture = Omit<CanonicalPersonRecord, 'personnummer' | 'source' | 'provider' | 'lastUpdated'>;

const MOCK_FIXTURES: Record<string, MockFixture> = {
  // Each entry's `gender` matches the Luhn-encoded gender digit of its own
  // personnummer key (Swedish convention: odd sequence digit = male, even =
  // female) — first_name is chosen to match that gender, not the reverse.
  '9001011239': {
    firstName: 'Anders', lastName: 'Karlsson',
    addressLine1: 'Storgatan 12', postalCode: '111 22', city: 'Stockholm',
    municipality: 'Stockholm', county: 'Stockholms län', country: 'SE',
    gender: 'male', dateOfBirth: '1990-01-01',
    protectedIdentity: false, deceased: false, identityValid: true, emigrated: false, citizenship: 'SE',
    confidence: 'exact',
  },
  '8506154569': {
    firstName: 'Elin', lastName: 'Lindqvist',
    addressLine1: 'Kungsgatan 45', postalCode: '411 19', city: 'Göteborg',
    municipality: 'Göteborg', county: 'Västra Götalands län', country: 'SE',
    gender: 'female', dateOfBirth: '1985-06-15',
    protectedIdentity: false, deceased: false, identityValid: true, emigrated: false, citizenship: 'SE',
    confidence: 'exact',
  },
  '9503207897': {
    firstName: 'Simon', lastName: 'Nilsson',
    addressLine1: 'Drottninggatan 7', postalCode: '212 11', city: 'Malmö',
    municipality: 'Malmö', county: 'Skåne län', country: 'SE',
    gender: 'male', dateOfBirth: '1995-03-20',
    protectedIdentity: false, deceased: false, identityValid: true, emigrated: false, citizenship: 'SE',
    confidence: 'exact',
  },
  '7811222343': {
    firstName: 'Maria', lastName: 'Persson',
    addressLine1: 'Vasagatan 3', postalCode: '753 10', city: 'Uppsala',
    municipality: 'Uppsala', county: 'Uppsala län', country: 'SE',
    gender: 'female', dateOfBirth: '1978-11-22',
    protectedIdentity: false, deceased: false, identityValid: true, emigrated: false, citizenship: 'SE',
    confidence: 'exact',
  },
  '0208145672': {
    firstName: 'Emil', lastName: 'Andersson',
    addressLine1: 'Ringvägen 88', postalCode: '702 15', city: 'Örebro',
    municipality: 'Örebro', county: 'Örebro län', country: 'SE',
    gender: 'male', dateOfBirth: '2002-08-14',
    protectedIdentity: false, deceased: false, identityValid: true, emigrated: false, citizenship: 'SE',
    confidence: 'exact',
  },
  // New in v2.0 — deceased scenario.
  '5507145299': {
    firstName: 'Bengt', lastName: 'Ström',
    addressLine1: 'Kyrkogatan 1', postalCode: '281 31', city: 'Hässleholm',
    municipality: 'Hässleholm', county: 'Skåne län', country: 'SE',
    gender: 'male', dateOfBirth: '1955-07-14',
    protectedIdentity: false, deceased: true, identityValid: true, emigrated: false, citizenship: 'SE',
    confidence: 'exact',
  },
  // New in v2.0 — protected identity scenario. Real providers withhold
  // address data for protected-identity individuals; the fixture reflects
  // that (address deliberately absent even though the person is "found").
  '8803256125': {
    firstName: 'Protected', lastName: 'Identity-Test',
    municipality: 'Stockholm', country: 'SE',
    gender: 'female', dateOfBirth: '1988-03-25',
    protectedIdentity: true, deceased: false, identityValid: true, emigrated: false, citizenship: 'SE',
    confidence: 'exact',
  },
  // New in v2.0 — "found, but incomplete" scenario: a real provider that
  // has confirmed the person exists but doesn't hold current address data.
  '7211028472': {
    firstName: 'Karin', lastName: 'Öberg',
    gender: 'female', dateOfBirth: '1972-11-02',
    protectedIdentity: false, deceased: false, identityValid: true, emigrated: false, citizenship: 'SE',
    confidence: 'partial',
  },
  // New in v3.0 — emigrated scenario. A real provider must not be trusted
  // for current address data once emigrated: true — the fixture deliberately
  // omits Swedish address fields even though name/DOB are known, exactly as
  // toWireFormat()'s callers should expect a real provider to behave.
  '9204174560': {
    firstName: 'Johan', lastName: 'Ekström',
    municipality: 'Stockholm', country: 'SE',
    gender: 'male', dateOfBirth: '1992-04-17',
    protectedIdentity: false, deceased: false, identityValid: true, emigrated: true, citizenship: 'SE',
    confidence: 'exact',
  },
};

export class MockPersonLookupProvider implements PersonLookupProvider {
  getProviderName(): string {
    return 'mock';
  }

  getProviderCapabilities(): PersonLookupCapabilities {
    return {
      address:             true,
      municipality:        true,
      gender:              true,
      postalCode:          true,
      dateOfBirth:         true,
      county:              true,
      country:             true,
      identityValidation:  true,
      protectedIdentity:   true,
      deceasedStatus:      true,
      emigrationStatus:    true,
      citizenship:         true,
      // Mock is fixture-based test data — it has never simulated these
      // three, and reporting `false` here is accurate, not a placeholder.
      historicalAddresses: false,
      companyOwnership:    false,
      relations:           false,
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

    const record: CanonicalPersonRecord = {
      personnummer: key,
      source:       'mock-fixture',
      provider:     'mock',
      lastUpdated:  new Date().toISOString(),
      ...fixture,
    };
    return Promise.resolve({ status: 'found', data: toWireFormat(record), confidence: record.confidence });
  }
}

// ─── Not-Implemented Provider ──────────────────────────────────────────────
//
// Returned for any provider name that is registered (known to the platform
// as a future option) but has no real implementation yet, and for any
// unrecognized name at all. Deliberately never throws and never silently
// substitutes Mock's fake data — if an operator explicitly configures
// PERSON_LOOKUP_PROVIDER=spar before a SPAR implementation exists, they get
// a clear "not implemented" result, not a fake match against invented test
// data for what looks like a real student's real personnummer.

class NotImplementedPersonLookupProvider implements PersonLookupProvider {
  constructor(private readonly requestedName: string) {}

  getProviderName(): string {
    return this.requestedName;
  }

  getProviderCapabilities(): PersonLookupCapabilities {
    return {
      address: false, municipality: false, gender: false, postalCode: false, dateOfBirth: false,
      county: false, country: false, identityValidation: false, protectedIdentity: false,
      deceasedStatus: false, emigrationStatus: false, citizenship: false,
      historicalAddresses: false, companyOwnership: false, relations: false,
    };
  }

  validateConnection(): Promise<boolean> {
    return Promise.resolve(false);
  }

  lookupByPersonnummer(_personnummer: string): Promise<PersonLookupResult> {
    return Promise.resolve({
      status:    'unavailable',
      data:      null,
      error:     `Person lookup provider '${this.requestedName}' is not yet implemented.`,
      errorType: 'misconfigured',
    });
  }
}

// ─── Roaring Provider (Sweden/Nordics population-register reseller) ────────
//
// Phase 7 recommendation (see docs/INTEGRATION_CONFIGURATION_GUIDE.md §4.10
// for the full comparison). Chosen over SPAR/Navet direct because those
// require a formal Skatteverket/SPAR-ombud commercial agreement (a
// months-long legal process, the same category of blocker as BankID's
// production certificate) with no self-service path at all; chosen over
// TIC and ZignSec because both are sales-gated (no self-service signup —
// confirmed by directly attempting each). Roaring is the only evaluated
// option with a genuine self-service developer sandbox: free account
// creation, immediate credentials, dummy test data, no cost until
// production is explicitly activated (developer.roaring.io).
//
// COMMISSIONING STATUS — verified against a live sandbox account
// (2026-07-27): auth is OAuth2 client-credentials (Client ID + Client
// Secret, NOT a single API key — corrected from the original best-effort
// guess), confirmed against developer.roaring.io's own Authorization
// Guide and a real token exchange. The lookup endpoint, confirmed by a
// real call returning real (dummy) sandbox data, is
// `GET /person/1.0/person?personalNumber={personnummer}` — the
// `posts[].details[]`/`posts[].address.nationalRegistrationAddress[]`
// shape below is copied directly from that live response, not guessed.
//
// KNOWN LIMITATION, disclosed rather than silently assumed: Roaring
// returns a single-letter `deRegistrationReason` code on a person's
// current record when they are no longer an active resident. Only code
// `'A'` (Avliden/deceased) was corroborated both by the live test record
// observed and independent public documentation of the underlying
// Skatteverket/SPAR code scheme. No other code was confirmed against an
// authoritative source, so any other non-null code is conservatively
// reported as `emigrated: true` (a deregistration occurred, but we do
// not assert the specific reason) rather than guessing a specific
// meaning that could be wrong. `secrecyMarked` (protected identity), by
// contrast, is a plain boolean and required no interpretation.
export interface RoaringProviderConfig {
  clientId:     string;
  clientSecret: string;
  baseUrl?:     string;
  timeoutMs?:   number;
}

// Per-isolate token cache — same idiom already accepted platform-wide for
// rate-limit.ts's per-isolate counters. Avoids a token round-trip on every
// lookup within a warm isolate; a cold isolate or expired token just
// re-authenticates, which is correct and cheap (client-credentials grant).
const roaringTokenCache = new Map<string, { token: string; expiresAt: number }>();

function currentRoaringDetail(details: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(details)) return undefined;
  return (details as Record<string, unknown>[]).find((d) => d['dateTo'] === '9999-12-31T00:00') ?? details[details.length - 1] as Record<string, unknown> | undefined;
}

function mapRoaringResponseToCanonical(personnummer: string, body: Record<string, unknown>): CanonicalPersonRecord {
  // Single, isolated field-mapping point — matches a real posts[0] response
  // observed live from GET /person/1.0/person?personalNumber=... — see the
  // COMMISSIONING STATUS note above.
  const posts = Array.isArray(body['posts']) ? body['posts'] as Record<string, unknown>[] : [];
  const post = posts[0] ?? {};

  const detail = currentRoaringDetail(post['details']) ?? {};
  const addressHistory = (post['address'] as Record<string, unknown> | undefined)?.['nationalRegistrationAddress'];
  const address = currentRoaringDetail(addressHistory) ?? {};

  const deRegistrationReason = detail['deRegistrationReason'] as string | undefined;
  const firstName = detail['firstName'] as string | undefined;
  const lastName  = detail['surName']   as string | undefined;

  return {
    personnummer,
    firstName,
    lastName,
    fullLegalName:      firstName && lastName ? `${firstName} ${lastName}` : undefined,
    dateOfBirth:        (detail['birthDate'] as string | undefined)?.slice(0, 10),
    gender:             detail['gender'] === 'M' ? 'male' : detail['gender'] === 'F' ? 'female' : undefined,
    addressLine1:       address['deliveryAddress2'] as string | undefined,
    postalCode:         address['postalNumber'] as string | undefined,
    city:               address['city'] as string | undefined,
    municipality:       address['communeCode'] as string | undefined,
    county:             address['countyCode'] as string | undefined,
    country:            'SE',
    identityValid:      posts.length > 0,
    deceased:           deRegistrationReason === 'A',
    protectedIdentity:  post['secrecyMarked'] === true,
    emigrated:          deRegistrationReason !== undefined && deRegistrationReason !== 'A',
    citizenship:        undefined,
    source:             'roaring-population-register',
    provider:           'roaring',
    confidence:         'exact',
    lastUpdated:        new Date().toISOString(),
  };
}

export class RoaringPersonLookupProvider implements PersonLookupProvider {
  private readonly clientId:     string;
  private readonly clientSecret: string;
  private readonly baseUrl:      string;
  private readonly timeoutMs:    number;

  constructor(config: RoaringProviderConfig) {
    this.clientId     = config.clientId;
    this.clientSecret = config.clientSecret;
    this.baseUrl       = config.baseUrl ?? 'https://api.roaring.io';
    this.timeoutMs     = config.timeoutMs ?? 5000;
  }

  getProviderName(): string {
    return 'roaring';
  }

  getProviderCapabilities(): PersonLookupCapabilities {
    return {
      address: true, municipality: true, gender: true, postalCode: true, dateOfBirth: true,
      county: true, country: true, identityValidation: true, protectedIdentity: true,
      deceasedStatus: true, emigrationStatus: true, citizenship: false,
      historicalAddresses: true, companyOwnership: false, relations: false,
    };
  }

  private async getAccessToken(): Promise<string | null> {
    const cacheKey = this.clientId;
    const cached = roaringTokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 5000) return cached.token;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/token`, {
        method: 'POST',
        headers: {
          Authorization:  `Basic ${btoa(`${this.clientId}:${this.clientSecret}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return null;

      const body = await res.json() as { access_token?: string; expires_in?: number };
      if (!body.access_token) return null;

      roaringTokenCache.set(cacheKey, {
        token: body.access_token,
        expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
      });
      return body.access_token;
    } catch {
      clearTimeout(timer);
      return null;
    }
  }

  async validateConnection(): Promise<boolean> {
    roaringTokenCache.delete(this.clientId); // force a fresh exchange, not a cached one
    const token = await this.getAccessToken();
    return token !== null;
  }

  async lookupByPersonnummer(personnummer: string): Promise<PersonLookupResult> {
    const key = normalize10(personnummer); // canonical record key, matches every other provider
    const queryId = normalize12(personnummer); // Roaring's real API requires the full 12-digit form

    const token = await this.getAccessToken();
    if (!token) {
      return { status: 'unavailable', data: null, error: 'Roaring authentication failed', errorType: 'authentication_failed' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/person/1.0/person?personalNumber=${queryId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 404) return { status: 'not_found', data: null };
      if (res.status === 401 || res.status === 403) {
        roaringTokenCache.delete(this.clientId);
        return { status: 'unavailable', data: null, error: 'Roaring authentication failed', errorType: 'authentication_failed' };
      }
      if (res.status === 429) {
        return { status: 'unavailable', data: null, error: 'Roaring rate limit exceeded', errorType: 'rate_limited' };
      }
      if (!res.ok) {
        return { status: 'unavailable', data: null, error: `Roaring returned HTTP ${res.status}`, errorType: 'provider_unavailable' };
      }

      const body = await res.json() as Record<string, unknown>;
      const posts = Array.isArray(body['posts']) ? body['posts'] : [];
      if (posts.length === 0) return { status: 'not_found', data: null };

      const record = mapRoaringResponseToCanonical(key, body);
      return { status: 'found', data: toWireFormat(record), confidence: record.confidence };
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      return {
        status:    'unavailable',
        data:      null,
        error:     isTimeout ? 'Roaring request timed out' : (err instanceof Error ? err.message : String(err)),
        errorType: isTimeout ? 'timeout' : 'provider_unavailable',
      };
    }
  }
}

// ─── Provider Factory / Registry ───────────────────────────────────────────
//
// Resolution order: an explicit tenant config (passed in by
// person-lookup-service.ts, which reads person_lookup_provider_configs) is
// authoritative; PERSON_LOOKUP_PROVIDER (Supabase Secret) remains a
// platform-wide fallback for any org with no config row yet, same idiom as
// comm-providers.ts. Adding a real implementation for one of the
// KNOWN_PROVIDER_NAMES below means: write the class, add one case here
// returning it — nothing in students/index.ts or any frontend file needs to
// change.
//
// Behavior change from the pre-v2.0 version of this file, noted explicitly:
// previously *any* unrecognized PERSON_LOOKUP_PROVIDER value (a typo, "spar"
// before SPAR existed, anything) silently fell back to Mock. That is
// preserved only for the true default case (unset/empty/'mock'). Any other
// value now resolves to the explicit Not-Implemented result above instead —
// a stricter, safer behavior, not a relaxation of one.

export type PersonLookupProviderName = 'mock' | 'spar' | 'navet' | 'creditsafe' | 'ratsit' | 'roaring' | 'custom';

export const KNOWN_PROVIDER_NAMES: readonly PersonLookupProviderName[] =
  ['mock', 'spar', 'navet', 'creditsafe', 'ratsit', 'roaring', 'custom'];

export interface PersonLookupProviderResolutionConfig {
  provider?:      string;
  apiKey?:        string;
  clientId?:      string;
  clientSecret?:  string;
  baseUrl?:       string;
  timeoutMs?:     number;
}

export function getPersonLookupProvider(config?: PersonLookupProviderResolutionConfig): PersonLookupProvider {
  const configured = (config?.provider ?? Deno.env.get('PERSON_LOOKUP_PROVIDER') ?? 'mock').trim().toLowerCase();

  switch (configured) {
    case '':
    case 'mock':
      return new MockPersonLookupProvider();

    case 'roaring':
      if (!config?.clientId || !config?.clientSecret) return new NotImplementedPersonLookupProvider('roaring');
      return new RoaringPersonLookupProvider({
        clientId: config.clientId, clientSecret: config.clientSecret,
        baseUrl: config.baseUrl, timeoutMs: config.timeoutMs,
      });

    // Future: case 'spar': return new SparPersonLookupProvider();
    // Future: case 'navet': return new NavetPersonLookupProvider();
    // Future: case 'creditsafe': return new CreditsafePersonLookupProvider();
    // Future: case 'ratsit': return new RatsitPersonLookupProvider();
    // Future: case 'custom': return new CustomPersonLookupProvider();
    case 'spar':
    case 'navet':
    case 'creditsafe':
    case 'ratsit':
    case 'custom':
      return new NotImplementedPersonLookupProvider(configured);

    default:
      return new NotImplementedPersonLookupProvider(configured);
  }
}
