import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, ChevronRight, Plus, Pencil, Trash2, X } from 'lucide-react';
import {
  Button, Skeleton, Label, Input,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  toast,
} from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useOrgStudentTags } from '@modules/students/hooks/useStudents.js';

// ─── Rule vocabulary ────────────────────────────────────────────────────────
//
// Deliberately curated to fields that already exist on students / tags —
// no invented columns. Rules are evaluated client-side against fetched
// student rows, never as generated SQL, so there is no injection surface.

type FieldKey = 'status' | 'target_licence_category' | 'permit_stage' | 'marketing_consent' | 'tag_id';
type Operator = 'equals' | 'not_equals' | 'is_true' | 'is_false';

interface SegmentRule {
  field:    FieldKey;
  operator: Operator;
  value:    string | null;
}

interface FieldDef {
  label:      string;
  operators:  Operator[];
  options?:   { value: string; label: string }[]; // for 'equals'/'not_equals' — fixed choice list
}

const OPERATOR_LABELS: Record<Operator, string> = {
  equals: 'är', not_equals: 'är inte', is_true: 'är sant', is_false: 'är falskt',
};

const STATUS_OPTIONS = [
  { value: 'lead', label: 'Lead' }, { value: 'active', label: 'Aktiv' },
  { value: 'paused', label: 'Pausad' }, { value: 'completed', label: 'Klar' },
  { value: 'archived', label: 'Arkiverad' },
];

const PERMIT_STAGE_OPTIONS = [
  { value: 'not_started', label: 'Ej påbörjad' }, { value: 'in_progress', label: 'Pågående' },
  { value: 'theory_passed', label: 'Teori godkänd' }, { value: 'practical_passed', label: 'Uppkörning godkänd' },
  { value: 'licensed', label: 'Körkort utfärdat' },
];

// ─── SegmentPage ──────────────────────────────────────────────────────────────

interface CustomerSegment {
  id:            string;
  name:          string;
  match_mode:    'and' | 'or';
  rules:         SegmentRule[];
  display_order: number;
  is_active:     boolean;
}

interface FormFields {
  name:          string;
  match_mode:    'and' | 'or';
  rules:         SegmentRule[];
  display_order: number;
}

interface StudentRow {
  id:                       string;
  status:                   string;
  target_licence_category:  string;
  permit_stage:             string;
  marketing_consent:        boolean;
}

function emptyForm(): FormFields {
  return { name: '', match_mode: 'and', rules: [], display_order: 0 };
}

