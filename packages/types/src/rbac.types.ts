import type { UUID, Timestamp } from './common.types.js';

// ─── System Roles ────────────────────────────────────────────────────────────

export type PlatformRole = 'platform_superadmin' | 'platform_support' | 'platform_billing';

export type OrganizationRole =
  | 'org_owner'
  | 'org_admin'
  | 'org_manager'
  | 'instructor'
  | 'instructor_senior'
  | 'receptionist'
  | 'finance_admin'
  | 'student_admin'
  | 'reporting_viewer'
  | 'corporate_contact';

export type StudentRole = 'student' | 'student_guardian';

export type SystemRole = PlatformRole | OrganizationRole | StudentRole;

// ─── Permission Structure ────────────────────────────────────────────────────

export type PermissionDomain =
  | 'students'
  | 'instructors'
  | 'scheduling'
  | 'finance'
  | 'documents'
  | 'communications'
  | 'reporting'
  | 'administration'
  | 'corporate';

export type PermissionAction =
  | 'create' | 'read' | 'update' | 'delete'
  | 'export' | 'import'
  | 'approve' | 'void'
  | 'assign' | 'advance' | 'archive'
  | 'run'
  | 'manage'
  | 'configure'
  | 'send';

export type PermissionCode = `${PermissionDomain}:${string}:${PermissionAction}`;

// ─── Database Entities ────────────────────────────────────────────────────────

export interface Role {
  id: UUID;
  organization_id: UUID | null;
  name: SystemRole;
  display_name: string;
  description: string | null;
  is_system_role: boolean;
  is_custom: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Permission {
  id: UUID;
  code: PermissionCode;
  domain: PermissionDomain;
  resource: string;
  action: PermissionAction;
  description: string | null;
  is_active: boolean;
}

export interface UserRoleAssignment {
  id: UUID;
  user_id: UUID;
  organization_id: UUID;
  location_id: UUID | null;
  role_id: UUID;
  assigned_by: UUID;
  assigned_at: Timestamp;
  expires_at: Timestamp | null;
  is_active: boolean;
}

// ─── Permission Check Utilities ───────────────────────────────────────────────

export interface PermissionCheck {
  permission: PermissionCode | PermissionCode[];
  requireAll?: boolean; // default: true (AND logic); false = OR logic
}
