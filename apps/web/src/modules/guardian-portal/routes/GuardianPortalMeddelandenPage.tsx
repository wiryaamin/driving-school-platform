import { useMemo } from 'react';
import { CalendarDays, Clock, User, Bell, MessageSquare, Info, Phone, Mail, FileText } from 'lucide-react';
import { useGuardianMe, useGuardianBookings, type GuardianBooking } from '../hooks/useGuardianPortal.js';
import { cn } from '@/lib/utils.js';

const BRAND = '#2D5BE3';

function formatDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).replace(/^./, c => c.toUpperCase());
}

function formatTime(starts: string, ends: string): string {
  const t = (iso: string) => new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  return `${t(starts)} – ${t(ends)}`;
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

// ─── Lesson type → prep advice ────────────────────────────────────────────────

const PREP_MAP: Record<string, { icon: string; tip: string }> = {
  default:     { icon: '🚗', tip: 'Se till att eleven är utvilad och förberedd inför lektionen.' },
  körlektion:  { icon: '🚗', tip: 'Normal körlektion — se till att eleven är redo och i tid.' },
  motorväg:    { icon: '🚀', tip: 'Motorvägskörning kräver god koncentration. Se till att eleven är utvilad.' },
  risk: { icon: '⚠️', tip: 'Riskutbildning — viktig del av körkortet. Peka gärna på vikten av närvaro.' },
  teoriprov:   { icon: '📚', tip: 'Uppmuntra eleven att repetera teorin kvällen innan.' },
  uppkörning:  { icon: '🏆', tip: 'Körprov — stötta eleven med lugn och uppmuntran. Undvik stress.' },
  parkering:   { icon: '🅿️', tip: 'Parkeringsövning — precisionskörning som kräver tålamod.' },
  halk:        { icon: '❄️', tip: 'Halkövningar — se till att eleven är förberedd mentalt.' },
};

function getLessonPrep(name: string | null | undefined): { icon: string; tip: string } {
  if (!name) return PREP_MAP['default']!;
  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(PREP_MAP)) {
    if (lower.includes(key)) return val;
  }
  return PREP_MAP['default']!;
}

// ─── Upcoming lesson reminder ─────────────────────────────────────────────────

function LessonReminder({ booking }: { booking: GuardianBooking }) {
  const slot = booking.lesson_slots;
  if (!slot) return null;

  const days = daysUntil(slot.starts_at);
  const prep = getLessonPrep(slot.lesson_types?.name);

  const urgency = days <= 1 ? 'red' : days <= 3 ? 'amber' : 'blue';
  const urgencyLabel = days === 0 ? 'Idag!' : days === 1 ? 'Imorgon' : `Om ${days} dagar`;

  const colorMap = {
    red:   { outer: 'border-red-200 bg-red-50',   badge: 'bg-red-500',   text: 'text-red-700'   },
    amber: { outer: 'border-amber-200 bg-amber-50',badge: 'bg-amber-500', text: 'text-amber-700' },
    blue:  { outer: 'border-blue-100 bg-white',    badge: 'bg-blue-500',  text: 'text-blue-700'  },
  };
  const c = colorMap[urgency];

  return (
    <div className={cn('rounded-2xl border p-4 space-y-3', c.outer)}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm text-xl">
          {prep.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">
              {slot.lesson_types?.name ?? 'Körlektion'}
            </p>
            <span className={cn('text-[10px] font-bold text-white px-2 py-0.5 rounded-full', c.badge)}>
              {urgencyLabel}
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-1">
            <CalendarDays className="w-3 h-3 shrink-0" />
            {formatDateFull(slot.starts_at)}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(slot.starts_at, slot.ends_at)}
            </span>
            {slot.instructors && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {slot.instructors.first_name} {slot.instructors.last_name}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Prep tip for guardian */}
      <div className={cn('rounded-xl p-3 flex items-start gap-2', urgency === 'blue' ? 'bg-blue-50' : 'bg-white/70')}>
        <Info className={cn('w-3.5 h-3.5 shrink-0 mt-0.5', c.text)} />
        <p className={cn('text-xs leading-relaxed', c.text)}>{prep.tip}</p>
      </div>
    </div>
  );
}

