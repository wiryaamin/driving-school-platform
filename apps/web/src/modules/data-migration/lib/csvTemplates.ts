// ─── CSV Template Definitions ─────────────────────────────────────────────────

export type MigrationEntity =
  | 'students'
  | 'instructors'
  | 'vehicles'
  | 'packages'
  | 'bookings'
  | 'invoices'
  | 'payments';

export const ENTITY_LABELS: Record<MigrationEntity, string> = {
  students:    'Elever',
  instructors: 'Instruktörer',
  vehicles:    'Fordon',
  packages:    'Lektionspaket / krediter',
  bookings:    'Bokningar',
  invoices:    'Fakturor',
  payments:    'Betalningar',
};

export const ENTITY_DESCRIPTIONS: Record<MigrationEntity, string> = {
  students:    'Elevregister med kontaktuppgifter, körkortskategori, och tillståndssteg. Importera som steg 3.',
  instructors: 'Instruktörer med anställningstyp och undervisningsbehörighet. Importera som steg 1.',
  vehicles:    'Fordonsflotta med tekniska uppgifter och obligatoriska försäkrings- och registreringsdatum. Importera som steg 2.',
  packages:    'Elevernas kvarvarande lektionskredit från det gamla systemet. Importera efter elever (steg 4).',
  bookings:    'Historiska och framtida bokningar. Kräver att elever och instruktörer finns i systemet. Importera som steg 5.',
  invoices:    'Fakturor kopplade till elever. Kräver att elever finns. Importera som steg 6.',
  payments:    'Betalningar mot fakturor. Kräver att både elever och fakturor finns. Importera som steg 7.',
};

export const RECOMMENDED_IMPORT_ORDER: MigrationEntity[] = [
  'instructors',
  'vehicles',
  'students',
  'packages',
  'bookings',
  'invoices',
  'payments',
];

export interface ColumnSpec {
  key:      string;
  label:    string;
  required: boolean;
  example:  string;
  hint?:    string;
}

