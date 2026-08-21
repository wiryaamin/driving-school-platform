import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
  Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Button,
  Separator,
  toast,
} from '@platform/ui';
import { useCreateInstructor, useUpdateInstructor, useCreateAvailabilityRulesBatch } from '../hooks/useInstructors.js';
import { INSTRUCTOR_STATUS_OPTIONS } from './InstructorStatusBadge.js';
import { useSession } from '@shared/hooks/useSession.js';
import { logger } from '@platform/utils';
import type { Instructor, CreateInstructorFormValues } from '../hooks/useInstructors.js';
import type { CreateAvailabilityRuleInput } from '@platform/types';

// ─── Teaching category options (full Baseline list) ───────────────────────────

const TEACHING_CATEGORIES: { key: string; label: string }[] = [
  { key: 'B',       label: 'B – Personbil' },
  { key: 'A',       label: 'A – Motorcykel' },
  { key: 'A1',      label: 'A1 – Lätt motorcykel' },
  { key: 'A2',      label: 'A2 – Mellankategori motorcykel' },
  { key: 'AM',      label: 'AM – Moped' },
  { key: 'B96',     label: 'B96 – Personbil med lätt släp' },
  { key: 'BE',      label: 'BE – Personbil med tungt släp' },
  { key: 'C',       label: 'C – Tung lastbil' },
  { key: 'C1',      label: 'C1 – Medeltung lastbil' },
  { key: 'CE',      label: 'CE – Tung lastbil med tungt släp' },
  { key: 'D',       label: 'D – Buss' },
  { key: 'DE',      label: 'DE – Buss med tungt släp' },
  { key: 'Traktor', label: 'Traktor' },
  { key: 'YKB-C',   label: 'YKB-C – Yrkeskompetensbevis godstransport' },
  { key: 'YKB-D',   label: 'YKB-D – Yrkeskompetensbevis persontransport' },
];

// ─── Form schema ──────────────────────────────────────────────────────────────

const instructorFormSchema = z.object({
  first_name:            z.string().min(1, 'Förnamn krävs').max(100),
  last_name:             z.string().min(1, 'Efternamn krävs').max(100),
  email:                 z.string().email('Ogiltig e-postadress').max(200),
  phone:                 z.string().max(30).optional(),
  personnummer:          z.string().regex(/^(\d{8}-?\d{4})?$/, 'Format: YYYYMMDD-XXXX').optional(),
  employment_type:       z.enum(['employed', 'contractor', 'external', 'on_leave', 'inactive'] as const).optional(),
  employment_started_at: z.string().optional(),
  employment_ended_at:   z.string().optional(),
  adi_number:            z.string().max(50).optional(),
  adi_valid_until:       z.string().optional(),
  employee_number:       z.string().max(50).optional(),
  max_lessons_per_day:   z.string().optional(),
});

type InstructorFormFields = z.infer<typeof instructorFormSchema>;

// ─── Defaults ─────────────────────────────────────────────────────────────────

const EMPTY_DEFAULTS: InstructorFormFields = {
  first_name:            '',
  last_name:             '',
  email:                 '',
  phone:                 '',
  personnummer:          '',
  employment_type:       undefined,
  employment_started_at: '',
  employment_ended_at:   '',
  adi_number:            '',
  adi_valid_until:       '',
  employee_number:       '',
  max_lessons_per_day:   '',
};

function instructorToFormFields(i: Instructor): InstructorFormFields {
  return {
    first_name:            i.first_name,
    last_name:             i.last_name,
    email:                 i.email,
    phone:                 i.phone ?? '',
    personnummer:          '', // never re-populated from the encrypted/hashed value; leave blank to keep unchanged
    employment_type:       i.employment_type,
    employment_started_at: i.employment_started_at ?? '',
    employment_ended_at:   i.employment_ended_at ?? '',
    adi_number:            i.adi_number ?? '',
    adi_valid_until:       i.adi_valid_until ?? '',
    employee_number:       i.employee_number ?? '',
    max_lessons_per_day:   i.max_lessons_per_day != null ? String(i.max_lessons_per_day) : '',
  };
}

