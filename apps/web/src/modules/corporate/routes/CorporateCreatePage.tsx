import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
  Input, Button, Textarea, toast,
} from '@platform/ui';
import { useCreateCorporateCustomer } from '../hooks/useCorporateCustomers.js';

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  // Företag
  org_number:          z.string().trim().max(20).optional(),
  company_name:        z.string().trim().min(1, 'Företagsnamn krävs').max(200),
  alt_name:            z.string().trim().max(200).optional(),   // UI only — Ytterligare namn
  show_alt_name:       z.boolean().optional(),
  address_line1:       z.string().trim().max(200).optional(),
  show_address2:       z.boolean().optional(),
  address_line2:       z.string().trim().max(200).optional(),
  postal_code:         z.string().trim().max(20).optional(),
  city:                z.string().trim().max(100).optional(),

  // Kontaktinformation
  contact_name:        z.string().trim().max(200).optional(),   // maps to contact_first_name
  contact_email:       z.string().trim().email('Ogiltig e-postadress').max(200).or(z.literal('')).optional(),
  contact_phone:       z.string().trim().max(30).optional(),

  // Kommentarer (right column)
  notes:               z.string().trim().max(5000).optional(),  // Kommentar (intern) — DB field
  economy_notes:       z.string().trim().max(5000).optional(),  // Kommentar (ekonomi) — UI only
  default_discount:    z.string().trim().max(10).optional(),    // Standardrabatt (%) — UI only

  // Flera val
  is_active:           z.boolean().optional(),                  // maps to status: active/paused
  has_debt_collection: z.boolean().optional(),                  // UI only
});

type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = {
  org_number: '', company_name: '', alt_name: '', show_alt_name: false,
  address_line1: '', show_address2: false, address_line2: '', postal_code: '', city: '',
  contact_name: '', contact_email: '', contact_phone: '',
  notes: '', economy_notes: '', default_discount: '',
  is_active: true, has_debt_collection: false,
};

// ─── Checkbox helper ──────────────────────────────────────────────────────────

