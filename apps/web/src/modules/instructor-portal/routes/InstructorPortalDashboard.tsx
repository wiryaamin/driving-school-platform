import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, CalendarCheck, Users,
  ChevronRight, Clock, Car,
  TrendingUp, Star, Bell,
} from 'lucide-react';
import { useInstructorPortalSession } from './InstructorPortalLayout.js';
import {
  useInstructorPortalStats,
  useInstructorPortalTodayBookings,
  useInstructorPortalStudents,
  useInstructorPortalUpcomingBookings,
  type InstructorPortalBooking,
} from '../hooks/useInstructorPortal.js';
import { cn } from '@/lib/utils.js';

// ─── Brand tokens ──────────────────────────────────────────────────────────────

const PRIMARY = '#684EFF';

// ─── Shared helpers ────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

// ─── Desktop helpers ───────────────────────────────────────────────────────────

function durationMin(starts: string, ends: string): number {
  return Math.round((new Date(ends).getTime() - new Date(starts).getTime()) / 60_000);
}

function initials(first: string | null | undefined, last: string | null | undefined): string {
  return ((first?.[0] ?? '?').toUpperCase() + (last?.[0] ?? '').toUpperCase());
}

function getWeekDays(): { dateKey: string; dayName: string; dayNum: number }[] {
  const today  = new Date();
  const dow    = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  monday.setHours(0, 0, 0, 0);
  const NAMES = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre'] as const;
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { dateKey: d.toISOString().slice(0, 10), dayName: NAMES[i]!, dayNum: d.getDate() };
  });
}

const WEEK_DAYS = getWeekDays();
const TODAY_KEY = new Date().toISOString().slice(0, 10);

function getBookingBadge(b: InstructorPortalBooking): { text: string; className: string } {
  if (b.attendance_status === 'present') return { text: 'Närvande',    className: 'bg-emerald-100 text-emerald-700' };
  if (b.attendance_status === 'absent')  return { text: 'Uteblev',     className: 'bg-red-100 text-red-700' };
  if (b.status === 'pending')            return { text: 'Väntar svar', className: 'border border-amber-400 text-amber-600' };
  return { text: 'Kommer', className: 'bg-emerald-100 text-emerald-700' };
}

// ─── Static desktop data ──────────────────────────────────────────────────────

const STAGE_MAP = [
  { key: 'risk1',     label: 'Risk 1',     color: '#4338CA' },
  { key: 'risk2',     label: 'Risk 2',     color: '#818CF8' },
  { key: 'theory',    label: 'Teori',      color: '#93C5FD' },
  { key: 'practical', label: 'Uppkörning', color: '#F59E0B' },
  { key: 'licensed',  label: 'Körkort',    color: '#34D399' },
  { key: 'learner',   label: 'Nybörjare',  color: '#A78BFA' },
] as const;

interface DonutSegment { label: string; color: string; value: number }

const DEMO_MSGS = [
  { name: 'Sara Andersson',   inits: 'SA', time: '10:24', text: 'Hej! Kan vi boka om lektionen imorgon?', unread: true,  isSystem: false },
  { name: 'Lucas Martinsson', inits: 'LM', time: '09:15', text: 'Tack för en bra lektion idag!',          unread: true,  isSystem: false },
  { name: 'System',           inits: null,  time: '08:45', text: 'Ny betalning mottagen från Emma J.',     unread: false, isSystem: true  },
] as const;

const TASKS = [
  { label: 'Rätta teoriprov',      detail: '5 att rätta',   badge: 5, highlight: true  },
  { label: 'Uppföljning körprov',  detail: '3 elever',      badge: 3, highlight: true  },
  { label: 'Lektionsplanering',    detail: '2 att planera', badge: 2, highlight: false },
  { label: 'Dokument att signera', detail: '1 nytt',        badge: 1, highlight: false },
] as const;

const POPULAR_TOPICS = [
  { name: 'Trafikregler',   pct: 89 },
  { name: 'Vägmärken',     pct: 76 },
  { name: 'Riskhantering',  pct: 72 },
  { name: 'Fordon & miljö', pct: 65 },
  { name: 'Första hjälpen', pct: 58 },
] as const;



