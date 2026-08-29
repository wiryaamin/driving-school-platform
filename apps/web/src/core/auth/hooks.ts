import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@core/api/supabase.js';
import { useSessionStore } from '@core/store/session.store.js';
import { logger } from '@platform/utils';
import { parseJwtClaims } from '@/lib/auth/jwt.js';
import type { SignInCredentials, SignInResult } from '@platform/types';

/**
 * Core authentication hook.
 * Provides sign-in, sign-out, and session state.
 */
export function useAuth() {
  const navigate = useNavigate();
  const { user, organization, isAuthenticated, isLoading, clearSession } = useSessionStore();

  const signIn = useCallback(async (credentials: SignInCredentials): Promise<SignInResult> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (error) {
        logger.warn('Sign-in failed', { code: error.code });
        // Best effort, non-blocking — a failure to record this must never
        // affect the error already being returned to the user (ADR-007).
        void supabase.functions.invoke('identity-events/login-failed', {
          body: { email: credentials.email },
        }).catch(() => {});
        return {
          success: false,
          error: error.code === 'invalid_credentials'
            ? 'Felaktig e-postadress eller lösenord.'
            : 'Inloggningen misslyckades. Försök igen.',
        };
      }

      // An account with valid credentials but no organization membership and
      // no platform-admin flag has nowhere to land — AuthProvider's own
      // session sync would silently clearSession() the moment it observes
      // this (see syncSession's "user has no organization and is not a
      // platform admin" branch), bouncing the user back to /auth/login with
      // no explanation at all. Catching it here, synchronously, right after
      // sign-in, means the user actually sees why instead of experiencing an
      // unexplained "login doesn't work."
      const claims = data.session ? parseJwtClaims(data.session.access_token) : null;
      if (claims && !claims.organization_id && !claims.is_platform_admin) {
        await supabase.auth.signOut();
        clearSession();
        return {
          success: false,
          error: 'Ditt konto är inte kopplat till någon organisation. Kontakta support för hjälp.',
        };
      }

      return { success: true };
    } catch (err) {
      logger.error('Sign-in unexpected error', err);
      return { success: false, error: 'Något gick fel. Kontakta support.' };
    }
  }, [clearSession]);

  const signOut = useCallback(async (): Promise<void> => {
    // Must be recorded before signOut() clears the session — identity_security_events
    // RLS requires a valid caller JWT, and this call authenticates as the user
    // themselves (ADR-007). Best effort: a failure here must never block sign-out.
    try {
      await supabase.functions.invoke('identity-events/logout', {});
    } catch {
      // non-fatal
    }
    try {
      await supabase.auth.signOut();
    } finally {
      clearSession();
      navigate('/auth/login', { replace: true });
    }
  }, [clearSession, navigate]);

  return {
    user,
    organization,
    isAuthenticated,
    isLoading,
    signIn,
    signOut,
  };
}
