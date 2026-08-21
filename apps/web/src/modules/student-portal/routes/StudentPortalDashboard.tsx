import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell, ChevronRight, ArrowRight,
  Car, Star, AlertCircle, FileText,
  BookOpen, GraduationCap, Wallet, MessageSquare,
  CheckCircle2, CalendarPlus, Zap, Heart,
} from 'lucide-react';
import {
  usePortalBookings, usePortalTerms, usePortalAcceptTerms,
  usePortalProgress, usePortalMe, usePortalHistory,
  useUnreadNotificationCount, usePortalQuizCategories,
} from '../hooks/useStudentPortal.js';
import { usePortalSession } from './StudentPortalLayout.js';

// ─── Brand tokens ─────────────────────────────────────────────────────────────

const PRIMARY   = '#684EFF';
const SECONDARY = '#FF8A58';
const TEAL      = '#14B8A6';
const PINK      = '#FF4B8A';
const BLUE_ACC  = '#4F7BFF';

// ─── Stage config ─────────────────────────────────────────────────────────────
//
// These must mirror the real `permit_stage` DB enum (see
// 20260528000001_phase2a_domain_foundation.sql) — an earlier invented
// 6-value vocabulary here ('learner'/'risk1'/'risk2'/'theory'/'practical'/
// 'licensed') never matched any actual stage value, so this widget's
// percentage, timeline, and recommendation always silently fell back to
// hardcoded defaults regardless of the student's real progress.

const STAGE_ORDER = [
  'not_started', 'theory_study',
  'risk1_booked', 'risk1_completed',
  'risk2_booked', 'risk2_completed',
  'theory_exam_booked', 'theory_passed',
  'practical_exam_booked', 'practical_passed', 'licence_issued',
] as const;
type Stage = (typeof STAGE_ORDER)[number];

function stageIndex(stage: string): number {
  const idx = STAGE_ORDER.indexOf(stage as Stage);
  return idx === -1 ? 0 : idx;
}

// Two DB stages per visual milestone (booked + completed), Körkort alone.
function milestoneRank(stage: string): number {
  return Math.min(5, Math.floor(stageIndex(stage) / 2));
}

const TIMELINE: Array<{ label: string }> = [
  { label: 'Start'      },
  { label: 'Risk 1'     },
  { label: 'Risk 2'     },
  { label: 'Teori'      },
  { label: 'Uppkörning' },
  { label: 'Körkort'    },
];

