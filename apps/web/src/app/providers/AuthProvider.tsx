import { useEffect, useRef, type ReactNode } from 'react';
import { supabase } from '@core/api/supabase.js';
import { useSessionStore } from '@core/store/session.store.js';
import { queryClient } from './QueryProvider.js';
import { logger } from '@platform/utils';
import { setMonitoringTags, clearMonitoringTags } from '@core/monitoring/index.js';
import { parseJwtClaims } from '@/lib/auth/jwt.js';
import type { AuthUser, JwtClaims, Organization, UserProfile } from '@platform/types';
import type { Session } from '@supabase/supabase-js';

// Retries a Supabase query up to `retries` times on transient errors.
// PGRST116 ("0 rows returned") is a genuine not-found, never retried.
async function fetchWithRetry<T>(
  fn: () => PromiseLike<{ data: T | null; error: { code: string; message: string } | null }>,
  retries = 2,
  attempt = 0,
): Promise<{ data: T | null; error: { code: string; message: string } | null }> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutFallback = new Promise<{ data: null; error: { code: string; message: string } }>(
    resolve => {
      timeoutHandle = setTimeout(
        () => resolve({ data: null, error: { code: 'FETCH_TIMEOUT', message: 'Request timed out after 8 s' } }),
        8_000,
      );
    },
  );

  const result = await Promise.race([fn(), timeoutFallback]);
  clearTimeout(timeoutHandle); // always clear to prevent timer leak when fn() wins the race

  if (!result.error) return result;
  if (result.error.code === 'PGRST116') return result;
  if (retries === 0) return result;

  await new Promise(r => setTimeout(r, Math.min(1_000 * 2 ** attempt, 4_000)));
  return fetchWithRetry(fn, retries - 1, attempt + 1);
}