function CB({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer select-none text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border border-input cursor-pointer accent-primary"
      />
      {label}
    </label>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CorporateCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (id: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CorporateCreateDialog({ open, onOpenChange, onSuccess }: CorporateCreateDialogProps) {
  const create = useCreateCorporateCustomer();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  });

  useEffect(() => {
    if (open) form.reset(DEFAULTS);
  }, [open, form]);

  function onSubmit(values: FormValues) {
    // Split contact_name into first / last on first space
    const nameParts = (values.contact_name ?? '').trim().split(' ');
    const contact_first_name = nameParts[0] ?? '';
    const contact_last_name  = nameParts.slice(1).join(' ') || undefined;

    const discPct = Number(values.default_discount);

    create.mutate(
      {
        company_name:         values.company_name,
        org_number:           values.org_number  || undefined,
        address_line1:        values.address_line1 || undefined,
        address_line2:        values.show_address2 ? (values.address_line2 || undefined) : undefined,
        postal_code:          values.postal_code  || undefined,
        city:                 values.city         || undefined,
        contact_first_name:   contact_first_name  || undefined,
        contact_last_name,
        contact_email:        values.contact_email || undefined,
        contact_phone:        values.contact_phone || undefined,
        notes:                values.notes        || undefined,
        status:               values.is_active ? 'active' : 'paused',
        alt_name:             values.alt_name     || undefined,
        default_discount_pct: values.default_discount && !Number.isNaN(discPct) ? discPct : undefined,
        economy_notes:        values.economy_notes || undefined,
        has_debt_collection:  values.has_debt_collection ?? false,
      },
      {
        onSuccess: (created) => {
          toast({ title: 'Företagskund skapad' });
          onSuccess?.(created.id);
          onOpenChange(false);
        },
        onError: (e) => {
          const msg = e instanceof Error ? e.message : 'Försök igen';
          toast({ title: 'Kunde inte skapa företagskund', description: msg, variant: 'destructive' });
        },
      }
    );
  }

  const showAlt   = form.watch('show_alt_name');
  const showAddr2 = form.watch('show_address2');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1000px] p-0 gap-0 overflow-hidden" aria-describedby={undefined}>
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-semibold">Nytt företag</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="overflow-y-auto max-h-[75vh]">

              {/* ── Two-column: Företag | Kommentarer ───────────────────── */}
              <div className="grid grid-cols-2 gap-0">

                {/* Left — Företag */}
                <div className="p-6 border-r border-border space-y-4">
                  <p className="text-sm font-semibold text-foreground">Företag</p>

                  {/* Organisationsnr */}
                  <FormField
                    control={form.control}
                    name="org_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organisationsnr.</FormLabel>
                        <FormControl>
                          <Input placeholder="556123-4567" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Företagsnamn + Ytterligare namn toggle */}
                  <div className="space-y-2">
                    <div className="space-y-1.5">
                      <FormLabel>Företagsnamn</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormField
                          control={form.control}
                          name="company_name"
                          render={({ field }) => (
                            <FormItem className="flex-1 space-y-0">
                              <FormControl>
                                <Input placeholder="AB Exempel" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="show_alt_name"
                          render={({ field }) => (
                            <label className="flex items-center gap-1.5 text-sm cursor-pointer whitespace-nowrap shrink-0 select-none">
                              <input
                                type="checkbox"
                                checked={field.value ?? false}
                                onChange={(e) => field.onChange(e.target.checked)}
                                className="h-4 w-4 rounded border border-input cursor-pointer accent-primary"
                              />
                              Ytterligare namn
                            </label>
                          )}
                        />
                      </div>
                    </div>
                    {showAlt && (
                      <FormField
                        control={form.control}
                        name="alt_name"
                        render={({ field }) => (
                          <FormItem className="space-y-0">
                            <FormControl>
                              <Input placeholder="Alternativt namn" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  {/* Adressrad 1 + Extra Adr. toggle */}
                  <div className="space-y-2">
                    <div className="space-y-1.5">
                      <FormLabel>Adressrad 1</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormField
                          control={form.control}
                          name="address_line1"
                          render={({ field }) => (
                            <FormItem className="flex-1 space-y-0">
                              <FormControl>
                                <Input placeholder="Storgatan 1" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="show_address2"
                          render={({ field }) => (
                            <label className="flex items-center gap-1.5 text-sm cursor-pointer whitespace-nowrap shrink-0 select-none">
                              <input
                                type="checkbox"
                                checked={field.value ?? false}
                                onChange={(e) => field.onChange(e.target.checked)}
                                className="h-4 w-4 rounded border border-input cursor-pointer accent-primary"
                              />
                              Extra Adr.
                            </label>
                          )}
                        />
                      </div>
                    </div>
                    {showAddr2 && (
                      <FormField
                        control={form.control}
                        name="address_line2"
                        render={({ field }) => (
                          <FormItem className="space-y-0">
                            <FormControl>
                              <Input placeholder="c/o, box, våning..." {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  {/* Postnummer + Postort */}
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="postal_code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Postnummer</FormLabel>
                          <FormControl>
                            <Input placeholder="123 45" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Postort</FormLabel>
                          <FormControl>
                            <Input placeholder="Stockholm" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Right — Kommentarer */}
                <div className="p-6 space-y-4">
                  <p className="text-sm font-semibold text-foreground">Kommentarer</p>

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kommentar (intern)</FormLabel>
                        <FormControl>
                          <Textarea className="min-h-[100px] resize-y" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="economy_notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kommentar (ekonomi)</FormLabel>
                        <FormControl>
                          <Textarea className="min-h-[100px] resize-y" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="default_discount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Standardrabatt i procent (%)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" max="100" step="0.1" placeholder="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* ── Kontaktinformation (full width) ─────────────────────── */}
              <div className="px-6 pb-5 border-t border-border pt-5 space-y-3">
                <p className="text-sm font-semibold text-foreground">Kontaktinformation</p>
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="contact_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kontaktperson</FormLabel>
                        <FormControl>
                          <Input placeholder="Anna Andersson" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contact_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-postadress</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="anna@foretag.se" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contact_phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefon</FormLabel>
                        <FormControl>
                          <Input type="tel" placeholder="08-123 45 67" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* ── Flera val ────────────────────────────────────────────── */}
              <div className="px-6 pb-5 border-t border-border pt-4 space-y-2">
                <p className="text-sm font-semibold text-foreground">Flera val</p>
                <div className="flex items-center gap-5">
                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <CB label="Aktiv" checked={field.value ?? true} onChange={field.onChange} />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="has_debt_collection"
                    render={({ field }) => (
                      <CB label="Har inkassoärende" checked={field.value ?? false} onChange={field.onChange} />
                    )}
                  />
                </div>
              </div>
            </div>

            {/* ── Footer ──────────────────────────────────────────────────── */}
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={create.isPending}
              >
                Avbryt
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Skapar...' : 'Skapa'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Keep the page export so the /corporate/new route still compiles (redirects user to list).
export function CorporateCreatePage() {
  return null;
}
