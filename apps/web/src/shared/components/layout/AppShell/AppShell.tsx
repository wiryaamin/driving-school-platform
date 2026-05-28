import { Outlet } from 'react-router-dom';
import { Sidebar } from '../Sidebar/Sidebar.js';
import { TopBar } from '../TopBar/TopBar.js';
import { useUiStore } from '@core/store/ui.store.js';
import { cn } from '@/lib/utils.js';

/**
 * AppShell — the root layout for all authenticated pages.
 *
 * Layout structure:
 * ┌────────────┬──────────────────────────────────────┐
 * │            │ TopBar (fixed)                        │
 * │  Sidebar   ├──────────────────────────────────────┤
 * │  (fixed)   │ Main content area (scrollable)       │
 * │            │   <Outlet /> — page content here     │
 * └────────────┴──────────────────────────────────────┘
 */
export function AppShell() {
  const { sidebarCollapsed } = useUiStore();

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed sidebar */}
      <Sidebar />

      {/* Main area — offset by sidebar width */}
      <div
        className={cn(
          'flex flex-col min-h-screen transition-all duration-300',
          sidebarCollapsed ? 'pl-16' : 'pl-64'
        )}
      >
        {/* Fixed top bar */}
        <TopBar />

        {/* Scrollable content area — offset by topbar height */}
        <main className="flex-1 pt-14 overflow-auto">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
