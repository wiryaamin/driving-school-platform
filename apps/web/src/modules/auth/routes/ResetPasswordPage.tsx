import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@platform/i18n';
import { toast } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { SetNewPasswordForm } from '../components/SetNewPasswordForm.js';
import { AuthLinkError } from '../components/AuthLinkError.js';
import {
  parseAuthCallbackParams, clearAuthCallbackParamsFromUrl, establishCallbackSession,
} from '../lib/authCallback.js';

type PageState = 'verifying' | 'ready' | { error: 'expired' | 'invalid' };

/**
 * Password-recovery callback: consumes the token from the email link,
 * establishes the recovery session, then hands off to SetNewPasswordForm.
 * On success, deliberately signs the recovery session back out and returns
 * to /auth/login — matches the pre-written copy ("you can now sign in"),
 * so the user re-authenticates with their new password rather than being
 * silently carried into the dashboard on a recovery-scoped session.
 */
export function ResetPasswordPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const [state, setState] = useState<PageState>('verifying');
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

    const params = parseAuthCallbackParams();
    clearAuthCallbackParamsFromUrl();

    if (params.type && params.type !== 'recovery') {
      setState({ error: 'invalid' });
      return;
    }

    void (async () => {
      // Same defensive discard as AcceptInvitePage: a recovery link must
      // apply to the account it was issued for, never silently attach to
      // whichever session happened to already be active in this browser
      // (e.g. a shared computer, or testing your own reset link while
      // still logged in). scope: 'local' only clears this tab's own
      // session state — the default 'global' scope revokes every session
      // for the currently-logged-in user server-side, which (when that
      // user is the SAME person the recovery link was just issued to,
      // e.g. requesting a reset while still signed in) also revokes the
      // brand-new recovery session GoTrue just minted a moment earlier,
      // making the link appear invalid immediately after being consumed.
      await supabase.auth.signOut({ scope: 'local' });
      const outcome = await establishCallbackSession(params);
      setState(outcome.ok ? 'ready' : { error: outcome.reason });
      if (outcome.ok) {
        // The recovery-scoped session's own email — shown read-only in
        // SetNewPasswordForm so the person can see which account they're
        // resetting.
        const { data } = await supabase.auth.getUser();
        if (data.user?.email) setAccountEmail(data.user.email);
      }
    })();
  }, []);

  const handleSuccess = async () => {
    toast({ title: t('reset_password.success') });
    await supabase.auth.signOut();
    navigate('/auth/login', { replace: true });
  };

  if (state === 'verifying') {
    return <p className="text-sm text-center text-muted-foreground py-8">{t('reset_password.verifying')}</p>;
  }
  if (typeof state === 'object') {
    return <AuthLinkError mode="recovery" reason={state.error} />;
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-foreground">{t('reset_password.title')}</h2>
      </div>
      <SetNewPasswordForm mode="recovery" onSuccess={handleSuccess} email={accountEmail} />
    </div>
  );
}
