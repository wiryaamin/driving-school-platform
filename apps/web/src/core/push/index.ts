/**
 * Firebase Cloud Messaging (FCM) — browser push notification registration.
 *
 * Single integration point for Firebase Web SDK, mirroring the pattern
 * already established by core/monitoring (Sentry): environment-aware,
 * never initializes without configuration, and everything else in the app
 * talks to this module's functions rather than the Firebase SDK directly.
 *
 * Approved production push architecture (Commissioning Register,
 * 2026-07-23): Firebase Cloud Messaging. Reuses the app's existing service
 * worker (public/sw.js) rather than a separate firebase-messaging-sw.js —
 * dispatchFirebase() (supabase/functions/_shared/comm-providers.ts) sends
 * webpush *data* messages (not the `notification` field) specifically so
 * delivery always reaches sw.js's generic `push` event handler, which this
 * app already owns and controls end-to-end.
 *
 * No-ops entirely without VITE_FIREBASE_* configured — the calling code
 * (usePushRegistration, below) always checks isPushConfigured() first, so
 * every portal continues to work normally with push simply unavailable.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, deleteToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';

export interface FirebaseWebConfig {
  apiKey:            string;
  authDomain?:       string;
  projectId:         string;
  messagingSenderId: string;
  appId:             string;
}

function readConfig(): FirebaseWebConfig | null {
  const apiKey            = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  const projectId         = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined;
  const appId             = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined;

  if (!apiKey || !projectId || !messagingSenderId || !appId) return null;

  return {
    apiKey,
    projectId,
    messagingSenderId,
    appId,
    authDomain: `${projectId}.firebaseapp.com`,
  };
}

function readVapidKey(): string | null {
  return (import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined) ?? null;
}

/** Whether Firebase Web config + VAPID key are both present — the real gate every caller should check first. */
export function isPushConfigured(): boolean {
  return readConfig() !== null && readVapidKey() !== null;
}

/** Whether the current browser supports the Push API + Notifications at all (independent of configuration). */
export async function isPushSupportedByBrowser(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return false;
  }
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

let cachedApp: FirebaseApp | null = null;
let cachedMessaging: Messaging | null = null;

function getMessagingInstance(): Messaging | null {
  const config = readConfig();
  if (!config) return null;

  if (!cachedApp) cachedApp = initializeApp(config);
  if (!cachedMessaging) cachedMessaging = getMessaging(cachedApp);
  return cachedMessaging;
}

export type RequestPushTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'not_configured' | 'unsupported' | 'permission_denied' | 'error'; error?: string };

/**
 * Requests notification permission (if not already decided) and returns a
 * fresh FCM device registration token. Reuses the app's existing service
 * worker registration (registered in main.tsx) rather than registering a
 * second one — FCM's getToken() accepts any active SW registration that
 * will receive its push events, which apps/web/public/sw.js already does.
 */
export async function requestPushToken(): Promise<RequestPushTokenResult> {
  if (!isPushConfigured()) return { ok: false, reason: 'not_configured' };
  if (!(await isPushSupportedByBrowser())) return { ok: false, reason: 'unsupported' };

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return { ok: false, reason: 'permission_denied' };

  const messaging = getMessagingInstance();
  const vapidKey  = readVapidKey();
  if (!messaging || !vapidKey) return { ok: false, reason: 'not_configured' };

  try {
    const swRegistration = await navigator.serviceWorker.ready;

    // Force a genuinely fresh token/subscription pair. Firebase's
    // deleteToken() only clears its own IndexedDB-cached record — it does
    // not reliably tear down the browser's underlying raw PushManager
    // subscription, which is a separate, lower-level object. If that raw
    // subscription is stale (e.g. left over from an earlier permission
    // reset during testing) but still present, getToken() can simply
    // rediscover and re-wrap the SAME stale subscription, returning an
    // identical token even after deleteToken(). Explicitly unsubscribing
    // the raw PushManager subscription first guarantees getToken() has
    // nothing old to reuse and must negotiate a brand new one from scratch.
    try {
      const existingSub = await swRegistration.pushManager.getSubscription();
      if (existingSub) await existingSub.unsubscribe();
    } catch { /* no raw subscription to remove — fine */ }
    try { await deleteToken(messaging); } catch { /* nothing cached — fine */ }

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swRegistration,
    });
    if (!token) return { ok: false, reason: 'error', error: 'FCM returned an empty token' };
    return { ok: true, token };
  } catch (e) {
    return { ok: false, reason: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Foreground message handler — fires when a push arrives while the tab is
 * focused (background delivery instead goes through sw.js's `push` event).
 * Returns an unsubscribe function; no-ops (returns a no-op unsubscribe) if
 * push isn't configured.
 */
export function onForegroundPush(handler: (payload: { title: string; body: string; url: string }) => void): () => void {
  const messaging = getMessagingInstance();
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    handler({
      title: payload.data?.['title'] ?? payload.notification?.title ?? 'Meddelande',
      body:  payload.data?.['body']  ?? payload.notification?.body  ?? '',
      url:   payload.data?.['url']   ?? '/',
    });
  });
}
