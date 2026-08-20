import { useState, useEffect } from 'react';
import {
  CalendarCheck, Clock, Loader2, Save, CheckCircle,
  ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react';
import {
  useInstructorPortalUpcomingBookings,
  useInstructorPortalMarkAttendance,
  type InstructorPortalBooking,
} from '../hooks/useInstructorPortal.js';
import { cn } from '@/lib/utils.js';

const BRAND = '#1055C9';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

function formatDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).replace(/^./, c => c.toUpperCase());
}

function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

// ─── Attendance badge ─────────────────────────────────────────────────────────

function AttendanceBadge({ status }: { status: string | null }) {
  if (!status)               return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-500">Väntar</span>;
  if (status === 'present')  return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-green-100 text-green-700">Närvande</span>;
  if (status === 'absent')   return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-100 text-red-700">Uteblev</span>;
  return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-500">{status}</span>;
}

// ─── Evaluation form ──────────────────────────────────────────────────────────

function EvaluationForm({
  bookingId, studentName,
  initialOutcome, initialStrengths, initialImprovements, initialRecommendation,
}: {
  bookingId:              string;
  studentName:            string;
  initialOutcome:         string | null;
  initialStrengths:       string | null;
  initialImprovements:    string | null;
  initialRecommendation:  string | null;
}) {
  const markAttendance = useInstructorPortalMarkAttendance();
  const [outcome,        setOutcome]        = useState(initialOutcome        ?? '');
  const [strengths,      setStrengths]      = useState(initialStrengths      ?? '');
  const [improvements,   setImprovements]   = useState(initialImprovements   ?? '');
  const [recommendation, setRecommendation] = useState(initialRecommendation ?? '');
  const [saved,          setSaved]          = useState(false);

  const firstName = studentName.split(' ')[0] ?? studentName;

  function handleSave() {
    markAttendance.mutate(
      {
        bookingId,
        status:                    'present',
        evaluation_outcome:        outcome       || undefined,
        evaluation_strengths:      strengths     || undefined,
        evaluation_improvements:   improvements  || undefined,
        evaluation_recommendation: recommendation || undefined,
      },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2500);
        },
      },
    );
  }

  return (
    <div className="mt-3 space-y-3 pt-3 border-t border-gray-100">
      <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">
        Lektionsutvärdering — {firstName}
      </p>

      <div>
        <label className="block text-[11px] text-gray-400 font-medium mb-1">Lektionsutfall</label>
        <textarea
          value={outcome}
          onChange={e => setOutcome(e.target.value)}
          rows={2}
          placeholder="Vad genomfördes och hur gick det?"
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 text-gray-700 placeholder:text-gray-300"
        />
      </div>
      <div>
        <label className="block text-[11px] text-gray-400 font-medium mb-1">Styrkor</label>
        <textarea
          value={strengths}
          onChange={e => setStrengths(e.target.value)}
          rows={2}
          placeholder="Vad gick bra?"
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 text-gray-700 placeholder:text-gray-300"
        />
      </div>
      <div>
        <label className="block text-[11px] text-gray-400 font-medium mb-1">Förbättringsområden</label>
        <textarea
          value={improvements}
          onChange={e => setImprovements(e.target.value)}
          rows={2}
          placeholder="Vad behöver mer övning?"
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 text-gray-700 placeholder:text-gray-300"
        />
      </div>
      <div>
        <label className="block text-[11px] text-gray-400 font-medium mb-1">Rekommendation inför nästa lektion</label>
        <textarea
          value={recommendation}
          onChange={e => setRecommendation(e.target.value)}
          rows={2}
          placeholder="Fokus för nästa tillfälle?"
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 text-gray-700 placeholder:text-gray-300"
        />
      </div>

      {markAttendance.isError && (
        <p className="text-xs text-red-600">Kunde inte spara — försök igen.</p>
      )}

      <button
        onClick={handleSave}
        disabled={markAttendance.isPending}
        className="w-full py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
        style={{ background: saved ? '#22c55e' : BRAND }}
      >
        {markAttendance.isPending
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : saved
          ? <CheckCircle className="w-3.5 h-3.5" />
          : <Save className="w-3.5 h-3.5" />}
        {markAttendance.isPending ? 'Sparar…' : saved ? 'Sparad!' : 'Spara utvärdering'}
      </button>
    </div>
  );
}

// ─── Booking card ─────────────────────────────────────────────────────────────

