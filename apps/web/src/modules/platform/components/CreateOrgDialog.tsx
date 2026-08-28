import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
  Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Button, toast,
} from '@platform/ui';
import { AlertTriangle } from 'lucide-react';
import { EMPTY_ANSWERS, validateRequiredBusinessSetupFields, type Answers } from '@modules/trial-onboarding/index.js';
import { useCreateOrg } from '../hooks/usePlatformOrgMutations.js';
import { useAdminEmailAvailability, useOrgNumberAvailability } from '../hooks/useAdminEmailAvailability.js';
import { provisioningSchema, type ProvisioningFormValues } from '../lib/provisioningSchema.js';
import { BusinessSetupSection } from './BusinessSetupSection.js';

type FormValues = ProvisioningFormValues;

// ─── Props ────────────────────────────────────────────────────────────────────

const EMPTY_DEFAULTS: FormValues = {
  name:              '',
  legal_name:        '',
  org_number:        '',
  subscription_tier: 'trial',
  trial_days:        30,
  admin_first_name:  '',
  admin_last_name:   '',
  admin_email:       '',
};

interface CreateOrgDialogProps {
  open:    boolean;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
//
// Always mounted by the caller; only `open` toggles (Platform UI Stability
// Hardening Sprint). See PlatformOrganizationsPage.tsx's ConfirmDialog for
// the reference implementation of this pattern.

export function CreateOrgDialog({ open, onClose }: CreateOrgDialogProps) {
  const createOrg = useCreateOrg();

  const form = useForm<FormValues>({
    resolver: zodResolver(provisioningSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  const tier = form.watch('subscription_tier');
  const isTrial = tier === 'trial';
  const adminEmail = form.watch('admin_email');
  const emailCheck = useAdminEmailAvailability(adminEmail, open);
  const emailBlocked = emailCheck === 'self' || emailCheck === 'taken';
  const orgNumber = form.watch('org_number');
  const orgNumberCheck = useOrgNumberAvailability(orgNumber, open);
  const orgNumberBlocked = orgNumberCheck === 'taken';

  // Canonical business setup (Tenant Registration Unification, 2026-08-28;
  // made mandatory in the Corrective Pass — a normal trafikskola creation
  // must not be able to skip it, or this dialog would just be the old thin
  // path with an optional extra form bolted on). legal_name/org_number and
  // contact_first_name/contact_last_name are deliberately NOT collected in
  // BusinessSetupSection — they're merged in from this dialog's own form
  // values at submit time, since CreateOrgDialog already asks for them and
  // asking twice would be exactly the duplicate data entry this exists to
  // remove.
  const [businessSetup, setBusinessSetup] = useState<Answers>(EMPTY_ANSWERS);
  const [businessSetupErrors, setBusinessSetupErrors] = useState<Partial<Record<keyof Answers, string>>>({});

  // Reset trial_days when switching away from trial
  useEffect(() => {
    if (!isTrial) form.setValue('trial_days', 30);
  }, [isTrial, form]);

  // Reused across multiple opens without unmounting — clear any previously
  // typed values each time the dialog (re-)opens.
  useEffect(() => {
    if (open) {
      form.reset(EMPTY_DEFAULTS);
      setBusinessSetup(EMPTY_ANSWERS);
      setBusinessSetupErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onSubmit(values: FormValues) {
    const setupErrors = validateRequiredBusinessSetupFields(businessSetup);
    if (Object.keys(setupErrors).length > 0) {
      setBusinessSetupErrors(setupErrors);
      toast({ title: 'Fyll i verksamhetsuppgifterna markerade i rött', description: 'Adress, behörighet och pris krävs för att skapa en trafikskola.', variant: 'destructive' });
      return;
    }
    setBusinessSetupErrors({});

    createOrg.mutate(
      {
        name:              values.name,
        legal_name:        values.legal_name,
        org_number:        values.org_number || null,
        subscription_tier: values.subscription_tier,
        trial_days:        values.trial_days,
        admin_first_name:  values.admin_first_name,
        admin_last_name:   values.admin_last_name,
        admin_email:       values.admin_email,
        business_setup: {
          ...businessSetup,
          legal_name: values.legal_name,
          org_number: values.org_number || '',
          contact_first_name: values.admin_first_name,
          contact_last_name: values.admin_last_name,
        },
      },
      {
        onSuccess: (result) => {
          const setup = result.business_setup;
          const setupNote = setup
            ? setup.ok
              ? ` — verksamhet konfigurerad (${setup.priced_lesson_types ?? 0} prissatta lektionstyper, ${setup.vehicles_created ?? 0} fordon, ${setup.instructors_created ?? 0} instruktörer)`
              : ` — verksamhetskonfiguration misslyckades (${setup.error ?? 'okänt fel'}), organisationen skapades ändå`
            : '';
          toast({ title: 'Organisation skapad', description: `${values.name} — inbjudan skickas till ${values.admin_email}${setupNote}` });
          onClose();
        },
        onError: (err) => {
          // POST /provision returns a friendly message, not a raw Postgres
          // constraint name (see platform-admin/index.ts handleProvision) —
          // matched on the org_number-specific phrase it actually sends.
          if (err.message.includes('already in use by another organization')) {
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
        <DialogHeader>
          <DialogTitle>Ny organisation</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organisationsnamn *</FormLabel>
                  <FormControl><Input placeholder="Körskolan Stockholm AB" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Legal name */}
            <FormField
              control={form.control}
              name="legal_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Juridiskt namn *</FormLabel>
                  <FormControl><Input placeholder="Körskolan Stockholm Aktiebolag" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Org number */}
            <FormField
              control={form.control}
              name="org_number"
              render={({ field }) => (
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
              )}
            />

            {/* Subscription tier */}
            <FormField
              control={form.control}
              name="subscription_tier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prenumerationsnivå *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="trial">Trial</SelectItem>
                      <SelectItem value="starter">Starter</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Trial days (conditional) */}
            {isTrial && (
              <FormField
                control={form.control}
                name="trial_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Testperiod (dagar) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        placeholder="30"
                        {...field}
                        onChange={e => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Tenant Administrator — the account that will own this organization */}
            <div className="pt-2 border-t border-border">
              <p className="text-sm font-medium text-foreground mb-3">Tenant-administratör</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="admin_first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Förnamn *</FormLabel>
                      <FormControl><Input placeholder="Anna" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="admin_last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Efternamn *</FormLabel>
                      <FormControl><Input placeholder="Andersson" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="admin_email"
                render={({ field }) => (
                  <FormItem className="mt-3">
                    <FormLabel>E-post *</FormLabel>
                    <FormControl><Input type="email" placeholder="anna@skolan.se" {...field} /></FormControl>
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
                )}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Ett konto skapas med denna e-postadress som ägare (org_owner) av organisationen.
              </p>
            </div>

            {/* Canonical business setup — same fields/provisioning engine as
                self-service trial signup (Tenant Registration Unification).
                Mandatory, not a toggle: a normal trafikskola cannot be
                created without it — that would just reintroduce the old
                thin path this unification removed. */}
            <div className="pt-2 border-t border-border">
              <p className="text-sm font-medium text-foreground">Verksamhetsuppgifter</p>
              <p className="text-xs text-muted-foreground mb-3">
                Krävs för att skapa en trafikskola — tenanten blir fullt initierad utan att behöva slutföra Kom igång själv.
              </p>
              <BusinessSetupSection value={businessSetup} onChange={(next) => { setBusinessSetup(next); setBusinessSetupErrors({}); }} errors={businessSetupErrors} />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={createOrg.isPending}>
                Avbryt
              </Button>
              <Button
                type="submit"
                disabled={createOrg.isPending || emailBlocked || orgNumberBlocked}
                title={emailBlocked ? 'Ange en annan e-postadress innan du fortsätter' : orgNumberBlocked ? 'Ange ett annat org.nummer innan du fortsätter' : undefined}
              >
                {createOrg.isPending ? 'Skapar…' : 'Skapa organisation'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
