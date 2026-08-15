import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Settings, Search } from 'lucide-react';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { cn } from '@/lib/utils.js';

// ─── Scheduling workspace shell ────────────────────────────────────────────────
//
// Persistent layout for the /scheduling/* "Bokningsschema workspace" — the
// module navigation bar (tabs + search + quick actions) used to be rendered
// only inside SchedulingCalendarPage's own JSX, so navigating to any sibling
// route (Mitt schema, Passöversikt, Bokningslista, Väntelista) unmounted it
// entirely instead of just swapping content underneath it. Extracted here so
// every nested route renders inside the same persistent shell via <Outlet/>,
// while each route keeps its own real, bookmarkable URL — this is a layout
// change only, not a routing/URL change (see SchedulingPage.tsx).
//
// Bevakningar (/watchlist) is NOT nested under /scheduling/* — it's a
// separate, independently-owned route tree. Wrapping it in this shell would
// mean either duplicating that page under a new nested route or relocating
// its real route, both explicitly out of scope here. Its tab button
// intentionally still navigates away from this workspace — an honest
// reflection of which routes actually belong to the Scheduling domain
// today. Kunder's tab and Loggar's tab were both removed entirely (not
// just left navigating away) for the same reason: each duplicated a
// canonical entry already in the main Tenant Workspace sidebar (/students,
// /logs) without adding anything scheduling-specific; those canonical
// entries are untouched.

const MODULE_NAV_TABS = [
  { label: 'Mitt schema',    path: '/scheduling/mine'      },
  { label: 'Bokningsschema', path: '/scheduling'           },
  { label: 'Bokningslista',  path: '/scheduling/bokningar' },
  { label: 'Bevakningar',    path: '/watchlist'            },
  { label: 'Väntelista',     path: '/scheduling/waitlist'  },
  { label: 'Passöversikt',   path: '/scheduling/list'      },
] as const;

export function SchedulingWorkspaceLayout() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [customerSearchValue, setCustomerSearchValue] = useState('');

  return (
    <PermissionGate permission={Permissions.SCHEDULING_READ}>
      <div className="flex flex-col h-full min-h-0 -mx-6 -mt-4">

        {/* Module navigation bar */}
        <div className="flex items-center border-b border-border bg-card shrink-0 px-2">
          <div className="flex items-center flex-1 min-w-0 overflow-x-auto scrollbar-none">
            {MODULE_NAV_TABS.map((tab) => (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={cn(
                  'px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0',
                  (tab.path === '/scheduling'
                    ? location.pathname === '/scheduling'
                    : location.pathname.startsWith(tab.path))
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
                )}
              >
                {tab.label}
              </button>
            ))}
            <button
              onClick={() => navigate('/settings')}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors border-b-2 border-transparent -mb-px shrink-0 ml-1"
              aria-label="Inställningar"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* Right: search + action buttons */}
          <div className="flex items-center gap-2 pl-3 py-1.5 shrink-0">
            <div className="relative flex items-center">
              <Search className="absolute left-2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
              <input
                type="text"
                placeholder="Sök kund..."
                value={customerSearchValue}
                onChange={(e) => setCustomerSearchValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customerSearchValue.trim()) {
                    navigate(`/students?search=${encodeURIComponent(customerSearchValue.trim())}`);
                    setCustomerSearchValue('');
                  }
                }}
                className="h-7 pl-7 pr-2 text-xs border border-border rounded bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 w-36"
              />
            </div>
            <button
              onClick={() => navigate('/finance/cash')}
              className="px-3 py-1 text-xs font-semibold rounded bg-amber-400 text-amber-900 hover:bg-amber-500 transition-colors whitespace-nowrap"
            >
              Kassa
            </button>
            <button
              onClick={() => navigate('/students')}
              className="px-3 py-1 text-xs font-semibold rounded bg-green-500 text-white hover:bg-green-600 transition-colors whitespace-nowrap"
            >
              Ny kund
            </button>
          </div>
        </div>

        {/* Active workspace view */}
        <div className="flex-1 min-h-0 flex flex-col">
          <Outlet />
        </div>
      </div>
    </PermissionGate>
  );
}
