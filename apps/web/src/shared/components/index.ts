// ─── Layout ───────────────────────────────────────────────────────────────────
export { AppShell } from './layout/AppShell/AppShell.js';
export { Sidebar } from './layout/Sidebar/Sidebar.js';
export { TopBar } from './layout/TopBar/TopBar.js';
export { PageLayout, PageHeader, PageContent } from './layout/PageLayout/PageLayout.js';
export { LoadingScreen } from './layout/LoadingScreen/LoadingScreen.js';

// ─── Errors ───────────────────────────────────────────────────────────────────
export { ErrorBoundary } from './errors/ErrorBoundary.js';
export { ErrorFallback } from './errors/ErrorFallback.js';

// ─── Guards ───────────────────────────────────────────────────────────────────
export { ProtectedRoute } from './guards/ProtectedRoute.js';
export { PermissionGate } from '@core/rbac/PermissionGate.js';

// ─── Utilities ────────────────────────────────────────────────────────────────
export { PhoneLink } from './PhoneLink.js';
