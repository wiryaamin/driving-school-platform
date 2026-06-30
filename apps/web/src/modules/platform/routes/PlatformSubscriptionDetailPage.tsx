import { useParams, useNavigate } from 'react-router-dom';
import {
  CreditCard, Users, BookOpen, Car, Package, BarChart3,
  Clock, User, ChevronLeft, Calendar, CheckCircle2, XCircle,
  AlertCircle, TrendingUp,
} from 'lucide-react';
import {
  Skeleton, Badge, Tabs, TabsList, TabsTrigger, TabsContent,
} from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import {
  usePlatformSubscriptionDetail,
  usePlatformSubscriptionHistory,
} from '../hooks/usePlatformSubscriptions.js';
import type { SubscriptionHistoryEvent } from '../hooks/usePlatformSubscriptions.js';

// ─── Plan catalog (static, read-only) ────────────────────────────────────────

interface PlanDef {
  id:       string;
  name:     string;
  desc:     string;
  maxUsers: number | null;
  maxLocs:  number | null;
  modules:  string[];
  features: string[];
}

const PLAN_CATALOG: PlanDef[] = [
  {
    id: 'trial',
    name: 'Trial',
    desc: '14-dagars provperiod med grundläggande funktioner.',
    maxUsers: 5,
    maxLocs: 1,
    features: ['Upp till 5 användare', '1 plats', 'E-postsupport'],
    modules: ['Bokningar', 'Elever'],
  },
  {
    id: 'starter',
    name: 'Starter',
    desc: 'Perfekt för mindre trafikskolor med en enda plats.',
    maxUsers: 10,
    maxLocs: 1,
    features: ['Upp till 10 användare', '1 plats', 'Prioriterad e-postsupport'],
    modules: ['Bokningar', 'Elever', 'Ekonomi', 'Lärare'],
  },
  {
    id: 'professional',
    name: 'Professional',
    desc: 'Idealisk för medelstora trafikskolor med flera platser.',
    maxUsers: 25,
    maxLocs: 3,
    features: ['Upp till 25 användare', 'Upp till 3 platser', 'Prioriterad support', 'Avancerade rapporter'],
    modules: ['Bokningar', 'Elever', 'Ekonomi', 'Lärare', 'Företagskunder', 'Kommunikation', 'Rapporter'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    desc: 'För stora trafikskolor och kedjor med anpassade behov.',
    maxUsers: null,
    maxLocs: null,
    features: ['Obegränsade användare', 'Obegränsade platser', 'Dedikerad support', 'Anpassad integrering', 'SLA-garanti'],
    modules: ['Bokningar', 'Elever', 'Ekonomi', 'Lärare', 'Företagskunder', 'Kommunikation', 'Rapporter', 'API-åtkomst', 'AI-funktioner', 'Elevportal', 'Målsmannaportalen'],
  },
];

const ALL_MODULES = [
  'Bokningar', 'Elever', 'Ekonomi', 'Lärare', 'Företagskunder',
  'Kommunikation', 'Rapporter', 'API-åtkomst', 'AI-funktioner',
  'Elevportal', 'Målsmannaportalen',
];

// ─── Display maps ─────────────────────────────────────────────────────────────

const TIER_LABEL: Record<string, string> = {
  trial:        'Trial',
  starter:      'Starter',
  professional: 'Professional',
  enterprise:   'Enterprise',
};

const TIER_CLASS: Record<string, string> = {
  trial:        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  starter:      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  professional: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  enterprise:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

const SUB_STATUS_LABEL: Record<string, string> = {
  trialing:  'Testperiod',
  active:    'Aktiv',
  past_due:  'Förfallen',
  cancelled: 'Avslutad',
  suspended: 'Suspenderad',
};

const ORG_STATUS_LABEL: Record<string, string> = {
  active:    'Aktiv',
  suspended: 'Suspenderad',
  terminated:'Avslutad',
};

const ORG_STATUS_CLASS: Record<string, string> = {
  active:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  terminated:'bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400',
};

const HISTORY_EVENT_LABEL: Record<string, string> = {
  subscription_created:  'Prenumeration skapad',
  trial_started:         'Testperiod startad',
  trial_extended:        'Testperiod förlängd',
  trial_converted:       'Testperiod konverterad till aktiv',
  subscription_activated:'Prenumeration aktiverad',
  payment_past_due:      'Betalning förfallen',
  subscription_cancelled:'Prenumeration avslutad',
  subscription_suspended:'Prenumeration suspenderad',
  plan_changed:          'Plan ändrad',
};

const HISTORY_EVENT_COLOR: Record<string, string> = {
  subscription_created:  'bg-primary',
  trial_started:         'bg-amber-400',
  trial_extended:        'bg-amber-300',
  trial_converted:       'bg-emerald-500',
  subscription_activated:'bg-green-500',
  payment_past_due:      'bg-red-500',
  subscription_cancelled:'bg-gray-400',
  subscription_suspended:'bg-red-400',
  plan_changed:          'bg-blue-400',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border last:border-0">
      <p className="text-sm text-muted-foreground shrink-0 w-44">{label}</p>
      <p className="text-sm font-medium text-foreground text-right break-all">{value}</p>
    </div>
  );
}

function UsageBar({ used, max, label }: { used: number; max: number | null; label: string }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const atLimit = max !== null && used >= max;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-xs font-semibold tabular-nums', atLimit && 'text-destructive')}>
          {used}{max !== null ? ` / ${max}` : ''}
        </p>
      </div>
      {max !== null && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', atLimit ? 'bg-destructive' : pct >= 80 ? 'bg-amber-400' : 'bg-primary')}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function StatCard({
  label, value, icon: Icon, loading, warn,
}: {
  label: string; value: number | string; icon: React.ElementType; loading: boolean; warn?: boolean;
}) {
  return (
    <div className={cn(
      'rounded-xl border bg-card p-4 flex items-start gap-3',
      warn ? 'border-amber-300 dark:border-amber-700' : 'border-border',
    )}>
      <div className={cn(
        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
        warn ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-primary/10',
      )}>
        <Icon className={cn('w-4 h-4', warn ? 'text-amber-600 dark:text-amber-400' : 'text-primary')} />
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
        {loading ? (
          <Skeleton className="h-6 w-10 mt-1" />
        ) : (
          <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        )}
      </div>
    </div>
  );
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
      <p className="text-sm text-destructive">{message}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PlatformSubscriptionDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    data: sub,
    isLoading: subLoading,
    error: subError,
  } = usePlatformSubscriptionDetail(id);

  const {
    data: history,
    isLoading: histLoading,
    error: histError,
  } = usePlatformSubscriptionHistory(id);

  // ── Not found / load error ────────────────────────────────────────────────
  if (!subLoading && subError) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <CreditCard className="w-12 h-12 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Prenumeration hittades inte</p>
          <p className="text-xs text-muted-foreground">{subError.message}</p>
          <button
            type="button"
            onClick={() => navigate('/platform/subscriptions')}
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ChevronLeft className="w-4 h-4" />
            Tillbaka till prenumerationer
          </button>
        </div>
      </PageLayout>
    );
  }

  const plan = PLAN_CATALOG.find(p => p.id === sub?.subscription_tier) ?? null;
  const trialExpired =
    sub?.subscription_status === 'trialing' &&
    sub?.trial_ends_at != null &&
    new Date(sub.trial_ends_at) < new Date();

  return (
    <PageLayout>
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() => navigate('/platform/subscriptions')}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors mb-3"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Prenumerationer
        </button>

        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title={subLoading ? '…' : (sub?.org_name ?? 'Organisation')}
            description={subLoading ? undefined : (sub?.org_slug ?? undefined)}
          />
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-2 flex-wrap mt-3">
          {subLoading ? (
            <>
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </>
          ) : sub ? (
            <>
              <span className={cn(
                'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
                TIER_CLASS[sub.subscription_tier] ?? 'bg-muted text-muted-foreground',
              )}>
                {TIER_LABEL[sub.subscription_tier] ?? sub.subscription_tier}
              </span>
              <Badge variant="outline" className="text-xs">
                {SUB_STATUS_LABEL[sub.subscription_status] ?? sub.subscription_status}
              </Badge>
              <span className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold',
                ORG_STATUS_CLASS[sub.org_status] ?? 'bg-muted text-muted-foreground',
              )}>
                Org: {ORG_STATUS_LABEL[sub.org_status] ?? sub.org_status}
              </span>
              {sub.trial_ends_at && (
                <span className={cn(
                  'flex items-center gap-1 text-xs',
                  trialExpired ? 'text-destructive' : 'text-amber-600 dark:text-amber-400',
                )}>
                  <Calendar className="w-3 h-3" />
                  Trial: {new Date(sub.trial_ends_at).toLocaleDateString('sv-SE')}
                  {trialExpired && ' (Utgången)'}
                </span>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Översikt</TabsTrigger>
          <TabsTrigger value="usage">Användning</TabsTrigger>
          <TabsTrigger value="history">Historik</TabsTrigger>
          <TabsTrigger value="plan">Plan &amp; Funktioner</TabsTrigger>
        </TabsList>

        {/* ── Översikt tab ─────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Subscription card */}
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Prenumerationsdetaljer</p>
              </div>
              {subLoading ? (
                <div className="px-4 py-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex justify-between">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  ))}
                </div>
              ) : sub ? (
                <div className="px-4">
                  <InfoRow
                    label="Plan"
                    value={TIER_LABEL[sub.subscription_tier] ?? sub.subscription_tier}
                  />
                  <InfoRow
                    label="Prenumerationsstatus"
                    value={SUB_STATUS_LABEL[sub.subscription_status] ?? sub.subscription_status}
                  />
                  <InfoRow
                    label="Organisationsstatus"
                    value={ORG_STATUS_LABEL[sub.org_status] ?? sub.org_status}
                  />
                  {sub.trial_ends_at && (
                    <InfoRow
                      label="Testperiod slutar"
                      value={new Date(sub.trial_ends_at).toLocaleDateString('sv-SE', { dateStyle: 'long' })}
                    />
                  )}
                  <InfoRow
                    label="Max. användare"
                    value={String(sub.max_users)}
                  />
                  <InfoRow
                    label="Max. platser"
                    value={String(sub.max_locations)}
                  />
                  <InfoRow
                    label="Aktiverad"
                    value={new Date(sub.created_at).toLocaleDateString('sv-SE', { dateStyle: 'long' })}
                  />
                </div>
              ) : null}
            </div>

            {/* Organization profile card */}
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <User className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Organisationsprofil</p>
              </div>
              {subLoading ? (
                <div className="px-4 py-4 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex justify-between">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  ))}
                </div>
              ) : sub ? (
                <div className="px-4">
                  <InfoRow label="Juridiskt namn" value={sub.legal_name} />
                  <InfoRow label="Org.nummer"     value={sub.org_number} />
                  <InfoRow label="Slug"           value={sub.org_slug} />
                  <InfoRow label="Org. ID"        value={sub.org_id} />
                  <InfoRow
                    label="Senast uppdaterad"
                    value={new Date(sub.updated_at).toLocaleDateString('sv-SE', { dateStyle: 'long' })}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {/* Expired trial warning */}
          {!subLoading && trialExpired && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/10 px-4 py-3">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Testperioden utgick {sub?.trial_ends_at
                  ? new Date(sub.trial_ends_at).toLocaleDateString('sv-SE', { dateStyle: 'long' })
                  : ''} och organisationen har inte konverterats.
              </p>
            </div>
          )}
        </TabsContent>

        {/* ── Användning tab ────────────────────────────────────────────────── */}
        <TabsContent value="usage" className="space-y-4 mt-4">
          {subError && <SectionError message="Användningsdata ej tillgänglig." />}

          {!subError && (
            <>
              {/* Usage stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="Elever"    value={sub?.student_count    ?? 0} icon={BookOpen}   loading={subLoading} />
                <StatCard label="Lärare"    value={sub?.instructor_count ?? 0} icon={Users}      loading={subLoading} />
                <StatCard label="Fordon"    value={sub?.vehicle_count    ?? 0} icon={Car}        loading={subLoading} />
                <StatCard label="Bokningar" value={sub?.booking_count    ?? 0} icon={Calendar}   loading={subLoading} />
                <StatCard label="Paket"     value={sub?.package_count    ?? 0} icon={Package}    loading={subLoading} />
                <StatCard
                  label="Användare"
                  value={sub?.member_count ?? 0}
                  icon={BarChart3}
                  loading={subLoading}
                  warn={sub != null && sub.member_count >= sub.max_users}
                />
              </div>

              {/* License utilization */}
              {!subLoading && sub && (
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-semibold text-foreground">Licensutnyttjande</p>
                  </div>
                  <div className="space-y-4">
                    <UsageBar
                      label="Användare"
                      used={sub.member_count}
                      max={sub.max_users}
                    />
                    <UsageBar
                      label="Elever"
                      used={sub.student_count}
                      max={null}
                    />
                    <UsageBar
                      label="Lärare"
                      used={sub.instructor_count}
                      max={null}
                    />
                  </div>
                  {sub.member_count >= sub.max_users && (
                    <p className="text-xs text-destructive font-medium">
                      Organisationen har nått sin användargräns ({sub.max_users} av {sub.max_users}).
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── Historik tab ──────────────────────────────────────────────────── */}
        <TabsContent value="history" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Prenumerationshistorik</p>
              <span className="ml-auto text-[10px] text-muted-foreground">Senaste 100 händelserna</span>
            </div>

            {histError && (
              <div className="p-4">
                <SectionError message="Historik ej tillgänglig — platform-admin Edge Function är inte driftsatt ännu." />
              </div>
            )}

            {histLoading && (
              <div className="px-4 py-4 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" />
                    <div className="space-y-1 flex-1">
                      <Skeleton className="h-4 w-52" />
                      <Skeleton className="h-3 w-36" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!histLoading && !histError && (history ?? []).length === 0 && (
              <div className="px-4 py-12 text-center">
                <Clock className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Ingen prenumerationshistorik</p>
              </div>
            )}

            {!histLoading && !histError && (history ?? []).length > 0 && (
              <div className="px-4 py-4">
                <div className="relative pl-5 space-y-5">
                  <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />
                  {(history as SubscriptionHistoryEvent[]).map((event, idx) => {
                    const dotColor = HISTORY_EVENT_COLOR[event.event_type] ?? 'bg-muted-foreground';
                    const label    = HISTORY_EVENT_LABEL[event.event_type] ?? event.event_type;
                    return (
                      <div key={event.id ?? idx} className="relative flex gap-3">
                        <div className={cn('w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 -ml-5 relative z-10 ring-2 ring-background', dotColor)} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground leading-snug">{label}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {(event.actor_email ?? event.actor_id) && (
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <User className="w-3 h-3 shrink-0" />
                                {event.actor_email ?? `${event.actor_id?.substring(0, 8) ?? ''}…`}
                              </span>
                            )}
                            <span className="text-[11px] text-muted-foreground">
                              {new Date(event.occurred_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </div>
                          {event.event_type === 'plan_changed' && event.old_tier && event.new_tier && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {TIER_LABEL[event.old_tier] ?? event.old_tier} → {TIER_LABEL[event.new_tier] ?? event.new_tier}
                            </p>
                          )}
                          {event.event_type === 'trial_extended' && event.new_trial_ends && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Ny utgångsdatum: {new Date(event.new_trial_ends).toLocaleDateString('sv-SE')}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Plan & Funktioner tab ──────────────────────────────────────────── */}
        <TabsContent value="plan" className="space-y-4 mt-4">

          {/* Current plan card */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Aktuell plan</p>
              {!subLoading && sub && (
                <span className={cn(
                  'ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
                  TIER_CLASS[sub.subscription_tier] ?? 'bg-muted text-muted-foreground',
                )}>
                  {TIER_LABEL[sub.subscription_tier] ?? sub.subscription_tier}
                </span>
              )}
            </div>

            {subLoading ? (
              <div className="px-4 py-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : plan ? (
              <div className="px-4 py-4 space-y-4">
                <p className="text-sm text-muted-foreground">{plan.desc}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Max. användare</p>
                    <p className="text-lg font-bold text-foreground">{plan.maxUsers ?? '∞'}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Max. platser</p>
                    <p className="text-lg font-bold text-foreground">{plan.maxLocs ?? '∞'}</p>
                  </div>
                </div>
                {/* Plan features */}
                <div>
                  <p className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Inkluderade funktioner</p>
                  <ul className="space-y-1.5">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : !subLoading ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">Planinformation ej tillgänglig</p>
              </div>
            ) : null}
          </div>

          {/* Module entitlements */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Modulrättigheter</p>
            </div>

            {subLoading ? (
              <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Array.from({ length: 9 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 rounded-lg" />
                ))}
              </div>
            ) : plan ? (
              <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {ALL_MODULES.map(mod => {
                  const enabled = plan.modules.includes(mod);
                  return (
                    <div
                      key={mod}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-3 py-2.5 border',
                        enabled
                          ? 'border-green-200 bg-green-50 dark:border-green-800/50 dark:bg-green-900/10'
                          : 'border-border bg-muted/30',
                      )}
                    >
                      {enabled ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                      )}
                      <span className={cn(
                        'text-xs font-medium truncate',
                        enabled ? 'text-foreground' : 'text-muted-foreground',
                      )}>
                        {mod}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : !subLoading ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">Modulinformation ej tillgänglig</p>
              </div>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
