import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Fortnox connection status — shared between FortnoxPage and the
// External Services settings hub. Extracted so both can query the same
// lightweight status endpoint without duplicating the query definition.

export const fortnoxKeys = {
  all:    () => ['fortnox'] as const,
  status: (orgId: string) => ['fortnox', 'status', orgId] as const,
};

export type FortnoxOAuthStatus = {
  configured:    boolean;
  connected:     boolean;
  method?:       'oauth' | 'api_token';
  scope?:        string | null;
  connected_at?: string | null;
  token_expiry?: string | null;
  needs_refresh?: boolean;
};

async function fetchFortnoxStatus(): Promise<FortnoxOAuthStatus> {
  const { data, error } = await supabase.functions.invoke<FortnoxOAuthStatus>(
    'fortnox/oauth/status',
    { method: 'GET' },
  );
  if (error) throw error;
  if (!data) throw new Error('Tom respons från server');
  return data;
}

export function useFortnoxStatus(orgId: string | undefined) {
  return useQuery({
    queryKey: fortnoxKeys.status(orgId ?? ''),
    queryFn:  fetchFortnoxStatus,
    enabled:  !!orgId,
    staleTime: 60_000,
  });
}
