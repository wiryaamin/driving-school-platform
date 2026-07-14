-- ═══════════════════════════════════════════════════════════════════════════
-- Identity & Security Architecture — Phase 1: Identity & Security Event Store
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Implements ADR-007 (Enterprise Architecture Handbook) / P-027.
--
-- identity_security_events is Identity History, never Identity State (ADR-007,
-- "Identity History Never Owns Identity State"). It records that an
-- identity-related event occurred; it must never be queried to determine what
-- currently exists — current identity state always comes from auth.users,
-- profiles, auth_identity_links, memberships, and membership_roles.
--
-- This migration is deliberately inert: no application code writes to this
-- table yet (Phase 2 wires the first writer). The table, indexes, and RLS
-- exist and are queryable before anything depends on them, per the frozen
-- Identity & Security Implementation Blueprint's Phase 1 exit criterion.
--
-- Retention is governed by docs/IDENTITY_RETENTION_STRATEGY.md, independently
-- of audit_logs' retention — this table's event volume and sensitivity
-- profile differ materially from the finance/business-data audit trail.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.identity_security_events (
  id               uuid          NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid,         -- Denormalized, no FK (see below) — events must outlive organizations, mirroring audit_logs.
  user_id          uuid,         -- Nullable: e.g. a failed login where the email doesn't resolve to a known user.
  event_type       text          NOT NULL,  -- domain.verb, e.g. 'login.success', 'login.failed', 'bankid.link_created'.
  provider         text          NOT NULL,  -- 'password' | 'bankid' | 'entra_id' | 'google_workspace' | 'saml'.
  severity         text          NOT NULL DEFAULT 'info',  -- 'info' | 'warning' | 'critical'.
  actor_email      text,         -- Captured even when user_id can't resolve (e.g. failed login attempts).
  ip_address       inet,
  user_agent       text,
  correlation_id   uuid,         -- Same GUC-capture pattern as audit_trigger_fn() — request.headers 'x-correlation-id'.
  metadata         jsonb         NOT NULL DEFAULT '{}',  -- Provider-specific detail (e.g. BankID order reference, failure reason).
  occurred_at      timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT identity_security_events_pkey PRIMARY KEY (id),
  CONSTRAINT identity_security_events_user_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT identity_security_events_type_format CHECK (event_type ~ '^[a-z_]+\.[a-z_]+$'),
  CONSTRAINT identity_security_events_provider_check CHECK (
    provider IN ('password', 'bankid', 'entra_id', 'google_workspace', 'saml')
  ),
  CONSTRAINT identity_security_events_severity_check CHECK (
    severity IN ('info', 'warning', 'critical')
  )
  -- Intentionally no FK on organization_id: identity history must outlive
  -- organizations, exactly the same reasoning as audit_logs.organization_id.
);

COMMENT ON TABLE  public.identity_security_events IS
  'Immutable Identity History (ADR-007). Records that an identity-related '
  'event occurred — login, logout, identity linking, BankID authentication, '
  'etc. Never the authoritative source of current identity state; that is '
  'owned by auth.users, profiles, auth_identity_links, memberships, and '
  'membership_roles. Never UPDATE or DELETE outside the scheduled retention '
  'job described in docs/IDENTITY_RETENTION_STRATEGY.md.';
COMMENT ON COLUMN public.identity_security_events.organization_id IS
  'Denormalized (no FK) for archival safety — survives org deletion, mirroring audit_logs.organization_id.';
COMMENT ON COLUMN public.identity_security_events.user_id IS
  'Nullable and ON DELETE SET NULL — a failed-login or pre-resolution event may have no resolvable user; '
  'the row survives account deletion for retained event types (see docs/IDENTITY_RETENTION_STRATEGY.md).';
COMMENT ON COLUMN public.identity_security_events.event_type IS
  'domain.verb format, matching event_outbox.event_type''s existing convention. '
  'Examples: login.success, login.failed, logout, session.expired, session.revoked, '
  'password_reset.requested, password_reset.completed, invitation.accepted, '
  'account.locked, account.unlocked, account.disabled, mfa.enabled, mfa.challenge, '
  'bankid.auth_started, bankid.auth_success, bankid.auth_failed, bankid.auth_cancelled, '
  'identity.linked, identity.unlinked, identity.verified.';
COMMENT ON COLUMN public.identity_security_events.provider IS
  'Which authentication/identity provider the event relates to. New providers extend this '
  'CHECK constraint only — never a parallel table or provider-specific event log (P-027).';

-- ─── Indexes ────────────────────────────────────────────────────────────────
-- Deliberately shaped for time-range/reporting queries, distinct from
-- audit_logs' trigger-hot-path indexes — this table's access pattern is
-- "show me this org's/user's recent identity activity," not "find the row
-- just written by this trigger invocation."

CREATE INDEX identity_security_events_org_occurred_idx
  ON public.identity_security_events (organization_id, occurred_at DESC);

CREATE INDEX identity_security_events_user_type_idx
  ON public.identity_security_events (user_id, event_type);

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Mirrors audit_logs' RLS shape exactly (Handbook ADR-007 Database Changes:
-- "reuse the same policy pattern, not a new one"): one SELECT policy, no
-- INSERT/UPDATE/DELETE policy for any client role. RLS's default-deny means
-- writes are only possible through a SECURITY DEFINER path or the service
-- role — i.e. the Phase 2 recordIdentityEvent() writer, not any client.

ALTER TABLE public.identity_security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "identity_security_events_select_own_org"
  ON public.identity_security_events FOR SELECT
  USING (
    (
      organization_id = public.auth_organization_id()
      AND public.has_permission('administration:identity_event:read')
    )
    OR public.is_platform_admin()
  );

-- ─── Permission catalog ─────────────────────────────────────────────────────
-- New, dedicated permission — deliberately not reusing administration:audit:read,
-- since ADR-007 establishes Identity & Security Events as a domain independent
-- of Audit Logs; blurring the two at the RBAC layer would undo that separation.

INSERT INTO public.permissions (id, code, domain, resource, action, description)
VALUES (
  gen_random_uuid(), 'administration:identity_event:read', 'administration', 'identity_event', 'read',
  'View identity and security event history (logins, identity linking, BankID authentication)'
);

-- org_owner and org_admin already receive "all permissions" via the
-- unconditional CROSS JOIN grants in enterprise_foundation.sql, but that
-- INSERT ran once, at that migration's apply time — permissions added since
-- must be granted explicitly, exactly as finance_admin's administration:audit:read
-- grant already demonstrates for this same pattern.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('org_owner', 'org_admin') AND r.is_system_role = true
  AND p.code = 'administration:identity_event:read';
