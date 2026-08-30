/**
 * Shared trial-onboarding lifecycle helpers — the verification/questionnaire
 * email templates and the tenant_trial_events audit-log writer, used by both
 * trial-signup/index.ts (public, applicant-facing) and platform-admin/
 * index.ts (authenticated, Resend Verification / Resend Questionnaire
 * actions) so neither ever drifts from the other's copy or event shape.
 */

// deno-lint-ignore no-explicit-any
type DbClient = any;

export function verifyEmailHtml(schoolName: string, verifyUrl: string): string {
  return `
    <div style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
      <p style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">Trafikcloud</p>
      <h2 style="font-size: 18px; margin-top: 24px;">Bekräfta din e-postadress</h2>
      <p>Hej,</p>
      <p>Vi har tagit emot er registrering för <strong>${schoolName}</strong>. Klicka på länken nedan för att bekräfta att det här är rätt e-postadress — då konfigurerar vi er trafikskola direkt.</p>
      <p style="margin: 32px 0;">
        <a href="${verifyUrl}" style="background: #16a34a; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
          Bekräfta e-postadress
        </a>
      </p>
      <p style="font-size: 13px; color: #64748b;">Inget konto eller lösenord finns ännu — det skapar ni i nästa steg, direkt efter att er e-postadress är bekräftad. Länken är giltig i 7 dagar.</p>
    </div>`;
}

export function questionnaireEmailHtml(schoolName: string, setupUrl: string): string {
  return `
    <div style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
      <p style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">Trafikcloud</p>
      <h2 style="font-size: 18px; margin-top: 24px;">Välkommen — berätta om er verksamhet</h2>
      <p>Tack, er e-postadress är bekräftad. Nu sätter vi upp er trafikskola, <strong>${schoolName}</strong>.</p>
      <p>Svara på några frågor om er verksamhet så konfigurerar Trafikcloud automatiskt resten åt er — lektionstyper, priser, filial, moms och grundinställningar utifrån era svar. Det tar ett par minuter.</p>
      <p style="margin: 32px 0;">
        <a href="${setupUrl}" style="background: #16a34a; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
          Starta er installation
        </a>
      </p>
      <p style="font-size: 13px; color: #64748b;">Länken är giltig i 7 dagar. Frågor? Hör av er till <a href="mailto:support@trafikcloud.se">support@trafikcloud.se</a>.</p>
    </div>`;
}

export type TrialEventType =
  | 'request_created' | 'email_verified' | 'questionnaire_started' | 'questionnaire_completed'
  | 'approved' | 'provisioning_started' | 'provisioning_completed' | 'provisioning_failed'
  | 'rejected' | 'cancelled' | 'expired' | 'deleted'
  | 'verification_email_resent' | 'questionnaire_email_resent';

export interface LogTrialEventInput {
  sessionId: string | null;
  email: string;
  drivingSchoolName: string;
  eventType: TrialEventType;
  actorType: 'system' | 'applicant' | 'admin';
  actorId?: string | null;
  actorEmail?: string | null;
  metadata?: Record<string, unknown>;
}

/** Best-effort — a failed audit write must never block the actual lifecycle transition it's describing. */
export async function logTrialEvent(db: DbClient, input: LogTrialEventInput): Promise<void> {
  try {
    await db.from('tenant_trial_events').insert({
      session_id: input.sessionId,
      email: input.email,
      driving_school_name: input.drivingSchoolName,
      event_type: input.eventType,
      actor_type: input.actorType,
      actor_id: input.actorId ?? null,
      actor_email: input.actorEmail ?? null,
      metadata: input.metadata ?? {},
    });
  } catch {
    // Best-effort — see docstring above.
  }
}
