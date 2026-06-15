import { Outlet } from 'react-router-dom';
import { Sidebar } from '../Sidebar/Sidebar.js';
import { TopBar } from '../TopBar/TopBar.js';
import { MobileSidebar } from '../Sidebar/MobileSidebar.js';
import { Toaster } from '@platform/ui';

export function AppShell() {
  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar />

      {/* Mobile sidebar — Sheet overlay, visible on mobile only */}
      <MobileSidebar />

      {/* Main area — offset by fixed 280px sidebar on desktop */}
      <div className="flex flex-col min-h-screen md:pl-[280px]">
        <TopBar />
        <main className="flex-1 pt-14 overflow-auto">
          <div className="p-4 md:p-5">
            <Outlet />
          </div>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
