import { Bell, ChevronDown, LogOut, Settings, User } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { useSessionStore } from '@core/store/session.store.js';
import { useAuth } from '@core/auth/hooks.js';
import { useUiStore } from '@core/store/ui.store.js';
import { useState } from 'react';

/**
 * TopBar — the persistent header bar across all authenticated pages.
 * Contains: organization context, notifications, and user menu.
 */
export function TopBar() {
  const { user, profile, organization } = useSessionStore();
  const { sidebarCollapsed } = useUiStore();

  return (
    <header
      className={cn(
        'h-14 bg-background border-b border-border',
        'flex items-center px-6 gap-4',
        'fixed top-0 right-0 z-30 transition-all duration-300',
        sidebarCollapsed ? 'left-16' : 'left-64'
      )}
    >
      {/* Organization + Location Context */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">
          {organization?.name ?? '—'}
        </p>
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-2 shrink-0">
        <NotificationBell />
        <UserMenu
          displayName={profile ? `${profile.first_name} ${profile.last_name}` : (user?.email ?? '')}
          email={user?.email ?? ''}
          role={user?.role ?? ''}
        />
      </div>
    </header>
  );
}

// ─── Notification Bell ────────────────────────────────────────────────────────

function NotificationBell() {
  const [hasUnread] = useState(false); // Wired to realtime in Phase 2

  return (
    <button
      className={cn(
        'relative w-9 h-9 rounded-lg flex items-center justify-center',
        'text-muted-foreground hover:text-foreground hover:bg-accent',
        'transition-colors'
      )}
      aria-label="Notiser"
    >
      <Bell className="w-4 h-4" />
      {hasUnread && (
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
      )}
    </button>
  );
}

// ─── User Menu ────────────────────────────────────────────────────────────────

interface UserMenuProps {
  displayName: string;
  email: string;
  role: string;
}

function UserMenu({ displayName, email, role }: UserMenuProps) {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');

  const ROLE_LABELS: Record<string, string> = {
    org_owner: 'Ägare',
    org_admin: 'Administratör',
    org_manager: 'Chef',
    instructor: 'Lärare',
    instructor_senior: 'Lärare (Senior)',
    receptionist: 'Receptionist',
    finance_admin: 'Ekonomi',
    student_admin: 'Elevadmin',
    reporting_viewer: 'Rapportläsare',
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 px-2 py-1.5 rounded-lg',
          'hover:bg-accent transition-colors',
          'text-sm font-medium text-foreground'
        )}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-primary-foreground">{initials || '?'}</span>
        </div>
        <span className="hidden sm:block truncate max-w-[120px]">{displayName}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-full mt-1 w-56 bg-popover border border-border rounded-xl shadow-lg z-50 py-1 overflow-hidden">
            {/* User info */}
            <div className="px-3 py-2.5 border-b border-border">
              <p className="text-sm font-semibold text-popover-foreground truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{email}</p>
              {role && (
                <p className="text-xs text-primary mt-0.5">{ROLE_LABELS[role] ?? role}</p>
              )}
            </div>

            {/* Menu items */}
            <div className="py-1">
              <MenuButton icon={User} label="Min profil" onClick={() => setOpen(false)} />
              <MenuButton icon={Settings} label="Inställningar" onClick={() => setOpen(false)} />
            </div>

            <div className="border-t border-border py-1">
              <MenuButton
                icon={LogOut}
                label="Logga ut"
                onClick={() => { setOpen(false); void signOut(); }}
                destructive
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: typeof User;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 text-sm',
        'transition-colors hover:bg-accent',
        destructive ? 'text-destructive hover:text-destructive' : 'text-popover-foreground'
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </button>
  );
}
