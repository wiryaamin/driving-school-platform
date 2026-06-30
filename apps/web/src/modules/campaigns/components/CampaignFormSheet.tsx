import { useState, useEffect } from 'react';
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
  useCreateCampaign,
  useUpdateCampaign,
  type Campaign,
  type CampaignType,
  type CampaignVisibility,
  type CreateCampaignInput,
  type UpdateCampaignInput,
} from '../hooks/useCampaigns.js';

// ─── Constants ────────────────────────────────────────────────────────────────

export const CAMPAIGN_TYPES: { value: CampaignType; label: string; hint: string }[] = [
  { value: 'percentage_discount',  label: 'Procentrabatt',       hint: 'T.ex. 15% rabatt på paketpris' },
  { value: 'fixed_discount',       label: 'Fast rabatt',          hint: 'T.ex. 500 kr rabatt' },
  { value: 'bonus_lessons',        label: 'Bonuslektioner',       hint: 'Gratis extra lektioner vid köp' },
  { value: 'free_risk1',           label: 'Gratis Risk 1',        hint: 'Risk 1-lektion ingår gratis' },
  { value: 'free_risk2',           label: 'Gratis Risk 2',        hint: 'Risk 2-lektion ingår gratis' },
  { value: 'seasonal',             label: 'Säsongskampanj',       hint: 'Generell säsongskampanj' },
  { value: 'promotional_pricing',  label: 'Kampanjpris',          hint: 'Eget kampanjpris på paket' },
];

const VISIBILITY_OPTIONS: { value: CampaignVisibility; label: string; hint: string }[] = [
  { value: 'internal',       label: 'Intern',        hint: 'Endast synlig för personal' },
  { value: 'student_portal', label: 'Elevportalen',  hint: 'Visas för inloggade elever' },
  { value: 'website',        label: 'Webb',          hint: 'Visas på webbsidan' },
  { value: 'public',         label: 'Offentlig',     hint: 'Alla ytor — webb, elev och guardian' },
];

// Types that use discount_value / discount_is_pct
const DISCOUNT_TYPES = new Set<CampaignType>(['percentage_discount', 'fixed_discount', 'promotional_pricing']);
const BONUS_TYPES    = new Set<CampaignType>(['bonus_lessons']);

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  name:                string;
  campaign_type:       CampaignType;
  description:         string;
  visibility:          CampaignVisibility;
  priority:            string;
  discount_value:      string;
  discount_is_pct:     boolean;
  max_discount_amount: string;
  bonus_lessons:       string;
  starts_at:           string;
  ends_at:             string;
  internal_notes:      string;
}

function defaultForm(): FormState {
  return {
    name:                '',
    campaign_type:       'percentage_discount',
    description:         '',
    visibility:          'internal',
    priority:            '0',
    discount_value:      '',
    discount_is_pct:     true,
    max_discount_amount: '',
    bonus_lessons:       '',
    starts_at:           '',
    ends_at:             '',
    internal_notes:      '',
  };
}

