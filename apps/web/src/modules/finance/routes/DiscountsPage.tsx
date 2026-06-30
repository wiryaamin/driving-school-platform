import { useState, useMemo } from 'react';
import {
  Plus, Loader2, AlertCircle, Tag, Copy, Check, ChevronRight,
  X, ToggleLeft, Ticket, RefreshCw,
} from 'lucide-react';
import {
  Button, Input, Label, Textarea, Switch,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Sheet, SheetContent,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Badge, Tabs, TabsList, TabsTrigger,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { formatCurrency, formatDate } from '../lib/financeUtils.js';
import {
  useDiscounts, useDiscountCoupons, useCreateDiscount,
  useDeactivateDiscount, useCreateCoupon,
  type DiscountDefinition, type CouponCode,
  type DiscountType, type DiscountScope,
} from '../hooks/useDiscounts.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SCOPE_LABELS: Record<DiscountScope, string> = {
  all:      'Alla fakturor',
  category: 'Körkortstyp',
  catalog:  'Kurspaket',
  offering: 'Specifikt paket',
};

function isExpired(d: DiscountDefinition): boolean {
  return Boolean(d.valid_to && new Date(d.valid_to) < new Date());
}

function formatDiscountValue(d: DiscountDefinition): string {
  if (d.discount_type === 'percentage') {
    return `${(d.discount_value * 100).toFixed(0)} %`;
  }
  return formatCurrency(d.discount_value, d.currency);
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function DiscountBadge({ d }: { d: DiscountDefinition }) {
  if (!d.is_active)  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Inaktiv</span>;
  if (isExpired(d))  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Utgången</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Aktiv</span>;
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button onClick={handleCopy} className="p-1 rounded hover:bg-muted transition-colors" title="Kopiera">
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
    </button>
  );
}

// ─── Coupon row ───────────────────────────────────────────────────────────────

