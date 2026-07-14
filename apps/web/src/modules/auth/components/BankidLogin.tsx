import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useBankidLogin } from '../hooks/useBankidLogin.js';
import { cn } from '@/lib/utils.js';

interface BankidLoginProps {
  onComplete: () => void;
}

/**
 * BankID login option for the login page (ADR-007 Phase 3). Renders a QR
 * code (other-device flow) and a same-device deep link, polling for
 * completion via useBankidLogin. Degrades to a clear message, not a stuck
 * spinner, when BankID isn't configured in this environment (no relying-party
 * certificate — see Phase 3 Gap Analysis).
 */
export function BankidLogin({ onComplete }: BankidLoginProps) {
  const { state, qrData, autoStartUrl, message, start, cancel } = useBankidLogin();
  const [qrImage, setQrImage] = useState<string | null>(null);

  useEffect(() => {
    if (!qrData) {
      setQrImage(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(qrData, { margin: 1, width: 220 })
      .then((url) => { if (!cancelled) setQrImage(url); })
      .catch(() => { if (!cancelled) setQrImage(null); });
    return () => { cancelled = true; };
  }, [qrData]);

  useEffect(() => {
    if (state === 'complete') onComplete();
  }, [state, onComplete]);

  if (state === 'idle') {
    return (
      <button
        type="button"
        onClick={() => void start()}
        className={cn(
          'w-full py-2.5 px-4 rounded-lg text-sm font-medium',
          'border border-input bg-background text-foreground',
          'hover:bg-muted active:scale-[0.99]',
          'transition-all',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
          'flex items-center justify-center gap-2'
        )}
      >
        <BankidMark />
        Logga in med BankID
      </button>
    );
  }

  if (state === 'not_configured') {
    return (
      <div className="p-3 rounded-lg bg-muted border border-input">
        <p className="text-sm text-muted-foreground">
          {message ?? 'BankID är inte konfigurerat i den här miljön.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 rounded-lg border border-input bg-background">
      {state === 'starting' && (
        <p className="text-sm text-muted-foreground text-center">Startar BankID...</p>
      )}

      {state === 'pending' && (
        <>
          {qrImage && (
            <img
              src={qrImage}
              alt="BankID QR-kod"
              className="mx-auto w-[180px] h-[180px] sm:w-[220px] sm:h-[220px]"
            />
          )}
          <p className="text-sm text-center text-foreground">{message}</p>
          {autoStartUrl && (
            <a
              href={autoStartUrl}
              className="block text-center text-sm text-primary hover:text-primary/80 transition-colors"
            >
              Öppna BankID på den här enheten
            </a>
          )}
        </>
      )}

      {state === 'failed' && (
        <p className="text-sm text-center text-destructive">{message}</p>
      )}

      <button
        type="button"
        onClick={cancel}
        className="w-full text-xs text-center text-muted-foreground hover:text-foreground transition-colors"
      >
        Avbryt
      </button>
    </div>
  );
}

function BankidMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#193E4F" />
      <path d="M7 7h10v3H10v2h6v3h-6v2h7v3H7V7z" fill="white" />
    </svg>
  );
}
