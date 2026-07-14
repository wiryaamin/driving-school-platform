import { useState } from 'react';
import {
  RefreshCw, CheckCircle2, AlertTriangle,
  Clock, Loader2, Link2, LogOut, Wifi, WifiOff,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { Button, Skeleton, toast } from '@platform/ui';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { SubscriptionGate } from '@core/rbac/SubscriptionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { cn } from '@/lib/utils.js';
import { fortnoxKeys as fortnoxStatusKeys, useFortnoxStatus } from '../hooks/useFortnoxStatus.js';

// ─── Query keys ───────────────────────────────────────────────────────────────

const fortnoxKeys = {
  ...fortnoxStatusKeys,
  counts:  (orgId: string) => ['fortnox', 'counts', orgId] as const,
  lineage: (orgId: string) => ['fortnox', 'lineage', orgId] as const,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type SyncCounts = {
  customersPending: number;
  customersFailed:  number;
  customersSynced:  number;
  invoicesPending:  number;
  invoicesFailed:   number;
  invoicesSynced:   number;
};

type LineageRow = {
  id:               string;
  export_run_id:    string;
  fortnox_batch_id: string | null;
  sync_status:      string;
  entries_total:    number;
  entries_synced:   number;
  entries_failed:   number;
  exported_at:      string | null;
  sync_error:       string | null;
  created_at:       string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

const SYNC_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  synced:  { label: 'Synkad',     className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/40' },
  pending: { label: 'Väntande',   className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/40' },
  failed:  { label: 'Misslyckad', className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/40' },
  stale:   { label: 'Inaktuell',  className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/40' },
  skipped: { label: 'Hoppades',   className: 'bg-muted text-muted-foreground border-border' },
};

// ─── Edge Function helpers ────────────────────────────────────────────────────

async function invoke<T>(fn: string, opts?: Parameters<typeof supabase.functions.invoke>[1]): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(fn, opts);
  if (error) throw error;
  if (!data) throw new Error('Tom respons från server');
  return data;
}

// ─── Sync counts ─────────────────────────────────────────────────────────────

async function fetchSyncCounts(orgId: string): Promise<SyncCounts> {
  const [cp, cf, cs, ip, ifl, is_] = await Promise.all([
    supabase.from('fortnox_customer_sync' as never).select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('sync_status', 'pending'),
    supabase.from('fortnox_customer_sync' as never).select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId).in('sync_status', ['failed', 'stale']),
    supabase.from('fortnox_customer_sync' as never).select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('sync_status', 'synced'),
    supabase.from('fortnox_invoice_sync' as never).select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('sync_status', 'pending'),
    supabase.from('fortnox_invoice_sync' as never).select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId).in('sync_status', ['failed', 'stale']),
    supabase.from('fortnox_invoice_sync' as never).select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('sync_status', 'synced'),
  ]);
  return {
    customersPending: (cp as { count: number | null }).count ?? 0,
    customersFailed:  (cf as { count: number | null }).count ?? 0,
    customersSynced:  (cs as { count: number | null }).count ?? 0,
    invoicesPending:  (ip as { count: number | null }).count ?? 0,
    invoicesFailed:   (ifl as { count: number | null }).count ?? 0,
    invoicesSynced:   (is_ as { count: number | null }).count ?? 0,
  };
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  label, pending, failed, synced, isLoading,
}: {
  label: string; pending: number; failed: number; synced: number; isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-28 rounded-lg" />;
  return (
    <div className={cn(
      'bg-card border rounded-lg p-4 space-y-3',
      failed > 0 ? 'border-red-200 dark:border-red-900/50' : 'border-border',
    )}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-bold tabular-nums text-green-600 dark:text-green-400">{synced}</p>
          <p className="text-[10px] text-muted-foreground">Synkade</p>
        </div>
        <div>
          <p className="text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400">{pending}</p>
          <p className="text-[10px] text-muted-foreground">Väntande</p>
        </div>
        <div>
          <p className={cn('text-lg font-bold tabular-nums', failed > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>{failed}</p>
          <p className="text-[10px] text-muted-foreground">Misslyckade</p>
        </div>
      </div>
    </div>
  );
}

// ─── OAuth connection section ─────────────────────────────────────────────────

function FortnoxConnectionSection({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [connecting, setConnecting] = useState(false);

  const { data: status, isLoading } = useFortnoxStatus(orgId);

  const refreshMut = useMutation({
    mutationFn: () => invoke<{ refreshed: boolean; token_expiry: string }>('fortnox/oauth/refresh', { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => {
      toast({ title: 'Token förnyad' });
      void qc.invalidateQueries({ queryKey: fortnoxKeys.status(orgId) });
    },
    onError: (e) => toast({ title: 'Förnyelse misslyckades', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
  });

  const disconnectMut = useMutation({
    mutationFn: () => invoke<{ disconnected: boolean }>('fortnox/oauth/disconnect', { method: 'DELETE' }),
    onSuccess: () => {
      toast({ title: 'Fortnox frånkopplat' });
      void qc.invalidateQueries({ queryKey: fortnoxKeys.status(orgId) });
    },
    onError: (e) => toast({ title: 'Frånkoppling misslyckades', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
  });

  async function handleConnect() {
    if (!orgId) return;
    setConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/finance/fortnox/callback`;
      const result = await invoke<{ auth_url: string; code_verifier: string; state: string }>(
        `fortnox/oauth/start?redirect_uri=${encodeURIComponent(redirectUri)}`,
        { method: 'GET' },
      );
      sessionStorage.setItem('fortnox_code_verifier', result.code_verifier);
      sessionStorage.setItem('fortnox_state',         result.state);
      sessionStorage.setItem('fortnox_redirect_uri',  redirectUri);
      window.location.href = result.auth_url;
    } catch (e) {
      toast({
        title:       'Kunde inte starta OAuth-flöde',
        description: e instanceof Error ? e.message : undefined,
        variant:     'destructive',
      });
      setConnecting(false);
    }
  }

  if (isLoading) return <Skeleton className="h-36 rounded-lg" />;

  const s = status ?? { configured: false, connected: false };

  return (
    <section className="bg-card border border-border rounded-lg p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Anslutning till Fortnox</h2>
      </div>

      {/* Not configured at platform level */}
      {!s.configured && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Fortnox-integration ej konfigurerad</p>
            <p className="text-xs mt-0.5 text-amber-600 dark:text-amber-500">
              Plattformsadministratören behöver konfigurera{' '}
              <code className="font-mono bg-amber-100 dark:bg-amber-900/30 px-1 rounded">FORTNOX_CLIENT_ID</code> och{' '}
              <code className="font-mono bg-amber-100 dark:bg-amber-900/30 px-1 rounded">FORTNOX_CLIENT_SECRET</code> som Supabase Secrets.
            </p>
          </div>
        </div>
      )}

      {/* Connected */}
      {s.connected && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              {s.method === 'oauth' ? 'Ansluten via OAuth' : 'Ansluten via API-nyckel'}
            </span>
          </div>

          {s.method === 'oauth' && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              {s.connected_at && (
                <div>
                  <p className="text-muted-foreground">Ansluten</p>
                  <p className="text-foreground font-medium">{fmtDateTime(s.connected_at)}</p>
                </div>
              )}
              {s.token_expiry && (
                <div>
                  <p className="text-muted-foreground">Token giltig till</p>
                  <p className={cn('font-medium', s.needs_refresh ? 'text-amber-600 dark:text-amber-400' : 'text-foreground')}>
                    {fmtDateTime(s.token_expiry)}
                    {s.needs_refresh && ' ⚠'}
                  </p>
                </div>
              )}
              {s.scope && (
                <div className="col-span-2">
                  <p className="text-muted-foreground">Behörigheter</p>
                  <p className="text-foreground font-mono">{s.scope}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {s.method === 'oauth' && s.needs_refresh && (
              <Button size="sm" variant="outline" onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending} className="gap-1.5">
                {refreshMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Förnya token
              </Button>
            )}
            {s.method === 'oauth' && !s.needs_refresh && (
              <Button size="sm" variant="outline" onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending} className="gap-1.5">
                {refreshMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Förnya token
              </Button>
            )}
            {s.configured && (
              <Button size="sm" variant="outline" onClick={handleConnect} disabled={connecting} className="gap-1.5">
                {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                Återanslut
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 ml-auto text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => disconnectMut.mutate()}
              disabled={disconnectMut.isPending}
            >
              {disconnectMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
              Koppla bort
            </Button>
          </div>
        </div>
      )}

      {/* Not connected */}
      {!s.connected && s.configured && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Inte ansluten till Fortnox</span>
          </div>
          <Button onClick={handleConnect} disabled={connecting} className="gap-2">
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Anslut till Fortnox
          </Button>
          <p className="text-xs text-muted-foreground">
            Du omdirigeras till Fortnox för inloggning och behörighetsgivning.
            Redirect URI:{' '}
            <code className="font-mono text-[10px] bg-muted px-1 rounded">
              {typeof window !== 'undefined' ? window.location.origin : ''}/finance/fortnox/callback
            </code>
          </p>
        </div>
      )}
    </section>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FortnoxPage() {
  const { organization } = useSession();
  const queryClient      = useQueryClient();
  const orgId            = organization?.id ?? '';

  // ── Sync counts ───────────────────────────────────────────────────────────

  const { data: counts, isLoading: countsLoading } = useQuery({
    queryKey: fortnoxKeys.counts(orgId),
    queryFn:  () => fetchSyncCounts(orgId),
    enabled:  !!orgId,
    staleTime: 60_000,
    refetchInterval: 30_000,
  });

  // ── Lineage ───────────────────────────────────────────────────────────────

  const { data: lineageData, isLoading: lineageLoading } = useQuery({
    queryKey: fortnoxKeys.lineage(orgId),
    queryFn:  async () => {
      const { data } = await supabase
        .from('fortnox_export_lineage' as never)
        .select('id, export_run_id, fortnox_batch_id, sync_status, entries_total, entries_synced, entries_failed, exported_at, sync_error, created_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(20);
      return (data ?? []) as LineageRow[];
    },
    enabled:  !!orgId,
    staleTime: 60_000,
  });

  // ── Retry failed ──────────────────────────────────────────────────────────

  const retryFailed = useMutation({
    mutationFn: async () => {
      const [failedCustomers, failedInvoices] = await Promise.all([
        (supabase.from('fortnox_customer_sync' as never) as ReturnType<typeof supabase.from>)
          .select('student_id')
          .eq('organization_id', orgId)
          .in('sync_status', ['failed', 'stale'])
          .limit(50),
        (supabase.from('fortnox_invoice_sync' as never) as ReturnType<typeof supabase.from>)
          .select('invoice_id')
          .eq('organization_id', orgId)
          .in('sync_status', ['failed', 'stale'])
          .limit(50),
      ]);

      type CustomerRow = { student_id: string };
      type InvoiceRow  = { invoice_id: string };

      const customerIds = ((failedCustomers as { data: CustomerRow[] | null }).data ?? []).map(r => r.student_id);
      const invoiceIds  = ((failedInvoices  as { data: InvoiceRow[]  | null }).data ?? []).map(r => r.invoice_id);

      await Promise.all([
        ...customerIds.map(id => supabase.functions.invoke('fortnox/queue', {
          method: 'POST', body: { entity: 'customer', entity_id: id },
        })),
        ...invoiceIds.map(id => supabase.functions.invoke('fortnox/queue', {
          method: 'POST', body: { entity: 'invoice', entity_id: id },
        })),
      ]);

      return { count: customerIds.length + invoiceIds.length };
    },
    onSuccess: ({ count }) => {
      toast({ title: `${count} poster köade för omsynkronisering` });
      void queryClient.invalidateQueries({ queryKey: fortnoxKeys.counts(orgId) });
    },
    onError: () => toast({ title: 'Kunde inte köa synkronisering', variant: 'destructive' }),
  });

  const totalFailed  = (counts?.customersFailed  ?? 0) + (counts?.invoicesFailed  ?? 0);
  const totalPending = (counts?.customersPending ?? 0) + (counts?.invoicesPending ?? 0);

  return (
    <PageLayout>
      <PageHeader title="Fortnox" description="Integrationsinställningar och synkroniseringsstatus" />
      <PageContent>
        <SubscriptionGate feature="finance:fortnox:sync">
        <PermissionGate permission={Permissions.FINANCE_FORTNOX_MANAGE}>

          <div className="max-w-3xl space-y-6">

            {/* ── OAuth-anslutning ────────────────────────────────────── */}
            <FortnoxConnectionSection orgId={orgId} />

            {/* ── Synkroniseringsstatus ───────────────────────────────── */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Synkroniseringsstatus</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <StatCard
                  label="Kunder"
                  pending={counts?.customersPending ?? 0}
                  failed={counts?.customersFailed   ?? 0}
                  synced={counts?.customersSynced   ?? 0}
                  isLoading={countsLoading}
                />
                <StatCard
                  label="Fakturor"
                  pending={counts?.invoicesPending ?? 0}
                  failed={counts?.invoicesFailed  ?? 0}
                  synced={counts?.invoicesSynced  ?? 0}
                  isLoading={countsLoading}
                />
              </div>
            </section>

            {/* ── Manuell synkronisering ──────────────────────────────── */}
            <section className="bg-card border border-border rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Manuell synkronisering</h2>

              <div className="flex flex-wrap gap-2 items-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={retryFailed.isPending || totalFailed === 0}
                  onClick={() => retryFailed.mutate()}
                >
                  {retryFailed.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <RefreshCw className="w-3.5 h-3.5" />}
                  Återförsök misslyckade
                  {totalFailed > 0 && (
                    <span className="ml-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[10px] font-bold px-1.5 rounded-full">
                      {totalFailed}
                    </span>
                  )}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={countsLoading}
                  onClick={() => {
                    void queryClient.invalidateQueries({ queryKey: fortnoxKeys.counts(orgId) });
                    void queryClient.invalidateQueries({ queryKey: fortnoxKeys.lineage(orgId) });
                    toast({ title: 'Synkstatus uppdaterad' });
                  }}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Uppdatera status
                </Button>

                {(totalPending > 0 || totalFailed > 0) && (
                  <p className="text-xs text-muted-foreground">
                    {totalPending > 0 && `${totalPending} väntande`}
                    {totalPending > 0 && totalFailed > 0 && ' · '}
                    {totalFailed  > 0 && `${totalFailed} misslyckade`}
                  </p>
                )}

                {totalPending === 0 && totalFailed === 0 && !countsLoading && (
                  <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Allt synkroniserat
                  </div>
                )}
              </div>
            </section>

            {/* ── Senaste exportkörningar ─────────────────────────────── */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Senaste exportkörningar</h2>

              <div className="bg-card border border-border rounded-lg overflow-hidden">
                {lineageLoading ? (
                  <div className="p-4 space-y-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : !lineageData || lineageData.length === 0 ? (
                  <div className="py-10 text-center space-y-2">
                    <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                    <p className="text-sm text-muted-foreground">Inga exportkörningar hittades.</p>
                    <p className="text-xs text-muted-foreground">Exportkörningar visas här när synkronisering mot Fortnox har körts.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[500px]">
                      <thead>
                        <tr className="border-b border-border bg-muted/20">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tidpunkt</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Batch-ID</th>
                          <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Totalt</th>
                          <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Synkade</th>
                          <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Misslyckade</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineageData.map((row) => {
                          const cfg = SYNC_STATUS_CONFIG[row.sync_status] ?? SYNC_STATUS_CONFIG['skipped']!;
                          return (
                            <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors">
                              <td className="px-4 py-2.5">
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {fmtDateTime(row.exported_at ?? row.created_at)}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="text-xs font-mono text-foreground">
                                  {row.fortnox_batch_id
                                    ? row.fortnox_batch_id.slice(0, 12) + '…'
                                    : <span className="text-muted-foreground/50">—</span>
                                  }
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-center text-xs tabular-nums">{row.entries_total}</td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={cn('text-xs tabular-nums font-medium', row.entries_synced > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground')}>
                                  {row.entries_synced}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={cn('text-xs tabular-nums font-medium', row.entries_failed > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
                                  {row.entries_failed}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="space-y-0.5">
                                  <span className={cn('inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border', cfg.className)}>
                                    {cfg.label}
                                  </span>
                                  {row.sync_error && (
                                    <p className="text-[10px] text-red-500 dark:text-red-400 max-w-[180px] truncate" title={row.sync_error}>
                                      {row.sync_error}
                                    </p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

          </div>
        </PermissionGate>
        </SubscriptionGate>
      </PageContent>
    </PageLayout>
  );
}
