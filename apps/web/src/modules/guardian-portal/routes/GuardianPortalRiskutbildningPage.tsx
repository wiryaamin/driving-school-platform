import { useMemo } from 'react';
import { CheckCircle2, Circle, CalendarDays, Clock, User, AlertCircle, Phone, Mail } from 'lucide-react';
import { useGuardianMe, useGuardianProgress, useGuardianBookings } from '../hooks/useGuardianPortal.js';
import { cn } from '@/lib/utils.js';

const BRAND = '#2D5BE3';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).replace(/^./, c => c.toUpperCase());
}

function formatTime(starts: string, ends: string): string {
  const t = (iso: string) => new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  return `${t(starts)} – ${t(ends)}`;
}

function RiskCard({
  number,
  title,
  description,
  completedAt,
  upcomingBooking,
  icon,
}: {
  number:          1 | 2;
  title:           string;
  description:     string;
  completedAt:     string | null;
  upcomingBooking: { starts_at: string; ends_at: string; instructor: string | null } | null;
  icon:            string;
}) {
  const done = Boolean(completedAt);

  return (
    <div className={cn(
      'bg-white rounded-2xl border p-5 space-y-4 shadow-sm',
      done ? 'border-green-200' : upcomingBooking ? 'border-blue-200' : 'border-gray-100',
    )}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn(
          'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-2xl',
          done ? 'bg-green-100' : 'bg-blue-50',
        )}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-base font-bold text-gray-900">{title}</p>
            {done ? (
              <span className="flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> Klar
              </span>
            ) : upcomingBooking ? (
              <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">Bokad</span>
            ) : (
              <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Ej genomförd</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
      </div>

      {/* Completed date */}
      {done && completedAt && (
        <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl">
          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-green-800">Avklarat</p>
            <p className="text-xs text-green-600">{formatDate(completedAt)}</p>
          </div>
        </div>
      )}

      {/* Upcoming booking */}
      {!done && upcomingBooking && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl">
          <CalendarDays className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-blue-800">Bokad</p>
            <p className="text-xs text-blue-600">{formatDateTime(upcomingBooking.starts_at)}</p>
            <p className="text-xs text-blue-500 mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(upcomingBooking.starts_at, upcomingBooking.ends_at)}
              {upcomingBooking.instructor && (
                <>
                  <span className="mx-1">·</span>
                  <User className="w-3 h-3" />
                  {upcomingBooking.instructor}
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Not started hint */}
      {!done && !upcomingBooking && (
        <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
          <Circle className="w-4 h-4 text-gray-300 shrink-0" />
          <p className="text-xs text-gray-500">
            {number === 1
              ? 'Genomförs på en halkbana med instruktör. Kontakta skolan för att boka.'
              : 'Genomförs mot slutet av körkortsutbildningen. Kräver godkänd Risk 1.'}
          </p>
        </div>
      )}
    </div>
  );
}

export function GuardianPortalRiskutbildningPage() {
  const { data: me }                            = useGuardianMe();
  const { data: progress, isLoading, isError } = useGuardianProgress();
  const { data: bookings = [] }                 = useGuardianBookings();

  const upcomingRisk1 = useMemo(() => {
    const now = Date.now();
    const b = bookings.find(b => {
      const name = b.lesson_slots?.lesson_types?.name?.toLowerCase() ?? '';
      const ts   = b.lesson_slots ? new Date(b.lesson_slots.starts_at).getTime() : 0;
      return ts > now && (name.includes('risk 1') || name.includes('risk1') || name.includes('halk'));
    });
    if (!b?.lesson_slots) return null;
    const instr = b.lesson_slots.instructors;
    return {
      starts_at:  b.lesson_slots.starts_at,
      ends_at:    b.lesson_slots.ends_at,
      instructor: instr ? `${instr.first_name} ${instr.last_name}` : null,
    };
  }, [bookings]);

  const upcomingRisk2 = useMemo(() => {
    const now = Date.now();
    const b = bookings.find(b => {
      const name = b.lesson_slots?.lesson_types?.name?.toLowerCase() ?? '';
      const ts   = b.lesson_slots ? new Date(b.lesson_slots.starts_at).getTime() : 0;
      return ts > now && (name.includes('risk 2') || name.includes('risk2') || name.includes('mörk'));
    });
    if (!b?.lesson_slots) return null;
    const instr = b.lesson_slots.instructors;
    return {
      starts_at:  b.lesson_slots.starts_at,
      ends_at:    b.lesson_slots.ends_at,
      instructor: instr ? `${instr.first_name} ${instr.last_name}` : null,
    };
  }, [bookings]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => <div key={i} className="h-40 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  if (isError || !progress) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 rounded-2xl">
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
        <p className="text-sm text-red-600">Kunde inte hämta riskutbildningsdata.</p>
      </div>
    );
  }

  const bothDone = Boolean(progress.risk1_completed_at && progress.risk2_completed_at);

  return (
    <div className="space-y-5">

      {/* Hero */}
      <div
        className="rounded-2xl p-5 text-white"
        style={{ background: 'linear-gradient(135deg, #2D5BE3 0%, #0d48b2 100%)' }}
      >
        <p className="text-white/70 text-xs font-bold uppercase tracking-wide mb-1">Riskutbildning</p>
        <p className="text-xl font-bold">
          {bothDone ? 'Båda delarna klara 🎉' : 'Obligatorisk utbildning'}
        </p>
        <p className="text-white/70 text-sm mt-1">
          Riskutbildningen är en del av körkortsutbildningen och krävs för att få ta körprov.
        </p>
        <div className="flex items-center gap-3 mt-3">
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold',
            progress.risk1_completed_at ? 'bg-green-500 text-white' : 'bg-white/20 text-white',
          )}>
            {progress.risk1_completed_at ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
            Risk 1
          </div>
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold',
            progress.risk2_completed_at ? 'bg-green-500 text-white' : 'bg-white/20 text-white',
          )}>
            {progress.risk2_completed_at ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
            Risk 2
          </div>
        </div>
      </div>

      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: BRAND }}>Detaljer</p>

      <RiskCard
        number={1}
        title="Riskettan (Risk 1)"
        description="Halkövningar och riskhantering på bana"
        completedAt={progress.risk1_completed_at}
        upcomingBooking={upcomingRisk1}
        icon="❄️"
      />

      <RiskCard
        number={2}
        title="Risktvåan (Risk 2)"
        description="Mörkerövning och trötthetsrisker"
        completedAt={progress.risk2_completed_at}
        upcomingBooking={upcomingRisk2}
        icon="🌙"
      />

      {/* Info note */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <p className="text-xs text-blue-700 leading-relaxed">
          <strong>Information:</strong> Riskutbildning Risk 1 genomförs på en halkbana, oftast i samarbete med en extern aktör.
          Risk 2 genomförs vanligtvis mot slutet av utbildningen och fokuserar på mörker och trötthet.
          Boka via din trafikskola.
        </p>
      </div>

      {/* Contact school — show when something still needs booking */}
      {(!progress.risk1_completed_at || !progress.risk2_completed_at) &&
       (me?.organization.phone ?? me?.organization.email) && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: BRAND }}>
            Kontakta trafikskolan
          </p>
          <p className="text-xs text-gray-500">
            Kontakta oss för att boka{' '}
            {!progress.risk1_completed_at && !progress.risk2_completed_at
              ? 'Risk 1 och Risk 2'
              : !progress.risk1_completed_at
                ? 'Risk 1'
                : 'Risk 2'}
            .
          </p>
          {me?.organization.phone && (
            <a
              href={`tel:${me.organization.phone}`}
              className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
            >
              <Phone className="w-4 h-4 shrink-0" />
              {me.organization.phone}
            </a>
          )}
          {me?.organization.email && (
            <a
              href={`mailto:${me.organization.email}`}
              className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
            >
              <Mail className="w-4 h-4 shrink-0" />
              {me.organization.email}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
