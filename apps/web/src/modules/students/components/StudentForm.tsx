import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
  Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Button,
  Textarea,
  toast,
} from '@platform/ui';
import { isValidPersonalNumber } from '@platform/utils';
import { useCreateStudent, useUpdateStudent } from '../hooks/useStudents.js';
import type { Student, CreateStudentFormValues } from '../hooks/useStudents.js';
import { usePersonLookupByPersonnummer } from '../hooks/usePersonLookup.js';
import { useInstructorList } from '@modules/instructors/hooks/useInstructors.js';
import { useCorporateList } from '@modules/corporate/hooks/useCorporateCustomers.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const PERMIT_GROUP_OPTIONS = [
  { value: 'B',   label: 'Behörighet B' },
  { value: 'A',   label: 'Behörighet A' },
  { value: 'C',   label: 'Behörighet C' },
  { value: 'D',   label: 'Behörighet D' },
  { value: 'BE',  label: 'Behörighet BE' },
  { value: 'CE',  label: 'Behörighet CE' },
  { value: 'AM',  label: 'Behörighet AM' },
  { value: 'YKB', label: 'YKB' },
];

const BEHÖRIGHET_OPTIONS = [
  { value: 'B_manual',     label: 'Behörighet BMan' },
  { value: 'B_auto',       label: 'Behörighet BAut' },
  { value: 'risk1_b',      label: 'Riskettan B' },
  { value: 'risk2_b',      label: 'Risktvåan B' },
  { value: 'intro_kurs',   label: 'Introduktionskurs' },
  { value: 'BE',           label: 'Behörighet BE' },
  { value: 'A',            label: 'Behörighet A' },
  { value: 'A1',           label: 'Behörighet A1' },
  { value: 'A2',           label: 'Behörighet A2' },
  { value: 'D',            label: 'Behörighet D' },
  { value: 'DE',           label: 'Behörighet DE' },
  { value: 'D1E',          label: 'Behörighet D1E' },
  { value: 'D1',           label: 'Behörighet D1' },
  { value: 'C',            label: 'Behörighet C' },
  { value: 'C1E',          label: 'Behörighet C1E' },
  { value: 'C1',           label: 'Behörighet C1' },
  { value: 'CE',           label: 'Behörighet CE' },
  { value: 'YKB_person',   label: 'YKB Persontransport' },
  { value: 'YKB_gods',     label: 'YKB Godstransport' },
];

// ─── Schema ───────────────────────────────────────────────────────────────────

const studentFormSchema = z.object({
  // Personal
  first_name:              z.string().min(1, 'Förnamn krävs').max(100),
  last_name:               z.string().min(1, 'Efternamn krävs').max(100),
  personnummer:            z.string().regex(/^(\d{8}-?\d{4})?$/, 'Format: YYYYMMDD-XXXX').optional(),
  email:                   z.string().max(200).optional(),
  phone:                   z.string().max(30).optional(),
  phone_missing:           z.boolean().optional(),
  address_line1:           z.string().max(200).optional(),
  postal_code:             z.string().max(20).optional(),
  city:                    z.string().max(100).optional(),

  // Education (wired to DB)
  permit_group:            z.string().optional(),
  permit_expiry_date:      z.string().optional(),
  target_licence_category: z.string().max(30).optional(),
  assigned_instructor_id:  z.string().optional(),

  // Notes (UI-only — no DB field yet)
  notes:                   z.string().optional(),
  anteckning:              z.string().optional(),

  // Checkboxes (communication_opt_in_sms wired to DB; others UI-only)
  communication_opt_in_sms: z.boolean().optional(),
  has_debt_collection:      z.boolean().optional(),
  prevent_cancellation:     z.boolean().optional(),

  // Company & Economy (UI-only — no DB fields yet)
  company_connection:      z.string().optional(),
  company_reference:       z.string().optional(),
  credit_limit:            z.string().optional(),
  economy_notes:           z.string().optional(),

  // Legacy fields
  status:                  z.enum(['lead', 'onboarding', 'active', 'paused', 'completed', 'withdrawn', 'archived'] as const).optional(),
  data_processing_consent: z.boolean().optional(),
});

type StudentFormValues = z.infer<typeof studentFormSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPersonnummer(student: Student): string {
  if (!student.date_of_birth && !student.personnummer_last4) return '';
  const dob = (student.date_of_birth ?? '').replace(/-/g, '');
  return student.personnummer_last4 ? `${dob}-${student.personnummer_last4}` : dob;
}

