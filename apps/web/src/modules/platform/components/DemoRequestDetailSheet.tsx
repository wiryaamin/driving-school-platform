import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Textarea, Button, Badge, toast,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
  Input,
} from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { ArrowRight, Building2, User as UserIcon, MessageSquare } from 'lucide-react';
import type { DemoRequest, DemoRequestStatus } from '../hooks/useDemoRequests.js';
import { STATUS_LABEL, STATUS_BADGE_CLASS } from '../lib/demoRequestStatus.js';
import type { PlatformAdminDetail } from '../hooks/usePlatformOpsCenter.js';
import {
  useUpdateDemoRequestStatus, useAssignDemoRequest, useUpdateDemoRequestNotes,
  useConvertDemoRequestToCustomer,
} from '../hooks/useDemoRequestMutations.js';
import { provisioningSchema, type ProvisioningFormValues } from '../lib/provisioningSchema.js';

// ─── Display maps ─────────────────────────────────────────────────────────────

const CURRENT_SYSTEM_LABEL: Record<string, string> = {
  spreadsheets:    'Kalkylblad',
  other_software:  'En annan mjukvaruplattform',
  manual:          'Mestadels manuell administration',
  other:           'Annat',
};

const STATUS_OPTIONS: DemoRequestStatus[] = [
  'new', 'contacted', 'demo_scheduled', 'demo_completed', 'qualified', 'converted', 'declined', 'spam',
];

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-2 py-2 border-b border-border last:border-0">
      <p className="text-xs text-muted-foreground shrink-0 w-36">{label}</p>
      <p className="text-xs font-medium text-foreground text-right break-words">{value}</p>
    </div>
  );
}

function SectionCard({ icon: Icon, title, children }: { icon: typeof Building2; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <div className="px-4">{children}</div>
    </div>
  );
}

// ─── Convert to Customer (Automated Customer Provisioning) ────────────────────
//
// Pre-filled from the demo request, but editable — the platform admin reviews
// the exact data before an action that creates a real, live auth user and
// organization. Calls the same POST /provision pipeline as CreateOrgDialog.

