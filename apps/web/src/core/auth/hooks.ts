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