function parsePersonnummer(raw: string | undefined): { date_of_birth?: string; personnummer_last4?: string } {
  if (!raw || raw.trim() === '') return {};
  const digits = raw.replace('-', '');
  if (digits.length < 12) return {};
  const dob = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  const last4 = digits.slice(8, 12);
  return { date_of_birth: dob, personnummer_last4: last4 };
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const EMPTY_DEFAULTS: StudentFormValues = {
  first_name: '', last_name: '', personnummer: '',
  email: '', phone: '', phone_missing: false,
  address_line1: '', postal_code: '', city: '',
  permit_group: '', permit_expiry_date: '',
  target_licence_category: '',
  assigned_instructor_id: '',
  notes: '', anteckning: '',
  communication_opt_in_sms: true,
  has_debt_collection: false,
  prevent_cancellation: false,
  company_connection: '', company_reference: '', credit_limit: '', economy_notes: '',
  status: undefined, data_processing_consent: false,
};

function studentToFormValues(s: Student): StudentFormValues {
  return {
    first_name:               s.first_name,
    last_name:                s.last_name,
    personnummer:             formatPersonnummer(s),
    email:                    s.email ?? '',
    phone:                    s.phone ?? '',
    phone_missing:            false,
    address_line1:            s.address_line1 ?? '',
    postal_code:              s.postal_code ?? '',
    city:                     s.city ?? '',
    permit_group:             '',
    permit_expiry_date:       '',
    target_licence_category:  s.target_licence_category ?? '',
    assigned_instructor_id:   s.assigned_instructor_id ?? '',
    notes:                    '',
    anteckning:               '',
    communication_opt_in_sms: s.communication_opt_in_sms,
    has_debt_collection:      false,
    prevent_cancellation:     false,
    company_connection: s.corporate_customer_id ?? '', company_reference: '', credit_limit: '', economy_notes: '',
    status:                   s.status,
    data_processing_consent:  s.data_processing_consent,
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface StudentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student?: Student | null;
  onSuccess?: (student: Student) => void;
}

// ─── Checkbox helper ──────────────────────────────────────────────────────────

function CheckboxField({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 rounded border border-input cursor-pointer accent-primary"
      />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm font-semibold text-foreground">{children}</p>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StudentForm({ open, onOpenChange, student, onSuccess }: StudentFormProps) {
  const isEdit = student != null;
  const [companyOpen, setCompanyOpen] = useState(false);
  const navigate = useNavigate();

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  const createMutation = useCreateStudent();
  const updateMutation = useUpdateStudent();
  const personLookup   = usePersonLookupByPersonnummer();
  const isPending = createMutation.isPending || updateMutation.isPending;

  // ── Person Lookup Framework (Sprint 6) — "Hämta personuppgifter" ────────────
  // Invalid personnummer never calls the lookup provider. Any outcome (found,
  // not found, or the provider being unavailable) leaves the receptionist free
  // to complete the registration manually — the lookup only ever pre-fills.
  function handlePersonLookup() {
    const raw = form.getValues('personnummer');
    if (!raw || !isValidPersonalNumber(raw)) {
      toast({
        title:       'Ogiltigt personnummer',
        description: 'Ange ett giltigt personnummer (ÅÅÅÅMMDD-XXXX) innan du söker.',
        variant:     'destructive',
      });
      return;
    }

    personLookup.mutate(raw, {
      onSuccess: (result) => {
        if (result.status === 'found' && result.data) {
          const d = result.data;
          if (d.first_name)    form.setValue('first_name', d.first_name);
          if (d.last_name)     form.setValue('last_name', d.last_name);
          if (d.address_line1) form.setValue('address_line1', d.address_line1);
          if (d.postal_code)   form.setValue('postal_code', d.postal_code);
          if (d.city)          form.setValue('city', d.city);
          toast({ title: 'Uppgifter hämtade', description: 'Granska informationen innan du sparar.' });
        } else if (result.status === 'not_found') {
          toast({
            title:       'Ingen information hittades',
            description: 'Fortsätt registrera eleven manuellt.',
          });
        } else {
          toast({
            title:       'Sökningen är inte tillgänglig',
            description: 'Fortsätt registrera eleven manuellt.',
          });
        }
      },
      onError: () => {
        toast({
          title:       'Sökningen misslyckades',
          description: 'Fortsätt registrera eleven manuellt.',
        });
      },
    });
  }

  const { data: instructorsData } = useInstructorList({ per_page: 100 }, { enabled: open });
  const instructors = instructorsData?.data ?? [];
  const { data: corporateData } = useCorporateList({ per_page: 200, status: 'active' }, { enabled: open });
  const companies = corporateData?.data ?? [];

  useEffect(() => {
    if (open) {
      setCompanyOpen(false);
      form.reset(isEdit ? studentToFormValues(student) : EMPTY_DEFAULTS);
    }
  }, [open, student, isEdit, form]);

  function onSubmit(values: StudentFormValues) {
    const clean: CreateStudentFormValues = {
      first_name:  values.first_name,
      last_name:   values.last_name,
    };

    if (values.email)         clean.email         = values.email;
    if (values.phone && !values.phone_missing) clean.phone = values.phone;
    if (values.address_line1) clean.address_line1 = values.address_line1;
    if (values.postal_code)   clean.postal_code   = values.postal_code;
    if (values.city)          clean.city          = values.city;
    if (values.status)        clean.status        = values.status;

    if (values.target_licence_category) clean.target_licence_category = values.target_licence_category;
    if (values.assigned_instructor_id)  clean.assigned_instructor_id  = values.assigned_instructor_id;
    if (values.data_processing_consent) clean.data_processing_consent = values.data_processing_consent;
    clean.communication_opt_in_sms = values.communication_opt_in_sms ?? true;

    const pnrParts = parsePersonnummer(values.personnummer);
    if (pnrParts.date_of_birth) {
      (clean as unknown as Record<string, unknown>).date_of_birth       = pnrParts.date_of_birth;
      (clean as unknown as Record<string, unknown>).personnummer_last4  = pnrParts.personnummer_last4;
      (clean as unknown as Record<string, unknown>).identity_type       = 'personnummer';
    }

    clean.corporate_customer_id = values.company_connection || null;

    if (isEdit) {
      updateMutation.mutate(
        { id: student.id, input: clean },
        {
          onSuccess: (updated) => {
            toast({ title: 'Ändringar sparade' });
            onSuccess?.(updated);
            onOpenChange(false);
          },
          onError: (e) => {
            const msg = e instanceof Error ? e.message : 'Försök igen';
            toast({ title: 'Kunde inte spara ändringar', description: msg, variant: 'destructive' });
          },
        }
      );
    } else {
      createMutation.mutate(clean, {
        onSuccess: (created) => {
          toast({ title: 'Elev skapad' });
          onSuccess?.(created);
          onOpenChange(false);
        },
        onError: (e) => {
          void (async () => {
            // A duplicate personnummer is reported by the existing duplicate-
            // detection check in supabase/functions/students/index.ts
            // (handleCreate) — unchanged here; only surfaced with a link to
            // the existing student, per the Business Objective ("Allow
            // opening the existing student. Do not create duplicates.").
            if (e instanceof FunctionsHttpError) {
              try {
                const body = await e.context.json() as { code?: string; message?: string; details?: { existing_student_id?: string } };
                if (body.code === 'DUPLICATE_PERSONAL_NUMBER') {
                  const existingId = body.details?.existing_student_id;
                  toast({
                    title:       'Eleven finns redan',
                    description: (
                      <div className="flex flex-col gap-1.5">
                        <span>En elev med detta personnummer är redan registrerad.</span>
                        {existingId && (
                          <button
                            type="button"
                            className="text-sm font-medium text-primary underline underline-offset-2 text-left"
                            onClick={() => { onOpenChange(false); navigate(`/students/${existingId}`); }}
                          >
                            Visa befintlig elev →
                          </button>
                        )}
                      </div>
                    ),
                    variant: 'destructive',
                  });
                  return;
                }
                toast({ title: 'Kunde inte skapa elev', description: body.message ?? 'Försök igen', variant: 'destructive' });
                return;
              } catch {
                // response body wasn't JSON — fall through to generic message
              }
            }
            const msg = e instanceof Error ? e.message : 'Försök igen';
            toast({ title: 'Kunde inte skapa elev', description: msg, variant: 'destructive' });
          })();
        },
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1100px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="text-muted-foreground">+</span>
            {isEdit ? 'Redigera elev' : 'Skapa en ny elev'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            {/* Two-column body */}
            <div className="grid grid-cols-[380px_1fr] max-h-[75vh] overflow-hidden">

              {/* ── Left column ──────────────────────────────────────────── */}
              <div className="border-r border-border p-5 space-y-5 overflow-y-auto">

                {/* Körkortstillstånd */}
                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="permit_group"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Körkortstillstånd</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ''}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="- Välj grupp -" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {PERMIT_GROUP_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="permit_expiry_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Slutdatum för körkortstillstånd</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Elevklass & Lärare */}
                <div className="space-y-3">
                  <SectionHeader>Elevklass &amp; Lärare</SectionHeader>
                  <FormField
                    control={form.control}
                    name="target_licence_category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Behörighet</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ''}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Välj behörighet" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {BEHÖRIGHET_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="assigned_instructor_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lärare</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ''}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="- Välj lärare -" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {instructors.map((i) => (
                              <SelectItem key={i.id} value={i.id}>
                                {i.first_name} {i.last_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Kommentera & notera */}
                <div className="space-y-3">
                  <SectionHeader>Kommentera &amp; notera</SectionHeader>
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea
                            placeholder="Skriv en kommentar..."
                            className="min-h-[90px] resize-y"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="anteckning"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Anteckning</FormLabel>
                        <FormControl>
                          <Input placeholder="" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Företag & Ekonomi (collapsible) */}
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setCompanyOpen((v) => !v)}
                    className="flex items-center gap-2 text-sm font-semibold text-foreground w-full text-left"
                  >
                    Företag &amp; Ekonomi
                    {companyOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {companyOpen && (
                    <div className="space-y-3">
                      <FormField
                        control={form.control}
                        name="company_connection"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Anslut till företag</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ''}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="- Inget företag -" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="">- Inget företag -</SelectItem>
                                {companies.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.company_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="company_reference"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Studentreferens på företagsfaktura</FormLabel>
                            <FormControl>
                              <Input placeholder="Elev:" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="credit_limit"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Studentkreditgräns</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="0" {...field} />
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
                              <Textarea className="min-h-[80px] resize-y" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* ── Right column ─────────────────────────────────────────── */}
              <div className="p-5 space-y-4 overflow-y-auto">
                <SectionHeader>Elevens uppgifter</SectionHeader>

                {/* Mobilnummer + Saknas */}
                <div className="space-y-1.5">
                  <FormLabel>Mobilnummer</FormLabel>
                  <div className="flex items-center gap-2">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem className="flex-1 space-y-0">
                          <FormControl>
                            <Input
                              type="tel"
                              placeholder="070-123 45 67"
                              disabled={form.watch('phone_missing')}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone_missing"
                      render={({ field }) => (
                        <label className="flex items-center gap-1.5 cursor-pointer text-sm whitespace-nowrap shrink-0">
                          <input
                            type="checkbox"
                            checked={field.value ?? false}
                            onChange={(e) => {
                              field.onChange(e.target.checked);
                              if (e.target.checked) form.setValue('phone', '');
                            }}
                            className="h-4 w-4 rounded border border-input cursor-pointer accent-primary"
                          />
                          Saknas
                        </label>
                      )}
                    />
                  </div>
                </div>

                {/* E-postadress */}
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-postadress</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="anna@exempel.se" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Förnamn */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Förnamn *</FormLabel>
                        <FormControl>
                          <Input placeholder="Anna" {...field} />
                        </FormControl>
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
                        <FormControl>
                          <Input placeholder="Andersson" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Personnummer — only gated when editing an existing student's already-
                    stored PII; entering a new student's personnummer at creation is not
                    a "view" of existing PII and must not be blocked. */}
                <PermissionGate {...(isEdit ? { permission: Permissions.STUDENTS_PII_READ } : {})}>
                <div className="space-y-1.5">
                  <FormLabel>Personnummer</FormLabel>
                  <div className="flex items-center gap-2">
                    <FormField
                      control={form.control}
                      name="personnummer"
                      render={({ field }) => (
                        <FormItem className="flex-1 space-y-0">
                          <FormControl>
                            <Input placeholder="YYYYMMDD-XXXX" maxLength={13} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-xs whitespace-nowrap gap-1.5"
                      onClick={handlePersonLookup}
                      disabled={personLookup.isPending}
                    >
                      {personLookup.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                      Hämta personuppgifter
                    </Button>
                  </div>
                </div>
                </PermissionGate>

                {/* Adress */}
                <FormField
                  control={form.control}
                  name="address_line1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Adress</FormLabel>
                      <FormControl>
                        <Input placeholder="Storgatan 1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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

                {/* Person Lookup Framework info */}
                <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground">
                  För att kunna hämta personuppgifter automatiskt ska korrekt personnummer fyllas i.
                </div>

                {/* Flera val */}
                <div className="space-y-2.5">
                  <SectionHeader>Flera val</SectionHeader>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField
                      control={form.control}
                      name="communication_opt_in_sms"
                      render={({ field }) => (
                        <CheckboxField
                          label="Ta emot SMS-påminnelse"
                          checked={field.value ?? true}
                          onChange={field.onChange}
                        />
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="has_debt_collection"
                      render={({ field }) => (
                        <CheckboxField
                          label="Har inkassoärende"
                          checked={field.value ?? false}
                          onChange={field.onChange}
                        />
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="prevent_cancellation"
                      render={({ field }) => (
                        <CheckboxField
                          label="Förhindra avbokning"
                          checked={field.value ?? false}
                          onChange={field.onChange}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Footer ───────────────────────────────────────────────────── */}
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Avbryt
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? (isEdit ? 'Sparar...' : 'Skapar...')
                  : (isEdit ? 'Spara ändringar' : 'Skapa')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