function CouponRow({ coupon }: { coupon: CouponCode }) {
  const expired = Boolean(coupon.valid_to && new Date(coupon.valid_to) < new Date());
  const exhausted = coupon.redemption_limit_total !== null
    && coupon.redemptions_count >= coupon.redemption_limit_total;

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b last:border-0">
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <code className="text-sm font-mono font-bold tracking-widest">{coupon.code}</code>
          <CopyButton text={coupon.code} />
          {!coupon.is_active && <Badge variant="outline" className="text-xs text-gray-500">Inaktiv</Badge>}
          {expired   && <Badge variant="outline" className="text-xs text-orange-600">Utgången</Badge>}
          {exhausted && <Badge variant="outline" className="text-xs text-red-600">Uttömd</Badge>}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span>{coupon.redemptions_count} inlöst{coupon.redemptions_count !== 1 ? 'a' : ''}</span>
          {coupon.redemption_limit_total !== null && (
            <span>/ {coupon.redemption_limit_total} max totalt</span>
          )}
          {coupon.redemption_limit_per_student !== null && (
            <span>· {coupon.redemption_limit_per_student}/elev</span>
          )}
          {coupon.valid_from && <span>Från {formatDate(coupon.valid_from)}</span>}
          {coupon.valid_to   && <span>Till {formatDate(coupon.valid_to)}</span>}
          {coupon.description && <span className="italic">{coupon.description}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Add coupon dialog ────────────────────────────────────────────────────────

function AddCouponDialog({ discount, onClose }: { discount: DiscountDefinition | null; onClose: () => void }) {
  const createCoupon = useCreateCoupon(discount?.id ?? '');

  const [code,        setCode]        = useState('');
  const [description, setDescription] = useState('');
  const [limitTotal,  setLimitTotal]  = useState('');
  const [limitPerStu, setLimitPerStu] = useState('');
  const [validFrom,   setValidFrom]   = useState('');
  const [validTo,     setValidTo]     = useState('');

  function reset() { setCode(''); setDescription(''); setLimitTotal(''); setLimitPerStu(''); setValidFrom(''); setValidTo(''); }

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const random = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    setCode(random);
  }

  async function handleCreate() {
    if (!code.trim()) { toast({ title: 'Ange en kupongkod', variant: 'destructive' }); return; }
    try {
      await createCoupon.mutateAsync({
        code:                        code.trim().toUpperCase(),
        description:                 description || undefined,
        redemption_limit_total:      limitTotal  ? parseInt(limitTotal, 10)  : undefined,
        redemption_limit_per_student: limitPerStu ? parseInt(limitPerStu, 10) : undefined,
        valid_from:                  validFrom || undefined,
        valid_to:                    validTo   || undefined,
      });
      toast({ title: `Kupongkod ${code.toUpperCase()} skapad` });
      reset(); onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Okänt fel';
      toast({
        title: msg.includes('DUPLICATE') ? 'Kupongkoden finns redan' : 'Fel',
        description: msg.includes('DUPLICATE') ? 'Välj en annan kod.' : msg,
        variant: 'destructive',
      });
    }
  }

  return (
    <Dialog open={Boolean(discount)} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="w-4 h-4" />
            Ny kupongkod
            {discount && <span className="text-sm font-normal text-muted-foreground">· {discount.name}</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Kupongkod <span className="text-destructive">*</span></Label>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="T.ex. SOMMAR24"
                className="font-mono tracking-widest uppercase"
              />
              <Button type="button" variant="outline" size="sm" onClick={generateCode} className="shrink-0">
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                Generera
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Versaler, siffror, bindestreck tillåts. Max 20 tecken.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Beskrivning</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="T.ex. Sommarkampanj 2024" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Max inlösningar totalt</Label>
              <Input type="number" min="1" value={limitTotal} onChange={e => setLimitTotal(e.target.value)} placeholder="Obegränsat" />
            </div>
            <div className="space-y-1.5">
              <Label>Max per elev</Label>
              <Input type="number" min="1" value={limitPerStu} onChange={e => setLimitPerStu(e.target.value)} placeholder="Obegränsat" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Giltig från</Label>
              <Input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Giltig till</Label>
              <Input type="date" value={validTo} onChange={e => setValidTo(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Avbryt</Button>
          <Button onClick={handleCreate} disabled={!code.trim() || createCoupon.isPending}>
            {createCoupon.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Skapa kupong
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Discount detail sheet ────────────────────────────────────────────────────

function DiscountDetailSheet({ discount, onClose }: { discount: DiscountDefinition | null; onClose: () => void }) {
  const { data: coupons = [], isLoading: couponsLoading } = useDiscountCoupons(discount?.id ?? null);
  const deactivate = useDeactivateDiscount();
  const [addCouponOpen, setAddCouponOpen] = useState(false);
  const [confirmDeac, setConfirmDeac]     = useState(false);

  async function handleDeactivate() {
    if (!discount) return;
    try {
      await deactivate.mutateAsync(discount.id);
      toast({ title: `"${discount.name}" inaktiverad` });
      setConfirmDeac(false); onClose();
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  const activeCoupons = coupons.filter(c => c.is_active).length;

  return (
    <>
      <Sheet open={Boolean(discount)} onOpenChange={v => { if (!v) onClose(); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0">
          {discount && (
            <>
              <div className="sticky top-0 z-10 bg-background border-b px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="font-semibold truncate">{discount.name}</p>
                      <DiscountBadge d={discount} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDiscountValue(discount)} · {SCOPE_LABELS[discount.discount_scope]}
                    </p>
                  </div>
                  <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              <div className="px-5 py-5 space-y-6">
                {/* Details grid */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: 'Rabatttyp',    value: discount.discount_type === 'percentage' ? 'Procentrabatt' : 'Fast belopp' },
                    { label: 'Värde',        value: formatDiscountValue(discount)           },
                    { label: 'Tillämpning',  value: SCOPE_LABELS[discount.discount_scope]  },
                    { label: 'Valuta',       value: discount.currency                       },
                    { label: 'Kupongkrävs', value: discount.requires_coupon ? 'Ja' : 'Nej' },
                    ...(discount.max_discount_amount !== null
                      ? [{ label: 'Maxrabatt', value: formatCurrency(discount.max_discount_amount, discount.currency) }]
                      : []),
                    ...(discount.scope_category
                      ? [{ label: 'Kategori', value: discount.scope_category }]
                      : []),
                    ...(discount.valid_from ? [{ label: 'Giltig från', value: formatDate(discount.valid_from) }] : []),
                    ...(discount.valid_to   ? [{ label: 'Giltig till', value: formatDate(discount.valid_to)   }] : []),
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg border bg-muted/20 p-2.5">
                      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                      <p className="font-medium">{value}</p>
                    </div>
                  ))}
                </div>

                {discount.description && (
                  <p className="text-sm text-muted-foreground italic">{discount.description}</p>
                )}

                {/* Coupons section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold">Kupongkoder</p>
                      {coupons.length > 0 && (
                        <p className="text-xs text-muted-foreground">{activeCoupons} aktiv{activeCoupons !== 1 ? 'a' : ''} av {coupons.length}</p>
                      )}
                    </div>
                    <PermissionGate permission={Permissions.FINANCE_COUPON_CREATE}>
                      <Button size="sm" variant="outline" onClick={() => setAddCouponOpen(true)}>
                        <Plus className="w-3.5 h-3.5 mr-1.5" /> Ny kupong
                      </Button>
                    </PermissionGate>
                  </div>

                  <PermissionGate
                    permission={Permissions.FINANCE_COUPON_READ}
                    fallback={<p className="text-sm text-muted-foreground">Du saknar behörighet att se kupongkoder.</p>}
                  >
                    {couponsLoading ? (
                      <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Hämtar…</span>
                      </div>
                    ) : coupons.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        Inga kupongkoder skapade.
                        <PermissionGate permission={Permissions.FINANCE_COUPON_CREATE}>
                          <button onClick={() => setAddCouponOpen(true)} className="block mx-auto mt-2 text-primary hover:underline text-sm">
                            Skapa den första →
                          </button>
                        </PermissionGate>
                      </div>
                    ) : (
                      <div className="rounded-lg border overflow-hidden">
                        {coupons.map(c => <CouponRow key={c.id} coupon={c} />)}
                      </div>
                    )}
                  </PermissionGate>
                </div>

                {/* Danger zone */}
                {discount.is_active && (
                  <PermissionGate permission={Permissions.FINANCE_DISCOUNT_CREATE}>
                    <div className="rounded-lg border border-dashed border-destructive/30 p-4 space-y-2">
                      <p className="text-xs font-semibold text-destructive uppercase tracking-wide">Inaktivera kampanj</p>
                      <p className="text-xs text-muted-foreground">
                        Inaktivering stoppar rabattens användning omedelbart. Befintliga fakturor med rabatten påverkas inte.
                      </p>
                      {confirmDeac ? (
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" onClick={handleDeactivate} disabled={deactivate.isPending}>
                            {deactivate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Bekräfta'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setConfirmDeac(false)}>Avbryt</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:text-destructive" onClick={() => setConfirmDeac(true)}>
                          <ToggleLeft className="w-3.5 h-3.5 mr-1.5" /> Inaktivera
                        </Button>
                      )}
                    </div>
                  </PermissionGate>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AddCouponDialog discount={addCouponOpen ? discount : null} onClose={() => setAddCouponOpen(false)} />
    </>
  );
}

// ─── Create discount sheet ────────────────────────────────────────────────────

function CreateDiscountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createDiscount = useCreateDiscount();

  const [name,           setName]           = useState('');
  const [description,    setDescription]    = useState('');
  const [discountType,   setDiscountType]   = useState<DiscountType>('percentage');
  const [discountValue,  setDiscountValue]  = useState('');
  const [discountScope,  setDiscountScope]  = useState<DiscountScope>('all');
  const [scopeCategory,  setScopeCategory]  = useState('');
  const [maxAmount,      setMaxAmount]      = useState('');
  const [validFrom,      setValidFrom]      = useState('');
  const [validTo,        setValidTo]        = useState('');
  const [requiresCoupon, setRequiresCoupon] = useState(false);
  const [isActive,       setIsActive]       = useState(true);

  function reset() {
    setName(''); setDescription(''); setDiscountType('percentage'); setDiscountValue('');
    setDiscountScope('all'); setScopeCategory(''); setMaxAmount('');
    setValidFrom(''); setValidTo(''); setRequiresCoupon(false); setIsActive(true);
  }

  // Convert display value → DB value
  function getDbValue(): number {
    const raw = parseFloat(discountValue) || 0;
    if (discountType === 'percentage') return raw / 100;
    return raw;
  }

  // Preview string
  const valuePreview = useMemo(() => {
    const raw = parseFloat(discountValue) || 0;
    if (!raw) return null;
    if (discountType === 'percentage') return `${raw} % rabatt`;
    return `${formatCurrency(raw)} fast rabatt`;
  }, [discountType, discountValue]);

  async function handleSubmit() {
    if (!name.trim())   { toast({ title: 'Ange ett kampanjnamn', variant: 'destructive' }); return; }
    if (!discountValue) { toast({ title: 'Ange rabattvärde', variant: 'destructive' }); return; }
    const dbValue = getDbValue();
    if (discountType === 'percentage' && (dbValue <= 0 || dbValue > 1)) {
      toast({ title: 'Procentsats måste vara mellan 1 och 100', variant: 'destructive' }); return;
    }
    if (discountScope === 'category' && !scopeCategory) {
      toast({ title: 'Välj en körkortstyp för kategoriscoped rabatt', variant: 'destructive' }); return;
    }
    try {
      await createDiscount.mutateAsync({
        name:                name.trim(),
        description:         description || undefined,
        discount_type:       discountType,
        discount_scope:      discountScope,
        scope_category:      discountScope === 'category' ? scopeCategory : undefined,
        discount_value:      dbValue,
        max_discount_amount: maxAmount ? parseFloat(maxAmount) : undefined,
        valid_from:          validFrom || undefined,
        valid_to:            validTo   || undefined,
        requires_coupon:     requiresCoupon,
        is_active:           isActive,
      });
      toast({ title: `Kampanj "${name}" skapad` });
      reset(); onClose();
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <DialogTitle>Ny rabattkampanj</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name + description */}
          <div className="space-y-1.5">
            <Label>Kampanjnamn <span className="text-destructive">*</span></Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="T.ex. Sommarrabatt 2024" />
          </div>
          <div className="space-y-1.5">
            <Label>Beskrivning</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} className="resize-none h-16" placeholder="Intern beskrivning…" />
          </div>

          {/* Type + value */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Rabatttyp <span className="text-destructive">*</span></Label>
              <Select value={discountType} onValueChange={v => { setDiscountType(v as DiscountType); setDiscountValue(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Procent (%)</SelectItem>
                  <SelectItem value="fixed">Fast belopp (kr)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                {discountType === 'percentage' ? 'Rabatt i procent (1–100)' : 'Belopp (kr)'}
                <span className="text-destructive"> *</span>
              </Label>
              <Input
                type="number"
                min={discountType === 'percentage' ? '1' : '0.01'}
                max={discountType === 'percentage' ? '100' : undefined}
                step={discountType === 'percentage' ? '1' : '10'}
                value={discountValue}
                onChange={e => setDiscountValue(e.target.value)}
                placeholder={discountType === 'percentage' ? '15' : '500'}
              />
              {valuePreview && <p className="text-xs text-primary">{valuePreview}</p>}
            </div>
          </div>

          {/* Max amount cap (percentage only) */}
          {discountType === 'percentage' && (
            <div className="space-y-1.5">
              <Label>Maxrabatt (kr) — valfritt tak</Label>
              <Input
                type="number" min="0" step="100"
                value={maxAmount} onChange={e => setMaxAmount(e.target.value)}
                placeholder="Inget tak"
              />
              <p className="text-xs text-muted-foreground">Rabatten begränsas till detta belopp oavsett fakturastorlek.</p>
            </div>
          )}

          {/* Scope */}
          <div className="space-y-1.5">
            <Label>Tillämpning</Label>
            <Select value={discountScope} onValueChange={v => { setDiscountScope(v as DiscountScope); setScopeCategory(''); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla fakturor</SelectItem>
                <SelectItem value="category">Körkortstyp</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {discountScope === 'category' && (
            <div className="space-y-1.5">
              <Label>Körkortstyp <span className="text-destructive">*</span></Label>
              <Select value={scopeCategory} onValueChange={setScopeCategory}>
                <SelectTrigger><SelectValue placeholder="Välj typ…" /></SelectTrigger>
                <SelectContent>
                  {['B', 'A', 'A1', 'A2', 'AM', 'BE', 'C', 'CE', 'D', 'DE'].map(cat => (
                    <SelectItem key={cat} value={cat}>Klass {cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Validity dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Giltig från</Label>
              <Input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Giltig till</Label>
              <Input type="date" value={validTo} onChange={e => setValidTo(e.target.value)} />
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Kräver kupongkod</p>
                <p className="text-xs text-muted-foreground">Elev måste ange en giltig kupongkod för att aktivera rabatten.</p>
              </div>
              <Switch checked={requiresCoupon} onCheckedChange={setRequiresCoupon} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Aktiv direkt</p>
                <p className="text-xs text-muted-foreground">Kampanjen aktiveras omedelbart vid skapande.</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || !discountValue || createDiscount.isPending}
            className="w-full"
          >
            {createDiscount.isPending
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Plus className="w-4 h-4 mr-2" />
            }
            Skapa kampanj
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Discount card ────────────────────────────────────────────────────────────

function DiscountCard({ discount, onClick }: { discount: DiscountDefinition; onClick: () => void }) {
  const expired = isExpired(discount);

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 px-5 py-4 border-b last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
        !discount.is_active || expired ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
      }`}>
        <Tag className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold">{discount.name}</p>
          <DiscountBadge d={discount} />
          {discount.requires_coupon && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-900/20 dark:text-blue-400">
              <Ticket className="w-2.5 h-2.5" /> Kupong krävs
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="font-semibold text-foreground">{formatDiscountValue(discount)}</span>
          <span>·</span>
          <span>{SCOPE_LABELS[discount.discount_scope]}</span>
          {discount.valid_from && <span>Från {formatDate(discount.valid_from)}</span>}
          {discount.valid_to   && <span>Till {formatDate(discount.valid_to)}</span>}
          {discount.description && <span className="italic truncate max-w-[180px]">{discount.description}</span>}
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DiscountsPage() {
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const { data, isLoading, isError } = useDiscounts(
    filter === 'all'      ? {}
    : filter === 'active' ? { is_active: true }
    :                       { is_active: false },
  );

  const discounts    = data?.data ?? [];
  const total        = data?.meta.total ?? 0;
  const [createOpen, setCreateOpen]     = useState(false);
  const [selected,   setSelected]       = useState<DiscountDefinition | null>(null);

  const stats = useMemo(() => ({
    active:   discounts.filter(d => d.is_active && !isExpired(d)).length,
    expired:  discounts.filter(d => isExpired(d)).length,
    inactive: discounts.filter(d => !d.is_active).length,
    withCoupon: discounts.filter(d => d.requires_coupon).length,
  }), [discounts]);

  return (
    <PageLayout>
      <PageHeader
        title="Rabatter & Kampanjer"
        description="Rabattdefinitioner, kupongkoder och kampanjhantering"
        breadcrumbs={[{ label: 'Hem' }, { label: 'Ekonomi', href: '/finance' }, { label: 'Rabatter' }]}
        actions={
          <PermissionGate permission={Permissions.FINANCE_DISCOUNT_CREATE}>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Ny kampanj
            </Button>
          </PermissionGate>
        }
      />

      <PageContent>
        <PermissionGate
          permission={Permissions.FINANCE_DISCOUNT_READ}
          fallback={
            <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-xl border border-destructive/20">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">Du saknar behörighet att se rabatter (finance:discount:read).</p>
            </div>
          }
        >
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Aktiva kampanjer',   value: String(stats.active),     color: 'text-green-600'         },
              { label: 'Utgångna',           value: String(stats.expired),    color: stats.expired  > 0 ? 'text-orange-600' : 'text-muted-foreground' },
              { label: 'Inaktiva',           value: String(stats.inactive),   color: 'text-muted-foreground'  },
              { label: 'Kräver kupong',      value: String(stats.withCoupon), color: 'text-blue-600'          },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 ${color}`}>
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <Tabs value={filter} onValueChange={v => setFilter(v as typeof filter)} className="mb-4">
            <TabsList>
              <TabsTrigger value="all">Alla ({total})</TabsTrigger>
              <TabsTrigger value="active">
                Aktiva
                {stats.active > 0 && <Badge variant="secondary" className="ml-2 text-xs">{stats.active}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="inactive">Inaktiva</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* List */}
          {isError ? (
            <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-xl border border-destructive/20">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">Kunde inte hämta rabatter.</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Hämtar kampanjer…</span>
            </div>
          ) : discounts.length === 0 ? (
            <div className="rounded-xl border bg-card p-12 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-muted mx-auto flex items-center justify-center">
                <Tag className="w-7 h-7 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold">Inga kampanjer</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {filter !== 'all' ? 'Inga kampanjer matchar filtret.' : 'Skapa din första rabattkampanj för att erbjuda elever prissättning.'}
                </p>
              </div>
              {filter === 'all' && (
                <PermissionGate permission={Permissions.FINANCE_DISCOUNT_CREATE}>
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" /> Skapa kampanj
                  </Button>
                </PermissionGate>
              )}
            </div>
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              {discounts.map(d => (
                <DiscountCard key={d.id} discount={d} onClick={() => setSelected(d)} />
              ))}
            </div>
          )}
        </PermissionGate>
      </PageContent>

      <CreateDiscountSheet open={createOpen} onClose={() => setCreateOpen(false)} />
      <DiscountDetailSheet discount={selected} onClose={() => setSelected(null)} />
    </PageLayout>
  );
}
