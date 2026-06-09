/**
 * Permission constants — the complete catalog of platform permissions.
 * Use these constants everywhere to avoid raw string permission codes.
 *
 * Format: {Domain}:{Resource}:{Action}
 */
export const Permissions = {
  // ─── Students ──────────────────────────────────────────────────────────────
  STUDENTS_READ: 'students:student:read',
  STUDENTS_CREATE: 'students:student:create',
  STUDENTS_UPDATE: 'students:student:update',
  STUDENTS_DELETE: 'students:student:delete',
  STUDENTS_PROGRESS_READ: 'students:progress:read',
  STUDENTS_PROGRESS_UPDATE: 'students:progress:update',
  STUDENTS_PII_READ: 'students:pii:read',

  // ─── Instructors ───────────────────────────────────────────────────────────
  INSTRUCTORS_READ: 'instructors:instructor:read',
  INSTRUCTORS_CREATE: 'instructors:instructor:create',
  INSTRUCTORS_UPDATE: 'instructors:instructor:update',
  INSTRUCTORS_DELETE: 'instructors:instructor:delete',

  // ─── Scheduling ────────────────────────────────────────────────────────────
  SCHEDULING_READ: 'scheduling:lesson:read',
  SCHEDULING_CREATE: 'scheduling:lesson:create',
  SCHEDULING_UPDATE: 'scheduling:lesson:update',
  SCHEDULING_DELETE: 'scheduling:lesson:delete',
  SCHEDULING_OWN_READ: 'scheduling:own_lesson:read',

  // ─── Finance ───────────────────────────────────────────────────────────────
  FINANCE_INVOICE_READ: 'finance:invoice:read',
  FINANCE_INVOICE_CREATE: 'finance:invoice:create',
  FINANCE_INVOICE_UPDATE: 'finance:invoice:update',
  FINANCE_INVOICE_VOID: 'finance:invoice:void',
  FINANCE_INVOICE_EXPORT: 'finance:invoice:export',
  FINANCE_PAYMENT_READ: 'finance:payment:read',
  FINANCE_PAYMENT_CREATE: 'finance:payment:create',
  FINANCE_WALLET_READ: 'finance:wallet:read',

  // ─── Documents ─────────────────────────────────────────────────────────────
  DOCUMENTS_READ: 'documents:document:read',
  DOCUMENTS_CREATE: 'documents:document:create',
  DOCUMENTS_DELETE: 'documents:document:delete',

  // ─── Communications ────────────────────────────────────────────────────────
  COMMUNICATIONS_READ: 'communications:message:read',
  COMMUNICATIONS_CREATE: 'communications:message:create',

  // ─── Reporting ─────────────────────────────────────────────────────────────
  REPORTING_READ: 'reporting:report:read',
  REPORTING_FINANCIAL_EXPORT: 'reporting:financial:export',

  // ─── Administration ────────────────────────────────────────────────────────
  ADMIN_USER_READ: 'administration:user:read',
  ADMIN_USER_CREATE: 'administration:user:create',
  ADMIN_USER_UPDATE: 'administration:user:update',
  ADMIN_USER_DELETE: 'administration:user:delete',
  ADMIN_ROLE_READ: 'administration:role:read',
  ADMIN_ROLE_UPDATE: 'administration:role:update',
  ADMIN_LOCATION_MANAGE: 'administration:location:manage',
  ADMIN_ORGANIZATION_READ: 'administration:organization:read',
  ADMIN_ORGANIZATION_UPDATE: 'administration:organization:update',
  ADMIN_SUBSCRIPTION_READ: 'administration:subscription:read',
  ADMIN_SUBSCRIPTION_MANAGE: 'administration:subscription:manage',
  ADMIN_AUDIT_READ: 'administration:audit:read',

  // ─── Corporate ─────────────────────────────────────────────────────────────
  CORPORATE_READ: 'corporate:account:read',
  CORPORATE_CREATE: 'corporate:account:create',
  CORPORATE_UPDATE: 'corporate:account:update',
} as const;

export type Permission = typeof Permissions[keyof typeof Permissions];
