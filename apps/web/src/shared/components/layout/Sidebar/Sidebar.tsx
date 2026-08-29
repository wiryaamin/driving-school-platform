import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Calendar,
  Settings,
  UserCheck,
  BookOpen, PieChart,
  Megaphone, GraduationCap, LifeBuoy,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { usePermissions } from '@core/rbac/hooks.js';
import type { Permission } from '@core/rbac/permissions.js';
import { useSession } from '@shared/hooks/useSession.js';
import type { Organization } from '@platform/types';
import { useQueueHealth } from '@modules/communication/hooks/useCommunication.js';
import { useOrgBrandingAssets } from '@shared/hooks/useOrgBranding.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  key:         string;
  labelSv:     string;
  icon:        LucideIcon;
  path?:       string;
  href?:       string;
  permission?: Permission | null;
  badge?:      number;
  comingSoon?: boolean;
  /** Custom active-path check for a workspace whose pages share a URL prefix
   * with a sibling workspace (Ekonomi/Bokföring both live under /finance/*)
   * — overrides the default single-path prefix check when present. */
  matchFn?:    (pathname: string) => boolean;
}

// ─── Navigation Configuration ─────────────────────────────────────────────────
// Tenant Dashboard Workspace Navigation (2026-08-27): the sidebar answers
// "which main workspace am I in?" — one item per workspace. "What do I want
// to do in this workspace?" is answered by that workspace's own horizontal
// tab bar (WorkspaceTabsLayout / SchedulingWorkspaceLayout), not by exposing
// every sub-function here. Sub-functions that don't have a natural tab home
// (Kursöversikt, Statistik, Passläggning, Slotmallar, Uppgifter,
// Trafikövningsplatser, Fortnox, Dataimport, Bokningsflöde,
// Utbildningsplaner) remain accessible from within their parent workspace.

const OVERVIEW_ITEM: NavItem = {
  key:        'dashboard',
  labelSv:    'Översikt',
  icon:       LayoutDashboard,
  path:       '/dashboard',
  permission: null,
};

// Pinned bottom anchor — always visible, independent of section scroll state.
const SETTINGS_ITEM: NavItem = {
  key:        'settings',
  labelSv:    'Inställningar',
  icon:       Settings,
  path:       '/settings',
  permission: null,
};

const BOKFORING_PREFIXES = ['/finance/ledger', '/finance/vat', '/finance/reconciliation', '/finance/close', '/finance/sie4'];

function matchesAnyPrefix(prefixes: string[], pathname: string): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Kursöversikt now renders inside Teori's own workspace (see
// TeoriWorkspaceLayout), even though its URL still starts with
// /scheduling — Schema's own matchFn below excludes it so the two
// sidebar items don't both claim to be "active" on the same path.
const TEORI_PREFIXES = ['/teorifragor', '/scheduling/kurser'];

export const NAVIGATION: NavItem[] = [
  { key: 'elever',    labelSv: 'Kunder',               icon: Users,     path: '/students',   permission: 'students:student:read' as Permission },
  {
    key: 'schema', labelSv: 'Schema', icon: Calendar, path: '/scheduling', permission: 'scheduling:booking:read' as Permission,
    matchFn: (pathname) =>
      !matchesAnyPrefix(TEORI_PREFIXES, pathname) &&
      matchesAnyPrefix(['/scheduling'], pathname),
  },
  {
    key: 'ekonomi', labelSv: 'Ekonomi', icon: PieChart, path: '/finance', permission: 'finance:invoice:read' as Permission,
    matchFn: (pathname) =>
      !matchesAnyPrefix(BOKFORING_PREFIXES, pathname) &&
      matchesAnyPrefix(['/finance', '/orders', '/packages', '/campaigns'], pathname),
  },
  {
    key: 'bokforing', labelSv: 'Bokföring', icon: BookOpen, path: '/finance/ledger', permission: 'finance:ledger:read' as Permission,
    matchFn: (pathname) => matchesAnyPrefix(BOKFORING_PREFIXES, pathname),
  },
  { key: 'personal_resurser', labelSv: 'Personal & Resurser', icon: UserCheck, path: '/staff', permission: 'instructors:instructor:read' as Permission },
  {
    key: 'teori', labelSv: 'Teori', icon: GraduationCap, path: '/teorifragor', permission: null,
    matchFn: (pathname) => matchesAnyPrefix(TEORI_PREFIXES, pathname),
  },
  {
    key: 'system', labelSv: 'System', icon: Megaphone, path: '/nyheter', permission: null,
    matchFn: (pathname) => matchesAnyPrefix(['/nyheter', '/logs', '/reports', '/insights'], pathname),
  },
  { key: 'hjalp_support', labelSv: 'Hjälp & Support', icon: LifeBuoy, path: '/hjalp-support', permission: null },
];

// ─── Shared Nav Content ───────────────────────────────────────────────────────

interface SidebarNavContentProps {
  onNavClick?: (() => void) | undefined;
}

