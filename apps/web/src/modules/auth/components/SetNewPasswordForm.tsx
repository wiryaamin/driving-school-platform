import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from '@platform/i18n';
import { ConfirmPasswordResetSchema, type ConfirmPasswordResetDto } from '@platform/validation';
import { supabase } from '@core/api/supabase.js';
import { logger } from '@platform/utils';
import { cn } from '@/lib/utils.js';

interface SetNewPasswordFormProps {
  /** Selects which i18n copy block ('reset_password' vs 'invite') and post-submit behavior. */
  mode: 'recovery' | 'invite';
  onSuccess: () => void | Promise<void>;
  /**
   * The account's own verified email, read-only display only (Starta
   * provperiod — direct registration + email verification + password
   * activation, 2026-08-30) — sourced from the real Supabase session the
   * caller already established from the recovery/invite link, so it can
   * never drift from the token's actual account identity. Optional: a
   * caller that hasn't fetched it yet (or can't) simply omits the field
   * rather than showing a wrong or empty one.
   */
  email?: string | null;
}

/**
 * The shared "choose a password" step for both the password-recovery and
 * invitation-acceptance flows. By the time this renders, the caller has
 * already exchanged the email link for a real (recovery-scoped) Supabase
 * session — this form's only job is collecting and applying the new password.
 */
export function SetNewPasswordForm({ mode, onSuccess, email }: SetNewPasswordFormProps) {
  const { t } = useTranslation('auth');
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const copy = mode === 'recovery' ? 'reset_password' : 'invite';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConfirmPasswordResetDto>({
    resolver: zodResolver(ConfirmPasswordResetSchema),
    // Default (onSubmit) only validates after a submit attempt, so a
    // mismatched confirm-password field gave no feedback at all until then —
    // onBlur shows it as soon as the user leaves the field instead.
    mode: 'onBlur',
  });

  const passwordError = errors.password?.message === 'too_short' || errors.password?.message === 'missing_letter' || errors.password?.message === 'missing_number' || errors.password?.message === 'too_long'
    ? t(`${copy}.error.too_weak`)
    : undefined;
  // Generic form-validation copy, not flow-specific — always sourced from
  // reset_password's block regardless of mode (invite doesn't duplicate it).
  const confirmError = errors.confirmPassword?.message === 'passwords_dont_match'
    ? t('reset_password.error.passwords_dont_match')
    : undefined;

  const onSubmit = async (values: ConfirmPasswordResetDto) => {
    setServerError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) {
        logger.warn('SetNewPasswordForm: updateUser failed', { error: error.message, code: error.code });
        const key = error.code === 'same_password'
          ? 'same_password'
          : error.code === 'weak_password'
            ? 'too_weak'
            : 'generic';
        setServerError(t(`${copy}.error.${key}`));
        return;
      }

      // Activation means "password successfully created", not merely
      // "opened the invite link" — flips a pending membership (new invite,
      // resent invite, or an abandoned activation resumed later) to active.
      // Safe no-op for an ordinary password reset by an already-active
      // member: activate_membership() only acts on a pending membership.
      const { error: activateError } = await supabase.rpc('activate_membership');
      if (activateError) {
        logger.warn('SetNewPasswordForm: activate_membership failed', { error: activateError.message });
      }

      await onSuccess();
    } catch (err) {
      logger.error('SetNewPasswordForm: unexpected error', err);
      setServerError(t('login.error.generic'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {serverError && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive">{serverError}</p>
        </div>
      )}

      {email && (
        <div className="space-y-1.5">
          <label htmlFor="account_email" className="text-sm font-medium text-foreground">{t('reset_password.account_email_label')}</label>
          <input
            id="account_email"
            type="email"
            value={email}
            readOnly
            disabled
            aria-readonly="true"
            className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-muted text-muted-foreground cursor-not-allowed"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="new_password" className="text-sm font-medium text-foreground">{t(`${copy}.new_password_label`)}</label>
        <div className="relative">
          <input
            {...register('password')}
            id="new_password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            autoFocus
            aria-describedby={passwordError ? 'new_password_error' : 'new_password_hint'}
            className={cn(
              'w-full px-3 py-2 pr-10 text-sm rounded-lg border bg-background',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
              'transition-colors',
              passwordError ? 'border-destructive focus:ring-destructive' : 'border-input'
            )}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={t(showPassword ? 'reset_password.hide_password' : 'reset_password.show_password')}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary rounded-r-lg"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {passwordError
          ? <p id="new_password_error" className="text-xs text-destructive" role="alert">{passwordError}</p>
          : <p id="new_password_hint" className="text-xs text-muted-foreground">{t(`${copy}.password_hint`)}</p>}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm_password" className="text-sm font-medium text-foreground">{t(`${copy}.confirm_password_label`)}</label>
        <div className="relative">
          <input
            {...register('confirmPassword')}
            id="confirm_password"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            aria-describedby={confirmError ? 'confirm_password_error' : undefined}
            className={cn(
              'w-full px-3 py-2 pr-10 text-sm rounded-lg border bg-background',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
              'transition-colors',
              confirmError ? 'border-destructive focus:ring-destructive' : 'border-input'
            )}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            aria-label={t(showConfirm ? 'reset_password.hide_password' : 'reset_password.show_password')}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary rounded-r-lg"
          >
            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {confirmError && <p id="confirm_password_error" className="text-xs text-destructive" role="alert">{confirmError}</p>}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className={cn(
          'w-full py-2.5 px-4 rounded-lg text-sm font-medium',
          'bg-primary text-primary-foreground',
          'hover:bg-primary/90 active:scale-[0.99]',
          'transition-all disabled:opacity-60 disabled:cursor-not-allowed',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
        )}
      >
        {isSubmitting ? t(`${copy}.submitting`) : t(`${copy}.submit`)}
      </button>
    </form>
  );
}
