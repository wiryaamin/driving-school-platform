/**
 * Pre-account trial-signup API client — no Supabase session exists at this
 * point (see supabase/functions/trial-signup/index.ts), so this is a plain
 * fetch client, not a supabase-js call, matching the established public-
 * endpoint pattern (apps/web/src/modules/demo-page/lib/submitDemoRequest.ts).
 */

const API_URL   = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/trial-signup`;
const ANON_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export class TrialSignupError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) {
    super(message);
    this.name = 'TrialSignupError';
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json()) as { data: T } | { code: string; message: string; trace_id: string };
  if (!res.ok || !('data' in body)) {
    const errorBody = body as { code: string; message: string };
    throw new TrialSignupError(errorBody.message ?? 'Något gick fel. Försök igen.', errorBody.code ?? 'UNKNOWN_ERROR', res.status);
  }
  return body.data;
}

export interface StartTrialInput { email: string; driving_school_name: string; website?: string }
export interface StartTrialResult { token: string; setup_url: string; email_verification_sent: boolean }

export function startTrial(input: StartTrialInput): Promise<StartTrialResult> {
  return call('/', { method: 'POST', body: JSON.stringify(input) });
}

export interface TrialSession {
  driving_school_name: string;
  email: string;
  interview_answers: Record<string, unknown>;
}

export function getTrialSession(token: string): Promise<TrialSession> {
  return call(`/${token}`, { method: 'GET' });
}

export function saveTrialAnswers(token: string, answers: Record<string, unknown>): Promise<{ saved: true }> {
  return call(`/${token}`, { method: 'PATCH', body: JSON.stringify(answers) });
}

// Submitting the questionnaire no longer provisions anything (2026-08-08,
// "remove auto-approval" hardening) — no organization_id/action_link exists
// yet. Platform Admin must explicitly approve before any of that happens;
// this just confirms the submission was accepted and is pending review.
export interface CompleteTrialResult {
  status: string;
  message: string;
}

export function completeTrial(token: string): Promise<CompleteTrialResult> {
  return call(`/${token}/complete`, { method: 'POST' });
}