// ─── Instructor note card ─────────────────────────────────────────────────────

function NoteCard({ booking }: { booking: GuardianBooking }) {
  const slot = booking.lesson_slots;
  if (!slot?.notes) return null;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-700">
          {slot.lesson_types?.name ?? 'Körlektion'}
        </p>
        <p className="text-[10px] text-gray-400">{formatDateFull(slot.starts_at)}</p>
      </div>
      {slot.instructors && (
        <p className="text-[10px] text-gray-400 flex items-center gap-1">
          <User className="w-3 h-3 shrink-0" />
          {slot.instructors.first_name} {slot.instructors.last_name}
        </p>
      )}
      <p className="text-xs text-gray-600 leading-relaxed border-l-2 border-blue-200 pl-3">
        {slot.notes}
      </p>
    </div>
  );
}

// ─── School contact card ──────────────────────────────────────────────────────

function SchoolContactCard({
  orgName,
  phone,
  email,
}: {
  orgName: string;
  phone:   string | null;
  email:   string | null;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <MessageSquare className="w-4 h-4" style={{ color: BRAND }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{orgName}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Har du frågor om elevens utbildning? Kontakta oss direkt.
          </p>
        </div>
      </div>
      {(phone ?? email) && (
        <div className="pl-12 space-y-2">
          {phone && (
            <a
              href={`tel:${phone}`}
              className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
            >
              <Phone className="w-4 h-4 shrink-0" />
              {phone}
            </a>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
            >
              <Mail className="w-4 h-4 shrink-0" />
              {email}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── GuardianPortalMeddelandenPage ────────────────────────────────────────────

export function GuardianPortalMeddelandenPage() {
  const { data: me }                = useGuardianMe();
  const { data: bookings = [] }     = useGuardianBookings();

  const recentNotes = useMemo(
    () => bookings
      .filter(b => b.status === 'completed' && Boolean(b.lesson_slots?.notes))
      .sort((a, b) => (b.lesson_slots?.starts_at ?? '').localeCompare(a.lesson_slots?.starts_at ?? ''))
      .slice(0, 3),
    [bookings],
  );

  const upcoming = useMemo(
    () => {
      const now = Date.now();
      return bookings
        .filter(b =>
          (b.status === 'confirmed' || b.status === 'reserved') &&
          b.lesson_slots &&
          new Date(b.lesson_slots.starts_at).getTime() > now,
        )
        .sort((a, b) =>
          (a.lesson_slots?.starts_at ?? '').localeCompare(b.lesson_slots?.starts_at ?? '')
        )
        .slice(0, 5);
    },
    [bookings],
  );

  const org     = me?.organization;
  const orgName = org?.name ?? 'Trafikskolan';

  return (
    <div className="space-y-6">

      {/* Upcoming lesson reminders */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-4 h-4" style={{ color: BRAND }} />
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: BRAND }}>
            Kommande lektioner
          </p>
        </div>

        {upcoming.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-2xl text-gray-400">
            <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Inga kommande lektioner</p>
            <p className="text-xs mt-1">Kontakta trafikskolan för att boka</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map(b => <LessonReminder key={b.id} booking={b} />)}
          </div>
        )}
      </div>

      {/* Recent instructor notes */}
      {recentNotes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4" style={{ color: BRAND }} />
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: BRAND }}>
              Senaste anteckningar
            </p>
          </div>
          <div className="space-y-2">
            {recentNotes.map(b => <NoteCard key={b.id} booking={b} />)}
          </div>
        </div>
      )}

      {/* School contact */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: BRAND }}>
          Från skolan
        </p>
        <SchoolContactCard
          orgName={orgName}
          phone={org?.phone ?? null}
          email={org?.email ?? null}
        />
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <p className="text-xs text-blue-700 leading-relaxed">
          <strong>Tips:</strong> Som vårdnadshavare spelar du en viktig roll i elevens framsteg.
          Uppmuntra eleven att öva hemma med teorin och att vara i god tid till varje lektion.
        </p>
      </div>
    </div>
  );
}
