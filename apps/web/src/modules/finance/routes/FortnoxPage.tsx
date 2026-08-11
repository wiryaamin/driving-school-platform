import { useState } from 'react';
import {
  RefreshCw, AlertTriangle,
  Loader2, Link2, LogOut, Wifi, WifiOff, Info,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { Button, Skeleton, toast } from '@platform/ui';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { SubscriptionGate } from '@core/rbac/SubscriptionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { cn } from '@/lib/utils.js';
import { fortnoxKeys, useFortnoxStatus } from '../hooks/useFortnoxStatus.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Edge Function helpers ────────────────────────────────────────────────────

async function invoke<T>(fn: string, opts?: Parameters<typeof supabase.functions.invoke>[1]): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(fn, opts);
  if (error) throw error;
  if (!data) throw new Error('Tom respons från server');
  return data;
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
              Fortnox-anslutningen är aktiv
            </span>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-muted/40 border border-border px-3 py-2 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p>Bokföringssynkronisering är inte tillgänglig ännu. Kund-, faktura- och betalningsdata överförs för närvarande inte till Fortnox.</p>
          </div>

          {s.method === 'oauth' && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">Anslutningsmetod</p>
                <p className="text-foreground font-medium">OAuth 2.0</p>
              </div>
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
            {s.method === 'oauth' && (
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
          <div className="flex items-start gap-2 rounded-lg bg-muted/40 border border-border px-3 py-2 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p>Bokföringssynkronisering är inte tillgänglig ännu, oavsett anslutningsstatus.</p>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FortnoxPage() {
  const { organization } = useSession();
  const orgId            = organization?.id ?? '';

  return (
    <PageLayout>
      <PageHeader title="Fortnox" description="Anslutning till ert eget Fortnox-konto" />
      <PageContent>
        <SubscriptionGate feature="finance:fortnox:sync">
        <PermissionGate permission={Permissions.FINANCE_FORTNOX_MANAGE}>

          <div className="max-w-3xl space-y-6">
            <FortnoxConnectionSection orgId={orgId} />
          </div>

        </PermissionGate>
        </SubscriptionGate>
      </PageContent>
    </PageLayout>
  );
}
