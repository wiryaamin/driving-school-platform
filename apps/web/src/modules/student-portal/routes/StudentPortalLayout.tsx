import { useState, useEffect, createContext, useContext } from 'react';
import { Outlet, NavLink, useSearchParams, Link } from 'react-router-dom';
import {
  Home, CalendarPlus, MessageSquare, User,
  GraduationCap, Wallet, CalendarDays, Map,
  FileText, LogOut, Loader2, Shield, Bell, Headphones, ChevronRight,
} from 'lucide-react';
import {
  getStoredPortalSession, storePortalSession, clearPortalSession,
  validatePortalToken, usePortalNotifications, type PortalSession,
} from '../hooks/useStudentPortal.js';
import { cn } from '@/lib/utils.js';

// ─── Brand tokens ──────────────────────────────────────────────────────────────

const PRIMARY = '#684EFF';
const BG      = '#F7F8FC';

// ─── Context ──────────────────────────────────────────────────────────────────

const PortalSessionContext = createContext<PortalSession | null>(null);

export function usePortalSession(): PortalSession {
  const ctx = useContext(PortalSessionContext);
  if (!ctx) throw new Error('usePortalSession must be called inside StudentPortalLayout');
  return ctx;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function derivedStudentNumber(uuid: string): string {
  const hex = uuid.replace(/-/g, '').slice(0, 6);
  const num = (parseInt(hex, 16) % 90000) + 10000;
  return num.toString();
}

// ─── Sidebar navigation ───────────────────────────────────────────────────────

const SIDEBAR_NAV = [
  { to: '/portal',               label: 'Hem',            Icon: Home,          end: true  },
  { to: '/portal/bokningar',     label: 'Mina lektioner', Icon: CalendarDays,  end: false },
  { to: '/portal/teori',         label: 'Teori',          Icon: GraduationCap, end: false },
  { to: '/portal/meddelanden',   label: 'Meddelanden',    Icon: MessageSquare, end: false },
  { to: '/portal/dokument',      label: 'Mina dokument',  Icon: FileText,      end: false },
  { to: '/portal/konto',         label: 'Min ekonomi',    Icon: Wallet,        end: false },
  { to: '/portal/installningar', label: 'Profil',         Icon: User,          end: false },
] as const;

// ─── App Logo ─────────────────────────────────────────────────────────────────

function AppLogo({ orgName }: { orgName: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {/* 4-colour grid icon approximating the Trafikskola OS brand mark */}
      <div
        className="w-8 h-8 rounded-xl flex-shrink-0 overflow-hidden"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
          gap: '2px',
          padding: '5px',
          background: '#EEE9FF',
        }}
      >
        <div style={{ background: '#14B8A6', borderRadius: '2px' }} />
        <div style={{ background: '#FF8A58', borderRadius: '2px' }} />
        <div style={{ background: PRIMARY,   borderRadius: '2px' }} />
        <div style={{ background: '#F59E0B', borderRadius: '2px' }} />
      </div>
      <span className="text-gray-900 font-bold text-sm leading-tight truncate">{orgName}</span>
    </div>
  );
}

// ─── Desktop sidebar ──────────────────────────────────────────────────────────

