import { GraduationCap, Calendar, Receipt, TrendingUp, UserCheck, Clock } from 'lucide-react';
import { useTranslation } from '@platform/i18n';
import { useSession } from '@shared/hooks/useSession.js';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { StatCard } from '../components/StatCard.js';

/**
 * DashboardPage — the landing page after login.
 * Shows KPI stats relevant to the user's role.
 *
 * Data wiring: stat values will be populated from the reporting module
 * in Phase 2. Currently shown as "—" to establish the visual foundation.
 */
export function DashboardPage() {
  const { t } = useTranslation('dashboard');
  const { profile, organization } = useSession();

  const displayName = profile?.first_name ?? profile?.last_name ?? '';

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
              value="—"
              description={t('stat.active_students_description')}
              icon={GraduationCap}
            />
          </PermissionGate>

          <PermissionGate permission="scheduling:lesson:read">
            <StatCard
              title={t('stat.lessons_today')}
              value="—"
              description={t('stat.lessons_today_description')}
              icon={Calendar}
            />
          </PermissionGate>

          <PermissionGate permission="finance:invoice:read">
            <StatCard
              title={t('stat.pending_invoices')}
              value="—"
              description={t('stat.pending_invoices_description')}
              icon={Receipt}
            />
          </PermissionGate>

          <PermissionGate permission="finance:invoice:read">
            <StatCard
              title={t('stat.monthly_revenue')}
              value="— kr"
              description={t('stat.monthly_revenue_description')}
              icon={TrendingUp}
            />
          </PermissionGate>
        </div>

        {/* ── Two-column section ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Upcoming lessons */}
          <PermissionGate permission="scheduling:lesson:read">
            <div className="lg:col-span-2 bg-card border border-border rounded-xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">
                    {t('section.upcoming_lessons')}
                  </h2>
                </div>
                <button className="text-xs text-primary hover:text-primary/80 transition-colors">
                  Visa alla
                </button>
              </div>
              <div className="p-5">
                <EmptyState
                  icon={Calendar}
                  message={t('empty.no_lessons_today')}
                />
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
              <EmptyState
                icon={Clock}
                message={t('empty.no_recent_activity')}
              />
            </div>
          </div>
        </div>
      </PageContent>
    </PageLayout>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, message }: { icon: typeof Calendar; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
