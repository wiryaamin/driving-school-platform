import { useEffect, type ReactNode } from 'react';
import { supabase } from '@core/api/supabase.js';
import { useSessionStore } from '@core/store/session.store.js';
import { logger } from '@platform/utils';
import { parseJwtClaims } from '@/lib/auth/jwt.js';
import type { AuthUser, Organization, UserProfile } from '@platform/types';
import type { Session } from '@supabase/supabase-js';

/**
 * AuthProvider — subscribes to Supabase auth state changes and syncs to Zustand.
 *
 * On every auth event (sign-in, token refresh, sign-out) this provider:
 *   1. Decodes the JWT access token to extract custom claims set by the auth hook
 *   2. Fetches the user profile and (if applicable) organization from the database
 *   3. Updates the Zustand session store so all children see a consistent session
 *
 * Platform admins have organization_id = null in their JWT and are handled
 * as a first-class case — they get a valid session without an organization.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { setSession, clearSession, setLoading } = useSessionStore();

  useEffect(() => {
    // Hydrate session on mount (handles page refresh with persisted auth)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        void syncSessionToStore(session);
      } else {
        clearSession();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.debug('Auth state changed', { event });

        if (event === 'SIGNED_OUT' || !session) {
          clearSession();
          return;
        }

        if (
          event === 'SIGNED_IN'      ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED'
        ) {
          await syncSessionToStore(session);
        }
      },
    );

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function syncSessionToStore(session: Session): Promise<void> {
    try {
      setLoading(true);

      // ── Parse JWT custom claims ──────────────────────────────────────────────
      // Claims (organization_id, permissions, role, …) are at the top level of
      // the access token JWT — set there by the auth-hook Edge Function.
      const claims = parseJwtClaims(session.access_token);

      if (!claims) {
        logger.warn('syncSession: failed to parse JWT claims', { userId: session.user.id });
        clearSession();
        return;
      }

      if (claims.auth_degraded) {
        // Auth hook fell back to unmodified claims due to a DB error.
        // Custom claims (org, permissions) are absent — treat as unauthenticated
        // so the user returns to the login screen rather than seeing a broken state.
        logger.warn('syncSession: auth_degraded session detected — clearing', {
          userId: session.user.id,
        });
        clearSession();
        return;
      }

      // ── Build AuthUser from claims ─────────────────────────────────────────
      const authUser: AuthUser = {
        id:                   session.user.id,
        email:                session.user.email ?? '',
        organization_id:      claims.organization_id,
        active_membership_id: claims.active_membership_id,
        location_ids:         claims.location_ids,
        role:                 claims.role,
        permissions:          claims.permissions,
        subscription_tier:    claims.subscription_tier,
        is_platform_admin:    claims.is_platform_admin,
        ...(claims.impersonator_id ? { impersonator_id: claims.impersonator_id } : {}),
      };

      // ── Fetch profile ──────────────────────────────────────────────────────
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (profileError) {
        // Profile missing = user not fully onboarded (e.g. invite accepted but
        // profile not yet created). Clear session so routing redirects them.
        logger.warn('syncSession: profile not found', {
          userId: session.user.id,
          error:  profileError.message,
        });
        clearSession();
        return;
      }

      // ── Fetch organization (platform admins have none) ─────────────────────
      let organization: Organization | null = null;

      if (claims.organization_id) {
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', claims.organization_id)
          .single();

        if (orgError) {
          logger.warn('syncSession: organization not found', {
            userId:         session.user.id,
            organizationId: claims.organization_id,
            error:          orgError.message,
          });
          clearSession();
          return;
        }

        organization = org as Organization;
      } else if (!claims.is_platform_admin) {
        // Regular user with no org and no platform admin flag → incomplete setup
        logger.warn('syncSession: user has no organization and is not a platform admin', {
          userId: session.user.id,
        });
        clearSession();
        return;
      }

      setSession(authUser, profile as UserProfile, organization);
    } catch (err) {
      logger.error('syncSession: unexpected error', { error: err });
      clearSession();
    }
  }

  return <>{children}</>;
}
