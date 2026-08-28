// ─── Canonical business setup data model ───────────────────────────────────
//
// Single source of truth for the business/setup information a new
// trafikskola tenant provides, regardless of which creation path collects
// it — self-service (TrialOnboardingWizardPage) or Platform Admin
// (BusinessSetupSection, embedded in CreateOrgDialog). Mirrors
// CompleteAnswers in supabase/functions/_shared/business-setup-provisioning.ts
// field-for-field; keep both in sync when adding a field (Tenant
// Registration Unification, 2026-08-28).

export interface VehicleEntry {
  registration_number: string; make: string; model: string; model_year: number;
  transmission: 'manual' | 'automatic' | 'both'; fuel_type: string; seats: number;
  registration_expires_at: string; insurance_expires_at: string; color: string;
}
export interface InstructorEntry { first_name: string; last_name: string; email: string; phone: string }
export interface StaffEntry { first_name: string; last_name: string; email: string }
export interface BranchEntry { name: string; address_line1: string; postal_code: string; city: string; phone: string; email: string }

export interface Answers {
  contact_first_name: string; contact_last_name: string;
  legal_name: string; org_number: string; vat_number: string;
  // Support/contact phone — feeds the branch executor's known.identity.phone
  // (gatherKnownBusinessFacts() in tenant-onboarding-pipeline.ts already
  // reads organizations.settings.customer_phone; this was previously never
  // collected anywhere — Tenant Registration Audit, Missing Fields #1).
  contact_phone: string;
  country: string; default_language: string; timezone: string;
  address_line1: string; postal_code: string; city: string;
  branches: number; branch_entries: BranchEntry[];
  licence_categories: string[]; standard_lesson_duration_minutes: number;
  lesson_type_durations: Record<string, number>;
  standard_lesson_price_sek: number;
  teaching_languages: string[];
  vehicle_count: number; vehicle_transmission: string; vehicles: VehicleEntry[];
  administrators: number; admin_entries: StaffEntry[];
  receptionists: number; receptionist_entries: StaffEntry[];
  instructors: number; instructor_entries: InstructorEntry[];
  working_hours_start: string; working_hours_end: string; weekend_schedule: string;
  channels: { email: boolean; sms: boolean; whatsapp: boolean; invoice_notifications: boolean };
  vat_period: string; payment_methods: string[];
}

export const LICENCE_CATEGORY_OPTIONS = [
  'AM', 'A1', 'A2', 'A', 'B', 'B96', 'BE', 'C1', 'C', 'C1E', 'CE', 'D1', 'D', 'D1E', 'DE', 'Traktor',
] as const;

export const TEACHING_LANGUAGE_OPTIONS = [
  { value: 'sv', label: 'Svenska' }, { value: 'en', label: 'Engelska' },
  { value: 'ar', label: 'Arabiska' }, { value: 'ku', label: 'Kurdiska' }, { value: 'other', label: 'Annat' },
];
export const PAYMENT_METHOD_OPTIONS = [
  { value: 'invoice', label: 'Faktura' }, { value: 'card', label: 'Kort' }, { value: 'swish', label: 'Swish' },
];
export const FUEL_TYPE_OPTIONS = [
  { value: 'gasoline', label: 'Bensin' }, { value: 'diesel', label: 'Diesel' }, { value: 'electric', label: 'El' },
  { value: 'hybrid', label: 'Hybrid' }, { value: 'plugin_hybrid', label: 'Plug-in hybrid' },
  { value: 'ethanol', label: 'Etanol' }, { value: 'gas', label: 'Gas' },
];

export const CURRENT_YEAR = new Date().getFullYear();
export function nextYearIso(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}
export function newVehicleEntry(defaultTransmission: string): VehicleEntry {
  return {
    registration_number: '', make: '', model: '', model_year: CURRENT_YEAR,
    transmission: defaultTransmission === 'automatic' || defaultTransmission === 'both' ? defaultTransmission : 'manual',
    fuel_type: 'gasoline', seats: 5,
    registration_expires_at: nextYearIso(), insurance_expires_at: nextYearIso(),
    color: '',
  };
}
export function newInstructorEntry(): InstructorEntry { return { first_name: '', last_name: '', email: '', phone: '' }; }
export function newStaffEntry(): StaffEntry { return { first_name: '', last_name: '', email: '' }; }
export function newBranchEntry(): BranchEntry { return { name: '', address_line1: '', postal_code: '', city: '', phone: '', email: '' }; }

export function resizeArray<T>(arr: T[], count: number, factory: () => T): T[] {
  if (count === arr.length) return arr;
  if (count < arr.length) return arr.slice(0, count);
  return [...arr, ...Array.from({ length: count - arr.length }, factory)];
}

export const EMPTY_ANSWERS: Answers = {
  contact_first_name: '', contact_last_name: '',
  legal_name: '', org_number: '', vat_number: '', contact_phone: '',
  country: 'SE', default_language: 'sv', timezone: 'Europe/Stockholm',
  address_line1: '', postal_code: '', city: '',
  branches: 1, branch_entries: [],
  licence_categories: [], standard_lesson_duration_minutes: 40,
  lesson_type_durations: {},
  standard_lesson_price_sek: 0,
  teaching_languages: ['sv'],
  vehicle_count: 1, vehicle_transmission: 'manual', vehicles: [newVehicleEntry('manual')],
  administrators: 1, admin_entries: [],
  receptionists: 0, receptionist_entries: [],
  instructors: 1, instructor_entries: [newInstructorEntry()],
  working_hours_start: '08:00', working_hours_end: '17:00', weekend_schedule: 'closed',
  channels: { email: true, sms: false, whatsapp: false, invoice_notifications: true },
  vat_period: 'quarterly', payment_methods: ['invoice'],
};

export function normalizeAnswers(raw: Partial<Answers>): Answers {
  const merged: Answers = { ...EMPTY_ANSWERS, ...raw };
  merged.vehicles = resizeArray(Array.isArray(raw.vehicles) ? raw.vehicles : [], merged.vehicle_count, () => newVehicleEntry(merged.vehicle_transmission));
  merged.instructor_entries = resizeArray(Array.isArray(raw.instructor_entries) ? raw.instructor_entries : [], merged.instructors, newInstructorEntry);
  merged.admin_entries = resizeArray(Array.isArray(raw.admin_entries) ? raw.admin_entries : [], Math.max(0, merged.administrators - 1), newStaffEntry);
  merged.receptionist_entries = resizeArray(Array.isArray(raw.receptionist_entries) ? raw.receptionist_entries : [], merged.receptionists, newStaffEntry);
  merged.branch_entries = resizeArray(Array.isArray(raw.branch_entries) ? raw.branch_entries : [], Math.max(0, merged.branches - 1), newBranchEntry);
  const durations: Record<string, number> = { ...merged.lesson_type_durations };
  for (const cat of merged.licence_categories) {
    if (!durations[cat]) durations[cat] = merged.standard_lesson_duration_minutes;
  }
  merged.lesson_type_durations = durations;
  return merged;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const POSTAL_RE = /^\d{3}\s?\d{2}$/;
// Swedish organization-number format XXXXXX-XXXX — already enforced in
// Platform Admin's provisioningSchema.ts; the self-service wizard had no
// equivalent check (Tenant Registration Audit, P1 finding).
export const ORG_NUMBER_RE = /^\d{6}-\d{4}$/;
