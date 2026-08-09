import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Compass } from 'lucide-react';
import { Input, Skeleton, Badge } from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { useDemoRequests, type DemoRequest } from '../hooks/useDemoRequests.js';
import { usePlatformAdminsDetail } from '../hooks/usePlatformOpsCenter.js';
import { useTenantOnboardingList } from '../hooks/usePlatformTenantOnboarding.js';
import {
  useOrgJourneys, deriveOperationalStatus, formatTimeInStage, stageEnteredAt,
  OPERATIONAL_STATUS_LABEL, OPERATIONAL_STATUS_BADGE, type OperationalStatus,
} from '../hooks/useOnboardingCommandCenter.js';
import { TIER_LABEL } from '../lib/tierDisplay.js';
import { DemoRequestDetailSheet } from '../components/DemoRequestDetailSheet.js';
import { OrgOnboardingSheet } from '../components/OrgOnboardingSheet.js';

// ─── Unified row model ──────────────────────────────────────────────────────
//
// One shape covering both stages of the lifecycle this Command Center
// consolidates: a lead not yet converted (demo_requests, owned by Review
// Customer / Approve Onboarding / Convert to Customer — the same three
// steps WorkflowStepsCard already implements) and a provisioned org not
// yet live (owned by the existing 10-step Onboarding Journey). No new
// business states — this only combines what handleOnboardingJourney and
// the demo request workflow already compute into one queue.

type Health = 'green' | 'yellow' | 'red';

interface CommandCenterRow {
  kind:              'demo_request' | 'organization';
  id:                string;
  customerName:      string;
  contactName:       string | null;
  stage:             string;
  progressPercent:   number;
  operationalStatus: OperationalStatus;
  subscriptionTier:  string | null;
  assignedAdminId:   string | null;
  owner:             string;
  blockingReason:    string | null;
  stageEnteredAtIso: string | null;
  nextActionLabel:   string;
  health:            Health;
}

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function demoRequestRow(r: DemoRequest): CommandCenterRow {
  let stage: string; let stageEnteredAtIso: string; let owner: string; let nextActionLabel: string;
  if (!r.reviewed_at) {
    stage = 'Review Customer'; stageEnteredAtIso = r.created_at; owner = 'Platform'; nextActionLabel = 'Granska kund';
  } else if (!r.approved_at) {
    stage = 'Approve Onboarding'; stageEnteredAtIso = r.reviewed_at; owner = 'Customer Success'; nextActionLabel = 'Godkänn onboarding';
  } else {
    stage = 'Convert to Customer'; stageEnteredAtIso = r.approved_at; owner = 'Platform'; nextActionLabel = 'Konvertera till kund';
  }
  const d = daysSince(stageEnteredAtIso);
  const health: Health = d > 5 ? 'red' : d > 2 ? 'yellow' : 'green';
  const stepIndex = stage === 'Review Customer' ? 0 : stage === 'Approve Onboarding' ? 1 : 2;

  return {
    kind: 'demo_request', id: r.id, customerName: r.school_name, contactName: r.name,
    stage, progressPercent: Math.round((stepIndex / 10) * 100), operationalStatus: 'action_required',
    subscriptionTier: null, assignedAdminId: r.assigned_to, owner, blockingReason: null,
    stageEnteredAtIso, nextActionLabel, health,
  };
}

// ─── Display maps ────────────────────────────────────────────────────────────

const HEALTH_ORDER: Record<Health, number> = { red: 0, yellow: 1, green: 2 };
const HEALTH_DOT: Record<Health, string> = { green: 'bg-emerald-500', yellow: 'bg-amber-500', red: 'bg-red-500' };
const OWNER_LABEL_SV: Record<string, string> = {
  Platform: 'Plattformen', Customer: 'Kunden', 'Customer Success': 'Customer Success',
};

