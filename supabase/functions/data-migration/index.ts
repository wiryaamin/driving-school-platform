// deno-lint-ignore-file no-explicit-any
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext, type EdgeRequestContext } from '../_shared/context.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { requireFeature } from '../_shared/subscription.ts';
import { buildErrorResponse } from '../_shared/errors.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

type EntityType =
  | 'students'
  | 'instructors'
  | 'vehicles'
  | 'packages'
  | 'bookings'
  | 'invoices'
  | 'payments';

interface ValidationIssue {
  field:    string;
  message:  string;
  severity: 'error' | 'warning';
}

interface NormalizedRow {
  [key: string]: unknown;
}

interface RowValidationResult {
  errors:          ValidationIssue[];
  warnings:        ValidationIssue[];
  normalized_data: NormalizedRow | null;
  status:          'valid' | 'warning' | 'error';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const JSON_CT = { 'Content-Type': 'application/json' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}

function err(ctx: EdgeRequestContext, message: string, status: number, code = 'ERROR'): Response {
  return buildErrorResponse(ctx, status, code, message);
}

const ADMIN_ROLES = new Set(['admin', 'manager', 'owner']);

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
}

function parsePersonnummer(raw: string): { date_of_birth: string; personnummer_last4: string } | null {
  const cleaned = raw.replace('-', '');
  if (!/^\d{12}$/.test(cleaned)) return null;
  return {
    date_of_birth:      `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`,
    personnummer_last4: cleaned.slice(8, 12),
  };
}

function finalize(result: Pick<RowValidationResult, 'errors' | 'warnings' | 'normalized_data'>): RowValidationResult {
  const nd = result.normalized_data;
  if (nd) {
    for (const k of Object.keys(nd)) {
      if (nd[k] === undefined || nd[k] === '') delete nd[k];
    }
  }
  return {
    ...result,
    status: result.errors.length > 0 ? 'error' : result.warnings.length > 0 ? 'warning' : 'valid',
  };
}

// ─── Enum sets (mirror DB enums) ──────────────────────────────────────────────

const STUDENT_STATUSES     = new Set(['lead', 'onboarding', 'active', 'paused', 'completed', 'withdrawn', 'archived']);
const PERMIT_STAGES        = new Set(['not_started', 'theory_study', 'risk1_booked', 'risk1_completed', 'risk2_booked', 'risk2_completed', 'theory_exam_booked', 'theory_passed', 'practical_exam_booked', 'practical_passed', 'licence_issued']);
const EMPLOYMENT_TYPES     = new Set(['employed', 'contractor', 'external', 'on_leave', 'inactive']);
const LESSON_CATEGORIES    = new Set(['driving', 'theory', 'risk1', 'risk2', 'simulator', 'assessment', 'intensive', 'group_theory', 'other']);
const BOOKING_STATUSES     = new Set(['confirmed', 'completed', 'cancelled', 'no_show']);
const INVOICE_STATUSES     = new Set(['draft', 'issued', 'paid', 'partially_paid', 'void', 'overdue']);
const TRANSMISSION_TYPES   = new Set(['manual', 'automatic', 'semi_automatic']);
const FUEL_TYPES           = new Set(['gasoline', 'diesel', 'electric', 'hybrid', 'plugin_hybrid', 'ethanol', 'gas']);
const VEHICLE_STATUSES     = new Set(['available', 'in_use', 'maintenance', 'inspection_due', 'inactive', 'decommissioned']);
const LICENCE_CATEGORIES   = new Set(['B', 'BE', 'A', 'A2', 'A1', 'AM', 'C', 'CE', 'D', 'DE', 'MC']);

// DB payment_method enum
const PAYMENT_METHODS = new Set(['manual', 'card', 'bank_transfer', 'swish', 'stripe', 'invoice_credit', 'other']);
// Aliases from common export formats → DB enum values
const PAYMENT_METHOD_ALIASES: Record<string, string> = {
  cash:    'manual',
  kontant: 'manual',
  invoice: 'invoice_credit',
  faktura: 'invoice_credit',
};

// ─── Validators ───────────────────────────────────────────────────────────────

function validateStudent(
  row: Record<string, string>,
  seenEmails: Set<string>,
): RowValidationResult {
  const errors:   ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const first_name = (row['first_name'] ?? '').trim();
  const last_name  = (row['last_name']  ?? '').trim();
  const email      = (row['email']      ?? '').trim().toLowerCase();
  const phone      = (row['phone']      ?? '').trim();

  if (!first_name) errors.push({ field: 'first_name', message: 'Förnamn är obligatoriskt', severity: 'error' });
  if (!last_name)  errors.push({ field: 'last_name',  message: 'Efternamn är obligatoriskt', severity: 'error' });

  if (email && !isValidEmail(email)) {
    errors.push({ field: 'email', message: 'Ogiltig e-postadress', severity: 'error' });
  }
  if (!email && !phone) {
    warnings.push({ field: 'email', message: 'Varken e-post eller telefon angivet — eleven kan inte kontaktas', severity: 'warning' });
  }
  if (email && seenEmails.has(email)) {
    errors.push({ field: 'email', message: `Dubblettpost: ${email} förekommer flera gånger i filen`, severity: 'error' });
  } else if (email) {
    seenEmails.add(email);
  }

  // Personnummer
  let date_of_birth: string | undefined;
  let personnummer_last4: string | undefined;
  const rawPnr = (row['personnummer'] ?? '').trim();
  if (rawPnr) {
    const pnr = parsePersonnummer(rawPnr);
    if (!pnr) {
      errors.push({ field: 'personnummer', message: 'Ogiltigt personnummerformat — förväntad YYYYMMDD-XXXX eller YYYYMMDDXXXX', severity: 'error' });
    } else {
      date_of_birth      = pnr.date_of_birth;
      personnummer_last4 = pnr.personnummer_last4;
    }
  }

  // Status
  const rawStatus = (row['status'] ?? '').trim().toLowerCase();
  const status = rawStatus && STUDENT_STATUSES.has(rawStatus) ? rawStatus : 'active';
  if (rawStatus && !STUDENT_STATUSES.has(rawStatus)) {
    warnings.push({ field: 'status', message: `Okänd status '${rawStatus}' — sätts till 'active'`, severity: 'warning' });
  }

  // Licence category
  const rawCat = (row['target_licence_category'] ?? '').trim().toUpperCase();
  const target_licence_category = rawCat && LICENCE_CATEGORIES.has(rawCat) ? rawCat : 'B';
  if (rawCat && !LICENCE_CATEGORIES.has(rawCat)) {
    warnings.push({ field: 'target_licence_category', message: `Okänd körkortskategori '${rawCat}' — sätts till 'B'`, severity: 'warning' });
  }

  // Permit stage
  const rawStage = (row['permit_stage'] ?? '').trim().toLowerCase();
  const permit_stage = rawStage && PERMIT_STAGES.has(rawStage) ? rawStage : 'not_started';
  if (rawStage && !PERMIT_STAGES.has(rawStage)) {
    warnings.push({ field: 'permit_stage', message: `Okänt tillståndssteg '${rawStage}' — sätts till 'not_started'`, severity: 'warning' });
  }

  // Dates
  const enrolled_at        = (row['enrolled_at']        ?? '').trim();
  const risk1_completed_at = (row['risk1_completed_at'] ?? '').trim();
  const risk2_completed_at = (row['risk2_completed_at'] ?? '').trim();
  const theory_passed_at   = (row['theory_passed_at']   ?? '').trim();
  const practical_passed_at = (row['practical_passed_at'] ?? '').trim();

  for (const [field, val] of [
    ['enrolled_at', enrolled_at], ['risk1_completed_at', risk1_completed_at],
    ['risk2_completed_at', risk2_completed_at], ['theory_passed_at', theory_passed_at],
    ['practical_passed_at', practical_passed_at],
  ] as Array<[string, string]>) {
    if (val && !isValidDate(val)) {
      errors.push({ field, message: `${field}: ogiltigt datumformat — förväntad YYYY-MM-DD`, severity: 'error' });
    }
  }

  return finalize({
    errors,
    warnings,
    normalized_data: {
      first_name,
      last_name,
      email:                 email || undefined,
      phone:                 phone || undefined,
      address_line1:         (row['address_street']       ?? '').trim() || undefined,
      postal_code:           (row['address_postal_code']  ?? '').trim() || undefined,
      city:                  (row['address_city']         ?? '').trim() || undefined,
      date_of_birth,
      personnummer_last4,
      identity_type:         rawPnr ? 'personnummer' : 'none',
      status,
      target_licence_category,
      permit_stage,
      enrolled_at:           enrolled_at || undefined,
      risk1_completed_at:    risk1_completed_at || undefined,
      risk2_completed_at:    risk2_completed_at || undefined,
      theory_passed_at:      theory_passed_at   || undefined,
      practical_passed_at:   practical_passed_at || undefined,
      instructor_email:      (row['instructor_email'] ?? '').trim().toLowerCase() || undefined,
      notes:                 (row['notes'] ?? '').trim() || undefined,
    },
  });
}

