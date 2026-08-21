import { useCallback, useEffect, useState } from 'react';
import {
  requestPushToken, isPushConfigured, getNotificationPermission, unsubscribeCurrentDevice,
} from '@core/push/index.js';

export type PushSubscriptionStatus =
  | 'not_configured' | 'unsupported' | 'default' | 'denied' | 'granted' | 'registering' | 'error';

export interface UsePushSubscriptionOptions {
  /** Isolates the "last registered token" localStorage key per portal — a browser could be logged into more than one portal. */
  storageNamespace: string;
  register: (input: { token: string; previousToken?: string }) => Promise<{ id: string } | unknown>;
  /**
   * Final Gap Analysis P2-4 — revokes the device token row server-side
   * (DELETE /push/register). Optional: a caller that doesn't pass this keeps
   * the previous subscribe-only behavior exactly as before (e.g. Guardian
   * Portal, out of this scope), and unsubscribe() below is simply not
   * offered by that portal's UI.
   */
  unregister?: (tokenId: string) => Promise<unknown>;
}

const STORAGE_PREFIX = 'push_device_token:';
const ID_STORAGE_PREFIX = 'push_device_token_id:';

// Module-scoped (not component-scoped) so it survives React StrictMode's
// deliberate mount→unmount→remount double-invocation in dev, and any other
// re-render that re-runs the mount effect below. Without this, concurrent
// subscribe() calls each independently unsubscribe/resubscribe the
// browser's raw PushManager subscription (see core/push's requestPushToken),
// racing each other into several different tokens that all look "active" in
// the database even though the browser can only hold one live subscription
// at a time — a real defect found during commissioning (multiple
// simultaneous registrations from a single page load).
const inFlightByNamespace = new Map<string, Promise<void>>();

/**
 * Browser-side FCM device registration lifecycle, shared by the Student,
 * Guardian, and Instructor portal settings pages. Each portal supplies its
 * own `register` call (its own portalFetch('/push/register', ...)) — this
 * hook owns the browser mechanics (permission, getToken, previous-token
 * tracking for refresh) that are identical across all three.
 */
export function usePushSubscription({ storageNamespace, register, unregister }: UsePushSubscriptionOptions) {
  const storageKey   = `${STORAGE_PREFIX}${storageNamespace}`;
  const idStorageKey = `${ID_STORAGE_PREFIX}${storageNamespace}`;

  const [status, setStatus] = useState<PushSubscriptionStatus>(() => {
    if (!isPushConfigured()) return 'not_configured';
    const perm = getNotificationPermission();
    return perm === 'unsupported' ? 'unsupported' : perm;
  });
  const [error, setError] = useState<string | null>(null);

  const subscribe = useCallback(async () => {
    const existing = inFlightByNamespace.get(storageKey);
    if (existing) return existing;

    const run = (async () => {
      setStatus('registering');
      setError(null);

      const result = await requestPushToken();
      if (!result.ok) {
        setStatus(
          result.reason === 'permission_denied' ? 'denied' :
          result.reason === 'unsupported'       ? 'unsupported' :
          result.reason === 'not_configured'    ? 'not_configured' : 'error',
        );
        if (result.reason === 'error') setError(result.error ?? 'Ett okänt fel uppstod');
        return;
      }

      let previousToken: string | null = null;
      try { previousToken = localStorage.getItem(storageKey); } catch { /* ignore */ }

      try {
        const regResult = await register(previousToken ? { token: result.token, previousToken } : { token: result.token });
        try { localStorage.setItem(storageKey, result.token); } catch { /* ignore */ }
        if (regResult && typeof regResult === 'object' && 'id' in regResult && typeof (regResult as { id: unknown }).id === 'string') {
          try { localStorage.setItem(idStorageKey, (regResult as { id: string }).id); } catch { /* ignore */ }
        }
        setStatus('granted');
      } catch (e) {
        setStatus('error');
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    inFlightByNamespace.set(storageKey, run);
    try {
      await run;
    } finally {
      inFlightByNamespace.delete(storageKey);
    }
  }, [register, storageKey, idStorageKey]);

  // Final Gap Analysis P2-4 — the inverse of subscribe(): revokes the
  // server-side device token row (if this device has one on record) and
  // tears down the browser-side subscription, then returns to 'default' so
  // the UI offers "Aktivera" again. Never touches the OS/browser permission
  // itself — a student who disables here and re-enables later is not
  // re-prompted, exactly as real browser permission semantics work.
  const unsubscribe = useCallback(async () => {
    setError(null);
    let tokenId: string | null = null;
    try { tokenId = localStorage.getItem(idStorageKey); } catch { /* ignore */ }

    try {
      if (tokenId && unregister) await unregister(tokenId);
      await unsubscribeCurrentDevice();
      try {
        localStorage.removeItem(storageKey);
        localStorage.removeItem(idStorageKey);
      } catch { /* ignore */ }
      setStatus('default');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [idStorageKey, storageKey, unregister]);

  // Silent re-registration on mount if permission was already granted in a
  // previous visit — keeps the token fresh (FCM tokens can rotate) without
  // re-prompting the user every time they open the portal.
  useEffect(() => {
    if (isPushConfigured() && getNotificationPermission() === 'granted') {
      void subscribe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, error, subscribe, unsubscribe };
}
