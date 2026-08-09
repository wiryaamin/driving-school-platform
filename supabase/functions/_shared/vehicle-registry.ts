/**
 * Vehicle Registry Lookup Framework — provider abstraction.
 *
 * Same shape as _shared/person-lookup.ts, reapplied to vehicle registration
 * data instead of personal identity data. A vehicle registry provider
 * (Biluppgifter.se, Fordonsfakta.se, or a future one) is a licensed reseller
 * of Transportstyrelsen's vägtrafikregistret (Road Traffic Register) — see
 * docs/INTEGRATION_CONFIGURATION_GUIDE.md for the full provider comparison
 * and why Biluppgifter.se is recommended.
 *
 * The Vehicle Domain never imports this file directly — only
 * vehicle-registry-service.ts does. See that file's header for the same
 * service-layer-boundary reasoning already established for Person Lookup.
 */

// ─── Canonical Data Model ───────────────────────────────────────────────────

export interface CanonicalVehicleRecord {
  registrationNumber:      string;
  vin?:                    string;
  make?:                   string;
  model?:                  string;
  modelYear?:              number;
  color?:                  string;
  registrationStatus?:     'registered' | 'deregistered' | 'unknown';
  registrationValidUntil?: string; // ISO date
  inspectionDueDate?:      string; // ISO date — next besiktning due
  lastInspectionDate?:     string; // ISO date
  lastInspectionResult?:   'passed' | 'failed' | 'passed_with_remarks' | 'unknown';
  inspectionStationName?:  string; // e.g. Bilprovningen, Opus, Dekra
  insuranceStatus?:        'insured' | 'uninsured' | 'unknown';
  debtFlag?:               boolean; // vehicle-related debts (fordonsrelaterade skulder)
  source:                  string;
  provider:                string;
  confidence:              'exact' | 'partial' | 'unknown';
  lastUpdated:              string;
}

// ─── Wire Format ─────────────────────────────────────────────────────────────

export interface VehicleRegistryData {
  registration_number?:      string;
  vin?:                      string;
  make?:                     string;
  model?:                    string;
  model_year?:               number;
  color?:                    string;
  registration_status?:      string;
  registration_valid_until?: string;
  inspection_due_date?:      string;
  last_inspection_date?:     string;
  last_inspection_result?:   string;
  inspection_station_name?:  string;
  insurance_status?:         string;
  debt_flag?:                boolean;
}

function toWireFormat(record: CanonicalVehicleRecord): VehicleRegistryData {
  const wire: VehicleRegistryData = {};
  if (record.registrationNumber      !== undefined) wire.registration_number      = record.registrationNumber;
  if (record.vin                      !== undefined) wire.vin                      = record.vin;
  if (record.make                     !== undefined) wire.make                     = record.make;
  if (record.model                    !== undefined) wire.model                    = record.model;
  if (record.modelYear                !== undefined) wire.model_year               = record.modelYear;
  if (record.color                    !== undefined) wire.color                    = record.color;
  if (record.registrationStatus       !== undefined) wire.registration_status      = record.registrationStatus;
  if (record.registrationValidUntil   !== undefined) wire.registration_valid_until = record.registrationValidUntil;
  if (record.inspectionDueDate        !== undefined) wire.inspection_due_date      = record.inspectionDueDate;
  if (record.lastInspectionDate       !== undefined) wire.last_inspection_date     = record.lastInspectionDate;
  if (record.lastInspectionResult     !== undefined) wire.last_inspection_result   = record.lastInspectionResult;
  if (record.inspectionStationName    !== undefined) wire.inspection_station_name  = record.inspectionStationName;
  if (record.insuranceStatus          !== undefined) wire.insurance_status         = record.insuranceStatus;
  if (record.debtFlag                 !== undefined) wire.debt_flag                = record.debtFlag;
  return wire;
}

// ─── Capability Model ────────────────────────────────────────────────────────

export interface VehicleRegistryCapabilities {
  registrationStatus: boolean;
  inspectionData:     boolean;
  technicalData:      boolean;
  debtInfo:           boolean;
  ownerData:          boolean;
}

