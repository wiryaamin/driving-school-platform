import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, BookOpen, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  Button, Skeleton, Label, Input, Switch,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  toast,
} from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { cn } from '@/lib/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type LessonCategory =
  | 'driving' | 'theory' | 'risk1' | 'risk2' | 'simulator'
  | 'assessment' | 'intensive' | 'group_theory' | 'other';

interface LessonTypeRow {
  id:                        string;
  name:                      string;
  code:                      string;
  category:                  LessonCategory;
  default_duration_minutes:  number;
  requires_vehicle:          boolean;
  requires_instructor:       boolean;
  max_students_per_slot:     number;
  color_hex:                 string;
  display_order:             number;
  is_active:                 boolean;
  pricing_sek:                number | null;
  group_id:                  string | null;
}

interface LessonTypeGroupOption {
  id:   string;
  name: string;
}

interface FormFields {
  name:                      string;
  code:                      string;
  category:                  LessonCategory;
  default_duration_minutes:  number;
  requires_vehicle:          boolean;
  requires_instructor:       boolean;
  max_students_per_slot:     number;
  color_hex:                 string;
  display_order:             number;
  is_active:                 boolean;
  pricing_sek:                string;
  group_id:                  string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<LessonCategory, string> = {
  driving:      'Körlektion',
  theory:       'Teorigenomgång',
  risk1:        'Riskettan',
  risk2:        'Risktvåan',
  simulator:    'Simulator',
  assessment:   'Bedömning',
  intensive:    'Intensivkurs',
  group_theory: 'Gruppteori',
  other:        'Övrigt',
};

// Scheduling — Admin-Friendly Booking: platform default is 40 minutes, not
// the old 60/45 figures — matches the new DB column default
// (lesson_types.default_duration_minutes, migration 20260821095807) for any
// newly-created lesson type. Existing lesson types are never rewritten.
function emptyForm(): FormFields {
  return {
    name: '', code: '', category: 'driving',
    default_duration_minutes: 40, requires_vehicle: true, requires_instructor: true,
    max_students_per_slot: 1, color_hex: '#3B82F6', display_order: 0, is_active: true,
    pricing_sek: '', group_id: null,
  };
}

function rowToForm(r: LessonTypeRow): FormFields {
  return {
    name: r.name, code: r.code, category: r.category,
    default_duration_minutes: r.default_duration_minutes,
    requires_vehicle: r.requires_vehicle, requires_instructor: r.requires_instructor,
    max_students_per_slot: r.max_students_per_slot, color_hex: r.color_hex,
    display_order: r.display_order, is_active: r.is_active,
    pricing_sek: r.pricing_sek !== null ? String(r.pricing_sek) : '',
    group_id: r.group_id,
  };
}

function validateForm(f: FormFields): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.name.trim()) e['name'] = 'Namn krävs.';
  if (!f.code.trim()) e['code'] = 'Kod krävs.';
  else if (!/^[a-z0-9_]+$/.test(f.code.trim())) e['code'] = 'Endast gemener, siffror och understreck.';
  // Scheduling — Admin-Friendly Booking: platform rule (mirrors the DB CHECK
  // constraint lesson_types_default_dur_rule) — minimum 40 minutes, 5-minute
  // granularity, no maximum.
  if (f.default_duration_minutes < 40) e['default_duration_minutes'] = 'Måste vara minst 40 minuter.';
  else if (f.default_duration_minutes % 5 !== 0) e['default_duration_minutes'] = 'Måste anges i steg om 5 minuter.';
  if (f.max_students_per_slot < 1) e['max_students_per_slot'] = 'Måste vara minst 1.';
  if (f.pricing_sek.trim() && !/^\d+(\.\d{1,2})?$/.test(f.pricing_sek.trim())) e['pricing_sek'] = 'Ogiltigt pris.';
  return e;
}

// ─── LektionstyperSettingsPage ────────────────────────────────────────────────

