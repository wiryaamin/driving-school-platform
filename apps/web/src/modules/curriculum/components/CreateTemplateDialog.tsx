import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, Textarea,
} from '@platform/ui';

const LICENSE_CATEGORIES = ['A', 'A1', 'A2', 'AM', 'B', 'B96', 'BE', 'C', 'CE', 'D', 'DE'];

// Must match training_plan_templates' tpt_purpose_check constraint exactly
// (supabase/migrations/20260528000014_phase2fa_core.sql) — this is a closed,
// 4-value domain, not free text.
const PURPOSES: { value: string; label: string }[] = [
  { value: 'acquisition',    label: 'Grundutbildning (ny behörighet)' },
  { value: 'renewal',        label: 'Förnyelse (utgången behörighet)' },
  { value: 'professional',   label: 'Yrkesutbildning' },
  { value: 'rehabilitation', label: 'Rehabilitering' },
];

interface CreateTemplateInput {
  code:             string;
  name_sv:          string;
  licence_category: string;
  purpose:          string;
  description_sv?:  string | undefined;
}

interface CreateTemplateDialogProps {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onCreate:     (input: CreateTemplateInput) => Promise<void>;
  isPending:    boolean;
}

export function CreateTemplateDialog({ open, onOpenChange, onCreate, isPending }: CreateTemplateDialogProps) {
  const [form, setForm] = useState<CreateTemplateInput>({
    code:             '',
    name_sv:          '',
    licence_category: 'B',
    purpose:          'acquisition',
    description_sv:   '',
  });

  function set<K extends keyof CreateTemplateInput>(key: K, value: CreateTemplateInput[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  const canSubmit = form.code.trim().length > 0 && form.name_sv.trim().length > 0 && form.purpose.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Ny utbildningsmall</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Mallkod *</label>
              <Input
                placeholder="t.ex. B-STANDARD"
                value={form.code}
                onChange={e => set('code', e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Behörighet *</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={form.licence_category}
                onChange={e => set('licence_category', e.target.value)}
              >
                {LICENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Mallnamn *</label>
            <Input
              placeholder="t.ex. Standard körkortsutbildning B"
              value={form.name_sv}
              onChange={e => set('name_sv', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Syfte *</label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={form.purpose}
              onChange={e => set('purpose', e.target.value)}
            >
              {PURPOSES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Beskrivning</label>
            <Textarea
              placeholder="Beskriv utbildningsplanen..."
              value={form.description_sv ?? ''}
              onChange={e => set('description_sv', e.target.value)}
              rows={3}
              className="resize-none text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button
            onClick={() => void onCreate({ ...form, description_sv: form.description_sv || undefined })}
            disabled={!canSubmit || isPending}
          >
            {isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Skapa mall
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
