import { useMemo, useState } from 'react';
import {
  GraduationCap, Calendar, Receipt, TrendingUp, Users, AlertTriangle,
  Clock, UserPlus, CalendarPlus, UserCheck, RefreshCcw, ChevronRight, Search,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useSession } from '@shared/hooks/useSession.js';
import { formatTime, formatSekRounded } from '@platform/utils';
import { usePermissions } from '@core/rbac/hooks.js';
import { Permissions } from '@core/rbac/permissions.js';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { StatCard } from '../components/StatCard.js';
import { useDashboardMetrics } from '../hooks/useDashboardMetrics.js';
import { useInstructorList, employmentTypeLabel } from '@modules/instructors/index.js';
import { useStudentList } from '@modules/students/hooks/useStudents.js';
import type { LessonSlot, Instructor, Student } from '@platform/types';

// ─── Greeting ─────────────────────────────────────────────────────────────────

function getGreeting(firstName: string | undefined): string {
  const hour = new Date().getHours();
  const name = firstName ? `, ${firstName}` : '';
  if (hour >= 5  && hour < 12) return `God morgon${name}`;
  if (hour >= 12 && hour < 18) return `God eftermiddag${name}`;
  return `God kväll${name}`;
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
  { key: 'book',       icon: CalendarPlus, label: 'Boka lektion',        desc: 'Skapa ny lektion för elev',         path: '/scheduling',          permission: Permissions.SCHEDULING_CREATE    },
  { key: 'reschedule', icon: RefreshCcw,   label: 'Omboka lektion',      desc: 'Sök och ändra befintlig bokning',   path: '/scheduling/list',     permission: Permissions.SCHEDULING_READ      },
  { key: 'assign',     icon: UserCheck,    label: 'Tilldela instruktör', desc: 'Tilldela instruktör till lektion',  path: '/instructors',         permission: Permissions.SCHEDULING_READ      },
  { key: 'student',    icon: UserPlus,     label: 'Lägg till elev',      desc: 'Registrera ny elev',                path: '/students',            permission: Permissions.STUDENTS_CREATE      },
  { key: 'invoices',   icon: Receipt,      label: 'Fakturering',         desc: 'Hantera fakturor och betalningar',  path: '/finance/invoices',    permission: Permissions.FINANCE_INVOICE_READ },
  { key: 'waitlist',   icon: Clock,        label: 'Väntelista',          desc: 'Hantera väntande elever',           path: '/scheduling/waitlist', permission: Permissions.SCHEDULING_READ      },
] as const;

// ─── DashboardPage ────────────────────────────────────────────────────────────