function validateInstructor(
  row: Record<string, string>,
  seenEmails: Set<string>,
): RowValidationResult {
  const errors:   ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const first_name = (row['first_name'] ?? '').trim();
  const last_name  = (row['last_name']  ?? '').trim();
  const email      = (row['email']      ?? '').trim().toLowerCase();
  const phone      = (row['phone']      ?? '').trim();

  if (!first_name) errors.push({ field: 'first_name', message: 'Förnamn är obligatoriskt', severity: 'error' });
  if (!last_name)  errors.push({ field: 'last_name',  message: 'Efternamn är obligatoriskt', severity: 'error' });
  if (!email)      errors.push({ field: 'email',      message: 'E-post är obligatorisk för instruktörer', severity: 'error' });
  else if (!isValidEmail(email)) errors.push({ field: 'email', message: 'Ogiltig e-postadress', severity: 'error' });
  if (email && seenEmails.has(email)) {
    errors.push({ field: 'email', message: `Dubblettpost: ${email} förekommer flera gånger i filen`, severity: 'error' });
  } else if (email) {
    seenEmails.add(email);
  }

  // Personnummer
  let date_of_birth: string | undefined;
  let personnummer_last4: string | undefined;
  const rawPnr = (row['personnummer'] ?? '').trim();
  if (rawPnr) {
    const pnr = parsePersonnummer(rawPnr);
    if (!pnr) {
      warnings.push({ field: 'personnummer', message: 'Ogiltigt personnummerformat — hoppas över', severity: 'warning' });
    } else {
      date_of_birth      = pnr.date_of_birth;
      personnummer_last4 = pnr.personnummer_last4;
    }
  }

  // Employment type
  const rawEmp = (row['employment_type'] ?? '').trim().toLowerCase();
  const employment_type = rawEmp && EMPLOYMENT_TYPES.has(rawEmp) ? rawEmp : 'employed';
  if (rawEmp && !EMPLOYMENT_TYPES.has(rawEmp)) {
    warnings.push({ field: 'employment_type', message: `Okänd anställningstyp '${rawEmp}' — sätts till 'employed'`, severity: 'warning' });
  }

  // Teaching categories — comma-separated e.g. "B,C,D"
  const rawCats = (row['teaching_categories'] ?? '').trim();
  const teaching_categories = rawCats
    ? rawCats.split(',').map((c) => c.trim().toUpperCase()).filter((c) => LICENCE_CATEGORIES.has(c))
    : ['B'];
  if (rawCats && teaching_categories.length === 0) {
    warnings.push({ field: 'teaching_categories', message: 'Inga giltiga undervisningskategorier hittades — sätts till B', severity: 'warning' });
    teaching_categories.push('B');
  }

  // Languages — comma-separated e.g. "sv,en"
  const rawLangs = (row['languages_spoken'] ?? '').trim();
  const languages_spoken = rawLangs
    ? rawLangs.split(',').map((l) => l.trim().toLowerCase()).filter(Boolean)
    : ['sv'];

  // Dates
  const employment_started_at = (row['employment_started_at'] ?? '').trim();
  const adi_valid_until       = (row['adi_valid_until']       ?? '').trim();
  if (employment_started_at && !isValidDate(employment_started_at)) {
    errors.push({ field: 'employment_started_at', message: 'Ogiltigt datumformat — förväntad YYYY-MM-DD', severity: 'error' });
  }
  if (adi_valid_until && !isValidDate(adi_valid_until)) {
    errors.push({ field: 'adi_valid_until', message: 'Ogiltigt datumformat — förväntad YYYY-MM-DD', severity: 'error' });
  }

  return finalize({
    errors,
    warnings,
    normalized_data: {
      first_name,
      last_name,
      email,
      phone:                  phone || undefined,
      date_of_birth,
      personnummer_last4,
      identity_type:          rawPnr ? 'personnummer' : 'none',
      employment_type,
      teaching_categories,
      languages_spoken,
      employment_started_at:  employment_started_at || undefined,
      adi_number:             (row['adi_number'] ?? '').trim() || undefined,
      adi_valid_until:        adi_valid_until || undefined,
    },
  });
}

