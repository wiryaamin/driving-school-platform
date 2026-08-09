import { supabase } from '@core/api/supabase.js';

/**
 * Live-verified against the hosted project (2026-07-12, originally documented
 * in useBankidLogin.ts): newly-deployed Edge Functions on this project
 * intermittently return a gateway-level "function not found" for a genuinely
 * reachable, correctly-deployed function — 100% reproducible even on a
 * maximally trivial function with zero domain-specific code, so this is a
 * platform/project-level routing characteristic, not a defect in any one
 * function. Single-attempt failure rate measured at ~50-60%.
 *
 * This gateway error has its own parseable JSON body — {code:'NOT_FOUND',
 * message:'Requested function was not found'} — so it is NOT distinguishable
 * from a genuine typed response by "has a body" alone. The real distinction:
 * this platform's own Edge Functions always return {code, message} too for
 * their *typed* errors (see errorResp() in supabase/functions/_shared), so
 * gateway vs. real errors can't be told apart by shape — only a caller that
 * knows its own function's error codes can decide what's retryable. Callers
 * pass `isRetryable` for exactly that reason; this module makes no
 * assumption about any one function's error vocabulary.
 *
 * Extracted from useBankidLogin.ts (the original, proven implementation) once
 * a second caller (invite-user, Sprint 4A) needed the identical behavior —
 * duplicating a ~40-line, already-tested retry algorithm a second time would
 * itself have been the kind of inconsistency this extraction avoids.
 */
const DEFAULT_MAX_ATTEMPTS = 4; // Keeps compound failure in the low single digits against a ~60% single-attempt rate.

export interface EdgeFunctionRetryResult<T, E> {
  data: T | null;
  errorBody: E | null;
  /** True only when every attempt failed with no parseable body at all — a genuinely opaque failure, not a typed error. */
  opaqueFailure: boolean;
}

async function extractErrorBody<E>(error: unknown): Promise<E | null> {
  const context = (error as { context?: Response } | undefined)?.context;
  if (!context || typeof context.json !== 'function') return null;
  try {
    return await context.json() as E;
  } catch {
    return null;
  }
}

/**
 * Invokes a Supabase Edge Function, retrying on the gateway routing failure
 * described above. `isRetryable` decides, given a function's own parsed
 * error body (or null, meaning the body wasn't JSON at all — always
 * retryable, since a real typed error from this platform's functions is
 * always JSON), whether a given failure is the transient gateway issue or a
 * genuine, deterministic answer that retrying would just waste time on.
 */
export async function invokeFunctionWithRetry<T, E = { message?: string }>(
  path: string,
  body: Record<string, unknown>,
  isRetryable: (errorBody: E | null) => boolean,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
): Promise<EdgeFunctionRetryResult<T, E>> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabase.functions.invoke<T>(path, { body });
    if (!error) return { data: data ?? null, errorBody: null, opaqueFailure: false };

    const parsedBody = await extractErrorBody<E>(error);
    const retryable = isRetryable(parsedBody);

    if (!retryable) return { data: null, errorBody: parsedBody, opaqueFailure: false };

    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      continue;
    }
    return { data: null, errorBody: null, opaqueFailure: true };
  }
  return { data: null, errorBody: null, opaqueFailure: true };
}

/** Shared predicate: true only for this platform's gateway routing error shape ({code:'NOT_FOUND'}, no `error` field). */
export function isGatewayRoutingError(body: { error?: unknown; code?: string } | null): boolean {
  return body !== null && body.error === undefined && body.code === 'NOT_FOUND';
}
