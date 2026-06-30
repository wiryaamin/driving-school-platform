import { useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, AlertCircle } from 'lucide-react';
import { useInstructorCtx } from './InstructorAppLayout.js';
import { useMySchedule } from '../hooks/useInstructorApp.js';
import { SlotCard } from '../components/SlotCard.js';
import { cn } from '@/lib/utils.js';

// ─── Date helpers (local time — avoids UTC day-shift issues) ─────────────────

function todayISO(): string {
  const d = new Date();
  return localDateStr(d);
}

function localDateStr(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function addDays(dateStr: string, n: number): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const date = new Date(y ?? 2026, (mo ?? 1) - 1, (d ?? 1) + n);
  return localDateStr(date);
}

function startOfWeekISO(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const date = new Date(y ?? 2026, (mo ?? 1) - 1, d ?? 1);
  const dow = date.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + diff);
  return localDateStr(date);
}

function getWeekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function formatDayLabel(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const date = new Date(y ?? 2026, (mo ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString('sv-SE', { weekday: 'short' })
    .replace(/^./, c => c.toUpperCase());
}

function formatDayNum(dateStr: string): string {
  return String(parseInt(dateStr.slice(8), 10));
}

function formatMonthLabel(monday: string): string {
  const [y, mo, d] = monday.split('-').map(Number);
  const date = new Date(y ?? 2026, (mo ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })
    .replace(/^./, c => c.toUpperCase());
}

// ─── Week strip ───────────────────────────────────────────────────────────────

function WeekStrip({
  days, selected, slotsByDay, onSelect,
}: {
  days: string[]; selected: string; slotsByDay: Map<string, number>; onSelect: (d: string) => void;
}) {
  const today = todayISO();
  return (
    <div className="flex">
      {days.map(d => {
        const isSelected = d === selected;
        const isToday    = d === today;
        const count      = slotsByDay.get(d) ?? 0;
        return (
          <button
            key={d}
            onClick={() => onSelect(d)}
            className={cn(
              'flex-1 flex flex-col items-center py-3 gap-1 transition-colors',
              isSelected
                ? 'bg-purple-600 text-white'
                : isToday
                ? 'text-purple-600 dark:text-purple-400'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
            )}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              {formatDayLabel(d)}
            </span>
            <span className={cn('text-base font-bold leading-none', isSelected ? 'text-white' : '')}>
              {formatDayNum(d)}
            </span>
            {count > 0 ? (
              <span className={cn('w-5 h-1.5 rounded-full', isSelected ? 'bg-purple-300' : 'bg-purple-400 dark:bg-purple-600')} />
            ) : (
              <span className="w-5 h-1.5" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── InstructorAppSchemaPage ──────────────────────────────────────────────────

export function InstructorAppSchemaPage() {
  const { instructor } = useInstructorCtx();
  const today = todayISO();
  const [selectedDate, setSelectedDate] = useState(today);
  const [weekMonday,   setWeekMonday]   = useState(() => startOfWeekISO(today));

  const weekDays = getWeekDays(weekMonday);
  const weekEnd  = weekDays[6] ?? weekMonday;

  const { data: weekSlots, isLoading, isError } = useMySchedule(instructor.id, weekMonday, weekEnd);

  const slotsByDay = new Map<string, number>();
  for (const slot of weekSlots ?? []) {
    const d = slot.starts_at.slice(0, 10);
    slotsByDay.set(d, (slotsByDay.get(d) ?? 0) + 1);
  }

  const daySlots = (weekSlots ?? []).filter(s => s.starts_at.slice(0, 10) === selectedDate);

  function prevWeek() {
    const newMon = addDays(weekMonday, -7);
    setWeekMonday(newMon);
    setSelectedDate(newMon);
  }

  function nextWeek() {
    const newMon = addDays(weekMonday, 7);
    setWeekMonday(newMon);
    setSelectedDate(newMon);
  }

  function goToday() {
    setWeekMonday(startOfWeekISO(today));
    setSelectedDate(today);
  }

  const selectedDayLabel = (() => {
    const [y, mo, d] = selectedDate.split('-').map(Number);
    const date = new Date(y ?? 2026, (mo ?? 1) - 1, d ?? 1);
    return date.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
      .replace(/^./, c => c.toUpperCase());
  })();

  return (
    <div className="flex flex-col max-w-lg mx-auto">

      {/* Week navigation header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between px-4 py-2">
          <button
            onClick={prevWeek}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={goToday}
            className="text-sm font-semibold text-gray-800 dark:text-gray-200 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
          >
            {formatMonthLabel(weekMonday)}
          </button>
          <button
            onClick={nextWeek}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        <WeekStrip
          days={weekDays}
          selected={selectedDate}
          slotsByDay={slotsByDay}
          onSelect={setSelectedDate}
        />
      </div>

      {/* Selected day detail */}
      <div className="px-4 py-4 space-y-3">
        <p className="text-sm font-bold text-gray-800 dark:text-gray-200 capitalize">
          {selectedDayLabel}
          {selectedDate === today && (
            <span className="ml-2 text-[10px] font-bold px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full">
              IDAG
            </span>
          )}
        </p>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">Kunde inte hämta schemat.</p>
          </div>
        ) : daySlots.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center gap-2">
            <CalendarDays className="w-10 h-10 text-gray-200 dark:text-gray-700" />
            <p className="text-sm font-semibold text-gray-400 dark:text-gray-500">Inga lektioner</p>
          </div>
        ) : (
          daySlots.map(s => <SlotCard key={s.id} slot={s} />)
        )}
      </div>
    </div>
  );
}