function fieldsToInput(fields: InstructorFormFields, categories: string[]): CreateInstructorFormValues {
  const result: CreateInstructorFormValues = {
    first_name: fields.first_name,
    last_name:  fields.last_name,
    email:      fields.email,
  };

  if (fields.phone)                  result.phone                  = fields.phone;
  if (fields.personnummer)           result.personnummer           = fields.personnummer;
  if (fields.employment_type)        result.employment_type        = fields.employment_type;
  if (fields.employment_started_at)  result.employment_started_at  = fields.employment_started_at;
  if (fields.employment_ended_at)    result.employment_ended_at    = fields.employment_ended_at;
  if (categories.length > 0)         result.teaching_categories    = categories;
  if (fields.adi_number)             result.adi_number             = fields.adi_number;
  if (fields.adi_valid_until)        result.adi_valid_until        = fields.adi_valid_until;
  if (fields.employee_number)        result.employee_number        = fields.employee_number;
  if (fields.max_lessons_per_day) {
    const n = parseInt(fields.max_lessons_per_day, 10);
    if (!isNaN(n) && n > 0) result.max_lessons_per_day = n;
  }

  return result;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface InstructorFormProps {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  instructor?:  Instructor | null;
  onSuccess?:   (instructor: Instructor) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

// Mon-Fri in the DB's day_of_week encoding (0=Sunday…6=Saturday, per
// generate_slots_for_rule's EXTRACT(DOW) comment) — matches the
// e2e-bootstrap fixture convention already used elsewhere in this codebase.
const WORKING_DAYS = [
  { value: 1, label: 'Mån' },
  { value: 2, label: 'Tis' },
  { value: 3, label: 'Ons' },
  { value: 4, label: 'Tor' },
  { value: 5, label: 'Fre' },
] as const;

// duration + buffer = 60 → generated slots land exactly on the hour
// (08:00-08:45, 09:00-09:45, ...) — see generate_slots_for_rule's v_slot_step.
const WORKING_HOURS_SLOT_DURATION_MIN = 45;
const WORKING_HOURS_SLOT_BUFFER_MIN   = 15;

export function InstructorForm({ open, onOpenChange, instructor, onSuccess }: InstructorFormProps) {
  const isEdit = instructor != null;
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  // Arbetstider — instructor-creation-time only (not shown/used on edit).
  // Left blank/unchanged, instructor creation works exactly as before.
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [workStart,   setWorkStart]   = useState('08:00');
  const [workEnd,     setWorkEnd]     = useState('17:00');

  // AuthUser.organization_id comes straight from the JWT (synchronous, always
  // available once authenticated) — unlike useSession().organization, which is
  // populated by an async background fetch and can stay null for the whole
  // session if that fetch fails. See packages/types/src/auth.types.ts.
  const { user } = useSession();

  const form = useForm<InstructorFormFields>({
    resolver:      zodResolver(instructorFormSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  const createMutation = useCreateInstructor();
  const updateMutation = useUpdateInstructor();
  const createRulesBatch = useCreateAvailabilityRulesBatch();
  const isPending = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (open) {
      form.reset(isEdit ? instructorToFormFields(instructor) : EMPTY_DEFAULTS);
      setSelectedCategories(isEdit ? (instructor?.teaching_categories ?? []) : []);
      setWorkingDays([1, 2, 3, 4, 5]);
      setWorkStart('08:00');
      setWorkEnd('17:00');
    }
  }, [open, instructor, isEdit, form]);

  function toggleCategory(key: string) {
    setSelectedCategories((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function toggleWorkingDay(day: number) {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  // Best-effort: instructor creation has already succeeded and the dialog is
  // about to close by the time this runs — a failure here must not read as
  // "the instructor wasn't saved". Logged and surfaced as a secondary toast.
  function seedWorkingHours(instructorId: string) {
    if (workingDays.length === 0 || !user?.organization_id) return;
    const inputs: CreateAvailabilityRuleInput[] = workingDays.map((day_of_week) => ({
      day_of_week,
      start_time:            workStart,
      end_time:               workEnd,
      slot_duration_minutes: WORKING_HOURS_SLOT_DURATION_MIN,
      slot_buffer_minutes:   WORKING_HOURS_SLOT_BUFFER_MIN,
    }));
    createRulesBatch.mutate(
      { instructorId, organizationId: user.organization_id, inputs },
      {
        onError: (e) => {
          logger.warn('InstructorForm: failed to seed working-hours availability rules', {
            instructorId, error: e instanceof Error ? e.message : String(e),
          });
          toast({
            title: 'Arbetstiderna kunde inte sparas automatiskt',
            description: 'Läraren skapades, men lägg till arbetstiderna manuellt under lärarens Tillgänglighet.',
            variant: 'destructive',
          });
        },
      },
    );
  }

  function onSubmit(fields: InstructorFormFields) {
    const input = fieldsToInput(fields, selectedCategories);

    if (isEdit) {
      updateMutation.mutate(
        { id: instructor.id, input },
        {
          onSuccess: (updated) => {
            toast({ title: 'Läraren uppdaterad' });
            onSuccess?.(updated);
            onOpenChange(false);
          },
          onError: (e) => toast({
            title: 'Kunde inte spara ändringarna',
            description: e instanceof Error ? e.message : undefined,
            variant: 'destructive',
          }),
        }
      );
    } else {
      createMutation.mutate(input, {
        onSuccess: (created) => {
          toast({ title: 'Läraren skapad' });
          seedWorkingHours(created.id);
          onSuccess?.(created);
          onOpenChange(false);
        },
        onError: (e) => toast({
          title: 'Kunde inte skapa läraren',
          description: e instanceof Error ? e.message : undefined,
          variant: 'destructive',
        }),
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <DialogTitle>{isEdit ? 'Redigera lärare' : 'Skapa lärare'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Uppdatera lärarens uppgifter nedan.'
              : 'Fyll i uppgifterna för att registrera en ny lärare.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            {/* ── Namn ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Förnamn *</FormLabel>
                    <FormControl>
                      <Input placeholder="Erik" {...field} />
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
                      <Input placeholder="Lindqvist" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ── Kontaktuppgifter ─────────────────────────────────────── */}
            <Separator />
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Kontaktuppgifter
              </p>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-post *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="erik@korskola.se" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefon</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="070-123 45 67" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="personnummer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Personnummer</FormLabel>
                    <FormControl>
                      <Input placeholder="ÅÅÅÅMMDD-XXXX" {...field} />
                    </FormControl>
                    {isEdit && (
                      <p className="text-xs text-muted-foreground">
                        Lämna tomt för att behålla nuvarande personnummer.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ── Anställning ──────────────────────────────────────────── */}
            <Separator />
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Anställning
              </p>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="employment_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Anställningstyp</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Välj typ..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {INSTRUCTOR_STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
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
                  name="employee_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Anställningsnummer</FormLabel>
                      <FormControl>
                        <Input placeholder="EMP-001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="employment_started_at"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Startdatum</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="employment_ended_at"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Slutdatum</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="max_lessons_per_day"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max lektioner per dag</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" max="20" placeholder="8" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ── Arbetstider (endast vid skapande) ────────────────────── */}
            {!isEdit && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Arbetstider
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Skapar automatiskt återkommande 45-minuters tillgänglighet för valda dagar.
                      Lämna tomt för att hoppa över — kan läggas till senare under lärarens Tillgänglighet.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {WORKING_DAYS.map(({ value, label }) => (
                      <label key={value} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={workingDays.includes(value)}
                          onChange={() => toggleWorkingDay(value)}
                          className="w-4 h-4 accent-blue-500 shrink-0"
                        />
                        <span className="text-sm text-foreground">{label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Från</label>
                      <Input
                        type="time"
                        value={workStart}
                        onChange={(e) => setWorkStart(e.target.value)}
                        disabled={workingDays.length === 0}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Till</label>
                      <Input
                        type="time"
                        value={workEnd}
                        onChange={(e) => setWorkEnd(e.target.value)}
                        disabled={workingDays.length === 0}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Behörigheter ─────────────────────────────────────────── */}
            <Separator />
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Behörigheter & certifikat
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Godkänd trafiklärare — att läraren finns registrerad här innebär att skolan har godkänt personen som trafiklärare.
                </p>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Körkortsbehörigheter</p>
                <p className="text-xs text-muted-foreground mb-2">Vilka körkortsbehörigheter läraren är godkänd att undervisa på.</p>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                  {TEACHING_CATEGORIES.map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(key)}
                        onChange={() => toggleCategory(key)}
                        className="w-4 h-4 accent-blue-500 shrink-0"
                      />
                      <span className="text-sm text-foreground">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Godkännande/certifiering — internt referens-/certifikatnummer.
                  Not labeled as an official Transportstyrelsen-issued number:
                  Transportstyrelsen's actual process ("godkännande som
                  trafiklärare") was not confirmed to issue a numbered
                  credential of this shape, so these fields (DB columns
                  adi_number/adi_valid_until, unchanged for compatibility)
                  are presented as an optional internal record, not an
                  official identifier. */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="adi_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Godkännande-/certifikatnummer</FormLabel>
                      <FormControl>
                        <Input placeholder="Valfritt internt referensnummer" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="adi_valid_until"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Giltigt till</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* ── Submit ──────────────────────────────────────────────── */}
            <div className="flex justify-end gap-3 pt-2">
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
                  : (isEdit ? 'Spara ändringar' : 'Skapa lärare')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
