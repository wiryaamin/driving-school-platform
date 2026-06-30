import { createContext, useContext } from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import { Sun, CalendarDays, Users, User, ChartBar, AlertCircle } from 'lucide-react';
import { useMyInstructor, type InstructorProfile } from '../hooks/useInstructorApp.js';
import { useSessionStore } from '@core/store/session.store.js';
import { cn } from '@/lib/utils.js';

// ─── Instructor context ───────────────────────────────────────────────────────

interface InstructorCtx {
  instructor: InstructorProfile;
}

const InstructorContext = createContext<InstructorCtx | null>(null);

export function useInstructorCtx(): InstructorCtx {
  const ctx = useContext(InstructorContext);
  if (!ctx) throw new Error('useInstructorCtx must be used inside InstructorAppLayout');
  return ctx;
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

function InstructorTopBar({ name, orgName }: { name: string; orgName: string }) {
  const today = new Date().toLocaleDateString('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).replace(/^./, c => c.toUpperCase());

  return (
    <header className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
      <div>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium">{orgName}</p>
        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight capitalize">{today}</p>
      </div>
      <div className="w-9 h-9 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
        <span className="text-sm font-bold text-purple-700 dark:text-purple-300">
          {name.charAt(0).toUpperCase()}
        </span>
      </div>
    </header>
  );
}

// ─── Bottom nav ───────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { to: '/instructor-app',            label: 'Idag',      Icon: Sun,          end: true  },
  { to: '/instructor-app/schema',     label: 'Schema',    Icon: CalendarDays, end: false },
  { to: '/instructor-app/elever',     label: 'Elever',    Icon: Users,        end: false },
  { to: '/instructor-app/statistik',  label: 'Statistik', Icon: ChartBar,    end: false },
  { to: '/instructor-app/profil',     label: 'Profil',    Icon: User,         end: false },
] as const;

function InstructorBottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex">
      {NAV_ITEMS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => cn(
            'flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors text-[10px] font-semibold',
            isActive
              ? 'text-purple-600 dark:text-purple-400'
              : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300',
          )}
        >
          {({ isActive }) => (
            <>
              <Icon className={cn('w-5 h-5', isActive && 'stroke-[2.5]')} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LayoutSkeleton() {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950 animate-pulse">
      <div className="h-14 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800" />
      <div className="flex-1 p-4 space-y-3">
        <div className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800" />
        <div className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800" />
        <div className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800" />
      </div>
    </div>
  );
}

// ─── InstructorAppLayout ──────────────────────────────────────────────────────

export function InstructorAppLayout() {
  const { organization } = useSessionStore();
  const { data: instructor, isLoading, isError } = useMyInstructor();

  if (isLoading) return <LayoutSkeleton />;

  if (isError || !instructor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-gray-400" />
        </div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Inget instruktörskonto</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
          Ditt konto är inte kopplat till en instruktörsprofil. Kontakta administratören.
        </p>
        <Link
          to="/dashboard"
          className="mt-2 text-sm text-purple-600 dark:text-purple-400 hover:underline"
        >
          Gå till instrumentpanelen
        </Link>
      </div>
    );
  }

  const name = `${instructor.first_name} ${instructor.last_name}`;
  const orgName = organization?.name ?? '';

  return (
    <InstructorContext.Provider value={{ instructor }}>
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">
        <InstructorTopBar name={name} orgName={orgName} />
        <main className="flex-1 overflow-y-auto pb-20">
          <Outlet />
        </main>
        <InstructorBottomNav />
      </div>
    </InstructorContext.Provider>
  );
}
