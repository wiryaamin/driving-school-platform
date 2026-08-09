import type { DemoRequestStatus, DemoRequestRejectionReason } from '../hooks/useDemoRequests.js';

// Standard B2B lead-rejection taxonomy — matches
// supabase/functions/platform-admin/index.ts's REJECTION_REASONS exactly.
export const REJECTION_REASON_LABEL: Record<DemoRequestRejectionReason, string> = {
  duplicate_email:           'E-postadressen är redan registrerad',
  duplicate_request:         'Dubblettförfrågan',
  spam_or_fraud:             'Spam eller bedräglig förfrågan',
  incomplete_invalid_info:   'Ofullständig eller felaktig information',
  not_target_market:         'Passar inte plattformens målgrupp',
  unable_to_verify_business: 'Kunde inte verifiera verksamheten',
  outside_service_area:      'Utanför vårt verksamhetsområde',
  other:                     'Annat',
};

export const REJECTION_REASON_OPTIONS: DemoRequestRejectionReason[] = [
  'duplicate_email', 'duplicate_request', 'spam_or_fraud', 'incomplete_invalid_info',
  'not_target_market', 'unable_to_verify_business', 'outside_service_area', 'other',
];

export const STATUS_LABEL: Record<DemoRequestStatus, string> = {
  new:             'Ny',
  contacted:       'Kontaktad',
  demo_scheduled:  'Demo bokad',
  demo_completed:  'Demo genomförd',
  qualified:       'Kvalificerad',
  converted:       'Konverterad',
  declined:        'Avböjd',
  spam:            'Spam',
};

export const STATUS_BADGE_CLASS: Record<DemoRequestStatus, string> = {
  new:             'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  contacted:       'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  demo_scheduled:  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  demo_completed:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  qualified:       'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  converted:       'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  declined:        'bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400',
  spam:            'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Alla statusar' },
  ...(Object.keys(STATUS_LABEL) as DemoRequestStatus[]).map(s => ({ value: s, label: STATUS_LABEL[s] })),
];
