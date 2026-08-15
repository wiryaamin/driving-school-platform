import { useMemo, useState, useEffect, useRef } from 'react';
import {
  GraduationCap, Calendar, Receipt, Users, AlertTriangle,
  Clock, UserPlus, CalendarPlus, UserCheck, RefreshCcw, ChevronRight, Search, CalendarCheck,
  MessageSquare, CalendarDays, LayoutGrid, ListFilter, Bell, SlidersHorizontal, ClipboardList,
} from 'lucide-react';
import { useNavigate, Link, NavLink } from 'react-router-dom';
import { useSession } from '@shared/hooks/useSession.js';
import { formatTime, humanizeIdentifier, formatChannelLabel } from '@platform/utils';
import { usePermissions } from '@core/rbac/hooks.js';
import { Permissions } from '@core/rbac/permissions.js';
import type { Permission } from '@core/rbac/permissions.js';
import { cn } from '@/lib/utils.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { StatCard } from '../components/StatCard.js';
import { useDashboardMetrics } from '../hooks/useDashboardMetrics.js';
import type { AllDashboardMetrics } from '../hooks/useDashboardMetrics.js';
import { useInstructorList } from '@modules/instructors/index.js';
import { useStudentList } from '@modules/students/hooks/useStudents.js';
import { useBookingList, type LessonBooking } from '@modules/scheduling/index.js';
import { useQueueHealth } from '@modules/communication/hooks/useCommunication.js';
import { useRecentActivity } from '@shared/hooks/useNotificationBell.js';
import type { Notification } from '@shared/hooks/useNotificationBell.js';
import type { LessonSlot, Instructor } from '@platform/types';
import { useLeadsList, deriveLeadCounts } from '@modules/leads/index.js';
import { useEnrollmentList } from '@modules/enrollments/index.js';

// ─── In-page navigation tabs ──────────────────────────────────────────────────

const DASHBOARD_NAV_TABS = [
  { label: 'Kunder',         path: '/students'        },
  { label: 'Företagskunder', path: '/corporate'       },
  { label: 'Mitt schema',    path: '/scheduling/mine' },
  { label: 'Bokningsschema', path: '/scheduling'      },
] as const;

// ─── Greeting ─────────────────────────────────────────────────────────────────

function getGreeting(firstName: string | undefined): string {
  const hour = new Date().getHours();
  const name = firstName ? `, ${firstName}` : '';
  if (hour >= 5  && hour < 12) return `God morgon${name}!`;
  if (hour >= 12 && hour < 18) return `God eftermiddag${name}!`;
  return `God kväll${name}!`;
}

// ─── Instructor status derivation ─────────────────────────────────────────────

type InstructorStatus = 'on_lesson' | 'available' | 'free' | 'on_leave';

function deriveInstructorStatus(
  instructor: Instructor,
  slotCounts: Record<string, number>,
  ongoingIds: Set<string>,
): InstructorStatus {
  if (instructor.employment_type === 'on_leave') return 'on_leave';
  if (ongoingIds.has(instructor.id))             return 'on_lesson';
  if ((slotCounts[instructor.id] ?? 0) > 0)      return 'available';
  return 'free';
}

const STATUS_LABEL: Record<InstructorStatus, string> = {
  on_lesson: 'På lektion',
  available: 'Tillgänglig',
  free:      'Ledig',
  on_leave:  'Tjänstledig',
};

const STATUS_DOT: Record<InstructorStatus, string> = {
  on_lesson: 'bg-amber-500',
  available: 'bg-emerald-500',
  free:      'bg-muted-foreground/40',
  on_leave:  'bg-muted-foreground/20',
};

// ─── Instructor avatar colors (cycling per index) ─────────────────────────────

const INSTRUCTOR_AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
];

// ─── Slot status dot colours ──────────────────────────────────────────────────

type LessonSlotStatus = LessonSlot['status'];

const SLOT_DOT: Record<LessonSlotStatus, string> = {
  open:        'bg-emerald-500',
  full:        'bg-blue-500',
  in_progress: 'bg-amber-500',
  completed:   'bg-muted-foreground',
  cancelled:   'bg-destructive',
  blocked:     'bg-muted-foreground/40',
};

// ─── Quick actions ────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { key: 'book',     icon: CalendarPlus,  label: 'Boka lektion',        desc: 'Skapa ny lektion för elev',        path: '/scheduling',          permission: Permissions.SCHEDULING_CREATE,   iconBg: 'bg-green-100 dark:bg-green-900/30',   iconFg: 'text-green-600 dark:text-green-400'   },
  { key: 'message',  icon: MessageSquare, label: 'Meddelande',          desc: 'Skicka meddelande',                path: '/communication',       permission: Permissions.COMMUNICATIONS_READ, iconBg: 'bg-violet-100 dark:bg-violet-900/30', iconFg: 'text-violet-600 dark:text-violet-400' },
  { key: 'student',  icon: UserPlus,      label: 'Lägg till elev',      desc: 'Registrera ny elev',               path: '/students',            permission: Permissions.STUDENTS_CREATE,     iconBg: 'bg-blue-100 dark:bg-blue-900/30',     iconFg: 'text-blue-600 dark:text-blue-400'     },
  { key: 'invoices', icon: Receipt,       label: 'Fakturering',         desc: 'Hantera fakturor och betalningar', path: '/finance/invoices',    permission: Permissions.FINANCE_INVOICE_READ,iconBg: 'bg-orange-100 dark:bg-orange-900/30', iconFg: 'text-orange-600 dark:text-orange-400' },
  { key: 'assign',   icon: UserCheck,     label: 'Tilldela instruktör', desc: 'Tilldela instruktör till lektion', path: '/instructors',         permission: Permissions.SCHEDULING_READ,     iconBg: 'bg-rose-100 dark:bg-rose-900/30',     iconFg: 'text-rose-600 dark:text-rose-400'     },
  { key: 'waitlist', icon: Clock,         label: 'Väntelista',          desc: 'Hantera väntande elever',          path: '/scheduling/waitlist', permission: Permissions.SCHEDULING_READ,     iconBg: 'bg-amber-100 dark:bg-amber-900/30',   iconFg: 'text-amber-600 dark:text-amber-400'   },
] as const;

