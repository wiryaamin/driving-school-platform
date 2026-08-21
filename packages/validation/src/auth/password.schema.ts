import { z } from 'zod';

// Matches the policy already promised in packages/i18n auth.json
// (reset_password.error.too_weak / en+sv): min 8 characters, at least one
// letter and one number. Keep this in sync with that copy if either changes.
export const PasswordPolicySchema = z
  .string()
  .min(8, 'too_short')
  .max(72, 'too_long') // bcrypt's practical input ceiling — matches Supabase Auth's own limit
  .regex(/[A-Za-z]/, 'missing_letter')
  .regex(/[0-9]/, 'missing_number');

export const RequestPasswordResetSchema = z.object({
  email: z.string().trim().email(),
});
export type RequestPasswordResetDto = z.infer<typeof RequestPasswordResetSchema>;

export const ConfirmPasswordResetSchema = z
  .object({
    password: PasswordPolicySchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'passwords_dont_match',
    path: ['confirmPassword'],
  });
export type ConfirmPasswordResetDto = z.infer<typeof ConfirmPasswordResetSchema>;

const INVITABLE_ROLES = [
  'org_admin', 'org_manager', 'instructor', 'instructor_senior',
  'receptionist', 'finance_admin', 'student_admin', 'reporting_viewer',
  'corporate_contact',
] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

// Befattning / professional role — deliberately separate from InvitableRole
// (system access / RBAC). 'trafiklarare' is intentionally absent: that
// professional role is represented by an public.instructors record, created
// via the existing InstructorForm flow, not through this invite path.
const PERSONNEL_JOB_TITLES = [
  'trafikskolechef', 'utbildningsledare', 'trafiklararpraktikant',
  'receptionist', 'administrativ_personal', 'ekonomipersonal', 'ovrig_personal',
] as const;
export type PersonnelJobTitle = (typeof PERSONNEL_JOB_TITLES)[number];

const EMPLOYMENT_TYPES = ['employed', 'contractor', 'external', 'on_leave', 'inactive'] as const;
export type PersonnelEmploymentType = (typeof EMPLOYMENT_TYPES)[number];

// Subset of public.personal_identity_type that this form actually collects —
// 'passport'/'national_id'/'none' aren't offered here since the form only
// ever sends identity_type alongside an actual personnummer-shaped value.
const PERSONNEL_IDENTITY_TYPES = ['personnummer', 'samordningsnummer'] as const;
export type PersonnelIdentityType = (typeof PERSONNEL_IDENTITY_TYPES)[number];

export const InviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  role: z.enum(INVITABLE_ROLES),

  // ── Common personnel record (all optional — see AddPersonnelDialog.tsx
  // for which fields the UI actually collects per Befattning) ──────────────
  job_title: z.enum(PERSONNEL_JOB_TITLES).optional(),
  mobile_phone: z.string().trim().max(30).optional(),
  personnummer: z.string().trim().regex(/^\d{8}-?\d{4}$/, 'Format: YYYYMMDD-XXXX').optional(),
  identity_type: z.enum(PERSONNEL_IDENTITY_TYPES).optional(), // defaults server-side to 'personnummer' when personnummer is provided without this
  employment_type: z.enum(EMPLOYMENT_TYPES).optional(),
  employment_number: z.string().trim().max(50).optional(),
  employment_started_at: z.string().optional(),
  employment_ended_at: z.string().optional(), // absent = "Tills vidare" (ongoing)
  work_location_id: z.string().uuid().optional(),
  address_line1: z.string().trim().max(200).optional(),
  postal_code: z.string().trim().max(20).optional(),
  city: z.string().trim().max(100).optional(),
});
export type InviteUserDto = z.infer<typeof InviteUserSchema>;

export { INVITABLE_ROLES, PERSONNEL_JOB_TITLES, PERSONNEL_IDENTITY_TYPES };