const STAGE_RECOMMENDATIONS: Record<Stage, { title: string; subtitle: string; link: string }> = {
  not_started:           { title: 'Öva fordonskontroll', subtitle: 'Grunderna för säker körning',      link: '/portal/boka'  },
  theory_study:          { title: 'Öva teoriprov',        subtitle: 'Träna på fler frågor idag',        link: '/portal/teori' },
  risk1_booked:          { title: 'Förbered Risk 1',      subtitle: 'Viktig utbildning för körkortet',  link: '/portal/boka'  },
  risk1_completed:       { title: 'Boka Risk 2',          subtitle: 'Risk 1 klar — dags för nästa steg', link: '/portal/boka'  },
  risk2_booked:          { title: 'Förbered Risk 2',      subtitle: 'Mörkerövningen väntar',            link: '/portal/boka'  },
  risk2_completed:       { title: 'Öva på parkering',     subtitle: 'Rekommenderas av din instruktör',  link: '/portal/boka'  },
  theory_exam_booked:    { title: 'Repetera teorin',      subtitle: 'Teoriprovet är bokat',             link: '/portal/teori' },
  theory_passed:         { title: 'Körprovstips',         subtitle: 'Förbered dig inför uppkörningen',  link: '/portal/boka'  },
  practical_exam_booked: { title: 'Finjustera körningen', subtitle: 'Uppkörningen är bokad',            link: '/portal/boka'  },
  practical_passed:      { title: 'Grattis, snart klar!', subtitle: 'Körkortet är på väg',              link: '/portal'       },
  licence_issued:        { title: 'Välkommen på vägarna!', subtitle: 'Du har klarat körkortet',         link: '/portal'       },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProgressPct(stage: string): number {
  if (stage === 'licence_issued') return 100;
  return Math.round((stageIndex(stage) / (STAGE_ORDER.length - 1)) * 100);
}

const STOCKHOLM_DAY_KEY: Intl.DateTimeFormatOptions = { timeZone: 'Europe/Stockholm' };

function formatLessonDate(iso: string): string {
  const d   = new Date(iso);
  const now = new Date();
  const tom = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dayKey = (x: Date) => x.toLocaleDateString('sv-SE', STOCKHOLM_DAY_KEY);
  if (dayKey(d) === dayKey(now)) return 'Idag';
  if (dayKey(d) === dayKey(tom)) return 'Imorgon';
  return d
    .toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' })
    .replace(/^./, (c) => c.toUpperCase());
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
}

// ─── Stage timeline (shared) ──────────────────────────────────────────────────

function StageTimeline({ stage, showBadge = true }: { stage: string; showBadge?: boolean }) {
  const currentIdx = stage === 'licence_issued' ? TIMELINE.length : milestoneRank(stage);
  const BADGE_H    = 22;
  const TOP_OFFSET = showBadge ? BADGE_H : 0;
  const TRACK_TOP  = TOP_OFFSET + 18;

  return (
    <div className="relative" style={{ paddingTop: TOP_OFFSET }}>
      <div
        className="absolute pointer-events-none"
        style={{
          top: TRACK_TOP,
          left:   'calc(100% / 12)',
          right:  'calc(100% / 12)',
          height: 2.5,
          background: '#E5E7EB',
          zIndex: 1,
        }}
      />
      {currentIdx > 0 && (
        <div
          className="absolute pointer-events-none"
          style={{
            top:    TRACK_TOP,
            left:   'calc(100% / 12)',
            height: 2.5,
            background: PRIMARY,
            width:  `calc(${currentIdx} * 100% / 6)`,
            zIndex: 1,
          }}
        />
      )}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        {TIMELINE.map(({ label }, mIdx) => {
          const done = currentIdx > mIdx;
          const curr = currentIdx === mIdx;
          return (
            <div key={label} className="flex flex-col items-center relative">
              {curr && showBadge && (
                <div
                  className="absolute whitespace-nowrap"
                  style={{ top: -BADGE_H, left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}
                >
                  <span
                    className="px-2 py-[2px] rounded-full text-white text-[8px] font-bold shadow-md"
                    style={{ background: PRIMARY }}
                  >
                    Du är här
                  </span>
                </div>
              )}
              <div style={{ position: 'relative', zIndex: 2 }}>
                {done ? (
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: PRIMARY }}
                  >
                    <CheckCircle2 className="w-[18px] h-[18px] text-white" strokeWidth={2.5} />
                  </div>
                ) : curr ? (
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: PRIMARY, boxShadow: `0 4px 14px ${PRIMARY}66` }}
                  >
                    <Car className="w-[18px] h-[18px] text-white" strokeWidth={2} />
                  </div>
                ) : (
                  <div
                    className="w-9 h-9 rounded-full border-2 bg-white flex items-center justify-center"
                    style={{ borderColor: '#D1D5DB' }}
                  >
                    <CheckCircle2 className="w-[18px] h-[18px] text-gray-300" strokeWidth={2} />
                  </div>
                )}
              </div>
              <span
                className="mt-1 text-[9px] text-center leading-tight font-medium w-full"
                style={{ color: curr ? PRIMARY : done ? '#6B7280' : '#C4C9D4' }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Terms Banner ─────────────────────────────────────────────────────────────

function TermsBanner() {
  const { data: terms, isLoading } = usePortalTerms();
  const accept = usePortalAcceptTerms();
  if (isLoading || terms?.accepted) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">Bekräfta skolans villkor</p>
          <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
            Vänligen acceptera trafikskolans allmänna villkor för att fortsätta använda portalen.
          </p>
          <button
            type="button"
            onClick={() => accept.mutate()}
            disabled={accept.isPending}
            className="mt-2 px-4 py-1 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-60"
            style={{ background: '#D97706' }}
          >
            {accept.isPending ? 'Sparar…' : 'Jag accepterar villkoren'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Greeting Header (mobile only) ────────────────────────────────────────────

function GreetingHeader({ name }: { name: string }) {
  const { data: unread } = useUnreadNotificationCount();
  const count = unread?.count ?? 0;
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-[26px] font-extrabold text-gray-900 leading-tight">Hej {name}! 👋</h1>
        <p className="text-gray-400 text-sm mt-0.5">Bra jobbat! Du är på rätt väg.</p>
      </div>
      <Link
        to="/portal/meddelanden"
        className="relative mt-1 p-2 rounded-2xl bg-white shadow-sm"
      >
        <Bell className="w-5 h-5 text-gray-500" strokeWidth={1.75} />
        {count > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
            style={{ background: SECONDARY }}
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </Link>
    </div>
  );
}

// ─── Next Lesson Hero Card ────────────────────────────────────────────────────

interface BookingSummary {
  starts_at:             string;
  ends_at:               string;
  lesson_type_name:      string | null;
  instructor_first_name: string | null;
  instructor_last_name:  string | null;
  location_name?:        string | null;
  vehicle_label?:        string | null;
}

function NextLessonCard({
  booking, isLoading, studentName,
}: {
  booking: BookingSummary | undefined;
  isLoading: boolean;
  studentName: string;
}) {
  if (isLoading) {
    return <div className="rounded-[20px] animate-pulse" style={{ height: 156, background: `${PRIMARY}20` }} />;
  }

  const instructorName = booking
    ? [booking.instructor_first_name, booking.instructor_last_name].filter(Boolean).join(' ')
    : '';
  const dateLabel = booking ? formatLessonDate(booking.starts_at) : '';
  const timeFrom  = booking ? formatTime(booking.starts_at) : '';

  const studentInitials = studentName
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  return (
    <div
      className="rounded-[20px] relative overflow-hidden"
      style={{ background: '#5B2BE0', minHeight: 156, boxShadow: '0 10px 28px rgba(91,43,224,0.36)' }}
    >
      {/* Right panel — nature/sunset scene */}
      <div className="absolute inset-y-0 right-0 w-[45%] pointer-events-none">
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(155deg, #ff9355 0%, #ffc06a 20%, #7db872 48%, #2e7d32 75%, #1a5c20 100%)' }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-2/5"
          style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.42) 0%, transparent 100%)' }}
        />
        <div
          className="absolute inset-y-0 left-0 w-[65%]"
          style={{ background: 'linear-gradient(to right, #5B2BE0 0%, transparent 100%)' }}
        />
      </div>

      {/* Student profile circle */}
      <div
        className="absolute"
        style={{ left: '57%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 10 }}
      >
        <div
          className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white font-bold text-lg"
          style={{
            background: `${PRIMARY}CC`,
            border: '3px solid white',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          }}
        >
          {studentInitials}
        </div>
      </div>

      {/* Left content */}
      <div className="relative z-10 py-3 px-5" style={{ paddingRight: '44%' }}>
        <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-1">
          Din nästa lektion
        </p>

        {!booking ? (
          <>
            <p className="text-white font-extrabold text-[1.5rem] leading-[1.1] mt-1">
              Inga kommande lektioner
            </p>
            <p className="text-white/65 text-xs mt-1.5 mb-2.5">Boka din nästa körlektion nu</p>
            <Link
              to="/portal/boka"
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-[12px] text-sm font-bold text-white"
              style={{ border: '1.5px solid rgba(255,255,255,0.6)' }}
            >
              Boka lektion <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </>
        ) : (
          <>
            <p className="text-white font-extrabold text-[1.75rem] leading-[1.1] mt-1">
              {dateLabel} {timeFrom}
            </p>
            {instructorName && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-white/55 text-sm">👤</span>
                <p className="text-white/90 text-xs font-semibold">med {instructorName}</p>
              </div>
            )}
            {booking.lesson_type_name && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-white/40 text-sm">🚗</span>
                <p className="text-white/65 text-xs">{booking.lesson_type_name}</p>
              </div>
            )}
            {booking.vehicle_label && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-white/40 text-sm">🚙</span>
                <p className="text-white/65 text-xs">{booking.vehicle_label}</p>
              </div>
            )}
            {booking.location_name && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-white/40 text-sm">📍</span>
                <p className="text-white/65 text-xs">{booking.location_name}</p>
              </div>
            )}
            <Link
              to="/portal/bokningar"
              className="mt-2.5 inline-flex items-center gap-2 px-4 py-1.5 rounded-[12px] text-sm font-bold text-white"
              style={{ border: '1.5px solid rgba(255,255,255,0.6)' }}
            >
              Visa lektion <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Progress Journey Card ────────────────────────────────────────────────────

function ProgressJourneyCard({ pct, completedCount, stage, isLoading }: {
  pct: number; completedCount: number; stage: string; isLoading: boolean;
}) {
  const targetCount = TIMELINE.length;

  return (
    <div className="rounded-[20px] p-3.5 bg-white" style={{ boxShadow: '0 6px 24px rgba(0,0,0,0.07)' }}>
      <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: PRIMARY }}>
        Din körkortsresa
      </p>

      {isLoading ? (
        <div className="h-14 bg-gray-50 rounded-xl animate-pulse" />
      ) : (
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-[80px]">
            <p className="text-[2.5rem] font-extrabold tabular-nums leading-none" style={{ color: PRIMARY }}>
              {pct}%
            </p>
            <p className="text-gray-400 text-[11px] mt-1 leading-snug">
              {completedCount} steg av {targetCount} klara
            </p>
            <Link
              to="/portal/korkortsresa"
              className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-semibold"
              style={{ color: PRIMARY }}
            >
              Visa hela resan <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex-1 min-w-0">
            <StageTimeline stage={stage} showBadge />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Daily Focus Card (mobile) ────────────────────────────────────────────────

function DailyFocusCard({ stage }: { stage: string }) {
  const messages: Record<string, string> = {
    learner:   'Fordonskontroll', risk1: 'Förbered Risk 1',
    risk2:     'Kör bra!',       theory: 'Öva teoriprov',
    practical: 'Körprovsfokus',  licensed: 'Välkommen! 🎉',
  };
  const subtitles: Record<string, string> = {
    learner:   'Start bra idag',        risk1: 'Ha en bra lektion',
    risk2:     'Ha en bra lektion idag', theory: 'Öva frågorna',
    practical: 'Körprovsdagen',          licensed: 'Du klarade det!',
  };
  const to = stage === 'theory' ? '/portal/teori' : '/portal/boka';
  const title    = messages[stage]  ?? 'Kör bra!';
  const subtitle = subtitles[stage] ?? 'Ha en bra lektion idag';

  return (
    <Link
      to={to}
      className="flex flex-col h-full rounded-2xl p-2.5 bg-white overflow-hidden"
      style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: SECONDARY }}>
        Dagens fokus
      </p>
      <div className="flex items-start gap-3 flex-1">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: `${SECONDARY}1A` }}
        >
          <Car className="w-6 h-6" style={{ color: SECONDARY }} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 font-bold text-[15px] leading-snug">{title}</p>
          <p className="text-gray-400 text-xs mt-0.5 leading-snug">{subtitle}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
      </div>
    </Link>
  );
}

// ─── Theory Card (mobile) ─────────────────────────────────────────────────────

function TheoryCard() {
  const { data: categories } = usePortalQuizCategories();
  const totalQ = categories?.reduce((s, c) => s + (c.last_total ?? 0), 0) ?? 0;
  const displayQ = totalQ > 0 ? totalQ : 8;

  return (
    <div
      className="flex flex-col h-full rounded-2xl p-2.5 bg-white overflow-hidden"
      style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: BLUE_ACC }}>
        Teori att träna
      </p>
      <div className="flex items-start gap-3 flex-1">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: `${BLUE_ACC}1A` }}
        >
          <BookOpen className="w-6 h-6" style={{ color: BLUE_ACC }} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 font-bold text-[15px] leading-snug">{displayQ} frågor</p>
          <p className="text-gray-400 text-xs mt-0.5">rekommenderas</p>
        </div>
      </div>
      <Link
        to="/portal/teori"
        className="mt-1 text-xs font-semibold flex items-center gap-0.5"
        style={{ color: BLUE_ACC }}
      >
        Träna teori <ChevronRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

// ─── Instructor Feedback Card (mobile) ────────────────────────────────────────

function InstructorFeedbackCard({
  instructorName, notes, rating,
}: {
  instructorName: string | null | undefined;
  notes:          string | null | undefined;
  rating:         number | null;
}) {
  const firstName = instructorName?.split(' ')[0] ?? 'Instruktören';
  const initials  = instructorName
    ? instructorName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div
      className="flex flex-col h-full rounded-2xl p-2.5 bg-white overflow-hidden"
      style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: PINK }}>
          {firstName} skrev
        </p>
        <Heart className="w-4 h-4 shrink-0" style={{ color: '#FF4B8A', fill: '#FF4B8A' }} />
      </div>

      {!instructorName || !notes ? (
        <p className="text-gray-400 text-xs mt-0.5 flex-1">Inget feedback ännu.</p>
      ) : (
        <>
          {rating !== null && rating !== undefined && (
            <div className="flex items-center gap-0.5 mb-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className="w-4 h-4"
                  style={{
                    color: i < Math.round(rating) ? '#F59E0B' : '#E5E7EB',
                    fill:  i < Math.round(rating) ? '#F59E0B' : '#E5E7EB',
                  }}
                  strokeWidth={0}
                />
              ))}
            </div>
          )}
          <p className="text-gray-500 text-[11px] italic leading-relaxed line-clamp-4 mb-2 flex-1">
            "{notes}"
          </p>
          <div className="flex items-center justify-between mt-auto">
            <Link
              to="/portal/korkortsresa"
              className="text-xs font-semibold flex items-center gap-0.5"
              style={{ color: PINK }}
            >
              Visa feedback <ChevronRight className="w-3 h-3" />
            </Link>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ background: PRIMARY }}
            >
              {initials}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Smart Suggestion Card (mobile) ──────────────────────────────────────────