// ─── Alert severity helpers ───────────────────────────────────────────────────

type AlertSeverity = 'critical' | 'warning' | 'info';
const SEVERITY_ORDER: AlertSeverity[] = ['critical', 'warning', 'info'];

const SEVERITY_ICON_BG: Record<AlertSeverity, string> = {
  critical: 'bg-red-100 dark:bg-red-950/40',
  warning:  'bg-amber-100 dark:bg-amber-950/40',
  info:     'bg-muted',
};

const SEVERITY_ICON_COLOR: Record<AlertSeverity, string> = {
  critical: 'text-red-600 dark:text-red-400',
  warning:  'text-amber-600 dark:text-amber-400',
  info:     'text-muted-foreground',
};

interface AlertItem {
  key:         string;
  icon:        typeof Receipt;
  label:       string;
  description: string;
  count:       number;
  route:       string;
  severity:    AlertSeverity;
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

export function DashboardPage() {
  const navigate  = useNavigate();
  const { profile, organization, user } = useSession();
  const { can }   = usePermissions();

  const orgReady = !!organization || user?.is_platform_admin === true;

  const metrics     = useDashboardMetrics({ enabled: orgReady });
  const lastMetrics = useRef<AllDashboardMetrics | null>(null);
  if (metrics.data) lastMetrics.current = metrics.data;
  const displayMetrics   = metrics.data ?? (metrics.isError ? lastMetrics.current : null);
  const isUsingStaleData = metrics.isError && lastMetrics.current !== null;

  const [isSlowLoad, setIsSlowLoad] = useState(false);
  useEffect(() => {
    if (!metrics.isLoading) { setIsSlowLoad(false); return; }
    const t = setTimeout(() => setIsSlowLoad(true), 5_000);
    return () => clearTimeout(t);
  }, [metrics.isLoading]);

  const { data: instructorsData, isLoading: instructorsLoading } = useInstructorList({ per_page: 50 }, { enabled: orgReady });
  const { data: inactiveStudentsData, isLoading: inactiveStudentsLoading } = useStudentList({ status: 'paused', per_page: 5 }, { enabled: orgReady });
  const { data: archivedStudentsData } = useStudentList({ status: 'archived', per_page: 1 }, { enabled: orgReady });
  const { data: leadStudentsData } = useStudentList({ status: 'lead', per_page: 1 }, { enabled: orgReady });

  const pendingFrom = useMemo(() => new Date(Date.now() - 30 * 86_400_000).toISOString(), []);
  const pendingTo   = useMemo(() => new Date(Date.now() +  7 * 86_400_000).toISOString(), []);
  const { data: pendingBookingsData, isLoading: bookingsLoading } = useBookingList({ from: pendingFrom, to: pendingTo, per_page: 100 }, { enabled: orgReady });
  const { data: queueHealthData }    = useQueueHealth({ enabled: orgReady });
  const { data: recentActivityData, isLoading: activityLoading } = useRecentActivity(5);

  // Leads / Anmälningar — same data sources as their own standalone pages
  // (useLeadsList already shared with LeadsPage; useEnrollmentList already
  // shared with EnrollmentListPage), now also surfaced as top-row KPIs.
  const { data: leadsData, isLoading: leadsLoading } = useLeadsList();
  const leadCounts = useMemo(() => deriveLeadCounts(leadsData ?? []), [leadsData]);
  const leadsTotalActive = leadCounts.new + leadCounts.contacted;

  const { data: enrollmentsData, isLoading: enrollmentsLoading } = useEnrollmentList({ per_page: 1 });

  const reservedCount = useMemo(
    () => (pendingBookingsData?.data ?? []).filter((b) => b.status === 'reserved').length,
    [pendingBookingsData],
  );
  const commFailureCount = queueHealthData?.total_retryable ?? 0;

  const [lastRefreshed, setLastRefreshed] = useState<Date>(() => new Date());
  useEffect(() => {
    if (!metrics.isLoading && !metrics.isFetching) setLastRefreshed(new Date());
  }, [metrics.dataUpdatedAt, metrics.isLoading, metrics.isFetching]);

  const instructors   = instructorsData?.data ?? [];
  const inactiveCount = inactiveStudentsData?.meta.total ?? 0;
  const archivedCount    = archivedStudentsData?.meta.total ?? 0;
  const newStudentsCount = leadStudentsData?.meta.total ?? 0;
  const overdueCount     = displayMetrics?.pending_invoices?.overdueCount ?? 0;
  const activeCount      = displayMetrics?.active_student_count ?? 0;

  const visibleSlots = useMemo(
    () => (displayMetrics?.today_slots?.slots ?? []).filter(
      (s) => s.status !== 'cancelled' && s.status !== 'blocked',
    ),
    [displayMetrics],
  );

  const upcomingSlots = useMemo(
    () => visibleSlots.filter(
      (s) => (s.status === 'open' || s.status === 'full') && s.current_bookings > 0,
    ),
    [visibleSlots],
  );

  const ongoingSlots = useMemo(
    () => visibleSlots.filter((s) => s.status === 'in_progress'),
    [visibleSlots],
  );

  const instructorMap = useMemo(
    () => Object.fromEntries(instructors.map((i) => [i.id, `${i.first_name} ${i.last_name}`])),
    [instructors],
  );

  const instructorSlotCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const slot of visibleSlots) {
      const id = slot.instructor_id;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [visibleSlots]);

  const ongoingInstructorIds = useMemo(
    () => new Set(ongoingSlots.map((s) => s.instructor_id)),
    [ongoingSlots],
  );

  const activeInstructors = useMemo(
    () => instructors.filter((i) => i.employment_type !== 'inactive'),
    [instructors],
  );

  const studentsWithLessonsToday = useMemo(
    () => visibleSlots.reduce((sum, s) => sum + s.current_bookings, 0),
    [visibleSlots],
  );

