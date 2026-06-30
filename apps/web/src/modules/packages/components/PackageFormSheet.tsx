import { useState } from 'react';
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
} from '@modules/finance/hooks/usePackages.js';
import { formatCurrency } from '@modules/finance/lib/financeUtils.js';

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

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  name:            string;
  package_code:    string;
  description:     string;
  package_type:    PackageType;
  lesson_category: LessonCategory;
  quantity:        number;
  price:           number;
  vat_rate:        number;
  validity_days:   string;
  sort_order:      number;
  visibility:      OfferingVisibility;
  featured:        boolean;
  internal_notes:  string;
}

function defaultForm(): FormState {
  return {
    name:            '',
    package_code:    '',
    description:     '',
    package_type:    'driving',
    lesson_category: 'driving',
    quantity:        10,
    price:           0,
    vat_rate:        0.25,
    validity_days:   '',
    sort_order:      0,
    visibility:      'internal',
    featured:        false,
    internal_notes:  '',
  };
}

function fromOffering(o: PackageOffering): FormState {
  return {
    name:            o.name,
    package_code:    o.package_code ?? '',
    description:     o.description ?? '',
    package_type:    o.package_type,
    lesson_category: o.lesson_category,
    quantity:        o.quantity,
    price:           o.price,
    vat_rate:        o.vat_rate,
    validity_days:   o.validity_days != null ? String(o.validity_days) : '',
    sort_order:      o.sort_order,
    visibility:      o.visibility,
    featured:        o.featured,
    internal_notes:  o.internal_notes ?? '',
  };
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

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleInputChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setField(key, e.target.value as FormState[typeof key]);
  }

  const inclVat = form.price > 0 ? form.price * (1 + form.vat_rate) : 0;
  const perLesson = form.price > 0 && form.quantity > 0 ? form.price / form.quantity : 0;
  const isValid = form.name.trim().length > 0 && form.quantity > 0;
  const isPending = createMut.isPending || updateMut.isPending;

  async function handleSubmit() {
    if (!isValid) return;
    const validityDays = form.validity_days !== '' ? Number(form.validity_days) : undefined;

    try {
      if (mode === 'edit' && source) {
        await updateMut.mutateAsync({
          name:           form.name.trim(),
          description:    form.description.trim() || null,
          price:          form.price,
          vat_rate:       form.vat_rate,
          validity_days:  validityDays ?? null,
          sort_order:     form.sort_order,
          package_code:   form.package_code.trim() || null,
          visibility:     form.visibility,
          featured:       form.featured,
          internal_notes: form.internal_notes.trim() || null,
        });
        toast({ title: 'Paketet uppdaterat' });
      } else {
        await createMut.mutateAsync({
          name:             form.name.trim(),
          lesson_category:  form.lesson_category,
          quantity:         form.quantity,
          price:            form.price,
          package_type:     form.package_type,
          description:      form.description.trim() || undefined,
          vat_rate:         form.vat_rate,
          validity_days:    validityDays,
          sort_order:       form.sort_order,
          package_code:     form.package_code.trim() || undefined,
          visibility:       form.visibility,
          featured:         form.featured,
          internal_notes:   form.internal_notes.trim() || undefined,
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
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-6">

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
                <Label>Lektionskategori</Label>
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

            {/* Price preview */}
            {form.price > 0 && (
              <div className="border rounded-lg p-3 bg-muted/30 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Pris ex. moms</span>
                  <span className="font-mono">{formatCurrency(form.price, 'SEK')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Moms ({Math.round(form.vat_rate * 100)} %)</span>
                  <span className="font-mono">{formatCurrency(form.price * form.vat_rate, 'SEK')}</span>
                </div>
                <div className="flex items-center justify-between font-semibold border-t pt-1 mt-1">
                  <span>Pris inkl. moms</span>
                  <span className="font-mono text-base">{formatCurrency(inclVat, 'SEK')}</span>
                </div>
                {form.quantity > 1 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Per lektion ex. moms</span>
                    <span className="font-mono">{formatCurrency(perLesson, 'SEK')}</span>
                  </div>
                )}
              </div>
            )}
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
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
              <input
                id="featured-toggle"
                type="checkbox"
                checked={form.featured}
                onChange={(e) => setField('featured', e.target.checked)}
                className="w-4 h-4 accent-primary cursor-pointer"
              />
              <div>
                <label htmlFor="featured-toggle" className="text-sm font-medium cursor-pointer select-none">
                  Utvalt paket
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Utvalda paket visas längst upp i listningar och kan markeras med stjärna.
                </p>
              </div>
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
      </DialogContent>
    </Dialog>
  );
}
