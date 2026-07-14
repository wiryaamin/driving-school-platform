import { useState, useEffect, createContext, useContext } from 'react';
import { Outlet, NavLink, Link, useSearchParams } from 'react-router-dom';
import {
  Home, CalendarDays, TrendingUp, CreditCard, Route, ShieldCheck,
  MessageSquare, FileText, Menu, X, LogOut, Loader2, Shield, User,
  BookOpen, CheckCircle2,
} from 'lucide-react';
import {
  getStoredGuardianSession, storeGuardianSession, clearGuardianSession,
  useGuardianProgress,
  type GuardianSession,
} from '../hooks/useGuardianPortal.js';
import { cn } from '@/lib/utils.js';

// ─── Demo session ─────────────────────────────────────────────────────────────

const DEMO_SESSION: GuardianSession = {
  token:             'demo',
  guardian_id:       'demo-guardian',
  guardian_name:     'Eva Johansson',
  student_id:        'demo-student',
  organization_id:   'demo-org',
  organization_name: 'Demo Trafikskola AB',
  expires_at:        new Date(Date.now() + 30 * 86_400_000).toISOString(),
};

// ─── Brand colors ─────────────────────────────────────────────────────────────

const BRAND           = '#2D5BE3'; // loading/error screens + mobile
const DESKTOP_PRIMARY = '#2D5BE3'; // desktop sidebar active state

const STAGE_PILL_LABELS: Record<string, string> = {
  not_started:           'Ej börjat',
  theory_study:          'Teoristudier',
  risk1_booked:          'Risk 1 bokad',
  risk1_completed:       'Risk 1 klar',
  risk2_booked:          'Risk 2 bokad',
  risk2_completed:       'Risk 2 klar',
  theory_exam_booked:    'Teoriprov bokat',
  theory_passed:         'Teori ✓',
  practical_exam_booked: 'Uppkörning bokad',
  practical_passed:      'Körprov ✓',
  licence_issued:        'Körkort 🎉',
};

// ─── Context ──────────────────────────────────────────────────────────────────

const GuardianSessionContext = createContext<GuardianSession | null>(null);

export function useGuardianSession(): GuardianSession {
  const ctx = useContext(GuardianSessionContext);
  if (!ctx) throw new Error('useGuardianSession must be inside GuardianPortalLayout');
  return ctx;
}

// ─── Navigation ───────────────────────────────────────────────────────────────

const NAV_ALL = [
  { to: '/guardian',                label: 'Översikt',        Icon: Home,         end: true,  badge: 0 },
  { to: '/guardian/schema',         label: 'Schema',          Icon: CalendarDays, end: false, badge: 0 },
  { to: '/guardian/framsteg',       label: 'Framsteg',        Icon: TrendingUp,   end: false, badge: 0 },
  { to: '/guardian/ekonomi',        label: 'Ekonomi',         Icon: CreditCard,   end: false, badge: 0 },
  { to: '/guardian/bokningar',      label: 'Bokningshistorik',Icon: BookOpen,     end: false, badge: 0 },
  { to: '/guardian/korkortsresa',   label: 'Körkortsresa',    Icon: Route,        end: false, badge: 0 },
  { to: '/guardian/riskutbildning', label: 'Riskutbildning',  Icon: ShieldCheck,  end: false, badge: 0 },
  { to: '/guardian/meddelanden',    label: 'Meddelanden',     Icon: MessageSquare,end: false, badge: 0 },
  { to: '/guardian/dokument',       label: 'Dokument',        Icon: FileText,     end: false, badge: 0 },
  { to: '/guardian/konto',          label: 'Mitt konto',      Icon: User,         end: false, badge: 0 },
];

// ─── Mobile bottom tab bar ────────────────────────────────────────────────────

