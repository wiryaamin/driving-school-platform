import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users, Building2, ClipboardList, Bell, GraduationCap, BarChart2, BarChart3, ListChecks,
  Calendar, CalendarDays, List, BookOpen, Clock, Route,
  Receipt, CreditCard, Wallet, FileText, ShoppingBag, ShoppingCart, Gift,
  Settings, UserCheck,
  Mail, Send, Upload,
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
  tel?:        string;
  permission?: Permission | null;
  badge?:      number;
  comingSoon?: boolean;
}

interface NavSection {
  key:     string;
  labelSv: string;
  items:   NavItem[];
}

// ─── Navigation Configuration ─────────────────────────────────────────────────

const OVERVIEW_ITEM: NavItem = {
  key:        'dashboard',
  labelSv:    'Översikt',
  icon:       LayoutDashboard,
  path:       '/dashboard',
  permission: null,
};

export const NAVIGATION: NavSection[] = [
  {
    key:     'generellt',
    labelSv: 'GENERELLT',
    items: [
      { key: 'customers',         labelSv: 'Kunder',            icon: Users,         path: '/students',             permission: 'students:student:read' as Permission },
      { key: 'corporate',         labelSv: 'Företagskunder',    icon: Building2,     path: '/corporate',            permission: null },
      { key: 'kommunikation',     labelSv: 'Kommunikation',     icon: Mail,          path: '/kommunikation',        permission: null },
      { key: 'communication-hub', labelSv: 'Meddelandehubb',    icon: Send,          path: '/communication',        permission: null },
      { key: 'logs',              labelSv: 'Loggar',            icon: ClipboardList, path: '/logs',                 permission: null },
      { key: 'watchlist',         labelSv: 'Bevakningar',       icon: Bell,          path: '/watchlist',            permission: null },
      { key: 'classlist',         labelSv: 'Klasslista',        icon: GraduationCap, path: '/class-list',           permission: null },
      { key: 'reports',           labelSv: 'Rapporter',         icon: BarChart2,     path: '/reports',              permission: null },
      { key: 'insights',          labelSv: 'Insikter',          icon: BarChart3,     path: '/insights',             permission: null },
      { key: 'tasks',             labelSv: 'Uppgifter',         icon: ListChecks,    path: '/tasks',                permission: null },
    ],
  },
  {
    key:     'bokningssystem',
    labelSv: 'BOKNINGSSYSTEM',
    items: [
      { key: 'scheduling',   labelSv: 'Bokningsschema',      icon: Calendar,     path: '/scheduling',           permission: 'scheduling:booking:read' as Permission },
      { key: 'my-schedule',  labelSv: 'Mitt schema',         icon: CalendarDays, path: '/scheduling/mine',      permission: null },
      { key: 'bokningar',    labelSv: 'Bokningar',           icon: BookOpen,     path: '/scheduling/bokningar', permission: null },
      { key: 'booking-list', labelSv: 'Bokningslista',       icon: List,         path: '/scheduling/list',      permission: null },
      { key: 'waitlist',     labelSv: 'Väntelista',          icon: Clock,        path: '/scheduling/waitlist',  permission: null },
      { key: 'planner',      labelSv: 'Trafikövningsplatser', icon: Route,       path: '/scheduling/planner',   permission: null },
    ],
  },
  {
    key:     'ekonomi',
    labelSv: 'EKONOMI',
    items: [
      { key: 'invoices',    labelSv: 'Fakturor',            icon: Receipt,      path: '/finance/invoices',   permission: 'finance:invoice:read' as Permission },
      { key: 'payments',    labelSv: 'Betalningar',         icon: CreditCard,   path: '/finance/payments',   permission: 'finance:payment:read' as Permission },
      { key: 'cash',        labelSv: 'Kassa',               icon: Wallet,       path: '/finance/cash',       permission: null },
      { key: 'pay-request', labelSv: 'Betalningsbegäran',   icon: FileText,     path: '/finance/requests',   permission: null },
      { key: 'cash-orders', labelSv: 'Kassaordrar',         icon: ShoppingBag,  path: '/finance/orders',     permission: null },
      { key: 'ecommerce',   labelSv: 'E-handelsordrar',     icon: ShoppingCart, path: '/finance/ecommerce',  permission: null },
      { key: 'giftcards',   labelSv: 'Presentkort',         icon: Gift,         path: '/finance/gift-cards', permission: null },
    ],
  },
  {
    key:     'systeminst',
    labelSv: 'SYSTEMINSTÄLLNINGAR',
    items: [
      { key: 'settings',       labelSv: 'Inställningar', icon: Settings,  path: '/settings',                permission: null },
      { key: 'staff',          labelSv: 'Personal',      icon: UserCheck, path: '/instructors',             permission: 'instructors:instructor:read' as Permission },
      { key: 'data-migration', labelSv: 'Dataimport',    icon: Upload,    path: '/settings/data-migration', permission: null },
    ],
  },
];

// ─── Shared Nav Content ───────────────────────────────────────────────────────

interface SidebarNavContentProps {
  onNavClick?: () => void;
}

export function SidebarNavContent({ onNavClick }: SidebarNavContentProps) {
  const { can } = usePermissions();

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {/* Primary anchor — Översikt */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <SidebarItem item={OVERVIEW_ITEM} onNavClick={onNavClick} />
      </div>

      <div className="mx-3 h-px bg-sidebar-border shrink-0" />

      {/* Scrollable operational sections */}
      <div className="flex-1 overflow-y-auto px-3 py-1 scrollbar-none">
        {NAVIGATION.map((section) => {
          const visibleItems = section.items.filter((item) => {
            if (item.comingSoon) return true;
            if (item.permission == null) return true;
            return can(item.permission);
          });
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.key} className="mb-1">
              <p className="px-2 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-widest select-none text-sidebar-foreground/50">
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
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
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
  onNavClick?: () => void;
}) {
  const location = useLocation();
  const isActive = item.path
    ? location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
    : false;
  const Icon = item.icon;

  if (item.comingSoon) {
    return (
      <div
        className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium text-sidebar-foreground opacity-40 cursor-default select-none"
        title="Kommer snart"
        aria-disabled="true"
      >
        <Icon className="w-4 h-4 shrink-0" />
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
        'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium',
        'transition-colors duration-150',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate flex-1">{item.labelSv}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className="ml-auto shrink-0 text-xs font-semibold bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center">
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </NavLink>
  );
}

// ─── Org Status Chip ──────────────────────────────────────────────────────────

function OrgStatusChip({ org }: { org: Organization }) {
  if (org.subscription_status === 'trialing') {
    return <span className="text-[10px] font-medium text-amber-500 leading-none mt-0.5 block">Testperiod</span>;
  }
  if (org.subscription_status === 'past_due') {
    return <span className="text-[10px] font-medium text-destructive leading-none mt-0.5 block">Betalning försenad</span>;
  }
  if (org.status === 'suspended') {
    return <span className="text-[10px] font-medium text-destructive leading-none mt-0.5 block">Inaktivt konto</span>;
  }
  return <span className="text-[10px] font-medium text-sidebar-foreground/40 leading-none mt-0.5 block">Aktiv</span>;
}
