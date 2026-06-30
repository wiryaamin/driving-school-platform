import { Outlet } from 'react-router-dom';
import { Toaster } from '@platform/ui';
import { PlatformSidebar } from './PlatformSidebar.js';
import { PlatformTopBar } from './PlatformTopBar.js';

export function PlatformShell() {
  return (
    <div className="min-h-screen bg-background">
      <PlatformSidebar />

      <div className="flex flex-col min-h-screen md:pl-[280px]">
        <PlatformTopBar />
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
