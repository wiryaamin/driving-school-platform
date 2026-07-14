import { useMemo } from 'react';
import { CalendarDays, Clock, User, CheckCircle2, XCircle, AlertCircle, FileText, MapPin, Car, CalendarPlus } from 'lucide-react';
import { useGuardianMe, useGuardianBookings, type GuardianBooking } from '../hooks/useGuardianPortal.js';
import { cn } from '@/lib/utils.js';

const BRAND = '#2D5BE3';

// ─── ICS calendar download ────────────────────────────────────────────────────

function toIcsDate(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '').slice(0, 15) + 'Z';
}

function downloadIcs(booking: GuardianBooking, orgName: string): void {
  const slot = booking.lesson_slots;
  if (!slot) return;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Föräldraskollen//Guardian Portal//SV',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `DTSTART:${toIcsDate(slot.starts_at)}`,
    `DTEND:${toIcsDate(slot.ends_at)}`,
    `SUMMARY:${slot.lesson_types?.name ?? 'Körlektion'} – ${orgName}`,
  ];

  const parts: string[] = [];
  if (slot.instructors) {
    parts.push(`Instruktör: ${slot.instructors.first_name} ${slot.instructors.last_name}`);
  }
  if (slot.organization_locations) {
    parts.push(`Plats: ${slot.organization_locations.address_line1}\\, ${slot.organization_locations.city}`);
  }
  if (parts.length > 0) lines.push(`DESCRIPTION:${parts.join('\\n')}`);
  if (slot.organization_locations) {
    lines.push(`LOCATION:${slot.organization_locations.address_line1}\\, ${slot.organization_locations.city}`);
  }
  lines.push(`UID:${booking.id}@foraldraskolle.se`);
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `korlektion-${new Date(slot.starts_at).toLocaleDateString('sv-SE')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).replace(/^./, c => c.toUpperCase());
}

function formatTime(starts: string, ends: string): string {
  const t = (iso: string) => new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  return `${t(starts)} – ${t(ends)}`;
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
      <span className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
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

function BookingCard({ booking, past, orgName }: { booking: GuardianBooking; past: boolean; orgName: string }) {
  const slot = booking.lesson_slots;
  if (!slot) return null;

  return (
    <div className={cn(
      'bg-white rounded-2xl border p-4 space-y-2',
      past ? 'border-gray-100 opacity-80' : 'border-gray-100 shadow-sm',
    )}>
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
          <span>{slot.organization_locations.name} · {slot.organization_locations.address_line1}, {slot.organization_locations.city}</span>
        </div>
      )}
      {slot.notes && (
        <div className="flex items-start gap-1.5 pt-1 border-t border-gray-50">
          <FileText className="w-3 h-3 shrink-0 text-gray-400 mt-0.5" />
          <p className="text-xs text-gray-500 leading-relaxed">{slot.notes}</p>
        </div>
      )}
      {!past && (
        <div className="flex items-center justify-between pt-1 border-t border-gray-50">
          {slot.organization_locations ? (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                `${slot.organization_locations.address_line1}, ${slot.organization_locations.city}, Sverige`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <MapPin className="w-3.5 h-3.5" />
              Vägbeskrivning
            </a>
          ) : (
            <div />
          )}
          <button
            onClick={() => downloadIcs(booking, orgName)}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Lägg till i kalender
          </button>
        </div>
      )}
    </div>
  );
}

export function GuardianPortalSchemaPage() {
  const { data: me }                                 = useGuardianMe();
  const { data: bookings = [], isLoading, isError } = useGuardianBookings();

  const orgName = me?.organization.name ?? 'Trafikskolan';

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const up: GuardianBooking[]  = [];
    const pa: GuardianBooking[]  = [];
    for (const b of bookings) {
      if (!b.lesson_slots) continue;
      const ts = new Date(b.lesson_slots.starts_at).getTime();
      const isUpcoming = ts > now && (b.status === 'confirmed' || b.status === 'reserved');
      if (isUpcoming) {
        up.push(b);
      } else {
        pa.push(b);
      }
    }
    up.sort((a, b) => (a.lesson_slots?.starts_at ?? '').localeCompare(b.lesson_slots?.starts_at ?? ''));
    pa.sort((a, b) => (b.lesson_slots?.starts_at ?? '').localeCompare(a.lesson_slots?.starts_at ?? ''));
    return { upcoming: up, past: pa };
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

      {/* Upcoming */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: BRAND }}>
          Kommande lektioner
        </p>
        {upcoming.length === 0 ? (
          <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-2xl">
            <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Inga kommande bokningar</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map(b => <BookingCard key={b.id} booking={b} past={false} orgName={orgName} />)}
          </div>
        )}
      </div>

      {/* Past */}
      {past.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-3 text-gray-400">
            Historik
          </p>
          <div className="space-y-3">
            {past.map(b => <BookingCard key={b.id} booking={b} past={true} orgName={orgName} />)}
          </div>
        </div>
      )}
    </div>
  );
}
