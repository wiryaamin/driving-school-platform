import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { usePermissions } from '@core/rbac/hooks.js';
import type { Permission } from '@core/rbac/permissions.js';
import { useUiStore } from '@core/store/ui.store.js';

// ─── Generic workspace tab bar ──────────────────────────────────────────────
//
// Extracted from the Scheduling workspace's tab bar
// (modules/scheduling/routes/SchedulingWorkspaceLayout.tsx) — same visual
// language and interaction model, generalized so every tenant-dashboard
// workspace (Elever, Ekonomi, Personal & Resurser, System, ...) can reuse
// one implementation instead of duplicating the tab-bar markup. Scheduling
// itself keeps its own layout unchanged (it also renders a search box and
// quick-action buttons that are specific to that workspace).

export interface WorkspaceTab {
  label:          string;
  path:           string;
  permission?:    Permission | undefined;
  /** Extra path prefixes that should also count as "this tab is active" —
   * e.g. a hub page whose own sub-routes (communication/compose, .../log, …)
   * live at sibling paths rather than nested under `path` itself. */
  matchPrefixes?: string[] | undefined;
  /** Only match this tab's exact path, not any nested sub-path — for an
   * overview tab whose path is a literal prefix of sibling tabs' paths
   * (e.g. "/finance" vs "/finance/invoices"). */
  exact?: boolean | undefined;
}

interface WorkspaceTabsLayoutProps {
  tabs:      WorkspaceTab[];
  title?:    string | undefined;
  /** Icon shown next to the title in the TopBar — pass the same icon used
   * for this workspace's sidebar item for visual consistency. */
  titleIcon?: LucideIcon | undefined;
  /** Set when this tab bar itself renders inside another workspace's
   * Outlet (e.g. Rapporter's own tab bar nested inside System) — that
   * outer workspace has already cancelled the app shell's page padding
   * once with its own -mx-6 -mt-4, so doing it again here would push
   * content an extra 24px left, clipping it behind the fixed sidebar. */
  nested?:    boolean | undefined;
}

function isTabActive(tab: WorkspaceTab, pathname: string): boolean {
  if (tab.exact) return pathname === tab.path;
  const prefixes = tab.matchPrefixes ?? [tab.path];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function WorkspaceTabsLayout({ tabs, title, titleIcon, nested }: WorkspaceTabsLayoutProps) {
  const navigate     = useNavigate();
  const location      = useLocation();
  const { can }       = usePermissions();
  const setPageTitle  = useUiStore((s) => s.setPageTitle);

  // Rendered by TopBar, to the left of the search pill, on the same row —
  // not here, since this layout sits below TopBar in a separate stacking
  // context. Cleared on unmount so navigating to a title-less page doesn't
  // leave stale text behind.
  useEffect(() => {
    setPageTitle(title ? { text: title, icon: titleIcon } : null);
    return () => setPageTitle(null);
  }, [title, titleIcon, setPageTitle]);

  const visibleTabs = tabs.filter((tab) => tab.permission == null || can(tab.permission));

  return (
    <div className={cn('flex flex-col h-full min-h-0', !nested && '-mx-6 -mt-4')}>

      {/* Module navigation bar */}
      <div className="flex items-center border-b border-border bg-card shrink-0 px-2">
        <div className="flex items-center flex-1 min-w-0 overflow-x-auto scrollbar-none">
          {visibleTabs.map((tab) => (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                'px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0',
                isTabActive(tab, location.pathname)
                  ? 'border-action text-action'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active workspace view */}
      <div className="flex-1 min-h-0 flex flex-col">
        <Outlet />
      </div>
    </div>
  );
}
