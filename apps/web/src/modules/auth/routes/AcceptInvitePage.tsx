import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@platform/i18n';
import { toast } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { parseJwtClaims, getPostLoginRoute } from '@/lib/auth/jwt.js';
import { SetNewPasswordForm } from '../components/SetNewPasswordForm.js';
import { AuthLinkError } from '../components/AuthLinkError.js';
import {
  parseAuthCallbackParams, clearAuthCallbackParamsFromUrl, establishCallbackSession,
} from '../lib/authCallback.js';

type PageState = 'verifying' | 'ready' | { error: 'expired' | 'invalid' };

/**
 * Invitation-acceptance callback: consumes the invite token, establishes a
 * session, then hands off to SetNewPasswordForm to set the initial password.
 * Unlike password recovery, success here goes straight into the dashboard
 * (the invited person is a new, first-time user — there is no separate
 * "existing account" to sign back into).
 */
export function AcceptInvitePage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const { organization } = useSession();
  const [state, setState] = useState<PageState>('verifying');
  const [pendingOrgName, setPendingOrgName] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

    const params = parseAuthCallbackParams();
    clearAuthCallbackParamsFromUrl();

    if (params.type && params.type !== 'invite') {
      setState({ error: 'invalid' });
      return;
    }

    void (async () => {
      // Discard any pre-existing session in this browser (e.g. the admin who
      // sent the invite testing it locally) before applying the invite token —
      // an invitation must never silently attach to whichever account happened
      // to already be logged in. scope: 'local' only clears this tab's own
      // session state — see ResetPasswordPage.tsx for why the default
      // 'global' scope is wrong here (it can revoke the very session the
      // invite link just minted).
      await supabase.auth.signOut({ scope: 'local' });
      const outcome = await establishCallbackSession(params);
      setState(outcome.ok ? 'ready' : { error: outcome.reason });
    })();
  }, []);

  useEffect(() => {
    if (state !== 'ready') return;
    // A pending membership deliberately produces empty JWT claims (no
    // organization_id) until activation completes — this page needs the
    // organization name before that point, so it fetches it narrowly rather
    // than relying on useSession().organization.
    void supabase.rpc('get_pending_invite_organization').then(({ data }) => {
      const row = Array.isArray(data) ? data[0] as { organization_name?: string } | undefined : undefined;
      if (row?.organization_name) setPendingOrgName(row.organization_name);
    });
    // The invite-scoped session's own email — shown read-only in
    // SetNewPasswordForm so the applicant can see which account they're
    // activating without it being editable (editing it would desynchronize
    // from the token's actual account identity).
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setAccountEmail(data.user.email);
    });
  }, [state]);

  const handleSuccess = async () => {
    toast({ title: t('invite.success') });
    // The session established above was minted while the membership was
    // still pending, so its JWT carries empty claims — refresh now that
    // SetNewPasswordForm has activated the membership, so routing below
    // sees the real organization_id/role/permissions.
    await supabase.auth.refreshSession();
    const { data: { session } } = await supabase.auth.getSession();
    const claims = session ? parseJwtClaims(session.access_token) : null;
    navigate(getPostLoginRoute(claims), { replace: true });
  };

  if (state === 'verifying') {
    return <p className="text-sm text-center text-muted-foreground py-8">{t('invite.verifying')}</p>;
  }
  if (typeof state === 'object') {
    return <AuthLinkError mode="invite" reason={state.error} />;
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-foreground">
          {t('invite.title', { organization: pendingOrgName ?? organization?.name ?? '' })}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('invite.subtitle')}</p>
      </div>
      <SetNewPasswordForm mode="invite" onSuccess={handleSuccess} email={accountEmail} />
    </div>
  );
}
