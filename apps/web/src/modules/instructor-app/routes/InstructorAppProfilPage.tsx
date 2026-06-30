import { useState } from 'react';
import { LogOut, Phone, Mail, Briefcase, CalendarDays, Users, Loader2, Copy, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useInstructorCtx } from './InstructorAppLayout.js';
import { useMySchedule, useMyStudents } from '../hooks/useInstructorApp.js';
import { useAuth } from '@core/auth/hooks.js';
import { useSessionStore } from '@core/store/session.store.js';
import { supabase } from '@core/api/supabase.js';
import { cn } from '@/lib/utils.js';

const ICAL_API = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/instructor-ical`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function addDaysISO(dateStr: string, n: number): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const date = new Date(y ?? 2026, (mo ?? 1) - 1, (d ?? 1) + n);
  const yy  = date.getFullYear();
  const mm  = String(date.getMonth() + 1).padStart(2, '0');
  const dd  = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  active:       { label: 'Anställd',      cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  inactive:     { label: 'Inaktiv',       cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
  leave:        { label: 'Tjänstledig',   cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  terminated:   { label: 'Avslutad',      cls: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
  freelance:    { label: 'Konsult',       cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  permanent:  'Tillsvidare',
  part_time:  'Deltid',
  freelance:  'Konsult',
  temporary:  'Vikariat',
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_LABELS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' };
  return (
    <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

function StatCard({ icon: Icon, value, label, color }: {
  icon: React.ElementType; value: number | string; label: string; color: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-start gap-3">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{label}</p>
      </div>
    </div>
  );
}

// ─── InstructorAppProfilPage ──────────────────────────────────────────────────

export function InstructorAppProfilPage() {
  const { instructor } = useInstructorCtx();
  const { organization } = useSessionStore();
  const { signOut } = useAuth();

  const [feedUrl,     setFeedUrl]     = useState<string | null>(null);
  const [icalLoading, setIcalLoading] = useState(false);
  const [icalError,   setIcalError]   = useState<string | null>(null);
  const [copied,      setCopied]      = useState(false);

  async function handleGetFeedUrl() {
    setIcalLoading(true);
    setIcalError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const jwt = session?.access_token;
      if (!jwt) throw new Error('Inte inloggad');

      const res  = await fetch(`${ICAL_API}/token`, { headers: { Authorization: `Bearer ${jwt}` } });
      const body = await res.json() as { data?: { feed_url: string }; error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Kunde inte hämta URL');
      setFeedUrl(body.data?.feed_url ?? null);
    } catch (e) {
      setIcalError(e instanceof Error ? e.message : 'Okänt fel');
    } finally {
      setIcalLoading(false);
    }
  }

  async function handleCopy() {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const today   = todayISO();
  const weekEnd = addDaysISO(today, 6);

  const { data: todaySlots } = useMySchedule(instructor.id, today, today);
  const { data: weekSlots  } = useMySchedule(instructor.id, today, weekEnd);
  const { data: students   } = useMyStudents(instructor.id);

  const todayCount  = todaySlots?.length ?? 0;
  const weekCount   = weekSlots?.length ?? 0;
  const studentCount = students?.filter(s => s.status === 'active').length ?? 0;

  const initials = `${instructor.first_name.charAt(0)}${instructor.last_name.charAt(0)}`.toUpperCase();
  const fullName = `${instructor.first_name} ${instructor.last_name}`;
  const employment = EMPLOYMENT_LABELS[instructor.employment_type] ?? instructor.employment_type;

  return (
    <div className="px-4 py-5 max-w-lg mx-auto space-y-5">

      {/* Profile card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
            <span className="text-xl font-bold text-purple-700 dark:text-purple-300">{initials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{fullName}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{organization?.name ?? ''}</p>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <StatusBadge status={instructor.status} />
              {employment && (
                <span className="text-xs text-gray-500 dark:text-gray-400">{employment}</span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-gray-50 dark:border-gray-800">
          {instructor.phone && (
            <a
              href={`tel:${instructor.phone}`}
              className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
            >
              <Phone className="w-4 h-4 text-gray-400" />
              {instructor.phone}
            </a>
          )}
          {instructor.email && (
            <div className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
              <Mail className="w-4 h-4 text-gray-400" />
              <span className="truncate">{instructor.email}</span>
            </div>
          )}
          {employment && (
            <div className="flex items-center gap-2.5 text-sm text-gray-500 dark:text-gray-400">
              <Briefcase className="w-4 h-4 text-gray-400" />
              {employment}
            </div>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={CalendarDays}
          value={todayCount}
          label="Lektioner idag"
          color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
        />
        <StatCard
          icon={CalendarDays}
          value={weekCount}
          label="Lektioner denna vecka"
          color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <div className="col-span-2">
          <StatCard
            icon={Users}
            value={studentCount}
            label="Aktiva elever tilldelade"
            color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
          />
        </div>
      </div>

      {/* Links */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden divide-y divide-gray-50 dark:divide-gray-800">
        <Link
          to="/dashboard"
          className="flex items-center gap-3 px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Gå till admin-panelen
        </Link>
      </div>

      {/* Calendar subscription */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <CalendarDays className="w-4 h-4 text-blue-500 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Kalenderabonnemang</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Prenumerera på ditt schema i Google Kalender, Apple Kalender eller Outlook</p>
          </div>
        </div>

        {!feedUrl && (
          <button
            onClick={() => void handleGetFeedUrl()}
            disabled={icalLoading}
            className="w-full py-2.5 rounded-xl border border-blue-200 dark:border-blue-800 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {icalLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {icalLoading ? 'Hämtar länk…' : 'Hämta kalenderlänk'}
          </button>
        )}

        {icalError && (
          <p className="mt-2 text-xs text-red-500 dark:text-red-400">{icalError}</p>
        )}

        {feedUrl && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <p className="flex-1 text-[11px] text-gray-500 dark:text-gray-400 truncate font-mono">{feedUrl}</p>
              <button
                onClick={() => void handleCopy()}
                className="shrink-0 flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              >
                {copied
                  ? <><Check className="w-3.5 h-3.5" /> Kopierat</>
                  : <><Copy className="w-3.5 h-3.5" /> Kopiera</>}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
              Lägg till länken i din kalenderapp under "Prenumerera på kalender" eller "Lägg till URL-kalender". Schemat uppdateras automatiskt.
            </p>
          </div>
        )}
      </div>

      {/* Sign out */}
      <button
        onClick={() => void signOut()}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-semibold text-sm transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Logga ut
      </button>
    </div>
  );
}