// ─── Result Types ─────────────────────────────────────────────────────────────

export type VehicleRegistryStatus = 'found' | 'not_found' | 'unavailable';

export type VehicleRegistryErrorType =
  | 'timeout' | 'rate_limited' | 'authentication_failed'
  | 'misconfigured' | 'provider_unavailable' | 'invalid_request' | 'unknown';

export interface VehicleRegistryResult {
  status:      VehicleRegistryStatus;
  data:        VehicleRegistryData | null;
  error?:      string;
  errorType?:  VehicleRegistryErrorType;
  confidence?: 'exact' | 'partial' | 'unknown';
}

// ─── Provider Interface ───────────────────────────────────────────────────────

export interface VehicleRegistryProvider {
  getProviderName(): string;
  getProviderCapabilities(): VehicleRegistryCapabilities;
  validateConnection(): Promise<boolean>;
  lookupByRegistrationNumber(registrationNumber: string): Promise<VehicleRegistryResult>;
}

// ─── Format Validation ────────────────────────────────────────────────────────
//
// Swedish registration plates: 3 letters + 3 alphanumerics (digit or, since
// 2019, a personalized letter in the final position), e.g. ABC123 or ABC12E.
// The first two of the final three positions are always digits.

export function isValidRegistrationNumberFormat(value: string): boolean {
  const cleaned = value.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/.test(cleaned);
}

