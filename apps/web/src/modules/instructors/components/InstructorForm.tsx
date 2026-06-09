import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
  Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Button,
  Separator,
} from '@platform/ui';
import { useCreateInstructor, useUpdateInstructor } from '../hooks/useInstructors.js';
import { INSTRUCTOR_STATUS_OPTIONS } from './InstructorStatusBadge.js';
import type { Instructor, CreateInstructorFormValues } from '../hooks/useInstructors.js';

// ─── Teaching category options ────────────────────────────────────────────────

const TEACHING_CATEGORIES = ['B', 'A', 'A1', 'A2', 'AM', 'B96', 'BE', 'C', 'C1', 'CE', 'D', 'DE', 'Traktor'] as const;

// ─── Form schema ──────────────────────────────────────────────────────────────

const instructorFormSchema = z.object({
  first_name:          z.string().min(1, 'Förnamn krävs').max(100),
  last_name:           z.string().min(1, 'Efternamn krävs').max(100),
  email:               z.string().email('Ogiltig e-postadress').max(200),
  phone:               z.string().max(30).optional(),
  employment_type:     z.enum(['employed', 'contractor', 'external', 'on_leave', 'inactive'] as const).optional(),
  teaching_categories: z.string().max(200).optional(),
  adi_number:          z.string().max(50).optional(),
  adi_valid_until:     z.string().optional(),
  employee_number:     z.string().max(50).optional(),
  max_lessons_per_day: z.string().optional(),
});

type InstructorFormFields = z.infer<typeof instructorFormSchema>;

// ─── Defaults ─────────────────────────────────────────────────────────────────

const EMPTY_DEFAULTS: InstructorFormFields = {
  first_name:          '',
  last_name:           '',
  email:               '',
  phone:               '',
  employment_type:     undefined,
  teaching_categories: '',
  adi_number:          '',
  adi_valid_until:     '',
  employee_number:     '',
  max_lessons_per_day: '',
};

function instructorToFormFields(i: Instructor): InstructorFormFields {
  return {
    first_name:          i.first_name,
    last_name:           i.last_name,
    email:               i.email,
    phone:               i.phone ?? '',
    employment_type:     i.employment_type,
    teaching_categories: i.teaching_categories.join(', '),
    adi_number:          i.adi_number ?? '',
    adi_valid_until:     i.adi_valid_until ?? '',
    employee_number:     i.employee_number ?? '',
    max_lessons_per_day: i.max_lessons_per_day != null ? String(i.max_lessons_per_day) : '',
  };
}

function fieldsToInput(fields: InstructorFormFields): CreateInstructorFormValues {
  const cats = fields.teaching_categories
    ? fields.teaching_categories.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const result: CreateInstructorFormValues = {
    first_name: fields.first_name,
    last_name:  fields.last_name,
    email:      fields.email,
  };

  if (fields.phone)               result.phone               = fields.phone;
  if (fields.employment_type)     result.employment_type     = fields.employment_type;
  if (cats.length > 0)            result.teaching_categories = cats;
  if (fields.adi_number)          result.adi_number          = fields.adi_number;
  if (fields.adi_valid_until)     result.adi_valid_until     = fields.adi_valid_until;
  if (fields.employee_number)     result.employee_number     = fields.employee_number;
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

export function InstructorForm({ open, onOpenChange, instructor, onSuccess }: InstructorFormProps) {
  const isEdit = instructor != null;

  const form = useForm<InstructorFormFields>({
    resolver:      zodResolver(instructorFormSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  const createMutation = useCreateInstructor();
  const updateMutation = useUpdateInstructor();
  const isPending = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (open) {
      form.reset(isEdit ? instructorToFormFields(instructor) : EMPTY_DEFAULTS);
    }
  }, [open, instructor, isEdit, form]);

  function onSubmit(fields: InstructorFormFields) {
    const input = fieldsToInput(fields);

    if (isEdit) {
      updateMutation.mutate(
        { id: instructor.id, input },
        {
          onSuccess: (updated) => {
            onSuccess?.(updated);
            onOpenChange(false);
          },
        }
      );
    } else {
      createMutation.mutate(input, {
        onSuccess: (created) => {
          onSuccess?.(created);
          onOpenChange(false);
        },
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle>{isEdit ? 'Redigera lärare' : 'Skapa lärare'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Uppdatera lärarens uppgifter nedan.'
              : 'Fyll i uppgifterna för att registrera en ny lärare.'}
          </SheetDescription>
        </SheetHeader>

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

            {/* ── Behörigheter ─────────────────────────────────────────── */}
            <Separator />
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Behörigheter & certifikat
              </p>
              <FormField
                control={form.control}
                name="teaching_categories"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Undervisningskategorier</FormLabel>
                    <FormControl>
                      <Input placeholder="B, A, BE (kommaseparerat)" {...field} />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                      Tillgängliga: {TEACHING_CATEGORIES.join(', ')}
                    </p>
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="adi_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ADI-nummer</FormLabel>
                      <FormControl>
                        <Input placeholder="ADI-12345" {...field} />
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
                      <FormLabel>ADI gäller till</FormLabel>
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
      </SheetContent>
    </Sheet>
  );
}
