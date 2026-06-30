import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, Textarea, toast,
} from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

const LICENSE_CATEGORIES = ['A', 'A1', 'A2', 'AM', 'B', 'B96', 'BE', 'C', 'CE', 'D', 'DE'];

interface CreateLeadDialogProps {
  open:        boolean;
  onOpenChange: (open: boolean) => void;
  onCreated:   () => void;
}

export function CreateLeadDialog({ open, onOpenChange, onCreated }: CreateLeadDialogProps) {
  const { organization } = useSession();
  const orgId = organization?.id;

  const [form, setForm] = useState({
    first_name:       '',
    last_name:        '',
    email:            '',
    phone:            '',
    license_category: 'B',
    notes:            '',
    source:           'manual',
  });

  function set(key: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('No org');
      const { error } = await supabase.from('student_leads').insert({
        organization_id:  orgId,
        first_name:       form.first_name.trim(),
        last_name:        form.last_name.trim(),
        email:            form.email.trim() || null,
        phone:            form.phone.trim() || null,
        license_category: form.license_category,
        notes:            form.notes.trim() || null,
        source:           form.source,
        status:           'new',
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: 'Lead skapad' });
      setForm({ first_name: '', last_name: '', email: '', phone: '', license_category: 'B', notes: '', source: 'manual' });
      onOpenChange(false);
      onCreated();
    },
    onError: (e) => toast({ title: 'Fel', description: e.message, variant: 'destructive' }),
  });

  const canSubmit = form.first_name.trim().length > 0 && form.last_name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Ny lead</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Förnamn *</label>
              <Input
                placeholder="Förnamn"
                value={form.first_name}
                onChange={e => set('first_name', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Efternamn *</label>
              <Input
                placeholder="Efternamn"
                value={form.last_name}
                onChange={e => set('last_name', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">E-post</label>
            <Input
              type="email"
              placeholder="elev@exempel.se"
              value={form.email}
              onChange={e => set('email', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Telefon</label>
            <Input
              type="tel"
              placeholder="070-000 00 00"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Behörighet</label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={form.license_category}
              onChange={e => set('license_category', e.target.value)}
            >
              {LICENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Anteckningar</label>
            <Textarea
              placeholder="Valfria anteckningar…"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              className="resize-none text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!canSubmit || create.isPending}
          >
            {create.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Skapa lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
