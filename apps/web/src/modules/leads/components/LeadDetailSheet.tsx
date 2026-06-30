import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mail, Phone, Calendar, Tag, FileText, CheckCircle, XCircle, ArrowRight, Loader2, UserPlus,
} from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
  Button, Textarea, ScrollArea, toast,
} from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { cn } from '@/lib/utils.js';
import type { Lead, LeadStatus } from '../routes/LeadsPage.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  new:       'Ny',
  contacted: 'Kontaktad',
  enrolled:  'Inskriven',
  declined:  'Avböjd',
};

const STATUS_ACTIONS: Partial<Record<LeadStatus, { to: LeadStatus; label: string }[]>> = {
  new:       [{ to: 'contacted', label: 'Markera kontaktad' }, { to: 'declined', label: 'Avböj' }],
  contacted: [{ to: 'enrolled',  label: 'Skriv in som elev' }, { to: 'declined', label: 'Avböj' }],
};

// ─── LeadDetailSheet ──────────────────────────────────────────────────────────

export interface LeadDetailSheetProps {
  lead:           Lead;
  open:           boolean;
  onOpenChange:   (open: boolean) => void;
  onStatusChange: (status: LeadStatus) => void;
  onConverted:    () => void;
}

export function LeadDetailSheet({
  lead, open, onOpenChange, onStatusChange, onConverted,
}: LeadDetailSheetProps) {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [editingNotes, setEditingNotes] = useState(false);

  const updateNotes = useMutation({
    mutationFn: async (text: string) => {
      const { error } = await supabase
        .from('student_leads')
        .update({ notes: text, updated_at: new Date().toISOString() } as never)
        .eq('id', lead.id)
        .eq('organization_id', orgId!);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads', orgId] });
      setEditingNotes(false);
      toast({ title: 'Anteckningar sparade' });
    },
    onError: (e) => toast({ title: 'Fel', description: e.message, variant: 'destructive' }),
  });

  const convertToStudent = useMutation({
    mutationFn: async () => {
      // Insert a new student record
      const { error: sErr } = await supabase.from('students').insert({
        organization_id: orgId!,
        first_name:      lead.first_name,
        last_name:       lead.last_name,
        email:           lead.email,
        phone:           lead.phone,
        notes:           lead.notes,
        status:          'active',
        permit_category: lead.license_category,
      } as never);
      if (sErr) throw new Error(sErr.message);

      // Mark lead as enrolled
      const { error: lErr } = await supabase
        .from('student_leads')
        .update({ status: 'enrolled', updated_at: new Date().toISOString() } as never)
        .eq('id', lead.id)
        .eq('organization_id', orgId!);
      if (lErr) throw new Error(lErr.message);
    },
    onSuccess: () => {
      toast({ title: `${lead.first_name} ${lead.last_name} inskriven som elev` });
      onConverted();
    },
    onError: (e) => toast({ title: 'Konvertering misslyckades', description: e.message, variant: 'destructive' }),
  });

  const actions = STATUS_ACTIONS[lead.status] ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md flex flex-col p-0 gap-0">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-sm font-bold text-purple-700 dark:text-purple-300">
              {lead.first_name.charAt(0)}{lead.last_name.charAt(0)}
            </div>
            <div>
              <SheetTitle className="text-base font-bold">
                {lead.first_name} {lead.last_name}
              </SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {STATUS_LABELS[lead.status]} · {lead.license_category}
              </p>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-4 space-y-5">

            {/* Contact info */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kontakt</p>
              {lead.email ? (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                  <Mail className="w-4 h-4 shrink-0" />
                  {lead.email}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground flex items-center gap-2"><Mail className="w-4 h-4" /> Ingen e-post</p>
              )}
              {lead.phone ? (
                <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                  <Phone className="w-4 h-4 shrink-0" />
                  {lead.phone}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground flex items-center gap-2"><Phone className="w-4 h-4" /> Ingen telefon</p>
              )}
            </div>

            {/* Meta */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Info</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{formatDate(lead.created_at)}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Tag className="w-3.5 h-3.5" />
                  <span>{lead.source.replace('_', ' ')}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Anteckningar</p>
                {!editingNotes && (
                  <button
                    type="button"
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    onClick={() => setEditingNotes(true)}
                  >
                    Redigera
                  </button>
                )}
              </div>
              {editingNotes ? (
                <div className="space-y-2">
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={4}
                    className="text-sm resize-none"
                    placeholder="Lägg till anteckningar…"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => updateNotes.mutate(notes)}
                      disabled={updateNotes.isPending}
                    >
                      {updateNotes.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                      Spara
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setNotes(lead.notes ?? ''); setEditingNotes(false); }}>
                      Avbryt
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm',
                    notes
                      ? 'bg-muted/50 text-foreground'
                      : 'text-muted-foreground italic',
                  )}
                >
                  <FileText className="w-3.5 h-3.5 inline mr-1 opacity-50" />
                  {notes || 'Inga anteckningar'}
                </div>
              )}
            </div>

            {/* Status actions */}
            {actions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nästa steg</p>
                <div className="flex flex-col gap-2">
                  {actions.map(a => (
                    <button
                      key={a.to}
                      type="button"
                      onClick={() => onStatusChange(a.to)}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-border hover:bg-accent/50 transition-colors text-sm text-foreground"
                    >
                      <span>{a.label}</span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Convert to student */}
            {lead.status !== 'enrolled' && lead.status !== 'declined' && (
              <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-green-600" />
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">Skriv in som elev</p>
                </div>
                <p className="text-xs text-green-700 dark:text-green-400">
                  Skapar ett nytt elevkonto med kontaktuppgifterna från denna lead.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-green-300 text-green-700 hover:bg-green-100 dark:border-green-700 dark:text-green-400"
                  onClick={() => convertToStudent.mutate()}
                  disabled={convertToStudent.isPending}
                >
                  {convertToStudent.isPending
                    ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Skapar...</>
                    : <><CheckCircle className="w-3 h-3 mr-1.5" />Konvertera till elev</>
                  }
                </Button>
              </div>
            )}

            {lead.status === 'enrolled' && (
              <div className="flex items-center gap-2 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 px-4 py-3">
                <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                <p className="text-sm text-green-700 dark:text-green-300">Inskriven som elev</p>
              </div>
            )}

            {lead.status === 'declined' && (
              <div className="flex items-center gap-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3">
                <XCircle className="w-4 h-4 text-gray-400 shrink-0" />
                <p className="text-sm text-muted-foreground">Lead avböjd</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
