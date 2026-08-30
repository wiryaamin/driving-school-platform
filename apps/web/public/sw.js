/**
 * Service Worker — Trafikskola Platform
 *
 * Strategy:
 *   - Network-first for API calls (supabase) and navigation
 *   - Cache-first for static assets (JS/CSS/fonts)
 *   - Push notification handling for lesson reminders
 */

const CACHE_NAME = 'trafikskola-v4';

const STATIC_EXTENSIONS = ['.js', '.css', '.woff', '.woff2', '.ttf', '.png', '.svg', '.ico'];

function isStaticAsset(url) {
  return STATIC_EXTENSIONS.some(ext => url.pathname.endsWith(ext));
}

function isApiCall(url) {
  return url.hostname.includes('supabase.co') || url.pathname.startsWith('/functions/');
}

// ── Install: precache app shell ───────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(['/'])
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for API, cache-first for static ─────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET
  if (event.request.method !== 'GET') return;

  // Skip non-http(s) schemes (chrome-extension://, moz-extension://, etc.) —
  // the Cache API only supports http/https, so caches.put() throws
  // "Request scheme '...' is unsupported" for anything else. isStaticAsset()
  // below matches purely on file extension (e.g. a browser extension's own
  // content script ending in .js), so without this guard a request that
  // happens to share a static-asset extension but isn't http(s) reaches
  // cache.put() and throws — confirmed live via a real browser extension's
  // requests surfacing this exact error, 2026-08-03.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // API calls: let the browser handle natively (service worker must not intercept)
  if (isApiCall(url)) {
    return;
  }

  // Static assets: cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Navigation (actual page loads): network-first, fallback to cached app
  // shell. Deliberately scoped to request.mode === 'navigate' only — this
  // used to catch every remaining GET (manifest.json, robots.txt, sitemap.xml,
  // ...), so a single transient network failure on one of those substituted
  // the cached HTML shell for what should have been JSON/plain text,
  // surfacing as a confusing "Manifest: Line 1, column 1, Syntax error"
  // instead of the real, unrelated network blip that actually caused it.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/').then((r) => r ?? new Response('Offline', { status: 503 }))
      )
    );
  }
  // Everything else (manifest.json, robots.txt, sitemap.xml, ...): let the
  // browser handle it natively — a real network failure should surface as
  // exactly that, not as a substituted, mismatched cached response.
});

// ── Push notifications ────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch { /* not JSON — leave payload empty, defaults below apply */ }

  // FCM wraps a webpush.data payload one level deeper at the wire level
  // ({ data: { title, body, url } }), not flat — unwrap it if present so
  // real content is actually read instead of always falling through to
  // the generic defaults below.
  const inner = payload.data ?? payload;
  const data = {
    title: inner.title || 'Trafikskola',
    body:  inner.body  || '',
    url:   inner.url   || '/',
  };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      data:    { url: data.url },
      vibrate: [100, 50, 100],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      const existing = cs.find((c) => c.url.includes(url));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
