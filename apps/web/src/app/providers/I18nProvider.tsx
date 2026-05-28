import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '@platform/i18n';

/**
 * I18nProvider wraps the app with the i18next React provider.
 * i18n is already initialized in main.tsx before render — this just wires React.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
