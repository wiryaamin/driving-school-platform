import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, Clock, User, AlertCircle, CheckCircle2, XCircle,
  MapPin, Car, ChevronRight, BookOpen,
} from 'lucide-react';
import { useGuardianBookings, type GuardianBooking } from '../hooks/useGuardianPortal.js';
import { cn } from '@/lib/utils.js';

const BRAND = '#1055C9';

function formatDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).replace(/^./, c => c.toUpperCase());
}

function formatTime(starts: string, ends: string): string {
  const t = (iso: string) => new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  return `${t(starts)} – ${t(ends)}`;
}

function monthLabel(iso: string): string {
  return new Date(iso)
    .toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })
    .replace(/^./, c => c.toUpperCase());
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function AttendanceBadge({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
        <CheckCircle2 className="w-3 h-3" /> Genomförd
      </span>
    );
  }
  if (status === 'no_show') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
        <XCircle className="w-3 h-3" /> Uteblev
      </span>
    );
  }
  if (status === 'cancelled') {
    return (
      <span className="text-xs font-medium text-gray-600 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
        Avbokad
      </span>
    );
  }
  return (
    <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
      Bokad
    </span>
  );
}

function HistoryCard({ booking }: { booking: GuardianBooking }) {
  const slot = booking.lesson_slots;
  if (!slot) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            {slot.lesson_types?.name ?? 'Körlektion'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
            <CalendarDays className="w-3 h-3 shrink-0" />
            {formatDateFull(slot.starts_at)}
          </p>
        </div>
        <AttendanceBadge status={booking.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3 shrink-0" />
          {formatTime(slot.starts_at, slot.ends_at)}
        </span>
        {slot.instructors && (
          <span className="flex items-center gap-1">
            <User className="w-3 h-3 shrink-0" />
            {slot.instructors.first_name} {slot.instructors.last_name}
          </span>
        )}
        {slot.vehicles && (
          <span className="flex items-center gap-1">
            <Car className="w-3 h-3 shrink-0" />
            {slot.vehicles.make} {slot.vehicles.model}
          </span>
        )}
      </div>
      {slot.organization_locations && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <MapPin className="w-3 h-3 shrink-0" />
          <span>
            {slot.organization_locations.name} · {slot.organization_locations.address_line1},{' '}
            {slot.organization_locations.city}
          </span>
        </div>
      )}
    </div>
  );
}

export function GuardianPortalBokningarPage() {
  const { data: bookings = [], isLoading, isError } = useGuardianBookings();

  const { upcomingCount, history, stats } = useMemo(() => {
    const now = Date.now();
    const past: GuardianBooking[] = [];
    let upcoming = 0;

    for (const b of bookings) {
      if (!b.lesson_slots) continue;
      const ts = new Date(b.lesson_slots.starts_at).getTime();
      const futureAndActive =
        ts > now && (b.status === 'confirmed' || b.status === 'reserved');

      if (futureAndActive) {
        upcoming++;
      } else {
        past.push(b);
      }
    }

    // Sort newest first
    past.sort((a, b) =>
      (b.lesson_slots?.starts_at ?? '').localeCompare(a.lesson_slots?.starts_at ?? ''),
    );

    // Group by month
    const map = new Map<string, { label: string; items: GuardianBooking[] }>();
    for (const b of past) {
      const key   = monthKey(b.lesson_slots!.starts_at);
      const label = monthLabel(b.lesson_slots!.starts_at);
      if (!map.has(key)) map.set(key, { label, items: [] });
      map.get(key)!.items.push(b);
    }

    return {
      upcomingCount: upcoming,
      history:       [...map.values()],
      stats: {
        completed: past.filter(b => b.status === 'completed').length,
        cancelled: past.filter(b => b.status === 'cancelled').length,
        noShow:    past.filter(b => b.status === 'no_show').length,
      },
    };
  }, [bookings]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 rounded-2xl">
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
        <p className="text-sm text-red-600">Kunde inte hämta bokningar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: BRAND }}>
          Bokningshistorik
        </p>
        <p className="text-xs text-gray-400">Alla genomförda och avbokade lektioner</p>
      </div>

      {/* Upcoming banner — link to Schema */}
      {upcomingCount > 0 && (
        <Link
          to="/guardian/schema"
          className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-2xl hover:bg-blue-100 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <CalendarDays className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-900">
              {upcomingCount} kommande lektion{upcomingCount > 1 ? 'er' : ''}
            </p>
            <p className="text-xs text-blue-600 mt-0.5">Se Schema för kommande bokningar</p>
          </div>
          <ChevronRight className="w-4 h-4 text-blue-400 shrink-0" />
        </Link>
      )}

      {/* Stats row */}
      {(stats.completed + stats.cancelled + stats.noShow) > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center shadow-sm">
            <p className="text-xl font-bold text-green-600 tabular-nums">{stats.completed}</p>
            <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">Genomförda</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center shadow-sm">
            <p className="text-xl font-bold text-gray-500 tabular-nums">{stats.cancelled}</p>
            <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">Avbokade</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center shadow-sm">
            <p className="text-xl font-bold text-red-500 tabular-nums">{stats.noShow}</p>
            <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">Uteblivna</p>
          </div>
        </div>
      )}

      {/* Month-grouped history */}
      {history.length === 0 ? (
        <div className="text-center py-14 bg-gray-50 rounded-2xl text-gray-400">
          <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Ingen historik ännu</p>
          <p className="text-xs mt-1">Genomförda lektioner visas här</p>
        </div>
      ) : (
        <div className="space-y-6">
          {history.map(({ label, items }) => (
            <div key={label}>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
                <span className={cn(
                  'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                  'bg-gray-100 text-gray-500',
                )}>
                  {items.length} lektion{items.length > 1 ? 'er' : ''}
                </span>
              </div>
              <div className="space-y-2">
                {items.map(b => <HistoryCard key={b.id} booking={b} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