function ConvertToCustomerDialog({ open, request, onClose }: { open: boolean; request: DemoRequest | null; onClose: () => void }) {
  const convert = useConvertDemoRequestToCustomer();

  const form = useForm<ProvisioningFormValues>({
    resolver: zodResolver(provisioningSchema),
    defaultValues: {
      name: '', legal_name: '', org_number: '', subscription_tier: 'trial',
      trial_days: 30, admin_first_name: '', admin_last_name: '', admin_email: '',
    },
  });

  // Reused across different demo requests without unmounting — react-hook-
  // form's defaultValues are only read once at mount, so the form must be
  // explicitly resynced to `request` each time the dialog (re-)opens.
  useEffect(() => {
    if (open && request) {
      // Naive split — the platform admin can correct it before submitting.
      const spaceIdx = request.name.trim().indexOf(' ');
      const guessedFirstName = spaceIdx === -1 ? request.name.trim() : request.name.trim().slice(0, spaceIdx);
      const guessedLastName  = spaceIdx === -1 ? '' : request.name.trim().slice(spaceIdx + 1);
      form.reset({
        name:              request.school_name,
        legal_name:        request.school_name,
        org_number:        '',
        subscription_tier: 'trial',
        trial_days:        30,
        admin_first_name:  guessedFirstName,
        admin_last_name:   guessedLastName,
        admin_email:       request.email,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request]);

  const tier = form.watch('subscription_tier');
  const isTrial = tier === 'trial';

  function onSubmit(values: ProvisioningFormValues) {
    if (!request) return;
    convert.mutate(
      {
        demoRequestId:    request.id,
        name:             values.name,
        legalName:        values.legal_name,
        orgNumber:        values.org_number || null,
        subscriptionTier: values.subscription_tier,
        trialDays:        values.trial_days,
        adminFirstName:   values.admin_first_name,
        adminLastName:    values.admin_last_name,
        adminEmail:       values.admin_email,
      },
      {
        onSuccess: () => {
          toast({ title: 'Organisation skapad', description: `${values.name} — inbjudan skickas till ${values.admin_email}` });
          onClose();
        },
        onError: (err) => {
          // POST /provision returns a friendly message, not a raw Postgres
          // constraint name (see platform-admin/index.ts handleProvision).
          if (err.message.includes('already been converted')) {
            // Idempotency guard tripped — most likely a stale sheet (someone
            // else already converted this lead). Close and let the list
            // refetch rather than leave a dead form open.
            toast({ title: 'Redan konverterad', description: 'Denna förfrågan har redan konverterats till en kund.', variant: 'destructive' });
            onClose();
          } else if (err.message.includes('already in use by another organization')) {
            form.setError('org_number', { type: 'manual', message: 'Organisationsnumret används redan av en annan organisation' });
          } else if (err.message.toLowerCase().includes('already exists')) {
            form.setError('admin_email', { type: 'manual', message: 'Ett konto med denna e-postadress finns redan' });
          } else {
            toast({ title: 'Fel', description: err.message, variant: 'destructive' });
          }
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Konvertera till kund</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Granska uppgifterna innan organisationen skapas — de är förifyllda från förfrågan men går att ändra.
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Organisationsnamn *</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="legal_name" render={({ field }) => (
              <FormItem>
                <FormLabel>Juridiskt namn *</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="org_number" render={({ field }) => (
              <FormItem>
                <FormLabel>Org.nummer</FormLabel>
                <FormControl><Input placeholder="556789-1234" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="subscription_tier" render={({ field }) => (
              <FormItem>
                <FormLabel>Prenumerationsnivå *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            {isTrial && (
              <FormField control={form.control} name="trial_days" render={({ field }) => (
                <FormItem>
                  <FormLabel>Testperiod (dagar) *</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} max={365} {...field} onChange={e => field.onChange(e.target.valueAsNumber)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            <div className="pt-2 border-t border-border">
              <p className="text-sm font-medium text-foreground mb-3">Tenant-administratör</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="admin_first_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Förnamn *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="admin_last_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Efternamn *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="admin_email" render={({ field }) => (
                <FormItem className="mt-3">
                  <FormLabel>E-post *</FormLabel>
                  <FormControl><Input type="email" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={convert.isPending}>Avbryt</Button>
              <Button type="submit" disabled={convert.isPending}>
                {convert.isPending ? 'Skapar…' : 'Skapa organisation'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DemoRequestDetailSheetProps {
  open:    boolean;
  request: DemoRequest | null;
  admins:  PlatformAdminDetail[];
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
//
// Always mounted by the caller; only `open` toggles (Platform UI Stability
// Hardening Sprint). See PlatformOrganizationsPage.tsx's ConfirmDialog for
// the reference implementation of this pattern.

export function DemoRequestDetailSheet({ open, request, admins, onClose }: DemoRequestDetailSheetProps) {
  const [notesDraft, setNotesDraft]     = useState(request?.internal_notes ?? '');
  const [showConvert, setShowConvert]   = useState(false);

  const updateStatus = useUpdateDemoRequestStatus();
  const assign       = useAssignDemoRequest();
  const updateNotes  = useUpdateDemoRequestNotes();

  // Reused across different demo requests without unmounting — resync the
  // notes draft each time the sheet (re-)opens for a (possibly different)
  // request.
  useEffect(() => {
    if (open && request) setNotesDraft(request.internal_notes);
  }, [open, request]);

  const notesDirty = request !== null && notesDraft !== request.internal_notes;

  function handleStatusChange(value: string) {
    if (!request) return;
    const status = value as DemoRequestStatus;
    updateStatus.mutate(
      {
        id: request.id,
        status,
        alreadyContacted: request.contacted_at !== null,
        alreadyConverted: request.converted_at !== null,
      },
      {
        onSuccess: () => toast({ title: 'Status uppdaterad', description: STATUS_LABEL[status] }),
        onError:   err => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
      },
    );
  }

  function handleAssignChange(value: string) {
    if (!request) return;
    assign.mutate(
      { id: request.id, assignedTo: value === '__unassigned__' ? null : value },
      {
        onSuccess: () => toast({ title: 'Tilldelning uppdaterad' }),
        onError:   err => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
      },
    );
  }

  function handleSaveNotes() {
    if (!request) return;
    updateNotes.mutate(
      { id: request.id, notes: notesDraft },
      {
        onSuccess: () => toast({ title: 'Anteckningar sparade' }),
        onError:   err => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
      },
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={open => { if (!open) onClose(); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {request && (
          <>
          <SheetHeader className="pb-4">
            <SheetTitle className="text-lg">{request.school_name}</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">{request.name} · {request.email}</SheetDescription>
          </SheetHeader>

          {/* Status chip + selector */}
          <div className="flex items-center gap-2 flex-wrap mb-5">
            <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold', STATUS_BADGE_CLASS[request.status])}>
              {STATUS_LABEL[request.status]}
            </span>
            {request.converted_organization_id && (
              <Badge variant="outline" className="text-[11px]">Konverterad till kund</Badge>
            )}
          </div>

          <div className="space-y-4">
            {/* Customer Information */}
            <SectionCard icon={UserIcon} title="Kundinformation">
              <InfoRow label="Kontaktperson" value={request.name} />
              <InfoRow label="Trafikskola"   value={request.school_name} />
              <InfoRow label="E-post"        value={request.email} />
              <InfoRow label="Telefon"       value={request.phone} />
              <InfoRow label="Kommun/ort"    value={request.municipality} />
            </SectionCard>

            {/* Business Information */}
            <SectionCard icon={Building2} title="Verksamhetsinformation">
              <InfoRow label="Antal orter"           value={String(request.location_count)} />
              <InfoRow label="Ungefärligt elevantal" value={String(request.student_count)} />
              <InfoRow label="Nuvarande system"      value={CURRENT_SYSTEM_LABEL[request.current_system] ?? request.current_system} />
              {request.message && (
                <div className="py-2">
                  <p className="text-xs text-muted-foreground mb-1">Meddelande från kund</p>
                  <p className="text-xs text-foreground whitespace-pre-wrap">{request.message}</p>
                </div>
              )}
            </SectionCard>

            {/* Operational Information */}
            <SectionCard icon={MessageSquare} title="Operativ information">
              <div className="py-3 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="drq-status">Status</label>
                  <Select value={request.status} onValueChange={handleStatusChange} disabled={updateStatus.isPending}>
                    <SelectTrigger id="drq-status" className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(s => (
                        <SelectItem key={s} value={s} className="text-xs">{STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="drq-assigned">Tilldelad administratör</label>
                  <Select
                    value={request.assigned_to ?? '__unassigned__'}
                    onValueChange={handleAssignChange}
                    disabled={assign.isPending}
                  >
                    <SelectTrigger id="drq-assigned" className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unassigned__" className="text-xs">Ej tilldelad</SelectItem>
                      {admins.map(a => (
                        <SelectItem key={a.user_id} value={a.user_id} className="text-xs">
                          {[a.first_name, a.last_name].filter(Boolean).join(' ') || a.email || a.user_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="drq-notes">Interna anteckningar</label>
                  <Textarea
                    id="drq-notes"
                    value={notesDraft}
                    onChange={e => setNotesDraft(e.target.value)}
                    rows={3}
                    placeholder="Inga anteckningar ännu…"
                    className="text-xs"
                  />
                  {notesDirty && (
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setNotesDraft(request.internal_notes)}>
                        Ångra
                      </Button>
                      <Button size="sm" className="h-7 text-xs" onClick={handleSaveNotes} disabled={updateNotes.isPending}>
                        {updateNotes.isPending ? 'Sparar…' : 'Spara anteckningar'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Audit information — this table has no per-field change log (see
                  migration comments); these lifecycle timestamps are its audit trail. */}
              <InfoRow label="Inkom"                value={new Date(request.created_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })} />
              <InfoRow label="Senast uppdaterad"    value={new Date(request.updated_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })} />
              {request.contacted_at && (
                <InfoRow label="Kontaktad" value={new Date(request.contacted_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })} />
              )}
              {request.converted_at && (
                <InfoRow label="Konverterad" value={new Date(request.converted_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })} />
              )}
              <InfoRow label="Källa" value={request.source} />
              <InfoRow label="ID"    value={request.id} />
            </SectionCard>

            {/* Convert to customer */}
            {!request.converted_organization_id && (
              <Button variant="outline" className="w-full justify-between" onClick={() => setShowConvert(true)}>
                Konvertera till kund
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
          </>
          )}
        </SheetContent>
      </Sheet>

      <ConvertToCustomerDialog open={showConvert && !!request} request={request} onClose={() => setShowConvert(false)} />
    </>
  );
}
