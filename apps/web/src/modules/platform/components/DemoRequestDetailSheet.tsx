import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Textarea, Button, Badge, toast,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
  Input,
} from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { ArrowRight, Building2, User as UserIcon, MessageSquare, CheckCircle2, Circle, Lock, AlertTriangle, XCircle, Trash2 } from 'lucide-react';
import { useAdminEmailAvailability, useOrgNumberAvailability } from '../hooks/useAdminEmailAvailability.js';
import type { DemoRequest, DemoRequestStatus, DemoRequestRejectionReason } from '../hooks/useDemoRequests.js';
import { STATUS_LABEL, STATUS_BADGE_CLASS, REJECTION_REASON_LABEL, REJECTION_REASON_OPTIONS } from '../lib/demoRequestStatus.js';
import type { PlatformAdminDetail } from '../hooks/usePlatformOpsCenter.js';
import {
  useUpdateDemoRequestStatus, useAssignDemoRequest, useUpdateDemoRequestNotes,
  useConvertDemoRequestToCustomer, useMarkDemoRequestReviewed, useApproveDemoRequestOnboarding,
  useRejectDemoRequest, useDeleteDemoRequest,
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

// ─── Mandatory onboarding workflow: Step 1 (Review Customer) / Step 2
// (Approve Onboarding) ─────────────────────────────────────────────────────
//
// These are the first two of the Product Owner's mandatory 10-step
// onboarding workflow (see OnboardingJourneyPanel.tsx for the full 10-step
// view once a customer exists). They live here, on the demo request itself,
// because both steps happen BEFORE an organization exists — Step 2 (Approve
// Onboarding) gates Step 3-4-5 (Choose Subscription / Create Organization /
// Create Administrator, all performed together by Convert to Customer).

function WorkflowStepsCard({ request }: { request: DemoRequest }) {
  const markReviewed      = useMarkDemoRequestReviewed();
  const approveOnboarding = useApproveDemoRequestOnboarding();

  const reviewed = Boolean(request.reviewed_at);
  const approved = Boolean(request.approved_at);

  function handleMarkReviewed() {
    markReviewed.mutate(request.id, {
      onSuccess: () => toast({ title: 'Markerad som granskad' }),
      onError:   err => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleApprove() {
    approveOnboarding.mutate(request.id, {
      onSuccess: () => toast({ title: 'Onboarding godkänd' }),
      onError:   err => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  return (
    <SectionCard icon={CheckCircle2} title="Onboarding-arbetsflöde">
      <div className="py-1">
        <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
          <div className="shrink-0 mt-0.5">
            {reviewed
              ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              : <Circle className="w-4 h-4 text-amber-500" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className={cn('text-sm', reviewed ? 'text-foreground font-medium' : 'text-muted-foreground')}>1. Review Customer</p>
              {reviewed && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  Klar
                </span>
              )}
            </div>
            {!reviewed && (
              <Button
                size="sm"
                className="mt-1.5 h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white border-0"
                disabled={markReviewed.isPending}
                onClick={handleMarkReviewed}
              >
                {markReviewed.isPending ? 'Vänta…' : 'Markera som granskad'}
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-start gap-3 py-2.5">
          <div className="shrink-0 mt-0.5">
            {approved
              ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              : reviewed
                ? <Circle className="w-4 h-4 text-amber-500" />
                : <Lock className="w-4 h-4 text-muted-foreground/50" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className={cn('text-sm', approved ? 'text-foreground font-medium' : 'text-muted-foreground')}>2. Approve Onboarding</p>
              {approved && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  Klar
                </span>
              )}
            </div>
            {!approved && !reviewed && (
              <p className="text-xs text-muted-foreground mt-0.5">Kunden måste granskas först</p>
            )}
            {!approved && reviewed && (
              <Button
                size="sm"
                className="mt-1.5 h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white border-0"
                disabled={approveOnboarding.isPending}
                onClick={handleApprove}
              >
                {approveOnboarding.isPending ? 'Vänta…' : 'Godkänn onboarding'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Convert to Customer (Automated Customer Provisioning) ────────────────────
//
// Pre-filled from the demo request, but editable — the platform admin reviews
// the exact data before an action that creates a real, live auth user and
// organization. Calls the same POST /provision pipeline as CreateOrgDialog.

function ConvertToCustomerDialog({ open, request, onClose }: { open: boolean; request: DemoRequest | null; onClose: () => void }) {
  const convert = useConvertDemoRequestToCustomer();
  const navigate = useNavigate();

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
  const adminEmail = form.watch('admin_email');
  const emailCheck = useAdminEmailAvailability(adminEmail, open);
  const emailBlocked = emailCheck === 'self' || emailCheck === 'taken';
  const orgNumber = form.watch('org_number');
  const orgNumberCheck = useOrgNumberAvailability(orgNumber, open);
  const orgNumberBlocked = orgNumberCheck === 'taken';

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
        onSuccess: (result) => {
          toast({ title: 'Organisation skapad', description: `${values.name} — inbjudan skickas till ${values.admin_email}` });
          onClose();
          // Continue straight into the Onboarding workspace for the new
          // customer — the platform administrator should never land back
          // on the demo request list wondering what happens next.
          navigate(`/platform/organizations/${result.organization_id}?tab=onboarding`);
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
                {orgNumberCheck === 'taken' && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 px-3 py-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 dark:text-amber-400">
                      Det här org.numret används redan av en annan organisation på plattformen.
                    </p>
                  </div>
                )}
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
                  {emailCheck === 'checking' && (
                    <p className="text-xs text-muted-foreground">Kontrollerar e-postadressen…</p>
                  )}
                  {emailCheck === 'self' && (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 px-3 py-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800 dark:text-amber-400">
                        Det här är din egen inloggning som plattformsadministratör — den kan inte återanvändas som kundens administratörskonto.
                        Ange en annan e-postadress för kundens administratör.
                      </p>
                    </div>
                  )}
                  {emailCheck === 'taken' && (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 px-3 py-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800 dark:text-amber-400">
                        Det finns redan ett konto på plattformen med den här e-postadressen. Ange en annan e-postadress för att skapa kundens administratör.
                      </p>
                    </div>
                  )}
                </FormItem>
              )} />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={convert.isPending}>Avbryt</Button>
              <Button
                type="submit"
                disabled={convert.isPending || emailBlocked || orgNumberBlocked}
                title={emailBlocked ? 'Ange en annan e-postadress innan du fortsätter' : orgNumberBlocked ? 'Ange ett annat org.nummer innan du fortsätter' : undefined}
              >
                {convert.isPending ? 'Skapar…' : 'Skapa organisation'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reject ────────────────────────────────────────────────────────────────────
//
// The missing counterpart to Convert to Customer — declining a request needs
// a real, recorded reason (own records) and a way to tell the prospect
// something actionable, not just a silent status flip.

function RejectDemoRequestDialog({ open, request, onClose }: { open: boolean; request: DemoRequest | null; onClose: () => void }) {
  const reject = useRejectDemoRequest();
  const [reason, setReason] = useState<DemoRequestRejectionReason | ''>('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (open) { setReason(''); setDescription(''); }
  }, [open]);

  function handleSubmit() {
    if (!request || !reason) return;
    if (reason === 'other' && description.trim().length === 0) {
      toast({ title: 'Beskrivning krävs', description: 'Ange en beskrivning när orsaken är "Annat".', variant: 'destructive' });
      return;
    }
    reject.mutate(
      { id: request.id, reason, description: description.trim() },
      {
        onSuccess: (result) => {
          toast({
            title: 'Förfrågan avvisad',
            description: result.email_sent
              ? 'Kunden har meddelats via e-post.'
              : 'Kunden kunde inte meddelas via e-post — kontakta dem gärna direkt.',
          });
          onClose();
        },
        onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Avvisa förfrågan</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          {request?.school_name} — kunden meddelas via e-post om orsaken tillåter det.
        </p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="reject-reason">Orsak *</label>
            <Select value={reason} onValueChange={(v) => setReason(v as DemoRequestRejectionReason)}>
              <SelectTrigger id="reject-reason"><SelectValue placeholder="Välj orsak…" /></SelectTrigger>
              <SelectContent>
                {REJECTION_REASON_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>{REJECTION_REASON_LABEL[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reason === 'duplicate_email' && (
              <p className="text-xs text-muted-foreground">
                Kunden uppmanas i mailet att skicka in en ny förfrågan med en annan e-postadress.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="reject-description">
              Beskrivning {reason === 'other' ? '*' : '(valfritt)'}
            </label>
            <Textarea
              id="reject-description" rows={3} value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Intern och/eller kundriktad förklaring…"
            />
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose} disabled={reject.isPending}>Avbryt</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={reject.isPending || !reason}>
            {reject.isPending ? 'Avvisar…' : 'Avvisa förfrågan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete ────────────────────────────────────────────────────────────────────

function DeleteDemoRequestDialog({ open, request, onClose, onDeleted }: { open: boolean; request: DemoRequest | null; onClose: () => void; onDeleted: () => void }) {
  const del = useDeleteDemoRequest();

  function handleConfirm() {
    if (!request) return;
    del.mutate(request.id, {
      onSuccess: () => { toast({ title: 'Förfrågan borttagen' }); onClose(); onDeleted(); },
      onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Ta bort förfrågan</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          {request?.school_name} tas bort permanent från listan. Detta går inte att ångra.
        </p>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose} disabled={del.isPending}>Avbryt</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={del.isPending}>
            {del.isPending ? 'Tar bort…' : 'Ta bort permanent'}
          </Button>
        </DialogFooter>
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
  const [showReject, setShowReject]     = useState(false);
  const [showDelete, setShowDelete]     = useState(false);

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
      <Dialog open={open} onOpenChange={open => { if (!open) onClose(); }}>
        <DialogContent className="w-full sm:max-w-xl max-h-[85vh] overflow-y-auto flex flex-col p-0 gap-0">
          {request && (
          <>
          <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
            <DialogTitle className="text-lg">{request.school_name}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">{request.name} · {request.email}</DialogDescription>
          </DialogHeader>

          <div className="px-6 overflow-y-auto flex-1">
          {/* Status chip + selector */}
          <div className="flex items-center gap-2 flex-wrap mb-5">
            <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold', STATUS_BADGE_CLASS[request.status])}>
              {STATUS_LABEL[request.status]}
            </span>
            {request.converted_organization_id && (
              <Badge variant="outline" className="text-[11px]">Konverterad till kund</Badge>
            )}
          </div>

          {/* Once a real customer account exists, this demo request becomes
              historical — operational focus moves entirely to the
              Onboarding Command Center. A prominent, unmistakable link
              here (rather than just a badge) is the fix for the exact
              confusion this session's audit found: a status label alone
              gives no indication that a live workspace now exists. Deep
              links via ?open=org:<id> so the Command Center opens straight
              to this customer's row instead of just landing on the queue. */}
          {request.converted_organization_id && (
            <Button asChild size="sm" className="mb-5 w-full">
              <Link to={`/platform/onboarding?open=org:${request.converted_organization_id}`}>
                Visa onboarding-resa
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Link>
            </Button>
          )}

          <div className="space-y-4">
            {/* Onboarding workflow — Step 1 (Review) / Step 2 (Approve),
                only relevant before a customer organization exists. */}
            {!request.converted_organization_id && <WorkflowStepsCard request={request} />}

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
              {request.rejected_at && (
                <>
                  <InfoRow label="Avvisad" value={new Date(request.rejected_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })} />
                  <InfoRow label="Orsak" value={request.rejection_reason ? REJECTION_REASON_LABEL[request.rejection_reason] : null} />
                  {request.rejection_description && (
                    <div className="py-2">
                      <p className="text-xs text-muted-foreground mb-1">Beskrivning</p>
                      <p className="text-xs text-foreground whitespace-pre-wrap">{request.rejection_description}</p>
                    </div>
                  )}
                </>
              )}
              <InfoRow label="Källa" value={request.source} />
              <InfoRow label="ID"    value={request.id} />
            </SectionCard>
          </div>
          </div>

          {/* Persistent footer — always visible regardless of scroll
              position, per industry-standard modal pattern (Close always
              available; the one primary action pinned next to it). Convert
              is gated on Step 2 (Approve Onboarding): Approve must complete
              before Choose Subscription / Create Organization / Create
              Administrator (all performed together by conversion). */}
          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 sm:justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose}>Stäng</Button>
              {!request.converted_organization_id && (
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" title="Ta bort förfrågan" onClick={() => setShowDelete(true)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
            {!request.converted_organization_id && (
              <div className="flex items-center gap-2">
                {request.status !== 'declined' && (
                  <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setShowReject(true)}>
                    <XCircle className="w-4 h-4 mr-1.5" />
                    Avvisa
                  </Button>
                )}
                {request.approved_at ? (
                  <Button onClick={() => setShowConvert(true)}>
                    Konvertera till kund
                    <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    Onboarding måste godkännas (steg 2) innan kunden kan konverteras
                  </div>
                )}
              </div>
            )}
          </DialogFooter>
          </>
          )}
        </DialogContent>
      </Dialog>

      <ConvertToCustomerDialog open={showConvert && !!request} request={request} onClose={() => setShowConvert(false)} />
      <RejectDemoRequestDialog open={showReject && !!request} request={request} onClose={() => setShowReject(false)} />
      <DeleteDemoRequestDialog open={showDelete && !!request} request={request} onClose={() => setShowDelete(false)} onDeleted={onClose} />
    </>
  );
}