function validateVehicle(
  row: Record<string, string>,
  seenRegs: Set<string>,
): RowValidationResult {
  const errors:   ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const registration_number = (row['registration_number'] ?? '').trim().toUpperCase();
  const make  = (row['make']  ?? '').trim();
  const model = (row['model'] ?? '').trim();
  const rawYear = (row['model_year'] ?? '').trim();

  if (!registration_number) errors.push({ field: 'registration_number', message: 'Registreringsnummer är obligatoriskt', severity: 'error' });
  if (!make)  errors.push({ field: 'make',  message: 'Märke är obligatoriskt', severity: 'error' });
  if (!model) errors.push({ field: 'model', message: 'Modell är obligatoriskt', severity: 'error' });

  if (registration_number && seenRegs.has(registration_number)) {
    errors.push({ field: 'registration_number', message: `Duplicerat registreringsnummer: ${registration_number}`, severity: 'error' });
  } else if (registration_number) {
    seenRegs.add(registration_number);
  }

  const model_year = parseInt(rawYear, 10);
  if (!rawYear || isNaN(model_year) || model_year < 1980 || model_year > 2100) {
    errors.push({ field: 'model_year', message: 'Årsmodell måste vara ett tal mellan 1980 och 2100', severity: 'error' });
  }

  // Compliance dates — required
  const registration_expires_at = (row['registration_expires_at'] ?? '').trim();
  const insurance_expires_at    = (row['insurance_expires_at']    ?? '').trim();
  if (!registration_expires_at) {
    errors.push({ field: 'registration_expires_at', message: 'Registreringens utgångsdatum är obligatoriskt (YYYY-MM-DD)', severity: 'error' });
  } else if (!isValidDate(registration_expires_at)) {
    errors.push({ field: 'registration_expires_at', message: 'Ogiltigt datumformat — förväntad YYYY-MM-DD', severity: 'error' });
  }
  if (!insurance_expires_at) {
    errors.push({ field: 'insurance_expires_at', message: 'Försäkringens utgångsdatum är obligatoriskt (YYYY-MM-DD)', severity: 'error' });
  } else if (!isValidDate(insurance_expires_at)) {
    errors.push({ field: 'insurance_expires_at', message: 'Ogiltigt datumformat — förväntad YYYY-MM-DD', severity: 'error' });
  }

  // Transmission
  const rawTrans = (row['transmission'] ?? '').trim().toLowerCase();
  const transmission = rawTrans && TRANSMISSION_TYPES.has(rawTrans) ? rawTrans : 'manual';
  if (rawTrans && !TRANSMISSION_TYPES.has(rawTrans)) {
    warnings.push({ field: 'transmission', message: `Okänd växellådstyp '${rawTrans}' — sätts till 'manual'`, severity: 'warning' });
  }

  // Fuel type
  const rawFuel = (row['fuel_type'] ?? '').trim().toLowerCase();
  const fuel_type = rawFuel && FUEL_TYPES.has(rawFuel) ? rawFuel : 'gasoline';
  if (rawFuel && !FUEL_TYPES.has(rawFuel)) {
    warnings.push({ field: 'fuel_type', message: `Okänd bränsletyp '${rawFuel}' — sätts till 'gasoline'`, severity: 'warning' });
  }

  // Operational status
  const rawStatus = (row['operational_status'] ?? '').trim().toLowerCase();
  const operational_status = rawStatus && VEHICLE_STATUSES.has(rawStatus) ? rawStatus : 'available';
  if (rawStatus && !VEHICLE_STATUSES.has(rawStatus)) {
    warnings.push({ field: 'operational_status', message: `Okänd driftstatus '${rawStatus}' — sätts till 'available'`, severity: 'warning' });
  }

  // Teaching categories — comma-separated
  const rawCats = (row['teaching_categories'] ?? '').trim();
  const teaching_categories = rawCats
    ? rawCats.split(',').map((c) => c.trim().toUpperCase()).filter((c) => LICENCE_CATEGORIES.has(c))
    : ['B'];

  // Inspection date
  const next_inspection_due_at = (row['next_inspection_due_at'] ?? '').trim();
  if (next_inspection_due_at && !isValidDate(next_inspection_due_at)) {
    warnings.push({ field: 'next_inspection_due_at', message: 'Ogiltigt datumformat — hoppas över', severity: 'warning' });
  }

  return finalize({
    errors,
    warnings,
    normalized_data: {
      registration_number,
      make,
      model,
      model_year: isNaN(model_year) ? undefined : model_year,
      transmission,
      fuel_type,
      has_dual_controls:       (row['has_dual_controls'] ?? '').trim().toLowerCase() !== 'false',
      teaching_categories,
      operational_status,
      registration_expires_at: registration_expires_at || undefined,
      insurance_expires_at:    insurance_expires_at    || undefined,
      next_inspection_due_at:  (next_inspection_due_at && isValidDate(next_inspection_due_at)) ? next_inspection_due_at : undefined,
      color:                   (row['color'] ?? '').trim() || undefined,
      vin:                     (row['vin']   ?? '').trim() || undefined,
    },
  });
}

function validatePackage(row: Record<string, string>): RowValidationResult {
  const errors:   ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const student_email = (row['student_email'] ?? '').trim().toLowerCase();
  const rawCat = (row['lesson_category'] ?? '').trim().toLowerCase();
  const rawQty = (row['quantity'] ?? '').trim();

  if (!student_email || !isValidEmail(student_email)) {
    errors.push({ field: 'student_email', message: 'Ogiltig eller saknad elev e-postadress', severity: 'error' });
  }

  const lesson_category = rawCat && LESSON_CATEGORIES.has(rawCat) ? rawCat : 'driving';
  if (rawCat && !LESSON_CATEGORIES.has(rawCat)) {
    warnings.push({ field: 'lesson_category', message: `Okänd lektionskategori '${rawCat}' — sätts till 'driving'`, severity: 'warning' });
  }

  const quantity = parseInt(rawQty, 10);
  if (!rawQty || isNaN(quantity) || quantity <= 0) {
    errors.push({ field: 'quantity', message: 'Antal lektioner måste vara ett positivt heltal', severity: 'error' });
  }

  const expires_at = (row['expires_at'] ?? '').trim();
  if (expires_at && !isValidDate(expires_at)) {
    warnings.push({ field: 'expires_at', message: 'Ogiltigt datumformat — utgångsdatum hoppas över', severity: 'warning' });
  }

  if (!isNaN(quantity) && quantity > 100) {
    warnings.push({ field: 'quantity', message: `Ovanligt högt antal: ${quantity} lektioner — kontrollera att det stämmer`, severity: 'warning' });
  }

  return finalize({
    errors,
    warnings,
    normalized_data: {
      student_email,
      lesson_category,
      quantity: isNaN(quantity) ? undefined : quantity,
      description: (row['description'] ?? '').trim() || undefined,
      expires_at:  (expires_at && isValidDate(expires_at)) ? expires_at : undefined,
    },
  });
}

function validateBooking(row: Record<string, string>): RowValidationResult {
  const errors:   ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const student_email      = (row['student_email']      ?? '').trim().toLowerCase();
  const instructor_email   = (row['instructor_email']   ?? '').trim().toLowerCase();
  const vehicle_registration = (row['vehicle_registration'] ?? '').trim().toUpperCase();
  const date               = (row['date']               ?? '').trim();
  const start_time         = (row['start_time']         ?? '').trim();
  const rawDur             = (row['duration_minutes']   ?? '').trim();

  if (!student_email || !isValidEmail(student_email)) {
    errors.push({ field: 'student_email', message: 'Ogiltig eller saknad elev e-postadress', severity: 'error' });
  }
  if (!date || !isValidDate(date)) {
    errors.push({ field: 'date', message: 'Datum saknas eller har fel format — förväntad YYYY-MM-DD', severity: 'error' });
  }
  if (!start_time || !/^\d{2}:\d{2}$/.test(start_time)) {
    errors.push({ field: 'start_time', message: 'Starttid saknas eller har fel format — förväntad HH:MM', severity: 'error' });
  }

  const duration_minutes = parseInt(rawDur, 10);
  if (!rawDur || isNaN(duration_minutes) || duration_minutes <= 0) {
    errors.push({ field: 'duration_minutes', message: 'Lektionslängd måste vara ett positivt heltal (minuter)', severity: 'error' });
  } else if (duration_minutes < 20 || duration_minutes > 300) {
    warnings.push({ field: 'duration_minutes', message: `Ovanlig lektionslängd: ${duration_minutes} minuter`, severity: 'warning' });
  }

  // Lesson category
  const rawCat = (row['lesson_category'] ?? 'driving').trim().toLowerCase();
  const lesson_category = LESSON_CATEGORIES.has(rawCat) ? rawCat : 'driving';
  if (!LESSON_CATEGORIES.has(rawCat)) {
    warnings.push({ field: 'lesson_category', message: `Okänd lektionskategori '${rawCat}' — sätts till 'driving'`, severity: 'warning' });
  }

  // Booking status
  const rawStatus = (row['booking_status'] ?? '').trim().toLowerCase();
  const booking_status = rawStatus && BOOKING_STATUSES.has(rawStatus) ? rawStatus : '';

  if (date && isValidDate(date)) {
    const isPast = new Date(date) < new Date(new Date().toISOString().slice(0, 10));
    if (!isPast && !booking_status) {
      warnings.push({ field: 'date', message: 'Framtida bokning — importeras som bekräftad', severity: 'warning' });
    }
  }

  if (!instructor_email) {
    warnings.push({ field: 'instructor_email', message: 'Ingen instruktör angiven — systemet tilldelar en tillgänglig instruktör automatiskt', severity: 'warning' });
  } else if (!isValidEmail(instructor_email)) {
    warnings.push({ field: 'instructor_email', message: 'Ogiltig e-postadress för instruktör — instruktörstilldelning hoppas över', severity: 'warning' });
  }

  return finalize({
    errors,
    warnings,
    normalized_data: {
      student_email,
      instructor_email:    (instructor_email && isValidEmail(instructor_email)) ? instructor_email : undefined,
      vehicle_registration: vehicle_registration || undefined,
      lesson_category,
      date,
      start_time,
      duration_minutes:    isNaN(duration_minutes) ? undefined : duration_minutes,
      booking_status:      booking_status || undefined,
      notes:               (row['notes'] ?? '').trim() || undefined,
    },
  });
}