function SmartSuggestionCard({ instructorName }: { instructorName: string | null | undefined }) {
  const initials = instructorName
    ? instructorName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div
      className="flex flex-col h-full rounded-2xl p-2.5 bg-white overflow-hidden"
      style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: TEAL }}>
          Smart förslag
        </p>
        <Zap className="w-4 h-4 shrink-0" style={{ color: TEAL, fill: TEAL }} />
      </div>

      <p className="text-gray-900 font-bold text-[15px] leading-snug mb-1">Boka nästa lektion</p>
      <p className="text-gray-400 text-xs flex-1">Fortsätt din utveckling</p>

      <div className="flex items-center justify-between mt-auto">
        <Link
          to="/portal/boka"
          className="text-xs font-semibold flex items-center gap-0.5"
          style={{ color: TEAL }}
        >
          Boka nu <ChevronRight className="w-3 h-3" />
        </Link>
        {instructorName && (
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ background: PRIMARY }}
          >
            {initials}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Fortsätt Lära Card (desktop) ─────────────────────────────────────────────

function FortsattLaraCard({ completedCount }: { completedCount: number }) {
  const { data: categories } = usePortalQuizCategories();
  const totalQ   = categories?.reduce((s, c) => s + (c.last_total ?? 0), 0) ?? 0;
  const displayQ = totalQ > 0 ? totalQ : 8;
  const doneQ    = Math.min(completedCount, displayQ);
  const pct      = displayQ > 0 ? Math.round((doneQ / displayQ) * 100) : 0;

  return (
    <div className="rounded-2xl p-5 bg-white" style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: PRIMARY }}>
        Fortsätt lära
      </p>
      <div className="flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: `${BLUE_ACC}1A` }}
        >
          <BookOpen className="w-6 h-6" style={{ color: BLUE_ACC }} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 font-bold text-[17px]">Teoriövning</p>
          <p className="text-gray-400 text-sm mt-0.5">{displayQ} frågor rekommenderas idag</p>
          <div className="mt-3">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: BLUE_ACC }}
              />
            </div>
            <p className="text-gray-400 text-xs mt-1">{doneQ} av {displayQ} klara</p>
          </div>
        </div>
      </div>
      <Link
        to="/portal/teori"
        className="mt-5 inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold text-white"
        style={{ background: PRIMARY }}
      >
        Öva nu <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

