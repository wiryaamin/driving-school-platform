import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, TrendingUp, CreditCard, Route, ShieldCheck,
  MessageSquare, ChevronRight, CheckCircle2, AlertCircle,
  MapPin, Info,
} from 'lucide-react';
import { useGuardianSession } from './GuardianPortalLayout.js';
import {
  useGuardianMe, useGuardianBookings, useGuardianProgress, useGuardianBalance,
  computeGuardianAlerts,
  type GuardianAlert,
} from '../hooks/useGuardianPortal.js';
import { cn } from '@/lib/utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const BRAND   = '#2D5BE3'; // mobile
const PRIMARY = '#2D5BE3'; // desktop

const STAGE_ORDER = [
  'not_started', 'theory_study', 'risk1_booked', 'risk1_completed',
  'risk2_booked', 'risk2_completed', 'theory_exam_booked', 'theory_passed',
  'practical_exam_booked', 'practical_passed', 'licence_issued',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  not_started:           'Ej påbörjad',
  theory_study:          'Teoristudier',
  risk1_booked:          'Risk 1 bokad',
  risk1_completed:       'Risk 1 klar',
  risk2_booked:          'Risk 2 bokad',
  risk2_completed:       'Risk 2 klar',
  theory_exam_booked:    'Teoriprov bokat',
  theory_passed:         'Teoriprov godkänt',
  practical_exam_booked: 'Uppkörning bokad',
  practical_passed:      'Körprov godkänt',
  licence_issued:        'Körkort utfärdat',
};

const STAGE_SHORT: Record<string, string> = {
  not_started:           'Ej börjad',
  theory_study:          'Teori',
  risk1_booked:          'Risk 1',
  risk1_completed:       'Risk 1',
  risk2_booked:          'Risk 2',
  risk2_completed:       'Risk 2',
  theory_exam_booked:    'Teoriprov',
  theory_passed:         'Teori ✓',
  practical_exam_booked: 'Uppkörning',
  practical_passed:      'Körprov ✓',
  licence_issued:        'Körkort 🎉',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).replace(/^./, c => c.toUpperCase());
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

function formatSEK(n: number): string {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(n);
}

function stagePctFrom(stage: string): number {
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx < 0) return 0;
  return stage === 'licence_issued' ? 100 : Math.round((idx / (STAGE_ORDER.length - 1)) * 100);
}

// ─── Mobile components ────────────────────────────────────────────────────────

function MobileGreeting() {
  const session     = useGuardianSession();
  const { data: me } = useGuardianMe();

  const firstName   = session.guardian_name.split(' ')[0] ?? session.guardian_name;
  const studentName = me ? `${me.student.first_name} ${me.student.last_name}` : '…';
  const hour        = new Date().getHours();
  const greeting    = hour < 5 ? 'God natt' : hour < 12 ? 'God morgon' : hour < 18 ? 'God eftermiddag' : 'God kväll';

  return (
    <div>
      <p className="text-gray-400 text-sm font-medium">{greeting},</p>
      <h1 className="text-gray-900 font-bold text-[2rem] mt-0.5 leading-tight">{firstName}! 👋</h1>
      <p className="text-gray-500 text-sm mt-1">
        Du följer utbildningen för{' '}
        <Link to="/guardian/framsteg" className="font-semibold" style={{ color: BRAND }}>
          {studentName}
        </Link>
      </p>
    </div>
  );
}

