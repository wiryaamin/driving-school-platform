import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Building2, Users, BookOpen, User,
  Activity, AlertCircle, ShieldOff, ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { Input, Skeleton } from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { usePlatformSubscriptions } from '../hooks/usePlatformSubscriptions.js';
import { usePlatformOrgHealth } from '../hooks/usePlatformOpsCenter.js';
import type { PlatformSubscription } from '../hooks/usePlatformSubscriptions.js';

// ─── Display maps ─────────────────────────────────────────────────────────────

const TIER_CLASS: Record<string, string> = {
  trial:        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  starter:      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  professional: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  enterprise:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

const TIER_LABEL: Record<string, string> = {
  trial:        'Trial',
  starter:      'Starter',
  professional: 'Professional',
  enterprise:   'Enterprise',
};

const STATUS_CLASS: Record<string, string> = {
  active:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  trialing:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  past_due:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_LABEL: Record<string, string> = {
  active:    'Aktiv',
  trialing:  'Testperiod',
  past_due:  'Förfallen',
  cancelled: 'Avslutad',
  suspended: 'Suspenderad',
};

const OP_LABEL: Record<string, string> = {
  INSERT: 'Skapad',
  UPDATE: 'Uppdaterad',
  DELETE: 'Raderad',
};

const ENTITY_LABEL: Record<string, string> = {
  organizations:         'Organisation',
  platform_admins:       'Plattformsadmin',
  user_role_assignments: 'Rolltilldelning',
  memberships:           'Medlemskap',
  students:              'Elev',
  instructors:           'Lärare',
  lesson_bookings:       'Bokning',
  lesson_slots:          'Tid',
  profiles:              'Profil',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs text-foreground text-right font-medium">{value}</span>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-foreground tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function HealthPanel({ orgId }: { orgId: string }) {
  const navigate = useNavigate();
  const { data: health, isLoading, error } = usePlatformOrgHealth(orgId);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    );
  }

  if (error || !health) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-8 h-8 text-destructive/60 mx-auto mb-2" />
        <p className="text-sm text-destructive">Kunde inte hämta organisationshälsa</p>
        <p className="text-xs text-muted-foreground mt-1">{error instanceof Error ? error.message : 'Okänt fel'}</p>
      </div>
    );
  }

  const fmtDate = (ts: string | null) =>
    ts ? new Date(ts).toLocaleDateString('sv-SE') : '—';
  const fmtTs = (ts: string | null) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return `${d.toLocaleDateString('sv-SE')} ${d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const contact = health.primary_contact;

  return (
    <div className="divide-y divide-border">
      {/* Overview */}
      <div className="p-4 space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">Prenumeration</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold', TIER_CLASS[health.subscription_tier] ?? 'bg-muted text-muted-foreground')}>
            {TIER_LABEL[health.subscription_tier] ?? health.subscription_tier}
          </span>
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold', STATUS_CLASS[health.subscription_status] ?? 'bg-muted text-muted-foreground')}>
            {STATUS_LABEL[health.subscription_status] ?? health.subscription_status}
          </span>
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold',
            health.org_status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
          )}>
            Org: {health.org_status === 'active' ? 'Aktiv' : health.org_status}
          </span>
        </div>
        <InfoRow label="Trial slutar"    value={health.trial_ends_at ? fmtDate(health.trial_ends_at) : undefined} />
        <InfoRow label="Max användare"   value={health.max_users} />
        <InfoRow label="Max platser"     value={health.max_locations} />
        <InfoRow label="Skapad"          value={fmtDate(health.created_at)} />
        <InfoRow label="Senaste inlogg"  value={fmtTs(health.last_login_at)} />
        <InfoRow label="Senaste aktivitet" value={fmtTs(health.last_activity_at)} />
      </div>

      {/* Usage */}
      <div className="p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">Användning</p>
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Elever"       value={health.student_count} />
          <StatCard label="Lärare"       value={health.instructor_count} />
          <StatCard label="Användare"    value={health.member_count} sub={`av ${health.max_users} max`} />
          <StatCard label="Fordon"       value={health.vehicle_count} />
          <StatCard label="Aktiva bok."  value={health.booking_count} />
        </div>
      </div>

      {/* Primary contact */}
      <div className="p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">Primär kontakt</p>
        {contact ? (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {[contact.first_name, contact.last_name].filter(Boolean).join(' ') || '—'}
              </p>
              <p className="text-xs text-muted-foreground truncate">{contact.email ?? '—'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {contact.role_display ?? contact.role}
                {contact.last_sign_in_at && (
                  <> · Inloggad {fmtDate(contact.last_sign_in_at)}</>
                )}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Ingen primär kontakt hittad</p>
        )}
      </div>

      {/* Recent activity */}
      <div className="p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">Senaste aktivitet</p>
        {health.recent_events.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ingen aktivitet registrerad</p>
        ) : (
          <div className="space-y-2">
            {health.recent_events.slice(0, 6).map(ev => (
              <div key={ev.id} className="flex items-start gap-2">
                <Activity className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground">
                    {ENTITY_LABEL[ev.entity_type] ?? ev.entity_type}{' '}
                    <span className="text-muted-foreground">{OP_LABEL[ev.operation] ?? ev.operation.toLowerCase()}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {ev.actor_email ?? 'System'} · {fmtTs(ev.occurred_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Open issues (placeholder) */}
      <div className="p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Öppna ärenden</p>
        <p className="text-xs text-muted-foreground italic">Ärendehantering implementeras i framtida fas.</p>
      </div>

      {/* Internal notes (placeholder) */}
      <div className="p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Interna anteckningar</p>
        <p className="text-xs text-muted-foreground italic">Anteckningsfunktion implementeras i framtida fas.</p>
      </div>

      {/* Impersonation preparation */}
      <div className="p-4 bg-muted/20">
        <div className="flex items-center gap-2 mb-3">
          <ShieldOff className="w-4 h-4 text-muted-foreground" />
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Impersonation</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/10 dark:border-amber-900/40">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Impersonation är <strong>inte implementerat</strong>. Funktionen kräver utökad granskning och tydlig godkännandeprocess per session.
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground">Krav vid aktivering: fullständig granskningslogg, tidsbegränsad session, tvingad MFA-verifiering av aktör.</p>
        </div>
      </div>

      {/* Navigation links */}
      <div className="p-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => navigate(`/platform/organizations/${orgId}`)}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          Organisations­detaljer
        </button>
        <button
          type="button"
          onClick={() => navigate(`/platform/subscriptions/${orgId}`)}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          Prenumeration
        </button>
        <button
          type="button"
          onClick={() => navigate(`/platform/audit?org_id=${orgId}`)}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          Granskningslogg
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PlatformSupportPage() {
  const [localSearch, setLocalSearch] = useState('');
  const [searchQ, setSearchQ]         = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: allSubs, isLoading: subsLoading } = usePlatformSubscriptions();

  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  function handleSearch(value: string) {
    setLocalSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearchQ(value.trim().toLowerCase());
    }, 300);
  }

  const filtered = useMemo((): PlatformSubscription[] => {
    const items = allSubs ?? [];
    if (!searchQ) return items.slice(0, 30);
    return items.filter(s => {
      const hay = `${s.org_name} ${s.org_slug}`.toLowerCase();
      return hay.includes(searchQ);
    }).slice(0, 30);
  }, [allSubs, searchQ]);

  const selectedOrg = useMemo(
    () => (allSubs ?? []).find(s => s.org_id === selectedOrgId) ?? null,
    [allSubs, selectedOrgId],
  );

  return (
    <PageLayout>
      <PageHeader
        title="Support Center"
        description="Sök organisationer och visa hälsostatus för kundsupport"
      />

      <div className="flex flex-col lg:flex-row gap-4 min-h-0">
        {/* ── Left: org search list ── */}
        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Sök organisation…"
              value={localSearch}
              onChange={e => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden flex-1">
            {subsLoading && (
              <div className="p-4 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            )}

            {!subsLoading && filtered.length === 0 && (
              <div className="p-8 text-center">
                <Building2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Inga organisationer hittades</p>
              </div>
            )}

            {!subsLoading && (
              <div className="divide-y divide-border max-h-[60vh] lg:max-h-[calc(100vh-280px)] overflow-y-auto">
                {filtered.map((sub: PlatformSubscription) => (
                  <button
                    key={sub.org_id}
                    type="button"
                    onClick={() => setSelectedOrgId(sub.org_id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-3 text-left transition-colors',
                      selectedOrgId === sub.org_id
                        ? 'bg-primary/5 border-l-2 border-l-primary'
                        : 'hover:bg-muted/50 border-l-2 border-l-transparent',
                    )}
                  >
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{sub.org_name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={cn(
                          'inline-flex items-center px-1.5 py-0 rounded-full text-[9px] font-semibold',
                          TIER_CLASS[sub.subscription_tier] ?? 'bg-muted text-muted-foreground',
                        )}>
                          {TIER_LABEL[sub.subscription_tier] ?? sub.subscription_tier}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Users className="w-2.5 h-2.5" />
                          {sub.member_count}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <BookOpen className="w-2.5 h-2.5" />
                          {sub.student_count}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {!subsLoading && (allSubs ?? []).length > 30 && !searchQ && (
              <div className="px-3 py-2 border-t border-border">
                <p className="text-[10px] text-muted-foreground text-center">
                  Visar 30 av {(allSubs ?? []).length} — sök för att filtrera
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: health panel ── */}
        <div className="flex-1 min-w-0">
          {!selectedOrgId ? (
            <div className="rounded-xl border border-border bg-card h-64 flex flex-col items-center justify-center gap-3 text-center px-8">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                <Building2 className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Välj en organisation</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Sök och välj en organisation i listan för att visa hälsostatus och supportinformation.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{selectedOrg?.org_name ?? '…'}</p>
                    <p className="text-[10px] text-muted-foreground">{selectedOrg?.org_slug ?? ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedOrg && (
                    <>
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold',
                        TIER_CLASS[selectedOrg.subscription_tier] ?? 'bg-muted text-muted-foreground',
                      )}>
                        {TIER_LABEL[selectedOrg.subscription_tier] ?? selectedOrg.subscription_tier}
                      </span>
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold',
                        STATUS_CLASS[selectedOrg.subscription_status] ?? 'bg-muted text-muted-foreground',
                      )}>
                        {STATUS_LABEL[selectedOrg.subscription_status] ?? selectedOrg.subscription_status}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Panel body */}
              <HealthPanel orgId={selectedOrgId} />
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