// ─── NEW MOBILE components (smartphone reference design) ─────────────────────

function SmallDonutChart({ segments, total }: { segments: DonutSegment[]; total: number }) {
  const cx = 50; const cy = 50; const r = 36; const sw = 11;
  const C   = 2 * Math.PI * r;
  const GAP = 1.5;
  let cumPct = 0;
  return (
    <svg width="100" height="100" viewBox="0 0 100 100">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={sw} />
      {total > 0 && segments.map((seg, i) => {
        const pct     = seg.value / total;
        const dashLen = Math.max(0, pct * C - GAP);
        const gapLen  = C - dashLen;
        const offset  = -(cumPct * C) + GAP / 2;
        cumPct += pct;
        if (dashLen <= 0) return null;
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color}
            strokeWidth={sw} strokeDasharray={`${dashLen} ${gapLen}`}
            strokeDashoffset={offset} transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="butt" />
        );
      })}
      <text x={cx} y={cy - 5}  textAnchor="middle" fontSize="9"  fill="#9CA3AF" fontFamily="system-ui,sans-serif">Totalt</text>
      <text x={cx} y={cy + 9}  textAnchor="middle" fontSize="16" fontWeight="700" fill="#111827" fontFamily="system-ui,sans-serif">{total}</text>
      <text x={cx} y={cy + 21} textAnchor="middle" fontSize="9"  fill="#9CA3AF" fontFamily="system-ui,sans-serif">elever</text>
    </svg>
  );
}

function MobileNextLessonCard() {
  const { data: bookings } = useInstructorPortalTodayBookings();

  const nextBooking = useMemo(
    () => (bookings ?? [])
      .filter(b => b.status === 'confirmed')
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0],
    [bookings],
  );

  if (!nextBooking) return null;

  const studentName = `${nextBooking.student_first_name ?? ''} ${nextBooking.student_last_name ?? ''}`.trim() || '—';
  const inits       = initials(nextBooking.student_first_name, nextBooking.student_last_name);
  const lessonType  = nextBooking.lesson_type_name ?? 'Körlektion';

  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ minHeight: '185px', background: 'linear-gradient(135deg, #5B50D0 0%, #7B3FC4 100%)' }}>
      {/* Left content */}
      <div className="absolute inset-y-0 left-0 w-[60%] flex flex-col justify-between px-5 py-5 z-10">
        <div>
          <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-2">Din nästa lektion</p>
          <p className="text-white font-bold text-[18px] leading-snug">{studentName}</p>
          <div className="mt-2.5 space-y-1">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-white/60 shrink-0" strokeWidth={2} />
              <span className="text-white/80 text-sm">Idag {formatTime(nextBooking.starts_at)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Car className="w-3.5 h-3.5 text-white/60 shrink-0" strokeWidth={2} />
              <span className="text-white/80 text-sm truncate">{lessonType}</span>
            </div>
          </div>
        </div>
        <Link
          to="/instructor-portal/bokningar"
          className="self-start flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-sm font-bold"
          style={{ color: '#5B50D0' }}
        >
          Visa lektion <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Right side — nature abstract + student avatar */}
      <div className="absolute inset-y-0 right-0 w-[44%] overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #2D5A3D 0%, #1B3A28 45%, #1A2540 100%)' }} />
        <div className="absolute bottom-0 left-0 right-0 h-1/3" style={{ background: 'linear-gradient(to top, rgba(15,25,40,0.85), transparent)' }} />
        <div className="absolute inset-y-0 left-0 w-10" style={{ background: 'linear-gradient(to right, #5B50D0, transparent)' }} />
        <div
          className="absolute w-16 h-16 rounded-full border-[3px] border-white/60 flex items-center justify-center text-white font-bold text-xl shadow-xl"
          style={{ background: 'rgba(91,80,208,0.5)', top: '28px', left: '50%', transform: 'translateX(-50%)' }}
        >
          {inits}
        </div>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 opacity-25">
          <Car className="w-12 h-12 text-white" strokeWidth={1} />
        </div>
      </div>
    </div>
  );
}