export function DashboardPage() {
  const navigate  = useNavigate();
  const { profile, organization } = useSession();
  const { can }   = usePermissions();

  const metrics    = useDashboardMetrics();
  const { data: instructorsData, isLoading: instructorsLoading } = useInstructorList({ per_page: 50 });
  const { data: inactiveStudentsData, isLoading: inactiveStudentsLoading } = useStudentList({ status: 'paused', per_page: 5 });

  const instructors      = instructorsData?.data ?? [];
  const inactiveStudents = inactiveStudentsData?.data ?? [];
  const inactiveCount    = inactiveStudentsData?.meta.total ?? 0;
  const overdueCount     = metrics.data?.pending_invoices?.overdueCount ?? 0;

  const visibleSlots = useMemo(
    () => (metrics.data?.today_slots?.slots ?? []).filter(
      (s) => s.status !== 'cancelled' && s.status !== 'blocked',
    ),
    [metrics.data],
  );

  const upcomingSlots = useMemo(
    () => visibleSlots.filter((s) => s.status === 'open' || s.status === 'full'),
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

  // Operational alerts — only include items with non-zero counts
  const alerts = useMemo(() => {
    const items: Array<{ key: string; icon: typeof Receipt; label: string; description: string; count: number; route: string }> = [];
    if (overdueCount > 0) {
      items.push({
        key:         'overdue',
        icon:        Receipt,
        label:       'Förfallna fakturor',
        description: `${overdueCount} ${overdueCount === 1 ? 'faktura kräver' : 'fakturor kräver'} åtgärd`,
        count:       overdueCount,
        route:       '/finance/invoices',
      });
    }
    if (inactiveCount > 0) {
      items.push({
        key:         'inactive',
        icon:        GraduationCap,
        label:       'Pausade elever',
        description: `${inactiveCount} ${inactiveCount === 1 ? 'elev behöver' : 'elever behöver'} uppföljning`,
        count:       inactiveCount,
        route:       '/students',
      });
    }
    if (fullSlotsCount > 0) {
      items.push({
        key:         'full_slots',
        icon:        Calendar,
        label:       'Fullbokade pass',
        description: `${fullSlotsCount} pass idag ${fullSlotsCount === 1 ? 'är fullt' : 'är fulla'}`,
        count:       fullSlotsCount,
        route:       '/scheduling',
      });
    }
    return items;
  }, [overdueCount, inactiveCount, fullSlotsCount]);

  const totalAlertCount = alerts.reduce((n, a) => n + a.count, 0);

  return (
    <PageLayout>
      <PageHeader
        title="Driftöversikt"
        description={`${getGreeting(profile?.first_name ?? undefined)} — ${organization?.name ?? 'Daglig drift & planering'}`}
        breadcrumbs={[{ label: 'Hem' }, { label: 'Driftöversikt' }]}
      />

      <PageContent>

        {/* ── Error recovery ─────────────────────────────────────────────── */}
        {metrics.isError && (
          <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
            <span>Det gick inte att hämta instrumentpanelsdata.</span>
            <button
              onClick={() => metrics.refetch()}
              className="ml-4 shrink-0 text-xs font-medium underline underline-offset-2 hover:no-underline"
            >
              Försök igen
            </button>
          </div>
        )}

        {/* ── ZONE 1: Today Overview ─────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Daglig överblick
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            <PermissionGate permission="scheduling:booking:read">
              <StatCard
                title="Dagens lektioner"
                value={metrics.isError ? '—' : String(metrics.data?.today_slots?.total ?? 0)}
                description="Schemalagda"
                icon={Calendar}
                isLoading={metrics.isLoading}
                onClick={() => navigate('/scheduling')}
              />
            </PermissionGate>

            <PermissionGate permission="scheduling:booking:read">
              <StatCard
                title="Aktiva instruktörer"
                value={instructorsLoading ? '…' : String(activeInstructors.length)}
                description="Idag"
                icon={Users}
                isLoading={instructorsLoading}
                onClick={() => navigate('/instructors')}
              />
            </PermissionGate>

            <PermissionGate permission="scheduling:booking:read">
              <StatCard
                title="Elever med lektion"
                value={metrics.isError ? '—' : String(studentsWithLessonsToday)}
                description="Har lektion idag"
                icon={GraduationCap}
                isLoading={metrics.isLoading}
                onClick={() => navigate('/students')}
              />
            </PermissionGate>

            <PermissionGate permission="finance:invoice:read">
              <StatCard
                title="Väntande fakturor"
                value={metrics.isError ? '—' : String(metrics.data?.pending_invoices?.pendingCount ?? 0)}
                description={overdueCount > 0 ? `${overdueCount} förfallna` : 'Obetald'}
                icon={Receipt}
                isLoading={metrics.isLoading}
                onClick={() => navigate('/finance/invoices')}
              />
            </PermissionGate>

            <PermissionGate permission="finance:invoice:read">
              <StatCard
                title="Månadsintäkt"
                value={metrics.isError ? '—' : formatSekRounded(metrics.data?.monthly_revenue?.amount ?? 0)}
                description="Denna månad"
                icon={TrendingUp}
                isLoading={metrics.isLoading}
                onClick={() => navigate('/finance/invoices')}
              />
            </PermissionGate>
          </div>
        </section>

        {/* ── ZONES 2+3+4: Middle operational row ───────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

          {/* ZONE 2: Operational Alerts */}
          <OperationalAlerts alerts={alerts} totalCount={totalAlertCount} isLoading={metrics.isLoading} />

          {/* ZONE 3: Live Schedule Snapshot */}
          <PermissionGate permission="scheduling:booking:read">
            <div className="lg:col-span-2">
              <LiveScheduleSnapshot
                upcomingSlots={upcomingSlots}
                ongoingSlots={ongoingSlots}
                instructorMap={instructorMap}
                isLoading={metrics.isLoading}
                onNavigate={(path) => navigate(path)}
              />
            </div>
          </PermissionGate>

          {/* ZONE 4: Instructor Status */}
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

        {/* ── ZONES 5+6: Bottom operational row ─────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ZONE 5: Student Attention Queue */}
          <PermissionGate permission="students:student:read">
            <StudentAttentionQueue
              students={inactiveStudents}
              totalCount={inactiveCount}
              isLoading={inactiveStudentsLoading}
              onNavigate={(path) => navigate(path)}
            />
          </PermissionGate>

          {/* ZONE 6: Operational Quick Actions */}
          <OperationalQuickActions can={can} onNavigate={(path) => navigate(path)} />

        </div>

        {/* ── System status bar ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-muted/40 text-xs text-muted-foreground">
          <span>
            Daglig drift & planering{organization?.name ? ` · ${organization.name}` : ''}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>Systemstatus: Alla system aktiva</span>
          </div>
        </div>

      </PageContent>
    </PageLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ZONE 2 — Operational Alerts
// ─────────────────────────────────────────────────────────────────────────────

interface AlertItem {
  key:         string;
  icon:        typeof Receipt;
  label:       string;
  description: string;
  count:       number;
  route:       string;
}

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
              <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <alert.icon className="w-3.5 h-3.5 text-muted-foreground" />
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
            onClick={() => navigate('/scheduling')}
            className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
          >
            Visa alla operativa varningar
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
}: {
  upcomingSlots:  LessonSlot[];
  ongoingSlots:   LessonSlot[];
  instructorMap:  Record<string, string>;
  isLoading:      boolean;
  onNavigate:     (path: string) => void;
}) {
  const [tab, setTab] = useState<'upcoming' | 'ongoing'>('upcoming');
  const slots = tab === 'upcoming' ? upcomingSlots : ongoingSlots;

  return (
    <div className="bg-card border border-border rounded-xl flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Dagens schema</h2>
        </div>
        <button
          onClick={() => onNavigate('/scheduling')}
          className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
        >
          Visa kalender <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        <button
          onClick={() => setTab('upcoming')}
          className={cn(
            'flex-1 py-2 text-xs font-semibold uppercase tracking-wide transition-colors',
            tab === 'upcoming'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Kommande lektioner
          {upcomingSlots.length > 0 && (
            <span className="ml-1.5 text-[10px] font-bold text-muted-foreground">
              ({upcomingSlots.length})
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('ongoing')}
          className={cn(
            'flex-1 py-2 text-xs font-semibold uppercase tracking-wide transition-colors',
            tab === 'ongoing'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Pågående lektioner
          {ongoingSlots.length > 0 && (
            <span className="ml-1.5 text-[10px] font-bold text-amber-500">
              ({ongoingSlots.length})
            </span>
          )}
        </button>
      </div>

      {/* Slot list */}
      <div className="flex-1 p-4 overflow-hidden">
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
              <ScheduleSlotRow
                key={slot.id}
                slot={slot}
                instructorName={instructorMap[slot.instructor_id] ?? ''}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border shrink-0">
        <button
          onClick={() => onNavigate('/scheduling')}
          className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
        >
          Gå till fullständig tidbok <ChevronRight className="w-3 h-3" />
        </button>
        <button
          onClick={() => onNavigate('/scheduling')}
          className={cn(
            'text-xs font-medium px-3 py-1.5 rounded-md transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
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
            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">
              Pågår
            </span>
          )}
        </div>
        <div className="text-right">
          {lastName && (
            <span className="text-xs text-muted-foreground block truncate">{lastName}</span>
          )}
          <span className={cn(
            'text-xs font-medium tabular-nums',
            slot.current_bookings >= slot.max_bookings
              ? 'text-red-600 dark:text-red-400'
              : slot.current_bookings > 0
              ? 'text-primary'
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
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-10 bg-muted rounded animate-pulse" />
      ))}
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

  return (
    <div className="bg-card border border-border rounded-xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Lärarstatus</h2>
        </div>
        <button
          onClick={onNavigate}
          className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
        >
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
            {sorted.slice(0, 8).map((instructor) => {
              const status     = deriveInstructorStatus(instructor, slotCounts, ongoingIds);
              const slotCount  = slotCounts[instructor.id] ?? 0;
              return (
                <div
                  key={instructor.id}
                  className="flex items-center gap-2.5 py-2.5 border-b border-border last:border-0"
                >
                  {/* Avatar initials */}
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-[10px] font-semibold text-muted-foreground uppercase">
                    {instructor.first_name[0]}{instructor.last_name[0]}
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
                  <span className={cn(
                    'text-xs shrink-0 tabular-nums font-medium',
                    slotCount > 0 ? 'text-foreground' : 'text-muted-foreground/30',
                  )}>
                    {slotCount > 0 ? `${slotCount} pass` : '–'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
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

function StudentQueueSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-muted animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-muted rounded animate-pulse w-3/4" />
            <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ZONE 5 — Student Attention Queue
// ─────────────────────────────────────────────────────────────────────────────

function StudentAttentionQueue({
  students,
  totalCount,
  isLoading,
  onNavigate,
}: {
  students:   Student[];
  totalCount: number;
  isLoading:  boolean;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Pausade elever</h2>
        </div>
        <button
          onClick={() => onNavigate('/students')}
          className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
        >
          Visa alla <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 p-4">
        {isLoading ? (
          <StudentQueueSkeleton />
        ) : students.length === 0 && totalCount === 0 ? (
          <EmptyState
            icon={GraduationCap}
            message="Inga inaktiva elever"
            ctaLabel="Visa alla elever"
            ctaHref="/students"
          />
        ) : (
          <div>
            {students.map((student) => (
              <StudentQueueRow
                key={student.id}
                student={student}
                onClick={() => onNavigate(`/students/${student.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-border">
        <button
          onClick={() => onNavigate('/students?status=paused')}
          className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
        >
          Visa hela kön med elever <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function StudentQueueRow({
  student,
  onClick,
}: {
  student: Student;
  onClick: () => void;
}) {
  const initials = `${student.first_name[0] ?? ''}${student.last_name[0] ?? ''}`.toUpperCase();
  const colours  = [
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  ];
  const colour = colours[student.first_name.charCodeAt(0) % colours.length] ?? colours[0]!;

  return (
    <div
      className="flex items-center gap-3 py-2.5 border-b border-border last:border-0 cursor-pointer hover:bg-muted/40 rounded px-1 -mx-1 transition-colors"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold', colour)}>
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground block truncate">
          {student.first_name} {student.last_name}
        </span>
        {student.email && (
          <span className="text-xs text-muted-foreground truncate block">{student.email}</span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
          Pausad
        </span>
        <button
          className="text-xs text-primary hover:text-primary/80 transition-colors"
          onClick={onClick}
        >
          Kontakta →
        </button>
      </div>
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
  can:        (permission: string) => boolean;
  onNavigate: (path: string) => void;
}) {
  const visibleActions = QUICK_ACTIONS.filter((a) => can(a.permission));

  return (
    <div className="bg-card border border-border rounded-xl flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <CalendarPlus className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Snabba åtgärder</h2>
      </div>

      <div className="flex-1 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors shrink-0">
                <action.icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground leading-tight">{action.label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{action.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Quick search row */}
        <button
          onClick={() => onNavigate('/students')}
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
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </button>
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