function MobileBottomNav() {
  const { data: progress } = useGuardianProgress();
  const stage      = progress?.permit_stage;
  const stageLabel = stage ? (STAGE_PILL_LABELS[stage] ?? stage) : 'Framsteg';

  const tabCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-colors',
      isActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600',
    );

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100">
      <div className="flex items-end h-16">
        {/* Hem */}
        <NavLink to="/guardian" end className={tabCls}>
          <Home className="w-5 h-5" strokeWidth={1.75} />
          Hem
        </NavLink>

        {/* Framsteg */}
        <NavLink to="/guardian/framsteg" className={tabCls}>
          <TrendingUp className="w-5 h-5" strokeWidth={1.75} />
          Framsteg
        </NavLink>

        {/* Center stage pill — raised above bar */}
        <div className="flex-1 flex flex-col items-center justify-end pb-2">
          <Link
            to="/guardian/framsteg"
            className="flex flex-col items-center -mt-8"
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl border-4 border-white"
              style={{ background: DESKTOP_PRIMARY }}
            >
              <CheckCircle2 className="w-7 h-7 text-white" strokeWidth={2} />
            </div>
            <span
              className="text-[8px] font-bold mt-0.5 text-center leading-tight max-w-[60px] truncate"
              style={{ color: DESKTOP_PRIMARY }}
            >
              {stageLabel}
            </span>
          </Link>
        </div>

        {/* Ekonomi */}
        <NavLink to="/guardian/ekonomi" className={tabCls}>
          <CreditCard className="w-5 h-5" strokeWidth={1.75} />
          Ekonomi
        </NavLink>

        {/* Kontakt */}
        <NavLink to="/guardian/meddelanden" className={tabCls}>
          <MessageSquare className="w-5 h-5" strokeWidth={1.75} />
          Kontakt
        </NavLink>
      </div>
    </nav>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function SidebarContent({
  session,
  onClose,
}: {
  session: GuardianSession;
  onClose?: () => void;
}) {
  function handleLogout() {
    clearGuardianSession();
    window.location.href = '/guardian';
  }

  const initial = (session.guardian_name ?? 'V')[0]?.toUpperCase() ?? 'V';

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-100">

      {/* Logo / Org */}
      <div className="px-5 pt-5 pb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: DESKTOP_PRIMARY }}
          >
            <Shield className="w-5 h-5 text-white" strokeWidth={1.75} />
          </div>
          <p className="font-bold text-gray-900 text-sm leading-tight truncate">
            {session.organization_name}
          </p>
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

      {/* User card */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-gray-50 border border-gray-100">
          <div
            className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center font-bold text-white text-sm"
            style={{ background: DESKTOP_PRIMARY }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-gray-900 text-sm font-semibold truncate leading-tight">
              {session.guardian_name}
            </p>
            <p className="text-gray-400 text-[11px] mt-0.5">Vårdnadshavare</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
        {NAV_ALL.map(({ to, label, Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50',
              )
            }
          >
            <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
            <span className="flex-1">{label}</span>
            {badge > 0 && (
              <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                {badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-4 pt-2 border-t border-gray-100">
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

// ─── Mobile header ────────────────────────────────────────────────────────────

function MobileHeader({
  session,
  onMenuOpen,
}: {
  session: GuardianSession;
  onMenuOpen: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-2 px-4 py-3 bg-white border-b border-gray-100">
      <button
        onClick={onMenuOpen}
        className="p-2 -ml-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors shrink-0"
      >
        <Menu className="w-5 h-5" strokeWidth={1.75} />
      </button>
      <p className="text-gray-900 text-sm font-bold flex-1 text-center truncate">
        {session.organization_name}
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          to="/guardian/framsteg"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white"
          style={{ background: DESKTOP_PRIMARY }}
        >
          <TrendingUp className="w-3.5 h-3.5" strokeWidth={2} />
          Se framsteg
        </Link>
      </div>
    </header>
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
        href="/guardian?demo=true"
        className="px-5 py-2.5 rounded-full text-sm font-bold bg-white/15 text-white border border-white/30 hover:bg-white/25 transition-colors"
      >
        Förhandsvisning (demo)
      </a>
    </div>
  );
}

function PortalLoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: BRAND }}>
      <Loader2 className="w-8 h-8 animate-spin text-white" />
    </div>
  );
}

// ─── GuardianPortalLayout ─────────────────────────────────────────────────────

export function GuardianPortalLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [session,     setSession]     = useState<GuardianSession | null>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === 'true') {
      storeGuardianSession(DEMO_SESSION);
      return DEMO_SESSION;
    }
    return getStoredGuardianSession();
  });
  const [validating,  setValidating]  = useState(false);
  const [linkError,   setLinkError]   = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDemo,      setIsDemo]      = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('demo') === 'true';
  });

  const tokenParam = searchParams.get('token');
  const demoParam  = searchParams.get('demo');

  // Demo mode
  useEffect(() => {
    if (demoParam !== 'true') return;
    storeGuardianSession(DEMO_SESSION);
    setSession(DEMO_SESSION);
    setIsDemo(true);
    const next = new URLSearchParams(searchParams);
    next.delete('demo');
    setSearchParams(next, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoParam]);

  // Token validation
  useEffect(() => {
    if (!tokenParam) return;

    setValidating(true);
    setLinkError(null);

    const ANON_KEY   = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const PORTAL_API = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/guardian-portal`;

    void (async () => {
      try {
        const res  = await fetch(`${PORTAL_API}/me`, {
          headers: {
            'Authorization': `Bearer ${tokenParam}`,
            'apikey':        ANON_KEY,
          },
        });
        const body = await res.json() as {
          data?: {
            guardian:     { id: string; first_name: string; last_name: string };
            student:      { id: string };
            organization: { id: string; name: string };
            session:      { expires_at: string };
          };
          error?: string;
        };

        if (!res.ok || !body.data) {
          setLinkError(body.error ?? 'Länken är ogiltig eller har gått ut.');
          return;
        }

        const { guardian, student, organization, session: portalSession } = body.data;
        const s: GuardianSession = {
          token:             tokenParam,
          guardian_id:       guardian.id,
          guardian_name:     `${guardian.first_name} ${guardian.last_name}`,
          student_id:        student.id,
          organization_id:   organization.id,
          organization_name: organization.name,
          expires_at:        portalSession.expires_at,
        };
        storeGuardianSession(s);
        setSession(s);
        const next = new URLSearchParams(searchParams);
        next.delete('token');
        setSearchParams(next, { replace: true });
      } catch {
        setLinkError('Kunde inte kontrollera länken. Kontrollera din anslutning.');
      } finally {
        setValidating(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenParam]);

  if (validating) return <PortalLoadingScreen />;
  if (linkError)  return <InvalidLinkScreen message={linkError} />;
  if (!session)   return <InvalidLinkScreen message="Ingen aktiv session. Klicka på länken du fick från trafikskolan." />;

  return (
    <GuardianSessionContext.Provider value={session}>
      <div className="min-h-screen bg-white">

        {/* Demo banner */}
        {isDemo && (
          <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 py-1.5 text-xs font-bold text-white bg-amber-500">
            FÖRHANDSVISNING — Demodata, ingen riktig backend kopplad
          </div>
        )}

        {/* ── Desktop layout ─────────────────────────────────────────────── */}
        <div className="hidden lg:flex min-h-screen">
          <aside className={cn(
            'fixed left-0 w-64 z-30 flex flex-col',
            isDemo ? 'top-8 bottom-0' : 'inset-y-0',
          )}>
            <SidebarContent session={session} />
          </aside>
          <main className={cn('ml-64 flex-1 min-h-screen bg-white', isDemo && 'pt-8')}>
            <div className="p-6">
              <Outlet />
            </div>
          </main>
        </div>

        {/* ── Mobile layout ──────────────────────────────────────────────── */}
        <div className="lg:hidden flex flex-col min-h-screen">
          {/* Spacer so sticky header sits below the demo banner */}
          {isDemo && <div className="h-8 shrink-0" />}
          <MobileHeader session={session} onMenuOpen={() => setSidebarOpen(true)} />
          <main className="flex-1 bg-white">
            <div className="max-w-lg mx-auto px-4 py-5 pb-24">
              <Outlet />
            </div>
          </main>
        </div>

        {/* ── Mobile bottom navigation ───────────────────────────────────── */}
        <MobileBottomNav />

        {/* ── Mobile sidebar drawer ──────────────────────────────────────── */}
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
    </GuardianSessionContext.Provider>
  );
}
