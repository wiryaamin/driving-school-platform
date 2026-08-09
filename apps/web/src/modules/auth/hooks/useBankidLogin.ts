import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@core/api/supabase.js';
import { logger } from '@platform/utils';
import { invokeFunctionWithRetry, isGatewayRoutingError } from '@shared/lib/edgeFunctionRetry.js';

export type BankidLoginState = 'idle' | 'starting' | 'pending' | 'complete' | 'failed' | 'not_configured';

interface CollectResponse {
  status: 'pending' | 'failed' | 'complete';
  hintCode?: string | null;
  linked?: boolean;
  message?: string;
  tokenHash?: string;
}

const HINT_MESSAGES: Record<string, string> = {
  outstandingTransaction: 'Öppna BankID-appen.',
  noClient: 'Starta BankID-appen.',
  started: 'Söker efter BankID, det kan ta en liten stund...',
  userSign: 'Skriv in din säkerhetskod i BankID-appen.',
  expiredTransaction: 'BankID-sessionen har gått ut. Försök igen.',
  certificateErr: 'Det finns inget giltigt BankID för det här personnumret.',
  userCancel: 'Du avbröt BankID-inloggningen.',
  cancelled: 'Åtgärden avbröts.',
  startFailed: 'BankID-appen kunde inte startas. Kontrollera att du har BankID installerat.',
};

function hintMessage(hintCode: string | null | undefined): string {
  if (!hintCode) return 'Något gick fel. Försök igen.';
  return HINT_MESSAGES[hintCode] ?? 'Något gick fel. Försök igen.';
}

// bankid-auth's own typed errors always use {error, message}; the platform
// gateway's routing failure uses {code, message} with no `error` field (or
// no parseable body at all) — only that shape is retried, since retrying a
// real, deterministic answer (e.g. not_configured) would just waste time.
// See shared/lib/edgeFunctionRetry.ts for the full rationale — this was the
// original implementation of that now-shared module, extracted in Sprint 4A
// once a second caller needed identical behavior.
function isBankidRetryable(body: { error?: string; code?: string } | null): boolean {
  return body === null || isGatewayRoutingError(body);
}

/**
 * useBankidLogin — starts a BankID login order, polls for completion, and
 * establishes the real Supabase session via verifyOtp() once bankid-auth's
 * /collect route resolves the linked identity (ADR-007 Phase 3).
 *
 * BankID requires a relying-party mTLS certificate that this environment does
 * not have configured yet — the bankid-auth Edge Function returns a typed
 * 'not_configured' response in that case, surfaced here as its own state so
 * the UI can show a clear message instead of a stuck spinner.
 */
export function useBankidLogin() {
  const [state, setState] = useState<BankidLoginState>('idle');
  const [qrData, setQrData] = useState<string | null>(null);
  const [autoStartUrl, setAutoStartUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const orderRefRef = useRef<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const poll = useCallback(() => {
    pollTimerRef.current = window.setInterval(async () => {
      const orderRef = orderRefRef.current;
      if (!orderRef) return;

      const { data, errorBody, opaqueFailure } = await invokeFunctionWithRetry<CollectResponse, { error?: string; message?: string }>(
        'bankid-auth/collect',
        { orderRef },
        isBankidRetryable,
      );

      if (opaqueFailure) {
        // Transient, already retried once — wait for the next poll tick
        // rather than failing the whole order over one bad round trip.
        return;
      }

      if (errorBody) {
        stopPolling();
        setState(errorBody.error === 'not_configured' ? 'not_configured' : 'failed');
        setMessage(errorBody.message ?? 'Anslutningen till BankID bröts. Försök igen.');
        return;
      }

      if (!data) {
        stopPolling();
        setState('failed');
        setMessage('Anslutningen till BankID bröts. Försök igen.');
        return;
      }

      if (data.status === 'pending') {
        setMessage(hintMessage(data.hintCode));
        return;
      }

      if (data.status === 'failed') {
        stopPolling();
        setState('failed');
        setMessage(hintMessage(data.hintCode));
        return;
      }

      // status === 'complete'
      stopPolling();
      if (!data.linked || !data.tokenHash) {
        setState('failed');
        setMessage(data.message ?? 'Inget konto är kopplat till detta BankID.');
        return;
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.tokenHash,
        type: 'magiclink',
      });

      if (verifyError) {
        logger.error('useBankidLogin: verifyOtp failed', { error: verifyError.message });
        setState('failed');
        setMessage('Inloggningen misslyckades. Försök igen.');
        return;
      }

      setState('complete');
    }, 2000);
  }, [stopPolling]);

  const start = useCallback(async () => {
    setState('starting');
    setMessage(null);
    setQrData(null);
    setAutoStartUrl(null);

    const { data, errorBody, opaqueFailure } = await invokeFunctionWithRetry<
      { orderRef: string; autoStartUrl: string; qrData: string },
      { error?: string; message?: string }
    >('bankid-auth/init', { purpose: 'login' }, isBankidRetryable);

    if (errorBody) {
      setState(errorBody.error === 'not_configured' ? 'not_configured' : 'failed');
      setMessage(errorBody.message ?? 'Kunde inte starta BankID-inloggningen. Försök igen.');
      return;
    }

    if (opaqueFailure || !data) {
      setState('failed');
      setMessage('Kunde inte starta BankID-inloggningen. Försök igen.');
      return;
    }

    orderRefRef.current = data.orderRef;
    setQrData(data.qrData);
    setAutoStartUrl(data.autoStartUrl);
    setState('pending');
    setMessage(hintMessage('outstandingTransaction'));
    poll();
  }, [poll]);

  const cancel = useCallback(() => {
    stopPolling();
    const orderRef = orderRefRef.current;
    if (orderRef) {
      void supabase.functions.invoke('bankid-auth/cancel', { body: { orderRef } }).catch(() => {});
    }
    orderRefRef.current = null;
    setState('idle');
    setQrData(null);
    setAutoStartUrl(null);
    setMessage(null);
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return { state, qrData, autoStartUrl, message, start, cancel };
}