function MobileStatsGrid() {
  const { data: stats, isLoading } = useInstructorPortalStats();
  const { data: todayBookings }    = useInstructorPortalTodayBookings();

  const drivingCount = (todayBookings ?? []).filter(b =>
    (b.lesson_type_name ?? '').toLowerCase().includes('kör') ||
    (b.lesson_type_name ?? '').toLowerCase().includes('uppkörning'),
  ).length;
  const theoryCount  = (todayBookings ?? []).filter(b =>
    (b.lesson_type_name ?? '').toLowerCase().includes('teori') ||
    (b.lesson_type_name ?? '').toLowerCase().includes('risk'),
  ).length;
  const revenueHours = stats?.total_hours_this_month ?? 0;
  const revenueStr   = revenueHours > 0 ? `${Math.round(revenueHours * 625).toLocaleString('sv-SE')}` : '28 450';

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="grid grid-cols-4 gap-1">

        {/* Aktiva Elever */}
        <div className="flex flex-col items-center text-center gap-1">
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#E0F7F5' }}>
            <Users className="w-4 h-4" style={{ color: '#14B8A6' }} strokeWidth={1.75} />
          </div>
          {isLoading
            ? <div className="h-5 w-8 bg-gray-100 rounded animate-pulse" />
            : <p className="text-gray-900 font-bold text-[16px] leading-none">{stats?.unique_students ?? 28}</p>}
          <p className="text-gray-500 text-[10px] leading-tight">Aktiva elever</p>
          <p className="text-emerald-500 text-[10px] font-semibold leading-tight">+3 sedan<br />förra veckan</p>
        </div>

        {/* Lektioner Idag */}
        <div className="flex flex-col items-center text-center gap-1">
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#E0FFF3' }}>
            <CalendarCheck className="w-4 h-4" style={{ color: '#10B981' }} strokeWidth={1.75} />
          </div>
          {isLoading
            ? <div className="h-5 w-6 bg-gray-100 rounded animate-pulse" />
            : <p className="text-gray-900 font-bold text-[16px] leading-none">{stats?.lessons_today ?? 6}</p>}
          <p className="text-gray-500 text-[10px] leading-tight">Lektioner idag</p>
          <p className="text-gray-400 text-[10px] leading-tight">{drivingCount} körlektioner,<br />{theoryCount} teori</p>
        </div>

        {/* Snittbetyg */}
        <div className="flex flex-col items-center text-center gap-1">
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#FFF8E0' }}>
            <Star className="w-4 h-4" style={{ color: '#F59E0B' }} strokeWidth={1.75} />
          </div>
          <p className="text-gray-900 font-bold text-[16px] leading-none">4.8</p>
          <p className="text-gray-500 text-[10px] leading-tight">Snittbetyg</p>
          <div className="flex items-center gap-0.5 flex-wrap justify-center">
            {[1,2,3,4].map(n => (
              <svg key={n} className="w-2.5 h-2.5" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#F59E0B" />
              </svg>
            ))}
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24">
              <defs>
                <linearGradient id="mhalf-star" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="75%" stopColor="#F59E0B" />
                  <stop offset="75%" stopColor="#E5E7EB" />
                </linearGradient>
              </defs>
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="url(#mhalf-star)" />
            </svg>
          </div>
          <p className="text-amber-500 text-[10px]">(128)</p>
        </div>

        {/* Intäkter */}
        <div className="flex flex-col items-center text-center gap-1">
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#E8F1FF' }}>
            <TrendingUp className="w-4 h-4" style={{ color: '#3B82F6' }} strokeWidth={1.75} />
          </div>
          {isLoading
            ? <div className="h-5 w-12 bg-gray-100 rounded animate-pulse" />
            : <p className="text-gray-900 font-bold text-[13px] leading-none">{revenueStr} kr</p>}
          <p className="text-gray-500 text-[10px] leading-tight">Intäkter (månad)</p>
          <p className="text-emerald-500 text-[10px] font-semibold leading-tight">+12% sedan<br />förra månaden</p>
        </div>

      </div>
    </div>
  );
}

