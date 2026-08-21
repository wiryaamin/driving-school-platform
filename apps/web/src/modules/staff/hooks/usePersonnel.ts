import type { InvitableRole } from '@platform/validation';

// ─── Personal-workspace-specific personnel-type grouping ─────────────────────
//
// Not a separate data model — this only decides which of the existing
// organization-member roles (see @modules/settings/hooks/useOrgUsers.js,
// the shared canonical source) count as "Administratör" for the Personal
// workspace's tab grouping and Personaltyp selector. The underlying list
// query, mutations, and OrgUserRow type all live in the settings module and
// are reused as-is — see modules/settings/hooks/useOrgUsers.ts.

export const ADMIN_ROLE_LABELS: Record<Exclude<InvitableRole, 'instructor' | 'instructor_senior'>, string> = {
  org_admin:         'Administratör',
  org_manager:       'Chef',
  receptionist:      'Receptionist',
  finance_admin:     'Ekonomi',
  student_admin:     'Elevadmin',
  reporting_viewer:  'Rapportläsare',
  corporate_contact: 'Företagskontakt',
};
