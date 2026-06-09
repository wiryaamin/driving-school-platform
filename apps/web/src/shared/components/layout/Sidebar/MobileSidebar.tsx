import { useUiStore } from '@core/store/ui.store.js';
import { SidebarNavContent } from './Sidebar.js';

export function MobileSidebar() {
  const { isMobileMenuOpen, closeMobileMenu } = useUiStore();

  if (!isMobileMenuOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 md:hidden"
        onClick={closeMobileMenu}
        aria-hidden
      />

      {/* Slide-in panel */}
      <div className="fixed left-0 top-0 h-full w-64 z-50 flex flex-col bg-sidebar border-r border-sidebar-border md:hidden animate-in slide-in-from-left duration-300">
        {/* Header */}
        <div className="flex items-center h-14 px-4 border-b border-sidebar-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="ml-3 text-sm font-semibold text-sidebar-primary-foreground truncate">
            Körskola
          </span>
        </div>

        {/* Navigation — closes drawer on item click */}
        <SidebarNavContent collapsed={false} onNavClick={closeMobileMenu} />
      </div>
    </>
  );
}
