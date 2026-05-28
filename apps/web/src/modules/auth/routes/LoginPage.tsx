import { useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from '@platform/i18n';
import { useAuth } from '@core/auth/hooks.js';
import { cn } from '@/lib/utils.js';

// ─── Validation Schema ────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().min(1, 'E-postadressen är obligatorisk').email('Ange en giltig e-postadress'),
  password: z.string().min(1, 'Lösenordet är obligatoriskt'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// ─── Component ────────────────────────────────────────────────────────────────

export function LoginPage() {
  const { t } = useTranslation('auth');
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/dashboard';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    const result = await signIn(values);
    if (result.success) {
      navigate(from, { replace: true });
    } else {
      setServerError(result.error ?? t('login.error.generic'));
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-foreground">
          {t('login.title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('login.subtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {/* Server error */}
        {serverError && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">{serverError}</p>
          </div>
        )}

        {/* Email */}
        <FormField
          label={t('login.email_label')}
          error={errors.email?.message}
        >
          <input
            {...register('email')}
            type="email"
            placeholder={t('login.email_placeholder')}
            autoComplete="email"
            autoFocus
            className={cn(
              'w-full px-3 py-2 text-sm rounded-lg border bg-background',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
              'transition-colors',
              errors.email
                ? 'border-destructive focus:ring-destructive'
                : 'border-input'
            )}
          />
        </FormField>

        {/* Password */}
        <FormField
          label={t('login.password_label')}
          error={errors.password?.message}
        >
          <input
            {...register('password')}
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            className={cn(
              'w-full px-3 py-2 text-sm rounded-lg border bg-background',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
              'transition-colors',
              errors.password
                ? 'border-destructive focus:ring-destructive'
                : 'border-input'
            )}
          />
        </FormField>

        {/* Forgot password */}
        <div className="flex justify-end">
          <button type="button" className="text-xs text-primary hover:text-primary/80 transition-colors">
            {t('login.forgot_password')}
          </button>
        </div>

        {/* Submit */}
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
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t('login.submitting')}
            </span>
          ) : t('login.submit')}
        </button>
      </form>
    </div>
  );
}

// ─── FormField Helper ─────────────────────────────────────────────────────────

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
