import { AlertCircle, CalendarDays } from 'lucide-react';
import { useInstructorCtx } from './InstructorAppLayout.js';
import { useMySchedule } from '../hooks/useInstructorApp.js';
import { SlotCard } from '../components/SlotCard.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── InstructorAppIdagPage ────────────────────────────────────────────────────

export function InstructorAppIdagPage() {
  const { instructor } = useInstructorCtx();
  const today = todayISO();
  const { data: slots, isLoading, isError } = useMySchedule(instructor.id, today, today);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'God morgon' : hour < 17 ? 'God eftermiddag' : 'God kväll';

  const upcoming  = (slots ?? []).filter(s => new Date(s.ends_at).getTime() > Date.now());
  const completed = (slots ?? []).filter(s => new Date(s.ends_at).getTime() <= Date.now());
  const total     = slots?.length ?? 0;
  const doneCount = completed.length;

  return (
    <div className="px-4 py-5 max-w-lg mx-auto space-y-5">

      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {greeting}, {instructor.first_name}!
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {isLoading ? '…' : total === 0
            ? 'Inga lektioner idag'
            : `${total} lektion${total !== 1 ? 'er' : ''} idag · ${doneCount} genomförd${doneCount !== 1 ? 'a' : ''}`
          }
        </p>
      </div>

      {/* Stats row */}
      {!isLoading && total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-3 text-center">
            <p className="text-xl font-bold text-purple-600 dark:text-purple-400 tabular-nums">{total}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Totalt</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-3 text-center">
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{doneCount}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Genomförda</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-3 text-center">
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">{upcoming.length}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Kommande</p>
          </div>
        </div>
      )}

      {/* Lesson list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">Kunde inte hämta schemat.</p>
        </div>
      ) : (slots ?? []).length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center gap-3">
          <CalendarDays className="w-12 h-12 text-gray-200 dark:text-gray-700" />
          <p className="font-semibold text-gray-500 dark:text-gray-400">Inga lektioner idag</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">Njut av ledigheten!</p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                Kommande
              </p>
              {upcoming.map(s => <SlotCard key={s.id} slot={s} />)}
            </div>
          )}
          {completed.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                Genomförda
              </p>
              {completed.map(s => <SlotCard key={s.id} slot={s} dim />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
