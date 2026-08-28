import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Sidebar } from '../Sidebar/Sidebar.js';
import { TopBar } from '../TopBar/TopBar.js';
import { MobileSidebar } from '../Sidebar/MobileSidebar.js';
import { CommandPalette } from '../../CommandPalette/CommandPalette.js';
import { Toaster } from '@platform/ui';
import { useSessionStore } from '@core/store/session.store.js';
import { getTrialLockState } from '@core/auth/trialLock.js';

// Dialog/Sheet (packages/ui) render via a Radix Portal into document.body —
// a DOM sibling of this component, not a descendant — so the `.tenant-shell`
// class on the wrapper below never reaches them through the normal CSS
// cascade, and every dialog's primary button would silently fall back to
// the unscoped (blue) --action default instead of the tenant's orange.
// Mirroring the class onto <body> for as long as this shell is mounted
// closes that gap without touching Dialog/Sheet/Portal internals — any
// portal content attached to body while the tenant dashboard is active
// inherits the same CSS variables the in-tree class provides.
function useTenantShellBodyClass(): void {
  useEffect(() => {
    document.body.classList.add('tenant-shell');
    return () => document.body.classList.remove('tenant-shell');
  }, []);
}

function TrialGraceBanner() {
  const organization = useSessionStore((s) => s.organization);
  const { inGracePeriod, daysRemaining } = getTrialLockState(organization);

  if (!inGracePeriod) return null;

  return (
    <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 text-sm px-4 py-2">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>
        Er testperiod har gått ut. Om {daysRemaining} dag{daysRemaining !== 1 ? 'ar' : ''} spärras kontot tills ni uppgraderar. Kontakta oss för att fortsätta.
      </span>
    </div>
  );
}

export function AppShell() {
  useTenantShellBodyClass();

  return (
    // tenant-shell (Tenant Dashboard Visual Alignment, 2026-08-29) scopes
    // the orange CTA accent (--action, see Button component) and the
    // neutral gray page canvas (bg-surface, distinct from white bg-card
    // content surfaces) to only this tree — Platform Admin/Student Portal/
    // public marketing use their own separate shell components and are
    // unaffected. See globals.css for the token definitions.
    <div className="tenant-shell min-h-screen bg-surface">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar />

      {/* Mobile sidebar — Sheet overlay, visible on mobile only */}
      <MobileSidebar />

      {/* Main area — offset by fixed 280px sidebar on desktop */}
      <div className="flex flex-col min-h-screen md:pl-[280px]">
        <TopBar />
        <TrialGraceBanner />
        <main className="flex-1 pt-[52px] overflow-auto">
          <div className="p-4 md:p-5">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Global overlays */}
      <CommandPalette />
      <Toaster />
    </div>
  );
}
