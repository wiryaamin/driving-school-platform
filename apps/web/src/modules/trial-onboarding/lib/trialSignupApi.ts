/**
 * Pre-account trial-signup API client — no Supabase session exists at this
 * point (see supabase/functions/trial-signup/index.ts), so this is a plain
 * fetch client, not a supabase-js call, matching the established public-
 * endpoint pattern (apps/web/src/modules/demo-page/lib/submitDemoRequest.ts).
 *
 * Starta provperiod — direct registration + email verification + password
 * activation (2026-08-30): the short registration form now collects every
 * field provisioning needs in one submission, so there is no more
 * autosave/interview step to persist as the applicant goes — saveTrialAnswers/
 * completeTrial (PATCH/POST .../complete) were removed from this client
 * accordingly. The backend routes themselves are kept as a fallback for any
 * pre-redesign session (see trial-signup/index.ts's own route comments).
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

export interface StartTrialInput {
  email: string;
  contact_first_name: string;
  contact_last_name: string;
  legal_name: string;
  address_line1: string;
  postal_code: string;
  city: string;
  licence_categories: string[];
  standard_lesson_price_sek: number;
  /** Honeypot — always empty for a real visitor. */
  website?: string;
}
export interface StartTrialResult { token: string; email_verification_sent: boolean }

export function startTrial(input: StartTrialInput): Promise<StartTrialResult> {
  return call('/', { method: 'POST', body: JSON.stringify(input) });
}

// A session from before this redesign can still be mid-interview — kept so
// the fallback status page (TrialOnboardingWizardPage) can recognize that
// shape defensively, even though the current registration form never
// produces one (see trial-signup/index.ts's GET /:token route comment).
export interface TrialSessionInProgress {
  driving_school_name: string;
  email: string;
  interview_answers: Record<string, unknown>;
}
export interface TrialSessionPostSubmission {
  status: 'questionnaire_completed' | 'approved' | 'provisioning' | 'provisioning_failed' | 'active';
  driving_school_name: string;
  email: string;
  organization_id: string | null;
}
export type TrialSession = TrialSessionInProgress | TrialSessionPostSubmission;

export function isPostSubmissionSession(session: TrialSession): session is TrialSessionPostSubmission {
  return 'status' in session;
}

export function getTrialSession(token: string): Promise<TrialSession> {
  return call(`/${token}`, { method: 'GET' });
}