function validateInvoice(row: Record<string, string>): RowValidationResult {
  const errors:   ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const student_email = (row['student_email'] ?? '').trim().toLowerCase();
  if (!student_email || !isValidEmail(student_email)) {
    errors.push({ field: 'student_email', message: 'Ogiltig eller saknad elev e-postadress', severity: 'error' });
  }

  const rawAmount = (row['amount_incl_vat'] ?? row['amount'] ?? '').trim();
  const amount_incl_vat = parseFloat(rawAmount);
  if (!rawAmount || isNaN(amount_incl_vat) || amount_incl_vat <= 0) {
    errors.push({ field: 'amount_incl_vat', message: 'Belopp inklusive moms måste vara ett positivt tal', severity: 'error' });
  }

  const rawVatRate = (row['vat_rate'] ?? '0.25').trim();
  const vat_rate = parseFloat(rawVatRate);
  const finalVatRate = (!isNaN(vat_rate) && vat_rate >= 0 && vat_rate <= 1) ? vat_rate : 0.25;
  if (!isNaN(vat_rate) && (vat_rate < 0 || vat_rate > 1)) {
    warnings.push({ field: 'vat_rate', message: 'Momssats utanför giltigt intervall 0–1 — sätts till 0.25 (25%)', severity: 'warning' });
  }

  const invoice_date = (row['invoice_date'] ?? '').trim();
  const due_date     = (row['due_date']     ?? '').trim();
  if (!invoice_date || !isValidDate(invoice_date)) {
    errors.push({ field: 'invoice_date', message: 'Fakturadatum saknas eller har fel format — förväntad YYYY-MM-DD', severity: 'error' });
  }
  if (due_date && !isValidDate(due_date)) {
    warnings.push({ field: 'due_date', message: 'Ogiltigt förfallodatumformat — förväntad YYYY-MM-DD, hoppas över', severity: 'warning' });
  }

  // Status
  const rawStatus = (row['status'] ?? '').trim().toLowerCase();
  const status = rawStatus && INVOICE_STATUSES.has(rawStatus) ? rawStatus : 'issued';
  if (rawStatus && !INVOICE_STATUSES.has(rawStatus)) {
    warnings.push({ field: 'status', message: `Okänd fakturastatus '${rawStatus}' — sätts till 'issued'`, severity: 'warning' });
  }

  return finalize({
    errors,
    warnings,
    normalized_data: {
      student_email,
      original_invoice_number: (row['invoice_number'] ?? '').trim() || undefined,
      amount_incl_vat:         isNaN(amount_incl_vat) ? undefined : amount_incl_vat,
      vat_rate:                finalVatRate,
      invoice_date:            isValidDate(invoice_date) ? invoice_date : undefined,
      due_date:                (due_date && isValidDate(due_date)) ? due_date : undefined,
      description:             (row['description'] ?? '').trim() || undefined,
      status,
    },
  });
}

function validatePayment(row: Record<string, string>): RowValidationResult {
  const errors:   ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const student_email    = (row['student_email']    ?? '').trim().toLowerCase();
  const invoice_number   = (row['invoice_number']   ?? '').trim();
  const rawAmount        = (row['amount']           ?? '').trim();
  const payment_date     = (row['payment_date']     ?? '').trim();
  const rawMethod        = (row['payment_method']   ?? '').trim().toLowerCase();

  if (!student_email || !isValidEmail(student_email)) {
    errors.push({ field: 'student_email', message: 'Ogiltig eller saknad elev e-postadress', severity: 'error' });
  }
  if (!invoice_number) {
    errors.push({ field: 'invoice_number', message: 'Fakturanummer är obligatoriskt — används för att matcha betalningen till rätt faktura', severity: 'error' });
  }

  const amount = parseFloat(rawAmount);
  if (!rawAmount || isNaN(amount) || amount <= 0) {
    errors.push({ field: 'amount', message: 'Belopp måste vara ett positivt tal', severity: 'error' });
  }

  if (!payment_date || !isValidDate(payment_date)) {
    errors.push({ field: 'payment_date', message: 'Betalningsdatum saknas eller har fel format — förväntad YYYY-MM-DD', severity: 'error' });
  }

  // Resolve payment method alias then validate
  const resolvedMethod = PAYMENT_METHOD_ALIASES[rawMethod] ?? rawMethod;
  const payment_method = PAYMENT_METHODS.has(resolvedMethod) ? resolvedMethod : 'other';
  if (rawMethod && !PAYMENT_METHODS.has(resolvedMethod)) {
    warnings.push({ field: 'payment_method', message: `Okänt betalsätt '${rawMethod}' — sparas som 'other'`, severity: 'warning' });
  }

  return finalize({
    errors,
    warnings,
    normalized_data: {
      student_email,
      invoice_number:  invoice_number || undefined,
      amount:          isNaN(amount) ? undefined : amount,
      payment_date:    isValidDate(payment_date) ? payment_date : undefined,
      payment_method,
      reference:       (row['reference'] ?? '').trim() || undefined,
      notes:           (row['notes']     ?? '').trim() || undefined,
    },
  });
}

function validateRow(
  entity_type: EntityType,
  row: Record<string, string>,
  seenKeys: Set<string>,
): RowValidationResult {
  switch (entity_type) {
    case 'students':    return validateStudent(row, seenKeys);
    case 'instructors': return validateInstructor(row, seenKeys);
    case 'vehicles':    return validateVehicle(row, seenKeys);
    case 'packages':    return validatePackage(row);
    case 'bookings':    return validateBooking(row);
    case 'invoices':    return validateInvoice(row);
    case 'payments':    return validatePayment(row);
  }
}

// ─── CSV templates ────────────────────────────────────────────────────────────

const CSV_TEMPLATES: Record<EntityType, string> = {
  students: [
    'first_name,last_name,personnummer,email,phone,address_street,address_city,address_postal_code,target_licence_category,enrolled_at,status,permit_stage,instructor_email,risk1_completed_at,risk2_completed_at,theory_passed_at,practical_passed_at,notes',
    'Anna,Svensson,199001011234,anna@example.com,+46701234567,Storgatan 1,Stockholm,11111,B,2025-09-01,active,theory_study,maria@korskola.se,,,,"Engagerad elev"',
  ].join('\n'),

  instructors: [
    'first_name,last_name,personnummer,email,phone,employment_type,teaching_categories,employment_started_at,adi_number,adi_valid_until,languages_spoken',
    'Maria,Johansson,198503152345,maria@korskola.se,+46701234568,employed,"B,C",2020-03-01,SE-12345,2028-03-01,"sv,en"',
  ].join('\n'),

  vehicles: [
    'registration_number,make,model,model_year,transmission,fuel_type,has_dual_controls,teaching_categories,registration_expires_at,insurance_expires_at,next_inspection_due_at,color,vin',
    'ABC123,Volvo,V60,2022,manual,diesel,true,B,2027-06-30,2027-01-15,2026-12-01,Grå,YV1FW8AR4N2000001',
  ].join('\n'),

  packages: [
    'student_email,lesson_category,quantity,expires_at,description',
    'anna@example.com,driving,8,2027-06-01,Kvarvarande körlektioner från tidigare system',
  ].join('\n'),

  bookings: [
    'student_email,instructor_email,vehicle_registration,lesson_category,date,start_time,duration_minutes,booking_status,notes',
    'anna@example.com,maria@korskola.se,ABC123,driving,2026-05-10,09:00,50,completed,Bra lektion — behöver öva filbyte',
  ].join('\n'),

  invoices: [
    'student_email,invoice_number,amount_incl_vat,vat_rate,invoice_date,due_date,status,description',
    'anna@example.com,2025-0042,4375.00,0.25,2025-09-15,2025-10-15,paid,Körkortspaketet B — 10 lektioner',
  ].join('\n'),

  payments: [
    'student_email,invoice_number,amount,payment_date,payment_method,reference,notes',
    'anna@example.com,2025-0042,4375.00,2025-09-20,swish,12345678,"Betalat via Swish"',
  ].join('\n'),
};

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handleListSessions(supabase: any, orgId: string, url: URL, ctx: EdgeRequestContext): Promise<Response> {
  const page     = Math.max(1, parseInt(url.searchParams.get('page')     ?? '1', 10));
  const per_page = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') ?? '25', 10)));
  const from = (page - 1) * per_page;

  const { data, error, count } = await supabase
    .from('data_migration_sessions')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, from + per_page - 1);

  if (error) {
    console.error('[data-migration] list_sessions:', error.message);
    return err(ctx, 'Kunde inte hämta importhistorik', 500, 'INTERNAL_ERROR');
  }
  return json({ data: data ?? [], meta: { total: count ?? 0, page, per_page } });
}

