-- Corrects an error in 20260815170000: its grant statements only revoked
-- EXECUTE from `anon` specifically, not from `PUBLIC`. Every function still
-- carried its original implicit PUBLIC grant (never revoked before this
-- wave), so `anon` — and everyone else — continued to inherit EXECUTE
-- through that broader PUBLIC grant regardless of the anon-specific
-- revoke. Confirmed live immediately after applying 20260815170000:
-- anon still showed EXECUTE=true on all six functions.
--
-- This is the same REVOKE FROM PUBLIC, anon + GRANT TO authenticated,
-- service_role pattern already used correctly for soft_delete in Wave 1
-- (20260815150000) — that migration is the correct reference; this one
-- was written inconsistently with it. No function body changes here, only
-- the grant correction.

REVOKE EXECUTE ON FUNCTION public.post_invoice_journal_entry(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_invoice_journal_entry(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.post_payment_journal_entry(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_payment_journal_entry(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.post_refund_journal_entry(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_refund_journal_entry(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.post_void_journal_entry(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_void_journal_entry(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reverse_journal_entry(uuid, date, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_journal_entry(uuid, date, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.correct_journal_entry(uuid, jsonb, text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_journal_entry(uuid, jsonb, text, date, uuid) TO authenticated, service_role;
