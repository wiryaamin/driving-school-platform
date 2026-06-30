import { useState } from 'react';
import {
  Building2, CheckCircle, AlertCircle, Clock, CreditCard,
  AlertTriangle, Users, ShieldCheck, Plus, TrendingUp,
} from 'lucide-react';
import { Skeleton, Button, Badge } from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { usePlatformOrganizations } from '../hooks/usePlatformOrganizations.js';
import { usePlatformDashboardStats } from '../hooks/usePlatformDashboard.js';
import { CreateOrgDialog } from '../components/CreateOrgDialog.js';
import type { LucideIcon } from 'lucide-react';

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label:   string;
  value:   number | string;
  icon:    LucideIcon;
  loading: boolean;
  accent?: 'default' | 'success' | 'warning' | 'danger';
}

const ACCENT_CLASSES: Record<string, string> = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  danger:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

function KpiCard({ label, value, icon: Icon, loading, accent = 'default' }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3.5">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', ACCENT_CLASSES[accent])}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium leading-tight">{label}</p>
        {loading ? (
          <Skeleton className="h-6 w-10 mt-1" />
        ) : (
          <p className="text-2xl font-bold text-foreground mt-0.5 leading-tight">{value}</p>
        )}
      </div>
    </div>
  );
}

// ─── Tier pill ────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  trial:        'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  starter:      'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  professional: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  enterprise:   'bg-primary/10 text-primary',
};

const TIER_LABEL: Record<string, string> = {
  trial:        'Trial',
  starter:      'Starter',
  professional: 'Professional',
  enterprise:   'Enterprise',
};

// ─── Org status display ───────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  active:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  terminated:'bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400',
};

