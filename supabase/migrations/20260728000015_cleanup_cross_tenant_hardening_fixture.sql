-- Removes the temporary cross-tenant isolation test fixture
-- (20260728000014). The hardening test it supported is complete: every
-- cross-tenant access attempt from a different organization's session
-- (direct table read/update, edge function read, org-level read) correctly
-- returned zero rows / 404, confirming RLS tenant isolation holds.

DELETE FROM public.students WHERE id = '66666666-7777-8888-9999-000000000000';
DELETE FROM public.organizations WHERE id = '11111111-2222-3333-4444-555555555555';
