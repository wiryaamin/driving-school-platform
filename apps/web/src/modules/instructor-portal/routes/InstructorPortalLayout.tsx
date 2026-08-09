import { useState, useEffect, createContext, useContext } from 'react';
import { Outlet, NavLink, useSearchParams, Link } from 'react-router-dom';
import {
  Home, CalendarDays, CalendarCheck, Users, ChartBar,
  Settings, Menu, X, LogOut, Loader2, Shield,
  CheckSquare, Headphones, Bell, ChevronRight,
} from 'lucide-react';
import {
  getStoredInstructorSession, storeInstructorSession, clearInstructorSession,
  validateInstructorToken, type InstructorPortalSession,
} from '../hooks/useInstructorPortal.js';
import { cn } from '@/lib/utils.js';

// ─── Demo session (dev/preview when backend is not yet deployed) ──────────────

const DEMO_SESSION: InstructorPortalSession = {
  token:             'demo',
  instructor_id:     'demo-instructor-id',
  instructor_name:   'Erik Lindqvist',
  organization_id:   'demo-org-id',
  organization_name: 'Trafikskola OS',
  expires_at:        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

// ─── Brand color ──────────────────────────────────────────────────────────────

const BRAND   = '#1055C9'; // mobile blue
const PRIMARY = '#684EFF'; // desktop purple

// ─── Context ──────────────────────────────────────────────────────────────────

const InstructorPortalContext = createContext<InstructorPortalSession | null>(null);

export function useInstructorPortalSession(): InstructorPortalSession {
  const ctx = useContext(InstructorPortalContext);
  if (!ctx) throw new Error('useInstructorPortalSession must be called inside InstructorPortalLayout');
  return ctx;
}

// ─── Navigation ───────────────────────────────────────────────────────────────

// Meddelanden and Ekonomi removed from pilot nav (2026-08-06 Portal UX
// review): neither has a backing route/feature — both fell through to the
// admin app's catch-all before the routing fix, and even now would only
// show a generic "Under uppbyggnad" placeholder with no pilot business
// value. Re-add once each has a real implementation.
const NAV_ITEMS = [
  { to: '/instructor-portal',                 label: 'Översikt',       Icon: Home,          end: true,  badge: 0 },
  { to: '/instructor-portal/elever',          label: 'Elever',         Icon: Users,         end: false, badge: 0 },
  { to: '/instructor-portal/bokningar',       label: 'Lektioner',      Icon: CalendarCheck, end: false, badge: 0 },
  { to: '/instructor-portal/utbildningskort', label: 'Uppgifter',      Icon: CheckSquare,   end: false, badge: 0 },
  { to: '/instructor-portal/schema',          label: 'Kalender',       Icon: CalendarDays,  end: false, badge: 0 },
  { to: '/instructor-portal/statistik',       label: 'Rapporter',      Icon: ChartBar,      end: false, badge: 0 },
  { to: '/instructor-portal/installningar',   label: 'Inställningar',  Icon: Settings,      end: false, badge: 0 },
] as const;

// ─── Sidebar content ──────────────────────────────────────────────────────────

function SidebarContent({
  session,
  onClose,
}: {
  session: InstructorPortalSession;
  onClose?: () => void;
}) {
  function handleLogout() {
    clearInstructorSession();
    window.location.href = '/instructor-portal';
  }

  const initial = (session.instructor_name ?? 'L')[0]?.toUpperCase() ?? 'L';

  return (
    <div className="flex flex-col h-full" style={{ background: '#FAFBFF', borderRight: '1px solid #E5E7EB' }}>

      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: PRIMARY }}>
            <Shield className="w-4 h-4 text-white" strokeWidth={2} />
          </div>
          <span className="text-gray-900 font-bold text-base leading-tight">
            {session.organization_name}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {NAV_ITEMS.map(({ to, label, Icon, end, badge }) => (
          <NavLink
            key={`${to}-${label}`}
            to={to}
            end={end}
            onClick={onClose}
          >
            {({ isActive }) => (
              <div
                className={cn(
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer',
                  isActive
                    ? 'text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-white',
                )}
                style={isActive ? { background: PRIMARY } : {}}
              >
                <Icon className="w-5 h-5 shrink-0" strokeWidth={1.75} />
                <span className="flex-1">{label}</span>
                {badge > 0 && (
                  <span
                    className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0"
                    style={{
                      background: isActive ? 'rgba(255,255,255,0.25)' : PRIMARY,
                      color: 'white',
                    }}
                  >
                    {badge}
                  </span>
                )}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Help section */}
      <div className="px-3 pt-2 pb-2 shrink-0">
        <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-gray-50 border border-gray-100">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <Headphones className="w-4 h-4 text-blue-600" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="text-gray-800 text-sm font-semibold leading-tight">Behöver du hjälp?</p>
            <p className="text-gray-400 text-xs">Kontakta supporten</p>
          </div>
        </div>
      </div>

      {/* User profile + logout */}
      <div className="px-3 pb-4 pt-1 border-t border-gray-100 space-y-0.5 shrink-0">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm"
            style={{ background: PRIMARY }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-gray-900 text-sm font-semibold truncate">{session.instructor_name}</p>
            <p className="text-gray-400 text-xs">Instruktör</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 text-sm transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Logga ut
        </button>
      </div>
    </div>
  );
}

// ─── Error / loading screens ──────────────────────────────────────────────────

function InvalidLinkScreen({ message }: { message: string }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ background: BRAND }}
    >
      <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-5">
        <Shield className="w-8 h-8 text-white" />
      </div>
      <h1 className="text-xl font-bold text-white mb-2">Länken är inte giltig</h1>
      <p className="text-white/70 text-sm max-w-xs leading-relaxed mb-4">{message}</p>
      <p className="text-white/50 text-xs mb-8">
        Kontakta din trafikskola för att få en ny inloggningslänk.
      </p>
      <a
        href="/instructor-portal?demo=true"
        className="px-5 py-2.5 rounded-full text-sm font-bold bg-white/15 text-white border border-white/30 hover:bg-white/25 transition-colors"
      >
        Förhandsvisning (demo)
      </a>
    </div>
  );
}

function PortalLoadingScreen() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: BRAND }}
    >
      <Loader2 className="w-8 h-8 animate-spin text-white" />
    </div>
  );
}