const STATUS_LABEL: Record<string, string> = {
  active:    'Aktiv',
  suspended: 'Suspenderad',
  terminated:'Avslutad',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PlatformDashboardPage() {
  const [showCreate, setShowCreate] = useState(false);

  const { data: stats, isLoading: statsLoading, isError: statsError } = usePlatformDashboardStats();
  const { data: orgs,  isLoading: orgsLoading }  = usePlatformOrganizations();

  const recentOrgs     = (orgs ?? []).slice(0, 8);
  const expiringTrials = (orgs ?? [])
    .filter(o => {
      if (o.subscription_status !== 'trialing' || !o.trial_ends_at) return false;
      const end  = new Date(o.trial_ends_at);
      const now  = new Date();
      const days = (end.getTime() - now.getTime()) / 86_400_000;
      return days >= 0 && days <= 7;
    })
    .sort((a, b) => new Date(a.trial_ends_at!).getTime() - new Date(b.trial_ends_at!).getTime());

  return (
    <PageLayout>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Platform Översikt"
          description="Systemstatus, organisationsöversikt och prenumerationssammanfattning"
        />
        <Button className="shrink-0 mt-1" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Ny organisation
        </Button>
      </div>

      {/* Edge Function not available notice */}
      {statsError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Aggregerad statistik är inte tillgänglig — platform-admin Edge Function är inte driftsatt ännu.
          </p>
        </div>
      )}

      {/* KPI Row 1 — org counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Totalt organisationer" value={stats?.total_orgs     ?? 0} icon={Building2}   loading={statsLoading} />
        <KpiCard label="Aktiva"                value={stats?.active_orgs    ?? 0} icon={CheckCircle}  loading={statsLoading} accent="success" />
        <KpiCard label="Testperiod"            value={stats?.trialing_orgs  ?? 0} icon={Clock}        loading={statsLoading} accent="default" />
        <KpiCard label="Suspenderade"          value={stats?.suspended_orgs ?? 0} icon={AlertCircle}  loading={statsLoading} accent="danger" />
      </div>

      {/* KPI Row 2 — subscription health */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Förfallna betalningar" value={stats?.past_due_orgs        ?? 0} icon={AlertTriangle}  loading={statsLoading} accent={stats?.past_due_orgs ? 'danger' : 'default'} />
        <KpiCard label="Utgångna provperioder" value={stats?.expired_trials        ?? 0} icon={AlertCircle}    loading={statsLoading} accent={stats?.expired_trials ? 'warning' : 'default'} />
        <KpiCard label="Aktiva prenumerationer"value={stats?.active_subscriptions  ?? 0} icon={CreditCard}     loading={statsLoading} accent="success" />
        <KpiCard label="Plattformsadmins"      value={stats?.platform_admin_count  ?? 0} icon={ShieldCheck}    loading={statsLoading} />
      </div>

      {/* Subscription tier distribution */}
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Prenumerationsfördelning</p>
        </div>
        {statsLoading ? (
          <div className="flex gap-3">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-8 w-24" />)}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(['trial', 'starter', 'professional', 'enterprise'] as const).map(tier => {
              const count = stats?.[`tier_${tier}` as keyof typeof stats] as number ?? 0;
              return (
                <div key={tier} className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium', TIER_COLORS[tier])}>
                  <span>{TIER_LABEL[tier]}</span>
                  <span className="font-bold">{count}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Recent organizations (2/3 width) */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Senaste organisationer</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {orgsLoading ? '' : `De ${recentOrgs.length} senast registrerade`}
              </p>
            </div>
          </div>

          {orgsLoading && (
            <div className="px-4 py-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          )}

          {!orgsLoading && recentOrgs.length === 0 && (
            <div className="px-4 py-10 text-center">
              <Building2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Inga organisationer registrerade</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowCreate(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Skapa första organisation
              </Button>
            </div>
          )}

          {!orgsLoading && recentOrgs.length > 0 && (
            <div className="divide-y divide-border">
              {recentOrgs.map(org => (
                <div
                  key={org.id}
                  className="flex items-center justify-between px-4 py-3 gap-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{org.name}</p>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">{org.slug}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold',
                      STATUS_BADGE[org.status] ?? 'bg-muted text-muted-foreground',
                    )}>
                      {STATUS_LABEL[org.status] ?? org.status}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-medium hidden sm:inline-flex">
                      {TIER_LABEL[org.subscription_tier] ?? org.subscription_tier}
                    </Badge>
                    <span className="text-xs text-muted-foreground w-20 text-right hidden md:block">
                      {new Date(org.created_at).toLocaleDateString('sv-SE')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: Trial pipeline */}
        <div className="flex flex-col gap-4">

          {/* Trials expiring within 7 days */}
          <div className="rounded-xl border border-border bg-card flex-1">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Clock className="w-4 h-4 text-amber-500" />
              <p className="text-sm font-semibold text-foreground">Provperioder snart slut</p>
              {!statsLoading && (stats?.trials_expiring_7d ?? 0) > 0 && (
                <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  {stats?.trials_expiring_7d}
                </span>
              )}
            </div>

            {orgsLoading && (
              <div className="px-4 py-4 space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            )}

            {!orgsLoading && expiringTrials.length === 0 && (
              <div className="px-4 py-8 text-center">
                <CheckCircle className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Inga provperioder löper ut inom 7 dagar</p>
              </div>
            )}

            {!orgsLoading && expiringTrials.length > 0 && (
              <div className="divide-y divide-border">
                {expiringTrials.map(org => {
                  const end      = new Date(org.trial_ends_at!);
                  const daysLeft = Math.ceil((end.getTime() - Date.now()) / 86_400_000);
                  return (
                    <div key={org.id} className="px-4 py-3">
                      <p className="text-xs font-medium text-foreground truncate">{org.name}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-[11px] text-muted-foreground">{end.toLocaleDateString('sv-SE')}</p>
                        <span className={cn(
                          'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                          daysLeft <= 2
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                        )}>
                          {daysLeft === 0 ? 'Idag' : daysLeft === 1 ? 'Imorgon' : `${daysLeft} dagar`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Users card */}
          <div className="rounded-xl border border-border bg-card px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Plattformsteam</p>
            </div>
            {statsLoading ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{stats?.platform_admin_count ?? 0}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">aktiva administratörer</p>
          </div>
        </div>
      </div>

      {showCreate && <CreateOrgDialog onClose={() => setShowCreate(false)} />}
    </PageLayout>
  );
}
