import { AppShell } from '@shared/components/layout/AppShell/AppShell.js';

/**
 * AppShellLayout — the route-level wrapper for the authenticated app shell.
 * React Router renders this as the parent element; module pages render in <Outlet />.
 */
export function AppShellLayout() {
  return <AppShell />;
}
