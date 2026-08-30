import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from './useSession.js';

// ─── Sandbox/pilot payment credential status ───────────────────────────────
//
// Every trial (and every org created via Platform Admin's business setup)
// launches on Trafikcloud's own shared sandbox Nets/Stripe credentials —
// real, working, but not the school's own account (Starta provperiod
// workflow redesign, 2026-08-30, "shared sandbox credentials"). Reuses the
// exact stripe-credentials/nets-credentials status endpoints
// CompanySettingsPage.tsx already calls — same 'pilot' state, just surfaced
// as a dashboard-level nudge instead of only inside Settings.

type PaymentProviderState = 'not_connected' | 'pilot' | 'tenant_owned';

export function usePaymentPilotStatus() {
  const { organization } = useSession();
  const orgId = organization?.id;

  return useQuery({
    queryKey: ['payment-pilot-status', orgId],
    queryFn: async () => {
      const [stripeResult, netsResult] = await Promise.all([
        supabase.functions.invoke<{ data: { stripe_state: PaymentProviderState } }>('stripe-credentials', { method: 'GET' }),
        supabase.functions.invoke<{ data: { nets_state: PaymentProviderState } }>('nets-credentials', { method: 'GET' }),
      ]);
      const stripeState = stripeResult.error ? null : stripeResult.data?.data.stripe_state ?? null;
      const netsState = netsResult.error ? null : netsResult.data?.data.nets_state ?? null;
      return { isPilot: stripeState === 'pilot' || netsState === 'pilot' };
    },
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });
}