  const fullSlotsCount = useMemo(
    () => visibleSlots.filter((s) => s.status === 'full').length,
    [visibleSlots],
  );

  const emptyOpenSlotsCount = useMemo(
    () => visibleSlots.filter((s) => s.status === 'open' && s.current_bookings === 0).length,
    [visibleSlots],
  );

  const fillRate = useMemo(() => ({
    totalBookings: visibleSlots.reduce((s, slot) => s + slot.current_bookings, 0),
    totalCapacity: visibleSlots.reduce((s, slot) => s + slot.max_bookings, 0),
  }), [visibleSlots]);

  const nextOpenSlot = useMemo(() => {
    const now = new Date().getTime();
    return visibleSlots
      .filter((s) => s.status === 'open' && s.current_bookings === 0 && new Date(s.starts_at).getTime() > now)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null;
  }, [visibleSlots]);

  const alerts = useMemo(() => {
    const items: AlertItem[] = [];
    if (overdueCount > 0) {
      items.push({ key: 'overdue', icon: Receipt, label: 'Förfallna fakturor', description: `${overdueCount} ${overdueCount === 1 ? 'faktura kräver' : 'fakturor kräver'} åtgärd`, count: overdueCount, route: '/finance/invoices', severity: 'critical' });
    }
    if (reservedCount > 0) {
      items.push({ key: 'reserved_bookings', icon: CalendarCheck, label: 'Bokningsförfrågningar', description: `${reservedCount} ${reservedCount === 1 ? 'förfrågan väntar' : 'förfrågningar väntar'} på godkännande`, count: reservedCount, route: '/scheduling/bokningar', severity: reservedCount > 3 ? 'warning' : 'info' });
    }
    if (emptyOpenSlotsCount >= 3) {
      items.push({ key: 'empty_slots', icon: AlertTriangle, label: 'Obesatta pass', description: `${emptyOpenSlotsCount} öppna pass idag saknar bokningar`, count: emptyOpenSlotsCount, route: '/scheduling', severity: emptyOpenSlotsCount >= 5 ? 'critical' : 'warning' });
    }
    if (inactiveCount > 0) {
      items.push({ key: 'inactive', icon: GraduationCap, label: 'Pausade elever', description: `${inactiveCount} ${inactiveCount === 1 ? 'elev behöver' : 'elever behöver'} uppföljning`, count: inactiveCount, route: '/students', severity: 'info' });
    }
    if (commFailureCount > 0) {
      items.push({ key: 'comm_failures', icon: MessageSquare, label: 'Kommunikationsfel', description: `${commFailureCount} ${commFailureCount === 1 ? 'meddelande väntar' : 'meddelanden väntar'} på nytt försök`, count: commFailureCount, route: '/communication/queue', severity: commFailureCount >= 5 ? 'warning' : 'info' });
    }
    if (fullSlotsCount > 0) {
      items.push({ key: 'full_slots', icon: Calendar, label: 'Fullbokade pass', description: `${fullSlotsCount} pass idag ${fullSlotsCount === 1 ? 'är fullt' : 'är fulla'}`, count: fullSlotsCount, route: '/scheduling', severity: 'info' });
    }
    return items.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  }, [overdueCount, inactiveCount, fullSlotsCount, emptyOpenSlotsCount, reservedCount, commFailureCount]);

  const totalAlertCount = alerts.reduce((n, a) => n + a.count, 0);

  const todayLabel = new Date().toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="max-w-screen-2xl mx-auto">

      {/* ── In-page navigation header ──────────────────────────────────────── */}
      <div className="-mx-4 md:-mx-5 -mt-4 md:-mt-5 mb-5 bg-card border-b border-border">
        <div className="px-4 md:px-6 flex items-center gap-0.5 h-12 overflow-x-auto">

          {/* Brand mark + page title */}
          <div className="flex items-center gap-2 mr-4 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-primary/10 grid grid-cols-2 gap-px p-1.5">
              <div className="rounded-[1px] bg-primary/70" />
              <div className="rounded-[1px] bg-primary/70" />
              <div className="rounded-[1px] bg-primary/70" />
              <div className="rounded-[1px] bg-primary/70" />
            </div>
            <span className="text-sm font-bold text-foreground whitespace-nowrap">Översikt</span>
          </div>

