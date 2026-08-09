import { useState } from 'react';
import { X, Plus, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  Textarea,
  toast,
} from '@platform/ui';
import {
  useCreateOffering,
  useUpdateOffering,
  type PackageOffering,
  type LessonCategory,
  type PackageType,
  type OfferingVisibility,
  type MarketingBadge,
  type BundleCreditComponent,
} from '@modules/finance/hooks/usePackages.js';
import { formatCurrency } from '@modules/finance/lib/financeUtils.js';
import { cn } from '@/lib/utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const LESSON_CATEGORIES: { value: LessonCategory; label: string }[] = [
  { value: 'driving', label: 'Körlektion' },
  { value: 'theory',  label: 'Teori' },
  { value: 'risk1',   label: 'Risk 1' },
  { value: 'risk2',   label: 'Risk 2' },
  { value: 'intro',   label: 'Introduktionslektion' },
  { value: 'other',   label: 'Övrigt' },
];

const PACKAGE_TYPES: { value: PackageType; label: string }[] = [
  { value: 'driving', label: 'Körpaket' },
  { value: 'theory',  label: 'Teoripaket' },
  { value: 'bundle',  label: 'Kombinationspaket' },
  { value: 'other',   label: 'Övrigt' },
];

const VISIBILITY_OPTIONS: { value: OfferingVisibility; label: string; hint: string }[] = [
  { value: 'internal',       label: 'Intern',          hint: 'Endast synlig för personal' },
  { value: 'student_portal', label: 'Elevportalen',    hint: 'Visas för inloggade elever' },
  { value: 'website',        label: 'Webb',            hint: 'Visas på webbsidan' },
  { value: 'public',         label: 'Offentlig',       hint: 'Alla ytor — webb, elev och guardian' },
];

const VAT_OPTIONS = [
  { value: 0.25, label: '25 %' },
  { value: 0.12, label: '12 %' },
  { value: 0.06, label: '6 %' },
  { value: 0,    label: '0 %' },
];

const MARKETING_BADGES: { value: MarketingBadge; label: string }[] = [
  { value: 'featured',      label: 'Utvalt' },
  { value: 'best_seller',   label: 'Bästsäljare' },
  { value: 'new',           label: 'Nyhet' },
  { value: 'campaign',      label: 'Kampanj' },
  { value: 'limited_offer', label: 'Begränsat erbjudande' },
  { value: 'recommended',   label: 'Rekommenderas' },
];

// Bookable extras (bundle_credits — real credit-ledger grants on purchase,
// same mechanism as the package's own primary lesson_category/quantity).
const BUNDLE_CATEGORIES = LESSON_CATEGORIES.filter((c) => c.value !== 'other');

// Non-bookable inclusions (included_items — descriptive only, shown as
// public "package highlights"). Quick-add presets, but the field accepts
// any free text — a school's actual offer isn't limited to this list.
const INCLUDED_ITEM_PRESETS = [
  'Teorimaterial', 'Onlinetest', 'Fordonshyra vid uppkörning',
  'Bokning av uppkörning', 'Digitalt läromedel',
];

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  name:              string;
  package_code:      string;
  description:       string;
  package_type:      PackageType;
  lesson_category:   LessonCategory;
  quantity:          number;
  price:             number;
  compare_at_price:  string; // '' = not set
  vat_rate:          number;
  validity_days:     string;
  sort_order:        number;
  visibility:        OfferingVisibility;
  marketing_badges:  MarketingBadge[];
  bundle_credits:    BundleCreditComponent[];
  included_items:    string[];
  internal_notes:    string;
}

function defaultForm(): FormState {
  return {
    name:              '',
    package_code:      '',
    description:       '',
    package_type:      'driving',
    lesson_category:   'driving',
    quantity:          10,
    price:             0,
    compare_at_price:  '',
    vat_rate:          0.25,
    validity_days:     '',
    sort_order:        0,
    visibility:        'internal',
    marketing_badges:  [],
    bundle_credits:    [],
    included_items:    [],
    internal_notes:    '',
  };
}

