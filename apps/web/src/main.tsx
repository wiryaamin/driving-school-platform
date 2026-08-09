import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './globals.css';
import { initAdminI18n } from '@platform/i18n';
import { logger } from '@platform/utils';
import { initMonitoring } from '@/core/monitoring/index.js';

// Must run before anything else so unhandled exceptions and promise
// rejections during bootstrap are captured too (Action 8).
initMonitoring();

// Register service worker for PWA + push notification support.
// Production only — sw.js caches JS/CSS cache-first with no revalidation
// (see public/sw.js), which permanently freezes whatever bundle a dev
// browser first fetched, silently defeating Vite HMR for every route it
// touches. That's exactly what was found live: the demo requests table
// rendered a build from weeks earlier despite the dev server and source
// file being current, because a service worker registered during an
// earlier session was still serving its first-ever cached copy.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
      console.warn('[SW] Registration failed:', err);
    });
  });
}

// Initialize Swedish i18n before rendering.
// Admin app is always Swedish — synchronous init, no suspense needed.
initAdminI18n().then(() => {
  const root = document.getElementById('root');
  if (!root) throw new Error('#root element not found in index.html');

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}).catch((err: unknown) => {
  logger.error('[Platform] Bootstrap failed', err);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML =
      '<div style="font-family:system-ui;padding:2rem;color:#dc2626">' +
      '<strong>Startfel</strong>' +
      '<p style="margin-top:0.5rem">Appen kunde inte starta. Kontrollera konsolen och .env.local för mer information.</p>' +
      '</div>';
  }
});
