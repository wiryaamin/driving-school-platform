import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, ChevronDown, ChevronUp, Upload, Trash2, FileText, Download, Loader2 } from 'lucide-react';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
  Input, Button, Textarea,
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogDescription,
  Skeleton, toast,
} from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CorporateContract } from '@platform/types';
import {
  useCorporateCustomer,
  useUpdateCorporateCustomer,
  useArchiveCorporateCustomer,
  useCorporateContracts,
  useCreateCorporateContract,
  useUpdateCorporateContract,
  useArchiveCorporateContract,
} from '../hooks/useCorporateCustomers.js';
import { useStudentList } from '@modules/students/hooks/useStudents.js';
import { cn } from '@/lib/utils.js';
import { useSession } from '@shared/hooks/useSession.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type DetailTab = 'foretaget' | 'avtal' | 'fakturor' | 'konto' | 'dokument';

const TABS: { key: DetailTab; label: string }[] = [
  { key: 'foretaget', label: 'Företaget' },
  { key: 'avtal',     label: 'Avtal'     },
  { key: 'fakturor',  label: 'Fakturor'  },
  { key: 'konto',     label: 'Konto'     },
  { key: 'dokument',  label: 'Dokument'  },
];

// ─── Form schema ──────────────────────────────────────────────────────────────

const formSchema = z.object({
  org_number:          z.string().trim().max(20).optional(),
  company_name:        z.string().trim().min(1, 'Företagsnamn krävs').max(200),
  alt_name:            z.string().trim().max(200).optional(),       // UI-only
  address_line1:       z.string().trim().max(200).optional(),
  address_line2:       z.string().trim().max(200).optional(),
  postal_code:         z.string().trim().max(20).optional(),
  city:                z.string().trim().max(100).optional(),
  contact_email:       z.string().trim().max(200).optional(),
  er_ref:              z.string().trim().max(200).optional(),       // maps to contact_first_name+last_name
  contact_phone:       z.string().trim().max(30).optional(),
  standard_discount:   z.string().trim().max(10).optional(),        // UI-only
  payment_terms_days:  z.string().trim().max(10).optional(),        // UI-only
  notes:               z.string().trim().max(2000).optional(),
  economy_notes:       z.string().trim().max(2000).optional(),      // UI-only
  is_active:           z.boolean(),
  has_debt_collection: z.boolean(),                                  // UI-only
});

type FormValues = z.infer<typeof formSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FMT = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short' });
const SEK = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtDate(iso: string | null | undefined) { try { return iso ? FMT.format(new Date(iso)) : '—'; } catch { return '—'; } }

// ─── Field component ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// ─── Elev accordion ───────────────────────────────────────────────────────────

