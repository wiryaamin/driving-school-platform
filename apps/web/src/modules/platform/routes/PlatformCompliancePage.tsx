import { Link } from 'react-router-dom';
import { ShieldCheck, ScrollText, AlertCircle } from 'lucide-react';
import { Skeleton } from '@platform/ui';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { usePlatformComplianceSummary } from '../hooks/usePlatformOpsCenter.js';

/**
 * Compliance — platform-wide GDPR/consent + regulatory-workflow snapshot,
 * built entirely on columns/tables that already existed (students'
 * gdpr_consent_given_at, regulatory_workflows). Per-organization detail
 * still lives on Organization Detail's Efterlevnad tab; this is the
 * cross-org rollup a Platform Administrator needs to spot which customers
 * need attention.
 */
export function PlatformCompliancePage() {
  const { data, isLoading, error } = usePlatformComplianceSummary();

  return (
    <PageLayout>
      <PageHeader title="Efterlevnad" description="GDPR-samtycke och regulatoriska ärenden över hela plattformen" />

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Efterlevnadsöversikt ej tillgänglig</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Elever totalt', value: data?.total_students },
          { label: 'GDPR-samtycke lämnat', value: data?.gdpr_consent_given_count },
          { label: 'Regulatoriska ärenden', value: data?.regulatory_total },
          { label: 'Försenade ärenden', value: data?.regulatory_overdue, danger: (data?.regulatory_overdue ?? 0) > 0 },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className={`w-4 h-4 ${s.danger ? 'text-destructive' : 'text-muted-foreground'}`} />
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">{s.label}</p>
            </div>
            {isLoading ? <Skeleton className="h-7 w-12" /> : <p className={`text-2xl font-bold ${s.danger ? 'text-destructive' : 'text-foreground'}`}>{s.value ?? 0}</p>}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Organisationer med försenade ärenden</p>
        </div>
        {!isLoading && (data?.orgs_with_overdue_workflows ?? []).length === 0 && (
          <p className="px-4 py-8 text-sm text-muted-foreground text-center">Inga försenade regulatoriska ärenden</p>
        )}
        {(data?.orgs_with_overdue_workflows ?? []).length > 0 && (
          <div className="divide-y divide-border">
            {data!.orgs_with_overdue_workflows.map((o) => (
              <Link key={o.organization_id} to={`/platform/organizations/${o.organization_id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
                <p className="text-sm font-medium text-foreground">{o.org_name}</p>
                <span className="text-xs text-destructive font-semibold">{o.overdue_count} försenade</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
