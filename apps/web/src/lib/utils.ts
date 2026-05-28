// Re-export cn from packages/ui — single source of truth
export { cn } from '@platform/ui';

/**
 * Type-safe feature flag check.
 */
export function isFeatureEnabled(flag: keyof ImportMetaEnv): boolean {
  const value = import.meta.env[flag];
  return value === 'true';
}

/**
 * Get the current app environment.
 */
export function getAppEnv(): 'development' | 'staging' | 'production' {
  return import.meta.env.VITE_APP_ENV ?? 'development';
}

/**
 * Check if we're in development mode.
 */
export const isDev = import.meta.env.DEV;
export const isProd = import.meta.env.PROD;
