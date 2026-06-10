import { ShieldOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function ForbiddenPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-6 max-w-sm">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <ShieldOff className="w-8 h-8 text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">403 – Ingen åtkomst</h1>
          <p className="text-sm text-muted-foreground">
            Du saknar behörighet att visa den här sidan.
            Kontakta din administratör om du tror att detta är ett misstag.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
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
        </div>
      </div>
    </div>
  );
}
