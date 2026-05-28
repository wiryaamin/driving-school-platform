import { useSessionStore } from '@core/store/session.store.js';

/**
 * Convenience hook that returns the most commonly needed session fields.
 * For full session store access, import useSessionStore directly.
 */
export function useSession() {
  const { user, profile, organization, isAuthenticated, isLoading } = useSessionStore();
  return { user, profile, organization, isAuthenticated, isLoading };
}
