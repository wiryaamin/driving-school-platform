import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  Button, Skeleton, Label, Input,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  toast,
} from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimeTemplateGroup {
  id:            string;
  name:          string;
  display_order: number;
}

interface FormFields {
  name:          string;
  display_order: number;
}

function emptyForm(): FormFields {
  return { name: '', display_order: 0 };
}

// ─── TidmallsgrupperPage ──────────────────────────────────────────────────────

export function TidmallsgrupperPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form,      setForm]      = useState<FormFields>(emptyForm);
  const [errors,    setErrors]    = useState<Record<string, string>>({});
  const [deleteRow, setDeleteRow] = useState<TimeTemplateGroup | null>(null);

  const { data: groups = [], isLoading } = useQuery<TimeTemplateGroup[]>({
    queryKey: ['settings-time-template-groups', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('lesson_type_groups')
        .select('id, name, display_order')
        .eq('organization_id', orgId)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TimeTemplateGroup[];
    },
    enabled:   !!orgId,
    staleTime: 30_000,
  });

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['settings-time-template-groups', orgId] });
    void qc.invalidateQueries({ queryKey: ['settings-lesson-types', orgId] });
  }

  const createGroup = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const { error } = await supabase.from('lesson_type_groups').insert({
        organization_id: orgId,
        name:            form.name.trim(),
        display_order:   form.display_order,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setSheetOpen(false); toast({ title: 'Tidmallsgrupp skapad' }); },
    onError: () => toast({ title: 'Fel vid skapande', variant: 'destructive' }),
  });

  const updateGroup = useMutation({
    mutationFn: async () => {
      if (!orgId || !editingId) return;
      const { error } = await supabase.from('lesson_type_groups').update({
        name:          form.name.trim(),
        display_order: form.display_order,
      } as never).eq('id', editingId).eq('organization_id', orgId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setSheetOpen(false); toast({ title: 'Tidmallsgrupp uppdaterad' }); },
    onError: () => toast({ title: 'Fel vid uppdatering', variant: 'destructive' }),
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) return;
      const { error } = await supabase.from('lesson_type_groups').delete().eq('id', id).eq('organization_id', orgId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setDeleteRow(null); toast({ title: 'Tidmallsgruppen togs bort' }); },
    onError: () => toast({ title: 'Kunde inte ta bort gruppen', variant: 'destructive' }),
  });

  function openCreate() { setForm(emptyForm()); setErrors({}); setEditingId(null); setSheetOpen(true); }
  function openEdit(g: TimeTemplateGroup) {
    setForm({ name: g.name, display_order: g.display_order });
    setErrors({});
    setEditingId(g.id);
    setSheetOpen(true);
  }

  function handleSave() {
    if (!form.name.trim()) { setErrors({ name: 'Namn krävs.' }); return; }
    if (editingId) updateGroup.mutate();
    else           createGroup.mutate();
  }

  const isPending = createGroup.isPending || updateGroup.isPending;

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
          <span className="text-foreground">Tidmallsgrupper</span>
        </nav>
        <PermissionGate permission={Permissions.SCHEDULING_SLOT_CREATE}>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            Skapa tidmallsgrupp
          </Button>
        </PermissionGate>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
          <CalendarDays className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Tidmallsgrupper</h1>
        <p className="text-sm text-muted-foreground">
          Gruppera lektionstyper för att organisera bokningsschema och bokningslista.
        </p>
      </div>

      {/* Group list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          Inga tidmallsgrupper har skapats ännu.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {groups.map(g => (
            <div key={g.id} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary">{g.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Ordning: {g.display_order}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" title="Redigera" onClick={() => openEdit(g)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button type="button" title="Ta bort" onClick={() => setDeleteRow(g)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
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
            <DialogTitle>{editingId ? 'Redigera tidmallsgrupp' : 'Ny tidmallsgrupp'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Uppdatera gruppens uppgifter.' : 'Lägg till en ny grupp för att organisera lektionstyper.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tg_name">Namn *</Label>
              <Input id="tg_name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="t.ex. Körlektioner" />
              {errors['name'] && <p className="text-xs text-destructive">{errors['name']}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tg_order">Sorteringsordning</Label>
              <Input id="tg_order" type="number" value={form.display_order} onChange={e => setForm(f => ({ ...f, display_order: Number(e.target.value) }))} />
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={isPending}>Avbryt</Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Sparar…' : editingId ? 'Spara ändringar' : 'Skapa grupp'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteRow} onOpenChange={open => { if (!open) setDeleteRow(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ta bort tidmallsgrupp</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort <strong>{deleteRow?.name}</strong>? Lektionstyper i gruppen blir ogrupperade.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRow(null)} disabled={deleteGroup.isPending}>Avbryt</Button>
            <Button variant="destructive" disabled={deleteGroup.isPending} onClick={() => { if (deleteRow) deleteGroup.mutate(deleteRow.id); }}>
              {deleteGroup.isPending ? 'Tar bort…' : 'Ta bort'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PermissionGate>
  );
}
