import { useState } from 'react';
import { CheckCircle, Clock, Star, AlertCircle, CalendarX, Plus, X, CalendarClock } from 'lucide-react';
import { useInstructorCtx } from './InstructorAppLayout.js';
import { useSessionStore } from '@core/store/session.store.js';
import {
  useInstructorStats,
  useInstructorTimeOff,
  useCreateTimeOff,
  useCancelTimeOff,
  useInstructorAvailabilityRules,
} from '../hooks/useInstructorApp.js';
import { cn } from '@/lib/utils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtHours(h: number): string {
  if (h === 0) return '0 min';
  const whole = Math.floor(h);
  const mins  = Math.round((h - whole) * 60);
  if (whole === 0) return `${mins} min`;
  if (mins  === 0) return `${whole} tim`;
  return `${whole} tim ${mins} min`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

function currentMonthLabel(): string {
  return new Date().toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
}

// ─── Time-off type / status maps ──────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: 'vacation', label: 'Semester' },
  { value: 'sickness', label: 'Sjukdom'  },
  { value: 'training', label: 'Utbildning' },
  { value: 'personal', label: 'Personlig' },
  { value: 'other',    label: 'Övrigt'   },
] as const;

const TYPE_LABEL: Record<string, string> = {
  vacation: 'Semester',
  sickness: 'Sjukdom',
  training: 'Utbildning',
  personal: 'Personlig',
  other:    'Övrigt',
};

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'Väntar på godkännande', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  approved: { label: 'Godkänd',               cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
};

// day_of_week: 0=Sunday … 6=Saturday (matches instructor_availability_rules)
const DAY_LABEL = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];

function fmtHM(t: string): string {
  return t.slice(0, 5);
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, value, label, color }: {
  icon: React.ElementType; value: string | number; label: string; color: string;
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

// ─── Month highlight card ─────────────────────────────────────────────────────

function MonthCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-4 text-center">
      <p className="text-2xl font-bold text-purple-700 dark:text-purple-300 tabular-nums">{value}</p>
      <p className="text-[11px] text-purple-500 dark:text-purple-400 mt-0.5 leading-tight">{label}</p>
    </div>
  );
}

// ─── Star display ─────────────────────────────────────────────────────────────

function StarDisplay({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={cn(
            'w-3.5 h-3.5',
            i <= rounded
              ? 'fill-amber-400 text-amber-400'
              : 'fill-gray-200 text-gray-200 dark:fill-gray-700 dark:text-gray-700',
          )}
        />
      ))}
    </div>
  );
}

// ─── InstructorAppStatistikPage ───────────────────────────────────────────────