// ─── Din Instruktör Card (desktop) ────────────────────────────────────────────

function DinInstruktorCard({
  instructorName, notes, rating,
}: {
  instructorName: string | null | undefined;
  notes:          string | null | undefined;
  rating:         number | null;
}) {
  const initials = instructorName
    ? instructorName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className="rounded-2xl p-5 bg-white" style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
      <div className="flex items-start justify-between mb-4">
        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: TEAL }}>
          Din instruktör
        </p>
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ background: PRIMARY }}
        >
          {initials}
        </div>
      </div>

      {!instructorName ? (
        <p className="text-gray-400 text-sm">Ingen instruktör tilldelad ännu.</p>
      ) : (
        <>
          <p className="text-gray-900 font-bold text-[17px]">{instructorName}</p>
          {rating !== null && rating !== undefined && (
            <div className="flex items-center gap-1 mt-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className="w-4 h-4"
                  style={{
                    color: i < Math.round(rating) ? '#F59E0B' : '#E5E7EB',
                    fill:  i < Math.round(rating) ? '#F59E0B' : '#E5E7EB',
                  }}
                  strokeWidth={0}
                />
              ))}
              <span className="text-gray-500 text-sm font-semibold ml-1">{rating.toFixed(1)}</span>
            </div>
          )}
          {notes && (
            <p className="text-gray-500 text-sm italic leading-relaxed mt-3 line-clamp-3">
              "{notes}"
            </p>
          )}
          <Link
            to="/portal/korkortsresa"
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold"
            style={{ color: TEAL }}
          >
            Visa all feedback <ChevronRight className="w-4 h-4" />
          </Link>
        </>
      )}
    </div>
  );
}

