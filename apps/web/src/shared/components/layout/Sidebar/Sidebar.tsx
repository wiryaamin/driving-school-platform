import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  GraduationCap,
  UserCheck,
  Calendar,
  Receipt,
  CreditCard,
  FileText,
  BarChart3,
  Settings,
  ChevronLeft,
  Building2,
  MessageSquare,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { useUiStore } from '@core/store/ui.store.js';
import { usePermissions } from '@core/rbac/hooks.js';
import type { Permission } from '@core/rbac/permissions.js';
import { useSession } from '@shared/hooks/useSession.js';
import type { Organization } from '@platform/types';

// ─── Navigation Configuration ─────────────────────────────────────────────────

interface NavItem {
  key: string;
  labelSv: string;
  icon: LucideIcon;
  path: string;
  permission: Permission | null;
  badge?: number;
}

interface NavSection {
  labelSv: string | null;
  items: NavItem[];
}

export const NAVIGATION: NavSection[] = [
  {
    labelSv: null,
    items: [
      {
        key: 'dashboard',
        labelSv: 'Översikt',
        icon: LayoutDashboard,
        path: '/dashboard',
        permission: null,
      },
    ],
  },
  {
    labelSv: 'Elever & Utbildning',
    items: [
      {
        key: 'students',
        labelSv: 'Elever',
        icon: GraduationCap,
        path: '/students',
        permission: 'students:student:read' as Permission,
      },
      {
        key: 'instructors',
        labelSv: 'Lärare',
        icon: UserCheck,
        path: '/instructors',
        permission: 'instructors:instructor:read' as Permission,
      },
      {
        key: 'scheduling',
        labelSv: 'Schema',
        icon: Calendar,
        path: '/scheduling',
        permission: 'scheduling:booking:read' as Permission,
      },
    ],
  },
  {
    labelSv: 'Ekonomi',
    items: [
      {
        key: 'invoices',
        labelSv: 'Fakturor',
        icon: Receipt,
        path: '/finance/invoices',
        permission: 'finance:invoice:read' as Permission,
      },
      {
        key: 'payments',
        labelSv: 'Betalningar',
        icon: CreditCard,
        path: '/finance/payments',
        permission: 'finance:payment:read' as Permission,
      },
      {
        key: 'corporate',
        labelSv: 'Företagskunder',
        icon: Building2,
        path: '/corporate',
        permission: 'corporate:contract:read' as Permission,
      },
    ],
  },
  {
    labelSv: 'Administration',
    items: [
      {
        key: 'messages',
        labelSv: 'Meddelanden',
        icon: MessageSquare,
        path: '/messages',
        permission: 'communications:message:read' as Permission,
      },
      {
        key: 'documents',
        labelSv: 'Dokument',
        icon: FileText,
        path: '/documents',
        permission: 'documents:document:read' as Permission,
      },
      {
        key: 'reports',
        labelSv: 'Rapporter',
        icon: BarChart3,
        path: '/reports',
        permission: 'reporting:report:read' as Permission,
      },
      {
        key: 'users',
        labelSv: 'Användare',
        icon: Users,
        path: '/administration/users',
        permission: 'administration:user:read' as Permission,
      },
    ],
  },
  {
    labelSv: null,
    items: [
      {
        key: 'settings',
        labelSv: 'Inställningar',
        icon: Settings,
        path: '/settings',
        permission: null,
      },
    ],
  },
];

// ─── Shared Nav Content ───────────────────────────────────────────────────────

interface SidebarNavContentProps {
  collapsed?: boolean;
  onNavClick?: () => void;
}

export function SidebarNavContent({ collapsed = false, onNavClick }: SidebarNavContentProps) {
  const { can } = usePermissions();

  return (
    <nav className={cn('flex-1 overflow-y-auto py-4 px-2 space-y-1')}>
      {NAVIGATION.map((section, sectionIdx) => {
        const visibleItems = section.items.filter(
          (item) => item.permission === null || can(item.permission)
        );
        if (visibleItems.length === 0) return null;

        return (
          <div key={sectionIdx} className="mb-2">
            {section.labelSv && !collapsed && (
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50 select-none">
                {section.labelSv}
              </p>
            )}
            {visibleItems.map((item) => (
              <SidebarItem
                key={item.key}
                item={item}
                collapsed={collapsed}
                {...(onNavClick ? { onClick: onNavClick } : {})}
              />
            ))}
          </div>
        );
      })}
    </nav>
  );
}

// ─── Desktop Sidebar ──────────────────────────────────────────────────────────

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebarCollapsed } = useUiStore();
  const { organization, isLoading } = useSession();

  const orgInitials = organization?.name
    ? organization.name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
    : null;

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full flex-col bg-sidebar border-r border-sidebar-border',
        'transition-all duration-300 ease-in-out z-40',
        'hidden md:flex',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="flex items-center h-14 px-4 border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            {orgInitials && sidebarCollapsed ? (
              <span className="text-xs font-bold text-primary-foreground">{orgInitials}</span>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={2}>
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            )}
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              {isLoading ? (
                <div className="h-4 w-24 bg-sidebar-accent/30 rounded animate-pulse" />
              ) : (
                <span className="text-sm font-semibold text-sidebar-primary-foreground truncate block">
                  {organization?.name ?? 'Körskola'}
                </span>
              )}
              {!isLoading && organization && <OrgStatusChip org={organization} />}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <SidebarNavContent collapsed={sidebarCollapsed} />

      {/* Collapse Toggle */}
      <div className="shrink-0 p-2 border-t border-sidebar-border">
        <button
          onClick={toggleSidebarCollapsed}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground/60',
            'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            'transition-colors text-sm',
            sidebarCollapsed && 'justify-center'
          )}
          aria-label={sidebarCollapsed ? 'Expandera meny' : 'Minimera meny'}
        >
          <ChevronLeft
            className={cn('w-4 h-4 shrink-0 transition-transform', sidebarCollapsed && 'rotate-180')}
          />
          {!sidebarCollapsed && <span className="text-xs">Minimera meny</span>}
        </button>
      </div>
    </aside>
  );
}

// ─── Sidebar Item ─────────────────────────────────────────────────────────────

function SidebarItem({
  item,
  collapsed,
  onClick,
}: {
  item: NavItem;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const location = useLocation();
  const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium',
        'transition-colors duration-150',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
        collapsed && 'justify-center px-2'
      )}
      title={collapsed ? item.labelSv : undefined}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.labelSv}</span>}
      {!collapsed && item.badge !== undefined && item.badge > 0 && (
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
    return <span className="text-[10px] font-medium text-amber-500 leading-none">Testperiod</span>;
  }
  if (org.subscription_status === 'past_due') {
    return <span className="text-[10px] font-medium text-destructive leading-none">Betalning försenad</span>;
  }
  if (org.status === 'suspended') {
    return <span className="text-[10px] font-medium text-destructive leading-none">Inaktivt konto</span>;
  }
  return null;
}
