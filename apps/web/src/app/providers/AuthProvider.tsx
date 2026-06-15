import { useEffect, useRef, type ReactNode } from 'react';
import { supabase } from '@core/api/supabase.js';
import { useSessionStore } from '@core/store/session.store.js';
import { queryClient } from './QueryProvider.js';
import { logger } from '@platform/utils';
import { parseJwtClaims } from '@/lib/auth/jwt.js';
import type { AuthUser, Organization, UserProfile } from '@platform/types';
import type { Session } from '@supabase/supabase-js';

// Retries a Supabase query up to `retries` times on transient errors.
// PGRST116 ("0 rows returned") is a genuine not-found, never retried.
//
// Each individual attempt is capped at 5 s via Promise.race.
// Exponential backoff: 1 s between attempts.
// Worst case with 1 retry: 2 × 5 s + 1 s backoff = ~11 s.
async function fetchWithRetry<T>(
  fn: () => Promise<{ data: T | null; error: { code: string; message: string } | null }>,
  retries = 1,
  attempt = 0,
): Promise<{ data: T | null; error: { code: string; message: string } | null }> {
  const timeoutFallback = new Promise<{ data: null; error: { code: string; message: string } }>(
    resolve => setTimeout(
      () => resolve({ data: null, error: { code: 'FETCH_TIMEOUT', message: 'Request timed out after 10 s' } }),
      10_000,
    ),
  );

  const result = await Promise.race([fn(), timeoutFallback]);

  if (!result.error) return result;
  if (result.error.code === 'PGRST116') return result; // definitive not-found — never retry
  if (retries === 0) return result;

  await new Promise(r => setTimeout(r, Math.min(1_000 * 2 ** attempt, 4_000)));
  return fetchWithRetry(fn, retries - 1, attempt + 1);
}

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

  // Prevents concurrent syncSessionToStore calls from racing.
  // Supabase v2 can fire TOKEN_REFRESHED while SIGNED_IN is still processing,
  // and both getSession() + onAuthStateChange fire on page load — serializing
  // them eliminates the race where one clearSession() follows another setSession().
  const syncInFlight = useRef(false);

  useEffect(() => {
    // Safety net: if INITIAL_SESSION hasn't fired and no sync is in flight,
    // clear loading so the login screen appears rather than an indefinite spinner.
    // We must NOT fire while syncInFlight — SIGNED_IN can arrive before
    // INITIAL_SESSION (Supabase v2 ordering on hosted projects with a stored
    // session), and the in-flight sync has its own 15 s safety net.
    const initTimeout = setTimeout(() => {
      if (useSessionStore.getState().isLoading && !syncInFlight.current) {
        logger.warn('syncSession: auth initialization timeout — clearing loading state');
        clearSession();
      }
    }, 15_000);

    // Single source of truth: onAuthStateChange only — no separate getSession()
    // call. In Supabase JS v2 the listener fires INITIAL_SESSION immediately on
    // registration with the current session (or null), so a separate getSession()
    // is redundant and creates a dual-path race on hosted Supabase.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.debug('Auth state changed', { event });

        // INITIAL_SESSION is the first event fired on listener registration.
        // Clear the safety timeout as soon as auth state is known.
        if (event === 'INITIAL_SESSION') {
          clearTimeout(initTimeout);
        }

        if (event === 'SIGNED_OUT') {
          // Clear the TanStack Query cache to prevent stale data from leaking
          // into the next session (cross-tenant cache contamination).
          queryClient.clear();
          clearSession();
          return;
        }

        // TOKEN_REFRESHED: only update JWT-derived claims; skip profile/org
        // re-fetch to prevent unnecessary network round-trips and object-reference
        // churn that causes every session-subscribed component to re-render.
        if (event === 'TOKEN_REFRESHED') {
          if (!session || syncInFlight.current) return;
          const claims = parseJwtClaims(session.access_token);
          // Degraded or unparseable JWT — keep the existing session unchanged.
          if (!claims || claims.auth_degraded) return;
          const { profile, organization } = useSessionStore.getState();
          // No established session yet (edge case) — INITIAL_SESSION will handle it.
          if (!profile) return;
          setSession({
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
          }, profile, organization);
          return;
        }

        if (
          event === 'INITIAL_SESSION' ||
          event === 'SIGNED_IN'       ||
          event === 'USER_UPDATED'
        ) {
          if (!session) {
            // INITIAL_SESSION with null = no active session → go to login
            clearSession();
            return;
          }

          // Serialize syncs. If a sync is already in flight (e.g. USER_UPDATED
          // fires while SIGNED_IN is processing), skip — the in-flight sync will
          // fully establish the session from its own event.
          if (syncInFlight.current) {
            logger.debug('syncSession: skipping concurrent event', { event });
            return;
          }

          syncInFlight.current = true;
          try {
            await syncSessionToStore(session);
          } finally {
            syncInFlight.current = false;
          }
        }
      },
    );

    return () => {
      clearTimeout(initTimeout);
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function syncSessionToStore(
    session: Session,
    { _retried = false }: { _retried?: boolean } = {},
  ): Promise<void> {
    // Only show the loading screen when there is no established session yet.
    // Supabase fires SIGNED_IN on every tab-focus via visibilitychange — if the
    // user is already authenticated we re-sync silently to avoid a full-screen
    // spinner flash on every tab switch.
    const showLoading = !useSessionStore.getState().isAuthenticated;

    const syncTimeout = setTimeout(() => {
      if (useSessionStore.getState().isLoading) {
        logger.warn('syncSession: fetch timed out — clearing loading state');
        clearSession();
      }
    }, 15_000);

    try {
      if (showLoading) setLoading(true);

      // ── Parse JWT custom claims ──────────────────────────────────────────────
      // Claims (organization_id, permissions, role, …) are at the top level of
      // the access token JWT — set there by the auth-hook Edge Function.
      const claims = parseJwtClaims(session.access_token);

      if (!claims) {
        logger.warn('syncSession: failed to parse JWT claims', { userId: session.user.id });
        if (showLoading) clearSession();
        return;
      }

      if (claims.auth_degraded) {
        // Auth hook cold-started and returned degraded claims (no org/permissions).
        // Attempt one token refresh before giving up — the hook is likely warm now.
        if (!_retried) {
          logger.warn('syncSession: auth_degraded — attempting one refresh', {
            userId: session.user.id,
          });
          try {
            const { data: refreshResult } = await supabase.auth.refreshSession();
            if (refreshResult.session) {
              const freshClaims = parseJwtClaims(refreshResult.session.access_token);
              if (freshClaims && !freshClaims.auth_degraded) {
                await syncSessionToStore(refreshResult.session, { _retried: true });
                return;
              }
            }
          } catch {
            // fall through
          }
        }
        // If the user is already authenticated, keep the existing session rather
        // than clearing — a degraded background re-sync must never log the user out.
        if (showLoading) {
          logger.warn('syncSession: auth_degraded — clearing session', { userId: session.user.id });
          clearSession();
        } else {
          logger.warn('syncSession: auth_degraded — keeping existing session', { userId: session.user.id });
        }
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

      // ── Fetch profile + organization in parallel ───────────────────────────
      // Both use claims already decoded above. Platform admins have no org so
      // the org promise resolves immediately — parallel only applies to the
      // common case (regular users with an organization_id in their JWT).
      const [profileResult, orgResult] = await Promise.all([
        fetchWithRetry(() =>
          supabase.from('profiles').select('*').eq('id', session.user.id).single()
        ),
        claims.organization_id
          ? fetchWithRetry(() =>
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              supabase.from('organizations').select('*').eq('id', claims.organization_id!).single()
            )
          : Promise.resolve({ data: null as null, error: null as null }),
      ]);

      const { data: profile, error: profileError } = profileResult;
      const { data: orgData,  error: orgError }    = orgResult;

      if (profileError) {
        logger.warn('syncSession: profile not found', {
          userId: session.user.id,
          error:  profileError.message,
        });
        if (showLoading) clearSession();
        return;
      }

      // ── Resolve organization (platform admins have none) ───────────────────
      let organization: Organization | null = null;

      if (claims.organization_id) {
        if (orgError) {
          logger.warn('syncSession: organization not found', {
            userId:         session.user.id,
            organizationId: claims.organization_id,
            error:          orgError.message,
          });
          if (showLoading) clearSession();
          return;
        }
        organization = orgData as Organization;
      } else if (!claims.is_platform_admin) {
        logger.warn('syncSession: user has no organization and is not a platform admin', {
          userId: session.user.id,
        });
        if (showLoading) clearSession();
        return;
      }

      setSession(authUser, profile as UserProfile, organization);
    } catch (err) {
      logger.error('syncSession: unexpected error', { error: err });
      if (showLoading) clearSession();
    } finally {
      clearTimeout(syncTimeout);
    }
  }

  return <>{children}</>;
}
