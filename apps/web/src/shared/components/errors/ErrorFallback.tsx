import { useNavigate } from 'react-router-dom';

interface ErrorFallbackProps {
  error: Error | null;
  onReset?: () => void;
}

/**
 * Full-page error fallback — shown when ErrorBoundary catches a rendering error.
 */
export function ErrorFallback({ error, onReset }: ErrorFallbackProps) {
  const navigate = useNavigate();
  const traceId = crypto.randomUUID().slice(0, 8).toUpperCase();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Error icon */}
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-foreground mb-2">
          Något gick fel
        </h1>
        <p className="text-muted-foreground text-sm mb-6">
          Ett oväntat fel uppstod. Vi ber om ursäkt för besväret.
        </p>

        {/* Error details — dev only */}
        {import.meta.env.DEV && error && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 text-left">
            <p className="text-xs font-mono text-slate-700 break-all">{error.message}</p>
          </div>
        )}

        <div className="flex gap-3 justify-center">
          {onReset && (
            <button
              onClick={onReset}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Försök igen
            </button>
          )}
          <button
            onClick={() => navigate('/', { replace: true })}
            className="px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
          >
            Gå till startsidan
          </button>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Fel-ID: <span className="font-mono">{traceId}</span>
        </p>
      </div>
    </div>
  );
}