function BookingCard({ b }: { b: InstructorPortalBooking }) {
  const markAttendance = useInstructorPortalMarkAttendance();
  const [marking,        setMarking]        = useState<string | null>(null);
  const [evalOpen,       setEvalOpen]       = useState(false);
  const [pendingAbsent,  setPendingAbsent]  = useState(false);

  // Same arm-then-confirm pattern as instructor-app's SlotCard — a credit-
  // affecting action shouldn't fire on a single accidental tap. Auto-resets
  // after 4s if ignored.
  useEffect(() => {
    if (!pendingAbsent) return;
    const t = setTimeout(() => setPendingAbsent(false), 4_000);
    return () => clearTimeout(t);
  }, [pendingAbsent]);

  const now        = new Date();
  const startTime  = new Date(b.starts_at);
  const endTime    = new Date(b.ends_at);
  const hasStarted = now >= startTime;
  const hasEnded   = now >= endTime;
  const isActive   = hasStarted && !hasEnded;

  const studentName = `${b.student_first_name ?? '–'} ${b.student_last_name ?? ''}`.trim();
  const evalExists  = Boolean(
    b.evaluation_outcome || b.evaluation_strengths ||
    b.evaluation_improvements || b.evaluation_recommendation,
  );

  return (
    <div className={cn(
      'px-4 py-3.5',
      isActive && !b.attendance_status ? 'bg-blue-50/40' : '',
    )}>
      {/* Active lesson indicator */}
      {isActive && !b.attendance_status && (
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide">Lektion pågår nu</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
          style={{ background: b.attendance_status === 'present' ? '#22c55e' : b.attendance_status === 'absent' ? '#ef4444' : BRAND }}
        >
          {(b.student_first_name ?? 'E').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-tight">{studentName}</p>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTime(b.starts_at)} – {formatTime(b.ends_at)}
            {b.lesson_type_name ? ` · ${b.lesson_type_name}` : ''}
          </p>
        </div>
        <AttendanceBadge status={b.attendance_status} />
      </div>

      {/* Attendance actions */}
      {!b.attendance_status && hasStarted && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => {
              setMarking(b.id);
              markAttendance.mutate(
                { bookingId: b.id, status: 'present' },
                { onSettled: () => setMarking(null) },
              );
            }}
            disabled={markAttendance.isPending && marking === b.id}
            className="flex-1 py-2 rounded-xl text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200 transition-colors disabled:opacity-50"
          >
            {markAttendance.isPending && marking === b.id
              ? <Loader2 className="w-3 h-3 animate-spin mx-auto" />
              : 'Närvande'}
          </button>
          {!pendingAbsent ? (
            <button
              onClick={() => setPendingAbsent(true)}
              disabled={markAttendance.isPending && marking === b.id}
              className="flex-1 py-2 rounded-xl text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-50"
            >
              Uteblev
            </button>
          ) : (
            <div className="flex-1 flex items-center gap-2 rounded-xl border-2 border-red-300 px-2.5 py-1.5">
              <span className="text-[10px] font-semibold text-red-700 flex-1">Bekräfta?</span>
              <button
                onClick={() => {
                  setPendingAbsent(false);
                  setMarking(b.id);
                  markAttendance.mutate(
                    { bookingId: b.id, status: 'absent' },
                    { onSettled: () => setMarking(null) },
                  );
                }}
                disabled={markAttendance.isPending && marking === b.id}
                className="px-2 py-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-[10px] font-bold rounded-lg transition-colors"
              >
                Ja
              </button>
              <button
                onClick={() => setPendingAbsent(false)}
                className="px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-lg transition-colors"
              >
                Nej
              </button>
            </div>
          )}
        </div>
      )}

      {/* Evaluation toggle — only for completed lessons */}
      {b.attendance_status === 'present' && (
        <div className="mt-3">
          <button
            onClick={() => setEvalOpen(v => !v)}
            className={cn(
              'w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border',
              evalOpen
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : evalExists
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300',
            )}
          >
            {evalExists && !evalOpen ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : null}
            {evalOpen ? 'Stäng utvärdering' : evalExists ? 'Visa / redigera utvärdering' : 'Utvärdera lektion'}
            {evalOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {evalOpen && (
            <EvaluationForm
              bookingId={b.id}
              studentName={studentName}
              initialOutcome={b.evaluation_outcome}
              initialStrengths={b.evaluation_strengths}
              initialImprovements={b.evaluation_improvements}
              initialRecommendation={b.evaluation_recommendation}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── InstructorPortalBokningarPage ────────────────────────────────────────────

export function InstructorPortalBokningarPage() {
  const { data: bookings, isLoading, isError } = useInstructorPortalUpcomingBookings();

  const grouped = (bookings ?? []).reduce<Record<string, InstructorPortalBooking[]>>((acc, b) => {
    const day = isoDate(b.starts_at);
    if (!acc[day]) acc[day] = [];
    acc[day]!.push(b);
    return acc;
  }, {});

  const today = isoDate(new Date().toISOString());

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Bokningar</h1>
        <p className="text-sm text-gray-400 mt-0.5">Kommande och dagens lektioner</p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl p-4">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-600">Kunde inte hämta bokningar. Försök igen senare.</p>
        </div>
      )}

      {!isLoading && !isError && Object.keys(grouped).length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
            <CalendarCheck className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-sm text-gray-400">Inga kommande bokningar</p>
        </div>
      )}

      {!isLoading && Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, dayBookings]) => {
          const isToday  = day === today;
          const dayLabel = formatDateFull(`${day}T12:00:00`);

          return (
            <div key={day}>
              <p
                className="text-xs font-bold uppercase tracking-wide mb-2"
                style={{ color: isToday ? BRAND : '#6b7280' }}
              >
                {isToday ? `Idag — ${dayLabel}` : dayLabel}
              </p>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm divide-y divide-gray-50">
                {dayBookings
                  .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
                  .map(b => (
                    <BookingCard key={b.id} b={b} />
                  ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}
