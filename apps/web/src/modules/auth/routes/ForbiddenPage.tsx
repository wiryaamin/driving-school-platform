import { ShieldOff } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@core/api/supabase.js';

// 'no_organization' covers a disabled profile, an offboarded member, or an
// invite that was never activated — get_user_jwt_claims returns the exact
// same empty-claims shape for all three, so the JWT alone can't tell them
// apart; this stays a single, honest, non-specific message rather than
// guessing which one applies. Distinct from the default 'permission' reason
// (a real member of a real org, just missing one specific permission) —
// that case still points back to '/dashboard', which is a real destination
// for them; a no_organization account has nowhere in the app to usefully
// land, so that button is replaced with sign-out instead (2026-08-30, found
// via a real account stuck in this exact state during live testing).
export function ForbiddenPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNoOrganization = searchParams.get('reason') === 'no_organization';

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/auth/login', { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-6 max-w-sm">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <ShieldOff className="w-8 h-8 text-destructive" />
        </div>
        {isNoOrganization ? (
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Inget kontoaccess</h1>
            <p className="text-sm text-muted-foreground">
              Ditt konto är just nu inte kopplat till någon organisation på Trafikcloud.
              Kontakta din administratör eller support@trafikcloud.se om du tror att detta är fel.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">403 – Ingen åtkomst</h1>
            <p className="text-sm text-muted-foreground">
              Du saknar behörighet att visa den här sidan.
              Kontakta din administratör om du tror att detta är ett misstag.
            </p>
          </div>
        )}
        <div className="flex gap-3 justify-center">
          {isNoOrganization ? (
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Logga ut
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate(-1)}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors"
              >
                Gå tillbaka
              </button>
              <button
                onClick={() => navigate('/dashboard', { replace: true })}
                className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Till översikten
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
