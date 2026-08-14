import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users, GraduationCap, ChartBar, LineChart,
  Calendar, List, Clock,
  Receipt, CreditCard, Wallet,
  Settings, UserCheck, Smartphone,
  Send, Boxes, Building2,
  UserPlus, Package, Tag, ShoppingCart, ClipboardList,
  BookOpen, Percent, Lock, FileDown, Landmark, Rocket, PieChart, FileText,
  ChevronDown, ShieldCheck, Megaphone, HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { usePermissions } from '@core/rbac/hooks.js';
import type { Permission } from '@core/rbac/permissions.js';
import { useSession } from '@shared/hooks/useSession.js';
import type { Organization } from '@platform/types';

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
}

interface NavSection {
  key:         string;
  labelSv:     string;
  items:       NavItem[];
  /** Whole section collapses behind its own toggle (default collapsed, auto-expands when active). */
  collapsible?: boolean;
}

// ─── Navigation Configuration ─────────────────────────────────────────────────
// Approved IA (Tenant Workspace Sidebar Finalization): 5 sections + 3 anchors
// (Översikt/Kom igång pinned top, Inställningar pinned bottom). Items moved to
// contextual sub-navigation (Kursöversikt, Statistik, Passläggning, Slotmallar,
// Bevakningar, Uppgifter, Loggar, Trafikövningsplatser, Fortnox, Dataimport,
// Bokningsflöde, Utbildningsplaner) remain accessible from within their parent
// modules or, for Dataimport, from the Kom igång onboarding checklist.

const OVERVIEW_ITEM: NavItem = {
  key:        'dashboard',
  labelSv:    'Översikt',
  icon:       LayoutDashboard,
  path:       '/dashboard',
  permission: null,
};