async function handleCreateSession(supabase: any, orgId: string, userId: string, req: Request, ctx: EdgeRequestContext): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return err(ctx, 'Ogiltig JSON', 422, 'VALIDATION_ERROR'); }

  const b = body as Record<string, unknown>;
  const entity_type = b['entity_type'] as string | undefined;
  const VALID_ENTITIES = new Set(['students', 'instructors', 'vehicles', 'packages', 'bookings', 'invoices', 'payments']);

  if (!entity_type || !VALID_ENTITIES.has(entity_type)) {
    return err(ctx, 'entity_type måste vara en av: students, instructors, vehicles, packages, bookings, invoices, payments', 422, 'VALIDATION_ERROR');
  }

  const { data: session, error } = await supabase
    .from('data_migration_sessions')
    .insert({
      organization_id: orgId,
      entity_type,
      file_name:        (b['file_name']       as string | undefined) ?? null,
      file_size_bytes:  (b['file_size_bytes'] as number | undefined) ?? null,
      status:           'draft',
      created_by:       userId,
    })
    .select()
    .single();

  if (error) {
    console.error('[data-migration] create_session:', error.message);
    return err(ctx, 'Kunde inte skapa importsession', 500, 'INTERNAL_ERROR');
  }
  return json({ data: session }, 201);
}

async function handleGetSession(supabase: any, orgId: string, id: string, ctx: EdgeRequestContext): Promise<Response> {
  const { data: session, error } = await supabase
    .from('data_migration_sessions')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return err(ctx, 'Kunde inte hämta importsession', 500, 'INTERNAL_ERROR');
  if (!session) return err(ctx, `Session '${id}' hittades inte`, 404, 'NOT_FOUND');
  return json({ data: session });
}

