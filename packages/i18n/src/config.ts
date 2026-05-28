import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Swedish translations — admin app (always Swedish)
import svCommon from '../locales/sv/common.json';
import svAuth from '../locales/sv/auth.json';
import svNavigation from '../locales/sv/navigation.json';
import svErrors from '../locales/sv/errors.json';
import svDashboard from '../locales/sv/dashboard.json';

// English translations — student portal
import enCommon from '../locales/en/common.json';
import enAuth from '../locales/en/auth.json';
import enNavigation from '../locales/en/navigation.json';
import enErrors from '../locales/en/errors.json';
import enDashboard from '../locales/en/dashboard.json';

export type SupportedLanguage = 'sv' | 'en';

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['sv', 'en'];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'sv';
export const FALLBACK_LANGUAGE: SupportedLanguage = 'sv';

export const NAMESPACES = ['common', 'auth', 'navigation', 'errors', 'dashboard'] as const;
export type I18nNamespace = typeof NAMESPACES[number];

const resources = {
  sv: {
    common: svCommon,
    auth: svAuth,
    navigation: svNavigation,
    errors: svErrors,
    dashboard: svDashboard,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    navigation: enNavigation,
    errors: enErrors,
    dashboard: enDashboard,
  },
};

/**
 * Initialize i18n for the admin web app.
 * Language is always Swedish — no detection needed.
 */
export function initAdminI18n(): Promise<void> {
  if (i18n.isInitialized) return Promise.resolve();

  return i18n
    .use(initReactI18next)
    .init({
      lng: DEFAULT_LANGUAGE,
      fallbackLng: FALLBACK_LANGUAGE,
      ns: NAMESPACES,
      defaultNS: 'common',
      resources,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
    .then(() => undefined);
}

/**
 * Initialize i18n for student-facing apps.
 * Language detected from browser, defaulting to Swedish.
 */
export function initStudentI18n(): Promise<void> {
  if (i18n.isInitialized) return Promise.resolve();

  return i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      lng: DEFAULT_LANGUAGE,
      fallbackLng: FALLBACK_LANGUAGE,
      supportedLngs: SUPPORTED_LANGUAGES,
      ns: NAMESPACES,
      defaultNS: 'common',
      resources,
      interpolation: { escapeValue: false },
      detection: {
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
        lookupLocalStorage: 'platform_language',
      },
      react: { useSuspense: false },
    })
    .then(() => undefined);
}

export { i18n };
