import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Rocket, ListChecks } from 'lucide-react';
import {
  Input, Skeleton, toast, Button,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import {
  useTenantOnboardingList, useApproveGoLive, type TenantOnboardingListRow,
} from '../hooks/usePlatformTenantOnboarding.js';

// ─── Go Live confirm dialog ────────────────────────────────────────────────────
// Mirrors PlatformOrganizationsPage's local ConfirmDialog pattern — this
// codebase's actual convention for a gated, auditable platform-admin action
// (see Customer Provisioning & Tenant Onboarding Architecture, Section 10).

function GoLiveConfirmDialog({
  org, loading, onConfirm, onCancel,
}: {
  org: TenantOnboardingListRow | null; loading: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  // Always mounted; only `open` toggles. Radix's Dialog renders through a
  // Portal into document.body and owns its own close/exit-animation cleanup
  // — conditionally mounting/unmounting this component from the parent
  // (the previous `{goLiveTarget && <GoLiveConfirmDialog .../>}` pattern)
  // races React's own removal of that portaled node against Radix's,
  // producing "Failed to execute 'removeChild' on 'Node'".
  return (
    <Dialog open={!!org} onOpenChange={open => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        {org && (
          <>
            <DialogHeader><DialogTitle>Godkänn driftsättning — {org.name}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Alla {org.total_requirements} krav för driftsättning är klara. Organisationen övergår till Live Customer och Tenant Onboarding-vyn döljs för dem.
            </p>
            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={onCancel} disabled={loading}>Avbryt</Button>
              <Button onClick={onConfirm} disabled={loading}>
                {loading ? 'Vänta…' : 'Godkänn driftsättning'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PlatformTenantOnboardingPage() {
  const [search, setSearch] = useState('');
  const [goLiveTarget, setGoLiveTarget] = useState<TenantOnboardingListRow | null>(null);

  const { data: rows, isLoading, error } = useTenantOnboardingList(search);
  const approveGoLive = useApproveGoLive();

  function handleApprove() {
    if (!goLiveTarget) return;
    approveGoLive.mutate(goLiveTarget.id, {
      onSuccess: () => {
        toast({ title: 'Driftsatt', description: `${goLiveTarget.name} är nu en Live Customer` });
        setGoLiveTarget(null);
      },
      onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  return (
    <PageLayout>
      <PageHeader
        title="Tenant Onboarding"
        description="Provisionerade organisationer som ännu inte är driftsatta (Live Customer)"
      />

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök organisation…"
          className="pl-9"
        />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-[1fr_160px_120px_100px] gap-3 px-4 py-2.5 bg-muted/40 border-b border-border items-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Organisation</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Framsteg</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skapad</p>
          <span />
        </div>

        {isLoading && (
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[1fr_160px_120px_100px] gap-3 px-4 py-3 items-center">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-7 w-24 rounded-lg ml-auto" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && error && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-destructive">Kunde inte hämta onboarding-status</p>
            <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
          </div>
        )}

        {!isLoading && !error && (rows?.length ?? 0) === 0 && (
          <div className="px-4 py-12 text-center">
            <ListChecks className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Inga organisationer väntar på driftsättning just nu.
            </p>
          </div>
        )}

        {!isLoading && !error && (rows?.length ?? 0) > 0 && (
          <div className="divide-y divide-border">
            {rows!.map((org) => (
              <div
                key={org.id}
                className="grid grid-cols-[1fr_160px_120px_100px] gap-3 px-4 py-3 items-center hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0">
                  <Link to={`/platform/organizations/${org.id}?tab=onboarding`} className="text-sm font-medium text-foreground hover:text-primary truncate block">
                    {org.name}
                  </Link>
                  <p className="text-xs text-muted-foreground truncate">{org.org_number ?? '—'}</p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', org.ready_for_go_live ? 'bg-emerald-500' : 'bg-primary')}
                      style={{ width: `${(org.completed_requirements / org.total_requirements) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {org.completed_requirements}/{org.total_requirements}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">
                  {new Date(org.created_at).toLocaleDateString('sv-SE')}
                </p>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={!org.ready_for_go_live}
                    onClick={() => setGoLiveTarget(org)}
                    title={org.ready_for_go_live ? undefined : 'Alla krav för driftsättning är inte klara ännu'}
                  >
                    <Rocket className="w-3.5 h-3.5 mr-1.5" />
                    Driftsätt
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <GoLiveConfirmDialog
        org={goLiveTarget}
        loading={approveGoLive.isPending}
        onConfirm={handleApprove}
        onCancel={() => setGoLiveTarget(null)}
      />
    </PageLayout>
  );
}
