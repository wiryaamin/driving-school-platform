import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import type { ReactNode } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { isDev } from '@/lib/utils.js';
import { ApiError } from '@platform/utils';

/**
 * True for any 4xx (client) error — regardless of whether it surfaced as this
 * app's own ApiError or as a raw FunctionsHttpError from supabase.functions.invoke()
 * (the latter never becomes an ApiError; its status lives on error.context, the
 * unread Response object — see apps/web/src/modules/platform/lib/provisioningSchema.ts's
 * extractFunctionErrorMessage() for the same read pattern used when parsing the body
 * instead of just the status).
 *
 * 401 is deliberately excluded: unlike 403/404/etc., a 401 here reflects a
 * momentarily stale access token (e.g. after the tab was backgrounded past
 * expiry), not a genuinely invalid credential — supabase.functions.invoke()
 * re-resolves the current session on every call, so a retry made moments
 * later succeeds once the client's own session state has caught up. Confirmed
 * via runtime investigation of the Notifications 401 reports: a rejected
 * request leaves the stored session untouched, and an immediate retry with a
 * valid token succeeds cleanly. Excluding 401 here routes it through the
 * existing `retry: failureCount < 1` fallback below — exactly one retry.
 */
function isPermanentClientError(error: unknown): boolean {
  if (error instanceof ApiError) return error.isClientError() && !error.isUnauthorized();
  if (error instanceof FunctionsHttpError) {
    const status = error.context?.status;
    return typeof status === 'number' && status >= 400 && status < 500 && status !== 401;
  }
  return false;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,         // 30s — queries re-fetch after 30s
      gcTime: 5 * 60_000,        // 5min — cache kept for 5 min
      retry: (failureCount, error) => {
        // Don't retry permanent client errors (4xx) — they won't resolve by retrying
        if (isPermanentClientError(error)) return false;
        return failureCount < 1;
      },
      retryDelay: 1_000,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
    },
    mutations: {
      retry: false,
    },
  },
});

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {isDev && (
        <ReactQueryDevtools
          initialIsOpen={false}
          buttonPosition="bottom-right"
        />
      )}
    </QueryClientProvider>
  );
}