export function SidebarNavContent({ onNavClick }: SidebarNavContentProps) {
  const { can } = usePermissions();

  // P2-2 (Final Gap Analysis): reuses the existing communications queue-health
  // endpoint — the same summary CommunicationHubPage already renders on open —
  // as an ambient nudge, so a staff member doesn't have to already know to go
  // check for a delivery failure. Not a second notification system, just this
  // count surfaced one level higher up. Shown on the Elever workspace item
  // now that Kommunikation is a tab inside it rather than its own nav item.
  const { data: queueHealth } = useQueueHealth();
  const commBadge = queueHealth?.total_retryable ?? 0;

  // Scroll affordance for the operational-sections pane below — on small
  // viewports the workspace list can run taller than the pane itself, and
  // the pane scrolls internally rather than the page, so there's otherwise
  // no cue that the last item (System) sits below the fold. Tracked as real
  // scroll position rather than CSS alone: a single multi-layer
  // background-image gradient keyed to var(--sidebar-background) proved
  // unreliable (invalid hsl(var()) usage silently drops the whole
  // declaration in Chromium), so this uses plain scrollTop/scrollHeight math
  // instead.
  const navScrollRef = useRef<HTMLDivElement>(null);
  const [navScrollState, setNavScrollState] = useState({ canScrollUp: false, canScrollDown: false });

  const updateNavScrollState = useCallback(() => {
    const el = navScrollRef.current;
    if (!el) return;
    setNavScrollState({
      canScrollUp:   el.scrollTop > 0,
      canScrollDown: el.scrollTop < el.scrollHeight - el.clientHeight - 1,
    });
  }, []);

  useEffect(() => {
    const el = navScrollRef.current;
    if (!el) return;
    updateNavScrollState();
    el.addEventListener('scroll', updateNavScrollState, { passive: true });
    const resizeObserver = new ResizeObserver(updateNavScrollState);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener('scroll', updateNavScrollState);
      resizeObserver.disconnect();
    };
  }, [updateNavScrollState]);

  function visibleOf(items: NavItem[]): NavItem[] {
    return items.filter((item) => {
      if (item.comingSoon) return true;
      if (item.permission == null) return true;
      return can(item.permission);
    });
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {/* Primary anchor — Översikt */}
      <div className="px-3 pt-3 pb-2 shrink-0 space-y-0.5">
        <SidebarItem item={OVERVIEW_ITEM} onNavClick={onNavClick} />
      </div>

      <div className="mx-3 h-px bg-tenant-sidebar-border shrink-0" />

      {/* Scrollable workspace list. On small viewports the list can run
          taller than the pane itself, and this is a nested scroll region
          (not page scroll) with an OS-hidden scrollbar on macOS by default
          — so the last item (System) can sit below the fold with no visual
          cue that there is more to scroll to. The two shadow divs below are
          pointer-events-none overlays, pinned to the pane's edges (not
          inside the scrolling content), toggled by real scrollTop/
          scrollHeight state rather than CSS alone. */}
      <div className="relative flex-1 min-h-0">
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 h-4 z-10 transition-opacity duration-150',
            navScrollState.canScrollUp ? 'opacity-100' : 'opacity-0',
          )}
          style={{ background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.32), transparent)' }}
        />
        <div
          ref={navScrollRef}
          onScroll={updateNavScrollState}
          className="h-full overflow-y-auto px-3 py-1 scrollbar-none space-y-0.5"
        >
        {visibleOf(NAVIGATION).map((item) => (
          <SidebarItem
            key={item.key}
            item={item.key === 'elever' && commBadge > 0 ? { ...item, badge: commBadge } : item}
            onNavClick={onNavClick}
          />
        ))}
        </div>
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 h-4 z-10 transition-opacity duration-150',
            navScrollState.canScrollDown ? 'opacity-100' : 'opacity-0',
          )}
          style={{ background: 'linear-gradient(to top, rgba(0, 0, 0, 0.32), transparent)' }}
        />
      </div>

      {/* Pinned bottom anchor — Inställningar, always visible regardless of section scroll */}
      <div className="mx-3 h-px bg-tenant-sidebar-border shrink-0" />
      <div className="px-3 pt-2 pb-3 shrink-0">
        <SidebarItem item={SETTINGS_ITEM} onNavClick={onNavClick} />
      </div>

    </div>
  );
}

// ─── Desktop Sidebar ──────────────────────────────────────────────────────────