// ─── Bottom Tab Bar ───────────────────────────────────────────────────────────

function BottomTabBar({ onMenuOpen }: { onMenuOpen: () => void }) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-30 lg:hidden"
      style={{ background: 'white', borderTop: '1px solid #F0F0F0', boxShadow: '0 -4px 20px rgba(0,0,0,0.06)' }}
    >
      <div className="flex items-end justify-around px-2 pt-1 pb-safe" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>

        {/* Översikt */}
        <NavLink to="/instructor-portal" end>
          {({ isActive }) => (
            <div className="flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-[52px]">
              <Home className="w-6 h-6" style={{ color: isActive ? PRIMARY : '#9CA3AF' }} strokeWidth={1.75} />
              <span className="text-[10px] font-semibold" style={{ color: isActive ? PRIMARY : '#9CA3AF' }}>Översikt</span>
            </div>
          )}
        </NavLink>

        {/* Elever */}
        <NavLink to="/instructor-portal/elever" end={false}>
          {({ isActive }) => (
            <div className="flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-[52px]">
              <Users className="w-6 h-6" style={{ color: isActive ? PRIMARY : '#9CA3AF' }} strokeWidth={1.75} />
              <span className="text-[10px] font-semibold" style={{ color: isActive ? PRIMARY : '#9CA3AF' }}>Elever</span>
            </div>
          )}
        </NavLink>

        {/* Center FAB — Kalender (matches the "Kalender" tab's own destination;
            previously labeled "Ny lektion" though it only navigates to the
            read-only calendar and creates nothing) */}
        <div className="flex flex-col items-center -mt-5">
          <NavLink to="/instructor-portal/schema">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: PRIMARY }}
            >
              <CalendarDays className="w-6 h-6 text-white" strokeWidth={2.5} />
            </div>
          </NavLink>
          <span className="text-[10px] font-semibold text-gray-400 mt-1">Kalender</span>
        </div>

        {/* Kalender */}
        <NavLink to="/instructor-portal/schema" end={false}>
          {({ isActive }) => (
            <div className="flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-[52px]">
              <CalendarDays className="w-6 h-6" style={{ color: isActive ? PRIMARY : '#9CA3AF' }} strokeWidth={1.75} />
              <span className="text-[10px] font-semibold" style={{ color: isActive ? PRIMARY : '#9CA3AF' }}>Kalender</span>
            </div>
          )}
        </NavLink>

        {/* Meny */}
        <button
          onClick={onMenuOpen}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-[52px]"
        >
          <Menu className="w-6 h-6 text-gray-400" strokeWidth={1.75} />
          <span className="text-[10px] font-semibold text-gray-400">Meny</span>
        </button>

      </div>
    </div>
  );
}

