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
import { useInviteAdmin } from '../hooks/usePlatformOrgMutations.js';

// ─── Schema ───────────────────────────────────────────────────────────────────
// Deliberately the same shape as CreateOrgDialog's admin fields (Automated
// Customer Provisioning) — this is the same underlying action, generalized to
// an already-existing organization instead of a brand-new one.

const schema = z.object({
  first_name: z.string().min(1, 'Förnamn krävs').max(100),
  last_name:  z.string().min(1, 'Efternamn krävs').max(100),
  email:      z.string().min(1, 'E-post krävs').email('Ogiltig e-postadress'),
  role:       z.enum(['org_owner', 'org_admin', 'org_manager']),
});

type FormValues = z.infer<typeof schema>;

const ROLE_OPTIONS: { value: FormValues['role']; label: string }[] = [
  { value: 'org_owner',   label: 'Ägare' },
  { value: 'org_admin',   label: 'Admin' },
  { value: 'org_manager', label: 'Chef' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface InviteAdminDialogProps {
  open:     boolean;
  orgId:    string;
  orgName:  string;
  onClose:  () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
//
// Always mounted by the caller; only `open` toggles (Platform UI Stability
// Hardening Sprint). Radix's Dialog owns its own close/exit-animation
// cleanup via its Portal — conditionally mounting/unmounting this component
// instead races React's DOM removal against Radix's, producing "Failed to
// execute 'removeChild' on 'Node'". See PlatformOrganizationsPage.tsx's
// ConfirmDialog for the reference implementation of this pattern.

export function InviteAdminDialog({ open, orgId, orgName, onClose }: InviteAdminDialogProps) {
  const inviteAdmin = useInviteAdmin(orgId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { first_name: '', last_name: '', email: '', role: 'org_admin' },
  });

  // Reused across multiple opens without unmounting — clear any previously
  // typed values each time the dialog (re-)opens.
  useEffect(() => {
    if (open) form.reset({ first_name: '', last_name: '', email: '', role: 'org_admin' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onSubmit(values: FormValues) {
    inviteAdmin.mutate(
      { firstName: values.first_name, lastName: values.last_name, email: values.email, role: values.role },
      {
        onSuccess: () => {
          toast({ title: 'Administratör inbjuden', description: `Ett konto har skapats för ${values.email}` });
          onClose();
        },
        onError: (err) => {
          if (err.message.toLowerCase().includes('already exists')) {
            form.setError('email', { type: 'manual', message: 'Ett konto med denna e-postadress finns redan' });
          } else {
            toast({ title: 'Fel', description: err.message, variant: 'destructive' });
          }
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bjud in administratör</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">{orgName}</p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="first_name"
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
                name="last_name"
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-post *</FormLabel>
                  <FormControl><Input type="email" placeholder="anna@skolan.se" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Roll *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ROLE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <p className="text-xs text-muted-foreground">
              Ett konto skapas med denna e-postadress. Administratören visas som "Väntande" tills första inloggningen.
            </p>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={inviteAdmin.isPending}>
                Avbryt
              </Button>
              <Button type="submit" disabled={inviteAdmin.isPending}>
                {inviteAdmin.isPending ? 'Bjuder in…' : 'Bjud in'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
