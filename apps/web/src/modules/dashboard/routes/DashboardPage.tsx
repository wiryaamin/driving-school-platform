import { GraduationCap, Calendar, Receipt, TrendingUp, UserCheck, Clock, Bell, CreditCard } from 'lucide-react';
import { useTranslation } from '@platform/i18n';
import { useNavigate, Link } from 'react-router-dom';
import { useSession } from '@shared/hooks/useSession.js';
import { formatTime, formatSekRounded, formatRelativeTime } from '@platform/utils';
import { useRecentActivity, type Notification } from '@shared/hooks/useNotifications.js';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { StatCard } from '../components/StatCard.js';
import {
  useActiveStudentCount,
  useTodaySlots,
  usePendingInvoiceMetrics,
  useMonthlyRevenue,
} from '../hooks/useDashboardMetrics.js';
import type { LessonSlot, LessonSlotStatus } from '@platform/types';

export function DashboardPage() {
  const { t }        = useTranslation('dashboard');
  const navigate     = useNavigate();
  const { profile, organization } = useSession();

  const activeStudents  = useActiveStudentCount();
  const todaySlots      = useTodaySlots();
  const pendingInvoices = usePendingInvoiceMetrics();
  const monthlyRevenue  = useMonthlyRevenue();
  const recentActivity  = useRecentActivity();

  const displayName  = profile?.first_name ?? profile?.last_name ?? '';
  const overdueCount = pendingInvoices.data?.overdueCount ?? 0;

  const visibleSlots = (todaySlots.data?.slots ?? []).filter(
    (s) => s.status !== 'cancelled' && s.status !== 'blocked'
  );

  return (
    <PageLayout>
      <PageHeader
        title={t('title')}
        description={displayName
          ? t('subtitle', { name: displayName })
          : (organization?.name ?? '')}
        breadcrumbs={[{ label: 'Hem' }, { label: 'Instrumentpanel' }]}
      />

      <PageContent>
        {/* ── KPI Stats Row ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <PermissionGate permission="students:student:read">
            <StatCard
              title={t('stat.active_students')}
              value={activeStudents.isError ? '—' : String(activeStudents.data ?? 0)}
              description={t('stat.active_students_description')}
              icon={GraduationCap}
              isLoading={activeStudents.isLoading}
            />
          </PermissionGate>

          <PermissionGate permission="scheduling:booking:read">
            <StatCard
              title={t('stat.lessons_today')}
              value={todaySlots.isError ? '—' : String(todaySlots.data?.total ?? 0)}
              description={t('stat.lessons_today_description')}
              icon={Calendar}
              isLoading={todaySlots.isLoading}
            />
          </PermissionGate>

          <PermissionGate permission="finance:invoice:read">
            <StatCard
              title={t('stat.pending_invoices')}
              value={pendingInvoices.isError ? '—' : String(pendingInvoices.data?.pendingCount ?? 0)}
              description={
                overdueCount > 0
                  ? `${overdueCount} förfallna`
                  : t('stat.pending_invoices_description')
              }
              icon={Receipt}
              isLoading={pendingInvoices.isLoading}
            />
          </PermissionGate>

          <PermissionGate permission="finance:invoice:read">
            <StatCard
              title={t('stat.monthly_revenue')}
              value={monthlyRevenue.isError ? '—' : formatSekRounded(monthlyRevenue.data?.amount ?? 0)}
              description={t('stat.monthly_revenue_description')}
              icon={TrendingUp}
              isLoading={monthlyRevenue.isLoading}
            />
          </PermissionGate>
        </div>

        {/* ── Two-column section ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Upcoming lessons */}
          <PermissionGate permission="scheduling:booking:read">
            <div className="lg:col-span-2 bg-card border border-border rounded-xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">
                    {t('section.upcoming_lessons')}
                  </h2>
                </div>
                <button
                  onClick={() => navigate('/scheduling')}
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  Visa alla
                </button>
              </div>
              <div className="p-5">
                {todaySlots.isLoading ? (
                  <SlotListSkeleton />
                ) : visibleSlots.length > 0 ? (
                  <div>
                    {visibleSlots.map((slot) => (
                      <SlotRow key={slot.id} slot={slot} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={Calendar}
                    message={t('empty.no_lessons_today')}
                    ctaLabel="Öppna schema"
                    ctaHref="/scheduling"
                  />
                )}
              </div>
            </div>
          </PermissionGate>

          {/* Recent activity */}
          <div className="bg-card border border-border rounded-xl">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
              <UserCheck className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">
                {t('section.recent_activity')}
              </h2>
            </div>
            <div className="p-5">
              {recentActivity.isLoading ? (
                <ActivityFeedSkeleton />
              ) : recentActivity.isError || (recentActivity.data?.data ?? []).length === 0 ? (
                <EmptyState icon={Clock} message={t('empty.no_recent_activity')} />
              ) : (
                <div>
                  {recentActivity.data!.data.map((item) => (
                    <ActivityFeedItem key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </PageContent>
    </PageLayout>
  );
}

// ─── Slot status colors ───────────────────────────────────────────────────────

const SLOT_DOT: Record<LessonSlotStatus, string> = {
  open:        'bg-emerald-500',
  full:        'bg-blue-500',
  in_progress: 'bg-amber-500',
  completed:   'bg-muted-foreground',
  cancelled:   'bg-destructive',
  blocked:     'bg-muted-foreground/40',
};

// ─── Slot Row ──────────────────────────────────────────────────────────────────

function SlotRow({ slot }: { slot: LessonSlot }) {
  const navigate = useNavigate();
  return (
    <div
      className="flex items-center justify-between py-2.5 border-b border-border last:border-0 cursor-pointer rounded px-1 -mx-1 hover:bg-muted/40 transition-colors"
      onClick={() => navigate('/scheduling')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate('/scheduling')}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className={cn('w-2 h-2 rounded-full shrink-0', SLOT_DOT[slot.status])} />
        <span className="text-sm text-foreground">
          {formatTime(slot.starts_at)} – {formatTime(slot.ends_at)}
        </span>
      </div>
      <span className="text-xs text-muted-foreground shrink-0 ml-2">
        {slot.current_bookings}/{slot.max_bookings}
      </span>
    </div>
  );
}

// ─── Slot list skeleton ────────────────────────────────────────────────────────

function SlotListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-8 bg-muted rounded animate-pulse" />
      ))}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({
  icon: Icon,
  message,
  ctaLabel,
  ctaHref,
}: {
  icon: typeof Calendar;
  message: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {ctaLabel && ctaHref && (
        <Link to={ctaHref} className="text-xs text-primary hover:underline">
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}

// ─── Activity feed helpers ────────────────────────────────────────────────────

const ACTIVITY_LABELS: Record<string, string> = {
  'lesson.reminder':             'Lektionspåminnelse skickad',
  'lesson.booking_confirmation': 'Lektion bokad',
  'lesson.cancellation':         'Lektion avbokad',
  'booking.confirmed':           'Bokning bekräftad',
  'booking.cancelled':           'Bokning avbokad',
  'booking.reminder':            'Bokningspåminnelse skickad',
  'payment.confirmation':        'Betalning mottagen',
  'payment.received':            'Betalning mottagen',
  'invoice.created':             'Faktura skapad',
  'invoice.overdue':             'Faktura förfallen',
  'invoice.reminder':            'Fakturaåpåminnelse skickad',
  'student.registered':          'Ny elev registrerad',
  'student.document_expiring':   'Dokument löper ut',
};

function getActivityIcon(templateKey: string): typeof Calendar {
  const prefix = templateKey.split('.')[0];
  if (prefix === 'booking' || prefix === 'lesson') return Calendar;
  if (prefix === 'payment')                         return CreditCard;
  if (prefix === 'invoice')                         return Receipt;
  if (prefix === 'student')                         return GraduationCap;
  return Bell;
}

function getActivityLabel(templateKey: string): string {
  return ACTIVITY_LABELS[templateKey] ?? templateKey.replace(/[._]/g, ' ');
}

// ─── Activity route mapping ───────────────────────────────────────────────────

function activityRoute(templateKey: string): string | null {
  const prefix = templateKey.split('.')[0];
  if (prefix === 'booking' || prefix === 'lesson') return '/scheduling';
  if (prefix === 'student')                         return '/students';
  if (prefix === 'invoice' || prefix === 'payment') return '/finance/invoices';
  return null;
}

// ─── Activity Feed Item ───────────────────────────────────────────────────────

function ActivityFeedItem({ item }: { item: Notification }) {
  const navigate = useNavigate();
  const Icon     = getActivityIcon(item.template_key);
  const label    = getActivityLabel(item.template_key);
  const route    = activityRoute(item.template_key);

  return (
    <div
      className={cn(
        'flex items-start gap-3 py-2.5 border-b border-border last:border-0 rounded px-1 -mx-1 transition-colors',
        route && 'cursor-pointer hover:bg-muted/40'
      )}
      onClick={route ? () => navigate(route) : undefined}
      role={route ? 'button' : undefined}
      tabIndex={route ? 0 : undefined}
      onKeyDown={route ? (e) => e.key === 'Enter' && navigate(route) : undefined}
    >
      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground truncate">{label}</p>
        <p className="text-xs text-muted-foreground">{formatRelativeTime(item.created_at)}</p>
      </div>
      {item.status === 'failed' && (
        <span className="shrink-0 text-xs font-medium text-destructive mt-0.5">Fel</span>
      )}
    </div>
  );
}

// ─── Activity Feed Skeleton ───────────────────────────────────────────────────

function ActivityFeedSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-muted animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-muted rounded animate-pulse w-3/4" />
            <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