export function SegmentPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const { data: availableTags = [] } = useOrgStudentTags();

  const FIELD_DEFS: Record<FieldKey, FieldDef> = useMemo(() => ({
    status:                  { label: 'Status',           operators: ['equals', 'not_equals'], options: STATUS_OPTIONS },
    target_licence_category: { label: 'Behörighet',       operators: ['equals', 'not_equals'], options: [] },
    permit_stage:             { label: 'Utbildningssteg',  operators: ['equals', 'not_equals'], options: PERMIT_STAGE_OPTIONS },
    marketing_consent:       { label: 'Marknadsföringssamtycke', operators: ['is_true', 'is_false'] },
    tag_id:                  { label: 'Tagg',              operators: ['equals', 'not_equals'], options: availableTags.map(t => ({ value: t.id, label: t.name })) },
  }), [availableTags]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form,      setForm]      = useState<FormFields>(emptyForm);
  const [error,     setError]     = useState('');
  const [deleteRow, setDeleteRow] = useState<CustomerSegment | null>(null);

  const { data: segments = [], isLoading } = useQuery<CustomerSegment[]>({
    queryKey: ['settings-customer-segments', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error: err } = await supabase
        .from('customer_segments')
        .select('id, name, match_mode, rules, display_order, is_active')
        .eq('organization_id', orgId)
        .order('display_order', { ascending: true });
      if (err) throw err;
      return (data ?? []) as CustomerSegment[];
    },
    enabled:   !!orgId,
    staleTime: 30_000,
  });

  const { data: students = [] } = useQuery<StudentRow[]>({
    queryKey: ['settings-customer-segments-students', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error: err } = await supabase
        .from('students')
        .select('id, status, target_licence_category, permit_stage, marketing_consent')
        .eq('organization_id', orgId)
        .is('deleted_at', null);
      if (err) throw err;
      return (data ?? []) as StudentRow[];
    },
    enabled:   !!orgId,
    staleTime: 60_000,
  });

  const { data: tagAssignments = [] } = useQuery<{ student_id: string; tag_id: string }[]>({
    queryKey: ['settings-customer-segments-tag-assignments', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error: err } = await supabase
        .from('student_tag_assignments')
        .select('student_id, tag_id');
      if (err) throw err;
      return (data ?? []) as { student_id: string; tag_id: string }[];
    },
    enabled:   !!orgId,
    staleTime: 60_000,
  });

  const tagsByStudent = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const a of tagAssignments) {
      const set = m.get(a.student_id) ?? new Set<string>();
      set.add(a.tag_id);
      m.set(a.student_id, set);
    }
    return m;
  }, [tagAssignments]);

  function ruleMatches(student: StudentRow, rule: SegmentRule): boolean {
    if (rule.field === 'tag_id') {
      const has = (tagsByStudent.get(student.id) ?? new Set()).has(rule.value ?? '');
      return rule.operator === 'not_equals' ? !has : has;
    }
    if (rule.field === 'marketing_consent') {
      return rule.operator === 'is_true' ? student.marketing_consent : !student.marketing_consent;
    }
    const actual = String(student[rule.field]);
    const match  = actual === rule.value;
    return rule.operator === 'not_equals' ? !match : match;
  }

  function countMembers(segment: CustomerSegment): number {
    if (segment.rules.length === 0) return 0;
    return students.filter(s =>
      segment.match_mode === 'and'
        ? segment.rules.every(r => ruleMatches(s, r))
        : segment.rules.some(r => ruleMatches(s, r)),
    ).length;
  }

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['settings-customer-segments', orgId] });
  }

  const createSegment = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const { error: err } = await supabase.from('customer_segments').insert({
        organization_id: orgId,
        name:            form.name.trim(),
        match_mode:      form.match_mode,
        rules:           form.rules,
        display_order:   form.display_order,
      } as never);
      if (err) throw err;
    },
    onSuccess: () => { invalidate(); setSheetOpen(false); toast({ title: 'Segment skapat' }); },
    onError: () => toast({ title: 'Fel vid skapande', variant: 'destructive' }),
  });

  const updateSegment = useMutation({
    mutationFn: async () => {
      if (!orgId || !editingId) return;
      const { error: err } = await supabase.from('customer_segments').update({
        name:          form.name.trim(),
        match_mode:    form.match_mode,
        rules:         form.rules,
        display_order: form.display_order,
      } as never).eq('id', editingId).eq('organization_id', orgId);
      if (err) throw err;
    },
    onSuccess: () => { invalidate(); setSheetOpen(false); toast({ title: 'Segment uppdaterat' }); },
    onError: () => toast({ title: 'Fel vid uppdatering', variant: 'destructive' }),
  });

  const deleteSegment = useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) return;
      const { error: err } = await supabase.from('customer_segments').delete().eq('id', id).eq('organization_id', orgId);
      if (err) throw err;
    },
    onSuccess: () => { invalidate(); setDeleteRow(null); toast({ title: 'Segmentet togs bort' }); },
    onError: () => toast({ title: 'Kunde inte ta bort segmentet', variant: 'destructive' }),
  });

  function openCreate() { setForm(emptyForm()); setError(''); setEditingId(null); setSheetOpen(true); }
  function openEdit(s: CustomerSegment) {
    setForm({ name: s.name, match_mode: s.match_mode, rules: s.rules, display_order: s.display_order });
    setError('');
    setEditingId(s.id);
    setSheetOpen(true);
  }

  function addRule() {
    setForm(f => ({ ...f, rules: [...f.rules, { field: 'status', operator: 'equals', value: STATUS_OPTIONS[0]!.value }] }));
  }
  function updateRule(idx: number, patch: Partial<SegmentRule>) {
    setForm(f => ({ ...f, rules: f.rules.map((r, i) => i === idx ? { ...r, ...patch } : r) }));
  }
  function removeRule(idx: number) {
    setForm(f => ({ ...f, rules: f.rules.filter((_, i) => i !== idx) }));
  }

  function handleSave() {
    if (!form.name.trim()) { setError('Namn krävs.'); return; }
    if (editingId) updateSegment.mutate();
    else           createSegment.mutate();
  }

  const isPending = createSegment.isPending || updateSegment.isPending;

  return (
    <PermissionGate permission={Permissions.STUDENTS_READ}>
    <div className="max-w-xl space-y-4">
      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/customers/config" className="hover:text-foreground">Kunder</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Segment</span>
        </nav>
        <PermissionGate permission={Permissions.STUDENTS_CREATE}>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            Skapa nytt segment
          </Button>
        </PermissionGate>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
          <LayoutGrid className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Segment</h1>
        <p className="text-sm text-muted-foreground">Skapa och hantera dynamiska segment baserade på kriterier.</p>
      </div>

      {/* Segment list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : segments.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          Inga segment har skapats ännu.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {segments.map(seg => (
            <div key={seg.id} className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors text-left">
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary">{seg.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {seg.match_mode === 'and' ? 'Och (alla regler måste vara uppfyllda)' : 'Eller (minst en regel måste vara uppfylld)'}
                  {' · '}{seg.rules.length} {seg.rules.length === 1 ? 'regel' : 'regler'}
                  {' · '}{countMembers(seg)} kunder
                </p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" title="Redigera" onClick={() => openEdit(seg)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button type="button" title="Ta bort" onClick={() => setDeleteRow(seg)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
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
            <DialogTitle>{editingId ? 'Redigera segment' : 'Nytt segment'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Uppdatera segmentets regler.' : 'Bygg ett dynamiskt segment av kriterier.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="seg_name">Namn *</Label>
              <Input id="seg_name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="t.ex. Aktiva B-elever" />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="seg_mode">Matchningsläge</Label>
              <Select value={form.match_mode} onValueChange={v => setForm(f => ({ ...f, match_mode: v as 'and' | 'or' }))}>
                <SelectTrigger id="seg_mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="and">Och — alla regler måste vara uppfyllda</SelectItem>
                  <SelectItem value="or">Eller — minst en regel måste vara uppfylld</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Regler</Label>
                <Button size="sm" variant="outline" onClick={addRule}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Lägg till regel
                </Button>
              </div>

              {form.rules.length === 0 ? (
                <p className="text-xs text-muted-foreground">Inga regler ännu — segmentet matchar inga kunder förrän minst en regel läggs till.</p>
              ) : (
                <div className="space-y-2">
                  {form.rules.map((rule, idx) => {
                    const def = FIELD_DEFS[rule.field];
                    return (
                      <div key={idx} className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2">
                        <Select value={rule.field} onValueChange={v => {
                          const nextDef = FIELD_DEFS[v as FieldKey];
                          updateRule(idx, {
                            field: v as FieldKey,
                            operator: nextDef.operators[0]!,
                            value: nextDef.options?.[0]?.value ?? null,
                          });
                        }}>
                          <SelectTrigger className="w-[150px] shrink-0"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.entries(FIELD_DEFS) as [FieldKey, FieldDef][]).map(([key, d]) => (
                              <SelectItem key={key} value={key}>{d.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select value={rule.operator} onValueChange={v => updateRule(idx, { operator: v as Operator })}>
                          <SelectTrigger className="w-[110px] shrink-0"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {def.operators.map(op => (
                              <SelectItem key={op} value={op}>{OPERATOR_LABELS[op]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {def.operators[0] !== 'is_true' && (
                          def.options && def.options.length > 0 ? (
                            <Select value={rule.value ?? ''} onValueChange={v => updateRule(idx, { value: v })}>
                              <SelectTrigger className="flex-1 min-w-0"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {def.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              className="flex-1 min-w-0"
                              value={rule.value ?? ''}
                              onChange={e => updateRule(idx, { value: e.target.value })}
                              placeholder={rule.field === 'target_licence_category' ? 't.ex. B' : 'värde'}
                            />
                          )
                        )}

                        <button type="button" onClick={() => removeRule(idx)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={isPending}>Avbryt</Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Sparar…' : editingId ? 'Spara ändringar' : 'Skapa segment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteRow} onOpenChange={open => { if (!open) setDeleteRow(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ta bort segment</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort <strong>{deleteRow?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRow(null)} disabled={deleteSegment.isPending}>Avbryt</Button>
            <Button variant="destructive" disabled={deleteSegment.isPending} onClick={() => { if (deleteRow) deleteSegment.mutate(deleteRow.id); }}>
              {deleteSegment.isPending ? 'Tar bort…' : 'Ta bort'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PermissionGate>
  );
}