export function InstructorAppStatistikPage() {
  const { instructor } = useInstructorCtx();
  const { user }       = useSessionStore();

  const { data: stats,   isLoading: statsLoading  } = useInstructorStats(instructor.id, user?.organization_id);
  const { data: entries, isLoading: entriesLoading } = useInstructorTimeOff(instructor.id);
  const { data: availRules, isLoading: availLoading } = useInstructorAvailabilityRules(instructor.id);
  const createTimeOff  = useCreateTimeOff();
  const cancelTimeOff  = useCancelTimeOff();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate,   setToDate]   = useState(todayStr);
  const [type,     setType]     = useState('vacation');
  const [reason,   setReason]   = useState('');
  const [formErr,  setFormErr]  = useState<string | null>(null);

  function resetForm() {
    setFromDate(todayStr());
    setToDate(todayStr());
    setType('vacation');
    setReason('');
    setFormErr(null);
    setShowForm(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromDate || !toDate) return;
    if (toDate < fromDate) {
      setFormErr('Slutdatum måste vara efter startdatum.');
      return;
    }
    setFormErr(null);
    createTimeOff.mutate(
      {
        instructorId:  instructor.id,
        time_off_type: type,
        starts_at:     `${fromDate}T00:00:00Z`,
        ends_at:       `${toDate}T23:59:59Z`,
        reason:        reason.trim() || undefined,
      },
      {
        onSuccess: resetForm,
        onError: (err: unknown) => {
          const code = (err as { code?: string }).code ?? '';
          if (code === '23P01') {
            setFormErr('Du har redan en godkänd ledighet under denna period.');
          } else {
            setFormErr('Kunde inte spara ledigheten. Försök igen.');
          }
        },
      },
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const noShowRate = stats && (stats.total_completed + stats.total_no_show) > 0
    ? Math.round(stats.total_no_show / (stats.total_completed + stats.total_no_show) * 100)
    : 0;

  // Active, currently-effective rules only, displayed Monday→Sunday.
  const today = todayStr();
  const activeAvailRules = (availRules ?? [])
    .filter(r => r.is_active && (!r.effective_until || r.effective_until >= today))
    .sort((a, b) => {
      const wa = a.day_of_week === 0 ? 7 : a.day_of_week;
      const wb = b.day_of_week === 0 ? 7 : b.day_of_week;
      return wa - wb || a.start_time.localeCompare(b.start_time);
    });

  return (
    <div className="px-4 py-5 max-w-lg mx-auto space-y-5">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Statistik</h1>

      {/* This month */}
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2 capitalize">
          {currentMonthLabel()}
        </p>
        {statsLoading ? (
          <div className="flex gap-3">
            <div className="flex-1 h-20 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
            <div className="flex-1 h-20 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
          </div>
        ) : (
          <div className="flex gap-3">
            <MonthCard value={String(stats?.month_completed ?? 0)} label="Genomförda lektioner" />
            <MonthCard value={fmtHours(stats?.month_hours ?? 0)}   label="Undervisningstid"     />
          </div>
        )}
      </section>

      {/* All-time stats */}
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">
          Totalt
        </p>
        {statsLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={CheckCircle}
              value={stats?.total_completed ?? 0}
              label="Genomförda lektioner"
              color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            />
            <StatCard
              icon={Clock}
              value={fmtHours(stats?.total_hours ?? 0)}
              label="Total undervisningstid"
              color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
            />

            {/* Average rating */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-500 flex items-center justify-center shrink-0">
                <Star className="w-5 h-5" />
              </div>
              <div>
                {stats?.avg_rating !== null && stats?.avg_rating !== undefined ? (
                  <>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                      {stats.avg_rating.toFixed(1)}
                    </p>
                    <StarDisplay rating={stats.avg_rating} />
                  </>
                ) : (
                  <p className="text-xl font-bold text-gray-300 dark:text-gray-600">—</p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">Snittbetyg</p>
              </div>
            </div>

            <StatCard
              icon={AlertCircle}
              value={`${noShowRate} %`}
              label="Uteblivandefrekvens"
              color={noShowRate > 15
                ? 'bg-amber-100 text-amber-500 dark:bg-amber-900/30 dark:text-amber-400'
                : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
              }
            />
          </div>
        )}
      </section>

      {/* Recurring availability / Tillgänglighet (P1-1, read-only) */}
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">
          Tillgänglighet
        </p>

        {availLoading && (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />)}
          </div>
        )}

        {!availLoading && activeAvailRules.length === 0 && (
          <div className="flex items-center gap-3 p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
            <CalendarClock className="w-5 h-5 text-gray-300 dark:text-gray-600 shrink-0" />
            <p className="text-sm text-gray-400 dark:text-gray-500">Ingen ordinarie tillgänglighet är registrerad ännu.</p>
          </div>
        )}

        {!availLoading && activeAvailRules.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden divide-y divide-gray-50 dark:divide-gray-800">
            {activeAvailRules.map(rule => (
              <div key={rule.id} className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{DAY_LABEL[rule.day_of_week]}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">{fmtHM(rule.start_time)} – {fmtHM(rule.end_time)}</span>
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 leading-snug">
          Din ordinarie tillgänglighet sätts av skolans administratör. Kontakta administrationen om den behöver ändras.
        </p>
      </section>

      {/* Time-off / Ledigheter */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Ledigheter
          </p>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white text-xs font-semibold rounded-xl hover:bg-purple-700 active:scale-95 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Lägg till
            </button>
          )}
        </div>

        {/* Add form */}
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-3 p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-800 dark:text-gray-200">Ny ledighet</p>
              <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Från</label>
                <input
                  type="date"
                  value={fromDate}
                  min={todayStr()}
                  onChange={e => { setFromDate(e.target.value); if (toDate < e.target.value) setToDate(e.target.value); }}
                  required
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Till</label>
                <input
                  type="date"
                  value={toDate}
                  min={fromDate}
                  onChange={e => setToDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            {/* Type */}
            <div>
              <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Typ</label>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-gray-100"
              >
                {TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Anteckning (valfri)</label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="T.ex. semesterresa, sjukvårdsbesök..."
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-gray-100 resize-none placeholder:text-gray-400"
              />
            </div>

            {formErr && (
              <p className="text-xs text-red-500 dark:text-red-400">{formErr}</p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createTimeOff.isPending}
                className="flex-1 py-2 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 active:scale-95 transition-all"
              >
                {createTimeOff.isPending ? 'Sparar...' : 'Spara'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-95 transition-all"
              >
                Avbryt
              </button>
            </div>
          </form>
        )}

        {/* Entries list */}
        {entriesLoading && (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />)}
          </div>
        )}

        {!entriesLoading && (entries ?? []).length === 0 && !showForm && (
          <div className="flex items-center gap-3 p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
            <CalendarX className="w-5 h-5 text-gray-300 dark:text-gray-600 shrink-0" />
            <p className="text-sm text-gray-400 dark:text-gray-500">Inga kommande ledigheter.</p>
          </div>
        )}

        {!entriesLoading && (entries ?? []).length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden divide-y divide-gray-50 dark:divide-gray-800">
            {(entries ?? []).map(entry => {
              const cfg    = STATUS_CFG[entry.status] ?? STATUS_CFG['pending']!;
              const isPending = entry.status === 'pending';
              const start  = fmtDate(entry.starts_at);
              const end    = fmtDate(entry.ends_at);
              const year   = new Date(entry.ends_at).getFullYear();
              const range  = start === end ? `${start} ${year}` : `${start} – ${end} ${year}`;
              return (
                <div key={entry.id} className="px-4 py-3.5 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{range}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {TYPE_LABEL[entry.time_off_type] ?? entry.time_off_type}
                      </span>
                    </div>
                    <span className={cn('inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full', cfg.cls)}>
                      {cfg.label}
                    </span>
                    {entry.reason && (
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 line-clamp-1">{entry.reason}</p>
                    )}
                  </div>
                  {isPending && (
                    <button
                      onClick={() => cancelTimeOff.mutate({ entryId: entry.id, instructorId: instructor.id })}
                      disabled={cancelTimeOff.isPending}
                      className="shrink-0 text-xs text-red-400 dark:text-red-500 hover:underline disabled:opacity-50 mt-0.5"
                    >
                      Avboka
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
