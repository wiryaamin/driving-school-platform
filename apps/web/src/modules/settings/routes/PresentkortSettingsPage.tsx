import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Gift } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, toast } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

export function PresentkortSettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const [months, setMonths] = useState(24);

  const { data: orgSettings } = useQuery<Record<string, unknown> | null>({
    queryKey: ['org-settings-gift-cards', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase.from('organizations').select('settings').eq('id', orgId).single();
      return ((data as unknown as { settings: Record<string, unknown> } | null)?.settings) ?? null;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!orgSettings) return;
    const s = (orgSettings['gift_cards'] as Record<string, unknown> | undefined) ?? {};
    if (typeof s['validity_months'] === 'number') setMonths(s['validity_months']);
  }, [orgSettings]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      await supabase.from('organizations').update({
        settings: { ...(orgSettings ?? {}), gift_cards: { validity_months: months } },
      } as never).eq('id', orgId);
    },
    onSuccess: () => {
      toast({ title: 'Sparat', description: 'Presentkortsinställningarna har sparats.' });
      void qc.invalidateQueries({ queryKey: ['org-settings-gift-cards', orgId] });
    },
    onError: () => toast({ title: 'Fel vid sparning', variant: 'destructive' }),
  });

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/finance/accounts" className="hover:text-foreground">Ekonomi</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Presentkort</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-green-100 text-green-600 flex items-center justify-center">
          <Gift className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Presentkort</h1>
        <p className="text-sm text-muted-foreground">Hantera inställningar för presentkort.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Giltighetstid</h2>
          <p className="text-xs text-primary mt-0.5">
            Ange hur lång giltighetstid ni önskar att presentkort ska ha när de genereras. Siffran ska anges i månader.
          </p>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Presentkort skapas idag endast via CSV-import med giltighetstid angiven per kort — det finns ingen
            försäljningsflöde för nya presentkort som skulle använda detta standardvärde än.
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Antal månader</label>
          <input
            type="number"
            min={1}
            max={120}
            value={months}
            onChange={e => setMonths(Number(e.target.value))}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="bg-green-500 hover:bg-green-600 text-white">
            {saveMut.isPending ? 'Sparar…' : 'Spara inställningar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
