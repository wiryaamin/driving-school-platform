import { z } from 'zod';

/**
 * Demo Request form schema — Release 2.0 Epic 1.
 *
 * Numeric-looking fields (locationCount, studentCount) are kept as
 * validated strings here, not `z.coerce.number()`, matching the established
 * pattern in apps/web/src/modules/instructors/components/InstructorForm.tsx
 * (`max_lessons_per_day: z.string().optional()`, parsed downstream). This
 * keeps every field's runtime type a plain string, which is what native
 * `<input>` elements actually produce, avoiding type friction between
 * react-hook-form's `Controller` and this project's strict TypeScript
 * config (`exactOptionalPropertyTypes`). Conversion to real numbers happens
 * once, in `toDemoRequestPayload` (submitDemoRequest.ts), not here.
 */
export const CURRENT_SYSTEM_OPTIONS = [
  { value: 'spreadsheets', label: 'Kalkylblad' },
  { value: 'other_software', label: 'En annan mjukvaruplattform' },
  { value: 'manual', label: 'Mestadels manuell administration' },
  { value: 'other', label: 'Annat' },
] as const;

export const demoRequestSchema = z.object({
  name: z.string().trim().min(2, 'Ange ditt namn.').max(100, 'Max 100 tecken.'),
  schoolName: z.string().trim().min(2, 'Ange trafikskolans namn.').max(150, 'Max 150 tecken.'),
  email: z.string().trim().min(1, 'Ange en e-postadress.').email('Ange en giltig e-postadress.').max(200),
  phone: z.string().trim().min(6, 'Ange ett telefonnummer.').max(30, 'Max 30 tecken.'),
  municipality: z.string().trim().min(2, 'Ange kommun eller ort.').max(100, 'Max 100 tecken.'),
  locationCount: z
    .string()
    .trim()
    .min(1, 'Ange antal orter.')
    .regex(/^\d+$/, 'Ange ett heltal.')
    .refine((v) => Number(v) >= 1, 'Ange minst 1.'),
  studentCount: z
    .string()
    .trim()
    .min(1, 'Ange ett ungefärligt antal.')
    .regex(/^\d+$/, 'Ange ett heltal.'),
  currentSystem: z.string().min(1, 'Välj ett alternativ.'),
  message: z.string().trim().max(1000, 'Max 1000 tecken.'),
});

export type DemoRequestFormFields = z.infer<typeof demoRequestSchema>;

export const DEMO_REQUEST_DEFAULTS: DemoRequestFormFields = {
  name: '',
  schoolName: '',
  email: '',
  phone: '',
  municipality: '',
  locationCount: '',
  studentCount: '',
  currentSystem: '',
  message: '',
};