// ─── Dagens Rekommendation Card ────────────────────────────────────────────────

function DagensRekommendationCard({ stage }: { stage: string }) {
  const rec = STAGE_RECOMMENDATIONS[stage as Stage] ?? STAGE_RECOMMENDATIONS['not_started'];

  return (
    <div
      className="relative overflow-hidden rounded-[20px] flex items-center gap-4 px-5 py-4"
      style={{ background: `${SECONDARY}18` }}
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: `${SECONDARY}28` }}
      >
        <Car className="w-6 h-6" style={{ color: SECONDARY }} strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: SECONDARY }}>
          Dagens rekommendation
        </p>
        <p className="text-gray-900 font-bold text-[17px] leading-tight">{rec.title}</p>
        <p className="text-gray-500 text-sm mt-0.5">{rec.subtitle}</p>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <Link
          to={rec.link}
          className="px-5 py-2 rounded-full text-sm font-bold text-white whitespace-nowrap"
          style={{ background: SECONDARY }}
        >
          Kom igång →
        </Link>
        <div
          className="hidden lg:flex w-14 h-14 items-center justify-center opacity-25"
          aria-hidden="true"
        >
          <Car className="w-full h-full" style={{ color: SECONDARY }} strokeWidth={0.75} />
        </div>
      </div>
    </div>
  );
}

