import type { ReactNode } from 'react';
import { QueryProvider } from './QueryProvider.js';
import { AuthProvider } from './AuthProvider.js';
import { I18nProvider } from './I18nProvider.js';

/**
 * RootProviders — the single root wrapper that applies all global providers.
 *
 * Provider order matters:
 * 1. I18nProvider — i18n must be available to all children (including error messages)
 * 2. QueryProvider — TanStack Query must wrap AuthProvider (auth uses queries)
 * 3. AuthProvider — subscribes to auth state, uses queryClient for cache invalidation
 */
export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <QueryProvider>
        <AuthProvider>
          {children}
        </AuthProvider>
      </QueryProvider>
    </I18nProvider>
  );
}

// Re-export all providers
export { QueryProvider } from './QueryProvider.js';
export { AuthProvider } from './AuthProvider.js';
export { I18nProvider } from './I18nProvider.js';
