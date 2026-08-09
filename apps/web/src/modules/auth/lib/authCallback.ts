import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '@core/api/supabase.js';
import { logger } from '@platform/utils';

/**
 * Consumes a Supabase Auth email link (password recovery or invitation) and
 * establishes a session from it.
 *
 * Supports both link formats Supabase Auth can produce, since which one
 * actually arrives depends on the Dashboard's email template configuration
 * (Dashboard-only, unverifiable from this codebase):
 *
 *   1. `?token_hash=...&type=...` — the modern, recommended format. Consumed
 *      via verifyOtp(), the same mechanism already established for BankID
 *      magic-link login (useBankidLogin.ts) — kept consistent with that
 *      precedent rather than inventing a second pattern.
 *   2. `#access_token=...&refresh_token=...&type=...` — Supabase Auth's
 *      *default*, unmodified email template redirects here (GoTrue's own
 *      hosted /verify endpoint does the token exchange server-side, then
 *      302s back with the session in the URL fragment). Consumed via
 *      setSession(). Supported as a fallback so this page works out of the
 *      box even before anyone customizes the Dashboard's email templates.
 *
 * Either format may instead carry `error`/`error_code`/`error_description`
 * (GoTrue's own way of reporting an expired or already-used link) — surfaced
 * as a typed 'expired' | 'invalid' result rather than a generic failure, so
 * the UI can show the right recovery action.
 */

export type AuthCallbackParams = {
  tokenHash?: string | undefined;
  type?: string | undefined;
  accessToken?: string | undefined;
  refreshToken?: string | undefined;
  error?: string | undefined;
  errorCode?: string | undefined;
  errorDescription?: string | undefined;
};

export type AuthCallbackOutcome =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'invalid' };

/** Reads token/error params from both the query string and the hash fragment. */
export function parseAuthCallbackParams(): AuthCallbackParams {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  const get = (key: string): string | undefined => hash.get(key) ?? search.get(key) ?? undefined;

  return {
    tokenHash:        get('token_hash'),
    type:              get('type'),
    accessToken:       get('access_token'),
    refreshToken:      get('refresh_token'),
    error:             get('error'),
    errorCode:         get('error_code'),
    errorDescription:  get('error_description'),
  };
}

/**
 * Strips every auth token/error param from the visible URL (query + hash)
 * without a navigation, so a recovery/invite token never lingers in browser
 * history, the address bar, or anything that might screenshot/share it.
 * Safe to call even when there was nothing to strip.
 */
export function clearAuthCallbackParamsFromUrl(): void {
  window.history.replaceState(null, '', window.location.pathname);
}

/**
 * Exchanges the parsed params for a real Supabase session. Does not
 * validate `type` against an expected value — callers that care which
 * link kind this is (recovery vs invite) should check `params.type`
 * themselves before or after calling this.
 */
export async function establishCallbackSession(params: AuthCallbackParams): Promise<AuthCallbackOutcome> {
  if (params.error) {
    logger.warn('authCallback: link error', { error: params.error, error_code: params.errorCode });
    return { ok: false, reason: params.errorCode === 'otp_expired' ? 'expired' : 'invalid' };
  }

  if (params.tokenHash && params.type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: params.tokenHash,
      type: params.type as EmailOtpType,
    });
    if (error) {
      logger.warn('authCallback: verifyOtp failed', { error: error.message });
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true };
  }

  if (params.accessToken && params.refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
    });
    if (error) {
      logger.warn('authCallback: setSession failed', { error: error.message });
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true };
  }

  return { ok: false, reason: 'invalid' };
}
