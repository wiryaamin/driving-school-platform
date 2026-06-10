import { Hammer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function ComingSoonPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 p-8">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <Hammer className="w-8 h-8 text-muted-foreground" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h1 className="text-xl font-semibold text-foreground">Under uppbyggnad</h1>
        <p className="text-sm text-muted-foreground">
          Det här avsnittet är inte tillgängligt än och aktiveras i en kommande version.
        </p>
      </div>
      <button
        onClick={() => navigate('/dashboard', { replace: true })}
        className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Till översikten
      </button>
    </div>
  );
}
