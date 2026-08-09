import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Image as ImageIcon, Upload } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, toast } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { useOrgBrandingAssets, useUploadOrgBrandingAsset } from '@shared/hooks/useOrgBranding.js';

// ─── Audit finding ─────────────────────────────────────────────────────────────
//
// This page saved 16 fields to organizations.settings.kassa, a JSONB blob with
// zero consumers. Checked for a real underlying system for each:
//   - Fakturalogotyp: real (org-branding storage) — unchanged.
//   - pay_terms_days: invoices.due_date is a real column, and CreateInvoiceSheet
//     (finance/components/CreateInvoiceSheet.tsx) has a real due_date input that
//     was always blank with no default. Wired: it now prefills from this
//     setting. Kept as the one interactive control on this page.
//   - Everything else has no backend anywhere: no PDF/receipt document is ever
//     generated in this codebase (kvittotext + the 9 text_* invoice-type
//     defaults have nowhere to render), no fee line-item mechanism exists on
//     invoice creation (swish_fee/billecta_fee), Billecta/Kivra is not an
//     integration that exists in this codebase at all (kivra), no automatic
//     invoice-on-purchase trigger exists (auto_kontantfaktura), no scheduled
//     job runs a daily debit (auto_debitering — the description attributes
//     this to "Teoricentralen", an external system this codebase does not
//     control), and public-catalog has no guest-checkout concept (gastkop).
// Removed the fake toggles/text areas for all of those rather than leaving
// controls that silently saved to nothing.

function NotBuilt({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export function KassaSettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const [payTermsDays, setPayTermsDays] = useState(10);

  const { data: orgSettings } = useQuery<Record<string, unknown> | null>({
    queryKey: ['org-settings-kassa', orgId],
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
    const s = (orgSettings['kassa'] as Record<string, unknown> | undefined) ?? {};
    if (typeof s['pay_terms_days'] === 'number') setPayTermsDays(s['pay_terms_days']);
  }, [orgSettings]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const existingKassa = (orgSettings?.['kassa'] as Record<string, unknown> | undefined) ?? {};
      await supabase.from('organizations').update({
        settings: {
          ...(orgSettings ?? {}),
          kassa: { ...existingKassa, pay_terms_days: payTermsDays },
        },
      } as never).eq('id', orgId);
    },
    onSuccess: () => {
      toast({ title: 'Sparat', description: 'Kassainställningarna har sparats.' });
      void qc.invalidateQueries({ queryKey: ['org-settings-kassa', orgId] });
    },
    onError: () => toast({ title: 'Fel vid sparning', variant: 'destructive' }),
  });

  const save = () => saveMut.mutate();
  const isPending = saveMut.isPending;

  const { data: brandingAssets } = useOrgBrandingAssets();
  const uploadLogo = useUploadOrgBrandingAsset();
  const invoiceLogoUrl = brandingAssets?.['invoice_logo'];

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadLogo.mutate(
      { assetKey: 'invoice_logo', file },
      {
        onSuccess: () => toast({ title: 'Fakturalogotyp sparades' }),
        onError: () => toast({ title: 'Fel vid uppladdning', variant: 'destructive' }),
      },
    );
    e.target.value = '';
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/finance/accounts" className="hover:text-foreground">Ekonomi</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Kassa</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-green-100 text-green-600 flex items-center justify-center"><span className="text-2xl">💳</span></div>
        <h1 className="text-lg font-semibold text-foreground">Kassa</h1>
        <p className="text-sm text-muted-foreground">Hantera kassainställningar, fakturor och betalningar.</p>
      </div>

      {/* Fakturalogotyp — real, unchanged */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Fakturalogotyp</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Ladda upp din egen logotyp för att visas på dina fakturor.</p>
        </div>
        <div className="w-16 h-16 rounded-md border border-border bg-muted flex items-center justify-center overflow-hidden">
          {invoiceLogoUrl
            ? <img src={invoiceLogoUrl} alt="Fakturalogotyp" className="w-full h-full object-contain" />
            : <ImageIcon className="w-8 h-8 text-muted-foreground/40" />}
        </div>
        <label className="border-2 border-dashed border-border rounded-lg py-8 flex flex-col items-center gap-2 text-muted-foreground cursor-pointer hover:bg-accent/20 transition-colors">
          <input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={handleLogoFile} disabled={uploadLogo.isPending} />
          <Upload className="w-6 h-6" />
          <p className="text-sm">{uploadLogo.isPending ? 'Laddar upp…' : 'Klicka för att ladda upp logotyp'}</p>
          <p className="text-xs">Maximal filstorlek att ladda upp är 5 megabyte.</p>
        </label>
      </div>

      {/* Standard förfallodatum — real, wired to CreateInvoiceSheet's due_date prefill */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Standard förfallodatum</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Antal dagar efter fakturadatum som förfallodatum föreslås när du skapar en ny faktura. Kan alltid ändras per faktura.</p>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Betalningsvillkor (dagar)</label>
          <input type="number" value={payTermsDays} onChange={e => setPayTermsDays(Number(e.target.value))} min={0} max={365} className="w-28 h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={isPending} className="bg-green-500 hover:bg-green-600 text-white">
            {isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </div>
      </div>

      <NotBuilt
        title="Kontantfakturor"
        description="Automatiskt utskick av kontantfakturor efter köp är inte implementerat ännu — ingen händelse skapar automatiskt en faktura vid köp idag."
      />

      <NotBuilt
        title="Gästköp i kassan"
        description="Gästköp (köp utan elevkonto) är inte implementerat ännu i kassaflödet."
      />

      <NotBuilt
        title="Kvittotext"
        description="Anpassad text på kvitton/kreditkvitton är inte implementerad ännu — det finns inget kvitto- eller PDF-dokument som genereras för fakturor i plattformen idag."
      />

      <NotBuilt
        title="Automatisk debitering"
        description="Daglig automatisk debitering av bokningar mot lektionssaldo (via Teoricentralen) är inte implementerad ännu — ingen schemalagd process i plattformen utför detta idag."
      />

      <NotBuilt
        title="Faktureringsavgift"
        description="En automatisk faktureringsavgift per betalsätt (Swish/Billecta) är inte implementerad ännu — fakturaskapandet har idag inget avgifts-radkoncept, och Billecta är ingen befintlig integration i plattformen."
      />

      <NotBuilt
        title="Billecta / Kivra"
        description="Billecta och Kivra som leveransalternativ för fakturor är inte implementerade ännu — ingen sådan integration finns i plattformen idag."
      />

      <NotBuilt
        title="Standardtext på faktura, kreditfaktura m.m."
        description="Förifyllda standardtexter per fakturatyp (Swish, Billecta, påminnelse, inkasso, kreditfaktura, kontoutdrag, betalningsbekräftelse, a-conto, kontantfaktura) är inte implementerade ännu — det finns inget kvitto- eller fakturadokument som genereras där sådan text skulle visas idag. Fakturaformuläret har ett fritt noteringsfält (Noteringar) som redan sparas per faktura."
      />
    </div>
  );
}
