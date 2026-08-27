import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils.js';
import { usePermissions } from '@core/rbac/hooks.js';
import type { Permission } from '@core/rbac/permissions.js';

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
  tabs:  WorkspaceTab[];
  title?: string | undefined;
}

function isTabActive(tab: WorkspaceTab, pathname: string): boolean {
  if (tab.exact) return pathname === tab.path;
  const prefixes = tab.matchPrefixes ?? [tab.path];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function WorkspaceTabsLayout({ tabs, title }: WorkspaceTabsLayoutProps) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { can }   = usePermissions();

  const visibleTabs = tabs.filter((tab) => tab.permission == null || can(tab.permission));

  return (
    <div className="flex flex-col h-full min-h-0 -mx-6 -mt-4">

      {/* Workspace title — its own row, top-left of the workspace */}
      {title && (
        <div className="px-4 pt-3 pb-1 shrink-0 bg-card">
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        </div>
      )}

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
                  ? 'border-primary text-primary'
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