function ElevAccordion({ id }: { id: string }) {
  const [open, setOpen] = useState(true);
  const { data, isLoading } = useStudentList({ corporate_customer_id: id, per_page: 100 });
  const students = data?.data ?? [];
  const total    = data?.meta.total ?? 0;

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium hover:bg-muted/30 transition-colors"
      >
        <span>Elever</span>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-muted text-muted-foreground rounded px-1.5 py-0.5">
            {isLoading ? '…' : total}
          </span>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="px-5 pb-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Laddar…</p>
          ) : students.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga elever kopplade till detta företag.</p>
          ) : (
            <ul className="space-y-1">
              {students.map(s => (
                <li key={s.id} className="text-sm">
                  <Link to={`/students/${s.id}`} className="text-blue-600 hover:underline">
                    {s.first_name} {s.last_name}
                  </Link>
                  {s.email && (
                    <span className="text-xs text-muted-foreground ml-2">{s.email}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Företaget ───────────────────────────────────────────────────────────

function ForetagetTab({ id }: { id: string }) {
  const { data: customer, isLoading } = useCorporateCustomer(id);
  const updateMutation  = useUpdateCorporateCustomer();
  const archiveMutation = useArchiveCorporateCustomer();
  const navigate        = useNavigate();
  const [deleteOpen, setDeleteOpen]   = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      org_number: '', company_name: '', alt_name: '',
      address_line1: '', address_line2: '', postal_code: '', city: '',
      contact_email: '', er_ref: '', contact_phone: '',
      standard_discount: '', payment_terms_days: '',
      notes: '', economy_notes: '',
      is_active: true, has_debt_collection: false,
    },
  });

  useEffect(() => {
    if (!customer) return;
    const ref = [customer.contact_first_name, customer.contact_last_name].filter(Boolean).join(' ');
    form.reset({
      org_number:          customer.org_number ?? '',
      company_name:        customer.company_name,
      alt_name:            customer.alt_name ?? '',
      address_line1:       customer.address_line1 ?? '',
      address_line2:       customer.address_line2 ?? '',
      postal_code:         customer.postal_code ?? '',
      city:                customer.city ?? '',
      contact_email:       customer.contact_email ?? '',
      er_ref:              ref,
      contact_phone:       customer.contact_phone ?? '',
      standard_discount:   customer.default_discount_pct?.toString() ?? '',
      payment_terms_days:  customer.payment_terms_days?.toString() ?? '',
      notes:               customer.notes ?? '',
      economy_notes:       customer.economy_notes ?? '',
      is_active:           customer.status === 'active' || customer.status === 'paused',
      has_debt_collection: customer.has_debt_collection ?? false,
    });
  }, [customer, form]);

  function onSubmit(values: FormValues) {
    const [firstName, ...rest] = (values.er_ref ?? '').trim().split(' ');
    const discPct   = Number(values.standard_discount);
    const termsDays = parseInt(values.payment_terms_days ?? '', 10);
    updateMutation.mutate({
      id,
      input: {
        org_number:           values.org_number || undefined,
        company_name:         values.company_name,
        address_line1:        values.address_line1 || undefined,
        address_line2:        values.address_line2 || undefined,
        postal_code:          values.postal_code || undefined,
        city:                 values.city || undefined,
        contact_email:        values.contact_email || undefined,
        contact_first_name:   firstName || undefined,
        contact_last_name:    rest.join(' ') || undefined,
        contact_phone:        values.contact_phone || undefined,
        notes:                values.notes || undefined,
        status:               values.is_active ? 'active' : 'paused',
        alt_name:             values.alt_name || undefined,
        default_discount_pct: values.standard_discount && !Number.isNaN(discPct) ? discPct : undefined,
        payment_terms_days:   values.payment_terms_days && !Number.isNaN(termsDays) ? termsDays : undefined,
        economy_notes:        values.economy_notes || undefined,
        has_debt_collection:  values.has_debt_collection,
      },
    }, {
      onSuccess: () => toast({ title: 'Ändringar sparade' }),
      onError:   (e) => toast({ title: 'Kunde inte spara', description: e instanceof Error ? e.message : '', variant: 'destructive' }),
    });
  }

  function handleDelete() {
    archiveMutation.mutate(id, {
      onSuccess: () => { toast({ title: 'Företagskund borttagen' }); navigate('/corporate'); },
      onError:   (e) => toast({ title: 'Kunde inte ta bort', description: e instanceof Error ? e.message : '', variant: 'destructive' }),
    });
  }

  if (isLoading) return <div className="space-y-3 p-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>;
  if (!customer) return null;

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          {/* 3-column form grid */}
          <div className="grid grid-cols-[1fr_1fr_220px] gap-x-6 gap-y-3 p-5">

            {/* ── Left column: company/address ─────────────────────────── */}
            <div className="space-y-3">
              <FormField control={form.control} name="org_number" render={({ field }) => (
                <FormItem>
                  <Field label="Organisationsnr.">
                    <FormControl><Input className="h-8 text-sm" {...field} /></FormControl>
                  </Field>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="company_name" render={({ field }) => (
                <FormItem>
                  <Field label="Företagsnamn">
                    <FormControl><Input className="h-8 text-sm" {...field} /></FormControl>
                  </Field>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="alt_name" render={({ field }) => (
                <FormItem>
                  <Field label="Ytterligare namn">
                    <FormControl><Input className="h-8 text-sm" placeholder="Ytterligare namn" {...field} /></FormControl>
                  </Field>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="address_line1" render={({ field }) => (
                <FormItem>
                  <Field label="Adressrad 1">
                    <FormControl><Input className="h-8 text-sm" {...field} /></FormControl>
                  </Field>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="address_line2" render={({ field }) => (
                <FormItem>
                  <Field label="Adressrad 2">
                    <FormControl><Input className="h-8 text-sm" {...field} /></FormControl>
                  </Field>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-[100px_1fr] gap-2">
                <FormField control={form.control} name="postal_code" render={({ field }) => (
                  <FormItem>
                    <Field label="Postnummer">
                      <FormControl><Input className="h-8 text-sm" {...field} /></FormControl>
                    </Field>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="city" render={({ field }) => (
                  <FormItem>
                    <Field label="Postort">
                      <FormControl><Input className="h-8 text-sm" {...field} /></FormControl>
                    </Field>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* ── Middle column: contact/billing ───────────────────────── */}
            <div className="space-y-3">
              <FormField control={form.control} name="contact_email" render={({ field }) => (
                <FormItem>
                  <Field label="E-postadress">
                    <FormControl><Input type="email" className="h-8 text-sm" {...field} /></FormControl>
                  </Field>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="er_ref" render={({ field }) => (
                <FormItem>
                  <Field label="Er ref">
                    <FormControl><Input className="h-8 text-sm" placeholder="Kontaktpersonens namn" {...field} /></FormControl>
                  </Field>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="contact_phone" render={({ field }) => (
                <FormItem>
                  <Field label="Huvudtelefon">
                    <FormControl><Input type="tel" className="h-8 text-sm" {...field} /></FormControl>
                  </Field>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="standard_discount" render={({ field }) => (
                <FormItem>
                  <Field label="Standardrabatt i procent (%)">
                    <FormControl><Input className="h-8 text-sm" placeholder="0" {...field} /></FormControl>
                  </Field>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="payment_terms_days" render={({ field }) => (
                <FormItem>
                  <Field label="Betalningsvillkor (dagar)">
                    <FormControl><Input className="h-8 text-sm" placeholder="10 dagar om inget annat angivits" {...field} /></FormControl>
                  </Field>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <Field label="Kommentar (intern)">
                    <FormControl><Textarea className="text-sm min-h-[60px] resize-none" {...field} /></FormControl>
                  </Field>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="economy_notes" render={({ field }) => (
                <FormItem>
                  <Field label="Kommentar (ekonomi)">
                    <FormControl><Textarea className="text-sm min-h-[60px] resize-none" {...field} /></FormControl>
                  </Field>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* ── Right column: status + delete ────────────────────────── */}
            <div className="space-y-3">
              <div className="border border-border rounded-md p-3 space-y-2.5">
                <FormField control={form.control} name="is_active" render={({ field }) => (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={e => field.onChange(e.target.checked)}
                      className="accent-primary w-4 h-4 rounded"
                    />
                    <span className="text-sm">Aktiv</span>
                  </label>
                )} />
                <FormField control={form.control} name="has_debt_collection" render={({ field }) => (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={e => field.onChange(e.target.checked)}
                      className="accent-primary w-4 h-4 rounded"
                    />
                    <span className="text-sm">Har inkassoärende</span>
                  </label>
                )} />
              </div>

              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Ta bort företaget
              </button>
            </div>
          </div>

          {/* Save button */}
          <div className="px-5 pb-4">
            <Button
              type="submit"
              className="w-full bg-[#1a2b4a] hover:bg-[#14213d] text-white h-10"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Sparar...' : 'Spara'}
            </Button>
          </div>
        </form>
      </Form>

      {/* ── Elever accordion ──────────────────────────────────────────────── */}
      <ElevAccordion id={id} />

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ta bort företagskund</DialogTitle>
            <DialogDescription>
              Vill du ta bort <strong>{customer.company_name}</strong>? Kunden arkiveras och tas bort från aktiva listor. Historiken bevaras.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={archiveMutation.isPending}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={archiveMutation.isPending}>
              {archiveMutation.isPending ? 'Tar bort...' : 'Ta bort'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Avtal schema ─────────────────────────────────────────────────────────────

const avtalSchema = z.object({
  name:               z.string().trim().min(1, 'Avtalsnamn krävs').max(200),
  er_ref:             z.string().trim().max(200).optional(),
  payment_terms_days: z.string().trim().max(10).optional(),
  credit_limit:       z.string().trim().max(20).optional(),
  discount_pct:       z.string().trim().max(10).optional(),
  is_active:          z.boolean(),
  comment:            z.string().trim().max(2000).optional(),
  contact_email:      z.string().trim().max(200).optional(),
  contact_name:       z.string().trim().max(200).optional(),
  contact_phone:      z.string().trim().max(50).optional(),
});
type AvtalValues = z.infer<typeof avtalSchema>;

const AVTAL_DEFAULTS: AvtalValues = {
  name: '', er_ref: '', payment_terms_days: '',
  credit_limit: '', discount_pct: '10',
  is_active: true, comment: '',
  contact_email: '', contact_name: '', contact_phone: '',
};

function contractToFormValues(c: CorporateContract): AvtalValues {
  return {
    name:               c.name,
    er_ref:             c.er_ref             ?? '',
    payment_terms_days: c.payment_terms_days?.toString() ?? '',
    credit_limit:       c.credit_limit_sek?.toString()  ?? '',
    discount_pct:       c.discount_pct?.toString()       ?? '',
    is_active:          c.is_active,
    comment:            c.comment       ?? '',
    contact_email:      c.contact_email ?? '',
    contact_name:       c.contact_name  ?? '',
    contact_phone:      c.contact_phone ?? '',
  };
}

// ─── Contract dialog (create + edit) ─────────────────────────────────────────

function NyttAvtalDialog({
  open, onOpenChange, corporateCustomerId, editContract,
}: {
  open:                boolean;
  onOpenChange:        (v: boolean) => void;
  corporateCustomerId: string;
  editContract?:       CorporateContract | undefined;
}) {
  const isEdit        = editContract !== undefined;
  const createContract = useCreateCorporateContract();
  const updateContract = useUpdateCorporateContract();
  const isPending      = createContract.isPending || updateContract.isPending;

  const form = useForm<AvtalValues>({
    resolver: zodResolver(avtalSchema),
    defaultValues: AVTAL_DEFAULTS,
  });

  useEffect(() => {
    if (open) {
      form.reset(isEdit && editContract ? contractToFormValues(editContract) : AVTAL_DEFAULTS);
    }
  }, [open, isEdit, editContract, form]);

  function onSubmit(values: AvtalValues) {
    const termsDays   = parseInt(values.payment_terms_days ?? '', 10);
    const creditLimit = parseFloat(values.credit_limit ?? '');
    const discountPct = parseFloat(values.discount_pct ?? '');

    const payload = {
      name:               values.name,
      er_ref:             values.er_ref || undefined,
      payment_terms_days: values.payment_terms_days && !Number.isNaN(termsDays)   ? termsDays   : undefined,
      credit_limit_sek:   values.credit_limit       && !Number.isNaN(creditLimit) ? creditLimit : undefined,
      discount_pct:       values.discount_pct       && !Number.isNaN(discountPct) ? discountPct : undefined,
      is_active:          values.is_active,
      comment:            values.comment        || undefined,
      contact_email:      values.contact_email  || undefined,
      contact_name:       values.contact_name   || undefined,
      contact_phone:      values.contact_phone  || undefined,
    };

    if (isEdit && editContract) {
      updateContract.mutate(
        { id: editContract.id, corporateCustomerId, input: payload },
        {
          onSuccess: () => { toast({ title: 'Avtal uppdaterat' }); onOpenChange(false); },
          onError: (e) => toast({ title: 'Kunde inte spara', description: e instanceof Error ? e.message : '', variant: 'destructive' }),
        },
      );
    } else {
      createContract.mutate(
        { ...payload, corporate_customer_id: corporateCustomerId },
        {
          onSuccess: () => { toast({ title: 'Avtal sparat' }); onOpenChange(false); },
          onError: (e) => toast({ title: 'Kunde inte spara', description: e instanceof Error ? e.message : '', variant: 'destructive' }),
        },
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90dvh] flex flex-col p-0 gap-0 overflow-hidden" aria-describedby={undefined}>
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border">
          <DialogTitle className="text-lg font-semibold">{isEdit ? 'Redigera avtal' : 'Nytt avtal'}</DialogTitle>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <DialogBody className="px-6 py-5">

              {/* 2-column grid */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">

                {/* ── Left column ───────────────────────────────────────── */}
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal text-foreground">Avtalsnamn</FormLabel>
                    <FormControl><Input className="h-10 bg-white dark:bg-muted/20" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* ── Right column ──────────────────────────────────────── */}
                <FormField control={form.control} name="contact_email" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal text-foreground">E-post (kontaktperson)</FormLabel>
                    <FormControl><Input type="email" className="h-10 bg-white dark:bg-muted/20" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Left */}
                <FormField control={form.control} name="er_ref" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal text-foreground">Er ref</FormLabel>
                    <FormControl><Input className="h-10 bg-white dark:bg-muted/20" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Right */}
                <FormField control={form.control} name="contact_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal text-foreground">Namn (kontaktperson)</FormLabel>
                    <FormControl><Input className="h-10 bg-white dark:bg-muted/20" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Left */}
                <FormField control={form.control} name="payment_terms_days" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal text-foreground">Betalningsvillkor (dagar)</FormLabel>
                    <FormControl>
                      <Input
                        type="number" min={0} className="h-10 bg-white dark:bg-muted/20"
                        placeholder="10 dagar om inget annat angivits"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Right */}
                <FormField control={form.control} name="contact_phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal text-foreground">Telefonnummer (kontaktperson)</FormLabel>
                    <FormControl><Input type="tel" className="h-10 bg-white dark:bg-muted/20" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Left — credit limit (half width) */}
                <FormField control={form.control} name="credit_limit" render={({ field }) => (
                  <FormItem className="col-span-1">
                    <FormLabel className="text-sm font-normal text-foreground">Kreditgräns per elev</FormLabel>
                    <FormControl><Input type="number" min={0} className="h-10 bg-white dark:bg-muted/20" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Right — empty to keep grid aligned */}
                <div />

                {/* Left — discount */}
                <FormField control={form.control} name="discount_pct" render={({ field }) => (
                  <FormItem className="col-span-1">
                    <FormLabel className="text-sm font-normal text-foreground">Standardrabatt i procent (%)</FormLabel>
                    <FormControl><Input type="number" min={0} max={100} step={0.1} className="h-10 bg-white dark:bg-muted/20" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div />

                {/* Active checkbox — left */}
                <FormField control={form.control} name="is_active" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={e => field.onChange(e.target.checked)}
                        className="accent-primary w-4 h-4 rounded"
                      />
                      <span className="text-sm">Aktiv</span>
                    </label>
                  </FormItem>
                )} />

                {/* Comment — full width */}
                <FormField control={form.control} name="comment" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel className="text-sm font-normal text-foreground">Kommentar</FormLabel>
                    <FormControl>
                      <Textarea className="min-h-[120px] resize-y bg-white dark:bg-muted/20" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </DialogBody>

            {/* Footer */}
            <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/5">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Avbryt
              </Button>
              <Button type="submit" className="bg-[#1a2b4a] hover:bg-[#14213d] text-white px-8" disabled={isPending}>
                {isPending ? 'Sparar...' : isEdit ? 'Uppdatera' : 'Spara'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab: Avtal ───────────────────────────────────────────────────────────────

function AvtalTab({ id }: { id: string }) {
  const [filter,          setFilter]          = useState('aktiva');
  const [dialogOpen,      setDialogOpen]      = useState(false);
  const [editingContract, setEditingContract] = useState<CorporateContract | undefined>(undefined);

  const { data, isLoading }  = useCorporateContracts(id);
  const archiveContract      = useArchiveCorporateContract();
  const contracts            = data?.data ?? [];

  const filtered = filter === 'aktiva'
    ? contracts.filter(a => a.is_active)
    : filter === 'avslutade'
    ? contracts.filter(a => !a.is_active)
    : contracts;

  function openNew() {
    setEditingContract(undefined);
    setDialogOpen(true);
  }

  function openEdit(contract: CorporateContract) {
    setEditingContract(contract);
    setDialogOpen(true);
  }

  function handleArchive(e: React.MouseEvent, contractId: string) {
    e.stopPropagation();
    archiveContract.mutate(
      { contractId, corporateCustomerId: id },
      {
        onSuccess: () => toast({ title: 'Avtal arkiverat' }),
        onError: (err) => toast({ title: 'Kunde inte arkivera', description: err instanceof Error ? err.message : '', variant: 'destructive' }),
      },
    );
  }

  return (
    <div className="p-5 space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="h-9 text-sm border border-input rounded-md pl-3 pr-8 bg-background appearance-none cursor-pointer"
          >
            <option value="aktiva">Aktiva avtal</option>
            <option value="alla">Alla avtal</option>
            <option value="avslutade">Avslutade avtal</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <Button
          size="sm"
          className="bg-[#1a2b4a] hover:bg-[#14213d] text-white h-9"
          onClick={openNew}
        >
          Nytt avtal
        </Button>
      </div>

      {/* Contract list */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/10">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Avtal</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Betalningsvillkor</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Kreditgräns per elev</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Status</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [1, 2].map(i => (
                <tr key={i}><td colSpan={5} className="px-4 py-2"><Skeleton className="h-8 w-full" /></td></tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Inga avtal hittade.
                </td>
              </tr>
            ) : (
              filtered.map(contract => (
                <tr
                  key={contract.id}
                  className="border-b border-border last:border-0 hover:bg-muted/10 cursor-pointer"
                  onClick={() => openEdit(contract)}
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-blue-600">{contract.name}</p>
                    {(contract.er_ref || contract.discount_pct !== null) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[
                          contract.er_ref && `Ref: ${contract.er_ref}`,
                          contract.discount_pct !== null && `Rabatt: ${contract.discount_pct}%`,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{contract.payment_terms_days != null ? `${contract.payment_terms_days} dagar` : '—'}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{contract.credit_limit_sek != null ? `${SEK.format(contract.credit_limit_sek)} kr` : '—'}</td>
                  <td className="px-4 py-3 text-sm">{contract.is_active ? 'Aktivt' : 'Avslutat'}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => handleArchive(e, contract.id)}
                      className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                      title="Arkivera avtal"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <NyttAvtalDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        corporateCustomerId={id}
        editContract={editingContract}
      />
    </div>
  );
}

// ─── Tab: Dokument ────────────────────────────────────────────────────────────

interface CorporateDocument {
  id:              string;
  file_name:       string;
  storage_path:    string;
  mime_type:       string | null;
  file_size_bytes: number | null;
  created_at:      string;
}

const CORP_DOC_BUCKET = 'corporate-documents';
const CORP_DOC_MAX_BYTES = 50 * 1024 * 1024;
const CORP_DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp';

function fmtBytes(n: number | null) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function DokumentTab({ id }: { id: string }) {
  const { organization, user } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const [dragOver, setDragOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CorporateDocument | null>(null);
  const queryKey = ['corporate-documents', id] as const;

  const { data: docs = [], isLoading, isError } = useQuery({
    queryKey,
    queryFn: async (): Promise<CorporateDocument[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as unknown as any)
        .from('corporate_customer_documents')
        .select('id, file_name, storage_path, mime_type, file_size_bytes, created_at')
        .eq('corporate_customer_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as CorporateDocument[];
    },
    staleTime: 30_000,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!orgId || !user?.id) throw new Error('Du är inte inloggad.');
      if (file.size > CORP_DOC_MAX_BYTES) throw new Error('Filen är större än 50 MB.');
      const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
      const storagePath = `${orgId}/${id}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;
      const { error: upErr } = await supabase.storage.from(CORP_DOC_BUCKET).upload(storagePath, file, file.type ? { contentType: file.type } : {});
      if (upErr) throw new Error(upErr.message.includes('mime') ? 'Filtypen stöds inte. Använd PDF, Word, Excel eller bild.' : upErr.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supabase as unknown as any)
        .from('corporate_customer_documents')
        .insert({
          organization_id:       orgId,
          corporate_customer_id: id,
          file_name:             file.name.slice(0, 255),
          storage_path:          storagePath,
          mime_type:             file.type || null,
          file_size_bytes:       file.size,
          uploaded_by:           user.id,
        });
      if (dbErr) throw new Error(dbErr.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey }); },
  });

  const remove = useMutation({
    mutationFn: async (doc: CorporateDocument) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as unknown as any)
        .from('corporate_customer_documents')
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
        .eq('id', doc.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey }); toast({ title: 'Dokumentet togs bort' }); },
    onError: (e) => toast({ title: 'Kunde inte ta bort dokumentet', description: e instanceof Error ? e.message : '', variant: 'destructive' }),
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    let ok = 0;
    for (const file of Array.from(files)) {
      try {
        await upload.mutateAsync(file);
        ok += 1;
      } catch (e) {
        toast({ title: `Kunde inte ladda upp ${file.name}`, description: e instanceof Error ? e.message : '', variant: 'destructive' });
      }
    }
    if (ok > 0) toast({ title: ok === 1 ? 'Dokumentet laddades upp' : `${ok} dokument laddades upp` });
  }

  async function handleOpen(doc: CorporateDocument) {
    const { data, error } = await supabase.storage.from(CORP_DOC_BUCKET).createSignedUrl(doc.storage_path, 60);
    if (error || !data) {
      toast({ title: 'Kunde inte öppna dokumentet', description: error?.message ?? '', variant: 'destructive' });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  return (
    <div className="p-5 space-y-4">
      <PermissionGate permission={Permissions.DOCUMENTS_CREATE}>
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFiles(e.dataTransfer.files); }}
          className={cn(
            'flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-8 cursor-pointer transition-colors text-center px-4',
            dragOver ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/20',
            upload.isPending && 'opacity-60 pointer-events-none',
          )}
        >
          {upload.isPending ? <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /> : <Upload className="w-5 h-5 text-muted-foreground" />}
          <p className="text-sm text-muted-foreground">
            {upload.isPending ? 'Laddar upp…' : 'Dra filer hit eller klicka för att ladda upp. PDF, Word, Excel eller bild, högst 50 MB per fil.'}
          </p>
          <input
            type="file"
            multiple
            className="hidden"
            accept={CORP_DOC_ACCEPT}
            onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }}
          />
        </label>
      </PermissionGate>

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="border-b border-border bg-muted/10">
              {['Filnamn', 'Uppladdad', 'Storlek', ''].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [1, 2].map((i) => <tr key={i}><td colSpan={4} className="px-4 py-2"><Skeleton className="h-7 w-full" /></td></tr>)
            ) : isError ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-destructive">Dokumenten kunde inte hämtas.</td></tr>
            ) : docs.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">Inga dokument uppladdade.</td></tr>
            ) : (
              docs.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                  <td className="px-4 py-2.5">
                    <button type="button" onClick={() => void handleOpen(d)} className="flex items-center gap-2 text-left text-blue-600 hover:underline">
                      <FileText className="w-4 h-4 shrink-0" />
                      <span className="truncate">{d.file_name}</span>
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{fmtDate(d.created_at)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{fmtBytes(d.file_size_bytes)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button type="button" onClick={() => void handleOpen(d)} title="Öppna" className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <PermissionGate permission={Permissions.DOCUMENTS_DELETE}>
                      <button type="button" onClick={() => setConfirmDelete(d)} title="Ta bort" className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </PermissionGate>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={confirmDelete !== null} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ta bort dokument</DialogTitle>
            <DialogDescription>
              Vill du ta bort <strong>{confirmDelete?.file_name}</strong>? Dokumentet försvinner från företagets lista.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Avbryt</Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => { if (confirmDelete) remove.mutate(confirmDelete, { onSettled: () => setConfirmDelete(null) }); }}
            >
              {remove.isPending ? 'Tar bort…' : 'Ta bort'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Fakturadata (Fakturor + Konto) ───────────────────────────────────────────

interface InvoiceRow {
  id:                    string;
  invoice_number:        string | null;
  status:                string;
  issued_at:             string | null;
  due_date:              string | null;
  created_at:            string;
  void_at:               string | null;
  total_amount:          number;
  paid_amount:           number;
  outstanding_amount:    number;
  student_id:            string;
  corporate_customer_id: string | null;
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    paid: 'Betald', issued: 'Skickad – väntar på betalning', overdue: 'Förfallen',
    draft: 'Utkast – ej skickad', partially_paid: 'Delvis betald', void: 'Makulerad',
  };
  return map[s] ?? s;
}

const STATUS_CLS: Record<string, string> = {
  paid:           'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  issued:         'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  overdue:        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  partially_paid: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  draft:          'bg-muted text-muted-foreground',
  void:           'bg-muted text-muted-foreground line-through',
};

/** Fakturor som avser företaget: fakturerade företaget, eller utställda på företagets elever. */
function useCorporateInvoices(id: string) {
  const { data: studentData, isLoading: studentsLoading } = useStudentList({ corporate_customer_id: id, per_page: 100 });
  const students   = studentData?.data ?? [];
  const studentIds = students.map((s) => s.id);
  const studentMap = Object.fromEntries(students.map((s) => [s.id, `${s.first_name} ${s.last_name}`]));

  const invoicesQuery = useQuery({
    queryKey: ['corp-invoices', id, studentIds.join(',')],
    queryFn: async (): Promise<InvoiceRow[]> => {
      const filter = studentIds.length > 0
        ? `corporate_customer_id.eq.${id},student_id.in.(${studentIds.join(',')})`
        : `corporate_customer_id.eq.${id}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as unknown as any)
        .from('invoices')
        .select('id, invoice_number, status, issued_at, due_date, created_at, void_at, total_amount, paid_amount, outstanding_amount, student_id, corporate_customer_id')
        .or(filter)
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      return (data ?? []) as InvoiceRow[];
    },
    enabled: !studentsLoading,
    staleTime: 60_000,
  });

  return {
    invoices:  invoicesQuery.data ?? [],
    isLoading: studentsLoading || invoicesQuery.isLoading,
    isError:   invoicesQuery.isError,
    studentMap,
  };
}

// ─── Tab: Fakturor ────────────────────────────────────────────────────────────

function FakturorTab({ id }: { id: string }) {
  const { invoices, isLoading, isError, studentMap } = useCorporateInvoices(id);
  const [filter, setFilter] = useState<'foretaget' | 'alla'>('foretaget');
  const shown = filter === 'foretaget' ? invoices.filter((i) => i.corporate_customer_id === id) : invoices;
  const billed = invoices.filter((i) => i.corporate_customer_id === id && i.status !== 'draft' && i.status !== 'void');
  const outstanding = billed.reduce((s, i) => s + i.outstanding_amount, 0);
  const overdue = billed.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.outstanding_amount, 0);
  const drafts = invoices.filter((i) => i.corporate_customer_id === id && i.status === 'draft').length;

  return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">Obetalt</p>
          <p className="text-lg font-bold tabular-nums">{SEK.format(outstanding)} kr</p>
        </div>
        <div className={cn('rounded-lg border px-4 py-3', overdue > 0 ? 'border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-900' : 'border-border')}>
          <p className="text-xs text-muted-foreground">Varav förfallet</p>
          <p className="text-lg font-bold tabular-nums">{SEK.format(overdue)} kr</p>
        </div>
        <div className="rounded-lg border border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">Ej skickade utkast</p>
          <p className="text-lg font-bold tabular-nums">{drafts}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'foretaget' | 'alla')}
            className="h-9 text-sm border border-input rounded-md pl-3 pr-8 bg-background appearance-none cursor-pointer"
          >
            <option value="foretaget">Fakturerade företaget</option>
            <option value="alla">Alla fakturor för företagets elever</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">Öppna en faktura för att skicka, registrera betalning eller makulera den.</p>
      </div>

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b border-border bg-muted/10">
              {['Nr', 'Elev', 'Betalas av', 'Datum', 'Förfaller', 'Belopp', 'Kvar att betala', 'Status', ''].map((h, i) => (
                <th key={i} className={cn('px-4 py-2.5 text-xs font-semibold text-muted-foreground', i === 5 || i === 6 ? 'text-right' : 'text-left')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [1, 2, 3].map((i) => <tr key={i}><td colSpan={9} className="px-4 py-2"><Skeleton className="h-6 w-full" /></td></tr>)
            ) : isError ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-destructive">Fakturorna kunde inte hämtas.</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                {filter === 'foretaget' ? 'Inga fakturor är ställda till företaget ännu.' : 'Inga fakturor för företagets elever.'}
              </td></tr>
            ) : (
              shown.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                  <td className="px-4 py-2.5 text-xs font-medium tabular-nums">{inv.invoice_number ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs">{studentMap[inv.student_id] ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{inv.corporate_customer_id === id ? 'Företaget' : 'Eleven'}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums">{fmtDate(inv.issued_at ?? inv.created_at)}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums">{fmtDate(inv.due_date)}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-right font-medium">{SEK.format(inv.total_amount)}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-right">{inv.status === 'void' || inv.status === 'draft' ? '—' : SEK.format(inv.outstanding_amount)}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', STATUS_CLS[inv.status] ?? 'bg-muted text-muted-foreground')}>
                      {statusLabel(inv.status)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <Link to={`/finance/invoices/${inv.id}`} className="text-xs font-medium text-primary hover:underline">
                      {inv.status === 'draft' ? 'Öppna och skicka' : 'Öppna'}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: Konto ───────────────────────────────────────────────────────────────

const PAYMENT_METHOD_SV: Record<string, string> = {
  manual: 'Kontant/manuell', card: 'Kort', bank_transfer: 'Bankgiro/överföring', swish: 'Swish',
  stripe: 'Kort online', invoice_credit: 'Kreditering', other: 'Övrigt',
};

interface PaymentRow {
  id:             string;
  invoice_id:     string;
  amount:         number;
  status:         string;
  payment_method: string;
  paid_at:        string | null;
  confirmed_at:   string | null;
  created_at:     string;
  refund_amount:  number | null;
  refunded_at:    string | null;
}

/** Kontoutdrag för företaget: fakturor ställda till företaget (debet) och betalningar på dem (kredit). */
function KontoTab({ id }: { id: string }) {
  const { invoices, isLoading: invLoading, studentMap } = useCorporateInvoices(id);
  const billed = invoices.filter((i) => i.corporate_customer_id === id && i.status !== 'draft');
  const billedIds = billed.map((i) => i.id);

  const { data: payments = [], isLoading: payLoading } = useQuery({
    queryKey: ['corp-payments', id, billedIds.join(',')],
    queryFn: async (): Promise<PaymentRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as unknown as any)
        .from('payments')
        .select('id, invoice_id, amount, status, payment_method, paid_at, confirmed_at, created_at, refund_amount, refunded_at')
        .in('invoice_id', billedIds)
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as PaymentRow[];
    },
    enabled: !invLoading && billedIds.length > 0,
    staleTime: 60_000,
  });

  const rows = (() => {
    const invById = Object.fromEntries(billed.map((i) => [i.id, i]));
    const items: { id: string; at: string; text: string; elev: string; debit: number; credit: number }[] = [];
    for (const inv of billed) {
      const nr = inv.invoice_number ? `nr ${inv.invoice_number}` : '';
      const elev = studentMap[inv.student_id] ?? '—';
      items.push({ id: `inv-${inv.id}`, at: inv.issued_at ?? inv.created_at, text: `Faktura ${nr}`.trim(), elev, debit: inv.total_amount, credit: 0 });
      if (inv.status === 'void' && inv.void_at) {
        items.push({ id: `void-${inv.id}`, at: inv.void_at, text: `Makulering av faktura ${nr}`.trim(), elev, debit: 0, credit: inv.total_amount });
      }
    }
    for (const p of payments) {
      if (p.status !== 'confirmed' && p.status !== 'refunded' && p.status !== 'partially_refunded') continue;
      const inv = invById[p.invoice_id];
      const nr = inv?.invoice_number ? ` (faktura ${inv.invoice_number})` : '';
      const elev = inv ? studentMap[inv.student_id] ?? '—' : '—';
      items.push({ id: `pay-${p.id}`, at: p.paid_at ?? p.confirmed_at ?? p.created_at, text: `Betalning – ${PAYMENT_METHOD_SV[p.payment_method] ?? 'Övrigt'}${nr}`, elev, debit: 0, credit: p.amount });
      if (p.refund_amount && p.refund_amount > 0) {
        items.push({ id: `ref-${p.id}`, at: p.refunded_at ?? p.created_at, text: `Återbetalning${nr}`, elev, debit: p.refund_amount, credit: 0 });
      }
    }
    items.sort((a, b) => a.at.localeCompare(b.at));
    let saldo = 0;
    return items.map((r) => { saldo += r.debit - r.credit; return { ...r, saldo }; });
  })();

  const isLoading = invLoading || (billedIds.length > 0 && payLoading);
  const saldo = rows.length > 0 ? rows[rows.length - 1]!.saldo : 0;

  return (
    <div className="p-5 space-y-4">
      <div className={cn('rounded-lg border px-4 py-3 max-w-xs', saldo > 0.005 ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800' : 'border-border')}>
        <p className="text-xs text-muted-foreground">{saldo < -0.005 ? 'Företaget har tillgodo' : 'Företaget är skyldigt'}</p>
        <p className="text-xl font-bold tabular-nums">{SEK.format(Math.abs(saldo))} kr</p>
      </div>

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-border bg-muted/10">
              {['Datum', 'Händelse', 'Elev', 'Debet', 'Kredit', 'Saldo'].map((h, i) => (
                <th key={h} className={cn('px-4 py-2.5 text-xs font-semibold text-muted-foreground', i >= 3 ? 'text-right' : 'text-left')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [1, 2, 3].map((i) => <tr key={i}><td colSpan={6} className="px-4 py-2"><Skeleton className="h-6 w-full" /></td></tr>)
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">Inga fakturor eller betalningar för företaget ännu.</td></tr>
            ) : (
              [...rows].reverse().map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums whitespace-nowrap">{fmtDate(r.at)}</td>
                  <td className="px-4 py-2.5 text-sm">{r.text}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.elev}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.debit ? SEK.format(r.debit) : ''}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-green-700 dark:text-green-400">{r.credit ? SEK.format(r.credit) : ''}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{SEK.format(r.saldo)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">Bara fakturor som är ställda till företaget räknas. Utkast räknas inte.</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function CorporateDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DetailTab>('foretaget');

  const { data: customer, isLoading, error } = useCorporateCustomer(id ?? null);

  if (isLoading) {
    return (
      <div className="max-w-screen-xl mx-auto space-y-3 pt-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="max-w-screen-xl mx-auto py-20 flex flex-col items-center gap-3">
        <p className="text-sm text-destructive">Företagskunden hittades inte.</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/corporate')}>Tillbaka</Button>
      </div>
    );
  }

  return (
    <div className="max-w-screen-xl mx-auto">

      {/* Page header */}
      <div className="flex items-center gap-2 pb-3">
        <Building2 className="w-5 h-5 text-foreground" />
        <h1 className="text-base font-semibold text-foreground">{customer.company_name}</h1>
      </div>

      {/* Tab nav */}
      <div className="flex border-b border-border overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              t.key === activeTab
                ? 'text-foreground border-b-2 border-foreground -mb-px'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/20',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-card border border-t-0 border-border rounded-b-lg">
        {activeTab === 'foretaget' && id && <ForetagetTab id={id} />}
        {activeTab === 'avtal'     && id && <AvtalTab     id={id} />}
        {activeTab === 'fakturor'  && id && <FakturorTab  id={id} />}
        {activeTab === 'konto'     && id && <KontoTab     id={id} />}
        {activeTab === 'dokument'  && id && <DokumentTab  id={id} />}
      </div>
    </div>
  );
}
