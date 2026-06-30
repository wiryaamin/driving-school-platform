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

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  name:              z.string().min(2, 'Minst 2 tecken').max(100),
  legal_name:        z.string().min(2, 'Minst 2 tecken').max(200),
  org_number:        z.string().max(13).default(''),
  contact_email:     z.string().default(''),
  subscription_tier: z.enum(['trial', 'starter', 'professional', 'enterprise']),
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
  org:     PlatformOrganization;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EditOrgDialog({ org, onClose }: EditOrgDialogProps) {
  const updateOrg = useUpdateOrg();

  const contactEmail = (org.settings['contact_email'] as string | undefined) ?? '';

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:              org.name,
      legal_name:        org.legal_name,
      org_number:        org.org_number ?? '',
      contact_email:     contactEmail,
      subscription_tier: org.subscription_tier as FormValues['subscription_tier'],
    },
  });

  function onSubmit(values: FormValues) {
    updateOrg.mutate(
      {
        id:                org.id,
        name:              values.name,
        legal_name:        values.legal_name,
        org_number:        values.org_number || null,
        contact_email:     values.contact_email || null,
        subscription_tier: values.subscription_tier,
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
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
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
