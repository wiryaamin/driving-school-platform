import { Outlet } from 'react-router-dom';
import { Sidebar } from '../Sidebar/Sidebar.js';
import { TopBar } from '../TopBar/TopBar.js';
import { MobileSidebar } from '../Sidebar/MobileSidebar.js';
import { useUiStore } from '@core/store/ui.store.js';
import { cn } from '@/lib/utils.js';
import { Toaster } from '@platform/ui';

export function AppShell() {
  const { sidebarCollapsed } = useUiStore();

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar />

      {/* Mobile sidebar — Sheet overlay, visible on mobile only */}
      <MobileSidebar />

      {/* Main area */}
      <div
        className={cn(
          'flex flex-col min-h-screen transition-all duration-300',
          /* Desktop: offset by sidebar. Mobile: no offset */
          sidebarCollapsed ? 'md:pl-16' : 'md:pl-64'
        )}
      >
        <TopBar />
        <main className="flex-1 pt-14 overflow-auto">
          <div className="p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
