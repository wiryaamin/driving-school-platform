import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@core/api/supabase.js';
import { useSessionStore } from '@core/store/session.store.js';
import { logger } from '@platform/utils';
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
      const { error } = await supabase.auth.signInWithPassword({
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

      return { success: true };
    } catch (err) {
      logger.error('Sign-in unexpected error', err);
      return { success: false, error: 'Något gick fel. Kontakta support.' };
    }
  }, []);

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