export const TEMPLATE_COLUMNS: Record<MigrationEntity, ColumnSpec[]> = {
  students: [
    { key: 'first_name',              label: 'Förnamn',                required: true,  example: 'Anna' },
    { key: 'last_name',               label: 'Efternamn',              required: true,  example: 'Svensson' },
    { key: 'personnummer',            label: 'Personnummer',           required: false, example: '199001011234', hint: 'Format: YYYYMMDD-XXXX eller YYYYMMDDXXXX' },
    { key: 'email',                   label: 'E-post',                 required: false, example: 'anna@example.com' },
    { key: 'phone',                   label: 'Telefon',                required: false, example: '+46701234567' },
    { key: 'address_street',          label: 'Gatuadress',             required: false, example: 'Storgatan 1' },
    { key: 'address_city',            label: 'Stad',                   required: false, example: 'Stockholm' },
    { key: 'address_postal_code',     label: 'Postnummer',             required: false, example: '11111' },
    { key: 'target_licence_category', label: 'Körkortskategori',       required: false, example: 'B', hint: 'B, BE, A, A2, A1, C, CE, D, DE, AM, MC' },
    { key: 'enrolled_at',             label: 'Inskrivningsdatum',      required: false, example: '2025-09-01', hint: 'Format: YYYY-MM-DD' },
    { key: 'status',                  label: 'Status',                 required: false, example: 'active', hint: 'lead, onboarding, active, paused, completed, withdrawn' },
    { key: 'permit_stage',            label: 'Tillståndssteg',         required: false, example: 'theory_study', hint: 'not_started, theory_study, risk1_completed, theory_passed, m.fl.' },
    { key: 'instructor_email',        label: 'Instruktörens e-post',   required: false, example: 'maria@korskola.se', hint: 'Tilldelar eleven till instruktören' },
    { key: 'risk1_completed_at',      label: 'Risk 1 datum',           required: false, example: '2025-11-15', hint: 'Datum riskutbildning 1 avklarades, YYYY-MM-DD' },
    { key: 'risk2_completed_at',      label: 'Risk 2 datum',           required: false, example: '2026-01-20', hint: 'Datum riskutbildning 2 avklarades, YYYY-MM-DD' },
    { key: 'theory_passed_at',        label: 'Kunskapsprov datum',     required: false, example: '2026-03-10', hint: 'Datum kunskapsprov godkändes, YYYY-MM-DD' },
    { key: 'practical_passed_at',     label: 'Körprov datum',          required: false, example: '2026-05-22', hint: 'Datum körprov godkändes, YYYY-MM-DD' },
    { key: 'notes',                   label: 'Anteckningar',           required: false, example: 'Engagerad elev' },
  ],

  instructors: [
    { key: 'first_name',             label: 'Förnamn',              required: true,  example: 'Maria' },
    { key: 'last_name',              label: 'Efternamn',            required: true,  example: 'Johansson' },
    { key: 'personnummer',           label: 'Personnummer',         required: false, example: '198503152345' },
    { key: 'email',                  label: 'E-post',               required: true,  example: 'maria@korskola.se' },
    { key: 'phone',                  label: 'Telefon',              required: false, example: '+46701234568' },
    { key: 'employment_type',        label: 'Anställningstyp',      required: false, example: 'employed', hint: 'employed, contractor, external, on_leave, inactive' },
    { key: 'teaching_categories',    label: 'Undervisningskategorier', required: false, example: 'B,C', hint: 'Kommaseparerat: B, BE, C, CE, D, A, m.fl.' },
    { key: 'employment_started_at',  label: 'Anställningsstart',    required: false, example: '2020-03-01', hint: 'Format: YYYY-MM-DD' },
    { key: 'adi_number',             label: 'ADI-nummer',           required: false, example: 'SE-12345', hint: 'Trafikverkets godkännandenummer' },
    { key: 'adi_valid_until',        label: 'ADI gäller till',      required: false, example: '2028-03-01', hint: 'Format: YYYY-MM-DD' },
    { key: 'languages_spoken',       label: 'Undervisningsspråk',   required: false, example: 'sv,en', hint: 'Kommaseparerat: sv, en, ar, m.fl.' },
  ],

  vehicles: [
    { key: 'registration_number',    label: 'Registreringsnummer',    required: true,  example: 'ABC123' },
    { key: 'make',                   label: 'Märke',                  required: true,  example: 'Volvo' },
    { key: 'model',                  label: 'Modell',                 required: true,  example: 'V60' },
    { key: 'model_year',             label: 'Årsmodell',              required: true,  example: '2022' },
    { key: 'transmission',           label: 'Växellåda',              required: false, example: 'manual', hint: 'manual, automatic, semi_automatic' },
    { key: 'fuel_type',              label: 'Bränsletyp',             required: false, example: 'diesel', hint: 'gasoline, diesel, electric, hybrid, plugin_hybrid, ethanol, gas' },
    { key: 'has_dual_controls',      label: 'Dubbla kontroller',      required: false, example: 'true', hint: 'true eller false' },
    { key: 'teaching_categories',    label: 'Undervisningskategorier', required: false, example: 'B', hint: 'Kommaseparerat: B, C, D, m.fl.' },
    { key: 'registration_expires_at', label: 'Registrering gäller till', required: true, example: '2027-06-30', hint: 'Format: YYYY-MM-DD' },
    { key: 'insurance_expires_at',   label: 'Försäkring gäller till', required: true,  example: '2027-01-15', hint: 'Format: YYYY-MM-DD' },
    { key: 'next_inspection_due_at', label: 'Nästa besiktning',       required: false, example: '2026-12-01', hint: 'Format: YYYY-MM-DD' },
    { key: 'color',                  label: 'Färg',                   required: false, example: 'Grå' },
    { key: 'vin',                    label: 'Chassinummer (VIN)',      required: false, example: 'YV1FW8AR4N2000001' },
  ],

  packages: [
    { key: 'student_email',   label: 'Elev e-post',         required: true,  example: 'anna@example.com' },
    { key: 'lesson_category', label: 'Lektionskategori',    required: true,  example: 'driving', hint: 'driving, theory, risk1, risk2, simulator, intensive, other' },
    { key: 'quantity',        label: 'Antal kvarvarande',   required: true,  example: '8', hint: 'Antal lektioner kvar från det gamla systemet' },
    { key: 'expires_at',      label: 'Utgångsdatum',        required: false, example: '2027-06-01', hint: 'Format: YYYY-MM-DD' },
    { key: 'description',     label: 'Beskrivning',         required: false, example: 'Kvarvarande körlektion B' },
  ],

  bookings: [
    { key: 'student_email',       label: 'Elev e-post',              required: true,  example: 'anna@example.com' },
    { key: 'instructor_email',    label: 'Instruktör e-post',        required: false, example: 'maria@korskola.se' },
    { key: 'vehicle_registration', label: 'Fordonets regnr',         required: false, example: 'ABC123' },
    { key: 'lesson_category',     label: 'Lektionskategori',         required: false, example: 'driving', hint: 'driving, theory, risk1, risk2, simulator, assessment, intensive, other' },
    { key: 'date',                label: 'Datum (YYYY-MM-DD)',       required: true,  example: '2026-05-10' },
    { key: 'start_time',          label: 'Starttid (HH:MM)',         required: true,  example: '09:00' },
    { key: 'duration_minutes',    label: 'Längd (minuter)',          required: true,  example: '50' },
    { key: 'booking_status',      label: 'Bokningsstatus',           required: false, example: 'completed', hint: 'completed, confirmed, cancelled, no_show' },
    { key: 'notes',               label: 'Anteckningar',             required: false, example: 'Bra lektion — öva filbyte' },
  ],

  invoices: [
    { key: 'student_email',    label: 'Elev e-post',                 required: true,  example: 'anna@example.com' },
    { key: 'invoice_number',   label: 'Ursprungligt fakturanummer',  required: false, example: '2025-0042', hint: 'Fakturanummer från det gamla systemet — används för att matcha betalningar' },
    { key: 'amount_incl_vat',  label: 'Totalbelopp inkl. moms (SEK)', required: true, example: '4375.00' },
    { key: 'vat_rate',         label: 'Momssats',                    required: false, example: '0.25', hint: '0.25 = 25% moms (standard), 0.12, 0.06, 0' },
    { key: 'invoice_date',     label: 'Fakturadatum (YYYY-MM-DD)',   required: true,  example: '2025-09-15' },
    { key: 'due_date',         label: 'Förfallodatum (YYYY-MM-DD)', required: false, example: '2025-10-15' },
    { key: 'status',           label: 'Status',                      required: false, example: 'paid', hint: 'draft, issued, paid, partially_paid, void, overdue' },
    { key: 'description',      label: 'Beskrivning',                 required: false, example: 'Körkortspaketet B — 10 lektioner' },
  ],

  payments: [
    { key: 'student_email',   label: 'Elev e-post',                  required: true,  example: 'anna@example.com' },
    { key: 'invoice_number',  label: 'Fakturanummer',                 required: true,  example: '2025-0042', hint: 'Måste matcha fakturans ursprungliga nummer' },
    { key: 'amount',          label: 'Belopp (SEK)',                  required: true,  example: '4375.00' },
    { key: 'payment_date',    label: 'Betalningsdatum (YYYY-MM-DD)', required: true,  example: '2025-09-20' },
    { key: 'payment_method',  label: 'Betalsätt',                    required: false, example: 'swish', hint: 'swish, card, bank_transfer, manual, stripe, invoice_credit, other' },
    { key: 'reference',       label: 'Referens',                     required: false, example: '12345678', hint: 'Swish-nr, bankgiro-ref, kortlösnings-ID, etc.' },
    { key: 'notes',           label: 'Anteckningar',                 required: false, example: 'Betalat via Swish' },
  ],
};

export function generateCsvTemplate(entity: MigrationEntity): Blob {
  const cols    = TEMPLATE_COLUMNS[entity];
  const header  = cols.map((c) => c.key).join(',');
  const sample  = cols.map((c) => `"${c.example}"`).join(',');
  const content = `${header}\n${sample}\n`;
  return new Blob([content], { type: 'text/csv;charset=utf-8;' });
}

export function downloadTemplate(entity: MigrationEntity): void {
  const blob = generateCsvTemplate(entity);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `mall-${entity}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
