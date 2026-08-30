import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button, Toaster } from '@platform/ui';
import { getTrialSession, isPostSubmissionSession, TrialSignupError } from '../lib/trialSignupApi.js';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'active'; actionLink: string | null }
  | { kind: 'review' }
  | { kind: 'provisioning' }
  | { kind: 'provisioning_failed' }
  | { kind: 'error'; message: string };

/**
 * Post-verification activation-status page — what "Starta provperiod"'s
 * emailed verification link lands on. Starta provperiod — direct
 * registration + email verification + password activation (2026-08-30):
 * this used to be a 10-step guided-business-interview wizard, but the short
 * registration form now collects everything provisioning needs up front, so
 * there is nothing left to fill in here. GET /:token/verify-email finalizes
 * (risk-assesses, then approves + provisions, or flags for review) the
 * moment the applicant verifies their email and redirects here with the
 * outcome — including the real action_link, when one exists — as query
 * params, so this page can show it immediately without a second round trip.
 *
 * If those params are absent (e.g. the applicant reopens the original
 * emailed link again later), it falls back to the session's real current
 * status via GET /:token, same as before the redesign.
 */
export function TrialOnboardingWizardPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ kind: 'error', message: 'Länken kunde inte hittas.' });
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const actionLink = params.get('action_link');
    // A real Supabase action-link token must never linger in the visible
    // URL/browser history any longer than necessary — same hygiene as
    // apps/web/src/modules/auth/lib/authCallback.ts's own callback params.
    if (status || actionLink) window.history.replaceState(null, '', window.location.pathname);

    if (status === 'active') { setState({ kind: 'active', actionLink }); return; }
    if (status === 'review') { setState({ kind: 'review' }); return; }

    void (async () => {
      try {
        const session = await getTrialSession(token);
        if (!isPostSubmissionSession(session)) {
          // No mid-interview state exists to resume into anymore — a
          // verified session that reaches this branch is still being
          // finalized.
          setState({ kind: 'provisioning' });
          return;
        }
        if (session.status === 'active') setState({ kind: 'active', actionLink: null });
        else if (session.status === 'questionnaire_completed' || session.status === 'approved') setState({ kind: 'review' });
        else if (session.status === 'provisioning') setState({ kind: 'provisioning' });
        else setState({ kind: 'provisioning_failed' });
      } catch (err) {
        setState({ kind: 'error', message: err instanceof TrialSignupError ? err.message : 'Länken är inte längre giltig.' });
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <p className="text-sm font-semibold text-primary">Trafikcloud</p>
        <StateView state={state} />
      </div>
      <Toaster />
    </div>
  );
}

function StateView({ state }: { state: ViewState }) {
  switch (state.kind) {
    case 'loading':
      return (
        <>
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Kontrollerar status...</p>
        </>
      );
    case 'active':
      return (
        <>
          <CheckCircle2 className="w-10 h-10 mx-auto text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Er trafikskola är redo!</h1>
          {state.actionLink ? (
            <>
              <p className="text-sm text-muted-foreground">Sista steget — skapa ert lösenord för att logga in.</p>
              <Button size="lg" className="w-full" onClick={() => { window.location.href = state.actionLink as string; }}>
                Skapa lösenord
              </Button>
              <p className="text-xs text-muted-foreground">Vi har även skickat en länk till er e-post ifall den här sidan inte fungerar.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Vi har skickat ett mail med en länk för att skapa ert lösenord — kolla er inkorg (och skräppost).</p>
          )}
        </>
      );
    case 'review':
      return (
        <>
          <CheckCircle2 className="w-10 h-10 mx-auto text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Tack för er registrering</h1>
          <p className="text-sm text-muted-foreground">
            Er registrering granskas manuellt av Trafikcloud — det gäller ett litet antal registreringar. Ni får ett mail så snart er trafikskola är redo att användas.
          </p>
        </>
      );
    case 'provisioning':
      return (
        <>
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Trafikskolan konfigureras...</h1>
          <p className="text-sm text-muted-foreground">Det här tar bara ett ögonblick. Ladda om sidan om det dröjer.</p>
        </>
      );
    case 'provisioning_failed':
      return (
        <>
          <AlertCircle className="w-10 h-10 mx-auto text-destructive" />
          <h1 className="text-lg font-semibold text-foreground">Vi kunde inte slutföra konfigurationen automatiskt</h1>
          <p className="text-sm text-muted-foreground">Trafikcloud tittar på det manuellt. Ni får ett mail så snart er trafikskola är redo att användas.</p>
        </>
      );
    case 'error':
      return (
        <>
          <AlertCircle className="w-10 h-10 mx-auto text-destructive" />
          <h1 className="text-lg font-semibold text-foreground">Länken fungerar inte</h1>
          <p className="text-sm text-muted-foreground">{state.message}</p>
        </>
      );
  }
}
