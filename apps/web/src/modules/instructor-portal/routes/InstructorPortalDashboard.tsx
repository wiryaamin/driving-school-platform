import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, CalendarCheck, Users,
  ChevronRight, Clock, Car,
  CheckCircle2, Bell,
} from 'lucide-react';
import { useInstructorPortalSession } from './InstructorPortalLayout.js';
import {
  useInstructorPortalStats,
  useInstructorPortalTodayBookings,
  useInstructorPortalStudents,
  useInstructorPortalUpcomingBookings,
  type InstructorPortalBooking,
  type InstructorPortalStudent,
} from '../hooks/useInstructorPortal.js';
import { PERMIT_MILESTONES, milestoneRank } from '@modules/student-portal/lib/permitStage.js';
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

// ─── Follow-up derivation (real data) ──────────────────────────────────────────
// Replaces the previous "Dina uppgifter" widget, which was entirely
// hardcoded fake tasks with no data source. Students not driven with
// recently are a genuine, actionable signal derivable from data this page
// already fetches — no new backend query needed.
const FOLLOWUP_DAYS = 14;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function getFollowUpStudents(students: InstructorPortalStudent[] | undefined, limit: number) {
  return (students ?? [])
    .filter(s => {
      const d = daysSince(s.last_lesson_at);
      return d === null || d >= FOLLOWUP_DAYS;
    })
    .sort((a, b) => (daysSince(b.last_lesson_at) ?? Infinity) - (daysSince(a.last_lesson_at) ?? Infinity))
    .slice(0, limit);
}

// ─── Static desktop data ──────────────────────────────────────────────────────

// P2-2: bucketed by counts[s.permit_stage] against these 6 invented keys —
// real permit_stage values are the 11-value enum (permitStage.ts), so this
// lookup was always a miss and the donut below has shown zero segments since
// it was built. milestoneRank() collapses the real enum into the same 6
// visual buckets this chart was already designed around.
const MILESTONE_COLORS = ['#A78BFA', '#4338CA', '#818CF8', '#93C5FD', '#F59E0B', '#34D399'] as const;

function bucketByMilestone(students: { permit_stage: string }[]): DonutSegment[] {
  const counts = new Array(PERMIT_MILESTONES.length).fill(0) as number[];
  for (const s of students) {
    const rank = milestoneRank(s.permit_stage);
    counts[rank] = (counts[rank] ?? 0) + 1;
  }
  return PERMIT_MILESTONES
    .map((m, i) => ({ label: m.label, color: MILESTONE_COLORS[i] ?? '#9CA3AF', value: counts[i] ?? 0 }))
    .filter(s => s.value > 0);
}

interface DonutSegment { label: string; color: string; value: number }

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

  // Attendance rate — same real computation as InstructorPortalStatistikPage,
  // reused here in place of a fabricated rating that had no data source.
  const marked  = (todayBookings ?? []).filter(b => b.attendance_status !== null);
  const present = marked.filter(b => b.attendance_status === 'present');
  const attendanceRate = marked.length > 0 ? Math.round(present.length / marked.length * 100) : null;

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
            : <p className="text-gray-900 font-bold text-[16px] leading-none">{stats?.unique_students ?? 0}</p>}
          <p className="text-gray-500 text-[10px] leading-tight">Aktiva elever</p>
        </div>

        {/* Lektioner Idag */}
        <div className="flex flex-col items-center text-center gap-1">
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#E0FFF3' }}>
            <CalendarCheck className="w-4 h-4" style={{ color: '#10B981' }} strokeWidth={1.75} />
          </div>
          {isLoading
            ? <div className="h-5 w-6 bg-gray-100 rounded animate-pulse" />
            : <p className="text-gray-900 font-bold text-[16px] leading-none">{stats?.lessons_today ?? 0}</p>}
          <p className="text-gray-500 text-[10px] leading-tight">Lektioner idag</p>
          <p className="text-gray-400 text-[10px] leading-tight">{drivingCount} körlektioner,<br />{theoryCount} teori</p>
        </div>

        {/* Närvaro idag — real, derived from today's marked attendance */}
        <div className="flex flex-col items-center text-center gap-1">
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#E0FFE8' }}>
            <CheckCircle2 className="w-4 h-4" style={{ color: '#22C55E' }} strokeWidth={1.75} />
          </div>
          <p className="text-gray-900 font-bold text-[16px] leading-none">
            {attendanceRate !== null ? `${attendanceRate}%` : '—'}
          </p>
          <p className="text-gray-500 text-[10px] leading-tight">Närvaro idag</p>
          <p className="text-gray-400 text-[10px] leading-tight">
            {marked.length > 0 ? `${present.length} av ${marked.length} markerade` : 'Inga markerade än'}
          </p>
        </div>

        {/* Timmar denna månad — real, no fabricated SEK conversion */}
        <div className="flex flex-col items-center text-center gap-1">
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#E8F1FF' }}>
            <Clock className="w-4 h-4" style={{ color: '#3B82F6' }} strokeWidth={1.75} />
          </div>
          {isLoading
            ? <div className="h-5 w-8 bg-gray-100 rounded animate-pulse" />
            : <p className="text-gray-900 font-bold text-[16px] leading-none">{stats?.total_hours_this_month ?? 0}</p>}
          <p className="text-gray-500 text-[10px] leading-tight">Timmar (månad)</p>
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
    return { segments: bucketByMilestone(students), total: students.length };
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

