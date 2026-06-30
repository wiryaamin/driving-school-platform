import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Gift, Ban } from 'lucide-react';
import { supabase } from '@core/api/supabase.js';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { Button, Skeleton, Badge, toast } from '@platform/ui';
import { cn } from '@/lib/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type GiftCardStatus = 'active' | 'used' | 'expired' | 'void';

interface GiftCard {
  id:                  string;
  organization_id:     string;
  code:                string;
  original_value_sek:  number;
  remaining_value_sek: number;
  expires_at:          string | null;
  status:              GiftCardStatus;
  is_legacy_import:    boolean;
  legacy_reference:    string | null;
  created_at:          string;
}

// ─── Query ────────────────────────────────────────────────────────────────────

const GIFT_CARDS_KEY = ['gift-cards'] as const;

async function fetchGiftCards(): Promise<GiftCard[]> {
  const { data, error } = await supabase
    .from('gift_cards')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GiftCard[];
}

async function voidGiftCard(id: string): Promise<void> {
  const { error } = await supabase
    .from('gift_cards')
    .update({ status: 'void', voided_at: new Date().toISOString() } as never)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const SEK      = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 });
const DATE_FMT = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });

function fmtSek(n: number) { return SEK.format(n); }
function fmtDate(iso: string | null | undefined) {
  if (!iso) return '–';
  try { return DATE_FMT.format(new Date(iso)); } catch { return iso; }
}

const STATUS_CONFIG: Record<GiftCardStatus, { label: string; className: string }> = {
  active:  { label: 'Aktiv',     className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-transparent' },
  used:    { label: 'Använt',    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-transparent' },
  expired: { label: 'Utgånget',  className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-transparent' },
  void:    { label: 'Makulerat', className: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 border-transparent line-through' },
};

function StatusBadge({ status }: { status: GiftCardStatus }) {
  const cfg = STATUS_CONFIG[status];
  return <Badge variant="default" className={cfg.className}>{cfg.label}</Badge>;
}

// ─── PresentkortPage ──────────────────────────────────────────────────────────

export function PresentkortPage() {
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const [search, setSearch] = useState('');
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const { data: cards = [], isLoading } = useQuery({
    queryKey: GIFT_CARDS_KEY,
    queryFn:  fetchGiftCards,
    staleTime: 2 * 60_000,
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => voidGiftCard(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: GIFT_CARDS_KEY });
      toast({ title: 'Presentkort makulerat' });
      setVoidingId(null);
    },
    onError: (err: Error) => {
      toast({ title: 'Kunde inte makulera', description: err.message, variant: 'destructive' });
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return cards;
    const q = search.trim().toLowerCase();
    return cards.filter(c =>
      c.code.toLowerCase().includes(q) ||
      (c.legacy_reference ?? '').toLowerCase().includes(q)
    );
  }, [cards, search]);

  return (
    <PageLayout>
      <PageHeader
        title="Presentkort"
        breadcrumbs={[{ label: 'Presentkort' }]}
        actions={
          <Button
            variant="destructive"
            size="sm"
            onClick={() => navigate('/finance/gift-cards/import')}
          >
            <Gift className="w-4 h-4 mr-1.5" />
            Registrera presentkort utan verifikat
          </Button>
        }
      />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Sök efter kod"
          className="w-full h-9 pl-8 pr-3 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kod</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ursprungligt värde</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Återstående värde</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Skapat</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide" style={{ color: '#2563EB' }}>Utgångsdatum</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="flex flex-col items-center gap-2 py-14 text-center">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <Gift className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {search ? 'Inga presentkort matchar sökningen.' : 'Du har inte skapat några presentkort än.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(card => {
                  const usedPct = card.original_value_sek > 0
                    ? Math.round(((card.original_value_sek - card.remaining_value_sek) / card.original_value_sek) * 100)
                    : 0;
                  const isExpired = card.expires_at && new Date(card.expires_at) < new Date();
                  return (
                    <tr key={card.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      {/* Kod */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-semibold tracking-widest text-foreground">
                          {card.code}
                        </span>
                        {card.is_legacy_import && (
                          <span className="ml-2 text-[10px] text-muted-foreground/60 italic">import</span>
                        )}
                      </td>
                      {/* Ursprungligt värde */}
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {fmtSek(card.original_value_sek)}
                      </td>
                      {/* Återstående värde */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn(
                            'tabular-nums font-semibold',
                            card.remaining_value_sek === 0 ? 'text-muted-foreground' : 'text-foreground'
                          )}>
                            {fmtSek(card.remaining_value_sek)}
                          </span>
                          {usedPct > 0 && (
                            <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${usedPct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      {/* Skapat */}
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {fmtDate(card.created_at)}
                      </td>
                      {/* Utgångsdatum */}
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <span className={cn(isExpired && 'text-destructive font-medium')}>
                          {fmtDate(card.expires_at)}
                        </span>
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={card.status} />
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        {card.status === 'active' && (
                          voidingId === card.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => voidMutation.mutate(card.id)}
                                disabled={voidMutation.isPending}
                                className="text-xs text-destructive hover:underline font-medium"
                              >
                                {voidMutation.isPending ? 'Makulerar…' : 'Bekräfta'}
                              </button>
                              <span className="text-muted-foreground/40">·</span>
                              <button
                                onClick={() => setVoidingId(null)}
                                className="text-xs text-muted-foreground hover:underline"
                              >
                                Avbryt
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setVoidingId(card.id)}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                              title="Makulera presentkort"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              Makulera
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!isLoading && filtered.length > 0 && (
          <div className="border-t border-border px-4 py-3 bg-muted/20 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {filtered.filter(c => c.status === 'active').length} aktiva · {filtered.length} totalt
            </span>
            <span className="text-sm font-semibold text-foreground">
              Aktivt värde: {fmtSek(
                filtered.filter(c => c.status === 'active').reduce((s, c) => s + c.remaining_value_sek, 0)
              )}
            </span>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
