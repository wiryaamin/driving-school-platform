import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@core/api/supabase.js';
import { logger } from '@platform/utils';

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

/**
 * supabase.functions.invoke() treats any non-2xx response as `error`, not
 * `data` — the JSON body bankid-auth returns for typed errors (e.g.
 * {error:'not_configured', message}) is only reachable via error.context
 * (the raw Response), not the `data` field. Without this, a 503
 * "not configured" response collapses into the generic failure message.
 */
async function extractErrorBody(error: unknown): Promise<{ error?: string; code?: string; message?: string } | null> {
  const context = (error as { context?: Response } | undefined)?.context;
  if (!context || typeof context.json !== 'function') return null;
  try {
    return await context.json();
  } catch {
    return null;
  }
}

/**
 * Live-verified against the hosted project (2026-07-12): newly-deployed Edge
 * Functions on this project intermittently return a gateway-level "function
 * not found" for a genuinely reachable, correctly-deployed function — 100%
 * reproducible even on a maximally trivial function with zero BankID-related
 * code (isolated via a throwaway diagnostic function), so this is a
 * platform/project-level routing characteristic, not a defect in bankid-auth.
 * Single-attempt failure rate measured at ~60%.
 *
 * This gateway error has its own parseable JSON body — {code:'NOT_FOUND',
 * message:'Requested function was not found'} — so it is NOT distinguishable
 * from a genuine typed response by "has a body" alone (an earlier version of
 * this retry logic got that wrong and never retried it). The real
 * distinction: bankid-auth's own typed errors always use {error, message};
 * the gateway's own errors use {code, message} with no `error` field. Only
 * the gateway shape is retried — a real {error:...} response from our
 * function is never retried, since retrying a deterministic answer (e.g.
 * not_configured) would just waste time.
 */
const MAX_ATTEMPTS = 4; // Keeps compound failure in the low single digits against a ~60% single-attempt rate.

function isGatewayRoutingError(body: { error?: string; code?: string } | null): boolean {
  return body !== null && body.error === undefined && body.code === 'NOT_FOUND';
}

async function invokeWithRetry<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; errorBody: { error?: string; message?: string } | null; opaqueFailure: boolean }> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.functions.invoke<T>(path, { body });
    if (!error) return { data: data ?? null, errorBody: null, opaqueFailure: false };

    const parsedBody = await extractErrorBody(error);
    const retryable = parsedBody === null || isGatewayRoutingError(parsedBody);

    if (!retryable) return { data: null, errorBody: parsedBody, opaqueFailure: false };

    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      continue;
    }
    return { data: null, errorBody: null, opaqueFailure: true };
  }
  return { data: null, errorBody: null, opaqueFailure: true };
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

      const { data, errorBody, opaqueFailure } = await invokeWithRetry<CollectResponse>(
        'bankid-auth/collect',
        { orderRef },
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

    const { data, errorBody, opaqueFailure } = await invokeWithRetry<
      { orderRef: string; autoStartUrl: string; qrData: string }
    >('bankid-auth/init', { purpose: 'login' });

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
