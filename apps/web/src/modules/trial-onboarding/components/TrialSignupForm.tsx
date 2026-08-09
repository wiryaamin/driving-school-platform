import { useRef, useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button, Input, toast } from '@platform/ui';
import { startTrial, TrialSignupError } from '../lib/trialSignupApi.js';

/**
 * The self-service trial-signup form itself, extracted so it can be
 * embedded directly on the landing page's "Kom igång" section as well as
 * rendered standalone at /start-trial — same dual-placement pattern already
 * established by demo-page/components/DemoRequestForm.tsx, which this
 * replaces as the site's primary "Starta provperiod" mechanism (2026-08-08:
 * the embedded demo-request form was the actual live "legacy path" still
 * reachable from the site's one true conversion action — see navigation.ts's
 * DEMO_CTA and every CTA consuming it).
 *
 * No direct "open the installation without email" bypass is offered here —
 * unlike an earlier draft of this page. Now that Resend delivery is
 * confirmed working end-to-end in production, the emailed link is the real,
 * only way in, matching "Verify email" as a genuine, non-skippable step
 * rather than a fallback link every submitter could see immediately.
 */
export function TrialSignupForm() {
  const [email, setEmail] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const honeypotRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim().length === 0 || schoolName.trim().length < 2) {
      toast({ title: 'Fyll i e-post och trafikskolans namn', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const result = await startTrial({ email: email.trim(), driving_school_name: schoolName.trim(), website: honeypotRef.current?.value ?? '' });
      setSendFailed(!result.email_verification_sent);
      setSent(true);
    } catch (err) {
      toast({ title: 'Kunde inte starta provperiod', description: err instanceof TrialSignupError ? err.message : undefined, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-md text-center space-y-3">
        <CheckCircle2 className={`w-10 h-10 mx-auto ${sendFailed ? 'text-destructive' : 'text-primary'}`} />
        <h2 className="text-lg font-semibold text-foreground">
          {sendFailed ? 'Vi kunde inte skicka mailet' : 'Bekräfta din e-postadress'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {sendFailed
            ? `Vi kunde inte skicka ett verifieringsmail till ${email}. Kontrollera att adressen stämmer och försök igen, eller hör av er till support@trafikcloud.se.`
            : `Vi har skickat ett verifieringsmail till ${email}. Klicka på länken i mailet för att bekräfta att det är rätt adress — därefter skickar vi ett välkomstmail med nästa steg för ${schoolName}.`}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md w-full space-y-5">
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}>
        <label htmlFor="website">Webbplats</label>
        <input ref={honeypotRef} type="text" id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Trafikskolans namn</label>
        <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="Lindqvists Trafikskola" />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">E-post</label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="erik@korskola.se" />
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {submitting ? 'Startar...' : 'Starta provperiod'}
      </Button>
    </form>
  );
}
