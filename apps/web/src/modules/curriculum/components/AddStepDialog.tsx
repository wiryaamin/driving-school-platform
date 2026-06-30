import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, Textarea,
} from '@platform/ui';
import type { TemplateStep } from '../hooks/useCurriculum.js';

interface AddStepInput {
  step_number:           number;
  name_sv:               string;
  step_type:             TemplateStep['step_type'];
  required_lesson_count?: number;
  estimated_minutes?:    number;
  is_mandatory:          boolean;
  notes_sv?:             string;
}

interface AddStepDialogProps {
  open:            boolean;
  onOpenChange:    (open: boolean) => void;
  nextStepNumber:  number;
  onCreate:        (input: AddStepInput) => Promise<void>;
  isPending:       boolean;
}

const STEP_TYPES: { value: TemplateStep['step_type']; label: string }[] = [
  { value: 'lesson_block',   label: 'Lektionsblock'    },
  { value: 'milestone',      label: 'Milstolpe'         },
  { value: 'gate_check',     label: 'Grindkontroll'     },
  { value: 'external_event', label: 'Externt evenemang' },
];

export function AddStepDialog({ open, onOpenChange, nextStepNumber, onCreate, isPending }: AddStepDialogProps) {
  const [form, setForm] = useState<AddStepInput>({
    step_number:  nextStepNumber,
    name_sv:      '',
    step_type:    'lesson_block',
    is_mandatory: true,
  });

  function set<K extends keyof AddStepInput>(key: K, value: AddStepInput[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  const canSubmit = form.name_sv.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Lägg till steg</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Stegnummer</label>
              <Input
                type="number"
                min={1}
                value={form.step_number}
                onChange={e => set('step_number', parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Typ</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={form.step_type}
                onChange={e => set('step_type', e.target.value as TemplateStep['step_type'])}
              >
                {STEP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Stegnamn *</label>
            <Input
              placeholder="t.ex. Grundläggande körteori"
              value={form.name_sv}
              onChange={e => set('name_sv', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Antal lektioner</label>
              <Input
                type="number"
                min={0}
                placeholder="t.ex. 5"
                value={form.required_lesson_count ?? ''}
                onChange={e => set('required_lesson_count', e.target.value ? parseInt(e.target.value, 10) : undefined)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Tid (minuter)</label>
              <Input
                type="number"
                min={0}
                placeholder="t.ex. 90"
                value={form.estimated_minutes ?? ''}
                onChange={e => set('estimated_minutes', e.target.value ? parseInt(e.target.value, 10) : undefined)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="is_mandatory"
              type="checkbox"
              className="rounded border-input"
              checked={form.is_mandatory}
              onChange={e => set('is_mandatory', e.target.checked)}
            />
            <label htmlFor="is_mandatory" className="text-sm text-foreground cursor-pointer">
              Obligatoriskt steg
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Anteckningar</label>
            <Textarea
              placeholder="Valfria instruktioner..."
              value={form.notes_sv ?? ''}
              onChange={e => set('notes_sv', e.target.value || undefined)}
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button
            onClick={() => void onCreate(form)}
            disabled={!canSubmit || isPending}
          >
            {isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Lägg till
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
