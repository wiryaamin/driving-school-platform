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

export const InviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  role: z.enum(INVITABLE_ROLES),
});
export type InviteUserDto = z.infer<typeof InviteUserSchema>;

export { INVITABLE_ROLES };
