/**
 * Frontend production error monitoring (Pilot Readiness Action 8).
 *
 * Single integration point for Sentry — everything else in the app keeps
 * reporting errors through the existing @platform/utils logger; this module
 * only registers the reporter that logger.error() forwards to.
 *
 * Environment-aware by design: never initializes outside a production
 * build, and no-ops entirely without VITE_SENTRY_DSN configured — dev and
 * any environment without a DSN keep the existing console-only behavior
 * unchanged.
 */
import * as Sentry from '@sentry/react';
import { logger, setErrorReporter } from '@platform/utils';
import { getAppEnv, isProd } from '@/lib/utils.js';

let initialized = false;

export function initMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!isProd || !dsn) return;

  Sentry.init({
    dsn,
    environment: getAppEnv(),
    release: import.meta.env.VITE_APP_VERSION,
    // Error monitoring only — performance/session-replay are out of Action 8's scope.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      // Defensive PII scrub — setMonitoringTags() below never sets email,
      // but strip it here too in case a future Sentry API call does.
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
        delete event.user.username;
      }
      return event;
    },
  });

  setErrorReporter((entry) => {
    if (entry.error instanceof Error) {
      Sentry.captureException(entry.error, { extra: { message: entry.message, ...entry.context } });
    } else {
      Sentry.captureMessage(entry.message, { level: 'error', extra: entry.context ?? {} });
    }
  });

  initialized = true;
  logger.info('Monitoring initialized', { environment: getAppEnv() });
}

/**
 * Attaches non-PII operational context (organization/role, never email or
 * name) so errors can be triaged by tenant/role. Called from AuthProvider
 * once a session loads.
 */
export function setMonitoringTags(tags: {
  organizationId: string | null;
  role: string | null;
  isPlatformAdmin: boolean;
  subscriptionTier?: string;
}): void {
  if (!initialized) return;
  Sentry.setTags({
    organization_id: tags.organizationId ?? 'none',
    role: tags.role ?? 'none',
    is_platform_admin: tags.isPlatformAdmin,
    subscription_tier: tags.subscriptionTier ?? 'unknown',
  });
}

export function clearMonitoringTags(): void {
  if (!initialized) return;
  Sentry.setTags({
    organization_id: undefined,
    role: undefined,
    is_platform_admin: undefined,
    subscription_tier: undefined,
  });
}
