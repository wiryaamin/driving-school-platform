import { Lock } from 'lucide-react';
import { useSessionStore } from '@core/store/session.store.js';

export function TrialExpiredPage() {
  const organization = useSessionStore((s) => s.organization);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center space-y-6 p-8 bg-background">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <Lock className="w-8 h-8 text-muted-foreground" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h1 className="text-xl font-semibold text-foreground">Testperioden har gått ut</h1>
        <p className="text-sm text-muted-foreground">
          {organization?.name ?? 'Ert konto'}s testperiod har gått ut och kontot är tills vidare spärrat.
          Kontakta oss för att uppgradera och återfå åtkomst.
        </p>
      </div>
      <a
        href="mailto:support@trafikcloud.se"
        className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Kontakta support
      </a>
    </div>
  );
}
