// ─── Public booking form — tenant-configurable field visibility/required ───
// Tenant Administrators configure which qualification fields appear on their
// public registration form, which are mandatory, which license categories
// they actually offer, and the default preferred language — all from
// organizations.settings.public_booking_form (Tenant Workspace, no developer
// intervention). Unconfigured = every field visible/optional, every license
// category offered, Swedish default — the previous, pre-expansion behavior.

export interface LeadFormFieldConfig {
  visible:  boolean;
  required: boolean;
}

export interface PublicBookingFormConfig {
  fields:                     Record<string, LeadFormFieldConfig>;
  license_categories:         string[];
  default_preferred_language: string;
}

export const LICENSE_CATEGORIES = [
  { value: 'AM',  label: 'AM — Moped klass II'       },
  { value: 'A1',  label: 'A1 — Lätt MC'              },
  { value: 'A2',  label: 'A2 — Mellantung MC'        },
  { value: 'A',   label: 'A — Tung MC'               },
  { value: 'B',   label: 'B — Personbil'             },
  { value: 'BE',  label: 'BE — Personbil med släp'   },
  { value: 'C1',  label: 'C1 — Lätt lastbil'         },
  { value: 'C',   label: 'C — Lastbil'               },
  { value: 'CE',  label: 'CE — Lastbil med släp'     },
  { value: 'D1',  label: 'D1 — Minibuss'             },
  { value: 'D',   label: 'D — Buss'                  },
];

const ALL_LICENSE_CATEGORY_VALUES = LICENSE_CATEGORIES.map((c) => c.value);

export const VALID_PREFERRED_LANGUAGES = ['sv', 'en', 'ar', 'de', 'fr', 'so', 'ku', 'fa'] as const;

// Configurable fields — 'training_needs' groups needs_theory/needs_risk1/
// needs_risk2 as one visual toggle (a school either wants to ask about
// training needs or doesn't; three separate visibility toggles for what's
// rendered as one checkbox group would be UI complexity with no real use case).
export const CONFIGURABLE_FIELDS = [
  'preferred_start_date',
  'driving_experience',
  'learner_permit_status',
  'preferred_transmission',
  'preferred_lesson_times',
  'preferred_language',
  'existing_license_category',
  'training_needs',
  'notes',
] as const;

export type ConfigurableField = typeof CONFIGURABLE_FIELDS[number];

export function resolvePublicBookingFormConfig(
  settings: Record<string, unknown> | null | undefined,
): PublicBookingFormConfig {
  const s = settings ?? {};
  const raw = (s['public_booking_form'] as Record<string, unknown> | undefined) ?? {};
  const rawFields = (raw['fields'] as Record<string, Partial<LeadFormFieldConfig>> | undefined) ?? {};

  const fields: Record<string, LeadFormFieldConfig> = {};
  for (const key of CONFIGURABLE_FIELDS) {
    const f = rawFields[key];
    fields[key] = {
      visible:  f?.visible !== false,   // default: shown
      required: f?.required === true,   // default: optional
    };
  }

  const rawCategories = raw['license_categories'];
  const license_categories = Array.isArray(rawCategories) && rawCategories.length > 0
    ? rawCategories.filter((c): c is string => typeof c === 'string' && ALL_LICENSE_CATEGORY_VALUES.includes(c))
    : ALL_LICENSE_CATEGORY_VALUES;

  const rawLang = raw['default_preferred_language'];
  const default_preferred_language = typeof rawLang === 'string'
    && (VALID_PREFERRED_LANGUAGES as readonly string[]).includes(rawLang)
    ? rawLang
    : 'sv';

  return { fields, license_categories, default_preferred_language };
}