export function LektionstyperSettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const [sheetOpen,  setSheetOpen]  = useState(false);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [form,       setForm]       = useState<FormFields>(emptyForm);
  const [errors,     setErrors]     = useState<Record<string, string>>({});
  const [deleteRow,  setDeleteRow]  = useState<LessonTypeRow | null>(null);

  const { data: types = [], isLoading } = useQuery<LessonTypeRow[]>({
    queryKey: ['settings-lesson-types', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('lesson_types')
        .select('id, name, code, category, default_duration_minutes, requires_vehicle, requires_instructor, max_students_per_slot, color_hex, display_order, is_active, pricing_sek, group_id')
        .eq('organization_id', orgId)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as LessonTypeRow[];
    },
    enabled:   !!orgId,
    staleTime: 30_000,
  });

  const { data: groups = [] } = useQuery<LessonTypeGroupOption[]>({
    queryKey: ['settings-time-template-groups', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('lesson_type_groups')
        .select('id, name')
        .eq('organization_id', orgId)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as LessonTypeGroupOption[];
    },
    enabled:   !!orgId,
    staleTime: 30_000,
  });
  const groupMap = new Map(groups.map(g => [g.id, g.name]));

  const active   = types.filter(t => t.is_active);
  const inactive = types.filter(t => !t.is_active);

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['settings-lesson-types', orgId] });
    void qc.invalidateQueries({ queryKey: ['lesson-types'] }); // scheduling module's read cache
  }

  const createType = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const { error } = await supabase.from('lesson_types').insert({
        organization_id: orgId,
        name:            form.name.trim(),
        code:            form.code.trim(),
        category:        form.category,
        default_duration_minutes: form.default_duration_minutes,
        requires_vehicle:    form.requires_vehicle,
        requires_instructor: form.requires_instructor,
        max_students_per_slot: form.max_students_per_slot,
        color_hex:       form.color_hex,
        display_order:   form.display_order,
        is_active:       form.is_active,
        pricing_sek:     form.pricing_sek.trim() ? Number(form.pricing_sek.trim()) : null,
        group_id:        form.group_id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setSheetOpen(false);
      toast({ title: 'Lektionstyp skapad' });
    },
    onError: () => toast({ title: 'Fel vid skapande av lektionstyp', variant: 'destructive' }),
  });

  const updateType = useMutation({
    mutationFn: async () => {
      if (!orgId || !editingId) return;
      const { error } = await supabase.from('lesson_types').update({
        name:            form.name.trim(),
        code:            form.code.trim(),
        category:        form.category,
        default_duration_minutes: form.default_duration_minutes,
        requires_vehicle:    form.requires_vehicle,
        requires_instructor: form.requires_instructor,
        max_students_per_slot: form.max_students_per_slot,
        color_hex:       form.color_hex,
        display_order:   form.display_order,
        is_active:       form.is_active,
        pricing_sek:     form.pricing_sek.trim() ? Number(form.pricing_sek.trim()) : null,
        group_id:        form.group_id,
      } as never).eq('id', editingId).eq('organization_id', orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setSheetOpen(false);
      toast({ title: 'Lektionstyp uppdaterad' });
    },
    onError: () => toast({ title: 'Fel vid uppdatering', variant: 'destructive' }),
  });

  const deleteType = useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) return;
      const { error } = await supabase.from('lesson_types').delete().eq('id', id).eq('organization_id', orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setDeleteRow(null);
      toast({ title: 'Lektionstypen togs bort' });
    },
    onError: () => toast({
      title: 'Kunde inte ta bort lektionstypen',
      description: 'Den kan vara kopplad till befintliga bokningar — inaktivera den istället.',
      variant: 'destructive',
    }),
  });

  function openCreate() {
    setForm(emptyForm());
    setErrors({});
    setEditingId(null);
    setSheetOpen(true);
  }

  function openEdit(t: LessonTypeRow) {
    setForm(rowToForm(t));
    setErrors({});
    setEditingId(t.id);
    setSheetOpen(true);
  }

  function handleSave() {
    const errs = validateForm(form);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    if (editingId) updateType.mutate();
    else           createType.mutate();
  }

  const isPending = createType.isPending || updateType.isPending;

  return (
    <PermissionGate permission={Permissions.SCHEDULING_SLOT_READ}>
    <div className="max-w-2xl space-y-4">
      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/finance/accounts" className="hover:text-foreground">Ekonomi</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Lektionstyper</span>
        </nav>
        <PermissionGate permission={Permissions.SCHEDULING_SLOT_CREATE}>
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            Skapa lektionstyp
          </Button>
        </PermissionGate>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-green-100 text-green-600 flex items-center justify-center">
          <BookOpen className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Lektionstyper</h1>
        <p className="text-sm text-muted-foreground">
          Hantera lektionstyper för körlektioner. Varje lektionstyp kan använda olika styp- och tidsmallar.
        </p>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : types.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          Inga lektionstyper hittades.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {[...active, ...inactive].map(t => (
            <div
              key={t.id}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left"
            >
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color_hex }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {CATEGORY_LABELS[t.category]} · {t.default_duration_minutes} min
                  {t.pricing_sek !== null ? ` · ${t.pricing_sek} kr` : ''} · Ordning: {t.display_order}
                  {t.group_id && groupMap.has(t.group_id) ? ` · ${groupMap.get(t.group_id)}` : ''}
                </p>
              </div>
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
                t.is_active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground',
              )}>
                {t.is_active ? 'Aktiv' : 'Inaktiv'}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  title="Redigera"
                  onClick={() => openEdit(t)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Ta bort"
                  onClick={() => setDeleteRow(t)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="w-full sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 pr-12">
            <DialogTitle>{editingId ? 'Redigera lektionstyp' : 'Ny lektionstyp'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Uppdatera lektionstypens uppgifter.' : 'Lägg till en ny lektionstyp för er verksamhet.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <Field id="lt_name" label="Namn *" error={errors['name']}>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="t.ex. Körlektion B" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field id="lt_code" label="Kod *" error={errors['code']}>
                <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="t.ex. driving_b" />
              </Field>
              <Field id="lt_category" label="Kategori">
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as LessonCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field id="lt_duration" label="Längd (minuter)" error={errors['default_duration_minutes']}>
                <Input
                  type="number" min={40} step={5}
                  value={form.default_duration_minutes}
                  onChange={e => setForm(f => ({ ...f, default_duration_minutes: Number(e.target.value) }))}
                />
              </Field>
              <Field id="lt_price" label="Pris (kr, valfritt)" error={errors['pricing_sek']}>
                <Input
                  value={form.pricing_sek}
                  onChange={e => setForm(f => ({ ...f, pricing_sek: e.target.value }))}
                  placeholder="t.ex. 595"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field id="lt_maxstudents" label="Max elever per tillfälle" error={errors['max_students_per_slot']}>
                <Input
                  type="number" min={1}
                  value={form.max_students_per_slot}
                  onChange={e => setForm(f => ({ ...f, max_students_per_slot: Number(e.target.value) }))}
                />
              </Field>
              <Field id="lt_order" label="Sorteringsordning">
                <Input
                  type="number"
                  value={form.display_order}
                  onChange={e => setForm(f => ({ ...f, display_order: Number(e.target.value) }))}
                />
              </Field>
            </div>

            <Field id="lt_group" label="Tidmallsgrupp (valfritt)">
              <Select
                value={form.group_id ?? '__none__'}
                onValueChange={v => setForm(f => ({ ...f, group_id: v === '__none__' ? null : v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ingen grupp</SelectItem>
                  {groups.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field id="lt_color" label="Färg">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color_hex}
                  onChange={e => setForm(f => ({ ...f, color_hex: e.target.value }))}
                  className="w-9 h-9 rounded-md border border-border bg-background cursor-pointer"
                />
                <Input value={form.color_hex} onChange={e => setForm(f => ({ ...f, color_hex: e.target.value }))} className="font-mono" />
              </div>
            </Field>

            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Kräver fordon</p>
              </div>
              <Switch checked={form.requires_vehicle} onCheckedChange={v => setForm(f => ({ ...f, requires_vehicle: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Kräver lärare</p>
              </div>
              <Switch checked={form.requires_instructor} onCheckedChange={v => setForm(f => ({ ...f, requires_instructor: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Aktiv</p>
                <p className="text-xs text-muted-foreground mt-0.5">Inaktiva lektionstyper visas inte vid bokning.</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={isPending}>Avbryt</Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Sparar…' : editingId ? 'Spara ändringar' : 'Skapa lektionstyp'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteRow} onOpenChange={open => { if (!open) setDeleteRow(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ta bort lektionstyp</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort <strong>{deleteRow?.name}</strong>?{' '}
              Om lektionstypen redan används i bokningar går borttagningen inte att genomföra —
              inaktivera den istället via redigeringsvyn.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRow(null)} disabled={deleteType.isPending}>Avbryt</Button>
            <Button
              variant="destructive"
              disabled={deleteType.isPending}
              onClick={() => { if (deleteRow) deleteType.mutate(deleteRow.id); }}
            >
              {deleteType.isPending ? 'Tar bort…' : 'Ta bort'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PermissionGate>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  id, label, error, children,
}: {
  id:       string;
  label:    string;
  error?:   string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error !== undefined && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
