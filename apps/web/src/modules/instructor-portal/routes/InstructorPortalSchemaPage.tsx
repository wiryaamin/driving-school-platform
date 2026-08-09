import { useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { sv } from 'date-fns/locale';
import { useInstructorPortalSlots } from '../hooks/useInstructorPortal.js';
import { cn } from '@/lib/utils.js';

const BRAND = '#1055C9';
const SWEDEN_TZ = 'Europe/Stockholm';

// startOfWeek/addDays/isoDate all operate on plain local Date getters —
// correct as long as every Date passed in was produced by toZonedTime(...,
// SWEDEN_TZ) first, which is what lets native local getters/setters behave
// as if the runtime were in Stockholm regardless of the viewer's actual
// device timezone. Mixing a real UTC instant into these functions directly
// (as this page used to) reintroduces the same class of bug this fixes.
function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const m = new Date(d);
  m.setDate(m.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function formatTime(iso: string): string {
  return formatInTimeZone(new Date(iso), SWEDEN_TZ, 'HH:mm');
}

const DAY_LABELS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

export function InstructorPortalSchemaPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(toZonedTime(new Date(), SWEDEN_TZ)));

  const weekEnd = addDays(weekStart, 6);
  const from    = isoDate(weekStart);
  const to      = isoDate(weekEnd);

  const { data: slots, isLoading } = useInstructorPortalSlots(from, to);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  function slotsByDay(dayDate: Date) {
    const prefix = isoDate(dayDate);
    return (slots ?? []).filter(s => isoDate(toZonedTime(new Date(s.starts_at), SWEDEN_TZ)) === prefix);
  }

  const today = isoDate(toZonedTime(new Date(), SWEDEN_TZ));

  function formatWeekRange(): string {
    const startLabel = format(weekStart, 'd MMM', { locale: sv });
    const endLabel   = format(weekEnd, 'd MMM yyyy', { locale: sv });
    return `${startLabel} – ${endLabel}`;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Mitt schema</h1>
        <p className="text-sm text-gray-400 mt-0.5">Dina tidsluckor och bokningar</p>
      </div>

      {/* Week navigator */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 px-4 py-3 shadow-sm">
        <button
          onClick={() => setWeekStart(d => addDays(d, -7))}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-500" />
        </button>
        <p className="text-sm font-semibold text-gray-700">{formatWeekRange()}</p>
        <button
          onClick={() => setWeekStart(d => addDays(d, 7))}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Day pill row */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {days.map((day, i) => {
          const iso     = isoDate(day);
          const isToday = iso === today;
          const count   = slotsByDay(day).length;
          return (
            <div
              key={iso}
              className={cn(
                'flex flex-col items-center px-3 py-2 rounded-xl border min-w-[44px] shrink-0',
                isToday ? 'border-[#1055C9] bg-blue-50' : 'border-gray-100 bg-white',
              )}
            >
              <span className={cn('text-[10px] font-bold uppercase', isToday ? 'text-[#1055C9]' : 'text-gray-400')}>
                {DAY_LABELS[i]}
              </span>
              <span className={cn('text-base font-bold mt-0.5', isToday ? 'text-[#1055C9]' : 'text-gray-700')}>
                {day.getDate()}
              </span>
              {count > 0 && (
                <span
                  className="w-1.5 h-1.5 rounded-full mt-1"
                  style={{ background: BRAND }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      )}

      {/* Slots grouped by day */}
      {!isLoading && (
        <div className="space-y-4">
          {days.map((day) => {
            const daySlots = slotsByDay(day);
            if (daySlots.length === 0) return null;
            const dayLabel = day.toLocaleDateString('sv-SE', {
              weekday: 'long', day: 'numeric', month: 'long',
            }).replace(/^./, c => c.toUpperCase());

            return (
              <div key={isoDate(day)}>
                <p className="text-[#1055C9] text-xs font-bold uppercase tracking-wide mb-2">{dayLabel}</p>
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm divide-y divide-gray-50">
                  {daySlots.map((slot) => (
                    <div key={slot.id} className="flex items-center gap-4 px-4 py-3.5">
                      <div
                        className="w-1 h-10 rounded-full shrink-0"
                        style={{ background: slot.status === 'open' ? '#22c55e' : BRAND }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {formatTime(slot.starts_at)} – {formatTime(slot.ends_at)}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {slot.lesson_type_name ?? 'Körlektion'}
                          {slot.location_name ? ` · ${slot.location_name}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-gray-700">
                          {slot.current_bookings}/{slot.max_bookings}
                        </p>
                        <p className="text-[10px] text-gray-400">bokningar</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {(slots ?? []).length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 gap-2 text-center">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                <ChevronRight className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-sm text-gray-400">Inga tidsluckor denna vecka</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
