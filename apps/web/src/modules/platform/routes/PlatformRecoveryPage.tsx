import { Link } from 'react-router-dom';
import { RefreshCw, LifeBuoy, AlertCircle } from 'lucide-react';
import { Button, Skeleton, toast } from '@platform/ui';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { usePlatformRecoveryQueue, useRetryOrgFromRecoveryQueue } from '../hooks/usePlatformOpsCenter.js';

/**
 * Recovery Center — cross-org list of organizations with something to
 * retry (dead-lettered events, failed messages), each retryable inline.
 * Reuses the exact same retry action Organization Detail's Drift tab
 * already calls (`POST /orgs/:id/operations/retry`) — this page is a
 * queue view over that same action, not a second implementation of it.
 * "Recover Administrator" (resend invitation / password reset) and
 * "Recover Organization" (reactivate) already exist on Organization
 * Detail's Administratörer tab and Organizations list respectively —
 * this page focuses on what's genuinely cross-org: the retry queue.
 */
export function PlatformRecoveryPage() {
  const { data: queue, isLoading, error } = usePlatformRecoveryQueue();
  const retry = useRetryOrgFromRecoveryQueue();

  function handleRetry(orgId: string, orgName: string) {
    retry.mutate(orgId, {
      onSuccess: (result) => toast({
        title: 'Återköat',
        description: `${orgName}: ${result.events_requeued} händelser, ${result.messages_requeued} meddelanden`,
      }),
      onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  return (
    <PageLayout>
      <PageHeader title="Återställningscenter" description="Organisationer med misslyckade händelser eller meddelanden som behöver köas om" />

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Återställningskö ej tillgänglig</p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <LifeBuoy className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Behöver åtgärd</p>
        </div>

        {isLoading && <div className="px-4 py-4 space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>}

        {!isLoading && (queue ?? []).length === 0 && (
          <p className="px-4 py-10 text-sm text-muted-foreground text-center">Inga organisationer behöver återställningsåtgärder just nu</p>
        )}

        {(queue ?? []).length > 0 && (
          <div className="divide-y divide-border">
            {(queue ?? []).map((item) => (
              <div key={item.organization_id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link to={`/platform/organizations/${item.organization_id}`} className="text-sm font-medium text-foreground hover:text-primary truncate block">
                    {item.org_name}
                  </Link>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {item.dead_letter_count > 0 && <span className="text-destructive font-medium">{item.dead_letter_count} dead-letter</span>}
                    {item.failed_message_count > 0 && <span>{item.failed_message_count} misslyckade meddelanden</span>}
                    {item.oldest_issue_at && <span>sedan {new Date(item.oldest_issue_at).toLocaleDateString('sv-SE')}</span>}
                  </div>
                </div>
                <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => handleRetry(item.organization_id, item.org_name)}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Försök igen
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