function MobileDagensOchFramsteg() {
  const { data: bookings, isLoading } = useInstructorPortalTodayBookings();
  const { data: students }            = useInstructorPortalStudents();

  const { segments, total } = useMemo(() => {
    if (!students || students.length === 0) return { segments: [] as DonutSegment[], total: 0 };
    const counts: Record<string, number> = {};
    for (const s of students) counts[s.permit_stage] = (counts[s.permit_stage] ?? 0) + 1;
    const segs = STAGE_MAP
      .map(({ key, label, color }) => ({ label, color, value: counts[key] ?? 0 }))
      .filter(s => s.value > 0);
    return { segments: segs, total: students.length };
  }, [students]);

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Dagens Lektioner */}
      <div className="bg-white rounded-2xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: PRIMARY }}>Dagens lektioner</p>
          <Link to="/instructor-portal/bokningar" className="text-[10px] font-semibold" style={{ color: PRIMARY }}>Visa alla</Link>
        </div>
        {isLoading ? (
          <div className="space-y-2.5">
            {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-50 rounded-xl animate-pulse" />)}
          </div>
        ) : !bookings || bookings.length === 0 ? (
          <p className="text-gray-400 text-xs py-4 text-center">Inga lektioner idag</p>
        ) : (
          <div className="space-y-2.5">
            {bookings.slice(0, 3).map(b => (
              <div key={b.id} className="flex items-start gap-2 pb-2 border-b border-gray-50 last:border-0 last:pb-0">
                <div
                  className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ background: PRIMARY }}
                >
                  {initials(b.student_first_name, b.student_last_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[12px] leading-tight" style={{ color: PRIMARY }}>{formatTime(b.starts_at)}</p>
                  <p className="text-gray-800 text-[11px] font-medium truncate">{b.student_first_name} {b.student_last_name}</p>
                  <p className="text-gray-400 text-[10px] leading-tight">{durationMin(b.starts_at, b.ends_at)} min · {b.lesson_type_name ?? 'Körlektion'}</p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap', getBookingBadge(b).className)}>
                    {getBookingBadge(b).text}
                  </span>
                  <ChevronRight className="w-3 h-3 text-gray-300 mt-0.5" />
                </div>
              </div>
            ))}
          </div>
        )}
        <Link
          to="/instructor-portal/schema"
          className="flex items-center gap-0.5 mt-3 text-[10px] font-semibold"
          style={{ color: PRIMARY }}
        >
          Visa hela kalendern <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Elevernas Framsteg */}
      <div className="bg-white rounded-2xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: PRIMARY }}>Elevernas framsteg</p>
          <Link to="/instructor-portal/elever" className="text-[10px] font-semibold" style={{ color: PRIMARY }}>Visa alla</Link>
        </div>
        <div className="flex justify-center">
          <SmallDonutChart segments={segments} total={total} />
        </div>
        <div className="mt-1 space-y-1">
          {segments.map(({ label, color, value }) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-gray-500 text-[10px]">{label}</span>
              </div>
              <span className="text-gray-400 text-[10px]">{value} elever</span>
            </div>
          ))}
          {segments.length === 0 && <p className="text-gray-300 text-[10px] text-center py-2">Inga elever</p>}
        </div>
      </div>
    </div>
  );
}