/**
 * AuthProvider — subscribes to Supabase auth state changes and syncs to Zustand.
 *
 * Auth is established immediately from JWT claims (fast, no DB needed).
 * Profile + org are fetched in the background and merged into the session once
 * available. This means a cold-start database never blocks the user from logging in.
 *
 * Session is only cleared on genuine auth failure:
 *   - Invalid/unparseable JWT
 *   - auth_degraded claims that survive a refresh attempt
 *   - PGRST116: no profile row (bootstrap not run)
 *   - INITIAL_SESSION with null (no stored session)
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { setSession, clearSession, setLoading } = useSessionStore();
  const monitoringUser = useSessionStore(state => state.user);

  // Reacts to every setSession/clearSession call site via the store itself
  // (not instrumented per-call-site) — attaches non-PII org/role context to
  // error reports, never email or name.
  useEffect(() => {
    if (monitoringUser) {
      setMonitoringTags({
        organizationId: monitoringUser.organization_id,
        role: monitoringUser.role,
        isPlatformAdmin: monitoringUser.is_platform_admin,
        subscriptionTier: monitoringUser.subscription_tier,
      });
    } else {
      clearMonitoringTags();
    }
  }, [monitoringUser]);

  // Serializes the JWT-decode → setSession path so concurrent auth events
  // (e.g. SIGNED_IN + USER_UPDATED) don't race on initial session setup.
  const syncInFlight  = useRef(false);
  // If an auth event arrives while a sync is running, we store the latest
  // session here and re-run after the current sync completes, rather than
  // silently dropping it (which would miss permission changes from USER_UPDATED).
  const pendingSession = useRef<Session | null>(null);

  useEffect(() => {
    // Fallback: if auth hasn't initialized within 15 s and nothing is in flight,
    // clear loading so the login screen appears. With the non-blocking profile
    // approach, setSession fires as soon as the JWT is decoded (~0 s), so this
    // timeout only fires when the GoTrue client itself fails to initialize.
    const initTimeout = setTimeout(() => {
      if (useSessionStore.getState().isLoading && !syncInFlight.current) {
        logger.warn('syncSession: auth initialization timeout — clearing loading state');
        clearSession();
      }
    }, 15_000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.debug('Auth state changed', { event });

        if (event === 'INITIAL_SESSION') {
          clearTimeout(initTimeout);
        }

        if (event === 'SIGNED_OUT') {
          queryClient.clear();
          clearSession();
          return;
        }

        // TOKEN_REFRESHED: update JWT-derived claims only.
        // Profile stays as-is — re-fetching it on every token refresh is wasteful
        // and causes every session-subscribed component to re-render.
        if (event === 'TOKEN_REFRESHED') {
          if (!session || syncInFlight.current) return;
          const claims = parseJwtClaims(session.access_token);
          if (!claims || claims.auth_degraded) return;
          const state = useSessionStore.getState();
          // No established session yet — INITIAL_SESSION or SIGNED_IN will handle it.
          if (!state.user) return;
          // Keeping state.organization unconditionally used to leave a stale,
          // truthy org object in the store after an account went from active
          // to org-less mid-session (disabled, offboarded, ...) — every other
          // field here is freshly re-derived from claims, but this one
          // wasn't, so anything reading `organization` directly (rather than
          // the always-fresh user.organization_id) kept seeing the old
          // organization. Null it out the moment claims say there isn't one
          // anymore; still reused as-is when an org genuinely is present,
          // since display fields (name, subscription tier) don't need a
          // full re-fetch on every refresh. Found via a real account stuck
          // in exactly this state during live testing, 2026-08-30.
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
          }, state.profile, claims.organization_id ? state.organization : null);
          return;
        }

        if (
          event === 'INITIAL_SESSION'   ||
          event === 'SIGNED_IN'         ||
          event === 'USER_UPDATED'      ||
          // Fired specifically (instead of SIGNED_IN) by verifyOtp({type:'recovery'})
          // — the token_hash path ResetPasswordPage uses. Without this, a
          // recovery session would be tracked in the Zustand store only when
          // the *other* supported link format (setSession() via hash-fragment
          // tokens, which always fires SIGNED_IN) happens to be the one in use —
          // an inconsistency across two paths of the same logical flow, not a
          // difference that should exist. Safe to treat identically to SIGNED_IN:
          // AuthLayout's route exemption (not the event type) is what keeps the
          // user on the password-set form instead of being redirected away.
          event === 'PASSWORD_RECOVERY'
        ) {
          if (!session) {
            clearSession();
            return;
          }

          if (syncInFlight.current) {
            // Queue the latest session so it runs after the current sync finishes.
            // Dropping it would silently miss permission updates from USER_UPDATED.
            pendingSession.current = session;
            return;
          }

          syncInFlight.current = true;
          try {
            await syncSessionToStore(session);
            // Drain one pending event if one arrived while we were syncing.
            if (pendingSession.current) {
              const next = pendingSession.current;
              pendingSession.current = null;
              await syncSessionToStore(next);
            }
          } finally {
            syncInFlight.current = false;
            pendingSession.current = null;
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
    const showLoading = !useSessionStore.getState().isAuthenticated;
    if (showLoading) setLoading(true);

    // ── 1. Parse JWT claims — the only blocking step ───────────────────────
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
        logger.warn('syncSession: auth_degraded — attempting one refresh', { userId: session.user.id });
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
      if (showLoading) {
        logger.warn('syncSession: auth_degraded — clearing session', { userId: session.user.id });
        clearSession();
      } else {
        logger.warn('syncSession: auth_degraded — keeping existing session', { userId: session.user.id });
      }
      return;
    }

    // ── 2. Build AuthUser and establish session immediately ────────────────
    // The JWT already contains all authorization data (org_id, role, permissions).
    // We don't block on the profile DB fetch — users can use the app while profile
    // loads in the background. This makes cold-start database latency invisible.
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

    // Reuse cached profile/org for the same user (e.g. tab focus re-sync).
    // For a new user (fresh login), profile starts as null until the background
    // fetch completes — components render skeleton state during this window.
    const state = useSessionStore.getState();
    const isSameUser = state.user?.id === session.user.id;
    setSession(authUser, isSameUser ? state.profile : null, isSameUser ? state.organization : null);

    // ── 3. Load profile + org in background — non-blocking ────────────────
    void loadProfileBackground(session.user.id, authUser, claims);
  }

  async function loadProfileBackground(
    userId: string,
    authUser: AuthUser,
    claims: JwtClaims,
  ): Promise<void> {
    const [profileResult, orgResult] = await Promise.all([
      fetchWithRetry(() =>
        supabase.from('profiles').select('*').eq('id', userId).single()
      ),
      claims.organization_id
        ? fetchWithRetry(() =>
            supabase.from('organizations').select('*').eq('id', claims.organization_id!).single()
          )
        : Promise.resolve({ data: null as null, error: null as null }),
    ]);

    const { data: profile, error: profileError } = profileResult;

    if (profileError) {
      if (profileError.code === 'PGRST116') {
        // No profile row — the bootstrap SQL hasn't been run. This is a genuine
        // setup error: the user can't use the app without a profile row.
        logger.warn('syncSession: no profile row for user — run bootstrap SQL', { userId });
        clearSession();
      } else {
        // Transient failure (timeout, network). The user is already authenticated
        // via JWT — don't lock them out. The profile will retry on next page load
        // or token refresh.
        logger.warn('syncSession: profile fetch failed (user remains authenticated)', {
          userId,
          code:  profileError.code,
          error: profileError.message,
        });
      }
      return;
    }

    // Guard: if the user signed out or switched while the fetch was in flight, discard.
    const currentUserId = useSessionStore.getState().user?.id;
    if (currentUserId !== userId) return;

    let organization: Organization | null = null;
    if (claims.organization_id) {
      const { data: orgData, error: orgError } = orgResult;
      if (orgError) {
        logger.warn('syncSession: organization fetch failed', {
          userId,
          organizationId: claims.organization_id,
          error:          orgError.message,
        });
        // Don't clear session — org display data is cosmetic, permissions are in JWT.
        return;
      }
      organization = orgData as unknown as Organization;
    } else if (!claims.is_platform_admin) {
      logger.warn('syncSession: user has no organization and is not a platform admin', { userId });
      clearSession();
      return;
    }

    setSession(authUser, profile as unknown as UserProfile, organization);
  }

  return <>{children}</>;
}
