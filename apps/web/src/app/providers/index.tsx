import type { ReactNode } from 'react';
import { QueryProvider } from './QueryProvider.js';
import { AuthProvider } from './AuthProvider.js';
import { I18nProvider } from './I18nProvider.js';
import { ThemeProvider } from './ThemeProvider.js';

/**
 * RootProviders — single root wrapper for all global providers.
 *
 * Provider order:
 * 1. ThemeProvider — applies dark/light class on <html> immediately
 * 2. I18nProvider — i18n available to all children
 * 3. QueryProvider — TanStack Query wraps auth
 * 4. AuthProvider — subscribes to auth state
 */
export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <QueryProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </QueryProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

export { QueryProvider } from './QueryProvider.js';
export { AuthProvider } from './AuthProvider.js';
export { I18nProvider } from './I18nProvider.js';
export { ThemeProvider } from './ThemeProvider.js';
