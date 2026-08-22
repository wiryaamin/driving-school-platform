import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, ChevronDown, ChevronUp, Upload, Trash2 } from 'lucide-react';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
  Input, Button, Textarea,
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogDescription,
  Skeleton, toast,
} from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useQuery } from '@tanstack/react-query';
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

// ─── Types ────────────────────────────────────────────────────────────────────

type DetailTab = 'foretaget' | 'dokument' | 'billecta' | 'aktiviteter' | 'avtal' | 'konto' | 'historik';

const TABS: { key: DetailTab; label: string }[] = [
  { key: 'foretaget',   label: 'Företaget'             },
  { key: 'dokument',    label: 'Dokument'              },
  { key: 'billecta',    label: 'Billecta'              },
  { key: 'aktiviteter', label: 'Aktiviteter utan avtal' },
  { key: 'avtal',       label: 'Avtal'                 },
  { key: 'konto',       label: 'Konto'                 },
  { key: 'historik',    label: 'Historik'              },
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
                  <a href={`/students/${s.id}`} className="text-blue-600 hover:underline">
                    {s.first_name} {s.last_name}
                  </a>
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

// ─── Tab: Dokument ────────────────────────────────────────────────────────────

function DokumentTab() {
  return (
    <div className="p-5 space-y-4">
      {/* Upload zone */}
      <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg py-8 cursor-pointer hover:bg-muted/20 transition-colors text-center">
        <Upload className="w-5 h-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Dra filer till det här fältet eller klicka här för att ladda upp filen.
          Video- och ljudfiler kan inte laddas upp och filen måste vara mindre än 50 MB.
        </p>
        <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg" />
      </label>

      {/* File table */}
      <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
        <thead>
          <tr className="border-b border-border bg-muted/10">
            {['Filnamn', 'Uppladdad', 'Laddar upp', 'Typ', 'Storlek', 'Val'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
              Inga dokument uppladdade.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Tab: Billecta ────────────────────────────────────────────────────────────

function BillectaTab({ id }: { id: string }) {
  const { data: customer } = useCorporateCustomer(id);
  if (!customer) return null;

  const rows: { label: string; value: string }[] = [
    { label: 'Namn',        value: customer.company_name },
    { label: 'Företagsnr.', value: customer.org_number ?? '—' },
    { label: 'Adress',      value: [customer.address_line1, `${customer.postal_code ?? ''} ${customer.city ?? ''}`.trim()].filter(Boolean).join('\n') || '—' },
    { label: 'E-post',      value: customer.contact_email ?? '—' },
  ];

  return (
    <div className="p-5 space-y-5">
      <div className="max-w-lg space-y-4">
        <h2 className="font-semibold text-sm">Billecta</h2>
        <p className="text-xs text-muted-foreground">
          Informationen som lagras om företaget i Billecta visas nedan. Observera att vid sändning av fakturor kommer
          företagets namn, adress och e-post (om sådan finns) att åsidosättas med information lagrad i TABS.
          Eventuella ändringar av villkor och andra inställningar ska göras i Billecta.
        </p>

        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-muted/10">
            <span className="text-xs font-semibold text-muted-foreground">Allmän information</span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {rows.map(({ label, value }) => (
                <tr key={label} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-xs font-medium text-muted-foreground w-32">{label}</td>
                  <td className="px-4 py-2.5 text-sm whitespace-pre-line">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* E-faktura */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-muted/10">
            <span className="text-xs font-semibold text-muted-foreground">E-Faktura</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Intermediatör</label>
              <select className="h-8 text-sm border border-input rounded-md px-2 bg-background">
                <option value="">- Ingen vald -</option>
                <option>Aksesspunkt Norge AS</option>
                <option>Apix Messaging AB</option>
                <option>Basware</option>
                <option>CGI</option>
                <option>Compello</option>
                <option>Crediflow</option>
                <option>Danske bank</option>
                <option>Evry</option>
                <option>Finvoice</option>
                <option>Handelsbanken</option>
                <option>InExchange</option>
                <option>Liaison Technologies</option>
                <option>Logiq AS</option>
                <option>Nordea</option>
                <option>OpusCapita</option>
                <option>Pagero</option>
                <option>Palette</option>
                <option>PEPPOL</option>
                <option>Readsoft/Lexmark</option>
                <option>SEB</option>
                <option>Strålfors</option>
                <option>Svefaktura</option>
                <option>Swedbank</option>
                <option>Tietoevry</option>
                <option>Visma</option>
                <option>Volvofinans</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">GLN</label>
              <input className="h-8 text-sm border border-input rounded-md px-2 bg-background" placeholder="" />
            </div>
            <div className="flex justify-end">
              <Button size="sm" className="bg-[#1a2b4a] hover:bg-[#14213d] text-white">Spara information</Button>
            </div>
          </div>
        </div>

        {/* Fakturainställningar */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-muted/10">
            <span className="text-xs font-semibold text-muted-foreground">Fakturainstallningar</span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {[
                ['Leverera fakturor/krav med', 'E-post'],
                ['Avtalad ränta', 'Över gällande referensränta: 8%'],
                ['Betalningsvillkor i dagar', '30'],
                ['Administrationsavgift (SEK)', '0'],
                ['Betalningsvillkor för påminnelse i dagar', '10'],
                ['Påminnelseavgift (SEK)', '0'],
                ['Bifoga fakturan i e-post', 'Nej'],
                ['Skicka fakturan på post om e-postmeddelandet inte lästs på ett bestämt antal dagar', 'Ja, efter 3 dag(ar)'],
                ['Skicka automatiska påminnelser', 'Nej'],
                ['Aktivera automatisk kravhantering', 'Ja'],
                ['Börja krav med', 'Påminnelse'],
                ['Antal påminnelser att skicka före inkassokrav', '1'],
                ['Betalningsvillkor i dagar', '10'],
              ].map(([label, value], i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-xs text-muted-foreground w-56">{label}</td>
                  <td className="px-4 py-2 text-xs">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Aktiviteter utan avtal ──────────────────────────────────────────────

function AktiviteterTab() {
  return (
    <div className="p-5">
      <div className="border border-border rounded-md px-4 py-3 bg-muted/10 text-sm text-muted-foreground">
        Det finns inga aktiviteter utan avtal.
      </div>
    </div>
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
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Försäljning</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Betalning</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Oanvänd betalning</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Total kredit/skyldig</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [1, 2].map(i => (
                <tr key={i}><td colSpan={6} className="px-4 py-2"><Skeleton className="h-8 w-full" /></td></tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
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
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">–</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">–</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">–</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums font-medium text-green-600">0,00</td>
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

// ─── Tab: Konto ───────────────────────────────────────────────────────────────

function KontoTab() {
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <select className="h-8 text-sm border border-input rounded-md px-2 bg-background appearance-none pr-7">
          <option>Alla avtal</option>
        </select>
        <select className="h-8 text-sm border border-input rounded-md px-2 bg-background appearance-none pr-7">
          <option>Se betalningar</option>
        </select>
        <div className="ml-auto">
          <Button size="sm" variant="outline" className="h-8 text-xs">
            Kontoutdrag med saldo
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/10">
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground w-12"></th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Datum</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Artikel</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Elev</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Avtal</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Antal</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Betalning</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Försäljning</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Debiteras</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                Inga kontotransaktioner hittades.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: Historik ────────────────────────────────────────────────────────────

interface InvoiceRow {
  id:             string;
  invoice_number: string | null;
  status:         string;
  issued_at:      string | null;
  due_date:       string | null;
  created_at:     string;
  total_amount:   number;
  student_id:     string;
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    paid: 'Betalt', issued: 'Väntar på betalning', overdue: 'Försenad',
    draft: 'Utkast', partially_paid: 'Delvis betalt', void: 'Makulerad',
  };
  return map[s] ?? s;
}

function HistorikTab({ id }: { id: string }) {
  // Step 1: resolve students linked to this company via the corporate_customer_id FK.
  // This is the authoritative scope — only these students' invoices belong to this company.
  const { data: studentData, isLoading: studentsLoading } = useStudentList(
    { corporate_customer_id: id, per_page: 100 },
  );
  const students   = studentData?.data ?? [];
  const studentIds = students.map(s => s.id);
  const studentMap = Object.fromEntries(
    students.map(s => [s.id, `${s.first_name} ${s.last_name}`]),
  );

  // Step 2: fetch invoices scoped to exactly those students — enforces per-company isolation.
  const { data: invoices = [], isLoading: invLoading } = useQuery({
    queryKey: ['corp-historik-invoices', id, studentIds.join(',')],
    queryFn: async (): Promise<InvoiceRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as unknown as any)
        .from('invoices')
        .select('id, invoice_number, status, issued_at, due_date, created_at, total_amount, student_id')
        .is('deleted_at', null)
        .in('student_id', studentIds)
        .order('created_at', { ascending: false })
        .limit(200);
      return (data ?? []) as InvoiceRow[];
    },
    // Don't run until students are loaded; skip entirely if no students are linked.
    enabled: !studentsLoading && studentIds.length > 0,
    staleTime: 60_000,
  });

  const isLoading  = studentsLoading || invLoading;
  const noStudents = !studentsLoading && studentIds.length === 0;
  const totalSEK   = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);

  return (
    <div className="p-5 space-y-3">
      {/* Summary bar — shown only when invoices are present */}
      {!isLoading && !noStudents && invoices.length > 0 && (
        <div className="flex gap-6 text-sm text-muted-foreground">
          <span>{invoices.length} faktura{invoices.length !== 1 ? 'r' : ''}</span>
          <span className="font-medium text-foreground">{SEK.format(totalSEK)} SEK totalt</span>
        </div>
      )}

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/10">
              {['Nr.', 'Typ', 'Tillhör', 'Avtal', 'Datum', 'Förfallodatum', 'Skickat', 'Belopp', 'Betalningsstatus'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [1, 2, 3].map(i => (
                <tr key={i}><td colSpan={9} className="px-4 py-2"><Skeleton className="h-6 w-full" /></td></tr>
              ))
            ) : noStudents ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Inga elever kopplade till företaget — inga fakturor att visa.
                </td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Inga fakturor kopplade till företagets elever.
                </td>
              </tr>
            ) : (
              invoices.map(inv => (
                <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                  <td className="px-4 py-2.5 text-xs font-medium text-blue-600">{inv.invoice_number ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">Faktura</td>
                  <td className="px-4 py-2.5 text-xs">{studentMap[inv.student_id] ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">—</td>
                  <td className="px-4 py-2.5 text-xs">{fmtDate(inv.issued_at ?? inv.created_at)}</td>
                  <td className="px-4 py-2.5 text-xs">{fmtDate(inv.due_date)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{inv.issued_at ? fmtDate(inv.issued_at) : '—'}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums font-medium text-right">
                    {SEK.format(inv.total_amount)}
                  </td>
                  <td className="px-4 py-2.5 text-xs">{statusLabel(inv.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
      <div className="flex border-b border-border">
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
        {activeTab === 'foretaget'   && id && <ForetagetTab   id={id} />}
        {activeTab === 'dokument'    &&        <DokumentTab />}
        {activeTab === 'billecta'    && id && <BillectaTab    id={id} />}
        {activeTab === 'aktiviteter' &&        <AktiviteterTab />}
        {activeTab === 'avtal'       && id && <AvtalTab id={id} />}
        {activeTab === 'konto'       &&        <KontoTab />}
        {activeTab === 'historik'    && id && <HistorikTab    id={id} />}
      </div>
    </div>
  );
}