function MobileHeroCard() {
  const { data: me }       = useGuardianMe();
  const { data: progress } = useGuardianProgress();
  const { data: bookings } = useGuardianBookings();

  const nextLesson = useMemo(() => {
    const now = Date.now();
    return (bookings ?? [])
      .filter(b => (b.status === 'confirmed' || b.status === 'reserved') && b.lesson_slots && new Date(b.lesson_slots.starts_at).getTime() > now)
      .sort((a, b) => (a.lesson_slots?.starts_at ?? '').localeCompare(b.lesson_slots?.starts_at ?? ''))[0];
  }, [bookings]);

  const studentFirst    = me?.student.first_name ?? 'Elevens';
  const licenceCategory = me?.student.target_licence_category ?? 'B';
  const stage           = progress?.permit_stage ?? '';

  const days = nextLesson?.lesson_slots
    ? Math.ceil((new Date(nextLesson.lesson_slots.starts_at).getTime() - Date.now()) / 86_400_000)
    : null;
  const daysLabel = days === null ? null : days <= 0 ? 'Idag!' : days === 1 ? 'Imorgon' : `Om ${days} d`;

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 40%, #2D2882 72%, #4C1D95 100%)' }}
    >
      {/* Scenic right panel */}
      <div className="absolute right-0 top-0 bottom-0 w-[45%] overflow-hidden">
        <svg viewBox="0 0 200 280" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient id="gpm-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FB923C" stopOpacity="0.8" />
              <stop offset="40%" stopColor="#7C3AED" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#0F172A" stopOpacity="1" />
            </linearGradient>
          </defs>
          <rect width="200" height="280" fill="url(#gpm-sky)" />
          <ellipse cx="100" cy="130" rx="80" ry="20" fill="#F97316" opacity="0.25" />
          <polygon points="0,280 0,195 15,135 32,195 38,140 55,220 60,280" fill="#0A0F1E" opacity="0.97" />
          <polygon points="18,280 35,180 55,135 70,185 76,280" fill="#0A0F1E" opacity="0.97" />
          <polygon points="130,280 140,220 155,145 172,195 182,280" fill="#0A0F1E" opacity="0.97" />
          <polygon points="148,280 160,205 178,142 196,208 200,245 200,280" fill="#0A0F1E" opacity="0.97" />
          <polygon points="82,280 92,140 108,140 118,280" fill="#374151" opacity="0.7" />
          <rect x="97" y="150" width="6" height="16" rx="2" fill="white" opacity="0.35" />
          <rect x="97" y="176" width="6" height="16" rx="2" fill="white" opacity="0.35" />
          <rect x="97" y="202" width="6" height="16" rx="2" fill="white" opacity="0.35" />
          <rect x="97" y="228" width="6" height="20" rx="2" fill="white" opacity="0.35" />
          <rect x="92" y="133" width="16" height="8" rx="3" fill="white" opacity="0.55" />
          <ellipse cx="97" cy="142" rx="3" ry="3" fill="white" opacity="0.2" />
          <ellipse cx="103" cy="142" rx="3" ry="3" fill="white" opacity="0.2" />
        </svg>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #0F172A 0%, rgba(15,23,42,0.3) 40%, transparent 70%)' }} />
      </div>

      {/* Content */}
      <div className="relative z-10 p-5">
        <div className="flex items-start justify-between mb-5">
          <h2 className="text-white font-bold text-lg leading-tight">{studentFirst}s körkortresa</h2>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white bg-white/20 border border-white/25 shrink-0">
            KÖRKORT {licenceCategory}
          </span>
        </div>

        <div className="flex gap-4 mb-5">
          {[
            { value: String(progress?.completed_count ?? '…'), label: 'Genomförda\nlektioner' },
            { value: String(progress?.upcoming_count ?? '…'),  label: 'Kommande\nbokningar' },
            { value: STAGE_SHORT[stage] ?? '…',               label: 'Aktuellt steg' },
          ].map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 flex-1">
              <div
                className="w-[60px] h-[60px] rounded-full flex items-center justify-center border-2 shrink-0"
                style={{ borderColor: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.12)' }}
              >
                <p className="text-white text-xs font-bold text-center leading-tight px-1">{value}</p>
              </div>
              <p className="text-white/70 text-[9px] font-medium text-center leading-tight whitespace-pre-line">{label}</p>
            </div>
          ))}
        </div>

        {nextLesson?.lesson_slots && (
          <div className="rounded-xl p-3.5 border border-white/15" style={{ background: 'rgba(0,0,0,0.3)' }}>
            <p className="text-white/50 text-[9px] font-bold uppercase tracking-widest mb-1.5">Nästa lektion</p>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-white font-bold text-sm capitalize">{formatDate(nextLesson.lesson_slots.starts_at)}</p>
              {daysLabel && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-white/20 text-white shrink-0">
                  {daysLabel}
                </span>
              )}
            </div>
            <p className="text-white/70 text-xs">
              {formatTime(nextLesson.lesson_slots.starts_at)}–{formatTime(nextLesson.lesson_slots.ends_at)}
              {nextLesson.lesson_slots.instructors
                ? ` · ${nextLesson.lesson_slots.instructors.first_name} ${nextLesson.lesson_slots.instructors.last_name}`
                : ''}
              {nextLesson.lesson_slots.lesson_types ? ` · ${nextLesson.lesson_slots.lesson_types.name}` : ''}
            </p>
            {nextLesson.lesson_slots.organization_locations && (
              <p className="text-white/55 text-xs flex items-center gap-1 mt-0.5">
                <MapPin className="w-2.5 h-2.5 shrink-0" />
                {nextLesson.lesson_slots.organization_locations.name} · {nextLesson.lesson_slots.organization_locations.address_line1}, {nextLesson.lesson_slots.organization_locations.city}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AlertCard({ alert }: { alert: GuardianAlert }) {
  const isWarning = alert.level === 'warning';
  return (
    <div className={cn(
      'flex items-start gap-3 p-4 rounded-2xl border',
      isWarning ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-100',
    )}>
      <div className={cn(
        'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
        isWarning ? 'bg-amber-100' : 'bg-blue-100',
      )}>
        {isWarning
          ? <AlertCircle className="w-4 h-4 text-amber-600" />
          : <Info className="w-4 h-4 text-blue-500" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-semibold', isWarning ? 'text-amber-900' : 'text-blue-900')}>
          {alert.title}
        </p>
        <p className={cn('text-xs mt-0.5 leading-relaxed', isWarning ? 'text-amber-700' : 'text-blue-700')}>
          {alert.message}
        </p>
      </div>
    </div>
  );
}

function RiskAlerts() {
  const { data: progress } = useGuardianProgress();
  const { data: bookings = [] } = useGuardianBookings();
  const alerts = useMemo(() => computeGuardianAlerts(progress, bookings), [progress, bookings]);
  if (alerts.length === 0) return null;
  return (
    <div className="space-y-2">
      {alerts.map(a => <AlertCard key={a.id} alert={a} />)}
    </div>
  );
}

function BalanceAlert() {
  const { data: me }      = useGuardianMe();
  const { data: balance } = useGuardianBalance();
  if (!me?.guardian.can_pay) return null;
  if (!balance?.invoices.length) return null;
  const total = balance.invoices.reduce((s, i) => s + i.amount_sek, 0);
  return (
    <Link
      to="/guardian/ekonomi"
      className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl hover:bg-amber-100 transition-colors"
    >
      <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
        <AlertCircle className="w-4 h-4 text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900">Obetalt saldo</p>
        <p className="text-xs text-amber-700 mt-0.5">{formatSEK(total)} att betala</p>
      </div>
      <ChevronRight className="w-4 h-4 text-amber-400 shrink-0" />
    </Link>
  );
}

function KomIgangCard() {
  const { data: progress } = useGuardianProgress();
  if (!progress) return null;
  if (progress.completed_count > 0 || progress.upcoming_count > 0) return null;
  return (
    <div className="bg-white rounded-2xl border border-blue-100 p-4 shadow-sm space-y-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide mb-0.5" style={{ color: BRAND }}>Kom igång</p>
        <p className="text-sm font-semibold text-gray-900">Inga lektioner bokade ännu</p>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">Kontakta trafikskolan för att påbörja utbildningen.</p>
      </div>
      <div className="space-y-2.5">
        {([
          { step: '1', label: 'Ansök om körkortstillstånd', sub: 'Via Transportstyrelsen' },
          { step: '2', label: 'Kontakta trafikskolan',     sub: 'Boka introduktionslektion'  },
          { step: '3', label: 'Boka Risk 1',               sub: 'Halkövningar — obligatorisk' },
        ] as const).map(({ step, label, sub }) => (
          <div key={step} className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white" style={{ background: BRAND }}>
              {step}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-800">{label}</p>
              <p className="text-[10px] text-gray-400">{sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type NextStep = { title: string; description: string; emoji: string; to: string };

const PERMIT_NEXT_STEP: Partial<Record<string, NextStep>> = {
  // Titles describe status, not an action the guardian can take here — the
  // portal is read-only for booking (destination pages only offer a
  // phone/email "contact the school" action), so "Boka..." (Book...)
  // overpromised a capability that doesn't exist.
  risk1_completed: {
    title:       'Nästa steg: Risk 2-utbildning',
    description: 'Risk 1 är avklarad — nästa steg är riskutbildning del 2',
    emoji:       '🌙',
    to:          '/guardian/riskutbildning',
  },
  risk2_completed: {
    title:       'Förbered teoriprov',
    description: 'Riskutbildningen klar — dags att boka kunskapsprov',
    emoji:       '📖',
    to:          '/guardian/korkortsresa',
  },
  theory_passed: {
    title:       'Nästa steg: Uppkörning',
    description: 'Teoriprov godkänt — sista steget är körprovet',
    emoji:       '🏆',
    to:          '/guardian/korkortsresa',
  },
};

function NextStepCard() {
  const { data: progress } = useGuardianProgress();
  if (!progress) return null;
  const step = PERMIT_NEXT_STEP[progress.permit_stage];
  if (!step) return null;
  return (
    <Link to={step.to} className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-blue-100 shadow-sm hover:shadow-md transition-all">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{ background: '#EFF4FF' }}>
        {step.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide mb-0.5" style={{ color: BRAND }}>Nästa steg</p>
        <p className="text-sm font-semibold text-gray-900 leading-tight">{step.title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
    </Link>
  );
}

// ─── Shared activity helpers ──────────────────────────────────────────────────

type ActivityIconType = 'calendar' | 'shield' | 'payment' | 'info';

const DEMO_ACTIVITIES: Array<{ id: string; title: string; sub: string; time: string; iconType: ActivityIconType }> = [
  { id: 'a1', title: 'Lektion bokad',       sub: 'Måndag 29 Juni, 13:15',        time: 'Idag 10:24', iconType: 'calendar' },
  { id: 'a2', title: 'Risk 1 avklarad',     sub: 'Grattis! Risk 1 är godkänd.', time: 'Igår 16:45', iconType: 'shield' },
  { id: 'a3', title: 'Betalning genomförd', sub: '1 500 kr för 5 lektioner',     time: '2 jun',      iconType: 'payment' },
];

function iconForType(type: ActivityIconType) {
  if (type === 'calendar') return { Icon: CalendarDays, bg: '#EEF2FF', color: '#2D5BE3' };
  if (type === 'shield')   return { Icon: ShieldCheck,  bg: '#ECFDF5', color: '#10B981' };
  if (type === 'payment')  return { Icon: CreditCard,   bg: '#F5F3FF', color: '#8B5CF6' };
  return                          { Icon: Info,         bg: '#EFF6FF', color: '#3B82F6' };
}

// ─── Mobile quick-link + activity components ──────────────────────────────────

function MobileSnabblänkar() {
  const items = [
    { to: '/guardian/schema',        Icon: CalendarDays,  label: 'Schema',        bg: '#EEF2FF', color: '#2D5BE3' },
    { to: '/guardian/framsteg',      Icon: TrendingUp,    label: 'Framsteg',      bg: '#ECFDF5', color: '#10B981' },
    { to: '/guardian/riskutbildning',Icon: ShieldCheck,   label: 'Riskutbildning',bg: '#F0FDFA', color: '#0D9488' },
    { to: '/guardian/ekonomi',       Icon: CreditCard,    label: 'Ekonomi',       bg: '#FFF1F2', color: '#F43F5E' },
    { to: '/guardian/meddelanden',   Icon: MessageSquare, label: 'Meddelanden',   bg: '#F5F3FF', color: '#8B5CF6' },
  ];
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: BRAND }}>Snabblänkar</p>
      <div className="flex gap-2">
        {items.map(({ to, Icon, label, bg, color }) => (
          <Link
            key={to}
            to={to}
            className="flex-1 flex flex-col items-center gap-1.5 py-3 px-1 bg-white rounded-2xl border border-gray-100 shadow-sm active:scale-95 transition-transform"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
              <Icon className="w-5 h-5" style={{ color }} strokeWidth={1.75} />
            </div>
            <p className="text-gray-700 text-[9px] font-semibold text-center leading-tight">{label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function MobileRecentActivity() {
  const session                 = useGuardianSession();
  const { data: bookings = [] } = useGuardianBookings();
  const { data: progress }      = useGuardianProgress();

  const activities = useMemo(() => {
    if (session.token === 'demo') return DEMO_ACTIVITIES;

    const derived: typeof DEMO_ACTIVITIES = [];
    const now = new Date();

    const nextBooking = [...bookings]
      .filter(b => b.status === 'confirmed' && b.lesson_slots && new Date(b.lesson_slots.starts_at) > now)
      .sort((a, b) => (a.lesson_slots?.starts_at ?? '').localeCompare(b.lesson_slots?.starts_at ?? ''))[0];

    if (nextBooking?.lesson_slots) {
      const d = new Date(nextBooking.lesson_slots.starts_at);
      derived.push({
        id:       'next-booking',
        title:    'Lektion bokad',
        sub:      `${d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase())}, ${d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`,
        time:     'Nyligen',
        iconType: 'calendar',
      });
    }

    if (progress?.risk1_completed_at) {
      const d = new Date(progress.risk1_completed_at);
      const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
      derived.push({
        id:       'risk1-done',
        title:    'Risk 1 avklarad',
        sub:      'Grattis! Risk 1 är godkänd.',
        time:     diffDays === 0 ? 'Idag' : diffDays === 1 ? 'Igår' : `${d.getDate()} ${d.toLocaleString('sv-SE', { month: 'short' })}`,
        iconType: 'shield',
      });
    }

    return derived.slice(0, 3);
  }, [session.token, bookings, progress]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: BRAND }}>Senaste aktivitet</p>
        <Link to="/guardian/bokningar" className="text-xs font-semibold flex items-center gap-0.5" style={{ color: BRAND }}>
          Visa alla <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      {activities.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-4">Ingen aktivitet ännu</p>
      ) : (
        <div className="space-y-4">
          {activities.map(({ id, title, sub, time, iconType }) => {
            const { Icon, bg, color } = iconForType(iconType);
            return (
              <div key={id} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                  <Icon className="w-[18px] h-[18px]" style={{ color }} strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 text-sm font-semibold leading-tight">{title}</p>
                  <p className="text-gray-400 text-xs mt-0.5 leading-tight">{sub}</p>
                </div>
                <p className="text-gray-400 text-[11px] shrink-0 mt-0.5 whitespace-nowrap">{time}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Desktop components ───────────────────────────────────────────────────────

function DesktopTopBar() {
  const session     = useGuardianSession();
  const { data: me } = useGuardianMe();

  const firstName   = session.guardian_name.split(' ')[0] ?? session.guardian_name;
  const studentName = me ? `${me.student.first_name} ${me.student.last_name}` : '…';
  const hour        = new Date().getHours();
  const greeting    = hour < 5 ? 'God natt' : hour < 12 ? 'God morgon' : hour < 18 ? 'God eftermiddag' : 'God kväll';

  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <p className="text-gray-400 text-sm leading-tight">{greeting},</p>
        <h1 className="text-[2rem] font-bold text-gray-900 leading-tight">{firstName}! 👋</h1>
        <p className="text-gray-500 text-sm mt-1">
          Du följer utbildningen för{' '}
          <Link to="/guardian/framsteg" className="font-semibold hover:opacity-70" style={{ color: PRIMARY }}>
            {studentName}
          </Link>
        </p>
      </div>
      <div className="flex items-center gap-3 mt-1">
        <Link
          to="/guardian/framsteg"
          className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
          style={{ background: PRIMARY }}
        >
          <TrendingUp className="w-4 h-4" strokeWidth={2} />
          Se framsteg
        </Link>
      </div>
    </div>
  );
}

function DesktopHeroCard() {
  const { data: me }       = useGuardianMe();
  const { data: progress } = useGuardianProgress();
  const { data: bookings } = useGuardianBookings();

  const nextLesson = useMemo(() => {
    const now = Date.now();
    return (bookings ?? [])
      .filter(b => (b.status === 'confirmed' || b.status === 'reserved') && b.lesson_slots && new Date(b.lesson_slots.starts_at).getTime() > now)
      .sort((a, b) => (a.lesson_slots?.starts_at ?? '').localeCompare(b.lesson_slots?.starts_at ?? ''))[0];
  }, [bookings]);

  const studentFirst  = me?.student.first_name ?? 'Elevens';
  const licenceCategory = me?.student.target_licence_category ?? 'B';
  const stage = progress?.permit_stage ?? '';

  const days = nextLesson?.lesson_slots
    ? Math.ceil((new Date(nextLesson.lesson_slots.starts_at).getTime() - Date.now()) / 86_400_000)
    : null;
  const daysLabel = days === null ? null : days <= 0 ? 'Idag!' : days === 1 ? 'Imorgon' : `Om ${days} d`;

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{ minHeight: '290px', background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 40%, #2D2882 72%, #4C1D95 100%)' }}
    >
      {/* Scenic right panel */}
      <div className="absolute right-0 top-0 bottom-0 w-[42%] overflow-hidden">
        <svg viewBox="0 0 240 290" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient id="gp-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FB923C" stopOpacity="0.75" />
              <stop offset="40%" stopColor="#7C3AED" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#0F172A" stopOpacity="1" />
            </linearGradient>
          </defs>
          <rect width="240" height="290" fill="url(#gp-sky)" />
          <ellipse cx="120" cy="145" rx="90" ry="22" fill="#F97316" opacity="0.22" />
          <rect y="150" width="240" height="140" fill="#0F172A" opacity="0.55" />
          {/* Trees left */}
          <polygon points="0,290 0,210 18,145 38,210 44,155 62,230 70,290" fill="#0A0F1E" opacity="0.97" />
          <polygon points="25,290 42,195 62,148 80,200 85,290" fill="#0A0F1E" opacity="0.97" />
          {/* Trees right */}
          <polygon points="148,290 158,235 176,155 196,205 208,290" fill="#0A0F1E" opacity="0.97" />
          <polygon points="168,290 178,215 202,148 222,215 240,255 240,290" fill="#0A0F1E" opacity="0.97" />
          {/* Road */}
          <polygon points="100,290 112,150 128,150 140,290" fill="#374151" opacity="0.7" />
          <rect x="117" y="158" width="6" height="18" rx="2" fill="white" opacity="0.35" />
          <rect x="117" y="186" width="6" height="18" rx="2" fill="white" opacity="0.35" />
          <rect x="117" y="214" width="6" height="18" rx="2" fill="white" opacity="0.35" />
          <rect x="117" y="242" width="6" height="22" rx="2" fill="white" opacity="0.35" />
          {/* Car at horizon */}
          <rect x="111" y="142" width="18" height="8" rx="3" fill="white" opacity="0.55" />
          <ellipse cx="116" cy="151" rx="3" ry="3" fill="white" opacity="0.2" />
          <ellipse cx="124" cy="151" rx="3" ry="3" fill="white" opacity="0.2" />
        </svg>
        {/* Left blend */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #0F172A 0%, rgba(15,23,42,0.35) 45%, transparent 75%)' }} />
      </div>

      {/* Content */}
      <div className="relative z-10 p-6 flex flex-col" style={{ minHeight: '290px' }}>
        {/* Header row */}
        <div className="flex items-start justify-between mb-auto">
          <h2 className="text-white font-bold text-xl leading-tight">{studentFirst}s körkortresa</h2>
          <span className="px-3 py-1 rounded-full text-xs font-bold text-white bg-white/20 border border-white/25 shrink-0">
            KÖRKORT {licenceCategory}
          </span>
        </div>

        {/* Stats row */}
        <div className="flex gap-7 mt-6 mb-5">
          {[
            { value: String(progress?.completed_count ?? '…'), label: 'Genomförda\nlektioner' },
            { value: String(progress?.upcoming_count ?? '…'),  label: 'Kommande\nbokningar' },
            { value: STAGE_SHORT[stage] ?? '…',               label: 'Aktuellt steg' },
          ].map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <div
                className="w-[68px] h-[68px] rounded-full flex items-center justify-center border-2 shrink-0"
                style={{ borderColor: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.12)' }}
              >
                <p className="text-white text-xs font-bold text-center leading-tight px-1">{value}</p>
              </div>
              <p className="text-white/70 text-[10px] font-medium text-center leading-tight whitespace-pre-line">{label}</p>
            </div>
          ))}
        </div>

        {/* Next lesson */}
        {nextLesson?.lesson_slots && (
          <div className="rounded-xl p-4 border border-white/15" style={{ background: 'rgba(0,0,0,0.28)' }}>
            <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mb-2">Nästa lektion</p>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-white font-bold text-sm">{formatDate(nextLesson.lesson_slots.starts_at)}</p>
              {daysLabel && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white shrink-0">
                  {daysLabel}
                </span>
              )}
            </div>
            <p className="text-white/70 text-xs mb-1">
              {formatTime(nextLesson.lesson_slots.starts_at)}–{formatTime(nextLesson.lesson_slots.ends_at)}
              {nextLesson.lesson_slots.instructors
                ? ` · ${nextLesson.lesson_slots.instructors.first_name} ${nextLesson.lesson_slots.instructors.last_name}`
                : ''}
              {nextLesson.lesson_slots.lesson_types ? ` · ${nextLesson.lesson_slots.lesson_types.name}` : ''}
            </p>
            {nextLesson.lesson_slots.organization_locations && (
              <p className="text-white/55 text-xs flex items-center gap-1">
                <MapPin className="w-3 h-3 shrink-0" />
                {nextLesson.lesson_slots.organization_locations.name} · {nextLesson.lesson_slots.organization_locations.address_line1}, {nextLesson.lesson_slots.organization_locations.city}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DesktopProgressSection() {
  const { data: progress } = useGuardianProgress();
  if (!progress) return null;

  const stage    = progress.permit_stage;
  const stagePct = stagePctFrom(stage);

  const MILESTONES = [
    { label: 'Start' },
    { label: 'Risk 1 klar' },
    { label: 'Risk 2' },
    { label: 'Teori' },
    { label: 'Uppkörning' },
    { label: 'Körkort' },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: PRIMARY }}>Utbildningsframsteg</p>
        <span className="text-sm font-bold" style={{ color: PRIMARY }}>{stagePct}%</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.max(stagePct, 4)}%`,
            background: stagePct === 100
              ? 'linear-gradient(to right, #10B981, #34D399)'
              : 'linear-gradient(to right, #2D5BE3, #7C3AED)',
          }}
        />
      </div>
      <div className="flex justify-between mt-2.5">
        {MILESTONES.map(({ label }) => (
          <p key={label} className="text-[10px] text-gray-400 font-medium text-center">{label}</p>
        ))}
      </div>
    </div>
  );
}

function DesktopSnabblänkar() {
  const items = [
    { to: '/guardian/schema',        Icon: CalendarDays, label: 'Schema',       bg: '#EEF2FF', color: '#2D5BE3' },
    { to: '/guardian/framsteg',      Icon: TrendingUp,   label: 'Framsteg',     bg: '#ECFDF5', color: '#10B981' },
    { to: '/guardian/riskutbildning',Icon: ShieldCheck,  label: 'Riskutbildning',bg: '#F0FDFA', color: '#0D9488' },
    { to: '/guardian/ekonomi',       Icon: CreditCard,   label: 'Ekonomi',      bg: '#FFF1F2', color: '#F43F5E' },
    { to: '/guardian/meddelanden',   Icon: MessageSquare,label: 'Meddelanden',  bg: '#F5F3FF', color: '#8B5CF6' },
  ];

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: PRIMARY }}>Snabblänkar</p>
      <div className="flex gap-3">
        {items.map(({ to, Icon, label, bg, color }) => (
          <Link
            key={to}
            to={to}
            className="flex-1 flex flex-col items-center gap-2 py-4 px-2 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
              <Icon className="w-5 h-5" style={{ color }} strokeWidth={1.75} />
            </div>
            <p className="text-gray-700 text-[11px] font-semibold text-center leading-tight">{label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function DesktopNavigera() {
  const items = [
    { to: '/guardian/schema',        Icon: CalendarDays, title: 'Schema',           sub: 'Kommande och historiska lektioner', bg: '#EEF2FF', color: '#2D5BE3' },
    { to: '/guardian/framsteg',      Icon: TrendingUp,   title: 'Elevens Framsteg', sub: 'Kompetenser och utbildningssteg',   bg: '#F5F3FF', color: '#8B5CF6' },
    { to: '/guardian/korkortsresa',  Icon: Route,        title: 'Körkortsresa',     sub: 'Vägen från tillstånd till körkort', bg: '#FFF7ED', color: '#F97316' },
    { to: '/guardian/riskutbildning',Icon: ShieldCheck,  title: 'Riskutbildning',   sub: 'Risk 1 och Risk 2 status',          bg: '#F0FDFA', color: '#0D9488' },
    { to: '/guardian/ekonomi',       Icon: CreditCard,   title: 'Ekonomi',          sub: 'Fakturor och betalningar',          bg: '#FFF1F2', color: '#F43F5E' },
    { to: '/guardian/meddelanden',   Icon: MessageSquare,title: 'Meddelanden',      sub: 'Lektionspåminnelser och nyheter',   bg: '#EEF2FF', color: '#2D5BE3' },
  ];

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: PRIMARY }}>Navigera</p>
      <div className="grid grid-cols-2 gap-3">
        {items.map(({ to, Icon, title, sub, bg, color }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
              <Icon className="w-5 h-5" style={{ color }} strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-gray-900 text-sm font-semibold leading-tight">{title}</p>
              <p className="text-gray-400 text-xs mt-0.5 leading-tight">{sub}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function DesktopBalanceCard() {
  const { data: me }      = useGuardianMe();
  const { data: balance } = useGuardianBalance();
  if (!me?.guardian.can_pay || !balance?.invoices.length) return null;
  const total = balance.invoices.reduce((s, i) => s + i.amount_sek, 0);
  return (
    <Link
      to="/guardian/ekonomi"
      className="flex items-center gap-3 p-4 rounded-2xl border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors"
    >
      <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
        <AlertCircle className="w-4 h-4 text-amber-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-amber-900 text-sm font-semibold">Obetalt saldo</p>
        <p className="text-amber-700 text-xs mt-0.5">{formatSEK(total)} att betala</p>
      </div>
      <ChevronRight className="w-4 h-4 text-amber-400 shrink-0" />
    </Link>
  );
}

function DesktopNextStepCard() {
  const { data: progress } = useGuardianProgress();
  if (!progress) return null;
  const step = PERMIT_NEXT_STEP[progress.permit_stage];
  if (!step) return null;
  return (
    <Link to={step.to} className="block p-4 bg-white rounded-2xl border border-blue-100 shadow-sm hover:shadow-md transition-all">
      <p className="text-[10px] font-bold uppercase tracking-widest mb-2.5" style={{ color: PRIMARY }}>Nästa steg</p>
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0 leading-none mt-0.5">{step.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 text-sm font-bold leading-tight">{step.title}</p>
          <p className="text-gray-500 text-xs mt-1 leading-relaxed">{step.description}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />
      </div>
    </Link>
  );
}

function DesktopAlertCards() {
  const { data: progress }     = useGuardianProgress();
  const { data: bookings = [] } = useGuardianBookings();
  const alerts = useMemo(() => computeGuardianAlerts(progress, bookings), [progress, bookings]);
  if (alerts.length === 0) return null;
  return (
    <div className="space-y-3">
      {alerts.map(alert => {
        const isWarning = alert.level === 'warning';
        return (
          <div
            key={alert.id}
            className={`flex items-start gap-3 p-4 rounded-2xl border ${isWarning ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-100'}`}
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${isWarning ? 'bg-amber-100' : 'bg-blue-100'}`}>
              <Info className={`w-4 h-4 ${isWarning ? 'text-amber-600' : 'text-blue-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${isWarning ? 'text-amber-900' : 'text-blue-900'}`}>{alert.title}</p>
              <p className={`text-xs mt-0.5 leading-relaxed ${isWarning ? 'text-amber-700' : 'text-blue-700'}`}>{alert.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DesktopRecentActivity() {
  const session              = useGuardianSession();
  const { data: bookings = [] } = useGuardianBookings();
  const { data: progress }   = useGuardianProgress();

  const activities = useMemo(() => {
    if (session.token === 'demo') return DEMO_ACTIVITIES;

    const derived: typeof DEMO_ACTIVITIES = [];
    const now = new Date();

    const nextBooking = [...bookings]
      .filter(b => b.status === 'confirmed' && b.lesson_slots && new Date(b.lesson_slots.starts_at) > now)
      .sort((a, b) => (a.lesson_slots?.starts_at ?? '').localeCompare(b.lesson_slots?.starts_at ?? ''))[0];

    if (nextBooking?.lesson_slots) {
      const d = new Date(nextBooking.lesson_slots.starts_at);
      derived.push({
        id:       'next-booking',
        title:    'Lektion bokad',
        sub:      `${d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase())}, ${d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`,
        time:     'Nyligen',
        iconType: 'calendar',
      });
    }

    if (progress?.risk1_completed_at) {
      const d = new Date(progress.risk1_completed_at);
      const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
      derived.push({
        id:       'risk1-done',
        title:    'Risk 1 avklarad',
        sub:      'Grattis! Risk 1 är godkänd.',
        time:     diffDays === 0 ? 'Idag' : diffDays === 1 ? 'Igår' : `${d.getDate()} ${d.toLocaleString('sv-SE', { month: 'short' })}`,
        iconType: 'shield',
      });
    }

    return derived.slice(0, 3);
  }, [session.token, bookings, progress]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: PRIMARY }}>Senaste aktivitet</p>
        <Link to="/guardian/bokningar" className="text-xs font-semibold hover:opacity-70" style={{ color: PRIMARY }}>
          Visa alla
        </Link>
      </div>
      {activities.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-4">Ingen aktivitet ännu</p>
      ) : (
        <div className="space-y-4">
          {activities.map(({ id, title, sub, time, iconType }) => {
            const { Icon, bg, color } = iconForType(iconType);
            return (
              <div key={id} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                  <Icon className="w-[18px] h-[18px]" style={{ color }} strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 text-sm font-semibold leading-tight">{title}</p>
                  <p className="text-gray-400 text-xs mt-0.5 leading-tight">{sub}</p>
                </div>
                <p className="text-gray-400 text-[11px] shrink-0 mt-0.5 whitespace-nowrap">{time}</p>
              </div>
            );
          })}
        </div>
      )}
      {activities.length > 0 && (
        <Link
          to="/guardian/bokningar"
          className="flex items-center gap-1 mt-4 pt-4 border-t border-gray-50 text-xs font-semibold hover:opacity-70"
          style={{ color: PRIMARY }}
        >
          Visa alla aktiviteter <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}

// ─── GuardianPortalDashboard ──────────────────────────────────────────────────

export function GuardianPortalDashboard() {
  const { data: progress } = useGuardianProgress();

  const stage    = progress?.permit_stage ?? '';
  const stagePct = stagePctFrom(stage);

  return (
    <>
      {/* ── Mobile ─────────────────────────────────────────────────────────── */}
      <div className="lg:hidden space-y-5">
        <MobileGreeting />
        <MobileHeroCard />
        <BalanceAlert />
        <NextStepCard />
        <RiskAlerts />
        <KomIgangCard />

        {progress && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: BRAND }}>Utbildningsframsteg</p>
              <span className="text-xs font-bold" style={{ color: BRAND }}>{stagePct}%</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(stagePct, 4)}%`,
                  background: stagePct === 100
                    ? 'linear-gradient(to right, #10B981, #34D399)'
                    : 'linear-gradient(to right, #3B82F6, #8B5CF6)',
                }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              {['Start', 'Risk 1 klar', 'Risk 2', 'Teori', 'Uppkörning', 'Körkort'].map(m => (
                <p key={m} className="text-[9px] text-gray-400 font-medium text-center">{m}</p>
              ))}
            </div>
          </div>
        )}

        <MobileSnabblänkar />
        <MobileRecentActivity />
      </div>

      {/* ── Desktop ─────────────────────────────────────────────────────────── */}
      <div className="hidden lg:block">
        <DesktopTopBar />

        <div className="flex gap-6 items-start">
          {/* Left column */}
          <div className="flex-1 min-w-0 space-y-5">
            <DesktopHeroCard />
            <DesktopProgressSection />
            <DesktopSnabblänkar />
            <DesktopNavigera />
          </div>

          {/* Right column */}
          <div className="w-[320px] shrink-0 space-y-4">
            <DesktopBalanceCard />
            <DesktopNextStepCard />
            <DesktopAlertCards />
            <DesktopRecentActivity />
          </div>
        </div>

        {/* Floating status pill */}
        {progress?.permit_stage && progress.permit_stage !== 'not_started' && (
          <div className="fixed bottom-6 left-64 right-0 z-20 flex justify-center pointer-events-none">
            <span
              className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold text-white shadow-xl pointer-events-auto"
              style={{ background: PRIMARY }}
            >
              <CheckCircle2 className="w-4 h-4" />
              {STAGE_LABELS[progress.permit_stage] ?? progress.permit_stage}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
