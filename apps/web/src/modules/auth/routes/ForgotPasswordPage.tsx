import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from '@platform/i18n';
import { RequestPasswordResetSchema, type RequestPasswordResetDto } from '@platform/validation';
import { supabase } from '@core/api/supabase.js';
import { logger } from '@platform/utils';
import { cn } from '@/lib/utils.js';

/**
 * Password-recovery request step. Always shows the same success message
 * regardless of whether the address is registered — resetPasswordForEmail()
 * itself never discloses that either, so there is nothing to leak, but the
 * UI stays consistent about it (this exact framing was already pre-written
 * in packages/i18n before this page existed).
 */
export function ForgotPasswordPage() {
  const { t } = useTranslation('auth');
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RequestPasswordResetDto>({
    resolver: zodResolver(RequestPasswordResetSchema),
  });

  const onSubmit = async (values: RequestPasswordResetDto) => {
    setServerError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      // A returned error here is virtually always operational (rate limit,
      // network) — resetPasswordForEmail never confirms/denies whether the
      // address exists, so there is no enumeration concern in branching on it.
      if (error) {
        logger.warn('ForgotPasswordPage: resetPasswordForEmail failed', { error: error.message });
        setServerError(t('login.error.generic'));
        return;
      }
      setSubmitted(true);
    } catch (err) {
      logger.error('ForgotPasswordPage: unexpected error', err);
      setServerError(t('login.error.generic'));
    }
  };

  if (submitted) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-primary" stroke="currentColor" strokeWidth={2}>
            <path d="M4 4h16v16H4z" strokeLinejoin="round" />
            <path d="M4 6l8 6 8-6" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-foreground">{t('forgot_password.success_title')}</h2>
        <p className="text-sm text-muted-foreground">{t('forgot_password.success_message')}</p>
        <Link to="/auth/login" className="inline-block text-sm text-primary hover:text-primary/80 transition-colors">
          {t('forgot_password.back_to_login')}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-foreground">{t('forgot_password.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('forgot_password.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {serverError && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">{serverError}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="forgot_email" className="text-sm font-medium text-foreground">{t('forgot_password.email_label')}</label>
          <input
            {...register('email')}
            id="forgot_email"
            type="email"
            autoComplete="email"
            autoFocus
            className={cn(
              'w-full px-3 py-2 text-sm rounded-lg border bg-background',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
              'transition-colors',
              errors.email ? 'border-destructive focus:ring-destructive' : 'border-input'
            )}
          />
          {errors.email && <p className="text-xs text-destructive" role="alert">{t('login.error.invalid_credentials')}</p>}
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
          {isSubmitting ? t('forgot_password.submitting') : t('forgot_password.submit')}
        </button>

        <Link to="/auth/login" className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors">
          {t('forgot_password.back_to_login')}
        </Link>
      </form>
    </div>
  );
}
