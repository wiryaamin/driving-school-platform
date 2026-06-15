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
  SCHEDULING_READ: 'scheduling:booking:read',
  SCHEDULING_CREATE: 'scheduling:booking:create',
  SCHEDULING_UPDATE: 'scheduling:booking:update',
  SCHEDULING_DELETE: 'scheduling:booking:delete',
  SCHEDULING_SLOT_READ: 'scheduling:slot:read',
  SCHEDULING_SLOT_CREATE: 'scheduling:slot:create',
  SCHEDULING_SLOT_UPDATE: 'scheduling:slot:update',
  SCHEDULING_SLOT_DELETE: 'scheduling:slot:delete',

  // ─── Finance ───────────────────────────────────────────────────────────────
  FINANCE_INVOICE_READ: 'finance:invoice:read',
  FINANCE_INVOICE_CREATE: 'finance:invoice:create',
  FINANCE_INVOICE_UPDATE: 'finance:invoice:update',
  FINANCE_INVOICE_APPROVE: 'finance:invoice:approve',
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
  CORPORATE_READ: 'corporate:contract:read',
  CORPORATE_CREATE: 'corporate:contract:create',
  CORPORATE_UPDATE: 'corporate:contract:update',

  // ─── Corporate Customers (Företagskunder) ──────────────────────────────────
  CORPORATE_CUSTOMERS_READ: 'corporate:customer:read',
  CORPORATE_CUSTOMERS_CREATE: 'corporate:customer:create',
  CORPORATE_CUSTOMERS_UPDATE: 'corporate:customer:update',
  CORPORATE_CUSTOMERS_DELETE: 'corporate:customer:delete',

  // ─── Finance — Packages & Wallet (Phase 4A) ─────────────────────────────
  FINANCE_PACKAGE_CREATE: 'finance:package:create',
  FINANCE_PACKAGE_READ: 'finance:package:read',
  FINANCE_PACKAGE_UPDATE: 'finance:package:update',
  FINANCE_PACKAGE_ARCHIVE: 'finance:package:archive',
  FINANCE_WALLET_MANAGE: 'finance:wallet:manage',
  FINANCE_PERIOD_READ: 'finance:period:read',
  FINANCE_PERIOD_MANAGE: 'finance:period:manage',
  FINANCE_PAYMENT_VOID: 'finance:payment:void',

  // ─── Finance — Refunds, Discounts, Dunning (Phase 4B) ────────────────────
  FINANCE_REFUND_CREATE: 'finance:refund:create',
  FINANCE_REFUND_READ: 'finance:refund:read',
  FINANCE_DISCOUNT_CREATE: 'finance:discount:create',
  FINANCE_DISCOUNT_READ: 'finance:discount:read',
  FINANCE_DISCOUNT_ASSIGN: 'finance:discount:assign',
  FINANCE_COUPON_CREATE: 'finance:coupon:create',
  FINANCE_COUPON_READ: 'finance:coupon:read',
  FINANCE_DUNNING_MANAGE: 'finance:dunning:manage',
  FINANCE_EXPORT_RUN: 'finance:export:run',

  // ─── Finance — Swedish compliance (Phase 4C) ─────────────────────────────
  FINANCE_BAS_READ: 'finance:bas:read',
  FINANCE_BAS_MANAGE: 'finance:bas:manage',
  FINANCE_VAT_READ: 'finance:vat:read',
  FINANCE_VAT_MANAGE: 'finance:vat:manage',
  FINANCE_SETTINGS_READ: 'finance:settings:read',
  FINANCE_SETTINGS_MANAGE: 'finance:settings:manage',
  FINANCE_SIE_EXPORT: 'finance:sie:export',
  FINANCE_SIE_READ: 'finance:sie:read',
  FINANCE_FORTNOX_MANAGE: 'finance:fortnox:manage',

  // ─── Finance — Ledger (Phase 4D) ─────────────────────────────────────────
  FINANCE_LEDGER_READ: 'finance:ledger:read',
  FINANCE_LEDGER_MANAGE: 'finance:ledger:manage',
  FINANCE_LEDGER_VOID: 'finance:ledger:void',
  FINANCE_LEDGER_EXPORT: 'finance:ledger:export',
  FINANCE_REVENUE_MANAGE: 'finance:revenue:manage',

  // ─── Finance — Reconciliation & Period Close (Phase 4E) ──────────────────
  FINANCE_RECONCILIATION_READ: 'finance:reconciliation:read',
  FINANCE_RECONCILIATION_MANAGE: 'finance:reconciliation:manage',
  FINANCE_CLOSE_READ: 'finance:close:read',
  FINANCE_CLOSE_MANAGE: 'finance:close:manage',
  FINANCE_YEAR_END_MANAGE: 'finance:year_end:manage',

  // ─── Finance — Payroll & Tax (Phase 4F) ──────────────────────────────────
  FINANCE_PAYROLL_READ: 'finance:payroll:read',
  FINANCE_PAYROLL_MANAGE: 'finance:payroll:manage',
  FINANCE_PAYROLL_POST: 'finance:payroll:post',
  FINANCE_TAX_READ: 'finance:tax:read',
  FINANCE_TAX_MANAGE: 'finance:tax:manage',
  FINANCE_AGI_READ: 'finance:agi:read',
  FINANCE_AGI_MANAGE: 'finance:agi:manage',

  // ─── Finance — Fixed Assets & Accruals (Phase 4G) ────────────────────────
  FINANCE_ASSETS_READ: 'finance:assets:read',
  FINANCE_ASSETS_MANAGE: 'finance:assets:manage',
  FINANCE_ASSETS_DEPRECIATE: 'finance:assets:depreciate',
  FINANCE_ACCRUALS_READ: 'finance:accruals:read',
  FINANCE_ACCRUALS_MANAGE: 'finance:accruals:manage',
  FINANCE_INTEGRITY_READ: 'finance:integrity:read',
  FINANCE_INTEGRITY_MANAGE: 'finance:integrity:manage',

  // ─── Finance — Ledger Replay & Governance (Phase 4H) ─────────────────────
  FINANCE_REPLAY_READ: 'finance:replay:read',
  FINANCE_REPLAY_MANAGE: 'finance:replay:manage',
  FINANCE_GOVERNANCE_MANAGE: 'finance:governance:manage',

  // ─── Notifications ─────────────────────────────────────────────────────────
  NOTIFICATIONS_READ:                 'notifications:read',
  NOTIFICATIONS_WRITE:                'notifications:write',
  NOTIFICATIONS_PREFERENCES_MANAGE:   'notifications:preferences:manage',

  // ─── Scheduling — Generation & Operations (Phases 2C–2E) ─────────────────
  SCHEDULING_GENERATION_READ: 'scheduling:generation:read',
  SCHEDULING_GENERATION_RUN: 'scheduling:generation:run',
  SCHEDULING_CONFIG_READ: 'scheduling:config:read',
  SCHEDULING_CONFIG_WRITE: 'scheduling:config:write',
  SCHEDULING_HEALTH_READ: 'scheduling:health:read',
  SCHEDULING_MAINTENANCE_READ: 'scheduling:maintenance:read',
  SCHEDULING_AVAILABILITY_READ: 'scheduling:availability:read',
  SCHEDULING_AVAILABILITY_UPDATE: 'scheduling:availability:update',
  SCHEDULING_BOOKING_EXPORT: 'scheduling:booking:export',
} as const;

export type Permission = typeof Permissions[keyof typeof Permissions];