function DesktopSidebar({ session }: { session: PortalSession }) {
  const { data: notifications } = usePortalNotifications();
  const msgCount = notifications?.length ?? 0;
  const initial  = (session.student_name ?? 'E')[0]?.toUpperCase() ?? 'E';
  const elevId   = derivedStudentNumber(session.student_id);

  function handleLogout() {
    clearPortalSession();
    window.location.href = '/portal';
  }

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-100">

      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <AppLogo orgName={session.organization_name} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {SIDEBAR_NAV.map(({ to, label, Icon, end }) => {
          const isMsg = to === '/portal/meddelanden';
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors',
                  isActive
                    ? 'font-semibold'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50',
                )
              }
              style={({ isActive }) =>
                isActive ? { background: `${PRIMARY}14`, color: PRIMARY } : {}
              }
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              <span className="flex-1">{label}</span>
              {isMsg && msgCount > 0 && (
                <span
                  className="min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                  style={{ background: PRIMARY }}
                >
                  {msgCount > 9 ? '9+' : msgCount}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Help */}
      <div className="px-3 pb-3">
        <div className="p-3 rounded-xl bg-gray-50 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-sm shrink-0">
            <Headphones className="w-4 h-4 text-gray-400" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-gray-700 text-xs font-semibold leading-tight">Behöver du hjälp?</p>
            <p className="text-gray-400 text-[10px] leading-tight mt-0.5">Kontakta din skola</p>
          </div>
        </div>
      </div>

      {/* User / logout */}
      <div className="px-3 pb-4 border-t border-gray-100 pt-3">
        <Link
          to="/portal/installningar"
          className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
            style={{ background: 'linear-gradient(135deg, #FF8A58 0%, #FF5722 100%)' }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-gray-800 text-sm font-semibold truncate">{session.student_name}</p>
            <p className="text-gray-400 text-[10px]">Elev-ID: {elevId}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 text-sm transition-colors mt-1"
        >
          <LogOut className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          Logga ut
        </button>
      </div>
    </div>
  );
}

// ─── Mobile bottom navigation ─────────────────────────────────────────────────

function MobileBottomNav() {
  const { data: notifications } = usePortalNotifications();
  const msgCount = notifications?.length ?? 0;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around px-1 h-[60px]">

        {/* Hem */}
        <NavLink
          to="/portal"
          end
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors min-w-[52px]',
              isActive ? '' : 'text-gray-400',
            )
          }
          style={({ isActive }) => isActive ? { color: PRIMARY } : {}}
        >
          <Home className="w-5 h-5" strokeWidth={1.75} />
          <span className="text-[10px] font-semibold">Hem</span>
        </NavLink>

        {/* Resa */}
        <NavLink
          to="/portal/korkortsresa"
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors min-w-[52px]',
              isActive ? '' : 'text-gray-400',
            )
          }
          style={({ isActive }) => isActive ? { color: PRIMARY } : {}}
        >
          <Map className="w-5 h-5" strokeWidth={1.75} />
          <span className="text-[10px] font-semibold">Resa</span>
        </NavLink>

        {/* Boka — centre FAB */}
        <Link
          to="/portal/boka"
          className="flex flex-col items-center gap-0.5 -mt-3"
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
            style={{ background: PRIMARY }}
          >
            <CalendarPlus className="w-5 h-5 text-white" strokeWidth={2} />
          </div>
          <span
            className="text-[10px] font-semibold"
            style={{ color: PRIMARY }}
          >
            Boka
          </span>
        </Link>

        {/* Meddelanden */}
        <NavLink
          to="/portal/meddelanden"
          className={({ isActive }) =>
            cn(
              'relative flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors min-w-[52px]',
              isActive ? '' : 'text-gray-400',
            )
          }
          style={({ isActive }) => isActive ? { color: PRIMARY } : {}}
        >
          <div className="relative">
            <MessageSquare className="w-5 h-5" strokeWidth={1.75} />
            {msgCount > 0 && (
              <span
                className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                style={{ background: '#FF8A58' }}
              >
                {msgCount > 9 ? '9+' : msgCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-semibold">Meddelanden</span>
        </NavLink>

        {/* Profil */}
        <NavLink
          to="/portal/konto"
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors min-w-[52px]',
              isActive ? '' : 'text-gray-400',
            )
          }
          style={({ isActive }) => isActive ? { color: PRIMARY } : {}}
        >
          <User className="w-5 h-5" strokeWidth={1.75} />
          <span className="text-[10px] font-semibold">Profil</span>
        </NavLink>

      </div>
    </nav>
  );
}

// ─── Error / loading screens ──────────────────────────────────────────────────

function InvalidLinkScreen({ message }: { message: string }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ background: PRIMARY }}
    >
      <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-5">
        <Shield className="w-8 h-8 text-white" />
      </div>
      <h1 className="text-xl font-bold text-white mb-2">Länken är inte giltig</h1>
      <p className="text-white/70 text-sm max-w-xs leading-relaxed mb-4">{message}</p>
      <p className="text-white/50 text-xs">
        Kontakta din trafikskola för att få en ny inloggningslänk.
      </p>
    </div>
  );
}

