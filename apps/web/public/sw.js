/**
 * Service Worker — Trafikskola Platform
 *
 * Strategy:
 *   - Network-first for API calls (supabase) and navigation
 *   - Cache-first for static assets (JS/CSS/fonts)
 *   - Push notification handling for lesson reminders
 */

const CACHE_NAME = 'trafikskola-v2';

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

  // Navigation: network-first, fallback to cached /
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match('/').then((r) => r ?? new Response('Offline', { status: 503 }))
    )
  );
});

// ── Push notifications ────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = { title: 'Trafikskola', body: '', url: '/' };
  try {
    data = { ...data, ...event.data?.json() };
  } catch { /* ignore */ }

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
