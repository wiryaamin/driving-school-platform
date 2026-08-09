import { Toaster } from '@platform/ui';
import { TrialSignupForm } from '../components/TrialSignupForm.js';

/**
 * Public, pre-account trial-signup entry point — "Tenant Trial Created" in
 * the onboarding architecture. Standalone page wrapper around
 * TrialSignupForm.js; the form itself is shared verbatim with the landing
 * page's embedded "Kom igång" section (CallToAction.tsx), matching
 * DemoRequestForm's own established dual-placement pattern.
 */
export function StartTrialPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-5">
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-primary">Trafikcloud</p>
          <h1 className="text-xl font-semibold text-foreground">Starta er kostnadsfria provperiod</h1>
          <p className="text-sm text-muted-foreground">Svara på några frågor om er verksamhet — Trafikcloud konfigurerar resten automatiskt.</p>
        </div>
        <TrialSignupForm />
      </div>
      <Toaster />
    </div>
  );
}
