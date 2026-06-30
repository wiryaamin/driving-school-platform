import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@core/api/supabase.js';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { Button, toast } from '@platform/ui';

// ─── Code generator ───────────────────────────────────────────────────────────

function generateGiftCardCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

interface ImportInput {
  code:             string;
  original_value:   number;
  expires_at:       string | null;
  legacy_reference: string | null;
}

async function importGiftCard(input: ImportInput): Promise<void> {
  const { data: orgData, error: orgError } = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
    .is('removed_at', null)
    .limit(1)
    .single();

  if (orgError || !orgData) throw new Error('Kunde inte hitta organisation');
  const typedOrg = orgData as unknown as { organization_id: string };

  const { error } = await supabase.from('gift_cards').insert({
    organization_id:     typedOrg.organization_id,
    code:                input.code,
    original_value_sek:  input.original_value,
    remaining_value_sek: input.original_value,
    expires_at:          input.expires_at,
    status:              'active',
    is_legacy_import:    true,
    legacy_reference:    input.legacy_reference || null,
  } as never);
  if (error) throw new Error(error.message);
}

// ─── ImporteraPresentkortPage ─────────────────────────────────────────────────

export function ImporteraPresentkortPage() {
  const navigate = useNavigate();
  const qc       = useQueryClient();

  // One year from today as default expiry
  const defaultExpiry = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const [value,     setValue]     = useState('');
  const [expiresAt, setExpiresAt] = useState(defaultExpiry);
  const [reference, setReference] = useState('');

  const importMut = useMutation({
    mutationFn: (input: ImportInput) => importGiftCard(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gift-cards'] });
      toast({ title: 'Presentkort registrerat utan verifikat' });
      navigate('/finance/gift-cards');
    },
    onError: (err: Error) => {
      toast({ title: 'Misslyckades', description: err.message, variant: 'destructive' });
    },
  });

  const numValue = parseFloat(value.replace(',', '.'));
  const isValid  = !isNaN(numValue) && numValue > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    importMut.mutate({
      code:             generateGiftCardCode(),
      original_value:   numValue,
      expires_at:       expiresAt || null,
      legacy_reference: reference.trim() || null,
    });
  }

  return (
    <PageLayout>
      <PageHeader
        title="Presentkort"
        breadcrumbs={[
          { label: 'Presentkort', href: '/finance/gift-cards' },
          { label: 'Importera presentkort utan verifikat' },
        ]}
      />

      <div className="max-w-2xl">
        {/* Warning banner */}
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-5 py-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-destructive">
                OBS! Detta presentkort kommer inte att skapa några verifikat! Använd varsamt!
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Använd endast för att migrera presentkort från tidigare system.
                Övriga presentkort bör ALLTID skapas genom kassan eller e-handeln.
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Value */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">
                Presentkortets värde i svenska kronor (SEK)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="500"
                className="h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                required
              />
            </div>

            {/* Expiry */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Utgångsdatum</label>
              <input
                type="date"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className="h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Legacy reference */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">
                Referens i tidigare system <span className="text-muted-foreground font-normal">(endast för överblick)</span>
              </label>
              <input
                type="text"
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="Valfri referens"
                className="h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/finance/gift-cards')}
              disabled={importMut.isPending}
            >
              Avbryt
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!isValid || importMut.isPending}
            >
              {importMut.isPending ? 'Sparar…' : 'Spara utan verifikat'}
            </Button>
          </div>
        </form>
      </div>
    </PageLayout>
  );
}
