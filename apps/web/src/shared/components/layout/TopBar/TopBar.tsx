import { Bell, ChevronDown, ExternalLink, LifeBuoy, LogOut, MapPin, Menu, MessageCircle, MessageSquare, Monitor, Moon, Globe, History, Phone, Search, Settings, Sun, User, ShoppingCart, Mail, CheckCircle, XCircle, Clock, Newspaper, HelpCircle, Image as ImageIcon, Store, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useLocation, NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils.js';
import { useSessionStore } from '@core/store/session.store.js';
import { useAuth } from '@core/auth/hooks.js';
import { useUiStore } from '@core/store/ui.store.js';
import { useNotificationDot, useRecentActivity } from '@shared/hooks/useNotificationBell.js';
import type { Notification } from '@shared/hooks/useNotificationBell.js';
import { useLocations } from '@modules/scheduling/hooks/useLocations.js';
import { useFavorites, useAddFavorite, useRemoveFavorite } from '@shared/hooks/useFavorites.js';

// ─── Location Picker (Gap 8) ──────────────────────────────────────────────────

const LOCATION_KEY = 'platform_active_location';

function LocationPicker() {
  const { data: locations = [] } = useLocations();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(() => {
    try { return localStorage.getItem(LOCATION_KEY); } catch { return null; }
  });

  if (locations.length <= 1) return null;

  const active = locations.find(l => l.id === activeId) ?? locations.find(l => l.is_primary) ?? locations[0];

  function select(id: string | null) {
    setActiveId(id);
    try {
      if (id) localStorage.setItem(LOCATION_KEY, id);
      else localStorage.removeItem(LOCATION_KEY);
    } catch { /* ignore */ }
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'hidden sm:flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium border border-border transition-colors',
          open ? 'bg-accent text-foreground border-primary/50' : 'bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        <MapPin className="w-3 h-3 shrink-0" />
        <span className="max-w-[120px] truncate">{active?.name ?? 'Välj filial'}</span>
        <ChevronDown className={cn('w-3 h-3 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-full mt-1 w-52 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden py-1">
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Filial</p>
            <button
              type="button"
              onClick={() => select(null)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent',
                !activeId ? 'text-primary font-medium' : 'text-popover-foreground',
              )}
            >
              Alla filialer
            </button>
            {locations.map(loc => (
              <button
                key={loc.id}
                type="button"
                onClick={() => select(loc.id)}
                className={cn(
                  'w-full flex items-start gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent text-left',
                  activeId === loc.id ? 'text-primary font-medium' : 'text-popover-foreground',
                )}
              >
                <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="leading-tight">{loc.name}</p>
                  <p className="text-[10px] text-muted-foreground">{loc.city}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Favorites ────────────────────────────────────────────────────────────────

function prettifyPath(path: string): string {
  const last = path.split('/').filter(Boolean).pop() ?? path;
  return last.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Startsida';
}

function FavoritesMenu() {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const { data: favorites = [] } = useFavorites();
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();
  const navigate = useNavigate();
  const location = useLocation();

  const currentPath = location.pathname;
  const alreadyFavorited = favorites.some((f) => f.path === currentPath);

  function startAdding() {
    setLabel(prettifyPath(currentPath));
    setAdding(true);
  }

  async function handleAdd() {
    if (!label.trim()) return;
    try {
      await addFavorite.mutateAsync({ label: label.trim(), path: currentPath });
      setAdding(false);
    } catch {
      // Unique constraint (already favorited) or transient error — either
      // way, closing the mini-form is the right recovery, no page reload needed.
      setAdding(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative w-9 h-9 rounded-lg flex items-center justify-center',
          'text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
          open && 'text-foreground bg-accent',
        )}
        aria-label="Favoriter"
      >
        <Star className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setAdding(false); }} aria-hidden />
          <div className="absolute right-0 top-full mt-1 w-72 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">Favoriter</p>
              {!alreadyFavorited && !adding && (
                <button
                  type="button"
                  onClick={startAdding}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  + Lägg till denna sida
                </button>
              )}
            </div>

            {adding && (
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border">
                <input
                  autoFocus
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); if (e.key === 'Escape') setAdding(false); }}
                  className="flex-1 h-7 px-2 text-xs rounded-md border border-input bg-background"
                  placeholder="Namn på favorit"
                />
                <button
                  type="button"
                  onClick={() => void handleAdd()}
                  disabled={addFavorite.isPending}
                  className="h-7 px-2 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Spara
                </button>
              </div>
            )}

            {favorites.length === 0 && !adding ? (
              <div className="px-3 py-6 text-center">
                <Star className="w-5 h-5 text-muted-foreground mx-auto mb-1.5" />
                <p className="text-xs text-muted-foreground">Inga favoriter ännu</p>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto py-1">
                {favorites.map((f) => (
                  <div key={f.id} className="group flex items-center gap-1 px-1">
                    <button
                      type="button"
                      onClick={() => { setOpen(false); navigate(f.path); }}
                      className="flex-1 min-w-0 flex items-center gap-2 px-2 py-2 text-sm text-popover-foreground hover:bg-accent rounded-md transition-colors text-left truncate"
                    >
                      {f.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFavorite.mutate(f.id)}
                      className="w-6 h-6 shrink-0 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                      aria-label="Ta bort favorit"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function TopBar() {
  const { user, profile } = useSessionStore();
  const { toggleMobileMenu, theme, toggleTheme } = useUiStore();

  function openCommandPalette() {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
    );
  }

  return (
    <header
      className="h-[52px] bg-background border-b border-border flex items-center px-4 gap-2 fixed top-0 right-0 z-30 left-0 md:left-[280px]"
    >
      {/* Mobile hamburger — only visible on mobile */}
      <button
        className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
        onClick={toggleMobileMenu}
        aria-label="Öppna meny"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Left section: location picker + ⌘K search pill */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <LocationPicker />
        <button
          type="button"
          onClick={openCommandPalette}
          className="hidden sm:flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium border border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
          aria-label="Sök eller navigera (Ctrl+K)"
        >
          <Search className="w-3 h-3 shrink-0" />
          <span className="hidden md:inline">Sök...</span>
          <kbd className="ml-0.5 text-[10px] font-mono bg-background border border-border rounded px-1 py-px leading-none">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Kassa quick-access */}
        <NavLink
          to="/finance/cash"
          className={({ isActive }) =>
            cn(
              'hidden sm:flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors',
              isActive
                ? 'bg-amber-500 text-white'
                : 'bg-amber-400 hover:bg-amber-500 text-white'
            )
          }
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          Kassa
        </NavLink>

        <div className="flex items-center gap-1">
          {/* Dark mode toggle */}
          <button
            className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Ljust läge' : 'Mörkt läge'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <FavoritesMenu />
          <NotificationBell />
          <HelpSupportMenu />

          <UserMenu
            displayName={profile ? `${profile.first_name} ${profile.last_name}` : (user?.email ?? '')}
            email={user?.email ?? ''}
            role={user?.role ?? ''}
          />
        </div>
      </div>
    </header>
  );
}

// ─── Notification Bell ────────────────────────────────────────────────────────

const CHANNEL_ICON: Record<string, typeof Mail> = {
  email: Mail,
  sms:   MessageSquare,
};

const STATUS_ICON: Record<string, { icon: typeof CheckCircle; cls: string }> = {
  sent:      { icon: CheckCircle, cls: 'text-green-500'  },
  failed:    { icon: XCircle,     cls: 'text-destructive' },
  pending:   { icon: Clock,       cls: 'text-amber-500'  },
  cancelled: { icon: XCircle,     cls: 'text-muted-foreground' },
};

function notifRoute(n: Notification): string | null {
  if (!n.reference_type || !n.reference_id) return null;
  if (n.reference_type === 'student')             return `/students/${n.reference_id}`;
  if (n.reference_type === 'invoice')              return `/finance/invoices/${n.reference_id}`;
  if (n.reference_type === 'booking')              return '/scheduling';
  if (n.reference_type === 'slot')                 return '/scheduling';
  if (n.reference_type === 'regulatory_workflow')  return `/regulatory?open=${n.reference_id}`;
  return null;
}

function NotifRow({ n, onNavigate }: { n: Notification; onNavigate: (path: string) => void }) {
  const ChannelIcon = CHANNEL_ICON[n.channel] ?? Mail;
  const status      = STATUS_ICON[n.status] ?? { icon: Clock as typeof CheckCircle, cls: 'text-amber-500' };
  const StatusIcon  = status.icon;
  const when        = new Date(n.created_at).toLocaleString('sv-SE', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  const route = notifRoute(n);

  const content = (
    <>
      <ChannelIcon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">
          {n.subject ?? n.template_key ?? 'Notis'}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{when}</p>
      </div>
      <StatusIcon className={cn('w-3.5 h-3.5 shrink-0 mt-0.5', status.cls)} />
    </>
  );

  if (route) {
    return (
      <button
        type="button"
        onClick={() => onNavigate(route)}
        className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-accent/40 transition-colors text-left"
      >
        {content}
      </button>
    );
  }
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5">
      {content}
    </div>
  );
}

function NotificationBell() {
  const hasUnread = useNotificationDot();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useRecentActivity(10);
  const navigate = useNavigate();

  const notifications = data?.data ?? [];
  const failedCount   = notifications.filter(n => n.status === 'failed').length;

  function handleNotifNavigate(path: string) {
    setOpen(false);
    navigate(path);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'relative w-9 h-9 rounded-lg flex items-center justify-center',
          'text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
          (hasUnread || open) && 'text-foreground bg-accent'
        )}
        aria-label="Notiser"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="w-4 h-4" />
        {hasUnread && !open && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" aria-hidden />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-full mt-1 w-72 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
              <p className="text-sm font-semibold text-popover-foreground">Notishistorik</p>
              {failedCount > 0 && (
                <span className="text-[10px] font-semibold bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">
                  {failedCount} misslyckades
                </span>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
              {isLoading && (
                <div className="px-3 py-6 text-center">
                  <p className="text-xs text-muted-foreground">Laddar notiser...</p>
                </div>
              )}
              {!isLoading && notifications.length === 0 && (
                <div className="px-3 py-6 text-center">
                  <Bell className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Inga notiser de senaste dagarna</p>
                </div>
              )}
              {notifications.map(n => <NotifRow key={n.id} n={n} onNavigate={handleNotifNavigate} />)}
            </div>

            <div className="border-t border-border px-3 py-2">
              <p className="text-[10px] text-muted-foreground text-center">
                Visar de {notifications.length} senaste notiserna
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Help & Support Menu ──────────────────────────────────────────────────────

function HelpSupportMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const HELP_GROUPS: Array<{ heading?: string; items: Array<{
    key:         string;
    labelSv:     string;
    icon:        typeof LifeBuoy;
    href?:       string;
    tel?:        string;
    path?:       string;
    external?:   boolean;
    comingSoon?: boolean;
  }> }> = [
    {
      items: [
        { key: 'help',      labelSv: 'Hjälpcenter',    icon: LifeBuoy,      comingSoon: true },
        { key: 'feedback',  labelSv: 'Feedbackportal',  icon: MessageSquare, comingSoon: true },
        // Ändringslogg is the Announcements/Nyheter feature under a different
        // name — same page, not a separate coming-soon item (see 'news' below).
        { key: 'changelog', labelSv: 'Ändringslogg',   icon: History,       path: '/nyheter' },
      ],
    },
    {
      items: [
        { key: 'chat',       labelSv: 'Chatta',         icon: MessageCircle, comingSoon: true },
        { key: 'facebook',   labelSv: 'Facebook-grupp', icon: Globe,         href: 'https://www.facebook.com/', external: true },
        { key: 'teamviewer', labelSv: 'TeamViewer',     icon: Monitor,       href: 'https://www.teamviewer.com/', external: true },
      ],
    },
    {
      items: [
        { key: 'phone', labelSv: '08-38 33 30', icon: Phone, tel: '+4683833330' },
      ],
    },
    {
      heading: 'Resurser',
      items: [
        { key: 'news',    labelSv: 'Nyheter',        icon: Newspaper,  path: '/nyheter' },
        { key: 'faq',     labelSv: 'Vanliga frågor', icon: HelpCircle, comingSoon: true },
        { key: 'gallery', labelSv: 'Bildgalleri',    icon: ImageIcon,  comingSoon: true },
        { key: 'shop',    labelSv: 'Köp online',     icon: Store,      comingSoon: true },
      ],
    },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
          'text-muted-foreground hover:text-foreground hover:bg-accent',
          open && 'text-foreground bg-accent',
        )}
        aria-label="Hjälp och support"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <LifeBuoy className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-full mt-1 w-60 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden py-1">
            <div className="px-3 py-2 border-b border-border mb-1">
              <p className="text-xs font-semibold text-popover-foreground">Hjälp & Support</p>
            </div>

            {HELP_GROUPS.map((group, gi) => (
              <div key={gi}>
                {gi > 0 && <div className="mx-2 my-1 h-px bg-border" />}
                {group.heading && (
                  <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    {group.heading}
                  </p>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const baseClass = cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent text-popover-foreground',
                    item.comingSoon && 'opacity-40 cursor-default hover:bg-transparent',
                  );

                  if (item.comingSoon) {
                    return (
                      <div key={item.key} className={baseClass} title="Kommer snart" aria-disabled="true">
                        <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1">{item.labelSv}</span>
                      </div>
                    );
                  }

                  if (item.path) {
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => { setOpen(false); navigate(item.path!); }}
                        className={baseClass}
                      >
                        <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 text-left">{item.labelSv}</span>
                      </button>
                    );
                  }

                  if (item.tel) {
                    return (
                      <a key={item.key} href={`tel:${item.tel}`} onClick={() => setOpen(false)} className={baseClass}>
                        <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 font-mono text-xs">{item.labelSv}</span>
                      </a>
                    );
                  }

                  if (item.href) {
                    return (
                      <a
                        key={item.key}
                        href={item.href}
                        target={item.external ? '_blank' : undefined}
                        rel={item.external ? 'noopener noreferrer' : undefined}
                        onClick={() => setOpen(false)}
                        className={baseClass}
                      >
                        <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1">{item.labelSv}</span>
                        {item.external && <ExternalLink className="w-3 h-3 shrink-0 opacity-40" />}
                      </a>
                    );
                  }


                  return null;
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
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
  const navigate = useNavigate();
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
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-primary-foreground">{initials || '?'}</span>
        </div>
        <span className="hidden sm:block truncate max-w-[120px]">{displayName}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-full mt-1 w-56 bg-popover border border-border rounded-xl shadow-lg z-50 py-1 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-border">
              <p className="text-sm font-semibold text-popover-foreground truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{email}</p>
              {role && (
                <p className="text-xs text-primary mt-0.5">{ROLE_LABELS[role] ?? role}</p>
              )}
            </div>
            <div className="py-1">
              <MenuButton icon={User} label="Min profil" onClick={() => { setOpen(false); navigate('/profile'); }} />
              <MenuButton icon={Settings} label="Inställningar" onClick={() => { setOpen(false); navigate('/settings'); }} />
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
