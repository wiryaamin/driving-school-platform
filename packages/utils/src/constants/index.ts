// ─── Sweden ───────────────────────────────────────────────────────────────────

export const SWEDEN = {
  COUNTRY_CODE: 'SE',
  PHONE_PREFIX: '+46',
  CURRENCY: 'SEK',
  TIMEZONE: 'Europe/Stockholm',
  LOCALE: 'sv-SE',
  VAT_RATE: 0.25,
  LANGUAGE: 'sv',
} as const;

// ─── License Categories ───────────────────────────────────────────────────────

export const LICENSE_CATEGORIES = [
  'AM', 'A1', 'A2', 'A',
  'B', 'BE',
  'C1', 'C1E', 'C', 'CE',
  'D1', 'D1E', 'D', 'DE',
] as const;

export type LicenseCategory = typeof LICENSE_CATEGORIES[number];

// ─── Swedish Lesson Durations ─────────────────────────────────────────────────

export const LESSON_DURATION_MINUTES = [40, 50, 60, 80, 100, 120] as const;

export type LessonDurationMinutes = typeof LESSON_DURATION_MINUTES[number];

// ─── Pagination ───────────────────────────────────────────────────────────────

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 25,
  PAGE_SIZE_OPTIONS: [10, 25, 50, 100] as const,
  MAX_PAGE_SIZE: 100,
} as const;

// ─── Date Formats ─────────────────────────────────────────────────────────────

export const DATE_FORMAT = {
  DISPLAY: 'yyyy-MM-dd',
  DISPLAY_LONG: 'd MMMM yyyy',
  DISPLAY_WITH_TIME: 'yyyy-MM-dd HH:mm',
  TIME_ONLY: 'HH:mm',
  API: "yyyy-MM-dd'T'HH:mm:ssXXX",
  MONTH_YEAR: 'MMMM yyyy',
} as const;

// ─── Subscription Tiers ───────────────────────────────────────────────────────

export const SUBSCRIPTION_TIERS = ['trial', 'starter', 'professional', 'enterprise'] as const;

// ─── File Uploads ─────────────────────────────────────────────────────────────

export const FILE_UPLOAD = {
  MAX_SIZE_MB: 25,
  MAX_SIZE_BYTES: 25 * 1024 * 1024,
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
} as const;

// ─── Storage Buckets ──────────────────────────────────────────────────────────

export const STORAGE_BUCKET = {
  ORG_DOCUMENTS: 'org-documents',
  PROFILE_PHOTOS: 'profile-photos',
  GENERATED_REPORTS: 'generated-reports',
  PLATFORM_ASSETS: 'platform-assets',
} as const;

// ─── Query Stale Times ────────────────────────────────────────────────────────

export const STALE_TIME = {
  SHORT: 30_000,        // 30 seconds — schedules, availability
  MEDIUM: 5 * 60_000,   // 5 minutes — student lists
  LONG: 30 * 60_000,    // 30 minutes — reference data (roles, permissions)
  STATIC: Infinity,     // Never refetch — config, constants
} as const;
