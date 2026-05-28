import { cn } from '@/lib/utils.js';

interface LoadingScreenProps {
  /** Full-screen overlay (default) or inline spinner */
  variant?: 'fullscreen' | 'inline';
  message?: string;
}

/**
 * Loading state component — used for Suspense fallback and page loading states.
 */
export function LoadingScreen({ variant = 'fullscreen', message }: LoadingScreenProps) {
  if (variant === 'inline') {
    return (
      <div className="flex items-center justify-center p-8 gap-3">
        <Spinner className="w-5 h-5" />
        {message && <span className="text-sm text-muted-foreground">{message}</span>}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-50">
      <div className="flex flex-col items-center gap-4">
        {/* Logo mark */}
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-primary-foreground" stroke="currentColor" strokeWidth={2}>
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <Spinner className="w-6 h-6 text-primary" />
        {message && (
          <p className="text-sm text-muted-foreground">{message}</p>
        )}
      </div>
    </div>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-label="Laddar"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
