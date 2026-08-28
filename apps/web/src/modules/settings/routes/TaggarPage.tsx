import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Tag, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  Button, Skeleton, Label, Input,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  toast,
} from '@platform/ui';
import {
  useOrgStudentTags, useCreateTag, useUpdateTag, useDeleteTag,
  type StudentTag,
} from '@modules/students/hooks/useStudents.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormFields {
  name:        string;
  color:       string;
  description: string;
}

function emptyForm(): FormFields {
  return { name: '', color: '#94A3B8', description: '' };
}

function tagToForm(t: StudentTag): FormFields {
  return { name: t.name, color: t.color ?? '#94A3B8', description: t.description ?? '' };
}

// ─── TaggarPage ───────────────────────────────────────────────────────────────
//
// Reuses the tag CRUD hooks already built for the student-detail TagManagerDialog
// (apps/web/src/modules/students/hooks/useStudents.ts) — same backend, same
// student_tags table, no duplicate implementation. This page is the canonical
// Tenant Settings surface for tag management (business/customer configuration).

export function TaggarPage() {
  const { data: tags = [], isLoading } = useOrgStudentTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form,      setForm]      = useState<FormFields>(emptyForm);
  const [error,     setError]     = useState('');
  const [deleteRow, setDeleteRow] = useState<StudentTag | null>(null);

  function openCreate() { setForm(emptyForm()); setError(''); setEditingId(null); setSheetOpen(true); }
  function openEdit(t: StudentTag) { setForm(tagToForm(t)); setError(''); setEditingId(t.id); setSheetOpen(true); }

  function handleSave() {
    if (!form.name.trim()) { setError('Namn krävs.'); return; }
    if (editingId) {
      updateTag.mutate(
        { id: editingId, name: form.name.trim(), color: form.color, description: form.description.trim() || null },
        { onSuccess: () => { setSheetOpen(false); toast({ title: 'Taggen uppdaterades' }); }, onError: () => toast({ title: 'Fel vid uppdatering', variant: 'destructive' }) },
      );
    } else {
      createTag.mutate(
        { name: form.name.trim(), color: form.color, description: form.description.trim() || null },
        { onSuccess: () => { setSheetOpen(false); toast({ title: 'Taggen skapades' }); }, onError: () => toast({ title: 'Fel vid skapande', variant: 'destructive' }) },
      );
    }
  }

  function handleDelete() {
    if (!deleteRow) return;
    deleteTag.mutate(deleteRow.id, {
      onSuccess: () => { setDeleteRow(null); toast({ title: 'Taggen togs bort' }); },
      onError: () => toast({ title: 'Kunde inte ta bort taggen', variant: 'destructive' }),
    });
  }

  const isPending = createTag.isPending || updateTag.isPending;

  return (
    <div className="max-w-xl space-y-4">
      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/customers/config" className="hover:text-foreground">Kunder</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Taggar</span>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            Skapa ny tagg
          </Button>
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
          <Tag className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Taggar</h1>
        <p className="text-sm text-muted-foreground">Hantera taggar för kunder.</p>
      </div>

      {/* Tag list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : tags.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          Inga taggar har skapats ännu.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {tags.map(tag => (
            <div key={tag.id} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left">
              <div className="w-6 h-6 rounded-full border border-border shrink-0" style={{ backgroundColor: tag.color ?? '#94A3B8' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{tag.name}</p>
                {tag.description && <p className="text-xs text-muted-foreground mt-0.5">{tag.description}</p>}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" title="Redigera" onClick={() => openEdit(tag)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button type="button" title="Ta bort" onClick={() => setDeleteRow(tag)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
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
            <DialogTitle>{editingId ? 'Redigera tagg' : 'Ny tagg'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Uppdatera taggens uppgifter.' : 'Lägg till en ny tagg för att kategorisera kunder.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tag_name">Namn *</Label>
              <Input id="tag_name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="t.ex. VIP" />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tag_color">Färg</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  className="w-9 h-9 rounded-md border border-border bg-background cursor-pointer"
                />
                <Input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="font-mono" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tag_desc">Beskrivning (valfri)</Label>
              <Input id="tag_desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Kort beskrivning" />
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={isPending}>Avbryt</Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Sparar…' : editingId ? 'Spara ändringar' : 'Skapa tagg'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteRow} onOpenChange={open => { if (!open) setDeleteRow(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ta bort tagg</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort <strong>{deleteRow?.name}</strong>? Taggen tas bort från alla kunder den är kopplad till.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRow(null)} disabled={deleteTag.isPending}>Avbryt</Button>
            <Button variant="destructive" disabled={deleteTag.isPending} onClick={handleDelete}>
              {deleteTag.isPending ? 'Tar bort…' : 'Ta bort'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