// ─── Körkortsresa Section ─────────────────────────────────────────────────────

function KorkortsresaSection({ stage }: { stage: string }) {
  return (
    <div className="rounded-[20px] p-3.5 bg-white" style={{ boxShadow: '0 6px 24px rgba(0,0,0,0.07)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: PRIMARY }}>
          Körkortsresa
        </p>
        <Link to="/portal/korkortsresa" className="text-xs font-semibold flex items-center gap-0.5" style={{ color: PRIMARY }}>
          Visa allt <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="pb-1">
        <StageTimeline stage={stage} showBadge={false} />
      </div>
    </div>
  );
}

// ─── Motivational Banner ──────────────────────────────────────────────────────

function MotivationalBanner({ stage }: { stage: string }) {
  const isLicensed = stage === 'licensed';
  const main = isLicensed ? 'Grattis till körkortet! 🎉' : 'Du närmar dig målet! 🚗💜';
  const sub  = isLicensed
    ? 'Du klarade det — välkommen på vägarna!'
    : 'Varje lektion tar dig närmare ditt körkort.\nDu klarar det!';

  return (
    <div
      className="relative overflow-hidden rounded-[20px] py-5 px-3.5"
      style={{
        background: 'linear-gradient(135deg, #1a0840 0%, #2d1469 22%, #4a1d96 48%, #1e3a6e 75%, #0f2552 100%)',
        minHeight: 98,
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 78% 90%, rgba(255,110,40,0.5) 0%, rgba(200,50,180,0.28) 38%, transparent 62%)' }}
      />
      <svg
        className="absolute bottom-0 left-0 w-full pointer-events-none"
        viewBox="0 0 800 100"
        preserveAspectRatio="none"
        style={{ height: '60%' }}
        aria-hidden="true"
      >
        <path d="M0,100 L120,32 L220,68 L350,4 L480,54 L600,18 L720,48 L800,28 L800,100 Z" fill="rgba(255,195,110,0.18)" />
        <path d="M0,100 L80,58 L170,79 L280,38 L400,68 L520,32 L650,63 L750,38 L800,53 L800,100 Z" fill="rgba(255,255,255,0.07)" />
      </svg>
      {([[14,14,2],[24,7,1.5],[39,19,1],[59,11,2],[71,24,1.5]] as [number,number,number][]).map(([x,y,r],i) => (
        <div key={i} className="absolute rounded-full bg-white pointer-events-none" style={{ left: `${x}%`, top: `${y}%`, width: r*2, height: r*2, opacity: 0.55 }} aria-hidden="true" />
      ))}
      <div className="relative z-10 max-w-[70%]">
        <p className="text-white font-bold text-lg leading-snug">{main}</p>
        <p className="text-white/75 text-sm mt-1 leading-relaxed whitespace-pre-line">{sub}</p>
      </div>
    </div>
  );
}

// ─── Quick Links ──────────────────────────────────────────────────────────────

function QuickLinks() {
  const { data: unread } = useUnreadNotificationCount();
  const msgCount = unread?.count ?? 0;

  const ALL_LINKS = [
    { to: '/portal/boka',         label: 'Boka lektion', Icon: CalendarPlus,  badge: 0        },
    { to: '/portal/teori',        label: 'Teori',        Icon: GraduationCap, badge: 0        },
    { to: '/portal/meddelanden',  label: 'Meddelanden',  Icon: MessageSquare, badge: msgCount },
    { to: '/portal/dokument',     label: 'Dokument',     Icon: FileText,      badge: 0        },
    { to: '/portal/konto',        label: 'Ekonomi',      Icon: Wallet,        badge: 0        },
  ] as const;

  const MOBILE_LINKS = ALL_LINKS.filter(l => l.label !== 'Dokument');

  function LinkCard({ to, label, Icon, badge }: { to: string; label: string; Icon: React.ElementType; badge: number }) {
    return (
      <Link
        to={to}
        className="rounded-2xl py-3 px-2 flex flex-col items-center gap-1.5 text-center relative bg-white"
        style={{ boxShadow: '0 4px 14px rgba(0,0,0,0.08)' }}
      >
        <div className="relative">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: `${PRIMARY}12` }}
          >
            <Icon className="w-6 h-6" style={{ color: PRIMARY }} strokeWidth={1.75} />
          </div>
          {badge > 0 && (
            <span
              className="absolute -top-1 -right-1.5 min-w-[18px] h-[18px] px-0.5 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
              style={{ background: SECONDARY }}
            >
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </div>
        <span className="text-gray-600 text-[11px] font-semibold leading-tight">{label}</span>
      </Link>
    );
  }

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
        Snabblänkar
      </p>
      {/* Mobile: 4 items */}
      <div className="lg:hidden grid grid-cols-4 gap-2">
        {MOBILE_LINKS.map(({ to, label, Icon, badge }) => (
          <LinkCard key={to} to={to} label={label} Icon={Icon} badge={badge} />
        ))}
      </div>
      {/* Desktop: 5 items */}
      <div className="hidden lg:grid grid-cols-5 gap-3">
        {ALL_LINKS.map(({ to, label, Icon, badge }) => (
          <LinkCard key={to} to={to} label={label} Icon={Icon} badge={badge} />
        ))}
      </div>
    </div>
  );
}

// ─── StudentPortalDashboard ───────────────────────────────────────────────────

export function StudentPortalDashboard() {
  const session = usePortalSession();

  const { data: progress, isLoading: progressLoad }                         = usePortalProgress();
  const { data: bookings, isLoading: bookingsLoad, isError: bookingsError } = usePortalBookings();
  const { data: me }                                                          = usePortalMe();
  const { data: history, isLoading: historyLoad }                             = usePortalHistory();

  const firstName = session.student_name.split(' ')[0] ?? session.student_name;
  const stage     = progress?.permit_stage ?? me?.permit_stage ?? 'not_started';
  const now       = Date.now();

  const upcoming = useMemo(
    () =>
      (bookings ?? [])
        .filter(b =>
          (b.status === 'confirmed' || b.status === 'reserved') &&
          new Date(b.starts_at).getTime() > now,
        )
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [bookings, now],
  );

  const latestFeedback = useMemo(
    () =>
      (history ?? [])
        .filter(h => h.instructor_notes && h.instructor_notes.trim().length > 0)
        .sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0] ?? null,
    [history],
  );

  const pct            = progress ? getProgressPct(stage) : 0;
  const completedCount = progress ? (stage === 'licence_issued' ? TIMELINE.length : milestoneRank(stage)) : 0;
  const nextLesson     = upcoming[0];

  const feedbackInstructorName = latestFeedback
    ? [latestFeedback.instructor_first_name, latestFeedback.instructor_last_name].filter(Boolean).join(' ')
    : null;
  const feedbackRating = latestFeedback?.performance_rating ?? null;

  return (
    <div className="space-y-3 lg:space-y-4">

      <TermsBanner />

      {/* Greeting — mobile only; desktop shows greeting in DesktopTopBar */}
      <div className="lg:hidden">
        <GreetingHeader name={firstName} />
      </div>

      {bookingsError && !historyLoad && (
        <div className="flex items-center gap-3 p-3 bg-red-50 rounded-2xl border border-red-100">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-600">Kunde inte hämta dina lektioner. Försök igen senare.</p>
        </div>
      )}

      {/* 1. Hero: next lesson */}
      <NextLessonCard
        booking={nextLesson}
        isLoading={bookingsLoad}
        studentName={session.student_name}
      />

      {/* 2. Progress journey */}
      <ProgressJourneyCard
        pct={pct}
        completedCount={completedCount}
        stage={stage}
        isLoading={progressLoad}
      />

      {/* 3. Cards — mobile: 2×2 small grid / desktop: 2 large cards */}
      <div className="lg:hidden grid grid-cols-2 gap-2" style={{ gridAutoRows: '100px' }}>
        <DailyFocusCard stage={stage} />
        <TheoryCard />
        <InstructorFeedbackCard
          instructorName={feedbackInstructorName}
          notes={latestFeedback?.instructor_notes}
          rating={feedbackRating}
        />
        <SmartSuggestionCard instructorName={feedbackInstructorName} />
      </div>
      <div className="hidden lg:grid grid-cols-2 gap-4">
        <FortsattLaraCard completedCount={completedCount} />
        <DinInstruktorCard
          instructorName={feedbackInstructorName}
          notes={latestFeedback?.instructor_notes}
          rating={feedbackRating}
        />
      </div>

      {/* 4. Dagens rekommendation */}
      <DagensRekommendationCard stage={stage} />

      {/* 5. Körkortsresa timeline — mobile only */}
      <div className="lg:hidden">
        <KorkortsresaSection stage={stage} />
      </div>

      {/* 6. Motivational banner */}
      <MotivationalBanner stage={stage} />

      {/* 7. Quick links */}
      <QuickLinks />

    </div>
  );
}