export function Sidebar() {
  const { organization, isLoading } = useSession();
  // Tenant Company Logo (2026-08-29): the upload flow itself already existed
  // (Settings → Webbplats → Varumärke → "Ljus logotyp"), but nothing in the
  // tenant dashboard's own chrome ever consumed the result — the sidebar
  // mark stayed permanently on initials/a generic icon regardless of what a
  // school uploaded. logo_light (designed for a dark background) is the
  // right asset for this dark sidebar; falls back to initials/icon exactly
  // as before when no logo has been uploaded yet.
  const { data: brandingAssets } = useOrgBrandingAssets();
  const logoUrl = brandingAssets?.['logo_light'];

  const orgInitials = organization?.name
    ? organization.name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
    : null;

  return (
    <aside className="fixed left-0 top-0 h-full w-[280px] flex-col bg-tenant-sidebar border-r border-tenant-sidebar-border hidden md:flex z-40">

      {/* Workspace Header */}
      <div className="flex items-center gap-3 h-[72px] px-4 border-b border-tenant-sidebar-border shrink-0">
        {/* bg-tenant-sidebar-accent, not bg-action (2026-08-29): the mark's
            box used the orange action color as its fill, so any uploaded
            logo whose aspect ratio isn't an exact 1:1 match for this square
            — the vast majority of real uploads — left object-contain's
            letterbox gap showing orange through the rounded corners (looked
            like a stray triangle). A school's logo is an identity element,
            not an action affordance, so it never belonged on the orange
            token to begin with; the sidebar's own neutral accent surface
            (already used for hover states elsewhere in this file) reads as
            a natural dark "plate" behind any logo — transparent, white-bg,
            or self-contained badge alike — without competing with it. */}
        <div className="w-10 h-10 rounded-xl bg-tenant-sidebar-accent flex items-center justify-center shrink-0 overflow-hidden">
          {logoUrl ? (
            <img src={logoUrl} alt={organization?.name ?? 'Logotyp'} className="w-full h-full object-contain p-1.5" />
          ) : orgInitials ? (
            <span className="text-sm font-bold text-tenant-sidebar-accent-foreground">{orgInitials}</span>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-tenant-sidebar-accent-foreground" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <div className="h-4 w-28 bg-tenant-sidebar-accent/30 rounded animate-pulse" />
          ) : (
            <span className="text-sm font-semibold text-tenant-sidebar-primary-foreground truncate block leading-tight">
              {organization?.name ?? 'Körskola'}
            </span>
          )}
          {!isLoading && organization && <OrgStatusChip org={organization} />}
        </div>
      </div>

      <SidebarNavContent />
    </aside>
  );
}

// ─── Sidebar Item ─────────────────────────────────────────────────────────────

function SidebarItem({
  item,
  onNavClick,
}: {
  item:        NavItem;
  onNavClick?: (() => void) | undefined;
}) {
  const location = useLocation();
  const isActive = item.matchFn
    ? item.matchFn(location.pathname)
    : item.path
      ? location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
      : false;
  const Icon = item.icon;

  if (item.comingSoon) {
    return (
      <div
        className="flex items-center gap-3 px-2.5 py-1.5 rounded-lg text-sm font-medium text-tenant-sidebar-foreground opacity-40 cursor-default select-none"
        title="Kommer snart"
        aria-disabled="true"
      >
        <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
        <span className="truncate">{item.labelSv}</span>
      </div>
    );
  }

  if (!item.path) return null;

  return (
    <NavLink
      to={item.path}
      onClick={onNavClick}
      className={cn(
        'flex items-center gap-3 px-2.5 py-1.5 rounded-lg text-sm font-medium',
        'transition-colors duration-150',
        isActive
          ? 'bg-tenant-sidebar-accent text-tenant-sidebar-accent-foreground'
          : 'text-tenant-sidebar-foreground hover:bg-tenant-sidebar-accent/50 hover:text-tenant-sidebar-accent-foreground'
      )}
    >
      <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
      <span className="truncate flex-1">{item.labelSv}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className="ml-auto shrink-0 text-[11px] font-semibold bg-action text-action-foreground rounded-full w-5 h-5 flex items-center justify-center">
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </NavLink>
  );
}

// ─── Org Status Chip ──────────────────────────────────────────────────────────
// NAV-3: Shows critical states at highest priority, then subscription tier
// for Professional and Enterprise (provides context for active workspaces).

function OrgStatusChip({ org }: { org: Organization }) {
  if (org.status === 'suspended') {
    return <span className="text-[11px] font-medium text-destructive leading-none mt-0.5 block">Inaktivt konto</span>;
  }
  if (org.subscription_status === 'past_due') {
    return <span className="text-[11px] font-medium text-destructive leading-none mt-0.5 block">Betalning försenad</span>;
  }
  if (org.subscription_status === 'trialing') {
    return <span className="text-[11px] font-medium text-amber-500 leading-none mt-0.5 block">Testperiod</span>;
  }
  if (org.subscription_tier === 'enterprise') {
    return <span className="text-[11px] font-medium text-tenant-sidebar-primary leading-none mt-0.5 block">Enterprise</span>;
  }
  if (org.subscription_tier === 'professional') {
    return <span className="text-[11px] font-medium text-tenant-sidebar-primary leading-none mt-0.5 block">Professional</span>;
  }
  return <span className="text-[11px] font-medium text-tenant-sidebar-foreground/40 leading-none mt-0.5 block">Aktiv</span>;
}
