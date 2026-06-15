import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import type { ReactNode } from 'react';
import { isDev } from '@/lib/utils.js';
import { ApiError } from '@platform/utils';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,         // 30s — queries re-fetch after 30s
      gcTime: 5 * 60_000,        // 5min — cache kept for 5 min
      retry: (failureCount, error) => {
        // Don't retry client errors (4xx) — they won't resolve by retrying
        if (error instanceof ApiError && error.isClientError()) return false;
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

