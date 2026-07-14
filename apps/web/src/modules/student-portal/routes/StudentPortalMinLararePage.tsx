import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  User, Phone, Mail, Calendar, ChevronRight, Loader2, Star,
} from 'lucide-react';
import {
  usePortalBookings,
  usePortalHistory,
} from '../hooks/useStudentPortal.js';
import { cn } from '@/lib/utils.js';

const BRAND = '#684EFF';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).replace(/^./, c => c.toUpperCase());
}

// ─── Derive primary instructor from bookings history ──────────────────────────

function usePrimaryInstructor() {
  const { data: bookings, isLoading: bookingsLoading } = usePortalBookings();
  const { data: history, isLoading: historyLoading } = usePortalHistory();

  const instructor = useMemo(() => {
    const all = [
      ...(bookings ?? []).map(b => ({
        first: b.instructor_first_name,
        last:  b.instructor_last_name,
        upcoming: true,
      })),
      ...(history ?? []).map(b => ({
        first: b.instructor_first_name,
        last:  b.instructor_last_name,
        upcoming: false,
      })),
    ].filter(b => b.first);

    if (all.length === 0) return null;

    // Find most frequent instructor
    const counts: Record<string, { first: string; last: string | null; count: number }> = {};
    for (const b of all) {
      const key = `${b.first} ${b.last ?? ''}`.trim();
      if (!counts[key]) counts[key] = { first: b.first!, last: b.last, count: 0 };
      counts[key]!.count++;
    }

    return Object.values(counts).sort((a, b) => b.count - a.count)[0] ?? null;
  }, [bookings, history]);

  const upcomingWithInstructor = useMemo(() => {
    if (!instructor) return [];
    const key = `${instructor.first} ${instructor.last ?? ''}`.trim();
    return (bookings ?? [])
      .filter(b => {
        const bKey = `${b.instructor_first_name ?? ''} ${b.instructor_last_name ?? ''}`.trim();
        return bKey === key && new Date(b.starts_at) > new Date() && b.status === 'confirmed';
      })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, 3);
  }, [bookings, instructor]);

  return {
    instructor,
    upcomingWithInstructor,
    isLoading: bookingsLoading || historyLoading,
  };
}

// ─── Rating stars ─────────────────────────────────────────────────────────────

function RatingStars({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn('w-4 h-4', i < rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200')}
        />
      ))}
    </div>
  );
}

// ─── StudentPortalMinLararePage ───────────────────────────────────────────────

export function StudentPortalMinLararePage() {
  const { instructor, upcomingWithInstructor, isLoading } = usePrimaryInstructor();
  const { data: history } = usePortalHistory();

  const avgRating = useMemo(() => {
    if (!instructor || !history) return null;
    const key = `${instructor.first} ${instructor.last ?? ''}`.trim();
    const rated = history.filter(h => {
      const hKey = `${h.instructor_first_name ?? ''} ${h.instructor_last_name ?? ''}`.trim();
      return hKey === key && h.performance_rating;
    });
    if (rated.length === 0) return null;
    return Math.round(rated.reduce((s, h) => s + (h.performance_rating ?? 0), 0) / rated.length);
  }, [instructor, history]);

  const completedCount = useMemo(() => {
    if (!instructor || !history) return 0;
    const key = `${instructor.first} ${instructor.last ?? ''}`.trim();
    return history.filter(h => {
      const hKey = `${h.instructor_first_name ?? ''} ${h.instructor_last_name ?? ''}`.trim();
      return hKey === key && h.status === 'completed';
    }).length;
  }, [instructor, history]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Min trafikutbildare</h1>
        <p className="text-sm text-gray-400 mt-0.5">Din tilldelade lärare</p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      )}

      {!isLoading && !instructor && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm text-center space-y-3">
          <div
            className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
            style={{ background: `${BRAND}10` }}
          >
            <User className="w-8 h-8" style={{ color: BRAND }} />
          </div>
          <p className="text-sm font-semibold text-gray-700">Ingen lärare tilldelad</p>
          <p className="text-xs text-gray-400 leading-relaxed max-w-xs mx-auto">
            Du har inte bokats in med en lärare ännu. Boka din första lektion för att komma igång!
          </p>
          <Link
            to="/portal/boka"
            className="inline-flex items-center gap-2 mt-2 px-5 py-2.5 rounded-full text-sm font-bold text-white"
            style={{ background: BRAND }}
          >
            Boka lektion
          </Link>
        </div>
      )}

      {!isLoading && instructor && (
        <>
          {/* Instructor profile card */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 text-xl font-bold text-white"
                style={{ background: `linear-gradient(135deg, ${BRAND} 0%, #0d48b2 100%)` }}
              >
                {instructor.first.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-gray-900">
                  {instructor.first} {instructor.last ?? ''}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Trafikklärare</p>
                {avgRating && (
                  <div className="mt-1.5">
                    <RatingStars rating={avgRating} />
                  </div>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-gray-900">{completedCount}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Genomförda lektioner</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-gray-900">{upcomingWithInstructor.length}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Kommande bokningar</p>
              </div>
            </div>
          </div>

          {/* Contact info placeholder */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="px-4 py-3.5 border-b border-gray-50 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Phone className="w-4 h-4" style={{ color: BRAND }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400">Telefon</p>
                <p className="text-sm text-gray-500 italic">Kontaktuppgifter ej publika</p>
              </div>
            </div>
            <div className="px-4 py-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4" style={{ color: BRAND }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400">E-post</p>
                <p className="text-sm text-gray-500 italic">Kontaktuppgifter ej publika</p>
              </div>
            </div>
          </div>

          {/* Upcoming lessons together */}
          {upcomingWithInstructor.length > 0 && (
            <div>
              <p className="text-[#684EFF] text-xs font-bold uppercase tracking-wide mb-2">
                Kommande lektioner med {instructor.first}
              </p>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm divide-y divide-gray-50">
                {upcomingWithInstructor.map(b => (
                  <div key={b.id} className="flex items-center gap-4 px-4 py-3.5">
                    <div
                      className="w-1.5 h-10 rounded-full shrink-0"
                      style={{ background: BRAND }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 capitalize leading-tight">
                        {formatDate(b.starts_at)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatTime(b.starts_at)} – {formatTime(b.ends_at)}
                        {b.lesson_type_name ? ` · ${b.lesson_type_name}` : ''}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Book more */}
          <Link
            to="/portal/boka"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border text-sm font-semibold transition-colors hover:bg-blue-50"
            style={{ borderColor: BRAND, color: BRAND }}
          >
            <Calendar className="w-4 h-4" />
            Boka fler lektioner med {instructor.first}
          </Link>
        </>
      )}
    </div>
  );
}
