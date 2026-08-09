import { Link, NavLink, useLocation } from 'react-router-dom';
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
  Compass,
  Megaphone,
  LogOut,
  User,
  Cpu,
  Mail,
  FileCheck2,
  LifeBuoy,
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

// ─── Persona-based information architecture ──────────────────────────────────
//
// Re-evaluated against how each operational persona actually works, not how
// the underlying pages happen to be implemented:
//
//   Platform Owner   → Översikt (KPIs) + Organisationer (the whole customer
//                       lifecycle, acquisition through live) + Plattform
//                       (own team/roles — low-frequency, kept last).
//   Customer Success → Organisationer owns this fully: demo requests, tenant
//                       onboarding, and the live org itself were three
//                       separate top-level groups before, forcing CS to jump
//                       groups mid-workflow for what is one continuous
//                       "where is this customer in their journey" question.
//                       Merged into one.
//   Finance           → Fakturering, untouched — a Finance persona wants
//                       nothing else in view, so it stays a focused,
//                       single-item workspace rather than being folded into
//                       Organisationer.
//   Operations        → Drift now holds Drift + Kommunikation + Återställning
//                       together. These were three separate top-level groups
//                       (Driftcenter, Kommunikation, and Återställning living
//                       inside Driftcenter) even though an Operations person
//                       checking system health looks at queue backlog,
//                       message deliverability, and the retry queue in the
//                       same sitting — same underlying question ("is
//                       anything broken right now"), asked three different
//                       ways.
//   Support           → Support Center, untouched (internal notes/timeline).
//                       Per-customer recovery actions already live on
//                       Organisationer's own org detail (Drift tab) where a
//                       support agent is already working a specific
//                       customer's issue — no separate stop required.
//   Security          → Säkerhetscenter, untouched — already correctly
//                       combined (identity/security events + audit trail).
//   Compliance        → Efterlevnad, untouched — kept separate from Security
//                       deliberately: the prompt treats Security and
//                       Compliance as distinct personas, and conflating them
//                       here would blur two different jobs-to-be-done.
//
// Nyheter (Announcements) moved from Support into Plattform: writing a
// platform-wide customer announcement is a Platform Owner/administrative
// task, not a "help this one customer" Support task — the two were sharing
// a group only because both involve "communication," which isn't the same
// job.
//
// Net effect: 10 groups → 8, every item still points at the exact same
// existing page/route as before (backward compatible), nothing new built.

const PLATFORM_NAV_GROUPS: NavGroup[] = [
  {
    label: 'ÖVERSIKT',
    items: [
      { key: 'dashboard', labelSv: 'Översikt', icon: LayoutDashboard, path: '/platform/dashboard' },
    ],
  },
  {
    label: 'ORGANISATIONER',
    items: [
      { key: 'onboarding', labelSv: 'Onboarding Command Center', icon: Compass, path: '/platform/onboarding' },
      { key: 'demo-requests', labelSv: 'Demoförfrågningar', icon: Handshake, path: '/platform/demo-requests' },
      { key: 'trial-requests', labelSv: 'Testperiodsförfrågningar', icon: Mail, path: '/platform/trial-requests' },
      { key: 'tenant-onboarding', labelSv: 'Tenant Onboarding', icon: Rocket, path: '/platform/tenant-onboarding' },
      { key: 'organizations',  labelSv: 'Organisationer',   icon: Building2,   path: '/platform/organizations' },
    ],
  },
  {
    label: 'FAKTURERING',
    items: [
      { key: 'subscriptions',  labelSv: 'Prenumerationer',  icon: CreditCard, path: '/platform/subscriptions' },
    ],
  },
  {
    label: 'SÄKERHETSCENTER',
    items: [
      { key: 'security', labelSv: 'Säkerhetshändelser', icon: ShieldAlert, path: '/platform/security' },
      { key: 'audit',    labelSv: 'Granskningslogg',    icon: ScrollText,  path: '/platform/audit' },
    ],
  },
  {
    label: 'EFTERLEVNAD',
    items: [
      { key: 'compliance', labelSv: 'Efterlevnad', icon: FileCheck2, path: '/platform/compliance' },
    ],
  },
  {
    label: 'DRIFT',
    items: [
      { key: 'operations', labelSv: 'Drift', icon: Cpu, path: '/platform/operations' },
      { key: 'communications', labelSv: 'Kommunikation', icon: Mail, path: '/platform/communications' },
      { key: 'recovery',   labelSv: 'Återställning', icon: LifeBuoy, path: '/platform/recovery' },
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
      { key: 'announcements', labelSv: 'Nyheter (TABSnytt)', icon: Megaphone, path: '/platform/announcements' },
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
        <Link to="/platform/dashboard" className="shrink-0 block rounded-md bg-white px-2 py-1.5">
          <span className="h-4 w-[100px] overflow-hidden block">
            <img
              src="/logo-v2.png"
              alt="Trafikcloud"
              className="block h-[75px] w-[112px] max-w-none -ml-[8px] -mt-[29px]"
            />
          </span>
        </Link>
        <span className="text-[10px] font-semibold text-primary uppercase tracking-wider leading-none block">
          Platform Admin
        </span>
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
