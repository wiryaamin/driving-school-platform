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
import { useCreateOrg } from '../hooks/usePlatformOrgMutations.js';

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  name:              z.string().min(2, 'Minst 2 tecken').max(100),
  legal_name:        z.string().min(2, 'Minst 2 tecken').max(200),
  org_number:        z.string().max(13).default(''),
  contact_email:     z.string().default(''),
  subscription_tier: z.enum(['trial', 'starter', 'professional', 'enterprise']),
  trial_days:        z.coerce.number().int().min(1).max(365).default(30),
}).superRefine((data, ctx) => {
  if (data.org_number && !/^\d{6}-\d{4}$/.test(data.org_number)) {
    ctx.addIssue({ code: 'custom', path: ['org_number'], message: 'Format: XXXXXX-XXXX' });
  }
  if (data.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contact_email)) {
    ctx.addIssue({ code: 'custom', path: ['contact_email'], message: 'Ogiltig e-postadress' });
  }
  if (data.subscription_tier === 'trial' && data.trial_days < 1) {
    ctx.addIssue({ code: 'custom', path: ['trial_days'], message: 'Minst 1 dag' });
  }
});

type FormValues = z.infer<typeof schema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface CreateOrgDialogProps {
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateOrgDialog({ onClose }: CreateOrgDialogProps) {
  const createOrg = useCreateOrg();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:              '',
      legal_name:        '',
      org_number:        '',
      contact_email:     '',
      subscription_tier: 'trial',
      trial_days:        30,
    },
  });

  const tier = form.watch('subscription_tier');
  const isTrial = tier === 'trial';

  // Reset trial_days when switching away from trial
  useEffect(() => {
    if (!isTrial) form.setValue('trial_days', 30);
  }, [isTrial, form]);

  function onSubmit(values: FormValues) {
    createOrg.mutate(
      {
        name:              values.name,
        legal_name:        values.legal_name,
        org_number:        values.org_number || null,
        contact_email:     values.contact_email || null,
        subscription_tier: values.subscription_tier,
        trial_days:        values.trial_days,
      },
      {
        onSuccess: (data) => {
          toast({ title: 'Organisation skapad', description: data?.name ?? values.name });
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

            {/* Org number + contact email in a grid */}
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
                    <FormControl><Input type="email" placeholder="info@skolan.se" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={createOrg.isPending}>
                Avbryt
              </Button>
              <Button type="submit" disabled={createOrg.isPending}>
                {createOrg.isPending ? 'Skapar…' : 'Skapa organisation'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
