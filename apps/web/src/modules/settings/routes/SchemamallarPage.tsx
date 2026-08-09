import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  Button, Skeleton, Label, Input, Switch,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  toast,
} from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduleTemplate {
  id:            string;
  name:          string;
  cycle_weeks:   number;
  display_order: number;
  is_active:     boolean;
}

interface FormFields {
  name:          string;
  cycle_weeks:   number;
  display_order: number;
  is_active:     boolean;
}

function emptyForm(): FormFields {
  return { name: '', cycle_weeks: 1, display_order: 0, is_active: true };
}

// ─── SchemamallarPage ─────────────────────────────────────────────────────────

export function SchemamallarPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form,      setForm]      = useState<FormFields>(emptyForm);
  const [errors,    setErrors]    = useState<Record<string, string>>({});
  const [deleteRow, setDeleteRow] = useState<ScheduleTemplate | null>(null);

  const { data: templates = [], isLoading } = useQuery<ScheduleTemplate[]>({
    queryKey: ['settings-schedule-templates', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('schedule_templates')
        .select('id, name, cycle_weeks, display_order, is_active')
        .eq('organization_id', orgId)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScheduleTemplate[];
    },
    enabled:   !!orgId,
    staleTime: 30_000,
  });

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['settings-schedule-templates', orgId] });
  }

  const createTemplate = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const { error } = await supabase.from('schedule_templates').insert({
        organization_id: orgId,
        name:            form.name.trim(),
        cycle_weeks:     form.cycle_weeks,
        display_order:   form.display_order,
        is_active:       form.is_active,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setSheetOpen(false); toast({ title: 'Schemamall skapad' }); },
    onError: () => toast({ title: 'Fel vid skapande', variant: 'destructive' }),
  });

  const updateTemplate = useMutation({
    mutationFn: async () => {
      if (!orgId || !editingId) return;
      const { error } = await supabase.from('schedule_templates').update({
        name:          form.name.trim(),
        cycle_weeks:   form.cycle_weeks,
        display_order: form.display_order,
        is_active:     form.is_active,
      } as never).eq('id', editingId).eq('organization_id', orgId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setSheetOpen(false); toast({ title: 'Schemamall uppdaterad' }); },
    onError: () => toast({ title: 'Fel vid uppdatering', variant: 'destructive' }),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) return;
      const { error } = await supabase.from('schedule_templates').delete().eq('id', id).eq('organization_id', orgId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setDeleteRow(null); toast({ title: 'Schemamallen togs bort' }); },
    onError: () => toast({ title: 'Kunde inte ta bort schemamallen', variant: 'destructive' }),
  });

  function openCreate() { setForm(emptyForm()); setErrors({}); setEditingId(null); setSheetOpen(true); }
  function openEdit(t: ScheduleTemplate) {
    setForm({ name: t.name, cycle_weeks: t.cycle_weeks, display_order: t.display_order, is_active: t.is_active });
    setErrors({});
    setEditingId(t.id);
    setSheetOpen(true);
  }

  function handleSave() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs['name'] = 'Namn krävs.';
    if (form.cycle_weeks < 1 || form.cycle_weeks > 12) errs['cycle_weeks'] = 'Ange 1–12 veckor.';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    if (editingId) updateTemplate.mutate();
    else           createTemplate.mutate();
  }

  const isPending = createTemplate.isPending || updateTemplate.isPending;

  return (
    <PermissionGate permission={Permissions.SCHEDULING_SLOT_READ}>
    <div className="max-w-xl space-y-4">
      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/schema/time-templates" className="hover:text-foreground">Schema</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Schemamallar</span>
        </nav>
        <PermissionGate permission={Permissions.SCHEDULING_SLOT_CREATE}>
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            Skapa schemamall
          </Button>
        </PermissionGate>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
          <CalendarDays className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Schemamallar</h1>
        <p className="text-sm text-muted-foreground">
          Namngivna mallar för återkommande scheman — en referens ni kan använda när ni bygger bokningsschemat.
        </p>
      </div>

      {/* Template list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          Inga schemamallar har skapats ännu.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {templates.map(t => (
            <div key={t.id} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left">
              <CalendarDays className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary">{t.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t.cycle_weeks} {t.cycle_weeks === 1 ? 'vecka' : 'veckor'} · Ordning: {t.display_order}
                  {!t.is_active ? ' · Inaktiv' : ''}
                </p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" title="Redigera" onClick={() => openEdit(t)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button type="button" title="Ta bort" onClick={() => setDeleteRow(t)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="w-full sm:max-w-sm max-h-[85vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 pr-12">
            <DialogTitle>{editingId ? 'Redigera schemamall' : 'Ny schemamall'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Uppdatera mallens uppgifter.' : 'Lägg till en ny namngiven schemamall.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="st_name">Namn *</Label>
              <Input id="st_name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="t.ex. Standardschema" />
              {errors['name'] && <p className="text-xs text-destructive">{errors['name']}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="st_cycle">Cykellängd (veckor)</Label>
                <Input id="st_cycle" type="number" min={1} max={12} value={form.cycle_weeks} onChange={e => setForm(f => ({ ...f, cycle_weeks: Number(e.target.value) }))} />
                {errors['cycle_weeks'] && <p className="text-xs text-destructive">{errors['cycle_weeks']}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st_order">Sorteringsordning</Label>
                <Input id="st_order" type="number" value={form.display_order} onChange={e => setForm(f => ({ ...f, display_order: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-sm font-medium text-foreground">Aktiv</p>
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={isPending}>Avbryt</Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Sparar…' : editingId ? 'Spara ändringar' : 'Skapa schemamall'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteRow} onOpenChange={open => { if (!open) setDeleteRow(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ta bort schemamall</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort <strong>{deleteRow?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRow(null)} disabled={deleteTemplate.isPending}>Avbryt</Button>
            <Button variant="destructive" disabled={deleteTemplate.isPending} onClick={() => { if (deleteRow) deleteTemplate.mutate(deleteRow.id); }}>
              {deleteTemplate.isPending ? 'Tar bort…' : 'Ta bort'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PermissionGate>
  );
}
