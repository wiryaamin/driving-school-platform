import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './globals.css';
import { initAdminI18n } from '@platform/i18n';

// Register service worker for PWA + push notification support
if ('serviceWorker' in navigator) {
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
  console.error('[Platform] Bootstrap failed:', err);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML =
      '<div style="font-family:system-ui;padding:2rem;color:#dc2626">' +
      '<strong>Startfel</strong>' +
      '<p style="margin-top:0.5rem">Appen kunde inte starta. Kontrollera konsolen och .env.local för mer information.</p>' +
      '</div>';
  }
});