// Shown only while the org hasn't reached Go Live (Customer Provisioning &
// Tenant Onboarding Architecture, Section 17) — disappears permanently once
// organization.go_live_at is set, the same way the item never existed for a
// tenant that onboarded before this capability shipped.
const SETUP_ITEM: NavItem = {
  key:        'setup',
  labelSv:    'Kom igång',
  icon:       Rocket,
  path:       '/setup',
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

export const NAVIGATION: NavSection[] = [
  {
    key:     'kundhantering',
    labelSv: 'KUNDHANTERING',
    items: [
      { key: 'customers',      labelSv: 'Kunder',          icon: Users,          path: '/students',      permission: 'students:student:read' as Permission },
      { key: 'foretagskunder', labelSv: 'Företagskunder',  icon: Building2,      path: '/corporate',     permission: null },
      { key: 'leads',          labelSv: 'Leads',           icon: UserPlus,       path: '/leads',         permission: null },
      { key: 'enrollments',    labelSv: 'Anmälningar',     icon: ClipboardList,  path: '/enrollments',   permission: 'enrollment:request:read' as Permission },
      { key: 'communication',  labelSv: 'Kommunikation',   icon: Send,           path: '/communication', permission: null },
      { key: 'documents',      labelSv: 'Dokumentarkiv',   icon: FileText,       path: '/documents',     permission: 'documents:document:read' as Permission },
    ],
  },
  {
    key:     'planering',
    labelSv: 'PLANERING',
    items: [
      { key: 'scheduling',  labelSv: 'Bokningsschema', icon: Calendar,      path: '/scheduling',          permission: 'scheduling:booking:read' as Permission },
      { key: 'slot-list',   labelSv: 'Passöversikt',   icon: List,          path: '/scheduling/list',     permission: 'scheduling:booking:read' as Permission },
      { key: 'waitlist',    labelSv: 'Väntelista',     icon: Clock,         path: '/scheduling/waitlist', permission: 'scheduling:booking:read' as Permission },
      { key: 'classlist',   labelSv: 'Klasslista',     icon: GraduationCap, path: '/class-list',          permission: 'students:progress:read' as Permission },
    ],
  },
  {
    key:     'ekonomi',
    labelSv: 'EKONOMI',
    items: [
      { key: 'finance-overview', labelSv: 'Ekonomiöversikt', icon: PieChart,     path: '/finance',          permission: 'finance:invoice:read'  as Permission },
      { key: 'orders',           labelSv: 'Ordrar',          icon: ShoppingCart, path: '/orders',           permission: 'orders:order:read'     as Permission },
      { key: 'packages',         labelSv: 'Paket',           icon: Package,      path: '/packages',         permission: 'finance:package:read'  as Permission },
      { key: 'campaigns',        labelSv: 'Kampanjer',       icon: Tag,          path: '/campaigns',        permission: 'finance:campaign:read' as Permission },
      { key: 'invoices',         labelSv: 'Fakturor',        icon: Receipt,      path: '/finance/invoices', permission: 'finance:invoice:read'  as Permission },
      { key: 'payments',         labelSv: 'Betalningar',     icon: CreditCard,   path: '/finance/payments', permission: 'finance:payment:read'  as Permission },
      { key: 'cash',             labelSv: 'Kassa',           icon: Wallet,       path: '/finance/cash',     permission: 'finance:payment:create' as Permission },
    ],
  },
  {
    key:         'bokforing',
    labelSv:     'BOKFÖRING',
    collapsible: true,
    items: [
      { key: 'ledger',         labelSv: 'Journalboken',     icon: BookOpen, path: '/finance/ledger',         permission: 'finance:ledger:read'         as Permission },
      { key: 'vat-periods',    labelSv: 'Momsperioder',     icon: Percent,  path: '/finance/vat',            permission: 'finance:vat:read'            as Permission },
      { key: 'reconciliation', labelSv: 'Bankavstämning',   icon: Landmark, path: '/finance/reconciliation', permission: 'finance:reconciliation:read' as Permission },
      { key: 'period-close',   labelSv: 'Periodstängning',  icon: Lock,     path: '/finance/close',          permission: 'finance:close:read'          as Permission },
      { key: 'sie4',           labelSv: 'SIE4-exportfiler', icon: FileDown, path: '/finance/sie4',           permission: 'finance:sie_export:read'     as Permission },
    ],
  },
  {
    key:         'personal_resurser',
    labelSv:     'PERSONAL & RESURSER',
    collapsible: true,
    items: [
      { key: 'staff',           labelSv: 'Personal',         icon: UserCheck,  path: '/staff',          permission: 'instructors:instructor:read' as Permission },
      { key: 'instructor-app',  labelSv: 'LärarApp',         icon: Smartphone, path: '/instructor-app', permission: null },
      { key: 'resources',       labelSv: 'Fordon & Platser', icon: Boxes,      path: '/resources',      permission: null },
      { key: 'regulatory',      labelSv: 'Myndighetsärenden', icon: ShieldCheck, path: '/regulatory',    permission: 'regulatory:workflow:read' as Permission },
    ],
  },
  {
    key:         'rapporter',
    labelSv:     'RAPPORTER',
    collapsible: true,
    items: [
      { key: 'reports',  labelSv: 'Rapporter', icon: ChartBar,  path: '/reports',  permission: null },
      { key: 'insights', labelSv: 'Insikter',  icon: LineChart, path: '/insights', permission: null },
    ],
  },
  {
    key:     'system',
    labelSv: 'SYSTEM',
    items: [
      { key: 'nyheter', labelSv: 'Nyheter', icon: Megaphone, path: '/nyheter', permission: null },
      { key: 'teorifragor', labelSv: 'Körkortsfrågor', icon: HelpCircle, path: '/teorifragor', permission: null },
    ],
  },
];

// ─── Collapse-state helpers ───────────────────────────────────────────────────

function groupHasActiveItem(items: NavItem[], pathname: string): boolean {
  return items.some((item) => item.path != null && (pathname === item.path || pathname.startsWith(`${item.path}/`)));
}

/** Collapsible sections start open only if the current route already belongs to them. */
function computeInitialOpenGroups(pathname: string): Record<string, boolean> {
  const open: Record<string, boolean> = {};
  for (const section of NAVIGATION) {
    if (section.collapsible && groupHasActiveItem(section.items, pathname)) open[section.key] = true;
  }
  return open;
}

// ─── Collapsible group header + body ──────────────────────────────────────────
// Shared by every collapsible top-level section (Bokföring, Personal & Resurser,
// Rapporter) — same toggle/animation behavior and visual weight for all three.

function CollapsibleGroupHeader({
  label,
  open,
  onToggle,
  controlsId,
}: {
  label:      string;
  open:       boolean;
  onToggle:   () => void;
  controlsId: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controlsId}
      className="w-full flex items-center gap-1.5 select-none transition-colors px-2 pt-3 pb-1 text-[13px] font-bold uppercase tracking-widest text-sidebar-foreground/65 hover:text-sidebar-foreground/90"
    >
      <ChevronDown
        className={cn('w-3.5 h-3.5 shrink-0 transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')}
        strokeWidth={2}
      />
      <span className="truncate">{label}</span>
    </button>
  );
}