function MobileUppfoljning() {
  const { data: students } = useInstructorPortalStudents();
  const followUp = getFollowUpStudents(students, 3);
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: PRIMARY }}>Uppföljning</p>
        <Link to="/instructor-portal/elever" className="flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: PRIMARY }}>
          Visa alla <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {followUp.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 px-4 py-6 text-center">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <p className="text-gray-400 text-xs">Alla elever är uppdaterade — ingen behöver uppföljning just nu.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {followUp.map((s) => {
            const d = daysSince(s.last_lesson_at);
            return (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-5 h-5 rounded-full border-2 border-amber-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-gray-800 text-sm font-medium truncate">{s.first_name} {s.last_name}</p>
                </div>
                <span className="text-gray-400 text-xs shrink-0">
                  {d === null ? 'Ingen lektion än' : `${d} dagar sedan`}
                </span>
              </div>
            );
          })}
        </div>
      )}
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

  // Attendance rate — same real computation as InstructorPortalStatistikPage,
  // reused here in place of a fabricated rating that had no data source.
  const marked  = (todayBookings ?? []).filter(b => b.attendance_status !== null);
  const present = marked.filter(b => b.attendance_status === 'present');
  const attendanceRate = marked.length > 0 ? Math.round(present.length / marked.length * 100) : null;

  const cards = [
    {
      Icon: Users, iconBg: `${PRIMARY}15`, iconColor: PRIMARY,
      label: 'AKTIVA ELEVER',
      value: isLoading ? null : (stats?.unique_students ?? 0).toString(),
      sub: null,
    },
    {
      Icon: CalendarCheck, iconBg: '#14B8A615', iconColor: '#14B8A6',
      label: 'LEKTIONER IDAG',
      value: isLoading ? null : (stats?.lessons_today ?? 0).toString(),
      sub: <span className="text-gray-400 text-sm">{drivingCount} körlektioner, {theoryCount} teori</span>,
    },
    {
      Icon: CheckCircle2, iconBg: '#22C55E15', iconColor: '#22C55E',
      label: 'NÄRVARO IDAG',
      value: attendanceRate !== null ? `${attendanceRate}%` : '—',
      sub: (
        <span className="text-gray-400 text-sm">
          {marked.length > 0 ? `${present.length} av ${marked.length} markerade` : 'Inga markerade än'}
        </span>
      ),
    },
    {
      Icon: Clock, iconBg: '#3B82F615', iconColor: '#3B82F6',
      label: 'TIMMAR (DENNA MÅNAD)',
      value: isLoading ? null : (stats?.total_hours_this_month ?? 0).toString(),
      sub: null,
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
    return { segments: bucketByMilestone(students), total: students.length };
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

// Uppföljning (real: students not seen recently) ───────────────────────────────

function UppfoljningCard() {
  const { data: students } = useInstructorPortalStudents();
  const followUp = getFollowUpStudents(students, 5);

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: PRIMARY }}>
        Uppföljning
      </p>
      {followUp.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
          <p className="text-gray-400 text-sm">Alla elever är uppdaterade — ingen behöver uppföljning just nu.</p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {followUp.map((s) => {
            const d = daysSince(s.last_lesson_at);
            return (
              <div key={s.id} className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border-2 border-amber-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 text-sm font-medium truncate">{s.first_name} {s.last_name}</p>
                  <p className="text-gray-400 text-xs">
                    {d === null ? 'Ingen lektion registrerad' : `Senast för ${d} dagar sedan`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Link
        to="/instructor-portal/elever"
        className="mt-5 inline-flex items-center gap-1 text-sm font-semibold"
        style={{ color: PRIMARY }}
      >
        Visa alla elever <ChevronRight className="w-4 h-4" />
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
    <div className="grid gap-5" style={{ gridTemplateColumns: '2fr 1fr' }}>
      <DagensLektionerCard />
      <ElevFramstegCard />
    </div>
  );
}

function DesktopSecondRow() {
  return (
    <div className="grid grid-cols-2 gap-5">
      <KommandeVeckaCard />
      <UppfoljningCard />
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
          <Link
            to="/instructor-portal/installningar"
            className="relative p-2 rounded-full mt-1"
            style={{ background: '#EEEEFF' }}
            aria-label="Aviseringsinställningar"
          >
            <Bell className="w-5 h-5" style={{ color: PRIMARY }} strokeWidth={1.75} />
          </Link>
        </div>

        <div className="space-y-4">
          <MobileNextLessonCard />
          <div>
            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-3">Snabböversikt</p>
            <MobileStatsGrid />
          </div>
          <MobileDagensOchFramsteg />
          <MobileUppfoljning />
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