const GRID_COLS = 'grid-cols-[1.4fr_150px_110px_130px_110px_140px_120px_1.2fr_100px_180px]';

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OnboardingCommandCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const openParam = searchParams.get('open'); // "demo:<id>" | "org:<id>" — deep link target

  const { data: demoRequests, isLoading: demoLoading, error: demoError } = useDemoRequests();
  const { data: admins } = usePlatformAdminsDetail();
  // limit: 100 (the endpoint's max) — this queue must never silently drop a
  // customer past a default page size; it's a small admin-only aggregate
  // view, not a paginated end-user list.
  const { data: onboardingOrgs, isLoading: orgsLoading, error: orgsError } = useTenantOnboardingList(undefined, 100);
  const orgIds = useMemo(() => (onboardingOrgs ?? []).map((o) => o.id), [onboardingOrgs]);
  const journeyQueries = useOrgJourneys(orgIds);

  // The table renders as soon as the structural lists (demo requests, org
  // ids) are in — it does not wait for every org's own journey fetch to
  // finish. With dozens of customers in the queue, blocking the whole page
  // on the single slowest one would leave the Platform Administrator
  // staring at a blank screen far longer than necessary; rows simply appear
  // as their data arrives, with a small note for what's still loading.
  const isLoading = demoLoading || orgsLoading;
  const pendingJourneyCount = journeyQueries.filter((q) => q.isLoading).length;
  const loadError = demoError ?? orgsError ?? journeyQueries.find((q) => q.error)?.error ?? null;

  const activeDemoRequests = useMemo(
    () => (demoRequests ?? []).filter((r) => !['converted', 'declined', 'spam'].includes(r.status)),
    [demoRequests],
  );

  const rows = useMemo<CommandCenterRow[]>(() => {
    const demoRows = activeDemoRequests.map(demoRequestRow);
    const orgRows: CommandCenterRow[] = journeyQueries
      .map((q) => q.data)
      .filter((j): j is NonNullable<typeof j> => Boolean(j))
      .map((j) => {
        const currentStep = j.steps.find((s) => !s.completed);
        return {
          kind: 'organization' as const,
          id: j.organization_id,
          customerName: j.organization_name ?? '—',
          contactName: j.admin_contact?.name ?? j.admin_contact?.email ?? null,
          stage: j.stage,
          progressPercent: j.progress_percent,
          operationalStatus: deriveOperationalStatus(j),
          subscriptionTier: j.subscription_tier,
          assignedAdminId: null, // organizations don't carry an assignment field — only the originating demo request does
          owner: currentStep?.owner ?? 'Automatic',
          blockingReason: currentStep?.blocking_reason ?? null,
          stageEnteredAtIso: stageEnteredAt(j),
          nextActionLabel: j.next_recommended_action.label,
          health: j.health,
        };
      });

    const combined = [...demoRows, ...orgRows];
    const q = search.trim().toLowerCase();
    const filtered = q ? combined.filter((r) => r.customerName.toLowerCase().includes(q)) : combined;

    return filtered.sort((a, b) => {
      const healthDiff = HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health];
      if (healthDiff !== 0) return healthDiff;
      return daysSince(b.stageEnteredAtIso) - daysSince(a.stageEnteredAtIso);
    });
  }, [activeDemoRequests, journeyQueries, search]);

  const adminName = (id: string | null) => {
    if (!id) return '—';
    const a = admins?.find((x) => x.user_id === id);
    return a ? [a.first_name, a.last_name].filter(Boolean).join(' ') || a.email || '—' : '—';
  };

  // ─── Deep-linked detail overlay ────────────────────────────────────────────
  const [openDemoRequest, setOpenDemoRequest] = useState<DemoRequest | null>(null);
  const [openOrg, setOpenOrg] = useState<{ id: string; name: string | null } | null>(null);

  function openRow(row: CommandCenterRow) {
    if (row.kind === 'demo_request') {
      const req = activeDemoRequests.find((r) => r.id === row.id) ?? null;
      setOpenDemoRequest(req);
      setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('open', `demo:${row.id}`); return next; }, { replace: true });
    } else {
      setOpenOrg({ id: row.id, name: row.customerName });
      setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('open', `org:${row.id}`); return next; }, { replace: true });
    }
  }

  function closeOverlay() {
    setOpenDemoRequest(null);
    setOpenOrg(null);
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete('open'); return next; }, { replace: true });
  }

  // Resolve a deep link (e.g. from DemoRequestDetailSheet's "Visa
  // onboarding-resa" link, or a future notification) into the right overlay.
  // The org branch opens immediately from the id alone — OrgOnboardingSheet
  // fetches its own journey internally, so it must never wait on every row
  // in the queue finishing its own fetch first (this queue can be dozens of
  // customers deep; a deep link has to open right away regardless of that).
  useMemo(() => {
    if (!openParam) return;
    const [kind, id] = openParam.split(':');
    if (kind === 'demo' && id) {
      const req = activeDemoRequests.find((r) => r.id === id);
      if (req) setOpenDemoRequest(req);
    } else if (kind === 'org' && id) {
      setOpenOrg((current) => current?.id === id ? current : { id, name: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, activeDemoRequests.length]);

  return (
    <PageLayout>
      <PageHeader
        title="Onboarding Command Center"
        description="Alla kunder som ännu inte är Live Customer — vem behöver din uppmärksamhet just nu, och vad är nästa steg."
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-xs flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök kund…"
            className="pl-9"
          />
        </div>
        {!isLoading && pendingJourneyCount > 0 && (
          <p className="text-xs text-muted-foreground">Hämtar {pendingJourneyCount} till…</p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <div className={cn('grid gap-3 px-4 py-2.5 bg-muted/40 border-b border-border items-center min-w-[1400px]', GRID_COLS)}>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kund</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nuvarande steg</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Framsteg</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Abonnemang</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tilldelad admin</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ägare</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Blockerande orsak</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tid i steg</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nästa åtgärd</p>
        </div>

        {isLoading && (
          <div className="divide-y divide-border min-w-[1400px]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={cn('grid gap-3 px-4 py-3 items-center', GRID_COLS)}>
                {Array.from({ length: 10 }).map((_, j) => <Skeleton key={j} className="h-4 w-full" />)}
              </div>
            ))}
          </div>
        )}

        {!isLoading && loadError && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-destructive">Kunde inte hämta onboarding-kön</p>
            <p className="text-xs text-muted-foreground mt-1">{loadError.message}</p>
          </div>
        )}

        {!isLoading && !loadError && rows.length === 0 && pendingJourneyCount === 0 && (
          <div className="px-4 py-12 text-center">
            <Compass className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Inga kunder väntar på onboarding just nu.</p>
          </div>
        )}

        {!isLoading && !loadError && rows.length > 0 && (
          <div className="divide-y divide-border min-w-[1400px]">
            {rows.map((row) => (
              <button
                key={`${row.kind}:${row.id}`}
                type="button"
                onClick={() => openRow(row)}
                className={cn('grid gap-3 px-4 py-3 items-center text-left hover:bg-muted/30 transition-colors w-full', GRID_COLS)}
              >
                <div className="min-w-0 flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full shrink-0', HEALTH_DOT[row.health])} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{row.customerName}</p>
                    {row.contactName && <p className="text-xs text-muted-foreground truncate">{row.contactName}</p>}
                  </div>
                </div>

                <p className="text-xs text-foreground truncate">{row.stage}</p>

                <div className="flex items-center gap-2">
                  <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${row.progressPercent}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{row.progressPercent}%</span>
                </div>

                <Badge className={cn('text-[10px] w-fit', OPERATIONAL_STATUS_BADGE[row.operationalStatus])}>
                  {OPERATIONAL_STATUS_LABEL[row.operationalStatus]}
                </Badge>

                <p className="text-xs text-muted-foreground truncate">
                  {row.subscriptionTier ? (TIER_LABEL[row.subscriptionTier] ?? row.subscriptionTier) : '—'}
                </p>

                <p className="text-xs text-muted-foreground truncate">{adminName(row.assignedAdminId)}</p>

                <p className="text-xs text-muted-foreground truncate">{OWNER_LABEL_SV[row.owner] ?? row.owner}</p>

                <p className="text-xs text-muted-foreground truncate">{row.blockingReason ?? '—'}</p>

                <p className="text-xs text-muted-foreground truncate">{formatTimeInStage(row.stageEnteredAtIso)}</p>

                <p className="text-xs font-medium text-foreground truncate">{row.nextActionLabel}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <DemoRequestDetailSheet
        open={Boolean(openDemoRequest)}
        request={openDemoRequest}
        admins={admins ?? []}
        onClose={closeOverlay}
      />
      <OrgOnboardingSheet
        open={Boolean(openOrg)}
        orgId={openOrg?.id ?? null}
        orgName={openOrg?.name ?? null}
        onClose={closeOverlay}
      />
    </PageLayout>
  );
}
