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

// A session still mid-interview returns interview_answers to resume into;
// a session past submission (Starta provperiod workflow redesign,
// 2026-08-30) instead returns its current post-submission status — the
// applicant's only way to check on a registration by reopening the same
// emailed link, rather than a dead "link no longer valid" error.
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

export function saveTrialAnswers(token: string, answers: Record<string, unknown>): Promise<{ saved: true }> {
  return call(`/${token}`, { method: 'PATCH', body: JSON.stringify(answers) });
}

// The standard case now approves and provisions immediately (Starta
// provperiod workflow redesign, 2026-08-30) — status 'active' means the
// trafikskola is created and action_link is a real, ready-to-use link to
// set a password. A small minority of registrations still fall back to
// manual review (status 'questionnaire_completed'), same as before.
export interface CompleteTrialReviewResult {
  status: 'questionnaire_completed';
  message: string;
}
export interface CompleteTrialActiveResult {
  status: 'active';
  organization_id: string;
  action_link: string | null;
  lesson_types_created: number;
  package_templates_created: number;
  branch_created: number;
  priced_lesson_types: number;
  vehicles_created: number;
  instructors_created: number;
  staff_invited: number;
  additional_branches_created: number;
  slots_generated: number;
  provisioning_warnings: string[];
}
export type CompleteTrialResult = CompleteTrialReviewResult | CompleteTrialActiveResult;

export function isActiveResult(result: CompleteTrialResult): result is CompleteTrialActiveResult {
  return result.status === 'active';
}

export function completeTrial(token: string): Promise<CompleteTrialResult> {
  return call(`/${token}/complete`, { method: 'POST' });
}
