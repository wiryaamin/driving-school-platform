-- Temporary fixture for cross-tenant isolation hardening testing.
-- Creates a second, wholly separate organization + one student in it, so a
-- live cross-tenant access attempt has a real, known target ID to test
-- against — not a hypothetical. Removed by a follow-up migration once the
-- test is complete.

INSERT INTO public.organizations (id, name, legal_name, slug, status, subscription_tier, subscription_status)
VALUES ('11111111-2222-3333-4444-555555555555', 'CROSS-TENANT-TEST-ORG (temporary)', 'CROSS-TENANT-TEST-ORG (temporary)', 'cross-tenant-test-org', 'active', 'professional', 'active');

INSERT INTO public.students (id, organization_id, first_name, last_name, email, status, target_licence_category)
VALUES ('66666666-7777-8888-9999-000000000000', '11111111-2222-3333-4444-555555555555', 'CrossTenant', 'Victim', 'cross-tenant-victim@example.com', 'active', 'B');