function fromCampaign(c: Campaign): FormState {
  return {
    name:                c.name,
    campaign_type:       c.campaign_type,
    description:         c.description ?? '',
    visibility:          c.visibility,
    priority:            String(c.priority),
    discount_value:      c.discount_value != null ? String(c.discount_value) : '',
    discount_is_pct:     c.discount_is_pct ?? true,
    max_discount_amount: c.max_discount_amount != null ? String(c.max_discount_amount) : '',
    bonus_lessons:       c.bonus_lessons != null ? String(c.bonus_lessons) : '',
    starts_at:           c.starts_at ? c.starts_at.slice(0, 16) : '',
    ends_at:             c.ends_at   ? c.ends_at.slice(0, 16)   : '',
    internal_notes:      c.internal_notes ?? '',
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  mode:    'create' | 'edit' | 'clone';
  source?: Campaign;
  onClose: () => void;
}

export function CampaignFormSheet({ mode, source, onClose }: Props) {
  const createMut = useCreateCampaign();
  const updateMut = useUpdateCampaign(source?.id ?? '');

  const [form, setForm] = useState<FormState>(() => {
    if (mode === 'create') return defaultForm();
    if (source) {
      const base = fromCampaign(source);
      if (mode === 'clone') {
        return { ...base, name: `Kopia av ${base.name}`, starts_at: '', ends_at: '' };
      }
      return base;
    }
    return defaultForm();
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (mode === 'create') { setForm(defaultForm()); return; }
    if (source) {
      const base = fromCampaign(source);
      setForm(mode === 'clone'
        ? { ...base, name: `Kopia av ${base.name}`, starts_at: '', ends_at: '' }
        : base,
      );
    }
  }, [mode, source]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e['name'] = 'Namn krävs';
    if (DISCOUNT_TYPES.has(form.campaign_type) && !form.discount_value.trim()) {
      e['discount_value'] = 'Rabattvärde krävs för denna kampanjtyp';
    }
    if (BONUS_TYPES.has(form.campaign_type) && !form.bonus_lessons.trim()) {
      e['bonus_lessons'] = 'Antal bonuslektioner krävs';
    }
    if (form.starts_at && form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at)) {
      e['ends_at'] = 'Slutdatum måste vara efter startdatum';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

    const isDiscount = DISCOUNT_TYPES.has(form.campaign_type);
    const isBonus    = BONUS_TYPES.has(form.campaign_type);

    try {
      if (mode === 'edit' && source) {
        const patch: UpdateCampaignInput = {
          name:                form.name.trim(),
          description:         form.description.trim() || null,
          visibility:          form.visibility,
          priority:            Number(form.priority) || 0,
          discount_value:      isDiscount && form.discount_value      ? Number(form.discount_value)      : null,
          discount_is_pct:     isDiscount ? form.discount_is_pct      : null,
          max_discount_amount: isDiscount && form.max_discount_amount  ? Number(form.max_discount_amount) : null,
          bonus_lessons:       isBonus    && form.bonus_lessons        ? Number(form.bonus_lessons)       : null,
          starts_at:           form.starts_at ? new Date(form.starts_at).toISOString() : null,
          ends_at:             form.ends_at   ? new Date(form.ends_at).toISOString()   : null,
          internal_notes:      form.internal_notes.trim() || null,
        };
        await updateMut.mutateAsync(patch);
        toast({ title: 'Kampanj sparad' });
      } else {
        const input: CreateCampaignInput = {
          name:          form.name.trim(),
          campaign_type: form.campaign_type,
          visibility:    form.visibility,
          priority:      Number(form.priority) || 0,
          ...(form.description.trim()    ? { description:         form.description.trim() }              : {}),
          ...(isDiscount && form.discount_value
            ? { discount_value:      Number(form.discount_value) }    : {}),
          ...(isDiscount                 ? { discount_is_pct:     form.discount_is_pct }                 : {}),
          ...(isDiscount && form.max_discount_amount
            ? { max_discount_amount: Number(form.max_discount_amount) } : {}),
          ...(isBonus    && form.bonus_lessons
            ? { bonus_lessons:       Number(form.bonus_lessons) }     : {}),
          ...(form.starts_at ? { starts_at: new Date(form.starts_at).toISOString() } : {}),
          ...(form.ends_at   ? { ends_at:   new Date(form.ends_at).toISOString() }   : {}),
          ...(form.internal_notes.trim() ? { internal_notes: form.internal_notes.trim() } : {}),
        };
        await createMut.mutateAsync(input);
        toast({ title: mode === 'clone' ? 'Kampanj klonad' : 'Kampanj skapad' });
      }
      onClose();
    } catch (e) {
      toast({
        title:       'Fel',
        description: e instanceof Error ? e.message : 'Okänt fel',
        variant:     'destructive',
      });
    }
  }

  const isPending = createMut.isPending || updateMut.isPending;
  const title     = mode === 'edit' ? 'Redigera kampanj'
                  : mode === 'clone' ? 'Klona kampanj'
                  : 'Ny kampanj';

  const showDiscount = DISCOUNT_TYPES.has(form.campaign_type);
  const showBonus    = BONUS_TYPES.has(form.campaign_type);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="py-5 space-y-5">

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="cf-name">Kampanjnamn *</Label>
            <Input
              id="cf-name"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="T.ex. Sommarkampanj 2026"
              className={errors['name'] ? 'border-destructive' : ''}
            />
            {errors['name'] && <p className="text-xs text-destructive">{errors['name']}</p>}
          </div>

          {/* Campaign type */}
          <div className="space-y-1.5">
            <Label htmlFor="cf-type">Kampanjtyp *</Label>
            <select
              id="cf-type"
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={form.campaign_type}
              disabled={mode === 'edit'}
              onChange={(e) => setField('campaign_type', e.target.value as CampaignType)}
            >
              {CAMPAIGN_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              {CAMPAIGN_TYPES.find((t) => t.value === form.campaign_type)?.hint}
            </p>
          </div>

          {/* Discount fields */}
          {showDiscount && (
            <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rabattinställningar</p>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                  <input
                    type="radio"
                    name="cf-discount-type"
                    checked={form.discount_is_pct}
                    onChange={() => setField('discount_is_pct', true)}
                    className="accent-primary"
                  />
                  Procent (%)
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                  <input
                    type="radio"
                    name="cf-discount-type"
                    checked={!form.discount_is_pct}
                    onChange={() => setField('discount_is_pct', false)}
                    className="accent-primary"
                  />
                  Fast belopp (kr)
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cf-dv">
                    {form.discount_is_pct ? 'Procent (t.ex. 15)' : 'Belopp (kr)'}
                    {' *'}
                  </Label>
                  <Input
                    id="cf-dv"
                    type="number"
                    min={0}
                    step={form.discount_is_pct ? 1 : 50}
                    value={form.discount_value}
                    onChange={(e) => setField('discount_value', e.target.value)}
                    placeholder={form.discount_is_pct ? '15' : '500'}
                    className={errors['discount_value'] ? 'border-destructive' : ''}
                  />
                  {errors['discount_value'] && (
                    <p className="text-xs text-destructive">{errors['discount_value']}</p>
                  )}
                </div>

                {form.discount_is_pct && (
                  <div className="space-y-1">
                    <Label htmlFor="cf-cap">Max rabatt (kr, valfritt)</Label>
                    <Input
                      id="cf-cap"
                      type="number"
                      min={0}
                      step={50}
                      value={form.max_discount_amount}
                      onChange={(e) => setField('max_discount_amount', e.target.value)}
                      placeholder="1 000"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bonus lessons */}
          {showBonus && (
            <div className="space-y-1.5">
              <Label htmlFor="cf-bonus">Antal bonuslektioner *</Label>
              <Input
                id="cf-bonus"
                type="number"
                min={1}
                step={1}
                value={form.bonus_lessons}
                onChange={(e) => setField('bonus_lessons', e.target.value)}
                placeholder="2"
                className={errors['bonus_lessons'] ? 'border-destructive' : ''}
              />
              {errors['bonus_lessons'] && (
                <p className="text-xs text-destructive">{errors['bonus_lessons']}</p>
              )}
            </div>
          )}

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="cf-desc">Beskrivning</Label>
            <Textarea
              id="cf-desc"
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="Frivillig beskrivning av kampanjen..."
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Visibility + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cf-vis">Synlighet</Label>
              <select
                id="cf-vis"
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={form.visibility}
                onChange={(e) => setField('visibility', e.target.value as CampaignVisibility)}
              >
                {VISIBILITY_OPTIONS.map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                {VISIBILITY_OPTIONS.find((v) => v.value === form.visibility)?.hint}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cf-prio">Prioritet</Label>
              <Input
                id="cf-prio"
                type="number"
                min={0}
                step={1}
                value={form.priority}
                onChange={(e) => setField('priority', e.target.value)}
                placeholder="0"
              />
              <p className="text-[11px] text-muted-foreground">Högre tal = visas först</p>
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Schema (valfritt)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cf-start">Startar</Label>
                <Input
                  id="cf-start"
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setField('starts_at', e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-end">Slutar</Label>
                <Input
                  id="cf-end"
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setField('ends_at', e.target.value)}
                  className={`text-xs${errors['ends_at'] ? ' border-destructive' : ''}`}
                />
                {errors['ends_at'] && <p className="text-xs text-destructive">{errors['ends_at']}</p>}
              </div>
            </div>
          </div>

          {/* Internal notes */}
          <div className="space-y-1.5">
            <Label htmlFor="cf-notes">Interna anteckningar</Label>
            <Textarea
              id="cf-notes"
              value={form.internal_notes}
              onChange={(e) => setField('internal_notes', e.target.value)}
              placeholder="Interna noter (visas ej för kunder)..."
              rows={2}
              className="resize-none"
            />
          </div>
        </div>

        <div className="pt-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Avbryt
          </Button>
          <Button disabled={isPending || !form.name.trim()} onClick={() => void handleSubmit()}>
            {isPending
              ? (mode === 'edit' ? 'Sparar...' : 'Skapar...')
              : (mode === 'edit' ? 'Spara ändringar' : mode === 'clone' ? 'Klona kampanj' : 'Skapa kampanj')
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
