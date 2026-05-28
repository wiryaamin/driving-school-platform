export { i18n, initAdminI18n, initStudentI18n, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, FALLBACK_LANGUAGE, NAMESPACES } from './config.js';
export type { SupportedLanguage, I18nNamespace } from './config.js';

// Re-export react-i18next hooks and components for convenience
export { useTranslation, Trans, I18nextProvider } from 'react-i18next';
export type { TFunction } from 'i18next';
