import { useState, useMemo, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  Gift, BookOpen, Search, User, X, Plus, Minus,
  Banknote, CreditCard, Wallet, ShoppingBag, Info,
} from 'lucide-react';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { Button, Skeleton, toast } from '@platform/ui';
import { useLessonTypes } from '../../scheduling/hooks/useLessonTypes.js';
import { useStudentList } from '../../students/hooks/useStudents.js';
import { useCreateInvoice, useAddInvoiceLine, useIssueInvoice, useRecordPayment } from '../hooks/useFinance.js';
import type { PaymentMethod } from '../hooks/useFinance.js';
import { cn } from '@/lib/utils.js';

// ─── Local types ──────────────────────────────────────────────────────────────

type KassaPM = 'visa' | 'swish' | 'kontanter' | 'presentkort' | 'bankgiro' | 'plusgiro' | 'elevsaldo';

interface CartItem {
  id:           string;
  name:         string;
  priceInclVat: number;
  qty:          number;
}

interface CustomerRef {
  id:         string;
  first_name: string;
  last_name:  string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Swedish 25% VAT: VAT portion of a gross price = gross * (0.25 / 1.25) = gross * 0.20
const VAT_DIVISOR = 1.25;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSEK(amount: number): string {
  return amount.toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' kr';
}

// ─── Payment method mapping ───────────────────────────────────────────────────

function toApiMethod(pm: KassaPM): PaymentMethod {
  switch (pm) {
    case 'visa':        return 'card';
    case 'swish':       return 'swish';
    case 'kontanter':   return 'manual';
    case 'presentkort': return 'manual';
    case 'bankgiro':    return 'bank_transfer';
    case 'plusgiro':    return 'bank_transfer';
    case 'elevsaldo':   return 'invoice_credit';
  }
}

// ─── KassaPage ────────────────────────────────────────────────────────────────

export function KassaPage() {
  const [customer,      setCustomer]      = useState<CustomerRef | null>(null);
  const [isGuest,       setIsGuest]       = useState(false);
  const [cart,          setCart]          = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<KassaPM | null>(null);
  const [search,        setSearch]        = useState('');
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [isSaving,      setIsSaving]      = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const createInvoice = useCreateInvoice();
  const addLine       = useAddInvoiceLine();
  const issueInvoice  = useIssueInvoice();
  const recordPayment = useRecordPayment();

  const { data: lessonTypes = [], isLoading: ltLoading } = useLessonTypes();
  const { data: studentsData } = useStudentList(
    { search, per_page: 10 },
    { enabled: search.length >= 2 }
  );
  const students = studentsData?.data ?? [];

  // Close customer dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Cart totals ─────────────────────────────────────────────────────────────
  const totalInclVat = useMemo(
    () => cart.reduce((sum, item) => sum + item.priceInclVat * item.qty, 0),
    [cart]
  );
  const vatAmount  = totalInclVat - totalInclVat / VAT_DIVISOR;
  const paidAmount = paymentMethod !== null && totalInclVat > 0 ? totalInclVat : 0;
  const remaining  = totalInclVat - paidAmount;

  // ── Cart mutations ──────────────────────────────────────────────────────────
  function addToCart(product: { id: string; name: string; price: number }) {
    if (product.price === 0) {
      toast({ title: 'Artikeln saknar pris', description: 'Konfigurera priset i lektionsinställningarna.', variant: 'destructive' });
      return;
    }
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { id: product.id, name: product.name, priceInclVat: product.price, qty: 1 }];
    });
  }

  function removeFromCart(id: string) {
    setCart(prev => prev.filter(i => i.id !== id));
  }

  function changeQty(id: string, delta: number) {
    setCart(prev =>
      prev.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
    );
  }

  // ── Customer selection ──────────────────────────────────────────────────────
  function handleSelectCustomer(s: CustomerRef) {
    setCustomer(s);
    setIsGuest(false);
    setSearch('');
    setShowDropdown(false);
  }

  function handleGuestPurchase() {
    setIsGuest(true);
    setCustomer(null);
    // elevsaldo requires a student account — clear it if selected
    if (paymentMethod === 'elevsaldo') setPaymentMethod(null);
  }

  function handleReset() {
    setCart([]);
    setCustomer(null);
    setIsGuest(false);
    setPaymentMethod(null);
    setSearch('');
  }

  async function handleSave() {
    if (!customer && !isGuest) {
      toast({ title: 'Välj en kund eller välj Gästköp', variant: 'destructive' });
      return;
    }
    if (cart.length === 0) {
      toast({ title: 'Inga artiklar tillagda', variant: 'destructive' });
      return;
    }
    if (!paymentMethod) {
      toast({ title: 'Välj ett betalningsmedel', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      // 1. Create draft invoice (student_id null for guest purchases)
      const invoice = await createInvoice.mutateAsync(
        customer
          ? { student_id: customer.id }
          : { is_guest: true },
      );

      // 2. Add one line per cart item (prices are incl. 25% VAT)
      const VAT_RATE = 0.25;
      for (const item of cart) {
        await addLine.mutateAsync({
          invoiceId:   invoice.id,
          description: item.name,
          quantity:    item.qty,
          unit_price:  item.priceInclVat / (1 + VAT_RATE),
          vat_rate:    VAT_RATE,
        });
      }

      // 3. Issue (assigns invoice number)
      await issueInvoice.mutateAsync(invoice.id);

      // 4. Record the payment
      await recordPayment.mutateAsync({
        invoice_id:     invoice.id,
        amount:         totalInclVat,
        payment_method: toApiMethod(paymentMethod),
      });

      toast({
        title:       'Kontantfaktura sparad',
        description: `Betalning mottagen: ${fmtSEK(totalInclVat)}`,
      });
      handleReset();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Försök igen';
      toast({ title: 'Betalning misslyckades', description: msg, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }

  const canSave = (customer !== null || isGuest) && cart.length > 0 && paymentMethod !== null && !isSaving;

  function togglePM(id: KassaPM) {
    setPaymentMethod(prev => prev === id ? null : id);
  }

  return (
    <PermissionGate allOf={[Permissions.FINANCE_INVOICE_CREATE, Permissions.FINANCE_PAYMENT_CREATE]}>
    <PageLayout>
      <PageHeader title="Kassa" breadcrumbs={[{ label: 'Kassa' }]} />

      <div className="grid grid-cols-1 lg:grid-cols-[288px_1fr] gap-4">

        {/* ── LEFT PANEL: Customer + Products ────────────────────────────────── */}
        <div className="flex flex-col gap-3">

          {/* Customer section */}
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Kund</p>

            {customer !== null ? (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 border border-primary/20">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <User className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground flex-1 truncate">
                  {customer.first_name} {customer.last_name}
                </span>
                <button onClick={() => setCustomer(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : isGuest ? (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/40">
                <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <span className="text-sm font-medium text-amber-700 dark:text-amber-400 flex-1">Gästköp</span>
                <button onClick={() => setIsGuest(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="space-y-2" ref={dropdownRef}>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Sök efter kund..."
                    value={search}
                    onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
                    onFocus={() => search.length >= 2 && setShowDropdown(true)}
                    className="w-full h-9 pl-8 pr-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  {showDropdown && students.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-52 overflow-y-auto">
                      {students.map(s => (
                        <button
                          key={s.id}
                          onMouseDown={() => handleSelectCustomer(s)}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-accent text-left border-b border-border/60 last:border-0"
                        >
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="w-3 h-3 text-primary" />
                          </div>
                          <span className="font-medium text-foreground truncate">
                            {s.first_name} {s.last_name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleGuestPurchase}
                    className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-lg border border-border bg-background hover:bg-accent hover:border-border/80 transition-colors"
                  >
                    <ShoppingBag className="w-5 h-5 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground">Gästköp</span>
                  </button>
                  <button
                    className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-lg border border-border bg-background opacity-40 cursor-not-allowed"
                    disabled
                    title="Kommer snart"
                  >
                    <CreditCard className="w-5 h-5 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground">Kundkort</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Product catalog */}
          <div className="rounded-xl border border-border bg-card p-3 flex-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Artiklar</p>

            {/* Presentkort — fixed 500 kr default; price editable in a future iteration */}
            <button
              onClick={() => addToCart({ id: 'gift_card', name: 'Presentkort', price: 500 })}
              className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-colors mb-2 text-left group"
            >
              <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                <Gift className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Presentkort</p>
                <p className="text-xs text-muted-foreground">Valfri summa</p>
              </div>
            </button>

            {/* Lesson types */}
            {ltLoading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
              </div>
            ) : lessonTypes.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Inga lektionstyper hittades</p>
            ) : (
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
                {lessonTypes.map(lt => (
                  <button
                    key={lt.id}
                    onClick={() => addToCart({ id: lt.id, name: lt.name, price: lt.pricing_sek ?? 0 })}
                    disabled={!lt.pricing_sek}
                    className={cn(
                      'w-full flex items-center gap-3 p-2.5 rounded-lg border transition-colors text-left group',
                      lt.pricing_sek
                        ? 'border-border hover:border-primary/40 hover:bg-accent/50'
                        : 'border-border opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div
                      className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${lt.color_hex}22` }}
                    >
                      <BookOpen className="w-5 h-5" style={{ color: lt.color_hex }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{lt.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {lt.pricing_sek
                          ? `${lt.pricing_sek.toLocaleString('sv-SE')} kr`
                          : 'Pris saknas'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: Payment + Order + Totals ──────────────────────────── */}
        <div className="flex flex-col gap-3">

          {/* Payment method grid */}
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Välj betalningsmedel</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              <PMCard selected={paymentMethod === 'visa'}        onSelect={() => togglePM('visa')}>
                <div className="flex items-center gap-0.5">
                  <span className="text-blue-700 font-black text-sm tracking-tight">VISA</span>
                  <span className="text-xs leading-none font-bold">
                    <span className="text-red-500">●</span>
                    <span className="text-yellow-400">●</span>
                  </span>
                </div>
              </PMCard>

              <PMCard selected={paymentMethod === 'swish'}       onSelect={() => togglePM('swish')}>
                <span className="font-bold text-sm" style={{ color: '#4B2C8E' }}>swish</span>
              </PMCard>

              <PMCard selected={paymentMethod === 'kontanter'}   onSelect={() => togglePM('kontanter')}>
                <Banknote className="w-5 h-5 text-green-600" />
                <span className="text-[10px] text-muted-foreground">Kontanter</span>
              </PMCard>

              <PMCard selected={paymentMethod === 'presentkort'} onSelect={() => togglePM('presentkort')}>
                <Gift className="w-5 h-5 text-pink-500" />
                <span className="text-[10px] text-muted-foreground">Presentkort</span>
              </PMCard>

              <PMCard selected={paymentMethod === 'bankgiro'}    onSelect={() => togglePM('bankgiro')}>
                <span className="font-bold text-sm text-red-600 leading-none">bank</span>
                <span className="font-bold text-[10px] text-red-400 leading-none">giro</span>
              </PMCard>

              <PMCard selected={paymentMethod === 'plusgiro'}    onSelect={() => togglePM('plusgiro')} dimmed>
                <Wallet className="w-5 h-5 text-orange-400" />
                <span className="text-[10px] text-muted-foreground">Plusgiro</span>
              </PMCard>

              <PMCard
                selected={paymentMethod === 'elevsaldo'}
                onSelect={() => !isGuest && togglePM('elevsaldo')}
                dimmed={isGuest || paymentMethod !== 'elevsaldo'}
                title={isGuest ? 'Elevsaldo kräver registrerad elev' : undefined}
              >
                <CreditCard className="w-5 h-5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Elevsaldo</span>
              </PMCard>
            </div>
          </div>

          {/* Order lines + Totals */}
          <div className="rounded-xl border border-border bg-card flex-1 overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_224px]">

              {/* Order lines */}
              <div className="p-4 border-b border-border md:border-b-0 md:border-r flex flex-col min-h-[280px]">
                {/* Customer indicator */}
                <div className="mb-3 h-6 flex items-center">
                  {customer !== null ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                      <User className="w-3 h-3" />
                      {customer.first_name} {customer.last_name}
                    </span>
                  ) : isGuest ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-2.5 py-1 rounded-full">
                      <ShoppingBag className="w-3 h-3" />
                      Gästköp
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70">
                      <Info className="w-3 h-3" />
                      Välj en kund för att fortsätta
                    </span>
                  )}
                </div>

                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Artikelrader</p>

                <div className="flex-1 overflow-y-auto">
                  {cart.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Inga artiklar tillagda</p>
                  ) : (
                    <div className="space-y-1">
                      {cart.map(item => (
                        <div key={item.id} className="flex items-center gap-2 py-2 border-b border-border/60 last:border-0">
                          <span className="text-sm font-medium text-foreground flex-1 min-w-0 truncate">{item.name}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => changeQty(item.id, -1)}
                              className="w-6 h-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-sm font-medium w-5 text-center tabular-nums">{item.qty}</span>
                            <button
                              onClick={() => changeQty(item.id, 1)}
                              className="w-6 h-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <span className="text-sm font-semibold text-foreground w-20 text-right shrink-0 tabular-nums">
                            {(item.priceInclVat * item.qty).toLocaleString('sv-SE')} kr
                          </span>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="text-muted-foreground hover:text-destructive shrink-0"
                            aria-label="Ta bort artikel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {paymentMethod !== null && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Betalningsmedel</p>
                    <span className="inline-flex items-center text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full capitalize">
                      {paymentMethod}
                    </span>
                  </div>
                )}
              </div>

              {/* Totals + Actions */}
              <div className="p-4 flex flex-col gap-5">
                <div className="space-y-2.5">
                  <TRow label="Summa försäljning" value={fmtSEK(totalInclVat)} bold />
                  <TRow label="Varav moms (25%)"  value={fmtSEK(vatAmount)}    muted />
                  <div className="pt-2.5 border-t border-border space-y-2">
                    <TRow label="Summa betalningar" value={fmtSEK(paidAmount)} />
                    <TRow
                      label="Kvar att betala"
                      value={fmtSEK(remaining)}
                      bold
                      accent={remaining > 0 && cart.length > 0}
                    />
                  </div>
                </div>

                <div className="mt-auto space-y-2">
                  <Button
                    className="w-full"
                    disabled={!canSave}
                    onClick={() => { void handleSave(); }}
                  >
                    {isSaving ? 'Registrerar...' : 'Spara kontantfaktura'}
                  </Button>
                  {!customer && !isGuest && (
                    <p className="text-xs text-muted-foreground text-center">
                      Välj en kund eller Gästköp för att fortsätta
                    </p>
                  )}
                  <Button variant="outline" className="w-full" onClick={handleReset} disabled={isSaving}>
                    Avbryt
                  </Button>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </PageLayout>
    </PermissionGate>
  );
}

// ─── PMCard ───────────────────────────────────────────────────────────────────

function PMCard({
  selected,
  onSelect,
  dimmed = false,
  title,
  children,
}: {
  selected:  boolean;
  onSelect:  () => void;
  dimmed?:   boolean | undefined;
  title?:    string | undefined;
  children:  ReactNode;
}) {
  return (
    <button
      onClick={onSelect}
      title={title}
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 p-2.5 rounded-lg border-2 min-h-[60px] transition-colors',
        selected
          ? 'border-primary bg-primary/10'
          : 'border-border bg-background hover:border-primary/40 hover:bg-accent/40',
        dimmed && !selected && 'opacity-50'
      )}
    >
      {children}
    </button>
  );
}

// ─── TRow (total row) ─────────────────────────────────────────────────────────

function TRow({
  label,
  value,
  bold,
  muted,
  accent,
}: {
  label:   string;
  value:   string;
  bold?:   boolean;
  muted?:  boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={cn('text-sm', muted ? 'text-muted-foreground' : 'text-foreground')}>
        {label}
      </span>
      <span className={cn(
        'text-sm tabular-nums',
        bold   && 'font-bold',
        accent && 'text-primary font-bold',
        muted  && 'text-muted-foreground',
      )}>
        {value}
      </span>
    </div>
  );
}
