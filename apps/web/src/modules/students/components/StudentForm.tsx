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
  toast,
} from '@platform/ui';
import { useCreateStudent, useUpdateStudent } from '../hooks/useStudents.js';
import { STUDENT_STATUS_OPTIONS } from './StudentStatusBadge.js';
import type { Student, CreateStudentFormValues } from '../hooks/useStudents.js';

// ─── Form schema (UI-layer validation) ───────────────────────────────────────

const LICENCE_CATEGORIES = ['B', 'A', 'A1', 'A2', 'AM', 'B96', 'BE', 'C', 'C1', 'CE', 'D'] as const;

const studentFormSchema = z.object({
  first_name:              z.string().min(1, 'Förnamn krävs').max(100),
  last_name:               z.string().min(1, 'Efternamn krävs').max(100),
  email:                   z.string().max(200).optional(),
  phone:                   z.string().max(30).optional(),
  address_line1:           z.string().max(200).optional(),
  postal_code:             z.string().max(20).optional(),
  city:                    z.string().max(100).optional(),
  status:                  z.enum(['lead', 'onboarding', 'active', 'paused', 'completed', 'withdrawn', 'archived'] as const).optional(),
  target_licence_category: z.string().max(10).optional(),
  data_processing_consent: z.boolean().optional(),
});

type StudentFormValues = z.infer<typeof studentFormSchema>;

// ─── Default values ───────────────────────────────────────────────────────────

const EMPTY_DEFAULTS: StudentFormValues = {
  first_name:              '',
  last_name:               '',
  email:                   '',
  phone:                   '',
  address_line1:           '',
  postal_code:             '',
  city:                    '',
  status:                  undefined,
  target_licence_category: '',
  data_processing_consent: false,
};

function studentToFormValues(s: Student): StudentFormValues {
  return {
    first_name:              s.first_name,
    last_name:               s.last_name,
    email:                   s.email ?? '',
    phone:                   s.phone ?? '',
    address_line1:           s.address_line1 ?? '',
    postal_code:             s.postal_code ?? '',
    city:                    s.city ?? '',
    status:                  s.status,
    target_licence_category: s.target_licence_category ?? '',
    data_processing_consent: s.data_processing_consent,
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface StudentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the form is in edit mode */
  student?: Student | null;
  onSuccess?: (student: Student) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StudentForm({ open, onOpenChange, student, onSuccess }: StudentFormProps) {
  const isEdit = student != null;

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  const createMutation = useCreateStudent();
  const updateMutation = useUpdateStudent();
  const isPending = createMutation.isPending || updateMutation.isPending;

  // Sync form when student changes (edit mode) or sheet opens/closes
  useEffect(() => {
    if (open) {
      form.reset(isEdit ? studentToFormValues(student) : EMPTY_DEFAULTS);
    }
  }, [open, student, isEdit, form]);

  function onSubmit(values: StudentFormValues) {
    // Strip empty/undefined values before sending to API.
    // Double-cast via unknown: Zod-inferred types include `undefined` for optional
    // fields, but we've filtered them out so the runtime object is fully compatible.
    const clean = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== undefined && v !== '')
    ) as unknown as CreateStudentFormValues;

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
          const msg = e instanceof Error ? e.message : 'Försök igen';
          toast({ title: 'Kunde inte skapa elev', description: msg, variant: 'destructive' });
        },
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle>{isEdit ? 'Redigera elev' : 'Skapa elev'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Uppdatera elevens uppgifter nedan.'
              : 'Fyll i uppgifterna för att registrera en ny elev.'}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            {/* ── Name ───────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
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

            {/* ── Contact ─────────────────────────────────────────────────── */}
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
                    <FormLabel>E-post</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="anna@exempel.se" {...field} />
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

            {/* ── Address ─────────────────────────────────────────────────── */}
            <Separator />
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Adress
              </p>
              <FormField
                control={form.control}
                name="address_line1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gatuadress</FormLabel>
                    <FormControl>
                      <Input placeholder="Storgatan 1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
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
                      <FormLabel>Ort</FormLabel>
                      <FormControl>
                        <Input placeholder="Stockholm" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* ── Education ───────────────────────────────────────────────── */}
            <Separator />
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Utbildning
              </p>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Välj status..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {STUDENT_STATUS_OPTIONS.map((opt) => (
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
                  name="target_licence_category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Behörighet</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Välj behörighet..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LICENCE_CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* ── Submit ──────────────────────────────────────────────────── */}
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
                  : (isEdit ? 'Spara ändringar' : 'Skapa elev')}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
