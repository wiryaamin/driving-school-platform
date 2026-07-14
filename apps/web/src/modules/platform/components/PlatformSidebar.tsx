import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  ScrollText,
  ShieldCheck,
  ShieldAlert,
  Headphones,
  Shield,
  Handshake,
  Rocket,
  LogOut,
  User,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { useSession } from '@shared/hooks/useSession.js';
import { useAuth } from '@core/auth/hooks.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  key:     string;
  labelSv: string;
  icon:    LucideIcon;
  path:    string;
}

interface NavGroup {
  label:    string;
  items:    NavItem[];
}

// ─── Navigation structure ─────────────────────────────────────────────────────

const PLATFORM_NAV_GROUPS: NavGroup[] = [
  {
    label: 'ÖVERSIKT',
    items: [
      { key: 'dashboard', labelSv: 'Översikt', icon: LayoutDashboard, path: '/platform/dashboard' },
    ],
  },
  {
    label: 'KUNDANSKAFFNING',
    items: [
      { key: 'demo-requests', labelSv: 'Demoförfrågningar', icon: Handshake, path: '/platform/demo-requests' },
      { key: 'tenant-onboarding', labelSv: 'Tenant Onboarding', icon: Rocket, path: '/platform/tenant-onboarding' },
    ],
  },
  {
    label: 'HANTERING',
    items: [
      { key: 'organizations',  labelSv: 'Organisationer',   icon: Building2,   path: '/platform/organizations' },
      { key: 'subscriptions',  labelSv: 'Prenumerationer',  icon: CreditCard,   path: '/platform/subscriptions' },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      { key: 'audit',    labelSv: 'Granskningslogg',    icon: ScrollText,  path: '/platform/audit' },
      { key: 'security', labelSv: 'Säkerhetshändelser', icon: ShieldAlert, path: '/platform/security' },
    ],
  },
  {
    label: 'SUPPORT',
    items: [
      { key: 'support', labelSv: 'Support Center', icon: Headphones, path: '/platform/support' },
    ],
  },
  {
    label: 'PLATTFORM',
    items: [
      { key: 'admins', labelSv: 'Plattformsadmins', icon: ShieldCheck, path: '/platform/admins' },
      { key: 'roles',  labelSv: 'Roller',            icon: Shield,     path: '/platform/roles' },
    ],
  },
];

// ─── Nav item ─────────────────────────────────────────────────────────────────

function SidebarNavItem({ item }: { item: NavItem }) {
  const location = useLocation();
  const isActive =
    location.pathname === item.path ||
    location.pathname.startsWith(`${item.path}/`);
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      className={cn(
        'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium',
        'transition-colors duration-150',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{item.labelSv}</span>
    </NavLink>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function PlatformSidebar() {
  const { user, profile } = useSession();
  const { signOut } = useAuth();

  const displayName = profile
    ? `${profile.first_name} ${profile.last_name}`
    : (user?.email ?? 'Platform Admin');

  const roleLabel =
    user?.role === 'platform_superadmin' ? 'Super Admin'
    : user?.role === 'platform_support'  ? 'Support'
    : user?.role === 'platform_billing'  ? 'Billing'
    : 'Platform Admin';

  return (
    <aside className="fixed left-0 top-0 h-full w-[280px] flex-col bg-sidebar border-r border-sidebar-border hidden md:flex z-40">

      {/* Workspace header */}
      <div className="flex items-center gap-3 h-[72px] px-4 border-b border-sidebar-border shrink-0">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={2}>
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <div className="min-w-0">
          <span className="text-sm font-semibold text-sidebar-primary-foreground block leading-tight truncate">
            TrafikskolaOS
          </span>
          <span className="text-[10px] font-semibold text-primary uppercase tracking-wider leading-none mt-0.5 block">
            Platform Admin
          </span>
        </div>
      </div>

      {/* Navigation groups */}
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto px-3 py-3 scrollbar-none space-y-4">
        {PLATFORM_NAV_GROUPS.map(group => (
          <div key={group.label}>
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest select-none text-sidebar-foreground/50">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(item => (
                <SidebarNavItem key={item.key} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer: role badge + identity + sign out */}
      <div className="px-3 pb-4 shrink-0 border-t border-sidebar-border pt-3">
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
            <User className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-sidebar-foreground truncate leading-tight">{displayName}</p>
            <p className="text-[10px] text-primary leading-tight truncate font-medium">{roleLabel}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-destructive hover:bg-sidebar-accent/50 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Logga ut</span>
        </button>
      </div>
    </aside>
  );
}
