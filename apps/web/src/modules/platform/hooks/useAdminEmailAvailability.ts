import { useEffect, useState } from 'react';
import { supabase } from '@core/api/supabase.js';
import { useSessionStore } from '@core/store/session.store.js';

// Reads the same `profiles` table (RLS already lets a platform admin read
// any profile — profiles_select_own_org's `OR is_platform_admin()` clause)
// that Supabase Auth itself would reject the invite against — this is not a
// new validation rule, only an earlier read of the same fact, so the
// Platform Administrator finds out about a duplicate admin email before
// committing to the multi-step create-then-rollback provisioning round trip
// instead of after it. Shared by CreateOrgDialog and DemoRequestDetailSheet's
// Convert to Customer form — both create a tenant admin the same way.

export type AdminEmailAvailability = 'idle' | 'checking' | 'clear' | 'self' | 'taken';

export function useAdminEmailAvailability(email: string, enabled: boolean): AdminEmailAvailability {
  const currentUserId = useSessionStore(s => s.user?.id ?? null);
  const [status, setStatus] = useState<AdminEmailAvailability>('idle');

  useEffect(() => {
    const trimmed = email.trim().toLowerCase();
    if (!enabled || !trimmed || !trimmed.includes('@')) {
      setStatus('idle');
      return;
    }
    setStatus('checking');
    const timer = setTimeout(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from('profiles').select('id').eq('email', trimmed).maybeSingle();
      if (!data) { setStatus('clear'); return; }
      setStatus(data.id === currentUserId ? 'self' : 'taken');
    }, 400);
    return () => clearTimeout(timer);
  }, [email, enabled, currentUserId]);

  return status;
}

// Same reasoning, applied to org_number — organizations_select_own's
// `OR is_platform_admin()` clause already lets a platform admin read any
// organization, which is the same fact handleProvision's own "already in
// use by another organization" check relies on. org_number is optional, so
// an empty value is never checked.

export type OrgNumberAvailability = 'idle' | 'checking' | 'clear' | 'taken';

export function useOrgNumberAvailability(orgNumber: string, enabled: boolean): OrgNumberAvailability {
  const [status, setStatus] = useState<OrgNumberAvailability>('idle');

  useEffect(() => {
    const trimmed = orgNumber.trim();
    if (!enabled || !trimmed) {
      setStatus('idle');
      return;
    }
    setStatus('checking');
    const timer = setTimeout(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from('organizations').select('id').eq('org_number', trimmed).is('deleted_at', null).maybeSingle();
      setStatus(data ? 'taken' : 'clear');
    }, 400);
    return () => clearTimeout(timer);
  }, [orgNumber, enabled]);

  return status;
}