function fromOffering(o: PackageOffering): FormState {
  return {
    name:              o.name,
    package_code:      o.package_code ?? '',
    description:       o.description ?? '',
    package_type:      o.package_type,
    lesson_category:   o.lesson_category,
    quantity:          o.quantity,
    price:             o.price,
    compare_at_price:  o.compare_at_price != null ? String(o.compare_at_price) : '',
    vat_rate:          o.vat_rate,
    validity_days:     o.validity_days != null ? String(o.validity_days) : '',
    sort_order:        o.sort_order,
    visibility:        o.visibility,
    marketing_badges:  o.marketing_badges ?? [],
    bundle_credits:    o.bundle_credits ?? [],
    included_items:    o.included_items ?? [],
    internal_notes:    o.internal_notes ?? '',
  };
}

// ─── Small building blocks ──────────────────────────────────────────────────────

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-muted text-xs font-medium text-foreground border border-border">
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-foreground">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

// ─── PackageFormSheet ─────────────────────────────────────────────────────────

interface Props {
  mode:    'create' | 'edit' | 'clone';
  source?: PackageOffering;
  onClose: () => void;
}

export function PackageFormSheet({ mode, source, onClose }: Props) {
  const createMut = useCreateOffering();
  const updateMut = useUpdateOffering(source?.id ?? '');

  const [form, setForm] = useState<FormState>(() => {
    if (mode === 'edit' && source) return fromOffering(source);
    if (mode === 'clone' && source) {
      return {
        ...fromOffering(source),
        name:         `Kopia av ${source.name}`,
        package_code: '',
      };
    }
    return defaultForm();
  });

  const [bundleCategoryDraft, setBundleCategoryDraft] = useState<LessonCategory>('theory');
  const [bundleQtyDraft, setBundleQtyDraft]           = useState(1);
  const [includedItemDraft, setIncludedItemDraft]     = useState('');

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleInputChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setField(key, e.target.value as FormState[typeof key]);
  }

  function toggleBadge(badge: MarketingBadge) {
    setForm((f) => ({
      ...f,
      marketing_badges: f.marketing_badges.includes(badge)
        ? f.marketing_badges.filter((b) => b !== badge)
        : [...f.marketing_badges, badge],
    }));
  }

  function addBundleCredit() {
    if (bundleQtyDraft <= 0) return;
    setForm((f) => ({
      ...f,
      bundle_credits: [...f.bundle_credits, { lesson_category: bundleCategoryDraft, quantity: bundleQtyDraft }],
    }));
    setBundleQtyDraft(1);
  }
  function removeBundleCredit(index: number) {
    setForm((f) => ({ ...f, bundle_credits: f.bundle_credits.filter((_, i) => i !== index) }));
  }

  function addIncludedItem(item: string) {
    const trimmed = item.trim();
    if (!trimmed || form.included_items.includes(trimmed)) return;
    setForm((f) => ({ ...f, included_items: [...f.included_items, trimmed] }));
    setIncludedItemDraft('');
  }
  function removeIncludedItem(item: string) {
    setForm((f) => ({ ...f, included_items: f.included_items.filter((i) => i !== item) }));
  }

  // ── Pricing engine — pure derived values, recomputed on every render ───────
  const priceExVat      = form.price > 0 ? form.price : 0;
  const vatAmount       = priceExVat * form.vat_rate;
  const priceInclVat    = priceExVat + vatAmount;
  const perLessonExVat  = priceExVat > 0 && form.quantity > 0 ? priceExVat / form.quantity : 0;
  const perLessonInclVat = priceInclVat > 0 && form.quantity > 0 ? priceInclVat / form.quantity : 0;

  const compareAtNum = form.compare_at_price !== '' ? Number(form.compare_at_price) : null;
  const hasDiscount   = compareAtNum != null && compareAtNum > priceExVat;
  const compareInclVat = hasDiscount ? compareAtNum * (1 + form.vat_rate) : null;
  const discountAmountExVat   = hasDiscount ? compareAtNum - priceExVat : 0;
  const discountAmountInclVat = hasDiscount && compareInclVat != null ? compareInclVat - priceInclVat : 0;
  const discountPct = hasDiscount && compareAtNum! > 0 ? Math.round((discountAmountExVat / compareAtNum!) * 100) : 0;

  const totalIncludedComponents = 1 /* primary */ + form.bundle_credits.length;

  const isValid = form.name.trim().length > 0 && form.quantity > 0;
  const isPending = createMut.isPending || updateMut.isPending;

  async function handleSubmit() {
    if (!isValid) return;
    const validityDays = form.validity_days !== '' ? Number(form.validity_days) : undefined;
    const compareAt     = form.compare_at_price !== '' ? Number(form.compare_at_price) : undefined;

    try {
      if (mode === 'edit' && source) {
        await updateMut.mutateAsync({
          name:              form.name.trim(),
          description:       form.description.trim() || null,
          price:             form.price,
          compare_at_price:  compareAt ?? null,
          vat_rate:          form.vat_rate,
          validity_days:     validityDays ?? null,
          sort_order:        form.sort_order,
          package_code:      form.package_code.trim() || null,
          visibility:        form.visibility,
          marketing_badges:  form.marketing_badges,
          included_items:    form.included_items,
          internal_notes:    form.internal_notes.trim() || null,
        });
        toast({ title: 'Paketet uppdaterat' });
      } else {
        await createMut.mutateAsync({
          name:              form.name.trim(),
          lesson_category:   form.lesson_category,
          quantity:          form.quantity,
          price:             form.price,
          compare_at_price:  compareAt,
          bundle_credits:    form.bundle_credits,
          package_type:      form.package_type,
          description:       form.description.trim() || undefined,
          vat_rate:          form.vat_rate,
          validity_days:     validityDays,
          sort_order:        form.sort_order,
          package_code:      form.package_code.trim() || undefined,
          visibility:        form.visibility,
          marketing_badges:  form.marketing_badges,
          included_items:    form.included_items,
          internal_notes:    form.internal_notes.trim() || undefined,
        });
        toast({ title: mode === 'clone' ? 'Kopia skapad' : 'Paketet skapat' });
      }
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  const title =
    mode === 'edit'  ? 'Redigera paket' :
    mode === 'clone' ? 'Klona paket' :
    'Nytt paket';

  const submitLabel =
    mode === 'edit'  ? (isPending ? 'Sparar...' : 'Spara ändringar') :
    mode === 'clone' ? (isPending ? 'Skapar...' : 'Skapa kopia') :
    (isPending ? 'Skapar...' : 'Skapa paket');

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="mt-2 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* ── Left column: form ─────────────────────────────────────────── */}
          <div className="space-y-6 min-w-0">

            {/* Grunduppgifter */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grunduppgifter</p>
              <div className="space-y-1.5">
                <Label>Paketnamn <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="t.ex. 10 körlektioner"
                  value={form.name}
                  onChange={handleInputChange('name')}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Paketkod <span className="text-muted-foreground text-xs font-normal">(valfri)</span></Label>
                <Input
                  placeholder="t.ex. KB-30"
                  value={form.package_code}
                  onChange={handleInputChange('package_code')}
                  className="font-mono"
                />
                <p className="text-[11px] text-muted-foreground">Unik SKU per organisation. Används för intern sökning.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Beskrivning <span className="text-muted-foreground text-xs font-normal">(valfri)</span></Label>
                <Textarea
                  rows={2}
                  placeholder="Kort beskrivning av paketet..."
                  value={form.description}
                  onChange={handleInputChange('description')}
                />
              </div>
            </section>

            <hr className="border-border" />

            {/* Typ & kategori */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Typ & kategori</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Pakettyp</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={form.package_type}
                    onChange={handleInputChange('package_type')}
                    disabled={mode === 'edit'}
                  >
                    {PACKAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Huvudkategori</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={form.lesson_category}
                    onChange={handleInputChange('lesson_category')}
                    disabled={mode === 'edit'}
                  >
                    {LESSON_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  {mode === 'edit' && (
                    <p className="text-[11px] text-muted-foreground">Kategori kan inte ändras efter skapande.</p>
                  )}
                </div>
              </div>
            </section>

            <hr className="border-border" />

            {/* Paketinnehåll */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paketinnehåll</p>

              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm flex items-center justify-between">
                <span className="text-foreground">
                  {form.quantity} × {LESSON_CATEGORIES.find((c) => c.value === form.lesson_category)?.label ?? form.lesson_category}
                </span>
                <span className="text-[11px] text-muted-foreground">Huvudinnehåll</span>
              </div>

              {mode !== 'edit' && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Extra lektionstillfällen som ingår i paketet (t.ex. Risk 1 utöver körlektionerna) — ger ett riktigt lektionskrediteringar vid köp, precis som huvudinnehållet.
                  </p>
                  {form.bundle_credits.length > 0 && (
                    <div className="space-y-1.5">
                      {form.bundle_credits.map((bc, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-sm">
                          <span>{bc.quantity} × {LESSON_CATEGORIES.find((c) => c.value === bc.lesson_category)?.label ?? bc.lesson_category}</span>
                          <button type="button" onClick={() => removeBundleCredit(i)} className="text-muted-foreground hover:text-destructive">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Kategori</Label>
                      <select
                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                        value={bundleCategoryDraft}
                        onChange={(e) => setBundleCategoryDraft(e.target.value as LessonCategory)}
                      >
                        {BUNDLE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div className="w-20 space-y-1">
                      <Label className="text-xs">Antal</Label>
                      <Input
                        type="number" min="1" className="h-8 text-xs"
                        value={bundleQtyDraft}
                        onChange={(e) => setBundleQtyDraft(Number(e.target.value))}
                      />
                    </div>
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={addBundleCredit}>
                      <Plus className="w-3.5 h-3.5" /> Lägg till
                    </Button>
                  </div>
                </>
              )}
              {mode === 'edit' && form.bundle_credits.length > 0 && (
                <div className="space-y-1.5">
                  {form.bundle_credits.map((bc, i) => (
                    <div key={i} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground">
                      {bc.quantity} × {LESSON_CATEGORIES.find((c) => c.value === bc.lesson_category)?.label ?? bc.lesson_category}
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground">Extrainnehåll kan inte ändras efter skapande.</p>
                </div>
              )}

              <div className="space-y-1.5 pt-1">
                <Label className="text-xs">Övrigt som ingår <span className="text-muted-foreground font-normal">(visas som höjdpunkter, påverkar ej krediter)</span></Label>
                {form.included_items.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {form.included_items.map((item) => (
                      <Chip key={item} onRemove={() => removeIncludedItem(item)}>{item}</Chip>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {INCLUDED_ITEM_PRESETS.filter((p) => !form.included_items.includes(p)).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => addIncludedItem(preset)}
                      className="text-xs px-2 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Eget innehåll..."
                    className="h-8 text-xs"
                    value={includedItemDraft}
                    onChange={(e) => setIncludedItemDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addIncludedItem(includedItemDraft); } }}
                  />
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => addIncludedItem(includedItemDraft)}>
                    Lägg till
                  </Button>
                </div>
              </div>
            </section>

            <hr className="border-border" />

            {/* Krediter & prissättning */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Krediter & prissättning</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Antal lektioner <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={(e) => setField('quantity', Number(e.target.value))}
                    disabled={mode === 'edit'}
                  />
                  {mode === 'edit' && (
                    <p className="text-[11px] text-muted-foreground">Antal kan inte ändras efter skapande.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Pris ex. moms (kr)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setField('price', Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Jämförelsepris ex. moms <span className="text-muted-foreground text-xs font-normal">(valfri)</span></Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Ordinarie pris"
                    value={form.compare_at_price}
                    onChange={handleInputChange('compare_at_price')}
                  />
                  <p className="text-[11px] text-muted-foreground">Ange om paketet säljs till rabatterat pris — visas som överstruket ordinarie pris.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Momssats</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={String(form.vat_rate)}
                    onChange={(e) => setField('vat_rate', Number(e.target.value))}
                  >
                    {VAT_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Giltighetstid (dagar)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Obegränsad"
                    value={form.validity_days}
                    onChange={handleInputChange('validity_days')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Sorteringsordning</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.sort_order}
                    onChange={(e) => setField('sort_order', Number(e.target.value))}
                  />
                </div>
              </div>
            </section>

            <hr className="border-border" />

            {/* Marknadsföring */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Marknadsföring</p>
              <p className="text-xs text-muted-foreground -mt-1">Märkningar som visas på paketet i listningar och på den publika katalogsidan.</p>
              <div className="flex flex-wrap gap-2">
                {MARKETING_BADGES.map((b) => {
                  const active = form.marketing_badges.includes(b.value);
                  return (
                    <button
                      key={b.value}
                      type="button"
                      onClick={() => toggleBadge(b.value)}
                      className={cn(
                        'text-xs font-medium px-3 py-1.5 rounded-full border transition-colors',
                        active
                          ? 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700'
                          : 'border-border text-muted-foreground hover:border-foreground/30',
                      )}
                    >
                      {b.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <hr className="border-border" />

            {/* Synlighet & exponering */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Synlighet & exponering</p>
              <div className="space-y-1.5">
                <Label>Synlighet</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.visibility}
                  onChange={handleInputChange('visibility')}
                >
                  {VISIBILITY_OPTIONS.map((v) => (
                    <option key={v.value} value={v.value}>{v.label} — {v.hint}</option>
                  ))}
                </select>
              </div>
            </section>

            <hr className="border-border" />

            {/* Interna anteckningar */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interna anteckningar</p>
              <div className="space-y-1.5">
                <Label>Anteckningar <span className="text-muted-foreground text-xs font-normal">(visas aldrig för elever)</span></Label>
                <Textarea
                  rows={3}
                  placeholder="T.ex. riktat till elever nära uppkörning, ej publicerat ännu..."
                  value={form.internal_notes}
                  onChange={handleInputChange('internal_notes')}
                />
              </div>
            </section>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t">
              <Button
                disabled={!isValid || isPending}
                onClick={() => void handleSubmit()}
              >
                {submitLabel}
              </Button>
              <Button variant="outline" onClick={onClose} disabled={isPending}>
                Avbryt
              </Button>
            </div>
          </div>

          {/* ── Right column: live commercial preview ───────────────────────── */}
          <div className="lg:sticky lg:top-0 h-fit">
            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-500" />
                <p className="text-xs font-bold uppercase tracking-wide text-foreground">Kommersiell förhandsgranskning</p>
              </div>

              <div>
                <p className="text-sm font-semibold text-foreground truncate">{form.name || 'Nytt paket'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {totalIncludedComponents} {totalIncludedComponents === 1 ? 'komponent' : 'komponenter'} · {form.quantity} lektioner
                </p>
              </div>

              {form.marketing_badges.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {form.marketing_badges.map((b) => (
                    <span key={b} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      {MARKETING_BADGES.find((m) => m.value === b)?.label ?? b}
                    </span>
                  ))}
                </div>
              )}

              <div className="border-t border-border pt-3 space-y-1.5 text-sm">
                {hasDiscount ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Ordinarie pris</span>
                      <span className="font-mono text-muted-foreground line-through">{formatCurrency(compareInclVat!, 'SEK')}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Kampanjpris</span>
                      <span className="font-mono font-bold text-blue-600">{formatCurrency(priceInclVat, 'SEK')}</span>
                    </div>
                    <div className="flex items-center justify-between text-green-700 dark:text-green-400">
                      <span>Kundens besparing</span>
                      <span className="font-mono font-semibold">{formatCurrency(discountAmountInclVat, 'SEK')} ({discountPct} %)</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-muted-foreground font-normal">Pris</span>
                    <span className="font-mono text-base">{formatCurrency(priceInclVat, 'SEK')}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1.5 border-t border-border/60 mt-1.5">
                  <span>Pris ex. moms</span>
                  <span className="font-mono">{formatCurrency(priceExVat, 'SEK')}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Moms ({Math.round(form.vat_rate * 100)} %)</span>
                  <span className="font-mono">{formatCurrency(vatAmount, 'SEK')}</span>
                </div>
                {form.quantity > 0 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Effektivt pris per lektion</span>
                    <span className="font-mono">{formatCurrency(perLessonInclVat, 'SEK')} <span className="text-[10px]">({formatCurrency(perLessonExVat, 'SEK')} ex. moms)</span></span>
                  </div>
                )}
              </div>

              {(form.bundle_credits.length > 0 || form.included_items.length > 0) && (
                <div className="border-t border-border pt-3 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Paketinnehåll</p>
                  <ul className="space-y-0.5 text-xs text-foreground">
                    <li>• {form.quantity} × {LESSON_CATEGORIES.find((c) => c.value === form.lesson_category)?.label ?? form.lesson_category}</li>
                    {form.bundle_credits.map((bc, i) => (
                      <li key={i}>• {bc.quantity} × {LESSON_CATEGORIES.find((c) => c.value === bc.lesson_category)?.label ?? bc.lesson_category}</li>
                    ))}
                    {form.included_items.map((item) => <li key={item}>• {item}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
