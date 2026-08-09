import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@platform/i18n';
import { cn } from '@/lib/utils.js';

interface AuthLinkErrorProps {
  mode: 'recovery' | 'invite';
  reason: 'expired' | 'invalid';
}

/**
 * Shown when a recovery/invite link's token has expired or failed
 * verification. Recovery links are self-service (the user can request a
 * new one); invitations are admin-initiated, so there is no self-service
 * resend — the copy points the user at their administrator instead.
 */
export function AuthLinkError({ mode, reason }: AuthLinkErrorProps) {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const copy = mode === 'recovery' ? 'reset_password' : 'invite';
  const message = reason === 'expired' ? t(`${copy}.error.link_expired`) : t(`${copy}.error.link_invalid`);

  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-destructive" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm text-foreground">{message}</p>

      {mode === 'recovery' ? (
        <button
          type="button"
          onClick={() => navigate('/auth/forgot-password', { replace: true })}
          className={cn(
            'w-full py-2.5 px-4 rounded-lg text-sm font-medium',
            'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.99]',
            'transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
          )}
        >
          {t('forgot_password.title')}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => navigate('/auth/login', { replace: true })}
          className={cn(
            'w-full py-2.5 px-4 rounded-lg text-sm font-medium',
            'border border-input bg-background text-foreground hover:bg-muted active:scale-[0.99]',
            'transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
          )}
        >
          {t('forgot_password.back_to_login')}
        </button>
      )}
    </div>
  );
}