async function handleCancelSession(supabase: any, orgId: string, id: string, ctx: EdgeRequestContext): Promise<Response> {
  const { data: existing } = await supabase
    .from('data_migration_sessions')
    .select('id, status')
    .eq('id', id).eq('organization_id', orgId).is('deleted_at', null)
    .maybeSingle();

  if (!existing) return json({ success: true, already_cancelled: true });

  const { error } = await supabase
    .from('data_migration_sessions')
    .update({ status: 'cancelled', deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id).eq('organization_id', orgId);

  if (error) return err(ctx, 'Kunde inte avbryta importsession', 500, 'INTERNAL_ERROR');
  return json({ success: true });
}

async function handleUploadRows(supabase: any, orgId: string, id: string, req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const { data: session, error: sessErr } = await supabase
    .from('data_migration_sessions')
    .select('*').eq('id', id).eq('organization_id', orgId).is('deleted_at', null).maybeSingle();

  if (sessErr || !session) return err(ctx, `Session '${id}' hittades inte`, 404, 'NOT_FOUND');
  if (!['draft', 'failed'].includes(session.status as string)) {
    return err(ctx, 'Kan bara ladda upp rader till en session i status draft eller failed', 409, 'CONFLICT');
  }

  let body: unknown;
  try { body = await req.json(); } catch { return err(ctx, 'Ogiltig JSON', 422, 'VALIDATION_ERROR'); }

  const b    = body as Record<string, unknown>;
  const rows = b['rows'] as Array<Record<string, string>> | undefined;

  if (!Array.isArray(rows) || rows.length === 0) return err(ctx, 'rows måste vara en icke-tom array', 422, 'VALIDATION_ERROR');
  if (rows.length > 2000) return err(ctx, 'Max 2 000 rader per import — dela upp filen i mindre delar', 422, 'VALIDATION_ERROR');

  await supabase.from('data_migration_sessions').update({
    status: 'uploading',
    file_name:       (b['file_name']       as string | undefined) ?? session.file_name,
    file_size_bytes: (b['file_size_bytes'] as number | undefined) ?? session.file_size_bytes,
    total_rows: rows.length,
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  // Clear any previous staging rows
  await supabase.from('data_migration_rows').delete().eq('session_id', id);

  const entity_type = session.entity_type as EntityType;
  const seenKeys    = new Set<string>(); // tracks emails (or reg numbers for vehicles)
  const staged = rows.map((row, i) => {
    const result = validateRow(entity_type, row as Record<string, string>, seenKeys);
    return {
      session_id:        id,
      organization_id:   orgId,
      row_number:        i + 1,
      raw_data:          row,
      normalized_data:   result.normalized_data,
      validation_status: result.status,
      errors:            result.errors,
      warnings:          result.warnings,
    };
  });

  const { error: insertErr } = await supabase.from('data_migration_rows').insert(staged);
  if (insertErr) {
    console.error('[data-migration] insert_rows:', insertErr.message);
    await supabase.from('data_migration_sessions').update({ status: 'failed', error_summary: insertErr.message, updated_at: new Date().toISOString() }).eq('id', id);
    return err(ctx, 'Kunde inte lagra importrader', 500, 'INTERNAL_ERROR');
  }

  const valid_rows   = staged.filter((r) => r.validation_status === 'valid').length;
  const warning_rows = staged.filter((r) => r.validation_status === 'warning').length;
  const error_rows   = staged.filter((r) => r.validation_status === 'error').length;

  const { data: updated, error: updErr } = await supabase
    .from('data_migration_sessions')
    .update({ status: 'validated', total_rows: rows.length, valid_rows, warning_rows, error_rows, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();

  if (updErr) return err(ctx, 'Rader sparades men sessionen kunde inte uppdateras', 500, 'INTERNAL_ERROR');
  return json({ data: updated });
}

async function handleListRows(supabase: any, orgId: string, id: string, url: URL, ctx: EdgeRequestContext): Promise<Response> {
  const { data: session } = await supabase
    .from('data_migration_sessions').select('id').eq('id', id).eq('organization_id', orgId).is('deleted_at', null).maybeSingle();

  if (!session) return err(ctx, `Session '${id}' hittades inte`, 404, 'NOT_FOUND');

  const page     = Math.max(1, parseInt(url.searchParams.get('page')     ?? '1', 10));
  const per_page = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') ?? '50', 10)));
  const status   = url.searchParams.get('status') ?? 'all';
  const from     = (page - 1) * per_page;

  let q = supabase.from('data_migration_rows')
    .select('*', { count: 'exact' })
    .eq('session_id', id)
    .order('row_number', { ascending: true })
    .range(from, from + per_page - 1);

  if (status !== 'all') q = q.eq('validation_status', status);

  const { data, error, count } = await q;
  if (error) return err(ctx, 'Kunde inte hämta importrader', 500, 'INTERNAL_ERROR');
  return json({ data: data ?? [], meta: { total: count ?? 0, page, per_page } });
}

// ─── Import: per-entity helpers ───────────────────────────────────────────────

async function markImported(supabase: any, rowId: string, productionId: string): Promise<void> {
  await supabase.from('data_migration_rows').update({ validation_status: 'imported', production_id: productionId }).eq('id', rowId);
}

async function markSkipped(supabase: any, rowId: string): Promise<void> {
  await supabase.from('data_migration_rows').update({ validation_status: 'skipped' }).eq('id', rowId);
}

async function markFailed(supabase: any, rowId: string, existing_errors: ValidationIssue[], message: string, field = '_import'): Promise<void> {
  await supabase.from('data_migration_rows').update({
    validation_status: 'failed',
    errors: [...existing_errors, { field, message, severity: 'error' }],
  }).eq('id', rowId);
}

async function resolveStudentByEmail(supabase: any, orgId: string, email: string): Promise<string | null> {
  const { data } = await supabase.from('students')
    .select('id').eq('organization_id', orgId).eq('email', email).is('deleted_at', null).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function resolveInstructorByEmail(supabase: any, orgId: string, email: string): Promise<string | null> {
  const { data } = await supabase.from('instructors')
    .select('id').eq('organization_id', orgId).eq('email', email).is('deleted_at', null).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// ─── Import handler ───────────────────────────────────────────────────────────

async function handleImport(supabase: any, orgId: string, id: string, role: string | null, ctx: EdgeRequestContext): Promise<Response> {
  if (!role || !ADMIN_ROLES.has(role)) {
    return err(ctx, 'Endast admin, manager eller owner kan köra import', 403, 'FORBIDDEN');
  }

  const { data: session, error: sessErr } = await supabase
    .from('data_migration_sessions').select('*').eq('id', id).eq('organization_id', orgId).is('deleted_at', null).maybeSingle();

  if (sessErr || !session) return err(ctx, `Session '${id}' hittades inte`, 404, 'NOT_FOUND');
  if (!['validated', 'failed'].includes(session.status as string)) {
    return err(ctx, 'Session måste vara i status validated för att kunna importeras', 409, 'CONFLICT');
  }

  await supabase.from('data_migration_sessions').update({ status: 'importing', updated_at: new Date().toISOString() }).eq('id', id);

  const entity_type = session.entity_type as EntityType;
  const dry_run     = session.dry_run as boolean;

  const { data: rows, error: rowsErr } = await supabase
    .from('data_migration_rows').select('*').eq('session_id', id).in('validation_status', ['valid', 'warning']);

  if (rowsErr) {
    await supabase.from('data_migration_sessions').update({ status: 'failed', error_summary: rowsErr.message, updated_at: new Date().toISOString() }).eq('id', id);
    return err(ctx, 'Kunde inte läsa importrader', 500, 'INTERNAL_ERROR');
  }

  if (dry_run) {
    const rowIds = (rows ?? []).map((r: any) => r.id as string);
    if (rowIds.length > 0) {
      await supabase.from('data_migration_rows').update({ validation_status: 'skipped' }).in('id', rowIds);
    }
    await supabase.from('data_migration_sessions').update({
      status: 'completed', skipped_rows: rowIds.length, imported_rows: 0,
      error_summary: 'Dry run — inga rader importerades till produktionsdatabasen',
      completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', id);
    return json({ data: { imported: 0, skipped: rowIds.length, failed: 0, dry_run: true } });
  }

  let imported = 0;
  let skipped  = 0;
  let failed   = 0;

  for (const row of (rows ?? []) as any[]) {
    const nd = row.normalized_data as NormalizedRow | null;
    if (!nd) { await markSkipped(supabase, row.id); skipped++; continue; }

    const rowErrors = (row.errors as ValidationIssue[]) ?? [];

    try {
      // ── Students ──────────────────────────────────────────────────────────
      if (entity_type === 'students') {
        // Resolve assigned instructor if provided
        let assigned_instructor_id: string | null = null;
        const instrEmail = nd['instructor_email'] as string | undefined;
        if (instrEmail) {
          assigned_instructor_id = await resolveInstructorByEmail(supabase, orgId, instrEmail);
        }

        const insertData: Record<string, unknown> = {
          organization_id:          orgId,
          first_name:               nd['first_name'],
          last_name:                nd['last_name'],
          email:                    nd['email']          ?? null,
          phone:                    nd['phone']          ?? null,
          address_line1:            nd['address_line1']  ?? null,
          postal_code:              nd['postal_code']    ?? null,
          city:                     nd['city']           ?? null,
          date_of_birth:            nd['date_of_birth']  ?? null,
          personnummer_last4:       nd['personnummer_last4'] ?? null,
          identity_type:            nd['identity_type']  ?? 'none',
          status:                   nd['status']         ?? 'active',
          target_licence_category:  nd['target_licence_category'] ?? 'B',
          permit_stage:             nd['permit_stage']   ?? 'not_started',
          enrolled_at:              nd['enrolled_at']    ?? null,
          assigned_instructor_id:   assigned_instructor_id,
          risk1_completed_at:       nd['risk1_completed_at']  ?? null,
          risk2_completed_at:       nd['risk2_completed_at']  ?? null,
          theory_passed_at:         nd['theory_passed_at']    ?? null,
          practical_passed_at:      nd['practical_passed_at'] ?? null,
          created_by:               null,
          updated_by:               null,
        };

        const { data: inserted, error: insErr } = await supabase.from('students').insert(insertData).select('id').single();
        if (insErr) {
          if (insErr.code === '23505') { await markSkipped(supabase, row.id); skipped++; }
          else { await markFailed(supabase, row.id, rowErrors, insErr.message); failed++; }
        } else {
          await markImported(supabase, row.id, inserted.id); imported++;
        }
        continue;
      }

      // ── Instructors ───────────────────────────────────────────────────────
      if (entity_type === 'instructors') {
        const { data: inserted, error: insErr } = await supabase.from('instructors').insert({
          organization_id:         orgId,
          first_name:              nd['first_name'],
          last_name:               nd['last_name'],
          email:                   nd['email'],
          phone:                   nd['phone']               ?? null,
          date_of_birth:           nd['date_of_birth']       ?? null,
          personnummer_last4:      nd['personnummer_last4']   ?? null,
          identity_type:           nd['identity_type']       ?? 'none',
          employment_type:         nd['employment_type']     ?? 'employed',
          teaching_categories:     nd['teaching_categories'] ?? ['B'],
          languages_spoken:        nd['languages_spoken']    ?? ['sv'],
          employment_started_at:   nd['employment_started_at'] ?? null,
          adi_number:              nd['adi_number']           ?? null,
          adi_valid_until:         nd['adi_valid_until']      ?? null,
          created_by:              null,
          updated_by:              null,
        }).select('id').single();

        if (insErr) {
          if (insErr.code === '23505') { await markSkipped(supabase, row.id); skipped++; }
          else { await markFailed(supabase, row.id, rowErrors, insErr.message); failed++; }
        } else {
          await markImported(supabase, row.id, inserted.id); imported++;
        }
        continue;
      }

      // ── Vehicles ──────────────────────────────────────────────────────────
      if (entity_type === 'vehicles') {
        const regNum = nd['registration_number'] as string;
        const { data: existing } = await supabase.from('vehicles')
          .select('id').eq('organization_id', orgId).eq('registration_number', regNum).maybeSingle();

        if (existing) { await markSkipped(supabase, row.id); skipped++; continue; }

        const { data: inserted, error: insErr } = await supabase.from('vehicles').insert({
          organization_id:          orgId,
          registration_number:      nd['registration_number'],
          make:                     nd['make'],
          model:                    nd['model'],
          model_year:               nd['model_year'],
          transmission:             nd['transmission']           ?? 'manual',
          fuel_type:                nd['fuel_type']              ?? 'gasoline',
          has_dual_controls:        nd['has_dual_controls']      ?? true,
          teaching_categories:      nd['teaching_categories']    ?? ['B'],
          operational_status:       nd['operational_status']     ?? 'available',
          registration_expires_at:  nd['registration_expires_at'],
          insurance_expires_at:     nd['insurance_expires_at'],
          next_inspection_due_at:   nd['next_inspection_due_at'] ?? null,
          color:                    nd['color']                  ?? null,
          vin:                      nd['vin']                    ?? null,
          created_by:               null,
          updated_by:               null,
        }).select('id').single();

        if (insErr) {
          if (insErr.code === '23505') { await markSkipped(supabase, row.id); skipped++; }
          else { await markFailed(supabase, row.id, rowErrors, insErr.message); failed++; }
        } else {
          await markImported(supabase, row.id, inserted.id); imported++;
        }
        continue;
      }

      // ── Packages (credit carry-over) ──────────────────────────────────────
      if (entity_type === 'packages') {
        const studentId = await resolveStudentByEmail(supabase, orgId, nd['student_email'] as string);
        if (!studentId) {
          await markFailed(supabase, row.id, rowErrors, `Elev '${nd['student_email']}' finns inte — importera elever först`, 'student_email');
          failed++;
          continue;
        }

        const { data: inserted, error: insErr } = await supabase.from('credit_ledger').insert({
          organization_id: orgId,
          student_id:      studentId,
          lesson_category: nd['lesson_category'] ?? 'driving',
          entry_type:      'bonus',
          quantity:        nd['quantity'],
          currency:        'SEK',
          description:     (nd['description'] as string) || 'Migrerade krediter från tidigare system',
          expires_at:      nd['expires_at'] ?? null,
          metadata:        { migrated: true },
        }).select('id').single();

        if (insErr) {
          await markFailed(supabase, row.id, rowErrors, insErr.message);
          failed++;
        } else {
          await markImported(supabase, row.id, inserted.id); imported++;
        }
        continue;
      }

      // ── Bookings ──────────────────────────────────────────────────────────
      if (entity_type === 'bookings') {
        const studentId = await resolveStudentByEmail(supabase, orgId, nd['student_email'] as string);
        if (!studentId) {
          await markFailed(supabase, row.id, rowErrors, `Elev '${nd['student_email']}' finns inte — importera elever först`, 'student_email');
          failed++;
          continue;
        }

        // Resolve instructor — optional, fall back to any available
        let instructorId: string | null = null;
        const instrEmail = nd['instructor_email'] as string | undefined;
        if (instrEmail) {
          instructorId = await resolveInstructorByEmail(supabase, orgId, instrEmail);
        }
        if (!instructorId) {
          const { data: anyInstr } = await supabase.from('instructors')
            .select('id').eq('organization_id', orgId).is('deleted_at', null).limit(1).maybeSingle();
          instructorId = (anyInstr as { id: string } | null)?.id ?? null;
        }
        if (!instructorId) {
          await markFailed(supabase, row.id, rowErrors, 'Ingen instruktör hittades — importera instruktörer först', 'instructor_email');
          failed++;
          continue;
        }

        // Resolve vehicle — optional
        let vehicleId: string | null = null;
        const vehicleReg = nd['vehicle_registration'] as string | undefined;
        if (vehicleReg) {
          const { data: veh } = await supabase.from('vehicles')
            .select('id').eq('organization_id', orgId).eq('registration_number', vehicleReg).is('deleted_at', null).maybeSingle();
          vehicleId = (veh as { id: string } | null)?.id ?? null;
        }

        // Resolve lesson type — find by category, create migration type if missing
        const lessonCategory = (nd['lesson_category'] as string) || 'driving';
        let lessonTypeId: string;
        const { data: lt } = await supabase.from('lesson_types')
          .select('id').eq('organization_id', orgId).eq('category', lessonCategory).eq('is_active', true).limit(1).maybeSingle();

        if (lt) {
          lessonTypeId = (lt as { id: string }).id;
        } else {
          // Upsert a migration placeholder lesson type
          const migCode = `migration_${lessonCategory}`;
          const { data: newLt } = await supabase.from('lesson_types').upsert({
            organization_id:          orgId,
            name:                     `${lessonCategory.charAt(0).toUpperCase() + lessonCategory.slice(1)} (migration)`,
            code:                     migCode,
            category:                 lessonCategory,
            default_duration_minutes: 60,
            min_duration_minutes:     30,
            max_duration_minutes:     180,
            requires_vehicle:         lessonCategory === 'driving' || lessonCategory === 'risk2',
            requires_instructor:      true,
            max_students_per_slot:    1,
            color_hex:                '#6B7280',
            is_active:                true,
          }, { onConflict: 'organization_id,code' }).select('id').single();
          lessonTypeId = (newLt as { id: string }).id;
        }

        // Build UTC timestamps — assume Europe/Stockholm (CET UTC+1)
        const date      = nd['date'] as string;
        const startTime = nd['start_time'] as string;
        const dur       = nd['duration_minutes'] as number;
        const starts_at = new Date(`${date}T${startTime}:00+01:00`).toISOString();
        const ends_at   = new Date(new Date(starts_at).getTime() + dur * 60_000).toISOString();

        // Determine statuses
        const isPast          = new Date(starts_at) < new Date();
        const rawBookingSt    = (nd['booking_status'] as string | undefined) ?? '';
        const finalBookingSt  = rawBookingSt && BOOKING_STATUSES.has(rawBookingSt) ? rawBookingSt
          : isPast ? 'completed' : 'confirmed';
        const slotStatus      = finalBookingSt === 'cancelled' ? 'cancelled'
          : isPast ? 'completed' : 'open';

        // Create lesson slot
        const { data: slot, error: slotErr } = await supabase.from('lesson_slots').insert({
          organization_id:   orgId,
          instructor_id:     instructorId,
          vehicle_id:        vehicleId,
          lesson_type_id:    lessonTypeId,
          starts_at,
          ends_at,
          status:            slotStatus,
          max_bookings:      1,
          generation_source: 'imported',
          notes:             (nd['notes'] as string) ?? null,
        }).select('id').single();

        if (slotErr) {
          if (slotErr.code === '23P01') { // EXCLUDE constraint — time overlap
            await markSkipped(supabase, row.id);
            skipped++;
          } else {
            await markFailed(supabase, row.id, rowErrors, slotErr.message);
            failed++;
          }
          continue;
        }

        // Create lesson booking
        const { data: booking, error: bookErr } = await supabase.from('lesson_bookings').insert({
          organization_id: orgId,
          slot_id:         slot.id,
          student_id:      studentId,
          status:          finalBookingSt,
        }).select('id').single();

        if (bookErr) {
          // Roll back the slot
          await supabase.from('lesson_slots').delete().eq('id', slot.id);
          if (bookErr.code === '23505') { await markSkipped(supabase, row.id); skipped++; }
          else { await markFailed(supabase, row.id, rowErrors, bookErr.message); failed++; }
        } else {
          await markImported(supabase, row.id, booking.id); imported++;
        }
        continue;
      }

      // ── Invoices ──────────────────────────────────────────────────────────
      if (entity_type === 'invoices') {
        const studentId = await resolveStudentByEmail(supabase, orgId, nd['student_email'] as string);
        if (!studentId) {
          await markFailed(supabase, row.id, rowErrors, `Elev '${nd['student_email']}' finns inte — importera elever först`, 'student_email');
          failed++;
          continue;
        }

        const origNum = nd['original_invoice_number'] as string | undefined;
        if (origNum) {
          const { data: dup } = await supabase.from('invoices')
            .select('id').eq('organization_id', orgId).eq('invoice_number', origNum).maybeSingle();
          if (dup) { await markSkipped(supabase, row.id); skipped++; continue; }
        }

        const totalAmount = nd['amount_incl_vat'] as number;
        const vatRate     = (nd['vat_rate'] as number) ?? 0.25;
        const subtotal    = Math.round((totalAmount / (1 + vatRate)) * 100) / 100;
        const vatAmount   = Math.round((totalAmount - subtotal) * 100) / 100;
        const status      = (nd['status'] as string) ?? 'issued';
        const isPaid      = status === 'paid';

        const { data: inserted, error: insErr } = await supabase.from('invoices').insert({
          organization_id:    orgId,
          student_id:         studentId,
          invoice_number:     origNum ?? null,
          status,
          currency:           'SEK',
          subtotal_amount:    subtotal,
          vat_amount:         vatAmount,
          total_amount:       totalAmount,
          paid_amount:        isPaid ? totalAmount : 0,
          outstanding_amount: isPaid ? 0 : totalAmount,
          due_date:           (nd['due_date'] as string) ?? null,
          issued_at:          nd['invoice_date'] ? new Date(nd['invoice_date'] as string).toISOString() : null,
          paid_at:            isPaid && nd['invoice_date'] ? new Date(nd['invoice_date'] as string).toISOString() : null,
          notes:              (nd['description'] as string) ?? null,
          metadata:           { migrated: true },
        }).select('id').single();

        if (insErr) {
          if (insErr.code === '23505') { await markSkipped(supabase, row.id); skipped++; }
          else { await markFailed(supabase, row.id, rowErrors, insErr.message); failed++; }
        } else {
          await markImported(supabase, row.id, inserted.id); imported++;
        }
        continue;
      }

      // ── Payments ──────────────────────────────────────────────────────────
      if (entity_type === 'payments') {
        const studentId = await resolveStudentByEmail(supabase, orgId, nd['student_email'] as string);
        if (!studentId) {
          await markFailed(supabase, row.id, rowErrors, `Elev '${nd['student_email']}' finns inte — importera elever först`, 'student_email');
          failed++;
          continue;
        }

        const invoiceNum = nd['invoice_number'] as string;
        const { data: invoice } = await supabase.from('invoices')
          .select('id, total_amount, paid_amount').eq('organization_id', orgId).eq('invoice_number', invoiceNum).maybeSingle();

        if (!invoice) {
          await markFailed(supabase, row.id, rowErrors, `Faktura '${invoiceNum}' hittades inte — importera fakturor innan betalningar`, 'invoice_number');
          failed++;
          continue;
        }

        const amount        = nd['amount'] as number;
        const paymentDate   = nd['payment_date'] as string;
        const paymentMethod = nd['payment_method'] as string;

        const { data: inserted, error: insErr } = await supabase.from('payments').insert({
          organization_id:    orgId,
          invoice_id:         (invoice as { id: string }).id,
          student_id:         studentId,
          payment_method:     paymentMethod,
          status:             'confirmed',
          amount,
          currency:           'SEK',
          provider_reference: (nd['reference'] as string) ?? null,
          paid_at:            new Date(paymentDate).toISOString(),
          confirmed_at:       new Date(paymentDate).toISOString(),
          notes:              (nd['notes'] as string) ?? null,
          metadata:           { migrated: true },
        }).select('id').single();

        if (insErr) {
          if (insErr.code === '23505') { await markSkipped(supabase, row.id); skipped++; }
          else { await markFailed(supabase, row.id, rowErrors, insErr.message); failed++; }
          continue;
        }

        // Update invoice payment tracking
        const inv = invoice as { id: string; total_amount: number; paid_amount: number };
        const newPaid       = inv.paid_amount + amount;
        const newOutstanding = inv.total_amount - newPaid;
        const newStatus     = newPaid >= inv.total_amount ? 'paid'
          : newPaid > 0 ? 'partially_paid' : 'issued';

        await supabase.from('invoices').update({
          paid_amount:        newPaid,
          outstanding_amount: newOutstanding,
          status:             newStatus,
          paid_at:            newStatus === 'paid' ? new Date(paymentDate).toISOString() : null,
          updated_at:         new Date().toISOString(),
        }).eq('id', inv.id);

        await markImported(supabase, row.id, inserted.id);
        imported++;
        continue;
      }

      // Unknown entity — should never happen
      await markSkipped(supabase, row.id);
      skipped++;

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markFailed(supabase, row.id, (row.errors as ValidationIssue[]) ?? [], msg);
      failed++;
    }
  }

  await supabase.from('data_migration_sessions').update({
    status:        'completed',
    imported_rows: imported,
    skipped_rows:  skipped,
    completed_at:  new Date().toISOString(),
    updated_at:    new Date().toISOString(),
  }).eq('id', id);

  return json({ data: { imported, skipped, failed, dry_run: false } });
}

function handleTemplate(entity: string, ctx: EdgeRequestContext): Response {
  const VALID = new Set(['students', 'instructors', 'vehicles', 'packages', 'bookings', 'invoices', 'payments']);
  if (!VALID.has(entity)) return err(ctx, `Okänd entitetstyp: ${entity}`, 404, 'NOT_FOUND');

  return new Response(CSV_TEMPLATES[entity as EntityType], {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mall-${entity}.csv"`,
    },
  });
}

// ─── Main router ──────────────────────────────────────────────────────────────

Deno.serve((req: Request) => serveCors(req, async () => {
  const ctxResult = await buildEdgeContext(req);
  if (!ctxResult.ok) return ctxResult.response;
  const ctx = ctxResult.ctx;

  const ipGuard = enforceIpRateLimit(req, 'ip_auth', ctx.correlationId);
  if (ipGuard) return ipGuard;
  if (req.method !== 'GET') {
    const writeGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'user_write', ctx.correlationId);
    if (writeGuard) return writeGuard;
  }

  const subGuard = requireFeature(ctx, 'admin:data-migration:run');
  if (subGuard) return subGuard;

  const orgId  = ctx.organizationId!;
  const userId = ctx.actorId!;
  const role   = ctx.actorRole;

  const supabaseClient = createServiceClient();

  const url     = new URL(req.url);
  const segs    = url.pathname.split('/').filter(Boolean);
  const fnIdx   = segs.lastIndexOf('data-migration');
  const parts   = fnIdx >= 0 ? segs.slice(fnIdx + 1) : [];
  const first   = parts[0] ?? '';
  const second  = parts[1] ?? '';

  try {
    if (req.method === 'GET' && first === 'templates' && second) return handleTemplate(second, ctx);

    if (!first) {
      if (req.method === 'GET')  return await handleListSessions(supabaseClient, orgId, url, ctx);
      if (req.method === 'POST') return await handleCreateSession(supabaseClient, orgId, userId, req, ctx);
      return err(ctx, 'Metod ej tillåten', 405, 'METHOD_NOT_ALLOWED');
    }

    const sessionId = first;

    if (second === 'upload' && req.method === 'POST') return await handleUploadRows(supabaseClient, orgId, sessionId, req, ctx);
    if (second === 'rows'   && req.method === 'GET')  return await handleListRows(supabaseClient, orgId, sessionId, url, ctx);
    if (second === 'import' && req.method === 'POST') return await handleImport(supabaseClient, orgId, sessionId, role, ctx);

    if (!second) {
      if (req.method === 'GET')    return await handleGetSession(supabaseClient, orgId, sessionId, ctx);
      if (req.method === 'DELETE') return await handleCancelSession(supabaseClient, orgId, sessionId, ctx);
    }

    return err(ctx, 'Rutten hittades inte', 404, 'NOT_FOUND');
  } catch (e) {
    console.error('[data-migration] unhandled error:', e);
    return err(ctx, 'Ett oväntat fel inträffade', 500, 'INTERNAL_ERROR');
  }
}));