          {/* Nav tabs */}
          {DASHBOARD_NAV_TABS.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) => cn(
                'px-3 h-12 flex items-center text-sm font-medium border-b-2 whitespace-nowrap transition-colors shrink-0',
                isActive
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border',
              )}
            >
              {tab.label}
            </NavLink>
          ))}

          <div className="flex-1" />

          {/* Right: search + new customer */}
          <div className="flex items-center gap-2 pl-4 shrink-0">
            <button
              onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
              className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-lg border border-border bg-muted/40 text-xs text-muted-foreground hover:bg-muted/60 transition-colors"
            >
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span>Sök kund...</span>
              <kbd className="ml-1 text-[10px] font-mono bg-background border border-border px-1.5 py-0.5 rounded text-muted-foreground/60">
                Ctrl+K
              </kbd>
            </button>

            <PermissionGate permission="students:student:create">
              <button
                onClick={() => navigate('/students')}
                className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5 shrink-0" />
                Ny kund
              </button>
            </PermissionGate>
          </div>
        </div>
      </div>

      <div className="space-y-5">

        {/* ── Status banners ──────────────────────────────────────────────── */}
        {metrics.isLoading && isSlowLoad && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 text-sm">
            <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-amber-800 dark:text-amber-300">
              Initierar anslutning — kan ta upp till 15 sekunder vid kallstart...
            </span>
          </div>
        )}
        {metrics.isError && !isUsingStaleData && (
          <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-destructive/30 bg-destructive/5 text-sm text-destructive">
            <span>Det gick inte att hämta instrumentpanelsdata.</span>
            <button onClick={() => void metrics.refetch()} className="ml-4 shrink-0 text-xs font-medium underline underline-offset-2 hover:no-underline">
              Försök igen
            </button>
          </div>
        )}
        {isUsingStaleData && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 text-sm">
            <span className="text-amber-800 dark:text-amber-300">Visar senast hämtad data — uppdateringen misslyckades</span>
            <button onClick={() => void metrics.refetch()} disabled={metrics.isFetching} className="ml-4 shrink-0 text-xs font-medium text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:no-underline disabled:opacity-50">
              {metrics.isFetching ? 'Uppdaterar…' : 'Försök igen'}
            </button>
          </div>
        )}

        {/* ── Greeting + date controls ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {getGreeting(profile?.first_name ?? undefined)} 👋
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Här är en sammanfattning av din trafikskola idag.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-2 h-8 px-3 rounded-lg border border-border bg-card text-xs text-foreground">
              <span className="tabular-nums">{todayLabel}</span>
              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <button
              onClick={() => navigate('/scheduling')}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-foreground hover:bg-muted/40 transition-colors"
            >
              <ListFilter className="w-3 h-3 shrink-0" />
              Filter
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors shrink-0"
            >
              <SlidersHorizontal className="w-3 h-3 shrink-0" />
              Anpassa
            </button>
          </div>
        </div>

        {/* ── KPI row ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <PermissionGate permission="scheduling:booking:read">
            <StatCard
              key="lessons"
              title="Dagens lektioner"
              value={String(displayMetrics?.today_slots?.total ?? 0)}
              description="Schemalagda"
              icon={Calendar}
              isLoading={metrics.isLoading && !displayMetrics}
              onClick={() => navigate('/scheduling')}
            />
          </PermissionGate>
          <StatCard
            key="students"
            title="Aktiva elever"
            value={String(activeCount)}
            description="Registrerade"
            icon={Users}
            isLoading={metrics.isLoading && !displayMetrics}
            onClick={() => navigate('/students')}
          />
          <PermissionGate permission="scheduling:booking:read">
            <StatCard
              key="today-lessons"
              title="Elever med lektion"
              value={String(studentsWithLessonsToday)}
              description="Kör idag"
              icon={GraduationCap}
              isLoading={metrics.isLoading && !displayMetrics}
              onClick={() => navigate('/scheduling')}
            />
          </PermissionGate>
          <StatCard
            key="leads"
            title="Leads"
            value={String(leadsTotalActive)}
            description={`${leadCounts.enrolled} inskrivna`}
            icon={UserPlus}
            isLoading={leadsLoading}
            onClick={() => navigate('/leads')}
          />
          <PermissionGate permission="enrollment:request:read">
            <StatCard
              key="enrollments"
              title="Anmälningar"
              value={String(enrollmentsData?.meta.total ?? 0)}
              description="Nya anmälningar"
              icon={ClipboardList}
              isLoading={enrollmentsLoading}
              onClick={() => navigate('/enrollments')}
            />
          </PermissionGate>
        </div>

        {/* ── Main 3-column grid ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* Left: Instructor Status */}
          <div className="lg:col-span-3">
            <PermissionGate permission="scheduling:booking:read">
              <InstructorStatusPanel
                instructors={activeInstructors}
                slotCounts={instructorSlotCounts}
                ongoingIds={ongoingInstructorIds}
                isLoading={instructorsLoading}
                onNavigate={() => navigate('/instructors')}
              />
            </PermissionGate>
          </div>

          {/* Center: Today's Schedule */}
          <div className="lg:col-span-5">
            <PermissionGate permission="scheduling:booking:read">
              <LiveScheduleSnapshot
                upcomingSlots={upcomingSlots}
                ongoingSlots={ongoingSlots}
                instructorMap={instructorMap}
                isLoading={metrics.isLoading && !displayMetrics}
                onNavigate={(path) => navigate(path)}
                fillRate={fillRate}
                nextOpenSlot={nextOpenSlot}
              />
            </PermissionGate>
          </div>

          {/* Right: Quick Actions + Student Status + Weekly Bookings */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <OperationalQuickActions can={can} onNavigate={(path) => navigate(path)} />
            <StudentStatusCard
              activeCount={activeCount}
              pausedCount={inactiveCount}
              archivedCount={archivedCount}
              newCount={newStudentsCount}
              isLoading={(metrics.isLoading && !displayMetrics) || inactiveStudentsLoading}
            />
            <PermissionGate permission="scheduling:booking:read">
              <WeeklyBookingsCard
                bookings={pendingBookingsData?.data ?? []}
                isLoading={bookingsLoading}
                onNavigate={(path) => navigate(path)}
              />
            </PermissionGate>
          </div>
        </div>

        {/* ── Lower section: Alerts | Messages | Notices ───────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <OperationalAlerts
            alerts={alerts}
            totalCount={totalAlertCount}
            isLoading={metrics.isLoading && !displayMetrics}
          />

          <MessagesCard
            messages={recentActivityData?.data ?? []}
            isLoading={activityLoading}
            onNavigate={(path) => navigate(path)}
          />

          <ImportantNoticesCard
            alerts={alerts}
            isLoading={metrics.isLoading && !displayMetrics}
            onNavigate={(path) => navigate(path)}
          />
        </div>

        {/* ── System status bar ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-muted/40 text-xs text-muted-foreground">
          <span>
            Daglig drift & planering{organization?.name ? ` · ${organization.name}` : ''}
          </span>
          <div className="flex items-center gap-3">
            <span className="tabular-nums">
              {metrics.isError
                ? 'Datafel — kontrollera anslutning'
                : `Uppdaterad ${lastRefreshed.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`
              }
            </span>
            <button
              onClick={() => metrics.refetch()}
              disabled={metrics.isFetching}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted/60 transition-colors',
                metrics.isFetching && 'opacity-50 cursor-not-allowed',
              )}
              title="Uppdatera instrumentpanelen"
            >
              <RefreshCcw className={cn('w-3 h-3', metrics.isFetching && 'animate-spin')} />
              Uppdatera
            </button>
            <span className={cn(
              'w-1.5 h-1.5 rounded-full shrink-0',
              metrics.isError ? 'bg-destructive' : 'bg-emerald-500',
            )} />
          </div>
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ZONE 2 — Operational Alerts
// ─────────────────────────────────────────────────────────────────────────────

const ALERT_BADGE_COLOURS = [
  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
];

function OperationalAlerts({
  alerts,
  totalCount,
  isLoading,
}: {
  alerts: AlertItem[];
  totalCount: number;
  isLoading: boolean;
}) {
  const navigate = useNavigate();

  return (
    <div className="bg-card border border-border rounded-xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Operativa varningar</h2>
        </div>
        {totalCount > 0 && (
          <span className="w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
            {Math.min(totalCount, 9)}
          </span>
        )}
      </div>

      <div className="flex-1 p-3 flex flex-col gap-1.5">
        {isLoading ? (
          <AlertSkeleton />
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2 text-center flex-1">
            <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <span className="text-emerald-600 dark:text-emerald-400 text-sm">✓</span>
            </div>
            <p className="text-sm text-muted-foreground">Inga aktiva varningar</p>
          </div>
        ) : (
          alerts.map((alert, i) => (
            <button
              key={alert.key}
              onClick={() => navigate(alert.route)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 transition-colors text-left w-full group"
            >
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', SEVERITY_ICON_BG[alert.severity])}>
                <alert.icon className={cn('w-3.5 h-3.5', SEVERITY_ICON_COLOR[alert.severity])} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{alert.label}</p>
                <p className="text-xs text-muted-foreground leading-snug">{alert.description}</p>
              </div>
              <span className={cn(
                'shrink-0 min-w-[20px] h-5 rounded-full px-1.5 text-[10px] font-bold flex items-center justify-center',
                ALERT_BADGE_COLOURS[i % ALERT_BADGE_COLOURS.length],
              )}>
                {alert.count}
              </span>
            </button>
          ))
        )}
      </div>

      {alerts.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border">
          <button
            onClick={() => navigate(alerts[0]?.route ?? '/dashboard')}
            className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
          >
            Visa alla varningar
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

function AlertSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ZONE 3 — Live Schedule Snapshot
// ─────────────────────────────────────────────────────────────────────────────

function LiveScheduleSnapshot({
  upcomingSlots,
  ongoingSlots,
  instructorMap,
  isLoading,
  onNavigate,
  fillRate,
  nextOpenSlot,
}: {
  upcomingSlots:  LessonSlot[];
  ongoingSlots:   LessonSlot[];
  instructorMap:  Record<string, string>;
  isLoading:      boolean;
  onNavigate:     (path: string) => void;
  fillRate:       { totalBookings: number; totalCapacity: number };
  nextOpenSlot:   LessonSlot | null;
}) {
  const [tab, setTab] = useState<'upcoming' | 'ongoing'>('upcoming');
  const slots = tab === 'upcoming' ? upcomingSlots : ongoingSlots;
  const fillRatePct = fillRate.totalCapacity > 0
    ? Math.round((fillRate.totalBookings / fillRate.totalCapacity) * 100)
    : 0;
  const fillBarCls = fillRatePct >= 80 ? 'bg-emerald-500' : fillRatePct >= 50 ? 'bg-blue-500' : 'bg-amber-400';

  return (
    <div className="bg-card border border-border rounded-xl flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Dagens schema</h2>
        </div>
        <button onClick={() => onNavigate('/scheduling')} className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
          Visa kalender <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className="flex border-b border-border shrink-0">
        <button
          onClick={() => setTab('upcoming')}
          className={cn(
            'flex-1 py-2 text-xs font-semibold uppercase tracking-wide transition-colors',
            tab === 'upcoming' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Kommande lektioner
          {upcomingSlots.length > 0 && (
            <span className="ml-1.5 text-[10px] font-bold text-muted-foreground">({upcomingSlots.length})</span>
          )}
        </button>
        <button
          onClick={() => setTab('ongoing')}
          className={cn(
            'flex-1 py-2 text-xs font-semibold uppercase tracking-wide transition-colors',
            tab === 'ongoing' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Pågående lektioner
          {ongoingSlots.length > 0 && (
            <span className="ml-1.5 text-[10px] font-bold text-amber-500">({ongoingSlots.length})</span>
          )}
        </button>
      </div>

      {!isLoading && fillRate.totalCapacity > 0 && (
        <div className="px-4 py-2 border-b border-border bg-muted/20 shrink-0">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
            <span>Fyllnadsgrad idag</span>
            <span className="tabular-nums font-medium">
              {fillRate.totalBookings}/{fillRate.totalCapacity} ({fillRatePct}%)
            </span>
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', fillBarCls)}
              style={{ width: `${Math.min(fillRatePct, 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 p-4 overflow-y-auto">
        {isLoading ? (
          <ScheduleSkeleton />
        ) : slots.length === 0 ? (
          <EmptyState
            icon={Calendar}
            message={tab === 'upcoming' ? 'Inga kommande lektioner idag' : 'Inga pågående lektioner'}
            ctaLabel="Öppna schema"
            ctaHref="/scheduling"
          />
        ) : (
          <div>
            {slots.map((slot) => (
              <ScheduleSlotRow key={slot.id} slot={slot} instructorName={instructorMap[slot.instructor_id] ?? ''} onNavigate={onNavigate} />
            ))}
          </div>
        )}
        {!isLoading && tab === 'upcoming' && nextOpenSlot && (
          <div
            onClick={() => onNavigate(`/scheduling?date=${nextOpenSlot.starts_at.slice(0, 10)}`)}
            className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-amber-300 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-950/20 cursor-pointer hover:bg-amber-100/60 dark:hover:bg-amber-950/30 transition-colors"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onNavigate(`/scheduling?date=${nextOpenSlot.starts_at.slice(0, 10)}`)}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">Nästa lediga pass</span>
              <span className="ml-2 text-xs text-amber-700 dark:text-amber-400 tabular-nums">
                {formatTime(nextOpenSlot.starts_at)}–{formatTime(nextOpenSlot.ends_at)}
              </span>
              {instructorMap[nextOpenSlot.instructor_id] && (
                <span className="ml-1 text-xs text-amber-600 dark:text-amber-500">
                  · {(instructorMap[nextOpenSlot.instructor_id] ?? '').split(' ').at(-1) ?? ''}
                </span>
              )}
            </div>
            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 shrink-0">Boka →</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border shrink-0">
        <button onClick={() => onNavigate('/scheduling')} className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
          Gå till fullständig tidbok <ChevronRight className="w-3 h-3" />
        </button>
        <button
          onClick={() => onNavigate('/scheduling')}
          className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Öppna schema
        </button>
      </div>
    </div>
  );
}

function ScheduleSlotRow({
  slot,
  instructorName,
  onNavigate,
}: {
  slot:           LessonSlot;
  instructorName: string;
  onNavigate:     (path: string) => void;
}) {
  const lastName = instructorName.split(' ').at(-1) ?? '';
  const dateOnly = slot.starts_at.slice(0, 10);

  return (
    <div
      className="flex items-center gap-3 py-2.5 border-b border-border last:border-0 cursor-pointer hover:bg-muted/40 rounded px-1 -mx-1 transition-colors"
      onClick={() => onNavigate(`/scheduling?date=${dateOnly}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onNavigate(`/scheduling?date=${dateOnly}`)}
    >
      <span className={cn('w-2 h-2 rounded-full shrink-0', SLOT_DOT[slot.status])} />
      <div className="min-w-0 flex-1 grid grid-cols-2 gap-2 items-center">
        <div>
          <span className="text-sm font-medium text-foreground block">
            {formatTime(slot.starts_at)} – {formatTime(slot.ends_at)}
          </span>
          {slot.status === 'in_progress' && (
            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">Pågår</span>
          )}
        </div>
        <div className="text-right">
          {lastName && <span className="text-xs text-muted-foreground block truncate">{lastName}</span>}
          <span className={cn(
            'text-xs font-medium tabular-nums',
            slot.current_bookings >= slot.max_bookings ? 'text-red-600 dark:text-red-400'
              : slot.current_bookings > 0 ? 'text-primary'
              : 'text-muted-foreground',
          )}>
            {slot.current_bookings}/{slot.max_bookings}
          </span>
        </div>
      </div>
    </div>
  );
}

function ScheduleSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ZONE 4 — Instructor Status
// ─────────────────────────────────────────────────────────────────────────────

function InstructorStatusPanel({
  instructors,
  slotCounts,
  ongoingIds,
  isLoading,
  onNavigate,
}: {
  instructors: Instructor[];
  slotCounts:  Record<string, number>;
  ongoingIds:  Set<string>;
  isLoading:   boolean;
  onNavigate:  () => void;
}) {
  const sorted = useMemo(
    () => [...instructors].sort((a, b) => {
      const sa = deriveInstructorStatus(a, slotCounts, ongoingIds);
      const sb = deriveInstructorStatus(b, slotCounts, ongoingIds);
      const order: InstructorStatus[] = ['on_lesson', 'available', 'free', 'on_leave'];
      return order.indexOf(sa) - order.indexOf(sb);
    }),
    [instructors, slotCounts, ongoingIds],
  );

  const onLessonCount  = sorted.filter((i) => ongoingIds.has(i.id)).length;
  const availableCount = sorted.filter((i) => !ongoingIds.has(i.id) && (slotCounts[i.id] ?? 0) > 0).length;
  const utilizationPct = sorted.length > 0
    ? Math.round(((onLessonCount + availableCount) / sorted.length) * 100)
    : 0;

  return (
    <div className="bg-card border border-border rounded-xl flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Lärarstatus</h2>
        </div>
        <button onClick={onNavigate} className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
          Visa alla <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 p-3">
        {isLoading ? (
          <InstructorSkeleton />
        ) : sorted.length === 0 ? (
          <EmptyState icon={Users} message="Inga instruktörer registrerade" ctaLabel="Lägg till" ctaHref="/instructors" />
        ) : (
          <div>
            {sorted.slice(0, 8).map((instructor, idx) => {
              const status    = deriveInstructorStatus(instructor, slotCounts, ongoingIds);
              const slotCount = slotCounts[instructor.id] ?? 0;
              const avatarCls = INSTRUCTOR_AVATAR_COLORS[idx % INSTRUCTOR_AVATAR_COLORS.length] ?? INSTRUCTOR_AVATAR_COLORS[0]!;
              return (
                <div key={instructor.id} className="flex items-center gap-2.5 py-2.5 border-b border-border last:border-0">
                  <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-semibold uppercase', avatarCls)}>
                    {instructor.first_name[0] ?? ''}{instructor.last_name[0] ?? ''}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-foreground truncate block">
                      {instructor.first_name} {instructor.last_name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[status])} />
                      <span className="text-xs text-muted-foreground">{STATUS_LABEL[status]}</span>
                    </div>
                  </div>
                  <span className={cn('text-xs shrink-0 tabular-nums font-medium', slotCount > 0 ? 'text-foreground' : 'text-muted-foreground/30')}>
                    {slotCount > 0 ? `${slotCount} pass` : '–'}
                  </span>
                </div>
              );
            })}
            {sorted.length > 8 && (
              <p className="pt-2.5 text-center text-xs text-muted-foreground">+{sorted.length - 8} fler instruktörer</p>
            )}
          </div>
        )}
      </div>

      {!isLoading && sorted.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border shrink-0">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
            <span>Beläggning idag</span>
            <span className="tabular-nums font-medium">
              {onLessonCount + availableCount}/{sorted.length} ({utilizationPct}%)
            </span>
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                utilizationPct >= 70 ? 'bg-emerald-500' : utilizationPct >= 40 ? 'bg-amber-400' : 'bg-muted-foreground/40',
              )}
              style={{ width: `${Math.min(utilizationPct, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function InstructorSkeleton() {
  return (
    <div className="space-y-2.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-muted animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-muted rounded animate-pulse w-2/3" />
            <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// ZONE 6 — Operational Quick Actions
// ─────────────────────────────────────────────────────────────────────────────

function OperationalQuickActions({
  can,
  onNavigate,
}: {
  can:        (permission: Permission) => boolean;
  onNavigate: (path: string) => void;
}) {
  const visibleActions = QUICK_ACTIONS.filter((a) => can(a.permission));

  return (
    <div className="bg-card border border-border rounded-xl flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <LayoutGrid className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Snabba åtgärder</h2>
      </div>

      <div className="flex-1 p-4">
        <div className="grid grid-cols-2 gap-3">
          {visibleActions.map((action) => (
            <button
              key={action.key}
              onClick={() => onNavigate(action.path)}
              className={cn(
                'flex flex-col gap-2 p-3 rounded-xl border border-border',
                'bg-card hover:border-primary/40 hover:shadow-sm',
                'transition-all duration-150 text-left group',
              )}
            >
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', action.iconBg)}>
                <action.icon className={cn('w-4 h-4', action.iconFg)} />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground leading-tight">{action.label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{action.desc}</p>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
          className={cn(
            'mt-3 w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border',
            'hover:border-primary/40 hover:bg-muted/40 transition-all text-left',
          )}
        >
          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">Snabb sökning</p>
            <p className="text-[10px] text-muted-foreground">Sök elev, instruktör eller bokning…</p>
          </div>
          <kbd className="shrink-0 text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
            Ctrl+K
          </kbd>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW — Messages Card (Meddelanden)
// ─────────────────────────────────────────────────────────────────────────────

function MessagesCard({
  messages,
  isLoading,
  onNavigate,
}: {
  messages:   Notification[];
  isLoading:  boolean;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Meddelanden</h2>
        </div>
        <button onClick={() => onNavigate('/communication')} className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
          Visa alla <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 p-3 space-y-0.5">
        {isLoading ? (
          <div className="space-y-2 p-1">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}
          </div>
        ) : messages.length === 0 ? (
          <EmptyState icon={MessageSquare} message="Inga meddelanden" ctaLabel="Kommunikation" ctaHref="/communication" />
        ) : (
          messages.slice(0, 5).map((msg) => {
            const when = new Date(msg.created_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
            return (
              <div
                key={msg.id}
                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/40 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                  <Bell className="w-3.5 h-3.5 text-orange-500 dark:text-orange-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">
                    {msg.subject ?? humanizeIdentifier(msg.template_key)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{formatChannelLabel(msg.channel)}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{when}</span>
              </div>
            );
          })
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-border">
        <button onClick={() => onNavigate('/communication')} className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
          Visa alla meddelanden <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW — Important Notices Card (Viktiga notiser)
// ─────────────────────────────────────────────────────────────────────────────

function ImportantNoticesCard({
  alerts,
  isLoading,
  onNavigate,
}: {
  alerts:     AlertItem[];
  isLoading:  boolean;
  onNavigate: (path: string) => void;
}) {
  const NOTICE_BADGE: Record<AlertSeverity, string> = {
    critical: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
    warning:  'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
    info:     'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  };

  return (
    <div className="bg-card border border-border rounded-xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Viktiga notiser</h2>
        </div>
        {alerts.length > 0 && (
          <button onClick={() => onNavigate(alerts[0]?.route ?? '/dashboard')} className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
            Åtgärda <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex-1 p-3 space-y-0.5">
        {isLoading ? (
          <div className="space-y-2 p-1">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
            <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <span className="text-emerald-600 dark:text-emerald-400 text-sm">✓</span>
            </div>
            <p className="text-xs text-muted-foreground">Inga viktiga notiser</p>
          </div>
        ) : (
          alerts.slice(0, 5).map((alert) => (
            <button
              key={alert.key}
              onClick={() => onNavigate(alert.route)}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/40 transition-colors text-left"
            >
              <span className={cn(
                'w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0',
                NOTICE_BADGE[alert.severity],
              )}>
                {alert.count}
              </span>
              <p className="text-xs text-foreground flex-1 leading-snug">{alert.description}</p>
              <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
            </button>
          ))
        )}
      </div>

      {alerts.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border">
          <button onClick={() => onNavigate(alerts[0]?.route ?? '/dashboard')} className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
            Visa alla notiser <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW — Student Status Card (Elevstatus) with donut chart
// ─────────────────────────────────────────────────────────────────────────────

function DonutChart({ segments }: { segments: Array<{ pct: number; color: string }> }) {
  const r  = 30;
  const sw = 12;
  const sz = 80;
  const cx = sz / 2;
  const cy = sz / 2;
  const C  = 2 * Math.PI * r;
  let cumArc = 0;

  return (
    <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} aria-hidden="true">
      <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={sw} className="stroke-muted" />
      {segments.map((seg, i) => {
        if (seg.pct <= 0) return null;
        const arc    = (seg.pct / 100) * C;
        const offset = C * 0.25 - cumArc;
        cumArc      += arc;
        return (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            strokeWidth={sw}
            stroke={seg.color}
            strokeDasharray={`${arc} ${C - arc}`}
            strokeDashoffset={offset}
            strokeLinecap="butt"
          />
        );
      })}
    </svg>
  );
}

function StudentStatusCard({
  activeCount,
  pausedCount,
  archivedCount,
  newCount,
  isLoading,
}: {
  activeCount:   number;
  pausedCount:   number;
  archivedCount: number;
  newCount:      number;
  isLoading:     boolean;
}) {
  const total = activeCount + pausedCount + archivedCount + newCount || 1;
  const segments = [
    { label: 'Aktiva',    count: activeCount,   pct: Math.round((activeCount   / total) * 100), color: '#6366f1', dot: 'bg-indigo-500'  },
    { label: 'Pausade',   count: pausedCount,   pct: Math.round((pausedCount   / total) * 100), color: '#f97316', dot: 'bg-orange-500'  },
    { label: 'Avslutade', count: archivedCount, pct: Math.round((archivedCount / total) * 100), color: '#10b981', dot: 'bg-emerald-500' },
    { label: 'Nya',       count: newCount,      pct: Math.round((newCount      / total) * 100), color: '#3b82f6', dot: 'bg-blue-500'    },
  ];

  return (
    <div className="bg-card border border-border rounded-xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Elevstatus</h2>
        </div>
        <Link to="/students" className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
          Visa alla <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex-1 p-4">
        {isLoading ? (
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-muted animate-pulse shrink-0" />
            <div className="space-y-2.5 flex-1">
              {[1, 2, 3].map((i) => <div key={i} className="h-4 bg-muted rounded animate-pulse" />)}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-5">
            <div className="shrink-0">
              <DonutChart segments={segments} />
            </div>
            <div className="flex-1 space-y-2.5">
              {segments.map((seg) => (
                <div key={seg.label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={cn('w-2 h-2 rounded-full shrink-0', seg.dot)} />
                    <span className="text-xs text-muted-foreground">{seg.label}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-bold text-foreground tabular-nums">{seg.count}</span>
                    <span className="text-[10px] text-muted-foreground">({seg.pct}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW — Weekly Sparkline (smooth SVG line chart)
// ─────────────────────────────────────────────────────────────────────────────

type WeekDay = { dateISO: string; label: string; count: number; isToday: boolean };

function WeeklySparkline({
  days,
  onNavigate,
}: {
  days:       WeekDay[];
  onNavigate: (path: string) => void;
}) {
  const vw = 280;
  const vh = 60;
  const padX = 10;
  const padY = 8;
  const maxVal = Math.max(...days.map((d) => d.count), 1);

  const pts = days.map((day, i) => ({
    x: padX + (i / (days.length - 1)) * (vw - 2 * padX),
    y: padY + (1 - day.count / maxVal) * (vh - 2 * padY),
  }));

  const linePath = pts.map((pt, i) => {
    if (i === 0) return `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    const prev = pts[i - 1]!;
    const cpx  = ((prev.x + pt.x) / 2).toFixed(1);
    return `C ${cpx} ${prev.y.toFixed(1)} ${cpx} ${pt.y.toFixed(1)} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
  }).join(' ');

  const last = pts[pts.length - 1]!;
  const fillPath = `${linePath} L ${last.x.toFixed(1)} ${vh} L ${pts[0]!.x.toFixed(1)} ${vh} Z`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${vw} ${vh}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: '60px' }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="wbk-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#6366f1" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0"    />
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#wbk-grad)" />
        <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((pt, i) => {
          const day = days[i]!;
          return day.isToday ? (
            <circle key={i} cx={pt.x} cy={pt.y} r="3.5" fill="#6366f1" />
          ) : null;
        })}
      </svg>
      <div className="flex justify-between mt-1.5 px-1">
        {days.map((day) => (
          <button
            key={day.dateISO}
            onClick={() => onNavigate(`/scheduling?date=${day.dateISO}`)}
            className="flex-1 flex flex-col items-center gap-0.5"
          >
            <span className={cn('text-[9px] font-semibold uppercase tracking-wide',
              day.isToday ? 'text-primary' : 'text-muted-foreground',
            )}>
              {day.label.slice(0, 3)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW — Weekly Bookings Card with sparkline
// ─────────────────────────────────────────────────────────────────────────────

function WeeklyBookingsCard({
  bookings,
  isLoading,
  onNavigate,
}: {
  bookings:   LessonBooking[];
  isLoading:  boolean;
  onNavigate: (path: string) => void;
}) {
  const { days, totalThisWeek, prevWeekTotal } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO   = today.toISOString().slice(0, 10);
    const dow        = today.getDay();
    const monOffset  = dow === 0 ? -6 : 1 - dow;

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d   = new Date(today);
      d.setDate(today.getDate() + monOffset + i);
      const iso = d.toISOString().slice(0, 10);
      return {
        dateISO: iso,
        label:   d.toLocaleDateString('sv-SE', { weekday: 'short' }).replace(/^./, (c) => c.toUpperCase()),
        count:   0,
        isToday: iso === todayISO,
      };
    });

    const prevSet = new Set(Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + monOffset - 7 + i);
      return d.toISOString().slice(0, 10);
    }));

    const dayMap: Record<string, number> = Object.fromEntries(weekDays.map((d, i) => [d.dateISO, i]));
    let prevCount = 0;

    for (const b of bookings) {
      if (b.status === 'cancelled') continue;
      const day = b.starts_at.slice(0, 10);
      const idx = dayMap[day];
      if (idx !== undefined) weekDays[idx]!.count++;
      if (prevSet.has(day)) prevCount++;
    }

    return {
      days: weekDays,
      totalThisWeek: weekDays.reduce((s, d) => s + d.count, 0),
      prevWeekTotal: prevCount,
    };
  }, [bookings]);

  const trend = prevWeekTotal > 0
    ? Math.round(((totalThisWeek - prevWeekTotal) / prevWeekTotal) * 100)
    : 0;

  return (
    <div className="bg-card border border-border rounded-xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Bokningar denna vecka</h2>
        </div>
        <button onClick={() => onNavigate('/scheduling/bokningar')} className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
          Visa alla <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="h-28 bg-muted rounded-lg animate-pulse" />
        ) : (
          <>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-3xl font-bold text-foreground tabular-nums">{totalThisWeek}</span>
              {prevWeekTotal > 0 && (
                <span className={cn('text-xs font-medium',
                  trend > 0 ? 'text-emerald-600 dark:text-emerald-400'
                  : trend < 0 ? 'text-red-600 dark:text-red-400'
                  : 'text-muted-foreground',
                )}>
                  {trend > 0 ? `+${trend}%` : trend < 0 ? `${trend}%` : '→'} från förra veckan
                </span>
              )}
            </div>

            <WeeklySparkline days={days} onNavigate={onNavigate} />
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────


function EmptyState({
  icon: Icon,
  message,
  ctaLabel,
  ctaHref,
}: {
  icon:      typeof Calendar;
  message:   string;
  ctaLabel?: string;
  ctaHref?:  string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-5 gap-2 text-center">
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {ctaLabel && ctaHref && (
        <Link to={ctaHref} className="text-xs text-primary hover:underline">{ctaLabel}</Link>
      )}
    </div>
  );
}
