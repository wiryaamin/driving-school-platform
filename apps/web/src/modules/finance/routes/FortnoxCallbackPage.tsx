import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

type State = 'loading' | 'success' | 'error';

export function FortnoxCallbackPage() {
  const [params]        = useSearchParams();
  const navigate        = useNavigate();
  const { organization } = useSession();
  const [state,   setState]   = useState<State>('loading');
  const [errMsg,  setErrMsg]  = useState('');
  const didRun = useRef(false);

  useEffect(() => {
    // Strict mode / double-invoke guard
    if (didRun.current) return;
    didRun.current = true;

    const code        = params.get('code');
    const returnState = params.get('state');
    const errorParam  = params.get('error');
    const errorDesc   = params.get('error_description');

    // Fortnox sent back an error
    if (errorParam) {
      setState('error');
      setErrMsg(errorDesc ? decodeURIComponent(errorDesc) : errorParam);
      return;
    }

    if (!code) {
      setState('error');
      setErrMsg('Ingen auktoriseringskod mottagen från Fortnox.');
      return;
    }

    const codeVerifier = sessionStorage.getItem('fortnox_code_verifier');
    const savedState   = sessionStorage.getItem('fortnox_state');
    const redirectUri  = sessionStorage.getItem('fortnox_redirect_uri');

    // Clear session storage regardless of outcome
    sessionStorage.removeItem('fortnox_code_verifier');
    sessionStorage.removeItem('fortnox_state');
    sessionStorage.removeItem('fortnox_redirect_uri');

    if (!codeVerifier || !redirectUri) {
      setState('error');
      setErrMsg('Sessionsdata saknas — starta om anslutningsflödet.');
      return;
    }

    // OAuth state — mandatory, fail closed. Missing on either side, or a
    // mismatch, is rejected rather than silently skipped.
    if (!savedState || !returnState || savedState !== returnState) {
      setState('error');
      setErrMsg('Ogiltigt eller saknat state-parameter. Möjligt säkerhetsproblem — försök igen.');
      return;
    }

    void (async () => {
      try {
        const { error } = await supabase.functions.invoke('fortnox/oauth/callback', {
          method: 'POST',
          body: JSON.stringify({
            code,
            code_verifier: codeVerifier,
            redirect_uri:  redirectUri,
            state:         returnState,
          }),
        });
        if (error) throw error;
        setState('success');
      } catch (e) {
        setState('error');
        setErrMsg(e instanceof Error ? e.message : 'Okänt fel vid tokenutbyte.');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-redirect on success after a short delay so the user sees the confirmation
  useEffect(() => {
    if (state !== 'success') return;
    const t = setTimeout(() => navigate('/finance/fortnox', { replace: true }), 2000);
    return () => clearTimeout(t);
  }, [state, navigate]);

  const orgName = organization?.name ?? 'din organisation';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-sm w-full bg-card border border-border rounded-xl shadow-sm p-8 text-center space-y-4">

        {state === 'loading' && (
          <>
            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
            <p className="text-sm font-medium text-foreground">Ansluter till Fortnox…</p>
            <p className="text-xs text-muted-foreground">Utbyter auktoriseringskod mot tokens.</p>
          </>
        )}

        {state === 'success' && (
          <>
            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
            <p className="text-sm font-semibold text-foreground">Fortnox ansluten!</p>
            <p className="text-xs text-muted-foreground">
              {orgName} är nu ansluten till Fortnox. Du omdirigeras automatiskt…
            </p>
            <Button size="sm" onClick={() => navigate('/finance/fortnox', { replace: true })}>
              Gå till Fortnox
            </Button>
          </>
        )}

        {state === 'error' && (
          <>
            <XCircle className="w-10 h-10 text-destructive mx-auto" />
            <p className="text-sm font-semibold text-foreground">Anslutning misslyckades</p>
            {errMsg && (
              <p className="text-xs text-muted-foreground bg-destructive/5 border border-destructive/20 rounded-md px-3 py-2">
                {errMsg}
              </p>
            )}
            <div className="flex gap-2 justify-center">
              <Button size="sm" variant="outline" onClick={() => navigate('/finance/fortnox', { replace: true })}>
                Tillbaka
              </Button>
              <Button size="sm" onClick={() => navigate('/finance/fortnox', { replace: true })}>
                Försök igen
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
