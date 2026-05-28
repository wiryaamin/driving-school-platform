import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './globals.css';
import { initAdminI18n } from '@platform/i18n';

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
});
