import { useState, useCallback } from 'react';
import { supabase } from '@core/api/supabase.js';
import { parseJwtClaims } from '@/lib/auth/jwt.js';
import { logger } from '@platform/utils';

interface SwitchTenantResult {
  success: boolean;
  error?: string;
}

/**
 * useSwitchTenant — lets a multi-org user switch their active tenant context.
 *
 * Flow:
 *   1. Calls the /switch-tenant Edge Function with target_org_id
 *   2. The function validates membership and writes preferred_org_id to app_metadata
 *   3. The client refreshes the session — the auth hook re-runs and embeds the new org
 *   4. AuthProvider detects TOKEN_REFRESHED and syncs the Zustand store
 *
 * Usage:
 *   const { switchTenant, isPending } = useSwitchTenant();
 *   await switchTenant(organizationId);
 */
export function useSwitchTenant() {
  const [isPending, setIsPending] = useState(false);

  const switchTenant = useCallback(async (targetOrgId: string): Promise<SwitchTenantResult> => {
    if (!targetOrgId) {
      return { success: false, error: 'No target organization provided' };
    }

    setIsPending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return { success: false, error: 'No active session' };
      }

      // ── Call /switch-tenant Edge Function ──────────────────────────────────
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const response = await fetch(`${supabaseUrl}/functions/v1/switch-tenant`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ target_org_id: targetOrgId }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        const errorMessage = body.error ?? `Tenant switch failed (${response.status})`;
        logger.warn('useSwitchTenant: function returned error', {
          status:        response.status,
          error:         errorMessage,
          targetOrgId,
        });
        return { success: false, error: errorMessage };
      }

      // ── Refresh session to get new JWT with updated org claims ─────────────
      // The auth hook fires on token refresh and embeds preferred_org_id
      // (just set by /switch-tenant) into the new JWT.
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

      if (refreshError || !refreshData.session) {
        logger.warn('useSwitchTenant: session refresh failed', {
          error: refreshError?.message ?? 'no session returned',
        });
        return { success: false, error: 'Session refresh failed after tenant switch' };
      }

      // ── Verify the new JWT actually contains the expected org ──────────────
      // Guards against race conditions or auth hook degraded-fallback scenarios.
      const newClaims = parseJwtClaims(refreshData.session.access_token);
      if (!newClaims || newClaims.organization_id !== targetOrgId) {
        logger.warn('useSwitchTenant: JWT org mismatch after refresh', {
          expected:  targetOrgId,
          actual:    newClaims?.organization_id ?? null,
          degraded:  newClaims?.auth_degraded ?? false,
        });
        return { success: false, error: 'Tenant switch did not take effect — please try again' };
      }

      // AuthProvider's onAuthStateChange handler picks up TOKEN_REFRESHED
      // and syncs the new org context to the Zustand store automatically.
      logger.info('useSwitchTenant: success', { targetOrgId });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useSwitchTenant: unexpected error', { error: message });
      return { success: false, error: message };
    } finally {
      setIsPending(false);
    }
  }, []);

  return { switchTenant, isPending };
}