function CollapsibleGroupBody({
  id,
  open,
  children,
}: {
  id:       string;
  open:     boolean;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className={cn('grid transition-[grid-template-rows] duration-200 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
    >
      <div className="overflow-hidden">
        <div className="space-y-0.5 pb-1">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Shared Nav Content ───────────────────────────────────────────────────────

interface SidebarNavContentProps {
  onNavClick?: (() => void) | undefined;
}

export function SidebarNavContent({ onNavClick }: SidebarNavContentProps) {
  const { can } = usePermissions();
  const { organization } = useSession();
  const location = useLocation();
  const showSetup = organization != null && organization.go_live_at == null;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => computeInitialOpenGroups(location.pathname),
  );

  // Auto-expand any collapsed section the moment its own route becomes active
  // (e.g. navigating in via the command palette or a direct link) — never
  // auto-collapses on the way out, so a section the user opened stays open.
  useEffect(() => {
    setOpenGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const section of NAVIGATION) {
        if (section.collapsible && groupHasActiveItem(section.items, location.pathname) && next[section.key] !== true) {
          next[section.key] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [location.pathname]);

  function toggleGroup(key: string) {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function visibleOf(items: NavItem[]): NavItem[] {
    return items.filter((item) => {
      if (item.comingSoon) return true;
      if (item.permission == null) return true;
      return can(item.permission);
    });
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {/* Primary anchor — Översikt (+ Kom igång while Tenant Onboarding is active) */}
      <div className="px-3 pt-3 pb-2 shrink-0 space-y-0.5">
        <SidebarItem item={OVERVIEW_ITEM} onNavClick={onNavClick} />
        {showSetup && <SidebarItem item={SETUP_ITEM} onNavClick={onNavClick} />}
      </div>

      <div className="mx-3 h-px bg-sidebar-border shrink-0" />

      {/* Scrollable operational sections */}
      <div className="flex-1 overflow-y-auto px-3 py-1 scrollbar-none">
        {NAVIGATION.map((section) => {
          const visibleItems = visibleOf(section.items);
          if (visibleItems.length === 0) return null;

          if (section.collapsible) {
            const open   = openGroups[section.key] === true;
            const bodyId = `sidebar-group-${section.key}`;
            return (
              <div key={section.key} className="mb-1">
                <CollapsibleGroupHeader
                  label={section.labelSv}
                  open={open}
                  onToggle={() => toggleGroup(section.key)}
                  controlsId={bodyId}
                />
                <CollapsibleGroupBody id={bodyId} open={open}>
                  {visibleItems.map((item) => (
                    <SidebarItem key={item.key} item={item} onNavClick={onNavClick} />
                  ))}
                </CollapsibleGroupBody>
              </div>
            );
          }

          return (
            <div key={section.key} className="mb-1">
              <p className="px-2 pt-3 pb-1 text-[13px] font-bold uppercase tracking-widest select-none text-sidebar-foreground/65">
                {section.labelSv}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => (
                  <SidebarItem key={item.key} item={item} onNavClick={onNavClick} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pinned bottom anchor — Inställningar, always visible regardless of section scroll */}
      <div className="mx-3 h-px bg-sidebar-border shrink-0" />
      <div className="px-3 pt-2 pb-3 shrink-0">
        <SidebarItem item={SETTINGS_ITEM} onNavClick={onNavClick} />
      </div>

    </div>
  );
}

// ─── Desktop Sidebar ──────────────────────────────────────────────────────────

export function Sidebar() {
  const { organization, isLoading } = useSession();

  const orgInitials = organization?.name
    ? organization.name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
    : null;

  return (
    <aside className="fixed left-0 top-0 h-full w-[280px] flex-col bg-sidebar border-r border-sidebar-border hidden md:flex z-40">

      {/* Workspace Header */}
      <div className="flex items-center gap-3 h-[72px] px-4 border-b border-sidebar-border shrink-0">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
          {orgInitials ? (
            <span className="text-sm font-bold text-primary-foreground">{orgInitials}</span>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <div className="h-4 w-28 bg-sidebar-accent/30 rounded animate-pulse" />
          ) : (
            <span className="text-sm font-semibold text-sidebar-primary-foreground truncate block leading-tight">
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
  const isActive = item.path
    ? location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
    : false;
  const Icon = item.icon;

  if (item.comingSoon) {
    return (
      <div
        className="flex items-center gap-3 px-2.5 py-1.5 rounded-lg text-sm font-medium text-sidebar-foreground opacity-40 cursor-default select-none"
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
        'flex items-center gap-3 py-1.5 rounded-lg text-sm font-medium',
        'transition-colors duration-150',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-sidebar-primary pl-[7px] pr-2.5'
          : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground px-2.5'
      )}
    >
      <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
      <span className="truncate flex-1">{item.labelSv}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className="ml-auto shrink-0 text-[11px] font-semibold bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center">
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
    return <span className="text-[11px] font-medium text-sidebar-primary leading-none mt-0.5 block">Enterprise</span>;
  }
  if (org.subscription_tier === 'professional') {
    return <span className="text-[11px] font-medium text-sidebar-primary leading-none mt-0.5 block">Professional</span>;
  }
  return <span className="text-[11px] font-medium text-sidebar-foreground/40 leading-none mt-0.5 block">Aktiv</span>;
}