function PortalLoadingScreen() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: PRIMARY }}
    >
      <Loader2 className="w-8 h-8 animate-spin text-white" />
    </div>
  );
}

// ─── Desktop top bar ──────────────────────────────────────────────────────────

function DesktopTopBar({ session }: { session: PortalSession }) {
  const { data: notifications } = usePortalNotifications();
  const notifCount = notifications?.length ?? 0;
  const firstName  = session.student_name.split(' ')[0] ?? session.student_name;

  return (
    <div className="sticky top-0 z-20 flex items-center justify-between px-8 py-4 bg-white border-b border-gray-100">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Hej {firstName}! 👋</h1>
        <p className="text-gray-400 text-sm mt-0.5">Bra jobbat! Du är på rätt väg.</p>
      </div>
      <div className="flex items-center gap-3">
        <Link
          to="/portal/meddelanden"
          className="relative p-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <Bell className="w-4 h-4 text-gray-500" strokeWidth={1.75} />
          {notifCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
              style={{ background: '#FF8A58' }}
            >
              {notifCount > 9 ? '9+' : notifCount}
            </span>
          )}
        </Link>
        <Link
          to="/portal/boka"
          className="px-5 py-2 rounded-full text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: PRIMARY }}
        >
          Boka lektion
        </Link>
      </div>
    </div>
  );
}

// ─── StudentPortalLayout ──────────────────────────────────────────────────────

export function StudentPortalLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [session,    setSession]    = useState<PortalSession | null>(() => getStoredPortalSession());
  const [validating, setValidating] = useState(false);
  const [linkError,  setLinkError]  = useState<string | null>(null);

  const tokenParam = searchParams.get('token');

  useEffect(() => {
    const handleExpired = () => setSession(null);
    window.addEventListener('portalSessionExpired', handleExpired);
    return () => window.removeEventListener('portalSessionExpired', handleExpired);
  }, []);

  useEffect(() => {
    if (!tokenParam) return;

    setValidating(true);
    setLinkError(null);

    validatePortalToken(tokenParam)
      .then((result) => {
        const newSession: PortalSession = {
          token:             tokenParam,
          student_id:        result.student.id,
          student_name:      `${result.student.first_name} ${result.student.last_name}`,
          organization_id:   result.organization.id,
          organization_name: result.organization.name,
          expires_at:        result.expires_at,
        };
        storePortalSession(newSession);
        setSession(newSession);

        const next = new URLSearchParams(searchParams);
        next.delete('token');
        setSearchParams(next, { replace: true });
      })
      .catch(() => {
        setLinkError('Länken är ogiltig eller har gått ut. Kontakta din trafikskola för en ny länk.');
      })
      .finally(() => setValidating(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenParam]);

  if (validating) return <PortalLoadingScreen />;
  if (linkError)  return <InvalidLinkScreen message={linkError} />;
  if (!session) {
    return (
      <InvalidLinkScreen message="Du har inte en giltig aktiv session. Klicka på inloggningslänken som skickades till dig." />
    );
  }

  return (
    <PortalSessionContext.Provider value={session}>
      <div className="min-h-screen" style={{ background: BG }}>

        {/* ── Desktop ──────────────────────────────────────────────────────── */}
        <div className="hidden lg:flex min-h-screen">
          <aside className="fixed inset-y-0 left-0 w-56 z-30 flex flex-col">
            <DesktopSidebar session={session} />
          </aside>
          <main className="ml-56 flex-1 min-h-screen" style={{ background: BG }}>
            <DesktopTopBar session={session} />
            <div className="px-8 py-6 max-w-5xl mx-auto">
              <Outlet />
            </div>
          </main>
        </div>

        {/* ── Mobile ───────────────────────────────────────────────────────── */}
        <div className="lg:hidden flex flex-col min-h-screen">
          <main className="flex-1 pb-[76px]" style={{ background: BG }}>
            <div className="max-w-lg mx-auto px-4 py-5">
              <Outlet />
            </div>
          </main>
          <MobileBottomNav />
        </div>

      </div>
    </PortalSessionContext.Provider>
  );
}