// ─── InstructorPortalLayout ───────────────────────────────────────────────────

export function InstructorPortalLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [session,      setSession]      = useState<InstructorPortalSession | null>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === 'true') {
      storeInstructorSession(DEMO_SESSION);
      return DEMO_SESSION;
    }
    return getStoredInstructorSession();
  });
  const [validating,   setValidating]   = useState(false);
  const [linkError,    setLinkError]    = useState<string | null>(null);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [isDemo,       setIsDemo]       = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('demo') === 'true';
  });

  const tokenParam = searchParams.get('token');
  const demoParam  = searchParams.get('demo');

  useEffect(() => {
    if (demoParam !== 'true') return;
    storeInstructorSession(DEMO_SESSION);
    setSession(DEMO_SESSION);
    setIsDemo(true);
    const next = new URLSearchParams(searchParams);
    next.delete('demo');
    setSearchParams(next, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoParam]);

  useEffect(() => {
    if (!tokenParam) return;

    setValidating(true);
    setLinkError(null);

    validateInstructorToken(tokenParam)
      .then((result) => {
        const newSession: InstructorPortalSession = {
          token:             tokenParam,
          instructor_id:     result.instructor.id,
          instructor_name:   `${result.instructor.first_name} ${result.instructor.last_name}`,
          organization_id:   result.organization.id,
          organization_name: result.organization.name,
          expires_at:        result.expires_at,
        };
        storeInstructorSession(newSession);
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

  const firstName = session.instructor_name.split(' ')[0] ?? session.instructor_name;

  return (
    <InstructorPortalContext.Provider value={session}>
      <div className="min-h-screen bg-gray-50">

        {/* Demo mode banner */}
        {isDemo && (
          <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 py-1.5 text-xs font-bold text-white bg-amber-500">
            <span>FÖRHANDSVISNING — Demodata, ingen riktig backend kopplad</span>
          </div>
        )}

        {/* ── Desktop layout ───────────────────────────────────────────────── */}
        <div className="hidden lg:flex min-h-screen">
          <aside className="fixed inset-y-0 left-0 w-64 z-30 flex flex-col">
            <SidebarContent session={session} />
          </aside>
          <main className="ml-64 flex-1 min-h-screen bg-gray-50">
            {/* Desktop top bar */}
            <div className="sticky top-0 z-20 flex items-center justify-between px-8 py-4 bg-white border-b border-gray-100">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Hej {firstName}! 👋
                </h1>
                <p className="text-sm text-gray-400 mt-0.5">Här är din översikt för idag.</p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  to="/instructor-portal/installningar"
                  className="relative p-2.5 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
                  aria-label="Aviseringsinställningar"
                >
                  <Bell className="w-5 h-5" strokeWidth={1.75} />
                </Link>
                <Link
                  to="/instructor-portal/schema"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white"
                  style={{ background: PRIMARY }}
                >
                  <CalendarDays className="w-4 h-4" strokeWidth={2.5} />
                  Kalender
                </Link>
              </div>
            </div>
            <div className="px-8 py-6">
              <Outlet />
            </div>
          </main>
        </div>

        {/* ── Mobile layout ────────────────────────────────────────────────── */}
        <div className="lg:hidden flex flex-col min-h-screen" style={{ background: '#F4F4FF' }}>
          <main className="flex-1 overflow-y-auto pb-24">
            <div className="max-w-lg mx-auto px-4 pt-5">
              <Outlet />
            </div>
          </main>
          <BottomTabBar onMenuOpen={() => setSidebarOpen(true)} />
        </div>

        {/* ── Mobile sidebar drawer ─────────────────────────────────────────── */}
        {sidebarOpen && (
          <>
            <div
              className="lg:hidden fixed inset-0 z-50 bg-black/40"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 flex flex-col shadow-2xl">
              <SidebarContent session={session} onClose={() => setSidebarOpen(false)} />
            </div>
          </>
        )}
      </div>
    </InstructorPortalContext.Provider>
  );
}
