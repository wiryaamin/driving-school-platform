import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
  Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Button, toast,
} from '@platform/ui';
import type { PlatformOrganization } from '../hooks/usePlatformOrganizations.js';
import { useUpdateOrg } from '../hooks/usePlatformOrgMutations.js';
import { SUBSCRIPTION_TIERS } from '@platform/types';

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  name:              z.string().min(2, 'Minst 2 tecken').max(100),
  legal_name:        z.string().min(2, 'Minst 2 tecken').max(200),
  org_number:        z.string().max(13).default(''),
  contact_email:     z.string().default(''),
  subscription_tier: z.enum(SUBSCRIPTION_TIERS),
  max_users:         z.coerce.number().int().min(1, 'Minst 1').max(10000),
  max_locations:     z.coerce.number().int().min(1, 'Minst 1').max(1000),
}).superRefine((data, ctx) => {
  if (data.org_number && !/^\d{6}-\d{4}$/.test(data.org_number)) {
    ctx.addIssue({ code: 'custom', path: ['org_number'], message: 'Format: XXXXXX-XXXX' });
  }
  if (data.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contact_email)) {
    ctx.addIssue({ code: 'custom', path: ['contact_email'], message: 'Ogiltig e-postadress' });
  }
});

type FormValues = z.infer<typeof schema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface EditOrgDialogProps {
  open:    boolean;
  org:     PlatformOrganization | null;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
//
// Always mounted by the caller; only `open` toggles (Platform UI Stability
// Hardening Sprint). See PlatformOrganizationsPage.tsx's ConfirmDialog for
// the reference implementation of this pattern.

export function EditOrgDialog({ open, org, onClose }: EditOrgDialogProps) {
  const updateOrg = useUpdateOrg();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '', legal_name: '', org_number: '', contact_email: '',
      subscription_tier: 'trial', max_users: 1, max_locations: 1,
    },
  });

  // Reused across different organizations without unmounting — react-hook-
  // form's defaultValues are only read once at mount, so the form must be
  // explicitly resynced to `org` each time the dialog (re-)opens.
  useEffect(() => {
    if (open && org) {
      const contactEmail = (org.settings['contact_email'] as string | undefined) ?? '';
      form.reset({
        name:              org.name,
        legal_name:        org.legal_name,
        org_number:        org.org_number ?? '',
        contact_email:     contactEmail,
        subscription_tier: org.subscription_tier as FormValues['subscription_tier'],
        max_users:         org.max_users,
        max_locations:     org.max_locations,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, org]);

  function onSubmit(values: FormValues) {
    if (!org) return;
    updateOrg.mutate(
      {
        id:                org.id,
        name:              values.name,
        legal_name:        values.legal_name,
        org_number:        values.org_number || null,
        contact_email:     values.contact_email || null,
        subscription_tier: values.subscription_tier,
        max_users:         values.max_users,
        max_locations:     values.max_locations,
        existingSettings:  org.settings,
      },
      {
        onSuccess: () => {
          toast({ title: 'Uppdaterad', description: `${values.name} har uppdaterats` });
          onClose();
        },
        onError: (err) => {
          if (err.message.includes('uq_organizations_org_number')) {
            form.setError('org_number', { type: 'manual', message: 'Organisationsnumret används redan av en annan organisation' });
          } else {
            toast({ title: 'Fel', description: err.message, variant: 'destructive' });
          }
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Redigera organisation</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organisationsnamn *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="legal_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Juridiskt namn *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="org_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Org.nummer</FormLabel>
                    <FormControl><Input placeholder="556789-1234" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kontakt-e-post</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="max_users"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max antal användare *</FormLabel>
                    <FormControl><Input type="number" min={1} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="max_locations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max antal filialer *</FormLabel>
                    <FormControl><Input type="number" min={1} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={updateOrg.isPending}>
                Avbryt
              </Button>
              <Button type="submit" disabled={updateOrg.isPending}>
                {updateOrg.isPending ? 'Sparar…' : 'Spara ändringar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