function MobileSenasteMeddelanden() {
  const msgs = DEMO_MSGS.slice(1);
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: PRIMARY }}>Senaste meddelanden</p>
        <Link to="/instructor-portal/bokningar" className="flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: PRIMARY }}>
          Visa alla <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="divide-y divide-gray-50">
        {msgs.map((msg, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3">
            {msg.isSystem ? (
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 text-gray-400" strokeWidth={1.75} />
              </div>
            ) : (
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                style={{ background: '#E8E6FF', color: PRIMARY }}
              >
                {msg.inits}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-gray-900 text-sm font-semibold truncate">{msg.name}</p>
              <p className="text-gray-400 text-xs mt-0.5 line-clamp-1">{msg.text}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-gray-400 text-xs">{msg.time}</span>
              {msg.unread && <div className="w-2 h-2 rounded-full bg-blue-500" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileDinaUppgifter() {
  const tasks = TASKS.slice(0, 3);
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: PRIMARY }}>Dina uppgifter</p>
        <Link to="/instructor-portal/utbildningskort" className="flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: PRIMARY }}>
          Visa alla <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="divide-y divide-gray-50">
        {tasks.map(({ label, detail, badge, highlight }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3">
            <div className="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-gray-800 text-sm font-medium truncate">{label}</p>
            </div>
            <span className="text-gray-400 text-xs shrink-0">{detail}</span>
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
              style={highlight
                ? { background: PRIMARY, color: 'white' }
                : { background: '#F3F4F6', color: '#6B7280' }}
            >
              {badge}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DESKTOP components ────────────────────────────────────────────────────────

// Shared card shadow
const CARD_SHADOW = '0 4px 16px rgba(0,0,0,0.06)';

function DonutChart({ segments, total }: { segments: DonutSegment[]; total: number }) {
  const cx = 70; const cy = 70; const r = 52; const sw = 16;
  const C  = 2 * Math.PI * r;
  const GAP = 2;
  let cumPct = 0;

  return (
    <svg width="140" height="140" viewBox="0 0 140 140" style={{ flexShrink: 0 }}>
      {/* Background track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={sw} />
      {total > 0 && segments.map((seg, i) => {
        const pct     = seg.value / total;
        const dashLen = Math.max(0, pct * C - GAP);
        const gapLen  = C - dashLen;
        const offset  = -(cumPct * C) + GAP / 2;
        cumPct += pct;
        if (dashLen <= 0) return null;
        return (
          <circle
            key={i} cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={sw}
            strokeDasharray={`${dashLen} ${gapLen}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="butt"
          />
        );
      })}
      {/* Center text */}
      <text x={cx} y={cy - 6}  textAnchor="middle" fontSize="11" fill="#9CA3AF" fontFamily="system-ui,sans-serif">Totalt</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="23" fontWeight="700" fill="#111827" fontFamily="system-ui,sans-serif">{total}</text>
      <text x={cx} y={cy + 30} textAnchor="middle" fontSize="11" fill="#9CA3AF" fontFamily="system-ui,sans-serif">elever</text>
    </svg>
  );
}

// KPI Row ──────────────────────────────────────────────────────────────────────

function DesktopKPIRow() {
  const { data: stats, isLoading } = useInstructorPortalStats();
  const { data: todayBookings }    = useInstructorPortalTodayBookings();

  const drivingCount = (todayBookings ?? []).filter(b =>
    (b.lesson_type_name ?? '').toLowerCase().includes('kör') ||
    (b.lesson_type_name ?? '').toLowerCase().includes('uppkörning'),
  ).length;
  const theoryCount = (todayBookings ?? []).filter(b =>
    (b.lesson_type_name ?? '').toLowerCase().includes('teori') ||
    (b.lesson_type_name ?? '').toLowerCase().includes('risk'),
  ).length;

  const revenueHours = stats?.total_hours_this_month ?? 0;
  const revenueStr   = revenueHours > 0
    ? `${Math.round(revenueHours * 625).toLocaleString('sv-SE')} kr`
    : '— kr';

  const cards = [
    {
      Icon: Users, iconBg: `${PRIMARY}15`, iconColor: PRIMARY,
      label: 'AKTIVA ELEVER',
      value: isLoading ? null : (stats?.unique_students ?? 0).toString(),
      sub: <span className="text-emerald-600 text-sm font-medium">+3 sedan förra veckan</span>,
    },
    {
      Icon: CalendarCheck, iconBg: '#14B8A615', iconColor: '#14B8A6',
      label: 'LEKTIONER IDAG',
      value: isLoading ? null : (stats?.lessons_today ?? 0).toString(),
      sub: <span className="text-gray-400 text-sm">{drivingCount} körlektioner, {theoryCount} teori</span>,
    },
    {
      Icon: Star, iconBg: '#F59E0B15', iconColor: '#F59E0B',
      label: 'GENOMSNITTLIGT BETYG',
      value: '4.8',
      sub: (
        <div className="flex items-center gap-0.5 mt-0.5">
          {[1, 2, 3, 4].map(i => (
            <svg key={i} className="w-3.5 h-3.5" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#F59E0B" />
            </svg>
          ))}
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
            <defs>
              <linearGradient id="half-star" x1="0" x2="1" y1="0" y2="0">
                <stop offset="80%" stopColor="#F59E0B" />
                <stop offset="80%" stopColor="#E5E7EB" />
              </linearGradient>
            </defs>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="url(#half-star)" />
          </svg>
          <span className="text-gray-400 text-sm ml-1">(128)</span>
        </div>
      ),
    },
    {
      Icon: TrendingUp, iconBg: '#3B82F615', iconColor: '#3B82F6',
      label: 'INTÄKTER (DENNA MÅNAD)',
      value: isLoading ? null : revenueStr,
      sub: <span className="text-emerald-600 text-sm font-medium">+12% sedan förra månaden</span>,
    },
  ] as const;

  return (
    <div className="grid grid-cols-4 gap-5">
      {cards.map(({ Icon, iconBg, iconColor, label, value, sub }) => (
        <div key={label} className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
              style={{ background: iconBg }}
            >
              <Icon className="w-5 h-5" style={{ color: iconColor }} strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
              {value === null ? (
                <div className="h-7 w-14 bg-gray-100 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-2xl font-bold text-gray-900 mt-0.5 truncate">{value}</p>
              )}
              <div className="mt-1">{sub}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Dagens Lektioner (purple card) ───────────────────────────────────────────────

function DagensLektionerCard() {
  const { data: bookings, isLoading } = useInstructorPortalTodayBookings();

  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{ background: 'linear-gradient(160deg, #684EFF 0%, #5B21B6 100%)', minHeight: '360px' }}
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-white/70 mb-4">
        Dagens lektioner
      </p>

      {isLoading ? (
        <div className="space-y-3 flex-1">
          {[1, 2, 3].map(i => <div key={i} className="h-14 bg-white/10 rounded-xl animate-pulse" />)}
        </div>
      ) : !bookings || bookings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-center flex-1">
          <CalendarDays className="w-8 h-8 text-white/30" />
          <p className="text-white/50 text-sm">Inga lektioner idag</p>
        </div>
      ) : (
        <div className="space-y-2 flex-1">
          {bookings.slice(0, 5).map(b => {
            const badge = getBookingBadge(b);
            const dur   = durationMin(b.starts_at, b.ends_at);
            const ini   = initials(b.student_first_name, b.student_last_name);
            return (
              <div key={b.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/10">
                {/* Time */}
                <div className="text-right shrink-0 w-14">
                  <p className="text-white font-bold text-sm">{formatTime(b.starts_at)}</p>
                  <p className="text-white/50 text-[11px]">{dur} min</p>
                </div>
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0 text-white text-[11px] font-bold">
                  {ini}
                </div>
                {/* Name + type */}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">
                    {b.student_first_name} {b.student_last_name}
                  </p>
                  {b.lesson_type_name && (
                    <p className="text-white/55 text-xs truncate">{b.lesson_type_name}</p>
                  )}
                </div>
                {/* Badge */}
                <span className={cn('text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap', badge.className)}>
                  {badge.text}
                </span>
                <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      <Link
        to="/instructor-portal/schema"
        className="mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors"
        style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
      >
        Visa hela kalendern <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

// Elevernas Framsteg (donut) ───────────────────────────────────────────────────

function ElevFramstegCard() {
  const { data: students } = useInstructorPortalStudents();

  const { segments, total } = useMemo(() => {
    if (!students || students.length === 0) {
      return { segments: [] as DonutSegment[], total: 0 };
    }
    const counts: Record<string, number> = {};
    for (const s of students) {
      counts[s.permit_stage] = (counts[s.permit_stage] ?? 0) + 1;
    }
    const segs = STAGE_MAP
      .map(({ key, label, color }) => ({ label, color, value: counts[key] ?? 0 }))
      .filter(s => s.value > 0);
    return { segments: segs, total: students.length };
  }, [students]);

  return (
    <div className="bg-white rounded-2xl p-5 flex flex-col" style={{ boxShadow: CARD_SHADOW }}>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: PRIMARY }}>
        Elevernas framsteg
      </p>
      <div className="flex items-center gap-4 flex-1">
        <DonutChart segments={segments} total={total} />
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {segments.map(({ label, color, value }) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-gray-600 text-sm truncate">{label}</span>
              </div>
              <span className="text-gray-400 text-sm font-medium shrink-0">{value} elever</span>
            </div>
          ))}
          {segments.length === 0 && (
            <p className="text-gray-400 text-sm">Inga elever ännu</p>
          )}
        </div>
      </div>
      <Link
        to="/instructor-portal/elever"
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold"
        style={{ color: PRIMARY }}
      >
        Visa alla elevers framsteg <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

// Senaste Meddelanden ──────────────────────────────────────────────────────────

function SenasteMeddelandenCard() {
  return (
    <div className="bg-white rounded-2xl p-5 flex flex-col" style={{ boxShadow: CARD_SHADOW }}>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: PRIMARY }}>
        Senaste meddelanden
      </p>
      <div className="space-y-3.5 flex-1">
        {DEMO_MSGS.map((msg, i) => (
          <div key={i} className="flex items-start gap-3">
            {msg.isSystem ? (
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 text-gray-400" strokeWidth={1.75} />
              </div>
            ) : (
              <div
                className="w-10 h-10 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
                style={{ background: PRIMARY }}
              >
                {msg.inits}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-gray-900 text-sm font-semibold truncate">{msg.name}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-gray-400 text-xs">{msg.time}</span>
                  {msg.unread && <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                </div>
              </div>
              <p className="text-gray-400 text-xs mt-0.5 line-clamp-1">{msg.text}</p>
            </div>
          </div>
        ))}
      </div>
      <Link
        to="/instructor-portal/bokningar"
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold"
        style={{ color: PRIMARY }}
      >
        Visa alla meddelanden <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

// Kommande Vecka ───────────────────────────────────────────────────────────────

function KommandeVeckaCard() {
  const { data: bookings } = useInstructorPortalUpcomingBookings();

  const byDay = useMemo(() => {
    const map: Record<string, InstructorPortalBooking[]> = {};
    for (const day of WEEK_DAYS) map[day.dateKey] = [];
    for (const b of bookings ?? []) {
      const key = b.starts_at.slice(0, 10);
      if (key in map) map[key]!.push(b);
    }
    return map;
  }, [bookings]);

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: PRIMARY }}>
        Kommande vecka
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {WEEK_DAYS.map(({ dateKey, dayName, dayNum }) => {
          const dayBookings = byDay[dateKey] ?? [];
          const isToday     = dateKey === TODAY_KEY;
          return (
            <div key={dateKey} className="flex flex-col items-center gap-1.5">
              <span className="text-gray-400 text-xs font-medium">{dayName}</span>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
                style={isToday
                  ? { background: PRIMARY, color: 'white' }
                  : { background: '#F3F4F6', color: '#374151' }}
              >
                {dayNum}
              </div>
              {dayBookings.length > 0 ? (
                <div className="w-full space-y-0.5">
                  <p className="text-xs text-gray-500 font-medium text-center">
                    {dayBookings.length} lektioner
                  </p>
                  {dayBookings.slice(0, 3).map(b => (
                    <p key={b.id} className="text-[11px] text-gray-400 truncate text-center leading-snug">
                      {formatTime(b.starts_at)} {b.student_first_name ?? '?'} {b.student_last_name?.[0] ?? ''}.
                    </p>
                  ))}
                  {dayBookings.length > 3 && (
                    <p className="text-[10px] text-gray-300 text-center">+{dayBookings.length - 3}</p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-gray-200 text-center">Ledigt</p>
              )}
            </div>
          );
        })}
      </div>
      <Link
        to="/instructor-portal/schema"
        className="mt-5 inline-flex items-center gap-1 text-sm font-semibold"
        style={{ color: PRIMARY }}
      >
        Visa fullständig kalender <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

// Dina Uppgifter ───────────────────────────────────────────────────────────────

function DinaUppgifterCard() {
  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: PRIMARY }}>
        Dina uppgifter
      </p>
      <div className="space-y-3.5">
        {TASKS.map(({ label, detail, badge, highlight }) => (
          <div key={label} className="flex items-center gap-3">
            <div className="w-4 h-4 rounded border-2 border-gray-300 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-gray-900 text-sm font-medium truncate">{label}</p>
              <p className="text-gray-400 text-xs">{detail}</p>
            </div>
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
              style={highlight
                ? { background: PRIMARY, color: 'white' }
                : { background: '#F3F4F6', color: '#6B7280' }}
            >
              {badge}
            </div>
          </div>
        ))}
      </div>
      <Link
        to="/instructor-portal/utbildningskort"
        className="mt-5 inline-flex items-center gap-1 text-sm font-semibold"
        style={{ color: PRIMARY }}
      >
        Visa alla uppgifter <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

// Populära Ämnen ───────────────────────────────────────────────────────────────

function PopularaAmnenCard() {
  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: PRIMARY }}>
        Populära ämnen (teori)
      </p>
      <div className="space-y-3.5">
        {POPULAR_TOPICS.map(({ name, pct }) => (
          <div key={name}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-700 text-sm">{name}</span>
              <span className="text-gray-500 text-sm font-semibold">{pct}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: PRIMARY }}
              />
            </div>
          </div>
        ))}
      </div>
      <Link
        to="/instructor-portal/statistik"
        className="mt-5 inline-flex items-center gap-1 text-sm font-semibold"
        style={{ color: PRIMARY }}
      >
        Visa all statistik <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

// Motivational Banner ──────────────────────────────────────────────────────────

function DesktopMotivationalBanner() {
  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #684EFF 0%, #4C1D95 100%)' }}
    >
      <div className="relative z-10 px-8 py-6">
        <p className="text-white font-bold text-xl">Du gör skillnad varje dag! 🚗💜</p>
        <p className="text-white/75 text-sm mt-1">Dina elever är ett steg närmare sitt körkort.</p>
        <p className="text-white/75 text-sm">Tack för ditt engagemang!</p>
      </div>
      {/* Right gradient glow */}
      <div
        className="absolute inset-y-0 right-0 w-1/2 pointer-events-none"
        style={{ background: 'linear-gradient(to left, rgba(255,138,88,0.25), transparent)' }}
      />
      {/* Decorative car */}
      <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none">
        <Car className="w-28 h-28 text-white" strokeWidth={0.75} />
      </div>
    </div>
  );
}

// Row composers ────────────────────────────────────────────────────────────────

function DesktopMainRow() {
  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
      <DagensLektionerCard />
      <ElevFramstegCard />
      <SenasteMeddelandenCard />
    </div>
  );
}

function DesktopSecondRow() {
  return (
    <div className="grid grid-cols-3 gap-5">
      <KommandeVeckaCard />
      <DinaUppgifterCard />
      <PopularaAmnenCard />
    </div>
  );
}

// ─── InstructorPortalDashboard ────────────────────────────────────────────────

export function InstructorPortalDashboard() {
  const session   = useInstructorPortalSession();
  const firstName = session.instructor_name.split(' ')[0] ?? session.instructor_name;

  return (
    <>
      {/* ── Mobile ─────────────────────────────────────────────────────────── */}
      <div className="lg:hidden">
        {/* Page header */}
        <div className="flex items-start justify-between pt-1 pb-5">
          <h1 className="text-[26px] font-bold text-gray-900 leading-tight">
            Hej {firstName}! 👋
          </h1>
          <button
            className="relative p-2 rounded-full mt-1"
            style={{ background: '#EEEEFF' }}
          >
            <Bell className="w-5 h-5" style={{ color: PRIMARY }} strokeWidth={1.75} />
            <span
              className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
              style={{ background: '#EF4444' }}
            >
              2
            </span>
          </button>
        </div>

        <div className="space-y-4">
          <MobileNextLessonCard />
          <div>
            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-3">Snabböversikt</p>
            <MobileStatsGrid />
          </div>
          <MobileDagensOchFramsteg />
          <MobileSenasteMeddelanden />
          <MobileDinaUppgifter />
        </div>
      </div>

      {/* ── Desktop ─────────────────────────────────────────────────────────── */}
      <div className="hidden lg:block space-y-5">
        <DesktopKPIRow />
        <DesktopMainRow />
        <DesktopSecondRow />
        <DesktopMotivationalBanner />
      </div>
    </>
  );
}