function normalizeRegistrationNumber(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

// ─── Mock Provider ────────────────────────────────────────────────────────────
//
// Zero-config default, same idiom as MockPersonLookupProvider. Fixed test
// fixtures covering the scenarios a real provider needs to support:
// registered+passed, registered+inspection-overdue, deregistered, and a
// clean not-found for anything else.

const MOCK_FIXTURES: Record<string, Omit<CanonicalVehicleRecord, 'registrationNumber' | 'source' | 'provider' | 'lastUpdated'>> = {
  'ABC123': {
    vin: 'YV1SW61C2A1234567', make: 'Volvo', model: 'V60', modelYear: 2021, color: 'Grå',
    registrationStatus: 'registered', registrationValidUntil: '2027-03-15',
    inspectionDueDate: '2027-01-31', lastInspectionDate: '2025-01-20', lastInspectionResult: 'passed',
    inspectionStationName: 'Bilprovningen', insuranceStatus: 'insured', debtFlag: false, confidence: 'exact',
  },
  'DEF456': {
    vin: 'WVWZZZ1KZAW123456', make: 'Volkswagen', model: 'Golf', modelYear: 2018, color: 'Blå',
    registrationStatus: 'registered', registrationValidUntil: '2026-08-01',
    inspectionDueDate: '2026-06-30', lastInspectionDate: '2024-06-15', lastInspectionResult: 'passed_with_remarks',
    inspectionStationName: 'Opus Bilprovning', insuranceStatus: 'insured', debtFlag: false, confidence: 'exact',
  },
  'GHI789': {
    make: 'Toyota', model: 'Corolla', modelYear: 2015, color: 'Vit',
    registrationStatus: 'deregistered', insuranceStatus: 'uninsured', debtFlag: false, confidence: 'exact',
  },
  'JKL012': {
    vin: 'ZFA1930000J123456', make: 'Fiat', model: '500', modelYear: 2020, color: 'Röd',
    registrationStatus: 'registered', registrationValidUntil: '2026-11-01',
    debtFlag: true, insuranceStatus: 'unknown', confidence: 'partial',
  },
};

export class MockVehicleRegistryProvider implements VehicleRegistryProvider {
  getProviderName(): string {
    return 'mock';
  }

  getProviderCapabilities(): VehicleRegistryCapabilities {
    return { registrationStatus: true, inspectionData: true, technicalData: true, debtInfo: true, ownerData: false };
  }

  validateConnection(): Promise<boolean> {
    return Promise.resolve(true);
  }

  lookupByRegistrationNumber(registrationNumber: string): Promise<VehicleRegistryResult> {
    const key = normalizeRegistrationNumber(registrationNumber);
    const fixture = MOCK_FIXTURES[key];

    if (!fixture) return Promise.resolve({ status: 'not_found', data: null });

    const record: CanonicalVehicleRecord = {
      registrationNumber: key, ...fixture,
      source: 'mock-fixture', provider: 'mock', lastUpdated: new Date().toISOString(),
    };
    return Promise.resolve({ status: 'found', data: toWireFormat(record), confidence: record.confidence });
  }
}

// ─── Not-Implemented Provider ─────────────────────────────────────────────────

export class NotImplementedVehicleRegistryProvider implements VehicleRegistryProvider {
  constructor(private readonly requestedName: string) {}

  getProviderName(): string {
    return this.requestedName;
  }

  getProviderCapabilities(): VehicleRegistryCapabilities {
    return { registrationStatus: false, inspectionData: false, technicalData: false, debtInfo: false, ownerData: false };
  }

  validateConnection(): Promise<boolean> {
    return Promise.resolve(false);
  }

  lookupByRegistrationNumber(): Promise<VehicleRegistryResult> {
    return Promise.resolve({
      status:    'unavailable',
      data:      null,
      error:     `Vehicle registry provider '${this.requestedName}' is not yet implemented.`,
      errorType: 'misconfigured',
    });
  }
}

// ─── Biluppgifter.se Provider ─────────────────────────────────────────────────
//
// RECOMMENDED PRODUCTION PROVIDER (see docs/INTEGRATION_CONFIGURATION_GUIDE.md
// for the full comparison against Fordonsfakta.se, Car.info, and TIC). Chosen
// for: a confirmed test/sandbox API key offered before production use, the
// strongest independent market presence of the evaluated resellers (broad
// Trustpilot-reviewed consumer brand recognition), and full Vägtrafikregistret
// coverage (registration status, besiktning dates/results, technical data,
// ownership) sourced under their own Transportstyrelsen direct-access permit.
//
// IMPLEMENTATION STATUS — unverified, more so than the original Roaring
// adapter was. Biluppgifter.se's own technical API reference
// (apidocs.biluppgifter.se) blocks automated/bot access (HTTP 403), and
// getting an API key requires contacting their sales team first — so unlike
// Roaring, not even the exact endpoint path or auth header name could be
// confirmed from public sources alone. Every provider-specific assumption
// below (base URL, auth header, endpoint path, response field names) is a
// best-effort placeholder isolated in this one class, specifically so it
// is a small, mechanical correction — not a rewrite — once a real sandbox
// key and one real API response are available. Do NOT treat this as
// commissioned. It requires the business step of contacting Biluppgifter.se
// (see the Configuration Guide) before it can be verified or used.
export interface BiluppgifterProviderConfig {
  apiKey:     string;
  baseUrl?:   string;
  timeoutMs?: number;
}

function mapBiluppgifterResponseToCanonical(registrationNumber: string, body: Record<string, unknown>): CanonicalVehicleRecord {
  // Single, isolated field-mapping point — see the IMPLEMENTATION STATUS
  // note above. Field names are a best-effort guess pending real API access.
  const vehicle = (body['vehicle'] ?? body) as Record<string, unknown>;
  const inspection = (vehicle['inspection'] ?? {}) as Record<string, unknown>;
  const status = String(vehicle['status'] ?? '').toLowerCase();

  return {
    registrationNumber,
    vin:                     vehicle['vin'] as string | undefined,
    make:                    vehicle['make'] as string | undefined,
    model:                   vehicle['model'] as string | undefined,
    modelYear:               vehicle['modelYear'] as number | undefined,
    color:                   vehicle['color'] as string | undefined,
    registrationStatus:      status === 'registered' ? 'registered' : status === 'deregistered' ? 'deregistered' : 'unknown',
    registrationValidUntil:  vehicle['registrationValidUntil'] as string | undefined,
    inspectionDueDate:       inspection['nextDueDate'] as string | undefined,
    lastInspectionDate:      inspection['lastInspectionDate'] as string | undefined,
    lastInspectionResult:    inspection['lastResult'] as CanonicalVehicleRecord['lastInspectionResult'],
    inspectionStationName:   inspection['stationName'] as string | undefined,
    insuranceStatus:         vehicle['insured'] === true ? 'insured' : vehicle['insured'] === false ? 'uninsured' : 'unknown',
    debtFlag:                vehicle['hasDebt'] as boolean | undefined,
    source:                  'biluppgifter-vagtrafikregistret',
    provider:                'biluppgifter',
    confidence:              'exact',
    lastUpdated:             new Date().toISOString(),
  };
}

export class BiluppgifterVehicleRegistryProvider implements VehicleRegistryProvider {
  private readonly apiKey:    string;
  private readonly baseUrl:   string;
  private readonly timeoutMs: number;

  constructor(config: BiluppgifterProviderConfig) {
    this.apiKey    = config.apiKey;
    this.baseUrl   = config.baseUrl ?? 'https://api.biluppgifter.se/v1';
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  getProviderName(): string {
    return 'biluppgifter';
  }

  getProviderCapabilities(): VehicleRegistryCapabilities {
    return { registrationStatus: true, inspectionData: true, technicalData: true, debtInfo: true, ownerData: true };
  }

  async validateConnection(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const res = await fetch(`${this.baseUrl}/status`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  async lookupByRegistrationNumber(registrationNumber: string): Promise<VehicleRegistryResult> {
    const key = normalizeRegistrationNumber(registrationNumber);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/vehicle/${key}`, {
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 404) return { status: 'not_found', data: null };
      if (res.status === 401 || res.status === 403) {
        return { status: 'unavailable', data: null, error: 'Biluppgifter authentication failed', errorType: 'authentication_failed' };
      }
      if (res.status === 429) {
        return { status: 'unavailable', data: null, error: 'Biluppgifter rate limit exceeded', errorType: 'rate_limited' };
      }
      if (!res.ok) {
        return { status: 'unavailable', data: null, error: `Biluppgifter returned HTTP ${res.status}`, errorType: 'provider_unavailable' };
      }

      const body = await res.json() as Record<string, unknown>;
      const record = mapBiluppgifterResponseToCanonical(key, body);
      return { status: 'found', data: toWireFormat(record), confidence: record.confidence };
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      return {
        status:    'unavailable',
        data:      null,
        error:     isTimeout ? 'Biluppgifter request timed out' : (err instanceof Error ? err.message : String(err)),
        errorType: isTimeout ? 'timeout' : 'provider_unavailable',
      };
    }
  }
}

// ─── Provider Factory / Registry ───────────────────────────────────────────

export type VehicleRegistryProviderName = 'mock' | 'biluppgifter' | 'fordonsfakta' | 'custom';

export const KNOWN_VEHICLE_REGISTRY_PROVIDER_NAMES: readonly VehicleRegistryProviderName[] =
  ['mock', 'biluppgifter', 'fordonsfakta', 'custom'];

export interface VehicleRegistryProviderResolutionConfig {
  provider?:   string;
  apiKey?:     string;
  baseUrl?:    string;
  timeoutMs?:  number;
}

export function getVehicleRegistryProvider(config?: VehicleRegistryProviderResolutionConfig): VehicleRegistryProvider {
  const configured = (config?.provider ?? Deno.env.get('VEHICLE_REGISTRY_PROVIDER') ?? 'mock').trim().toLowerCase();

  switch (configured) {
    case '':
    case 'mock':
      return new MockVehicleRegistryProvider();

    case 'biluppgifter':
      if (!config?.apiKey) return new NotImplementedVehicleRegistryProvider('biluppgifter');
      return new BiluppgifterVehicleRegistryProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl, timeoutMs: config.timeoutMs });

    // Future: case 'fordonsfakta': return new FordonsfaktaVehicleRegistryProvider();
    case 'fordonsfakta':
    case 'custom':
      return new NotImplementedVehicleRegistryProvider(configured);

    default:
      return new NotImplementedVehicleRegistryProvider(configured);
  }
}
