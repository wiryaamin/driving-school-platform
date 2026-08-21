// ─── Shared organization-member ("administrator"/staff-user) types & helpers ──
//
// Canonical shape for the invite-user/list response, plus pure formatting
// helpers. Shared by Settings → Användare (UsersSettingsPage) and the
// Personal workspace's Administratörer tab — both present the same
// underlying organization-member data, just in different shells.

export type InvitationStatus = 'pending' | 'accepted' | 'expired';

export interface OrgUserRow {
  user_id:           string;
  email:             string;
  first_name:        string;
  last_name:         string;
  is_active:         boolean;
  role:              string;
  role_display:      string;
  membership_status: string;
  invitation_status: 'pending' | 'accepted';
  invited_at:        string | null;
  last_sign_in_at:   string | null;
  joined_at:         string;

  // ── Common personnel record (see 20260816010000_personnel_record_common_fields.sql) ──
  job_title:              string | null;
  employment_type:        string | null;
  employment_number:      string | null;
  employment_started_at:  string | null;
  employment_ended_at:    string | null; // null = "Tills vidare" (ongoing)
  work_location_id:       string | null;
  work_location_name:     string | null;
  personnummer_last4:     string | null;
}

// Befattning display labels — matches PERSONNEL_JOB_TITLES in
// @platform/validation exactly. Kept here (not imported) because this is a
// pure presentation concern for the personnel list/detail, same pattern as
// INVITATION_STATUS_LABEL below.
export const JOB_TITLE_LABEL: Record<string, string> = {
  trafikskolechef:        'Trafikskolechef',
  utbildningsledare:      'Utbildningsledare',
  trafiklararpraktikant:  'Trafiklärarpraktikant',
  receptionist:           'Receptionist',
  administrativ_personal: 'Administrativ personal',
  ekonomipersonal:        'Ekonomipersonal',
  ovrig_personal:         'Övrig personal',
};

export const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  employed:   'Anställd',
  contractor: 'Konsult',
  external:   'Extern',
  on_leave:   'Tjänstledig',
  inactive:   'Inaktiv',
};

export interface IdentityEventRow {
  id:          string;
  event_type:  string;
  severity:    string;
  occurred_at: string;
  metadata:    Record<string, unknown>;
}

// Invite links created via auth.admin.inviteUserByEmail / generateLink expire
// 24h after issuance on this project's Supabase Auth configuration. Purely a
// display heuristic (not enforced here); the real expiry is Supabase's.
export const INVITATION_EXPIRY_HOURS = 24;

export const INVITATION_STATUS_LABEL: Record<InvitationStatus, string> = {
  pending:  'Väntar',
  accepted: 'Accepterad',
  expired:  'Utgången',
};

export const INVITATION_STATUS_CLASS: Record<InvitationStatus, string> = {
  pending:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  accepted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  expired:  'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

export const IDENTITY_EVENT_LABEL: Record<string, string> = {
  'invite.created':             'Inbjudan skickad',
  'invite.resent':              'Inbjudan skickad igen',
  'invite.cancelled':           'Inbjudan avbruten',
  'invite.email_changed':       'E-postadress ändrad',
  'invite.existing_user_added': 'Tillagd i organisationen',
  'password_reset.sent':        'Lösenordsåterställning skickad',
  'password_reset.forced':      'Lösenord tvångsåterställt',
};

export function getInitials(u: { first_name: string; last_name: string }): string {
  return `${u.first_name[0] ?? ''}${u.last_name[0] ?? ''}`.toUpperCase();
}

export function formatLastSeen(ts: string | null): string {
  if (!ts) return 'Aldrig';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2)  return 'Nyss';
  if (mins < 60) return `${mins} min sedan`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} tim sedan`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days} dag${days > 1 ? 'ar' : ''} sedan`;
  return new Date(ts).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

export function formatDateTime(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function computeInvitationStatus(u: Pick<OrgUserRow, 'invitation_status' | 'invited_at'>): InvitationStatus {
  if (u.invitation_status === 'accepted') return 'accepted';
  if (u.invited_at) {
    const ageHours = (Date.now() - new Date(u.invited_at).getTime()) / 3_600_000;
    if (ageHours > INVITATION_EXPIRY_HOURS) return 'expired';
  }
  return 'pending';
}

export async function extractFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response } | undefined)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json() as { message?: string };
      if (body.message) return body.message;
    } catch { /* fall through to fallback */ }
  }
  return fallback;
}

export function validateEmail(email: string): string | undefined {
  if (!email.trim()) return 'E-postadress krävs.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Ange en giltig e-postadress.';
  return undefined;
}
