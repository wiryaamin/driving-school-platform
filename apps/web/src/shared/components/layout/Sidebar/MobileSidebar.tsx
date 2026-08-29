import { X } from 'lucide-react';
import { useUiStore } from '@core/store/ui.store.js';
import { useSession } from '@shared/hooks/useSession.js';
import { useOrgBrandingAssets } from '@shared/hooks/useOrgBranding.js';
import { SidebarNavContent } from './Sidebar.js';

export function MobileSidebar() {
  const { isMobileMenuOpen, closeMobileMenu } = useUiStore();
  const { organization } = useSession();
  // See Sidebar.tsx's identical logic (2026-08-29) — the desktop and mobile
  // sidebar marks must show the same uploaded logo, not just one of them.
  const { data: brandingAssets } = useOrgBrandingAssets();
  const logoUrl = brandingAssets?.['logo_light'];

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
      <div className="fixed left-0 top-0 h-full w-[280px] z-50 flex flex-col bg-tenant-sidebar border-r border-tenant-sidebar-border md:hidden animate-in slide-in-from-left duration-300">

        {/* Header */}
        <div className="flex items-center h-[72px] px-4 border-b border-tenant-sidebar-border shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* bg-tenant-sidebar-accent, not bg-action — see Sidebar.tsx's
                identical comment (2026-08-29): keeps the orange action color
                out of the logo mark's box, so a non-square/transparent logo
                never lets that orange bleed through object-contain's
                letterbox gap. */}
            <div className="w-10 h-10 rounded-xl bg-tenant-sidebar-accent flex items-center justify-center shrink-0 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt={organization?.name ?? 'Logotyp'} className="w-full h-full object-contain p-1.5" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-tenant-sidebar-accent-foreground" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              )}
            </div>
            <span className="text-sm font-semibold text-tenant-sidebar-primary-foreground truncate leading-tight">
              {organization?.name ?? 'Körskola'}
            </span>
          </div>
          <button
            onClick={closeMobileMenu}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-tenant-sidebar-foreground/60 hover:text-tenant-sidebar-foreground hover:bg-tenant-sidebar-accent transition-colors shrink-0"
            aria-label="Stäng meny"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation — closes drawer on item click */}
        <SidebarNavContent onNavClick={closeMobileMenu} />
      </div>
    </>
  );
}
